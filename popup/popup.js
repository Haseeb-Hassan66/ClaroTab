// This file runs whenever the user clicks the extension icon and popup.html opens.

import { getAllTabs } from "../src/tabs/query.js";

async function init() {
    const tabs = await getAllTabs();

    // Log the raw data to the popup's console so you can inspect the full
    // shape of a tab object (right-click the popup -> Inspect -> Console).
    console.log("Tabs found:", tabs);

    renderTabs(tabs);
}

function renderTabs(tabs) {
    const status = document.getElementById("status");
    status.textContent = `Found ${tabs.length} open tab${tabs.length === 1 ? "" : "s"}.`;

    const list = document.createElement("ul");
    list.id = "tab-list";

    for (const tab of tabs) {
        const item = document.createElement("li");
        item.textContent = tab.title || tab.url;
        list.appendChild(item);
    }

    document.body.appendChild(list);
}

init();