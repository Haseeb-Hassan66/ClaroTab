// Calls the Gemini API to classify tabs the rule engine couldn't confidently
// place (i.e. tabs that landed in "Other"). This is a fallback layer, not
// the primary path -- most tabs never reach this file.

import { CATEGORIES } from "./rules.js";
import { MODEL_FALLBACK_CHAIN } from "./models.js";
import { trackUsage, getUsageMap, getPreferredModel } from "../settings/modelUsage.js";

function endpointFor(model) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// Decides which order to try models in for this call:
//  1. The user's manually pinned model goes first, UNLESS it's already
//     known to be exhausted today (no point trying it, and it lets
//     automatic fallback kick in even with a pin set).
//  2. Among the rest, models NOT already known to be exhausted go before
//     ones that are -- avoids wasting a request re-confirming something
//     we already have real (429-based) evidence about.
export async function getOrderedModels() {
    const [usageMap, preferredModel] = await Promise.all([getUsageMap(), getPreferredModel()]);

    const notExhausted = MODEL_FALLBACK_CHAIN.filter((m) => !usageMap[m]?.exhausted);
    const exhausted = MODEL_FALLBACK_CHAIN.filter((m) => usageMap[m]?.exhausted);
    let chain = [...notExhausted, ...exhausted];

    if (preferredModel && chain.includes(preferredModel) && !usageMap[preferredModel]?.exhausted) {
        chain = [preferredModel, ...chain.filter((m) => m !== preferredModel)];
    }

    return chain;
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
            return {
                ok: true,
                message: "Key verified -- AI categorization is ready. (This particular model is briefly busy, but ClaroTab automatically falls back to others when needed.)",
            };
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
 * Never throws -- every failure mode (network, bad response, unparseable
 * output) is caught here and turned into a structured result, so a problem
 * with ONE model can't get mislabeled as "the whole request failed" or
 * silently skip evaluating the rest of the fallback chain.
 */
async function attemptModel(model, apiKey, requestBody) {
    let response;
    try {
        response = await fetch(`${endpointFor(model)}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
        });
    } catch (err) {
        // A genuine network failure for THIS request. Let the caller move on
        // to the next model rather than aborting the whole chain -- a single
        // flaky request shouldn't take down every fallback option with it.
        console.warn(`ClaroTab: network error contacting ${model}:`, err);
        return {
            ok: false,
            tryNextModel: true,
            error: { type: "network", message: "AI grouping failed — couldn't reach the network. It'll retry next time." },
        };
    }

    if (response.status === 429) {
        console.log(`ClaroTab: ${model} is rate-limited, trying the next model...`);
        await trackUsage(model, { rateLimited: true });
        return { ok: false, tryNextModel: true, error: { type: "rate_limit", message: "" } };
    }
    if (response.status === 404) {
        // This specific model isn't available to this project (Google rotates
        // this over time) -- same recovery as rate-limiting: try the next one.
        // Not counted as "usage" since the request never actually ran.
        console.log(`ClaroTab: ${model} is unavailable, trying the next model...`);
        return { ok: false, tryNextModel: true, error: { type: "unknown", message: "" } };
    }
    if (response.status === 400 || response.status === 403) {
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

    await trackUsage(model, { rateLimited: false });

    const data = await response.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        return { ok: true, categories: {} }; // empty response isn't necessarily an error worth surfacing
    }

    // Not every model follows "respond with ONLY JSON, no fences" as
    // strictly as Gemini does (Gemma in particular has been observed adding
    // extra text around the JSON). Strip fences, then fall back to pulling
    // out the first {...} block if a direct parse fails, before giving up
    // on this model entirely.
    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch {
                parsed = null;
            }
        }
    }

    if (!parsed || typeof parsed !== "object") {
        console.warn(`ClaroTab: ${model} returned output that couldn't be parsed as JSON, trying the next model...`);
        return { ok: false, tryNextModel: true, error: { type: "unknown", message: "" } };
    }

    return { ok: true, categories: parsed };
}

/**
 * Classifies a batch of tabs in a single API call. Automatically falls
 * back through the model chain if one is rate-limited or unavailable, and
 * tracks real usage per model so both the fallback ordering and the
 * Settings quota display reflect actual observed behavior.
 * @param {chrome.tabs.Tab[]} tabs - tabs to classify (already known to be ambiguous)
 * @param {string} apiKey
 * @returns {Promise<{ categories: Record<string, string>, error: {type: string, message: string} | null }>}
 */
export async function categorizeTabsWithGemini(tabs, apiKey) {
    if (!apiKey || tabs.length === 0) {
        return { categories: {}, error: null };
    }

    const assignableCategories = CATEGORIES.filter((c) => c !== "Other");

    // Strip characters that could break out of the prompt template or inject
    // new instructions (newlines split the structured list; quotes and backticks
    // can escape the field delimiters). Titles/URLs are capped at 200 chars --
    // anything beyond that isn't meaningful for categorization anyway.
    const sanitize = (str) => (str || "").replace(/[\r\n"`]/g, " ").slice(0, 200);

    const tabList = tabs
        .map((tab) => `- id ${tab.id}: title="${sanitize(tab.title)}" url="${sanitize(tab.url)}"`)
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
            temperature: 0,
            responseMimeType: "application/json",
        },
    });

    let lastError = null;

    try {
        // Note: attemptModel() never throws -- it catches its own network/parse
        // errors and returns a structured result. This try/catch exists only
        // to guard getOrderedModels() (a storage read) and any other genuinely
        // unexpected failure, not per-model issues.
        const chain = await getOrderedModels();

        for (const model of chain) {
            const result = await attemptModel(model, apiKey, requestBody);

            if (result.ok) {
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
                return { categories: {}, error: result.error };
            }
        }
    } catch (err) {
        console.warn("ClaroTab: Gemini categorization failed:", err);
        return {
            categories: {},
            error: { type: "network", message: "AI grouping failed — couldn't reach the network. It'll retry next time." },
        };
    }

    return {
        categories: {},
        error: {
            type: lastError?.type || "rate_limit",
            message: "AI grouping paused — all available models are busy right now. It'll resume automatically.",
        },
    };
}