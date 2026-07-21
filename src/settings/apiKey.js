// Stores the user's Gemini API key in chrome.storage.local (not .sync --
// deliberately, so the key stays strictly on this device rather than
// being uploaded to Google's sync servers tied to the user's account).

const API_KEY_STORAGE_KEY = "clarotab_gemini_api_key";

/**
 * @returns {Promise<string>} the saved API key, or "" if none is set
 */
export async function getApiKey() {
    const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
    return result[API_KEY_STORAGE_KEY] || "";
}

/**
 * @param {string} key
 */
export async function setApiKey(key) {
    await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key.trim() });
}

export async function clearApiKey() {
    await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
}