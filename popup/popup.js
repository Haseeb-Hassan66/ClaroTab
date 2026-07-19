// This file runs whenever the user clicks the extension icon and popup.html opens.

import { getAllTabs } from "../src/tabs/query.js";
import { groupTabsByCategory, categorizeTab } from "../src/categorize/rules.js";
import { countClosableDuplicates, closeDuplicateTabs } from "../src/tabs/duplicates.js";
import { normalizeUrl } from "../src/tabs/duplicates.js";
import { categorizeTabsWithGemini } from "../src/categorize/gemini.js";
import { getCachedCategory, setCachedCategories } from "../src/categorize/cache.js";
import { GEMINI_API_KEY } from "../config.js";
import { getSessions, saveSession, deleteSession, restoreSession } from "../src/sessions/storage.js";

// Kept up to date every time init() runs, so the "Save session" button
// always has the current tab list without needing to re-query.
let currentTabs = [];

async function init() {
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
    }
}

function renderErrorState() {
    const status = document.getElementById("status");
    const container = document.getElementById("groups");
    status.textContent = "Something went wrong.";
    container.innerHTML = "";

    const error = document.createElement("div");
    error.className = "empty-state";
    error.textContent = "Couldn't load your tabs. Try closing and reopening the popup.";
    container.appendChild(error);
}

// Looks at tabs the rule engine couldn't confidently place ("Other"),
// checks the cache first, and only calls Gemini for the ones still unknown.
// Re-renders the popup once refined results are in.
async function refineWithAI(tabs, groups) {
    const otherTabs = groups["Other"] || [];
    if (otherTabs.length === 0) {
        return; // nothing ambiguous -- rules handled everything
    }

    const isConfigured = GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE";
    if (!isConfigured) {
        console.log("ClaroTab: no Gemini API key configured -- skipping AI refinement.");
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
        const aiResults = await categorizeTabsWithGemini(uncachedTabs, GEMINI_API_KEY);
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
    container.innerHTML = "";

    if (totalCount === 0) {
        status.textContent = "No open tabs.";
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Nothing to organize yet — open a few tabs to see them grouped here.";
        container.appendChild(empty);
        return;
    }

    const categoryCount = Object.keys(groups).length;
    status.textContent = `${totalCount} open tab${totalCount === 1 ? "" : "s"} · ${categoryCount} group${categoryCount === 1 ? "" : "s"}`;

    for (const [category, tabs] of Object.entries(groups)) {
        container.appendChild(buildGroupElement(category, tabs));
    }
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

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = `var(--cat-${slug}, var(--cat-other))`;

    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = category;

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = tabs.length;

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "▾";

    header.append(dot, title, count, chevron);

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

    const list = document.createElement("ul");
    list.className = "tab-list";

    for (const tab of tabs) {
        list.appendChild(buildTabElement(tab));
    }

    group.append(header, list);
    return group;
}

function buildTabElement(tab) {
    const item = document.createElement("li");
    item.className = "tab-item";
    item.tabIndex = 0;

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
    item.title = tab.url;

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

// Shows/hides the "Close duplicates" button based on whether any exist,
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
    button.textContent = `Close ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`;

    const freshButton = button.cloneNode(true);
    button.replaceWith(freshButton);

    freshButton.addEventListener("click", async () => {
        freshButton.disabled = true;
        freshButton.textContent = "Closing…";
        await closeDuplicateTabs(tabs);
        await init();
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
        const error = document.createElement("div");
        error.className = "empty-state";
        error.textContent = "Couldn't load saved sessions. Try reopening the popup.";
        container.appendChild(error);
        return;
    }

    if (sessions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No saved sessions yet. Save your current tabs to restore them later.";
        container.appendChild(empty);
        return;
    }

    for (const session of sessions) {
        container.appendChild(buildSessionElement(session));
    }
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
        const confirmed = confirm(`Delete "${session.name}"? This can't be undone.`);
        if (!confirmed) return;

        await deleteSession(session.id);
        await renderSessions();
    });

    actions.append(restoreBtn, deleteBtn);
    item.append(info, actions);

    return item;
}

setupNav();
setupSaveSession();
init();