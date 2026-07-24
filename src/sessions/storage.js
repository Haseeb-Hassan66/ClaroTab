// Handles saving, listing, restoring, and deleting tab sessions.
// A "session" is just a named snapshot of tab URLs/titles at a point in time,
// stored in chrome.storage.local so it survives closing the browser entirely.

import { getRestoreMode, RESTORE_MODES } from "../settings/preferences.js";

const SESSIONS_KEY = "clarotab_sessions";

async function loadSessions() {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    return result[SESSIONS_KEY] || [];
}

async function saveSessionsList(sessions) {
    await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
}

/**
 * @returns {Promise<object[]>} saved sessions, newest first
 */
export async function getSessions() {
    const sessions = await loadSessions();
    return sessions.slice().sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Saves the given tabs as a new named session.
 * @param {string} name
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {Promise<object>} the created session
 */
export async function saveSession(name, tabs) {
    const sessions = await loadSessions();

    const session = {
        id: crypto.randomUUID(),
        name: name.trim() || `Session -- ${new Date().toLocaleDateString()}`,
        createdAt: Date.now(),
        // Only keep the fields we actually need to restore later --
        // no point storing the entire chrome.tabs.Tab object.
        tabs: tabs.map((tab) => ({
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
        })),
    };

    sessions.push(session);
    await saveSessionsList(sessions);
    return session;
}

/**
 * @param {string} sessionId
 */
export async function deleteSession(sessionId) {
    const sessions = await loadSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    await saveSessionsList(filtered);
}

/**
 * Reopens every tab in a session, either in a fresh window (default) or
 * appended to the current window, based on the user's Settings preference.
 * @param {object} session
 */
export async function restoreSession(session) {
    const urls = session.tabs.map((tab) => tab.url).filter(Boolean);
    if (urls.length === 0) return;

    const mode = await getRestoreMode();

    if (mode === RESTORE_MODES.CURRENT_WINDOW) {
        // Open each tab individually in the current window, in the background,
        // so the user isn't yanked away from what they were looking at by the
        // last tab created stealing focus.
        for (const url of urls) {
            await chrome.tabs.create({ url, active: false });
        }
    } else {
        await chrome.windows.create({ url: urls });
    }
}