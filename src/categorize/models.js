// Single source of truth for which models ClaroTab will try, in order.
// Both gemini.js (the actual API calls) and the Options page (the model
// picker UI) import from here, so they can never drift out of sync.
//
// No promised quota numbers live here on purpose. Google doesn't expose a
// real "quota remaining" endpoint, and early estimates shipped in this
// project turned out to be badly wrong in practice (e.g. gemini-2.0-flash
// was estimated at ~200 requests/day but was actually exhausted after a
// single request for this project). Rather than show a number we can't
// stand behind, the UI only ever displays real, locally-observed usage --
// see modelUsage.js.
export const MODEL_META = {
    "gemini-flash-latest": { displayName: "Gemini Flash" },
    "gemini-flash-lite-latest": { displayName: "Gemini Flash-Lite" },
    "gemma-4-31b-it": { displayName: "Gemma 4 (31B)" },
    "gemma-4-26b-a4b-it": { displayName: "Gemma 4 (26B)" },
};

// Ordered roughly by quality, spanning two distinct model families --
// Google allocates a SEPARATE free-tier quota pool per exact model, so
// family diversity matters more than picking a single "best" model for
// this simple classification task.
//
// gemini-2.0-flash-001 and gemini-2.0-flash-lite-001 were removed from
// this chain after real-world testing showed they had almost no usable
// quota for this project (exhausted after a single categorization call),
// despite documentation suggesting otherwise. The two Gemma variants
// below are a different product line entirely and have proven far more
// reliable in practice.
export const MODEL_FALLBACK_CHAIN = Object.keys(MODEL_META);