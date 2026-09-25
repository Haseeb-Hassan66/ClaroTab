<div align="center">
  <img src="icons/icon128.png" alt="ClaroTab Logo" width="112" height="112">
  <h1>ClaroTab</h1>
  <p><strong>Intelligent, privacy-first Chrome tab manager with instant rule-based grouping, multi-model Gemini AI fallback, duplicate cleanup, and session restoration.</strong></p>

  <p>
    <a href="https://developer.chrome.com/docs/extensions/mv3/intro/"><img src="https://img.shields.io/badge/Manifest-V3-38bdf8?style=flat-square&logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
    <a href="manifest.json"><img src="https://img.shields.io/badge/Version-1.5.2-f97316?style=flat-square" alt="Version 1.5.2"></a>
    <a href="https://aistudio.google.com/"><img src="https://img.shields.io/badge/AI-Google_Gemini-ea580c?style=flat-square&logo=googlegemini&logoColor=white" alt="Google Gemini API"></a>
    <a href="#-privacy--zero-trust-security"><img src="https://img.shields.io/badge/Privacy-100%25_Local-10b981?style=flat-square" alt="Privacy First"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-a855f7?style=flat-square" alt="License MIT"></a>
  </p>

  <p>
    <a href="#-key-features">Key Features</a> •
    <a href="#-how-it-works--architecture">Architecture</a> •
    <a href="#-installation">Installation</a> •
    <a href="#-ai-refinement--multi-model-fallback">AI Setup</a> •
    <a href="#-built-in-categories">Categories</a> •
    <a href="#-privacy--zero-trust-security">Privacy & Security</a> •
    <a href="#-contributing">Contributing</a>
  </p>
</div>

---

## 💡 Why ClaroTab?

Tab sprawl clutters your workflow, drains system memory, and makes finding critical documents frustrating. Most tab managers either require heavy cloud accounts, send your browsing history to third-party telemetry servers, or rely entirely on slow, quota-limited cloud LLMs.

**ClaroTab solves this with an instant, privacy-focused, two-tiered architecture:**
1. **Instant Local Engine:** Categorizes standard tabs in less than 2 milliseconds using high-precision domain rules, educational TLD matching, and word-boundary keyword regex — with **zero network latency** and **zero data leaving your machine**.
2. **Resilient AI Fallback:** For ambiguous or niche pages, an optional Google Gemini AI pipeline steps in with a **multi-model cascading chain** (`Gemini Flash` → `Gemini Flash-Lite` → `Gemma 4 31B` → `Gemma 4 26B`) to defeat quota exhaustion, backed by a persistent 7-day local cache.
3. **Native Chrome Grouping:** Integrates directly with Chrome's native Tab Groups API, giving you clean, color-coded, collapsible tab groups right in your browser's tab strip.

---

## ✨ Key Features

| Feature | Description |
|:---|:---|
| ⚡ **Zero-Latency Categorization** | In-memory rule engine evaluates domain rules, academic TLDs, and word-boundary keyword regex in microseconds. |
| 🗂️ **Native Chrome Tab Groups** | Automatically organizes tabs into native, color-coded, collapsible Chrome Tab Groups right in your browser window. |
| 🤖 **Multi-Model Gemini AI Fallback** | Intelligently classifies ambiguous pages using free-tier Gemini / Gemma models when rule engines cannot place them. |
| 🔀 **Quota-Resilient Fallback Chain** | Cascades across 4 distinct models (`Gemini Flash`, `Flash-Lite`, `Gemma 31B`, `Gemma 26B`) with daily quota reset tracking. |
| 🧹 **1-Click Duplicate Cleaner** | Detects redundant tabs via URL normalization (strips tracking queries, handles trailing slashes); protects active & pinned tabs. |
| 💾 **Session Snapshots & Restore** | Save your open tabs into named sessions (with 50-session / 500-tab protection); restore into the current or a fresh window. |
| 🎨 **Ember Amber Design System** | Premium glassmorphism UI with Inter typography, warm amber accents, category color-coding, and fluid micro-animations. |
| 🔒 **Zero-Trust Local Storage** | All sessions, cached classifications, and API keys reside exclusively in `chrome.storage.local`. Zero analytics, zero tracking. |
| ♿ **Accessible & Keyboard Ready** | Full keyboard navigation (`Tab`, `Arrows`, `Enter`, `Escape`), focus-trapped dialogs, and screen-reader compliant (`lang="en"`, `aria-*`). |

