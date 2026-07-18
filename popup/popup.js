// This file runs whenever the user clicks the extension icon and popup.html opens.

import { getAllTabs } from "../src/tabs/query.js";
import { groupTabsByCategory } from "../src/categorize/rules.js";

async function init() {
    const tabs = await getAllTabs();
    const groups = groupTabsByCategory(tabs);

    console.log("Tabs found:", tabs);
    console.log("Grouped:", groups);

    renderGroups(tabs.length, groups);
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
    group.className = "group";

    // --- Header row: dot, name, count, chevron. Clicking it toggles collapse. ---
    const header = document.createElement("div");
    header.className = "group-header";
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", "true");

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

    // --- Tab list ---
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
    // Fall back to a blank swatch if the tab has no favicon or it fails to load,
    // rather than showing a broken image icon.
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

init();