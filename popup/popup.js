// This file runs whenever the user clicks the extension icon and popup.html opens.

import { getAllTabs } from "../src/tabs/query.js";
import { groupTabsByCategory, categorizeTab } from "../src/categorize/rules.js";
import { countClosableDuplicates, closeDuplicateTabs } from "../src/tabs/duplicates.js";
import { normalizeUrl } from "../src/tabs/duplicates.js";
import { categorizeTabsWithGemini } from "../src/categorize/gemini.js";
import { getCachedCategory, setCachedCategories } from "../src/categorize/cache.js";
import { getApiKey } from "../src/settings/apiKey.js";
import { getSessions, saveSession, deleteSession, restoreSession } from "../src/sessions/storage.js";
import { getCategoryIcon, UI_ICONS } from "../src/categorize/icons.js";

// Kept up to date every time init() runs, so the "Save session" button
// always has the current tab list without needing to re-query.
let currentTabs = [];

async function init() {
    const brandMark = document.querySelector(".brand-mark");
    brandMark.classList.add("loading");

    try {
        const tabs = await getAllTabs();
        currentTabs = tabs;
        const groups = groupTabsByCategory(tabs);

        console.log("Tabs found:", tabs);
        console.log("Grouped (rules only):", groups);

        // Render immediately with rule-based results -- the popup should never
        // feel like it's waiting on the network for its first paint.
        renderGroups(tabs.length, groups);
        renderDuplicateAction(tabs);

        // AI refinement is a bonus layer -- if it throws for any reason we
        // haven't already anticipated, it must never take down the whole popup.
        try {
            await refineWithAI(tabs, groups);
        } catch (err) {
            console.warn("ClaroTab: AI refinement step failed unexpectedly:", err);
        }
    } catch (err) {
        console.error("ClaroTab: failed to load tabs:", err);
        renderErrorState();
    } finally {
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

// Looks at tabs the rule engine couldn't confidently place ("Other"),
// checks the cache first, and only calls Gemini for the ones still unknown.
// Re-renders the popup once refined results are in.
async function refineWithAI(tabs, groups) {
    const otherTabs = groups["Other"] || [];
    if (otherTabs.length === 0) {
        return; // nothing ambiguous -- rules handled everything
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
        console.log("ClaroTab: no Gemini API key configured -- skipping AI refinement.");
        showAiHint(otherTabs.length);
        return;
    }

    showRefiningIndicator();

    const overrides = {}; // tab.id -> category
    const uncachedTabs = [];

    for (const tab of otherTabs) {
        const cached = await getCachedCategory(normalizeUrl(tab.url));
        if (cached) {
            overrides[tab.id] = cached;
        } else {
            uncachedTabs.push(tab);
        }
    }

    if (uncachedTabs.length > 0) {
        const aiResults = await categorizeTabsWithGemini(uncachedTabs, apiKey);
        const newCacheEntries = {};

        for (const tab of uncachedTabs) {
            const category = aiResults[tab.id];
            if (category) {
                overrides[tab.id] = category;
                newCacheEntries[normalizeUrl(tab.url)] = category;
            }
        }

        if (Object.keys(newCacheEntries).length > 0) {
            await setCachedCategories(newCacheEntries);
        }
    }

    if (Object.keys(overrides).length === 0) {
        // Nothing new to apply (cache had nothing, API failed, or found nothing
        // confident) -- still re-render to clear the "Refining..." status text.
        renderGroups(tabs.length, groups);
        return;
    }

    const refinedGroups = applyOverrides(tabs, overrides);
    console.log("Grouped (refined with AI):", refinedGroups);
    renderGroups(tabs.length, refinedGroups);
    renderDuplicateAction(tabs);
}

// Rebuilds the full grouping, using an AI-assigned category where we have
// one, falling back to the normal rule engine otherwise.
function applyOverrides(tabs, overrides) {
    const groups = {};
    for (const tab of tabs) {
        const category = overrides[tab.id] || categorizeTab(tab);
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(tab);
    }
    return groups;
}

function showRefiningIndicator() {
    const status = document.getElementById("status");
    status.textContent += " · Refining with AI…";
}

// Gently surfaces that AI categorization exists and would help right now --
// only shown when it's actually relevant (there are uncategorized tabs),
// so it never nags when everything's already sorted by the rules.
function showAiHint(otherTabCount) {
    const status = document.getElementById("status");
    status.textContent += ` · Enable AI in Settings for ${otherTabCount} more`;
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

    const badge = document.createElement("span");
    badge.className = "cat-badge";
    badge.style.background = `var(--cat-${slug}, var(--cat-other))`;
    badge.innerHTML = getCategoryIcon(category);

    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = category;

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = tabs.length;

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.innerHTML = UI_ICONS.chevron;

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

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.src = tab.favIconUrl || "";
    favicon.addEventListener("error", () => {
        favicon.style.background = "var(--border)";
        favicon.removeAttribute("src");
    });

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
        if (e.key === "Enter") activate();
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
        await closeDuplicateTabs(tabs);
        await init();
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

    button.addEventListener("click", async () => {
        if (currentTabs.length === 0) return;

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