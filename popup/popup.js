// This file runs whenever the user clicks the extension icon and popup.html opens.

import { getAllTabs } from "../src/tabs/query.js";
import { categorizeTab } from "../src/categorize/rules.js";
import { countClosableDuplicates, closeDuplicateTabs, normalizeUrl } from "../src/tabs/duplicates.js";
import { categorizeTabsWithGemini } from "../src/categorize/gemini.js";
import { getCachedCategoriesMap, setCachedCategories } from "../src/categorize/cache.js";
import { getApiKey } from "../src/settings/apiKey.js";
import { getSessions, saveSession, deleteSession, restoreSession } from "../src/sessions/storage.js";
import { getCategoryIcon, UI_ICONS } from "../src/categorize/icons.js";

// Kept up to date every time init() runs, so the "Save session" button
// always has the current tab list without needing to re-query.
let currentTabs = [];

async function init() {
    const brandMark = document.querySelector(".brand-mark");
    brandMark.classList.add("loading");

    // Real work here often finishes in just a few milliseconds (especially
    // once AI results are cached), which is faster than the pulse animation
    // can paint even a single visible frame. This guarantees the pulse is
    // shown for at least half a second, so it's an indicator people can
    // actually perceive rather than invisible most of the time.
    const minPulseDuration = new Promise((resolve) => setTimeout(resolve, 500));

    try {
        const tabs = await getAllTabs();
        currentTabs = tabs;

        // Resolve every tab's category up front, combining rules AND the AI
        // cache in one pass -- this is what prevents previously-AI-classified
        // tabs from flashing as "Other" before being corrected a moment later.
        const { categoryByTabId, unresolvedTabs } = await resolveCategories(tabs);
        const groups = buildGroupsFromCategoryMap(tabs, categoryByTabId);

        console.log("Tabs found:", tabs);
        console.log("Grouped (rules + cache):", groups);
        console.log(`${unresolvedTabs.length} tab(s) genuinely need AI classification`);

        renderGroups(tabs.length, groups);
        renderDuplicateAction(tabs);

        // AI refinement is a bonus layer -- if it throws for any reason we
        // haven't already anticipated, it must never take down the whole popup.
        try {
            await refineWithAI(tabs, unresolvedTabs, categoryByTabId);
        } catch (err) {
            console.warn("ClaroTab: AI refinement step failed unexpectedly:", err);
        }
    } catch (err) {
        console.error("ClaroTab: failed to load tabs:", err);
        renderErrorState();
    } finally {
        await minPulseDuration;
        brandMark.classList.remove("loading");
    }
}

function renderErrorState() {
    const status = document.getElementById("status");
    const container = document.getElementById("groups");
    status.textContent = "Something went wrong.";
    container.innerHTML = "";
    container.appendChild(
        buildEmptyState(UI_ICONS.alert, "Couldn't load your tabs. Try closing and reopening the popup.")
    );
}

// Shared builder for every "nothing to show" state, so they all look consistent.
function buildEmptyState(iconSvg, message) {
    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";

    const icon = document.createElement("div");
    icon.innerHTML = iconSvg;

    const text = document.createElement("p");
    text.style.margin = "0";
    text.textContent = message;

    wrapper.append(icon, text);
    return wrapper;
}

// Determines the final category for every tab in ONE pass, layering:
// 1. Rule engine (instant, no network)
// 2. AI cache (for tabs the rules couldn't place, but Gemini already has)
// Only tabs that fail BOTH end up in `unresolvedTabs` -- these are the
// only ones that will ever be sent to the API, guaranteeing we never
// re-classify (and re-spend tokens on) a tab we already have an answer for.
async function resolveCategories(tabs) {
    const cachedCategories = await getCachedCategoriesMap(); // { normalizedUrl: category }

    const categoryByTabId = {};
    const unresolvedTabs = [];

    for (const tab of tabs) {
        const ruleCategory = categorizeTab(tab);

        if (ruleCategory !== "Other") {
            categoryByTabId[tab.id] = ruleCategory;
            continue;
        }

        const cached = cachedCategories[normalizeUrl(tab.url)];
        if (cached) {
            categoryByTabId[tab.id] = cached;
        } else {
            categoryByTabId[tab.id] = "Other";
            unresolvedTabs.push(tab);
        }
    }

    return { categoryByTabId, unresolvedTabs };
}

