// Detects and closes duplicate tabs -- tabs pointing at the same page,
// even if the URL differs trivially (trailing slash, #fragment).

/**
 * Normalizes a URL for duplicate comparison: strips the fragment (#...)
 * and any trailing slash. Query params are kept, since they're often
 * meaningful (different video, different search, etc.) rather than noise.
 * @param {string} url
 * @returns {string} normalized URL, or the original string if it doesn't parse
 */
export function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }
        return parsed.toString();
    } catch {
        return url;
    }
}

/**
 * Finds groups of duplicate tabs (2 or more tabs sharing a normalized URL).
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {{ url: string, tabs: chrome.tabs.Tab[] }[]} only groups with duplicates
 */
export function findDuplicateGroups(tabs) {
    const byUrl = new Map();

    for (const tab of tabs) {
        if (!tab.url) continue;
        const key = normalizeUrl(tab.url);
        if (!byUrl.has(key)) {
            byUrl.set(key, []);
        }
        byUrl.get(key).push(tab);
    }

    const duplicateGroups = [];
    for (const [url, groupTabs] of byUrl.entries()) {
        if (groupTabs.length > 1) {
            duplicateGroups.push({ url, tabs: groupTabs });
        }
    }

    return duplicateGroups;
}

/**
 * Counts how many tabs would be closed if duplicates were removed
 * (every tab in a group except one "keeper" per group).
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {number}
 */
export function countClosableDuplicates(tabs) {
    const groups = findDuplicateGroups(tabs);
    return groups.reduce((sum, group) => sum + (group.tabs.length - 1), 0);
}

/**
 * Closes duplicate tabs, keeping one tab per duplicate group.
 * Prefers to keep the active tab (if it's part of the group) or the
 * pinned tab, so we don't yank the tab the user is currently looking at.
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {Promise<number>} number of tabs actually closed
 */
export async function closeDuplicateTabs(tabs) {
    const groups = findDuplicateGroups(tabs);
    const idsToClose = [];

    for (const group of groups) {
        const keeper =
            group.tabs.find((t) => t.active) ||
            group.tabs.find((t) => t.pinned) ||
            group.tabs[0];

        for (const tab of group.tabs) {
            if (tab.id !== keeper.id) {
                idsToClose.push(tab.id);
            }
        }
    }

    if (idsToClose.length > 0) {
        await chrome.tabs.remove(idsToClose);
    }

    return idsToClose.length;
}