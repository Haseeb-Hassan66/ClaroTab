// Handles saving, listing, restoring, and deleting tab sessions.
// A "session" is just a named snapshot of tab URLs/titles at a point in time,
// stored in chrome.storage.local so it survives closing the browser entirely.

import { getRestoreMode, RESTORE_MODES } from "../settings/preferences.js";

const SESSIONS_KEY = "clarotab_sessions";
export const MAX_SESSIONS = 50;
export const MAX_TABS_PER_SESSION = 500;

async function loadSessions() {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    const list = result[SESSIONS_KEY];
    return Array.isArray(list) ? list : [];
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

function isSafeUrl(url) {
    if (typeof url !== "string") return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
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
        // strip favIconUrl (often massive base64 data-URLs) to prevent quota overflow,
        // and filter out non-web URLs (javascript:, chrome://, etc.).
        tabs: (tabs || [])
            .filter((tab) => isSafeUrl(tab.url))
            .slice(0, MAX_TABS_PER_SESSION)
            .map((tab) => ({
                url: tab.url,
                title: tab.title || tab.url || "Untitled Tab",
            })),
    };

    sessions.push(session);

    // Evict oldest sessions if count exceeds MAX_SESSIONS
    if (sessions.length > MAX_SESSIONS) {
        sessions.sort((a, b) => b.createdAt - a.createdAt);
        sessions.length = MAX_SESSIONS;
    }

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
    const urls = (session.tabs || []).map((tab) => tab.url).filter(isSafeUrl);
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