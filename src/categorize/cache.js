// Caches Gemini's categorization results in chrome.storage.local, keyed by
// normalized URL. This means: open the same site twice (even in different
// tabs, even tomorrow) and we reuse the cached answer instead of burning
// another API call -- important for staying inside the free tier's daily quota.

const CACHE_KEY = "gemini_category_cache";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days -- categories rarely change that fast
const MAX_CACHE_ENTRIES = 500;

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
 * Returns every non-expired cached category as a plain { url: category }
 * map, in a single storage read. Used to apply known categories to *all*
 * tabs up front (before the first render), rather than looking them up
 * one at a time after the fact -- which is both slower and causes tabs
 * that were already AI-classified to visibly flash as "Other" first.
 * @returns {Promise<Record<string, string>>}
 */
export async function getCachedCategoriesMap() {
    const cache = await loadCache();
    const now = Date.now();
    const result = {};
    for (const [url, entry] of Object.entries(cache)) {
        if (now - entry.timestamp <= TTL_MS) {
            result[url] = entry.category;
        }
    }
    return result;
}

/**
 * Stores multiple { url: category } results in one write, evicting expired
 * entries and capping total cache size to prevent storage quota exhaustion.
 * @param {Record<string, string>} entries
 */
export async function setCachedCategories(entries) {
    const cache = await loadCache();
    const now = Date.now();

    for (const [url, category] of Object.entries(entries)) {
        cache[url] = { category, timestamp: now };
    }

    // Evict expired entries older than TTL
    const validEntries = Object.entries(cache).filter(
        ([, entry]) => entry && now - entry.timestamp <= TTL_MS
    );

    // Evict oldest entries if total cache exceeds MAX_CACHE_ENTRIES
    if (validEntries.length > MAX_CACHE_ENTRIES) {
        validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        validEntries.length = MAX_CACHE_ENTRIES;
    }

    const prunedCache = Object.fromEntries(validEntries);
    await saveCache(prunedCache);
}

/**
 * Clears all cached categories from storage.
 */
export async function clearCache() {
    await chrome.storage.local.remove(CACHE_KEY);
}