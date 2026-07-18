// Caches Gemini's categorization results in chrome.storage.local, keyed by
// normalized URL. This means: open the same site twice (even in different
// tabs, even tomorrow) and we reuse the cached answer instead of burning
// another API call -- important for staying inside the free tier's daily quota.

const CACHE_KEY = "gemini_category_cache";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days -- categories rarely change that fast

async function loadCache() {
    const result = await chrome.storage.local.get(CACHE_KEY);
    return result[CACHE_KEY] || {};
}

async function saveCache(cache) {
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

/**
 * @param {string} normalizedUrl
 * @returns {Promise<string|null>} cached category, or null if missing/expired
 */
export async function getCachedCategory(normalizedUrl) {
    const cache = await loadCache();
    const entry = cache[normalizedUrl];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > TTL_MS) return null;
    return entry.category;
}

/**
 * Stores multiple { url: category } results in one write.
 * @param {Record<string, string>} entries
 */
export async function setCachedCategories(entries) {
    const cache = await loadCache();
    const now = Date.now();
    for (const [url, category] of Object.entries(entries)) {
        cache[url] = { category, timestamp: now };
    }
    await saveCache(cache);
}