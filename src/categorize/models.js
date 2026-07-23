// Single source of truth for which models ClaroTab will try, in order, and
// their display metadata. Both gemini.js (the actual API calls) and the
// Options page (the model picker UI) import from here, so they can never
// drift out of sync with each other.

/**
 * estimatedDailyLimit is a ROUGH GUIDE ONLY, used purely to size the visual
 * quota gauge in Settings. Google does not expose a real "quota remaining"
 * endpoint, and published free-tier limits vary by account/tier and change
 * over time -- these numbers should not be treated as guaranteed. The one
 * piece of ground truth we do trust is a live 429 response, which always
 * overrides the estimate immediately (see quota.js).
 */
export const MODEL_META = {
    "gemini-flash-latest": { displayName: "Gemini Flash", estimatedDailyLimit: 250 },
    "gemini-flash-lite-latest": { displayName: "Gemini Flash-Lite", estimatedDailyLimit: 1000 },
    "gemini-2.0-flash-001": { displayName: "Gemini 2.0 Flash", estimatedDailyLimit: 200 },
    "gemini-2.0-flash-lite-001": { displayName: "Gemini 2.0 Flash-Lite", estimatedDailyLimit: 200 },
    "gemma-4-31b-it": { displayName: "Gemma 4 (31B)", estimatedDailyLimit: 14400 },
};

// Ordered roughly by quality, but deliberately spanning different model
// families -- Google allocates a SEPARATE free-tier quota pool per model,
// so family diversity matters more than picking the single "best" model
// for this simple classification task. Note on "-latest" vs pinned
// versions: Google has twice rejected pinned stable versions (e.g.
// gemini-2.5-flash) for this project with "no longer available to new
// users," while "-latest" aliases have always worked. The pinned 2.0
// entries below carry that same risk, but the fallback logic in gemini.js
// treats an unavailable model as a 404 and just skips to the next one, so
// it's safe to keep them even if they turn out to be blocked.
export const MODEL_FALLBACK_CHAIN = Object.keys(MODEL_META);