function buildGroupsFromCategoryMap(tabs, categoryByTabId) {
    const groups = {};
    for (const tab of tabs) {
        const category = categoryByTabId[tab.id];
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(tab);
    }
    return groups;
}

// Sends only genuinely unresolved tabs to Gemini (never ones the rules or
// cache already handled), caches any new results, and re-renders using the
// FULL updated category map -- not a fresh rules-only pass -- so tabs that
// were already resolved (by rules or cache) can never regress back to
// "Other" on this second render.
async function refineWithAI(tabs, unresolvedTabs, categoryByTabId) {
    if (unresolvedTabs.length === 0) {
        hideAiBanner(); // everything was already resolved by rules/cache -- no AI work needed at all
        return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
        showAiBanner("info", `Enable AI in Settings to categorize ${unresolvedTabs.length} more tab${unresolvedTabs.length === 1 ? "" : "s"}.`, {
            actionLabel: "Open Settings",
            onAction: () => chrome.runtime.openOptionsPage(),
        });
        return;
    }

    showAiBanner("info", `Refining ${unresolvedTabs.length} tab${unresolvedTabs.length === 1 ? "" : "s"} with AI…`);

    const { categories: aiResults, error } = await categorizeTabsWithGemini(unresolvedTabs, apiKey);

    const updatedCategories = { ...categoryByTabId };
    const newCacheEntries = {};
    let anyChanged = false;

    // Only treat a missing entry as a real "no good category" answer when the
    // call actually succeeded. On failure (rate limit, network, bad key), we
    // deliberately leave these tabs unresolved so they get retried next time,
    // rather than permanently caching them as "Other" based on no real answer.
    if (!error) {
        for (const tab of unresolvedTabs) {
            // Gemini omits a tab from its response when it can't confidently
            // classify it -- that omission IS a real, cacheable answer ("Other"),
            // not a failure. Without this, a genuinely uncategorizable tab would
            // get re-sent to the API on every single popup open, forever.
            const category = aiResults[tab.id] || "Other";
            updatedCategories[tab.id] = category;
            newCacheEntries[normalizeUrl(tab.url)] = category;
            if (category !== "Other") {
                anyChanged = true; // only a real category change needs a re-render
            }
        }
    }

    if (Object.keys(newCacheEntries).length > 0) {
        await setCachedCategories(newCacheEntries);
    }

    // Surface a specific, actionable message instead of failing silently.
    if (error) {
        const variant = error.type === "auth" ? "error" : "warning";
        const options =
            error.type === "auth"
                ? { actionLabel: "Open Settings", onAction: () => chrome.runtime.openOptionsPage() }
                : {};
        showAiBanner(variant, error.message, options);
    } else {
        hideAiBanner();
    }

    if (!anyChanged) {
        return; // nothing new to show -- current render already stands
    }

    const refinedGroups = buildGroupsFromCategoryMap(tabs, updatedCategories);
    console.log("Grouped (refined with AI):", refinedGroups);
    renderGroups(tabs.length, refinedGroups);
    renderDuplicateAction(tabs);
}

// Shows the AI status banner. variant is "info" | "warning" | "error",
// each mapped to a distinct color so severity is visually obvious at a glance.
function showAiBanner(variant, message, { actionLabel, onAction } = {}) {
    const banner = document.getElementById("ai-banner");
    const icon = banner.querySelector(".ai-banner-icon");
    const text = document.getElementById("ai-banner-text");
    const actionBtn = document.getElementById("ai-banner-action");

    banner.className = `variant-${variant}`; // clears any previous variant class
    icon.innerHTML = variant === "info" ? UI_ICONS.info : UI_ICONS.alert;
    icon.setAttribute("aria-hidden", "true");
    text.textContent = message;

    if (actionLabel && onAction) {
        actionBtn.textContent = actionLabel;
        actionBtn.classList.remove("hidden");
        // Replace to clear any previously attached listener from an earlier render.
        const freshBtn = actionBtn.cloneNode(true);
        actionBtn.replaceWith(freshBtn);
        freshBtn.addEventListener("click", onAction);
    } else {
        actionBtn.classList.add("hidden");
    }
}

function hideAiBanner() {
    const banner = document.getElementById("ai-banner");
    banner.className = "hidden";
}

