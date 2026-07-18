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

function renderGroups(totalCount, groups) {
    const status = document.getElementById("status");
    status.textContent = `${totalCount} open tab${totalCount === 1 ? "" : "s"} across ${Object.keys(groups).length} groups.`;

    const container = document.getElementById("groups");
    container.innerHTML = ""; // clear in case init() ever runs twice

    // Object.entries turns { Coding: [...], Shopping: [...] } into
    // [["Coding", [...]], ["Shopping", [...]]] so we can loop over it.
    for (const [category, tabs] of Object.entries(groups)) {
        const section = document.createElement("div");
        section.className = "group";

        const heading = document.createElement("h2");
        heading.textContent = `${category} (${tabs.length})`;
        section.appendChild(heading);

        const list = document.createElement("ul");
        for (const tab of tabs) {
            const item = document.createElement("li");
            item.textContent = tab.title || tab.url;

            // Clicking a tab in the list switches to it — makes the popup useful,
            // not just informational.
            item.addEventListener("click", () => {
                chrome.tabs.update(tab.id, { active: true });
                chrome.windows.update(tab.windowId, { focused: true });
            });

            list.appendChild(item);
        }
        section.appendChild(list);

        container.appendChild(section);
    }
}

init();