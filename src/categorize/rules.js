// Rule-based tab categorization.
// This is the reliable, always-works layer -- no network calls, no API keys,
// instant results. Step 6 will add a Gemini-powered fallback for tabs
// this file can't confidently categorize.

/**
 * Safely extracts the hostname from a tab's URL.
 * Matching against the hostname (e.g. "www.amazon.com") instead of the
 * full URL string avoids false positives -- a search query like
 * "?ref=amazon-deal" on an unrelated site would otherwise wrongly match.
 * @param {string} url
 * @returns {string} lowercase hostname, or "" if the URL is invalid/internal
 */
function getHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        // chrome:// pages, new tab page, etc. don't parse as valid URLs
        return "";
    }
}

/**
 * Checks whether a hostname belongs to a given root domain,
 * covering subdomains too (e.g. "docs.github.com" matches "github.com").
 */
function hostnameMatches(hostname, rootDomain) {
    return hostname === rootDomain || hostname.endsWith("." + rootDomain);
}

// Ordered by specificity -- checked top to bottom, first match wins.
// Subdomain-specific rules (like mail.google.com) are listed before
// their broader parent domain (google.com) so they take priority.
const DOMAIN_RULES = [
    // --- Email (checked before general "Work" Google domains) ---
    { category: "Email", domains: ["mail.google.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com", "protonmail.com", "mail.proton.me"] },

    // --- Work & Productivity ---
    {
        category: "Work & Productivity",
        domains: [
            "docs.google.com", "sheets.google.com", "slides.google.com", "drive.google.com", "calendar.google.com",
            "slack.com", "notion.so", "trello.com", "asana.com", "monday.com", "clickup.com",
            "atlassian.net", "jira.com", "confluence.com", "zoom.us", "meet.google.com", "teams.microsoft.com",
            "office.com", "sharepoint.com", "airtable.com", "figma.com", "miro.com", "dropbox.com",
            "salesforce.com", "hubspot.com",
        ],
    },

    // --- Coding ---
    {
        category: "Coding",
        domains: [
            "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com",
            "developer.mozilla.org", "npmjs.com", "pypi.org", "leetcode.com", "hackerrank.com",
            "codepen.io", "codesandbox.io", "replit.com", "vercel.com", "netlify.com",
            "docs.python.org", "reactjs.org", "react.dev", "nodejs.org", "docker.com",
            "kubernetes.io", "aws.amazon.com", "cloud.google.com", "azure.microsoft.com",
            "w3schools.com", "freecodecamp.org", "geeksforgeeks.org", "devdocs.io",
        ],
    },

    // --- Shopping ---
    {
        category: "Shopping",
        domains: [
            "amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de", "ebay.com", "aliexpress.com",
            "etsy.com", "shopify.com", "walmart.com", "target.com", "bestbuy.com", "wish.com",
            "shein.com", "temu.com", "daraz.pk", "flipkart.com", "myntra.com", "ikea.com",
            "nike.com", "zara.com", "hm.com", "asos.com",
        ],
    },

    // --- Social Media ---
    {
        category: "Social Media",
        domains: [
            "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
            "pinterest.com", "snapchat.com", "threads.net", "discord.com", "whatsapp.com",
            "telegram.org", "linkedin.com",
        ],
    },

    // --- Entertainment ---
    {
        category: "Entertainment",
        domains: [
            "youtube.com", "netflix.com", "twitch.tv", "spotify.com", "reddit.com",
            "hulu.com", "disneyplus.com", "primevideo.com", "hbomax.com", "soundcloud.com",
            "9gag.com", "imgur.com", "steampowered.com", "epicgames.com", "ign.com",
            "crunchyroll.com", "vimeo.com",
        ],
    },

    // --- Research ---
    {
        category: "Research",
        domains: [
            "wikipedia.org", "scholar.google.com", "arxiv.org", "jstor.org", "researchgate.net",
            "sciencedirect.com", "springer.com", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
            "semanticscholar.org", "ieee.org", "nature.com", "wolframalpha.com",
        ],
    },

    // --- University ---
    {
        category: "University",
        domains: [
            "coursera.org", "edx.org", "udemy.com", "khanacademy.org", "classroom.google.com",
            "canvas.instructure.com", "blackboard.com", "moodle.org", "quizlet.com", "chegg.com",
            "brainly.com",
        ],
    },

    // --- News ---
    {
        category: "News",
        domains: [
            "cnn.com", "bbc.com", "bbc.co.uk", "nytimes.com", "theguardian.com", "reuters.com",
            "aljazeera.com", "washingtonpost.com", "npr.org", "bloomberg.com", "forbes.com",
            "dawn.com", "geo.tv", "tribune.com.pk",
        ],
    },
];

// Fallback checks for domains not in the list above.
// 1. TLD-based: .edu / .ac.xx domains are almost always educational institutions.
// 2. Keyword-based: scans the tab title for category-indicating words.
const EDU_TLD_PATTERN = /\.(edu|ac\.[a-z]{2})$/;

/**
 * Returns true if `keyword` appears in `title`.
 * Single-word keywords use \b word-boundary matching to prevent substring
 * false positives (e.g. "cart" must not match "cartoon" or "cartridge").
 * Multi-word phrases use plain includes() — they are specific enough already.
 * @param {string} title  lowercase tab title
 * @param {string} keyword  keyword or phrase to match
 */
function matchesKeyword(title, keyword) {
    if (!keyword.includes(' ')) {
        // Single word — require word boundaries so "cart" doesn't fire on "cartoon".
        return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title);
    }
    // Multi-word phrase — substring match is fine.
    return title.includes(keyword);
}

const KEYWORD_RULES = [
    { category: "Shopping", keywords: ["cart", "checkout", "your order", "add to bag", "buy now"] },
    { category: "Coding", keywords: ["documentation", "api reference", "pull request", "merge request", "stack trace", "error:"] },
    { category: "University", keywords: ["lecture", "syllabus", "assignment due", "midterm", "final exam"] },
    { category: "Entertainment", keywords: ["official trailer", "full episode", "now streaming"] },
    { category: "News", keywords: ["breaking news", "live updates"] },
];

const DEFAULT_CATEGORY = "Other";

// Shared source of truth for valid category names -- both the rule engine
// and the Gemini prompt (Step 6) use this list, so they never disagree.
export const CATEGORIES = [
    ...new Set(DOMAIN_RULES.map((rule) => rule.category)),
    DEFAULT_CATEGORY,
];

/**
 * Categorizes a single tab: domain rules -> TLD check -> keyword fallback -> "Other".
 * @param {chrome.tabs.Tab} tab
 * @returns {string} category name
 */
export function categorizeTab(tab) {
    const hostname = getHostname(tab.url);
    const title = (tab.title || "").toLowerCase();

    if (hostname) {
        for (const rule of DOMAIN_RULES) {
            if (rule.domains.some((domain) => hostnameMatches(hostname, domain))) {
                return rule.category;
            }
        }

        if (EDU_TLD_PATTERN.test(hostname)) {
            return "University";
        }
    }

    for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some((keyword) => matchesKeyword(title, keyword))) {
            return rule.category;
        }
    }

    return DEFAULT_CATEGORY;
}

/**
 * Groups an array of tabs into a { categoryName: [tabs] } object.
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {Record<string, chrome.tabs.Tab[]>}
 */
export function groupTabsByCategory(tabs) {
    const groups = {};

    for (const tab of tabs) {
        const category = categorizeTab(tab);
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(tab);
    }

    return groups;
}