// This is the service worker. It runs in the background, separate from any tab or popup.
// Chrome starts it up when something relevant happens (extension installed, tab events, etc.)
// and shuts it down when it's idle to save resources.

// Storage keys — must stay in sync with the matching constants in preferences.js / modelUsage.js.
// Duplicated here intentionally: background.js can't import ES modules at the top level in MV3
// without making it a module-type service worker, which has separate trade-offs.
const RESTORE_MODE_KEY = "clarotab_restore_mode";

// Defaults applied exactly once on first install.
// Using chrome.storage.local.get before setting ensures we never overwrite
// a value the user has already saved (e.g. from a previous dev-mode install).
const FIRST_RUN_DEFAULTS = {
    [RESTORE_MODE_KEY]: "new-window", // matches RESTORE_MODES.NEW_WINDOW in preferences.js
};

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        // Only set keys that aren't already present in storage.
        const existing = await chrome.storage.local.get(Object.keys(FIRST_RUN_DEFAULTS));
        const missing = {};
        for (const [key, defaultValue] of Object.entries(FIRST_RUN_DEFAULTS)) {
            if (!(key in existing)) {
                missing[key] = defaultValue;
            }
        }
        if (Object.keys(missing).length > 0) {
            await chrome.storage.local.set(missing);
        }
        console.log("ClaroTab: first-run defaults written.", missing);
    } else {
        // "update" or "chrome_update" — don't touch user settings.
        console.log(`ClaroTab: service worker updated (reason: ${details.reason}).`);
    }
});
