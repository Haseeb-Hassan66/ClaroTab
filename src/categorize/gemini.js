// Calls the Gemini API to classify tabs the rule engine couldn't confidently
// place (i.e. tabs that landed in "Other"). This is a fallback layer, not
// the primary path -- most tabs never reach this file.

import { CATEGORIES } from "./rules.js";

// Google gives each model its own SEPARATE free-tier quota pool -- hitting
// the daily/per-minute limit on one model does not affect the others. So
// instead of failing the moment the primary model is rate-limited, we try
// a chain of models in order, falling through to the next one whenever a
// model is out of quota or temporarily unavailable. This means a real user
// essentially never sees "AI grouping paused" unless ALL of these are
// exhausted at once, which is rare.
//
// Ordered roughly by quality, but deliberately spanning different model
// families (not just Flash variants of the same generation) -- since
// quota pools are per-model, family diversity matters more than picking
// the single "best" model for this simple classification task.
//
// Note on "-latest" vs pinned versions: Google has twice rejected pinned
// stable versions (e.g. gemini-2.5-flash) for this project with "no longer
// available to new users," while the "-latest" aliases have always worked.
// The pinned 2.0 entries below carry that same risk -- if they ever get
// blocked, the code below treats it as a 404 and just skips to the next
// model automatically, so it's safe to keep them, but the aliases
// (gemini-flash-latest, gemini-flash-lite-latest, gemini-pro-latest) are
// the ones this chain actually leans on for reliability.
const MODEL_FALLBACK_CHAIN = [
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite-001",
    "gemini-pro-latest",
    "gemma-4-31b-it",
];

// Remembers which model worked last, so we try it first on the next call
// rather than always re-attempting exhausted models from the top of the
// chain. Resets naturally when the popup/service worker restarts -- that's
// fine, quota windows roll over anyway.
let preferredModelIndex = 0;

function endpointFor(model) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// Returns the fallback chain reordered to start from whichever model
// worked most recently, then continue through the rest in normal order.
function orderedModels() {
    return [
        ...MODEL_FALLBACK_CHAIN.slice(preferredModelIndex),
        ...MODEL_FALLBACK_CHAIN.slice(0, preferredModelIndex),
    ];
}

/**
 * Sends a minimal request to verify an API key actually works, without the
 * cost/complexity of a real categorization call. Used by the Options page
 * so saving a key gives immediate feedback instead of failing silently later.
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testApiKey(apiKey) {
    if (!apiKey || !apiKey.trim()) {
        return { ok: false, message: "Enter a key first." };
    }

    try {
        const response = await fetch(`${endpointFor(MODEL_FALLBACK_CHAIN[0])}?key=${apiKey.trim()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: "Reply with just the word OK." }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 10 },
            }),
        });

        // A 429 here just means this one model is momentarily busy -- it says
        // nothing about whether the key itself is valid, so don't reject the key.
        if (response.status === 400 || response.status === 403) {
            return { ok: false, message: "That key was rejected -- double check it's correct." };
        }
        if (response.status === 429) {
            return { ok: true, message: "Key verified -- AI categorization is ready. (This particular model is briefly busy, but ClaroTab automatically falls back to others when needed.)" };
        }
        if (!response.ok) {
            return { ok: false, message: `Unexpected error (status ${response.status}).` };
        }

        return { ok: true, message: "Key verified -- AI categorization is ready." };
    } catch (err) {
        return { ok: false, message: "Couldn't reach the API. Check your internet connection." };
    }
}

/**
 * Attempts a single model. Returns a result describing whether it succeeded,
 * and if not, whether it's worth trying the next model in the chain.
 */
