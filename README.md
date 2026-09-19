<div align="center">
  <img src="icons/icon128.png" alt="ClaroTab Logo" width="100" height="100">
  <h1>ClaroTab</h1>
  <p><strong>A smart, privacy-first Chrome extension that automatically categorizes, groups, cleans up, and restores your browser tabs — no server, no telemetry, no noise.</strong></p>

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![Version](https://img.shields.io/badge/Version-1.5.2-informational.svg)](manifest.json)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Google Gemini API](https://img.shields.io/badge/AI-Google_Gemini_API-orange.svg)](https://aistudio.google.com/)
  [![Privacy First](https://img.shields.io/badge/Privacy-100%25_Local-green.svg)](#-privacy--security)
</div>

---

## 📌 Overview

**ClaroTab** turns chaotic browser tab sprawl into organized, color-coded category groups at a single click. It is built on a **two-tiered architecture**: an instant, zero-latency rule engine that runs 100% locally with no network calls, backed by an optional **Google Gemini AI fallback** that intelligently classifies ambiguous pages the rule engine can't confidently place.

All settings, session snapshots, API keys, and AI result caches live exclusively in `chrome.storage.local` on your device. Nothing is ever transmitted to a custom server or third-party analytics platform.

---

## ✨ Key Features

| Feature | Details |
|---|---|
| ⚡ **Instant Rule Categorization** | Domain + keyword rules classify tabs in-memory at popup open time — zero network latency |
| 🤖 **Gemini AI Fallback** | Unrecognized tabs are sent to Google Gemini for smart classification, cached locally for 7 days |
| 🔀 **Multi-Model Fallback Chain** | Cascades through 4 models when hitting rate limits; tracks exhaustion per model per day |
| 🧹 **Duplicate Tab Cleaner** | Detects and removes duplicates via intelligent URL normalization; preserves active/pinned tabs |
| 💾 **Session Save & Restore** | Snapshots named sets of tabs; restores them into a new window or the current window |
| 🔒 **No Server, No Telemetry** | Only outbound traffic is direct HTTPS calls to `generativelanguage.googleapis.com` (if AI is on) |
| 🎨 **Modern Glassmorphic UI** | Dark mode, collapsible accordion groups, per-category color coding, and full keyboard navigation |
| ♿ **Accessibility-first** | Focus-trapped modals, `aria-*` attributes, arrow + Tab key navigation throughout |

---

## 🏗️ Architecture & How It Works

ClaroTab processes every open tab through a deterministic, ordered pipeline:

```text
[ Open Normal-Window Tabs ]
        │
        ▼
┌─────────────────────────────────────────────────────┐
│ 0. Tab Filter (query.js)                            │
│    • windowType: 'normal' only (excludes DevTools)  │
│    • http / https URLs only                         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│ 1. Local AI Cache Lookup (cache.js)                 │
│    • 7-day TTL per normalized URL                   │
│    • Max 500 entries; oldest evicted on overflow    │
│    • Hit → category applied immediately             │
└──────────────────────┬──────────────────────────────┘
                       │ Miss
                       ▼
┌─────────────────────────────────────────────────────┐
│ 2. Rule Engine (rules.js)                           │
│    • Domain rules  (e.g. mail.google.com → Email)   │
│    • TLD patterns  (e.g. .edu / .ac.uk → University)│
│    • Keyword rules (word-boundary regex for singles)│
└──────────────────────┬──────────────────────────────┘
                       │
         Categorized?  ├──── YES ──► [ Grouped Tab View ]
                       │
                      NO  (lands in "Other")
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│ 3. Gemini AI Fallback (gemini.js)  [optional]       │
│    • Only runs if an API key is saved               │
│    • Sanitizes title/URL (max 200 chars, no quotes) │
│    • Validates response IDs against submitted tabs  │
│    • Multi-Model Fallback Chain (see below)         │
│    • Caches result → Local AI Cache                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              [ Grouped Tab View ]
```

### Multi-Model Fallback Chain

Google imposes separate per-day quotas on each model. ClaroTab resolves this by cascading:

```
Gemini Flash  →  Gemini Flash-Lite  →  Gemma 4 (31B)  →  Gemma 4 (26B)
```

- **Exhaustion tracking** per model per Pacific-time day (matching Google's quota reset window).
- **Automatic skip** of any model already marked exhausted, with no user action required.
- **5xx / transient errors** treated as soft failures — the next model in the chain is tried.
- **Preferred model pin** — users can manually pin a model in Settings; automatic fallover still applies if that model is exhausted.

### Concurrency Safety

`init()` uses a **generation ID guard**: if the popup is reopened or AI refinement is triggered while a previous run is still in-flight, the stale run is silently discarded and the new one takes over — preventing race conditions and stale UI writes.

---

## 📂 Project Structure

```text
ClaroTab/
├── manifest.json              # Extension manifest (Manifest V3, v1.5.2)
├── background.js              # Service worker — lifecycle & first-run defaults
├── icons/                     # Branding icons (16 × 16, 48 × 48, 128 × 128)
├── shared/
│   └── tokens.css             # Shared CSS design token system (single source of truth)
├── popup/
│   ├── popup.html             # Main toolbar popup (lang="en", links tokens.css)
│   ├── popup.css              # Popup layout & component styles
│   └── popup.js               # Tab rendering, accordions, duplicate & session handlers
├── options/
│   ├── options.html           # Settings page (lang="en", links tokens.css)
│   ├── options.css            # Settings layout & ambient mesh background
│   └── options.js             # API key management, model picker, restore mode picker
└── src/                       # Core ES Modules
    ├── categorize/
    │   ├── rules.js           # Domain rules, TLD patterns, word-boundary keyword rules
    │   ├── gemini.js          # Gemini API calls, model fallback execution, response validation
    │   ├── models.js          # Model fallback chain & display metadata (single source of truth)
    │   ├── cache.js           # AI result cache (7-day TTL, 500-entry cap, clearCache export)
    │   └── icons.js           # SVG icon definitions per category
    ├── tabs/
    │   ├── query.js           # Tab querying — normal windows only, http/https filter
    │   └── duplicates.js      # URL normalization & duplicate detection/removal
    ├── sessions/
    │   └── storage.js         # Session CRUD — 50-session cap, 500-tab/session cap, URL validation
    └── settings/
        ├── apiKey.js          # API key read/write/clear (chrome.storage.local)
        ├── modelUsage.js      # Per-model daily request counts & exhaustion flags
        └── preferences.js     # User preferences (restore mode, future settings)
```

---

## 🚀 Installation

ClaroTab is available as an unpacked extension for any Chromium-based browser.

### Prerequisites

- Google Chrome, Brave, Edge, or any Chromium browser ≥ version 88 (Manifest V3 support)
- Git (for cloning)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Haseeb-Hassan66/ClaroTab.git
   ```

2. **Open your browser's extensions page**
   - Chrome → `chrome://extensions`
   - Brave → `brave://extensions`
   - Edge → `edge://extensions`

3. **Enable Developer Mode** — toggle the switch in the top-right corner.

4. **Load Unpacked** — click **Load unpacked** and select the cloned `ClaroTab/` directory.

5. **Pin ClaroTab** — click the puzzle-piece icon in the toolbar and pin ClaroTab for one-click access.

> **Note:** There is no build step. ClaroTab runs native ES Modules directly in Chromium — no transpilation, no bundler required.

---

## ⚙️ Enabling AI Refinement (Optional)

ClaroTab works fully out of the box with rule-based categorization. AI is strictly optional:

1. Click the **⚙️ Gear** icon in the top-right of the popup to open **Settings**.
2. Get a **free** Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Paste your key into the **Gemini API key** field and click **Save & Test** — ClaroTab runs a lightweight validation call before saving.
4. The key is stored **locally only** in `chrome.storage.local`. It is sent exclusively to `generativelanguage.googleapis.com` via the `x-goog-api-key` request header (never in URL query strings).

> **Tip:** If AI is off, or your key runs out of quota, unrecognized tabs fall gracefully into the **"Other"** group. The extension never errors or breaks — AI is purely additive.

> **Removing the key** also clears the AI category cache automatically, so stale AI results don't linger after AI is turned off.

---

## 🏷️ Supported Categories

ClaroTab organizes tabs into **9 built-in categories** determined by a priority-ordered rule set:

| Category | Typical Domains & Patterns |
|:---|:---|
| **Email** | `mail.google.com`, `outlook.live.com`, `mail.yahoo.com`, `protonmail.com` |
| **Work & Productivity** | Google Docs/Sheets/Slides/Drive/Calendar, `slack.com`, `notion.so`, `trello.com`, `figma.com`, `zoom.us`, `atlassian.net` |
| **Coding** | `github.com`, `gitlab.com`, `stackoverflow.com`, `developer.mozilla.org`, `npmjs.com`, `leetcode.com`, `react.dev`, `docker.com` |
| **Shopping** | `amazon.com`, `ebay.com`, `etsy.com`, `walmart.com`; keywords: `cart`, `checkout`, `buy now` |
| **Social Media** | `x.com`, `twitter.com`, `instagram.com`, `reddit.com`, `linkedin.com`, `discord.com`, `tiktok.com` |
| **Entertainment** | `youtube.com`, `netflix.com`, `twitch.tv`, `spotify.com`, `hulu.com`, `disneyplus.com`, `steampowered.com` |
| **Research** | `wikipedia.org`, `scholar.google.com`, `arxiv.org`, `jstor.org`, `sciencedirect.com`, `ieee.org` |
| **University** | `.edu` / `.ac.xx` TLDs, `coursera.org`, `canvas.instructure.com`, `blackboard.com`, `quizlet.com` |
| **News** | `bbc.com`, `cnn.com`, `nytimes.com`, `theguardian.com`, `reuters.com`, `bloomberg.com`, `dawn.com` |
| **Other** | Any tab not matched by the above — eligible for Gemini AI fallback if a key is configured |

**Rule priority order:** Domain rules → TLD patterns → Keyword rules → AI fallback → "Other"

Keyword rules use **word-boundary regex** for single-word keywords (e.g. `"cart"` won't fire on `"cartoon"`). Multi-word phrases use plain substring matching.

---

## 🔒 Privacy & Security

ClaroTab was designed from the ground up around a **zero-trust, local-first** model:

| Concern | How ClaroTab handles it |
|:---|:---|
| **API Key storage** | Stored in `chrome.storage.local` only — never `sync`, never a custom server |
| **API Key transmission** | Sent via `x-goog-api-key` HTTP header only — never appended to URL query strings |
| **API Key display** | Masked with `••••••••••••[last 4]` in Settings — the raw key is never re-loaded into an input value |
| **AI prompt content** | Tab titles/URLs truncated to 200 chars and stripped of quotes/newlines before sending to Gemini |
| **AI response validation** | Gemini's returned tab IDs are validated against the exact set of tabs submitted — hallucinated IDs are rejected |
| **Session URL restoration** | Only `http://` and `https://` URLs are restored — `javascript:`, `chrome://`, and similar schemes are blocked |
| **No telemetry** | Zero analytics scripts, tracking pixels, or third-party SDKs |
| **No custom backend** | No intermediate server exists — the only outbound call is directly to `generativelanguage.googleapis.com` |
| **Permissions** | Requests only `tabs`, `tabGroups`, and `storage` — no `history`, no `cookies`, no broad host access |

---

## 🛠️ Technology Stack

| Layer | Technology |
|:---|:---|
| **Platform** | Chrome Extension Manifest V3 |
| **Language** | Vanilla JavaScript (ES Modules, no transpiler) |
| **Styling** | Vanilla CSS3 — CSS custom properties, Flexbox/Grid, glassmorphism, `@keyframes` animations |
| **Design tokens** | `shared/tokens.css` — single source of truth linked by both popup and options pages |
| **AI** | Google Gemini REST API (direct HTTPS, `x-goog-api-key` header auth) |
| **Storage** | `chrome.storage.local` exclusively |
| **Build system** | None — runs directly in Chromium's native module runtime |

---

## 🤝 Contributing

Contributions are welcome — whether that's new domain rules, bug fixes, or feature ideas.

### Getting Started

1. **Fork** the repository on GitHub.
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** and commit: `git commit -m "Add your feature"`
4. **Push**: `git push origin feature/your-feature-name`
5. **Open a Pull Request** — describe what you changed and why.

### Good First Contributions

- **Adding domain rules** — edit `src/categorize/rules.js` and add entries to `DOMAIN_RULES` or `KEYWORD_RULES`.
- **Adding a new category** — add a domain rule entry and a corresponding color token in `shared/tokens.css`.
- **Reporting bugs** — open a GitHub Issue with steps to reproduce and your Chrome version.

### Code Style

- Pure ES Modules — no CommonJS `require()`.
- No external npm dependencies — keep the extension dependency-free.
- Keep all Chrome API calls in dedicated modules (`query.js`, `storage.js`, etc.) — never call `chrome.*` directly from UI files.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).