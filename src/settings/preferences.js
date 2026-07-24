// Stores small user preferences that don't warrant their own dedicated
// module. Currently just the session-restore mode, but a natural home for
// future simple on/off or multiple-choice settings too.

const RESTORE_MODE_KEY = "clarotab_restore_mode";

export const RESTORE_MODES = {
    NEW_WINDOW: "new-window",
    CURRENT_WINDOW: "current-window",
};

/**
 * @returns {Promise<string>} one of RESTORE_MODES, defaulting to NEW_WINDOW
 *   (keeps a restored session visually separate from whatever you're
 *   currently doing, which is the safer default for most people).
 */
export async function getRestoreMode() {
    const result = await chrome.storage.local.get(RESTORE_MODE_KEY);
    return result[RESTORE_MODE_KEY] || RESTORE_MODES.NEW_WINDOW;
}

/**
 * @param {string} mode - one of RESTORE_MODES
 */
export async function setRestoreMode(mode) {
    await chrome.storage.local.set({ [RESTORE_MODE_KEY]: mode });
}