// Turns "Work & Productivity" into "work-productivity" so it can be used
// as a CSS class name matching the --cat-work-productivity variable.
function categoryToSlug(category) {
    return category
        .toLowerCase()
        .replace(/&/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function renderGroups(totalCount, groups) {
    const status = document.getElementById("status");
    const container = document.getElementById("groups");
    const toolbar = document.getElementById("groups-toolbar");
    container.innerHTML = "";

    if (totalCount === 0) {
        status.textContent = "No open tabs.";
        toolbar.classList.add("hidden");
        container.appendChild(
            buildEmptyState(UI_ICONS.inbox, "Nothing to organize yet — open a few tabs to see them grouped here.")
        );
        return;
    }

    const categoryCount = Object.keys(groups).length;
    status.textContent = `${totalCount} open tab${totalCount === 1 ? "" : "s"} · ${categoryCount} group${categoryCount === 1 ? "" : "s"}`;

    let index = 0;
    for (const [category, tabs] of Object.entries(groups)) {
        const groupEl = buildGroupElement(category, tabs);
        // Small staggered delay so groups appear one after another rather than
        // all at once -- capped so a long list doesn't feel sluggish to reveal.
        groupEl.style.animationDelay = `${Math.min(index * 30, 150)}ms`;
        container.appendChild(groupEl);
        index++;
    }

    // Only worth showing "expand/collapse all" when there's more than one
    // group -- with a single group it doesn't save any real effort.
    toolbar.classList.toggle("hidden", categoryCount <= 1);
    setupToggleAll(container);
}

// Wires the "Expand all" / "Collapse all" button. Re-bound on every render
// (via cloneNode) since the group elements it targets are rebuilt each time.
function setupToggleAll(container) {
    const button = document.getElementById("toggle-all-btn");
    const freshButton = button.cloneNode(true);
    button.replaceWith(freshButton);

    freshButton.dataset.action = "expand";
    freshButton.textContent = "Expand all";

    freshButton.addEventListener("click", () => {
        const shouldExpand = freshButton.dataset.action === "expand";
        container.querySelectorAll(".group").forEach((group) => {
            group.classList.toggle("collapsed", !shouldExpand);
            group.querySelector(".group-header").setAttribute("aria-expanded", String(shouldExpand));
        });
        freshButton.dataset.action = shouldExpand ? "collapse" : "expand";
        freshButton.textContent = shouldExpand ? "Collapse all" : "Expand all";
    });
}

function buildGroupElement(category, tabs) {
    const slug = categoryToSlug(category);

    const group = document.createElement("div");
    group.className = "group collapsed";

    const header = document.createElement("div");
    header.className = "group-header";
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", "false");
    // Explicit label rather than relying on the browser to concatenate text
    // from child elements -- more reliable across screen readers, and reads
    // more naturally than "Coding5" would.
    header.setAttribute("aria-label", `${category}, ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`);

    const badge = document.createElement("span");
    badge.className = "cat-badge";
    badge.style.background = `var(--cat-${slug}, var(--cat-other))`;
    badge.style.color = `var(--cat-${slug}-icon, white)`;
    badge.innerHTML = getCategoryIcon(category);
    badge.setAttribute("aria-hidden", "true"); // decorative -- the aria-label above already conveys the category

    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = category;

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = tabs.length;

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.innerHTML = UI_ICONS.chevron;
    chevron.setAttribute("aria-hidden", "true"); // decorative -- expand/collapse state is already conveyed via aria-expanded

    header.append(badge, title, count, chevron);

    const toggle = () => {
        const collapsed = group.classList.toggle("collapsed");
        header.setAttribute("aria-expanded", String(!collapsed));
    };
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
        }
    });

    // group-body wraps the list so we can animate its height smoothly via
    // CSS grid-template-rows, rather than instantly showing/hiding it.
    const body = document.createElement("div");
    body.className = "group-body";

    const list = document.createElement("ul");
    list.className = "tab-list";

    for (const tab of tabs) {
        list.appendChild(buildTabElement(tab));
    }

    body.appendChild(list);
    group.append(header, body);
    return group;
}