---

## 🏗️ How It Works & Architecture

ClaroTab processes your active tabs through a deterministic, ordered pipeline designed for speed, accuracy, and minimum API consumption:

```
[ Active Window Tabs ]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ 0. Ingestion & Security Filter (query.js)              │
│    • Only 'normal' browser windows (ignores DevTools)  │
│    • Strictly http:// and https:// protocol schemes    │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 1. Local AI Cache Lookup (cache.js)                    │
│    • 7-day TTL per normalized URL                      │
│    • Max 500 entries (LRU-style eviction on overflow)  │
│    • Cache Hit ──► Assign Category Immediately         │
└─────────────────────────┬──────────────────────────────┘
                          │ Miss
                          ▼
┌────────────────────────────────────────────────────────┐
│ 2. High-Performance Rule Engine (rules.js)             │
│    • Domain Rules   (e.g., github.com ──► Coding)      │
│    • TLD Matchers   (e.g., .edu, .ac.uk ──► University)│
│    • Keyword Regex  (e.g., \bcheckout\b ──► Shopping)  │
└─────────────────────────┬──────────────────────────────┘
                          │
          Categorized?    ├───► YES ───► [ Chrome Native Grouping ]
                          │
                         NO   (Tabs tagged as "Other")
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 3. Gemini AI Fallback Pipeline (gemini.js) [Optional]  │
│    • Only activates if Gemini API key is configured    │
│    • Sanitizes input (title/URL truncated to 200 chars)│
│    • Multi-Model Cascading Chain (4 fallback models)   │
│    • Validates response IDs (rejects hallucinations)   │
│    • Saves result into Local AI Cache (7-day TTL)      │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
             [ Chrome Native Tab Groups ]
```

### Multi-Model Fallback Chain

Google AI Studio enforces independent free-tier rate limits and daily quotas per model variant. When ClaroTab encounters a `429 (Rate Limit / Quota Exceeded)` or transient error, it transparently rolls over to the next candidate model in the chain:

$$\text{Gemini Flash} \longrightarrow \text{Gemini Flash-Lite} \longrightarrow \text{Gemma 4 (31B)} \longrightarrow \text{Gemma 4 (26B)}$$