async function attemptModel(model, apiKey, requestBody) {
    const response = await fetch(`${endpointFor(model)}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
    });

    if (response.status === 429) {
        // This model's quota is used up right now -- a different model's
        // separate quota pool is very likely still available, so keep going.
        console.log(`ClaroTab: ${model} is rate-limited, trying the next model...`);
        return { ok: false, tryNextModel: true, error: { type: "rate_limit", message: "" } };
    }
    if (response.status === 404) {
        // This specific model isn't available to this project (Google rotates
        // this over time) -- same recovery as rate-limiting: try the next one.
        console.log(`ClaroTab: ${model} is unavailable, trying the next model...`);
        return { ok: false, tryNextModel: true, error: { type: "unknown", message: "" } };
    }
    if (response.status === 400 || response.status === 403) {
        // A bad/revoked key fails identically on every model -- no point
        // burning through the whole fallback chain to confirm that five times.
        const bodyText = await response.text().catch(() => "");
        console.warn("ClaroTab: Gemini API request failed:", response.status, bodyText);
        return {
            ok: false,
            tryNextModel: false,
            error: { type: "auth", message: "AI grouping is off — your API key was rejected. Check it in Settings." },
        };
    }
    if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        console.warn("ClaroTab: Gemini API request failed:", response.status, bodyText);
        return {
            ok: false,
            tryNextModel: false,
            error: { type: "unknown", message: `AI grouping failed (server error ${response.status}). It'll retry next time.` },
        };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        return { ok: true, categories: {} }; // empty response isn't necessarily an error worth surfacing
    }

    // Defensive: strip markdown fences in case the model adds them anyway.
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { ok: true, categories: parsed };
}

/**
 * Classifies a batch of tabs in a single API call (cheaper and faster than
 * one call per tab, and keeps us well within any single model's free-tier
 * quota). Automatically falls back through MODEL_FALLBACK_CHAIN if a model
 * is rate-limited or temporarily unavailable, so a real user essentially
 * never sees "AI grouping paused" unless every model is exhausted at once.
 * @param {chrome.tabs.Tab[]} tabs - tabs to classify (already known to be ambiguous)
 * @param {string} apiKey
 * @returns {Promise<{ categories: Record<string, string>, error: {type: string, message: string} | null }>}
 *   `categories` maps tab.id -> category name. Tabs Gemini couldn't confidently
 *   classify are simply absent -- callers should treat a missing entry as "leave as Other".
 *   `error` is null on success, or a structured reason the caller can show to the user.
 */
export async function categorizeTabsWithGemini(tabs, apiKey) {
    if (!apiKey || tabs.length === 0) {
        return { categories: {}, error: null };
    }

    const assignableCategories = CATEGORIES.filter((c) => c !== "Other");
    const tabList = tabs
        .map((tab) => `- id ${tab.id}: title="${tab.title}" url="${tab.url}"`)
        .join("\n");

    const prompt = `You are classifying browser tabs into categories for a tab-organizing extension.
Valid categories: ${assignableCategories.join(", ")}.
If a tab genuinely doesn't fit any category well, omit it from your response.

Respond with ONLY a JSON object mapping each tab id (as a string) to one category name.
No explanation, no markdown code fences -- just the raw JSON object.

Tabs to classify:
${tabList}`;

    const requestBody = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0, // deterministic classification, not creative writing
            responseMimeType: "application/json",
        },
    });

    let lastError = null;

    try {
        for (const model of orderedModels()) {
            const result = await attemptModel(model, apiKey, requestBody);

            if (result.ok) {
                // Remember this model worked -- try it first next time.
                preferredModelIndex = MODEL_FALLBACK_CHAIN.indexOf(model);

                // Only keep entries that match a category we actually recognize --
                // never trust external/AI output blindly.
                const filtered = {};
                for (const [tabId, category] of Object.entries(result.categories)) {
                    if (assignableCategories.includes(category)) {
                        filtered[tabId] = category;
                    }
                }
                return { categories: filtered, error: null };
            }

            lastError = result.error;
            if (!result.tryNextModel) {
                // Auth/server errors won't be fixed by switching models -- stop here.
                return { categories: {}, error: result.error };
            }
            // Otherwise (rate-limited or unavailable): loop continues to the next model.
        }
    } catch (err) {
        console.warn("ClaroTab: Gemini categorization failed:", err);
        return {
            categories: {},
            error: { type: "network", message: "AI grouping failed — couldn't reach the network. It'll retry next time." },
        };
    }

    // Every model in the chain was rate-limited or unavailable.
    return {
        categories: {},
        error: {
            type: lastError?.type || "rate_limit",
            message: "AI grouping paused — all available models are busy right now. It'll resume automatically.",
        },
    };
}