function buildTabElement(tab) {
    const item = document.createElement("li");
    item.className = "tab-item";
    item.tabIndex = 0;
    item.title = tab.url;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `Switch to tab: ${tab.title || tab.url}`);

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.alt = "";

    // Use tab.favIconUrl -- Chrome resolves and validates this URL for us,
    // so it works for the vast majority of sites without any extra work.
    //
    // The _favicon endpoint approach (chrome-extension://id/_favicon/...) was
    // tried and reverted: it silently returns blank images for all URLs in
    // this browser context without firing the error event, so the fallback
    // never ran and ALL favicons disappeared instead of just the edge cases.
    //
    // Sites that send cross-origin blocking headers will trigger the error
    // handler below and show the CSS swatch -- that's the correct graceful
    // fallback, not a bug worth breaking everything else to fix.
    if (tab.favIconUrl) {
        favicon.src = tab.favIconUrl;
        favicon.addEventListener(
            "error",
            () => {
                favicon.removeAttribute("src");
            },
            { once: true }
        );
    }
    // No favIconUrl -- leave src unset so the CSS swatch renders cleanly.

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || tab.url;

    item.append(favicon, title);

    const activate = () => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
    };
    item.addEventListener("click", activate);
    item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault(); // stop Space from scrolling the popup
            activate();
        }
    });

    return item;
}

// Shows/hides the "Close duplicates" card based on whether any exist,
// and wires up the click handler to actually close them and refresh the view.
function renderDuplicateAction(tabs) {
    const actionBar = document.getElementById("action-bar");
    const button = document.getElementById("close-duplicates-btn");

    const duplicateCount = countClosableDuplicates(tabs);

    if (duplicateCount === 0) {
        actionBar.classList.add("hidden");
        return;
    }

    actionBar.classList.remove("hidden");

    const freshButton = button.cloneNode(true);
    button.replaceWith(freshButton);

    freshButton.querySelector(".action-icon").innerHTML = UI_ICONS.duplicates;
    freshButton.querySelector(".action-text").textContent =
        `Close ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`;

    freshButton.addEventListener("click", async () => {
        freshButton.disabled = true;
        freshButton.querySelector(".action-text").textContent = "Closing…";
        try {
            await closeDuplicateTabs(tabs);
        } catch (err) {
            console.error("ClaroTab: Error closing duplicate tabs:", err);
        } finally {
            await init();
        }
    });
}

// --- Confirm modal ---
// A custom, in-popup replacement for window.confirm(). Native browser
// dialogs look and feel disconnected from the extension (different styling,
// can interrupt popup focus) -- this keeps the whole interaction inside
// ClaroTab's own UI instead.

