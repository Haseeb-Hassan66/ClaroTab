// Handles reading the user's open tabs from the browser.
// Kept separate from popup.js so the "get data" logic stays independent
// of the "display data" logic — we'll reuse this in background.js later too.

/**
 * Fetches all tabs in the current window.
 * @returns {Promise<chrome.tabs.Tab[]>} Array of tab objects.
 */
export async function getAllTabs() {
    // chrome.tabs.query() is async and returns a Promise in Manifest V3.
    // { currentWindow: true } means "only tabs in the window the popup was opened from" —
    // not every window the user has open. We'll revisit this later if we add multi-window support.
    //
    // windowType: 'normal' excludes DevTools panels, extension popups, and app windows
    // whose internal URLs (devtools://, chrome-extension://) would break categorization.
    const tabs = await chrome.tabs.query({ currentWindow: true, windowType: 'normal' });

    // Secondary guard: strip any tabs with non-navigable URLs that slipped through.
    return tabs.filter(tab => {
        try {
            const { protocol } = new URL(tab.url ?? '');
            return protocol === 'http:' || protocol === 'https:';
        } catch {
            return false;
        }
    });
}