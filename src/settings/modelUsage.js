// Tracks AI model usage locally, since Google's API doesn't expose a
// "quota remaining" endpoint. Two kinds of data live here:
//   1. Usage counts per model per day (our own accurate count of requests
//      WE sent -- not a guess).
//   2. An "exhausted" flag per model, set the moment a real 429 comes back.
//      This is ground truth and always takes priority over any estimate.
//
// Also handles the user's manually-preferred model (if they've pinned one
// in Settings), so gemini.js can try that first while still falling back
// automatically if it's unavailable.

import { MODEL_FALLBACK_CHAIN } from "../categorize/models.js";

const USAGE_KEY = "clarotab_model_usage";
const PREFERRED_MODEL_KEY = "clarotab_preferred_model";

// Google resets daily (RPD) quotas at midnight Pacific time, so our local
// "day" boundary needs to match that -- not the user's own timezone --
// or we'd reset our counters at the wrong moment relative to Google's.
function getPacificDateKey() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

async function loadUsage() {
    const result = await chrome.storage.local.get(USAGE_KEY);
    return result[USAGE_KEY] || {};
}

async function saveUsage(usage) {
    await chrome.storage.local.set({ [USAGE_KEY]: usage });
}

/**
 * Records one real request against a model, and marks it exhausted if this
 * particular request came back rate-limited. Call this after every attempt
 * that actually reached the API (skip it for local-only failures).
 * @param {string} modelId
 * @param {{ rateLimited: boolean }} outcome
 */
export async function trackUsage(modelId, { rateLimited }) {
    if (!MODEL_FALLBACK_CHAIN.includes(modelId)) {
        return;
    }
    const usage = await loadUsage();
    const today = getPacificDateKey();

    let entry = usage[modelId];
    if (!entry || entry.date !== today) {
        entry = { date: today, count: 0, exhausted: false };
    }

    entry.count += 1;
    if (rateLimited) {
        entry.exhausted = true;
    }

    usage[modelId] = entry;
    await saveUsage(usage);
}

/**
 * @returns {Promise<Record<string, { count: number, exhausted: boolean }>>}
 *   Only today's (Pacific) entries -- anything from a previous day is
 *   treated as reset, since Google's own daily quota has rolled over.
 */
export async function getUsageMap() {
    const usage = await loadUsage();
    const today = getPacificDateKey();

    const result = {};
    for (const modelId of MODEL_FALLBACK_CHAIN) {
        const entry = usage[modelId];
        result[modelId] =
            entry && entry.date === today
                ? { count: entry.count, exhausted: entry.exhausted }
                : { count: 0, exhausted: false };
    }
    return result;
}

/**
 * @returns {Promise<string|null>} the user's manually pinned model, or null for "Automatic"
 */
export async function getPreferredModel() {
    const result = await chrome.storage.local.get(PREFERRED_MODEL_KEY);
    const model = result[PREFERRED_MODEL_KEY];
    return MODEL_FALLBACK_CHAIN.includes(model) ? model : null;
}

/**
 * @param {string|null} modelId - pass null to clear the preference and return to fully automatic behavior
 */
export async function setPreferredModel(modelId) {
    if (!modelId) {
        await chrome.storage.local.remove(PREFERRED_MODEL_KEY);
        return;
    }
    if (!MODEL_FALLBACK_CHAIN.includes(modelId)) {
        console.warn(`ClaroTab: Unknown modelId "${modelId}" rejected.`);
        return;
    }
    await chrome.storage.local.set({ [PREFERRED_MODEL_KEY]: modelId });
}