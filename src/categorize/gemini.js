// Calls the Gemini API to classify tabs the rule engine couldn't confidently
// place (i.e. tabs that landed in "Other"). This is a fallback layer, not
// the primary path -- most tabs never reach this file.

import { CATEGORIES } from "./rules.js";

// Using the "-latest" alias rather than a pinned version (e.g. "gemini-2.5-flash")
// deliberately -- Google rotates which specific model version is available to
// new projects fairly often, and pinned versions have broken twice already
// while building this. The alias always points at whatever current Flash
// model your project actually has access to.
const MODEL = "gemini-flash-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Classifies a batch of tabs in a single API call (cheaper and faster than
 * one call per tab, and keeps us well within the free tier's daily quota).
 * @param {chrome.tabs.Tab[]} tabs - tabs to classify (already known to be ambiguous)
 * @param {string} apiKey
 * @returns {Promise<Record<number, string>>} map of tab.id -> category name.
 *   Tabs Gemini couldn't confidently classify are simply absent from the result --
 *   callers should treat a missing entry as "leave it as Other".
 */
export async function categorizeTabsWithGemini(tabs, apiKey) {
    if (!apiKey || tabs.length === 0) {
        return {};
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

    try {
        const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0, // deterministic classification, not creative writing
                    responseMimeType: "application/json",
                },
            }),
        });

        if (!response.ok) {
            // Common cases: 429 (rate limit), 400 (bad key), network issues.
            // We fail silently from the caller's perspective -- rule-based
            // categories still stand, the extension just doesn't get smarter.
            console.warn("ClaroTab: Gemini API request failed:", response.status, await response.text());
            return {};
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            return {};
        }

        // Defensive: strip markdown fences in case the model adds them anyway.
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        // Only keep entries that match a category we actually recognize --
        // never trust external/AI output blindly.
        const result = {};
        for (const [tabId, category] of Object.entries(parsed)) {
            if (assignableCategories.includes(category)) {
                result[tabId] = category;
            }
        }
        return result;
    } catch (err) {
        console.warn("ClaroTab: Gemini categorization failed:", err);
        return {};
    }
}