- **Daily Exhaustion Tracking:** Models marked exhausted stay bypassed for the remainder of the Pacific Time quota day (matching Google's reset window).
- **Concurrency Guards:** An internal generation ID guard ensures that opening/closing popups or rapid AI triggers never result in race conditions or stale UI overwrites.

---

## 📂 Project Structure

ClaroTab is built cleanly with **native ES Modules** and zero bundler bloat:

```text
ClaroTab/
├── manifest.json              # Extension manifest (Manifest V3, permissions & icons)
├── background.js              # Service worker (lifecycle & storage initialization)
├── icons/                     # Brand icons (16×16, 48×48, 128×128 squircle C lettermark)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── shared/
│   └── tokens.css             # Shared CSS design tokens (Ember Amber palette, glassmorphism)
├── popup/
│   ├── popup.html             # Extension popup UI (Inter font, accessibility markup)
│   ├── popup.css              # Popup styling, collapsible group cards, action bar
│   └── popup.js               # Reactive UI controller, Chrome tabGroups manipulation
├── options/
│   ├── options.html           # Settings & preferences page
│   ├── options.css            # Settings page layout & ambient glowing backdrop
│   └── options.js             # API key manager, model selector, session restore config
└── src/                       # Modular business logic (ES Modules)
    ├── categorize/
    │   ├── rules.js           # Domain rules, educational TLDs, word-boundary keyword regex
    │   ├── gemini.js          # Gemini REST client, prompt construction, payload validation
    │   ├── models.js          # Fallback chain definition & model metadata
    │   ├── cache.js           # Local classification cache (7-day TTL, LRU eviction)
    │   └── icons.js           # Category SVG icons and luminance contrast mapping
    ├── tabs/
    │   ├── query.js           # Window & tab filtering (normal windows, http/https only)
    │   └── duplicates.js      # URL normalization & safe duplicate cleanup
    ├── sessions/
    │   └── storage.js         # Session snapshot CRUD (50-session & 500-tab caps)
    └── settings/
        ├── apiKey.js          # Secure API key storage & validation
        ├── modelUsage.js      # Daily request logging & exhaustion tracking
        └── preferences.js     # User preferences (restore mode, window behaviors)
```

---

## 🚀 Installation

ClaroTab runs directly in Chromium-based browsers without any build steps or npm installations.

### Prerequisites
- Any modern Chromium browser: **Google Chrome**, **Brave**, **Microsoft Edge**, **Vivaldi**, or **Arc** (Version 88+).
- Git (or download the repository as a ZIP archive).

### Quick Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Haseeb-Hassan66/ClaroTab.git
   ```
2. **Open the Extensions Management page:**
   - Chrome / Arc / Brave: `chrome://extensions`
   - Edge: `edge://extensions`
3. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top-right corner.
4. **Load ClaroTab:**
   - Click the **Load unpacked** button.
   - Select the cloned `ClaroTab` directory.
5. **Pin to Toolbar:**
   - Click the puzzle icon in your browser toolbar and pin **ClaroTab** for fast access.

---

## ⚙️ AI Refinement & Multi-Model Fallback

ClaroTab functions 100% autonomously out of the box using its fast local rule engine. Connecting Google Gemini AI is completely optional and enhances categorization for unfamiliar sites:

1. Click the **⚙️ Settings** icon in the ClaroTab popup header.
2. Generate a **free** Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Paste the key into the **Gemini API Key** field and click **Save & Test**. ClaroTab executes a lightweight handshake request to confirm key validity before saving.
4. *(Optional)* Select a **Preferred Model** or let ClaroTab automatically select the fastest model in the cascade.

> [!TIP]
> **Graceful Degradation:** If you choose not to provide an API key, or if your daily quota is exceeded, unclassified tabs simply remain organized under the **Other** category. The extension will never crash or disrupt your browsing.
>
> **Clean Removal:** Removing your API key automatically wipes all AI-classified cache entries from storage, preventing stale classification data from persisting.

---

## 🏷️ Built-in Categories

ClaroTab sorts tabs into **9 color-coded categories**, visually styled with unique icons and contrasting glass borders:

| Category | Color | Sample Domains & Triggers |
|:---|:---:|:---|
| **Email** | `#c7c5dd` | `mail.google.com`, `outlook.live.com`, `protonmail.com`, `mail.yahoo.com` |
| **Work & Productivity** | `#4ade80` | Google Docs/Sheets/Drive/Calendar, `slack.com`, `notion.so`, `figma.com`, `trello.com`, `atlassian.net`, `zoom.us` |
| **Coding** | `#a78bfa` | `github.com`, `gitlab.com`, `stackoverflow.com`, `developer.mozilla.org`, `npmjs.com`, `leetcode.com`, `react.dev` |
| **Shopping** | `#ff9f5a` | `amazon.com`, `ebay.com`, `etsy.com`, `walmart.com`; keywords: `cart`, `checkout`, `buy now` |
| **Social Media** | `#60a5fa` | `x.com`, `twitter.com`, `reddit.com`, `instagram.com`, `linkedin.com`, `discord.com`, `tiktok.com` |
| **Entertainment** | `#ff7aa8` | `youtube.com`, `netflix.com`, `twitch.tv`, `spotify.com`, `hulu.com`, `disneyplus.com`, `steampowered.com` |
| **Research** | `#34d399` | `wikipedia.org`, `scholar.google.com`, `arxiv.org`, `jstor.org`, `sciencedirect.com`, `ieee.org` |
| **University** | `#fbbf24` | `.edu` and `.ac.*` TLD patterns, `coursera.org`, `canvas.instructure.com`, `blackboard.com`, `quizlet.com` |
| **News** | `#d18ff0` | `bbc.com`, `nytimes.com`, `theguardian.com`, `reuters.com`, `cnn.com`, `bloomberg.com` |
| **Other** | `#8886a3` | All tabs not matched by the above (eligible for Gemini AI refinement) |

> **Evaluation Order:** Domain Rules $\longrightarrow$ Academic TLD Patterns $\longrightarrow$ Word-Boundary Keyword Regex $\longrightarrow$ AI Cache $\longrightarrow$ Gemini API $\longrightarrow$ "Other".

---

## 🔒 Privacy & Zero-Trust Security

ClaroTab adheres to strict zero-trust client-side security principles:

```
┌────────────────────────────────────────────────────────┐
│                     YOUR MACHINE                       │
│                                                        │
│  ┌────────────────────┐       ┌─────────────────────┐  │
│  │ ClaroTab Popup &   │       │ chrome.storage.local│  │
│  │ Background Worker  │◄─────►│ • API Key (masked)  │  │
│  └─────────┬──────────┘       │ • 7-day AI Cache    │  │
│            │                  │ • Saved Sessions    │  │
│            │                  └─────────────────────┘  │
└────────────┼───────────────────────────────────────────┘
             │ Direct HTTPS (Only when AI is enabled)
             ▼
┌─────────────────────────────────────────┐
│ Google Gemini API                       │
│ (generativelanguage.googleapis.com)     │
└─────────────────────────────────────────┘
```

- **No Third-Party Servers:** There is no ClaroTab backend, intermediary proxy, database, or analytics collector.
- **Key Protection:** Stored strictly in `chrome.storage.local`. In the Settings UI, the key is masked (`••••••••••••[last 4]`) so it cannot be read from the DOM.
- **Query Parameter Shielding:** API keys are transmitted exclusively via the `x-goog-api-key` HTTP header — never exposed in URL query parameters or browser history.
- **Sanitized AI Prompts:** Tab titles and URLs are truncated to a maximum of 200 characters and stripped of control characters, quotation marks, and line breaks before transmission.
- **Protocol Whitelisting:** Session saving and tab queries only permit standard `http://` and `https://` protocols, eliminating malicious `javascript:`, `data:`, or `chrome://` injection vectors.
- **Minimal Manifest Permissions:** ClaroTab requests only `tabs`, `tabGroups`, and `storage`. It never asks for `history`, `cookies`, `webRequest`, or arbitrary host permissions.

---

## 🎨 Design System: Ember Amber

ClaroTab is styled with custom modern aesthetics defined in `shared/tokens.css`:

- **Palette:** Warm amber/burnt orange primary tones (`#f97316`, `#ea580c`), layered over deep obsidian glass backgrounds (`#0f0a04`, `#1a1108`).
- **Glassmorphism:** Multi-layered frosted glass surfaces with high-blur diffusion (`backdrop-filter: blur(24px)`), translucent border highlights, and soft ambient drop shadows.
- **Typography:** Google Inter with crisp system font fallbacks, calibrated font weights, and high-contrast color tokens to maximize readability in dark mode.
- **Micro-Interactions:** Smooth cubic-bezier transitions (`cubic-bezier(0.16, 1, 0.3, 1)`), animated chevron toggles, and responsive card hover states with category-tinted backdrops.

---

## ⌨️ Accessibility & Shortcuts

- **Full Keyboard Operability:** Navigate between views (`Tabs` vs `Sessions`), expand/collapse groups, and trigger duplicate cleanup using standard keyboard focus (`Tab`, `Shift+Tab`, `Space`, `Enter`).
- **Modal Trap & Escape:** Modals trap focus appropriately to prevent background keyboard leakage, and dismiss immediately upon pressing `Escape`.
- **Screen Reader Compatibility:** Uses semantic markup (`<nav>`, `<header>`, `<main>`), explicit `lang="en"` root attributes, and descriptive `aria-label` tags for icon buttons.

---

## 🤝 Contributing

We welcome community contributions, including new domain rules, bug reports, and UX suggestions!

### Adding Domain Rules
To map a new website to an existing category:
1. Open `src/categorize/rules.js`.
2. Locate the appropriate category inside `DOMAIN_RULES`.
3. Add the apex domain or subdomain string in lowercase (e.g., `'linear.app'`).
4. Test the popup to ensure it classifies as expected.

### Development Guidelines
- **Pure ES Modules:** Do not use `require()` or external runtime libraries.
- **Zero Build Dependencies:** Keep the extension lightweight, self-contained, and runnable directly in Chrome.
- **Encapsulate Chrome APIs:** Isolate browser API calls within their designated helper modules (`src/tabs/`, `src/sessions/`, `src/settings/`).

```bash
# Clone and create your feature branch
git checkout -b feature/my-new-feature

# Commit your changes
git commit -m "feat: add domain rules for project management tools"

# Push and open a Pull Request
git push origin feature/my-new-feature
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Crafted with precision for mindful, clutter-free browsing.</sub>
</div>