/**
 * Shows a confirmation modal and resolves to true/false based on the choice.
 * @param {string} title
 * @param {string} message
 * @param {{ confirmLabel?: string }} [options]
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message, options = {}) {
    const overlay = document.getElementById("modal-overlay");
    const titleEl = document.getElementById("modal-title");
    const messageEl = document.getElementById("modal-message");
    const confirmBtn = document.getElementById("modal-confirm");
    const cancelBtn = document.getElementById("modal-cancel");

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = options.confirmLabel || "Confirm";

    overlay.classList.remove("hidden");
    confirmBtn.focus();

    return new Promise((resolve) => {
        const cleanup = (result) => {
            overlay.classList.add("hidden");
            confirmBtn.removeEventListener("click", onConfirm);
            cancelBtn.removeEventListener("click", onCancel);
            overlay.removeEventListener("click", onOverlayClick);
            document.removeEventListener("keydown", onKeydown);
            resolve(result);
        };

        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onOverlayClick = (e) => {
            if (e.target === overlay) cleanup(false); // clicking the dimmed backdrop cancels
        };
        const onKeydown = (e) => {
            if (e.key === "Escape") cleanup(false);
            if (e.key === "Enter") cleanup(true);
        };

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
        overlay.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeydown);
    });
}

// --- Sessions ---

// Switches between the "Tabs" and "Sessions" views using the nav buttons.
// Only one view is visible at a time; the inactive one gets the "hidden" class.
function setupNav() {
    const buttons = document.querySelectorAll(".nav-btn");
    const tabsView = document.getElementById("tabs-view");
    const sessionsView = document.getElementById("sessions-view");

    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("active"));
            button.classList.add("active");

            const view = button.dataset.view;
            tabsView.classList.toggle("hidden", view !== "tabs");
            sessionsView.classList.toggle("hidden", view !== "sessions");

            if (view === "sessions") {
                renderSessions();
            }
        });
    });
}

// Wires the "Save" button: reads the name input, saves the currently open
// tabs as a new session, clears the input, and refreshes the list.
function setupSaveSession() {
    const input = document.getElementById("session-name-input");
    const button = document.getElementById("save-session-btn");

    // Clear the error state the moment the user starts typing -- the red
    // highlight should feel like a prompt, not a permanent label.
    input.addEventListener("input", () => input.classList.remove("input-error"));

    button.addEventListener("click", async () => {
        if (currentTabs.length === 0) return;

        // If the name field is blank, shake and highlight the input so the
        // user knows a name is required, then bail out.
        if (!input.value.trim()) {
            input.classList.remove("input-error");
            // Force a reflow so removing+re-adding the class always re-triggers
            // the shake animation, even if it was already applied.
            void input.offsetWidth;
            input.classList.add("input-error");
            input.focus();
            // Clear the error class after the shake animation (0.3s).
            // The setTimeout fallback ensures it always clears even when the
            // shake animation is disabled by prefers-reduced-motion, where
            // animationend never fires.
            const clearError = () => input.classList.remove("input-error");
            input.addEventListener("animationend", clearError, { once: true });
            setTimeout(clearError, 400);
            return;
        }

        // Defensively clear any lingering error state before saving.
        input.classList.remove("input-error");

        button.disabled = true;
        button.textContent = "Saving…";
        try {
            await saveSession(input.value, currentTabs);
            input.value = "";
            await renderSessions();
        } catch (err) {
            console.error("ClaroTab: failed to save session:", err);
            button.textContent = "Failed — try again";
            button.disabled = false;
            return;
        }
        button.textContent = "Save";
        button.disabled = false;
    });

    // Also allow pressing Enter in the input field to save.
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") button.click();
    });
}

async function renderSessions() {
    const container = document.getElementById("session-list");
    container.innerHTML = "";

    let sessions;
    try {
        sessions = await getSessions();
    } catch (err) {
        console.error("ClaroTab: failed to load sessions:", err);
        container.appendChild(
            buildEmptyState(UI_ICONS.alert, "Couldn't load saved sessions. Try reopening the popup.")
        );
        return;
    }

    if (sessions.length === 0) {
        container.appendChild(
            buildEmptyState(UI_ICONS.inbox, "No saved sessions yet. Save your current tabs to restore them later.")
        );
        return;
    }

    sessions.forEach((session, index) => {
        const sessionEl = buildSessionElement(session);
        sessionEl.style.animationDelay = `${Math.min(index * 30, 150)}ms`;
        container.appendChild(sessionEl);
    });
}

function buildSessionElement(session) {
    const item = document.createElement("div");
    item.className = "session-item";

    const info = document.createElement("div");
    info.className = "session-info";

    const name = document.createElement("div");
    name.className = "session-name";
    name.textContent = session.name;

    const meta = document.createElement("div");
    meta.className = "session-meta";
    const tabCount = session.tabs.length;
    meta.textContent = `${tabCount} tab${tabCount === 1 ? "" : "s"} · ${new Date(session.createdAt).toLocaleDateString()}`;

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "session-actions";

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "session-btn";
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", async () => {
        restoreBtn.disabled = true;
        restoreBtn.textContent = "Opening…";
        try {
            await restoreSession(session);
            restoreBtn.textContent = "Restore";
        } catch (err) {
            console.error("ClaroTab: failed to restore session:", err);
            restoreBtn.textContent = "Failed — retry?";
        }
        restoreBtn.disabled = false;
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "session-btn session-btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
        const confirmed = await showConfirm(
            "Delete session?",
            `"${session.name}" will be permanently removed. This can't be undone.`,
            { confirmLabel: "Delete" }
        );
        if (!confirmed) return;

        await deleteSession(session.id);
        await renderSessions();
    });

    actions.append(restoreBtn, deleteBtn);
    item.append(info, actions);

    return item;
}

function setupSettingsButton() {
    const button = document.getElementById("settings-btn");
    button.innerHTML = UI_ICONS.settings;
    button.addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
    });
}

setupSettingsButton();
setupNav();
setupSaveSession();
init();