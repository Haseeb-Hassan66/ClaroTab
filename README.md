<div align="center">
  <img src="icons/icon128.png" alt="ClaroTab Logo" width="100" height="100">
  <h1>ClaroTab</h1>
  <p><strong>A smart, privacy-first Chrome extension that automatically categorizes, groups, cleans up, and restores browser tabs.</strong></p>

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Google Gemini API](https://img.shields.io/badge/AI-Google_Gemini_API-orange.svg)](https://aistudio.google.com/)
  [![Privacy First](https://img.shields.io/badge/Privacy-100%25_Local-green.svg)](#privacy--security)
</div>

---

## 📌 Overview

**ClaroTab** turns chaotic browser tab sprawl into organized, color-coded categories at a single click. Built with a high-performance, two-tiered architecture, it combines an **instant, zero-latency rule engine** (operating 100% offline with zero network calls) with an **optional AI fallback layer** powered by Google Gemini to intelligently classify complex or ambiguous pages.

Designed strictly around **privacy and zero friction**, ClaroTab operates without any external servers or telemetry. All settings, session snapshots, and category caches remain locked within your browser's local storage (`chrome.storage.local`).

---

## ✨ Key Features

- ⚡ **Instant Rule-Based Categorization**: 
  Categorizes tabs immediately upon opening the popup using domain and keyword matching rules. No network latency, no waiting.
- 🤖 **Smart Gemini AI Fallback (Optional)**: 
  Ambiguous tabs that fall into the *"Other"* category can optionally be classified by Google Gemini AI. Results are cached locally for 7 days by URL to minimize API calls.
- 🔄 **Multi-Model Fallback Chain & Quota Resiliency**: 
  Automatically cascades through Google's Gemini and Gemma models (`gemini-flash-latest`, `gemini-flash-lite-latest`, `gemma-4-31b-it`, `gemma-4-26b-a4b-it`) when facing rate limits (HTTP 429). Tracks real daily usage locally without relying on inaccurate quota estimates.
- 🧹 **One-Click Duplicate Tab Cleaner**: 
  Identifies duplicate tabs via intelligent URL normalization (stripping fragments and trailing slashes while preserving query parameters). Safely removes redundant tabs while preserving active or pinned tabs.
- 💾 **Session Save & Restore**: 
  Capture snapshots of open tab sets with custom names and restore them later—even across browser restarts. Choose between opening restored sessions in a fresh window or appending to the active window.
- 🛡️ **100% Private & Zero Telemetry**: 
  No intermediate backend server, no tracking scripts, no analytics. Your API key and browsing metadata never leave your local device except for direct, sanitized calls to Google Gemini API.
- 🎨 **Modern Glassmorphic UI**: 
  Features dark mode support, collapsible accordion groups, favicons, status banners, keyboard accessibility, and a dedicated options dashboard.

---

## 🏗️ Architecture & How It Works

ClaroTab processes open tabs through a deterministic pipeline to ensure maximum performance and privacy:

```text
[ Open Tabs ]
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ 1. Local Cache Lookup (chrome.storage.local)           │
│    Reuses cached AI categories (7-day TTL)             │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 2. High-Speed Local Rule Engine                        │
│    • Domain Rules (e.g. mail.google.com -> Email)      │
│    • TLD Patterns (e.g. .edu / .ac.uk -> University)   │
│    • Title Keyword Rules (e.g. "checkout" -> Shopping) │
└─────────────────────────┬──────────────────────────────┘
                          │
            Categorized?  ├─────── YES ───► [ Grouped Tab View ]
                          │
                         NO (Category: "Other")
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 3. Gemini AI Fallback (Optional, if API Key is set)    │
│    • Sanitizes titles/URLs (max 200 chars, strips tags)│
│    • Executes request via Multi-Model Fallback Chain    │
│    • Caches result to local storage                    │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
                [ Grouped Tab View ]
```

### Multi-Model Fallback Engine

Google imposes per-model daily quotas on free-tier Gemini keys. ClaroTab solves rate-limiting dynamically:
1. **Priority Model**: Attempts the user's pinned model first.
2. **Dynamic Failover**: If an HTTP 429 (Rate Limit) or 404 is encountered, ClaroTab automatically transitions to the next available model in the fallback chain:
   $$\text{gemini-flash-latest} \longrightarrow \text{gemini-flash-lite-latest} \longrightarrow \text{gemma-4-31b-it} \longrightarrow \text{gemma-4-26b-a4b-it}$$
3. **Local Exhaustion Tracking**: Tracks rate limits per model based on Pacific Time (matching Google's daily reset window) so exhausted models are skipped automatically.

---

## 📂 Project Structure

```text
ClaroTab/
├── manifest.json              # Extension Configuration (Manifest V3)
├── background.js              # Service worker for extension lifecycle
├── icons/                     # Extension branding icons (16px, 48px, 128px)
├── popup/                     # Main toolbar interface
│   ├── popup.html             # Popup layout
│   ├── popup.css              # Modern UI design system & tokens
│   └── popup.js               # Tab query rendering, accordions, duplicate & session handlers
├── options/                   # Extension settings page
│   ├── options.html           # Settings layout
│   ├── options.css            # Settings styling & ambient background mesh
│   └── options.js             # API key validation, model preference, & usage dashboard
└── src/                       # Core ES Modules logic
    ├── categorize/            # Tab categorization engine
    │   ├── rules.js           # Built-in domain & keyword rules (9 categories)
    │   ├── gemini.js          # Gemini API integration & fallback execution
    │   ├── models.js          # Model definitions & fallback chain configuration
    │   ├── cache.js           # Local storage category cache (7-day TTL)
    │   └── icons.js           # SVG icon definitions for categories
    ├── tabs/                  # Tab query & cleanup
    │   ├── query.js           # Chrome tab querying abstraction
    │   └── duplicates.js      # URL normalization & duplicate cleanup logic
    ├── sessions/              # Tab session persistence
    │   └── storage.js         # Session snapshot creation, deletion, & restoration
    └── settings/              # Settings & state managers
        ├── apiKey.js          # API key storage manager (chrome.storage.local)
        ├── modelUsage.js      # Per-day request counter & exhaustion tracker
        └── preferences.js     # User preferences (e.g. Session restore mode)
```

---

## 🚀 Installation

ClaroTab is currently available as an unpacked extension for Chromium-based browsers.

### Step-by-Step Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Haseeb-Hassan66/ClaroTab.git
   ```
2. **Open Extensions Page**:
   Navigate to `chrome://extensions` (or `brave://extensions`, `edge://extensions` depending on your browser).
3. **Enable Developer Mode**:
   Toggle the **Developer mode** switch in the top-right corner.
4. **Load Extension**:
   Click **Load unpacked** and select the cloned `ClaroTab` project directory.
5. **Pin ClaroTab**:
   Click the extension puzzle piece in your browser toolbar and pin **ClaroTab** for easy access.

---

## ⚙️ Enabling AI Refinement (Optional)

ClaroTab works fully out of the box using rule-based categorization. To enable AI categorization for unrecognized tabs:

1. Click the **Gear Icon ⚙️** in the top-right of the ClaroTab popup to open **Settings**.
2. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Enter your API key in the **Gemini API key** field and click **Save & Test**.
4. ClaroTab will execute a lightweight test request to verify the key before saving it locally.

> 💡 **Note**: If AI refinement is disabled or your key runs out of quota, unrecognized tabs are safely placed under the **"Other"** group. The core extension never breaks.

---

## 🏷️ Supported Categories

ClaroTab organizes open tabs into 9 default categories:

| Category | Typical Domains / Patterns |
| :--- | :--- |
| **Email** | `mail.google.com`, `outlook.live.com`, `mail.yahoo.com`, `proton.me` |
| **Work & Productivity** | Google Docs/Sheets/Slides, `slack.com`, `notion.so`, `trello.com`, `figma.com`, `atlassian.net`, `zoom.us` |
| **Coding** | `github.com`, `gitlab.com`, `stackoverflow.com`, `developer.mozilla.org`, `npmjs.com`, `leetcode.com`, `pypi.org` |
| **Shopping** | `amazon.com`, `ebay.com`, `etsy.com`, `walmart.com`, `target.com`, `shopify.com`, checkout keywords |
| **Social Media** | `x.com`, `twitter.com`, `instagram.com`, `reddit.com`, `linkedin.com`, `discord.com`, `tiktok.com` |
| **Entertainment** | `youtube.com`, `netflix.com`, `twitch.tv`, `spotify.com`, `hulu.com`, `disneyplus.com`, `steampowered.com` |
| **Research** | `wikipedia.org`, `scholar.google.com`, `arxiv.org`, `jstor.org`, `sciencedirect.com`, `ieee.org` |
| **University** | Educational TLDs (`.edu`, `.ac.uk`), `coursera.org`, `canvas.instructure.com`, `blackboard.com`, `quizlet.com` |
| **News** | `bbc.com`, `cnn.com`, `nytimes.com`, `theguardian.com`, `reuters.com`, `bloomberg.com` |
| **Other** | Any tab not matched by rules (subject to Gemini AI fallback if enabled) |

---

## 🔒 Privacy & Security

ClaroTab was designed from the ground up to respect user privacy:

- **Local Storage Only**: Your API key and preferences are stored exclusively in `chrome.storage.local` on your device. They are **never** uploaded to `chrome.storage.sync` or external servers.
- **Sanitized Prompts**: When AI refinement is active, tab titles and URLs are truncated (max 200 characters) and stripped of quotes/newlines before being passed to Google Gemini API to guard against prompt injection.
- **No Analytics / Telemetry**: No tracking codes, telemetry, or analytics scripts are included.
- **No Custom Server**: ClaroTab has no backend infrastructure. Data stays strictly between your browser and (if AI is enabled) Google's Gemini API endpoints.

---

## 🛠️ Technology Stack

- **Extension Framework**: Vanilla JavaScript (ES Modules, Manifest V3 Chrome Extension APIs).
- **Styling**: Modern CSS3 utilizing CSS variables/tokens, Flexbox/Grid layouts, glassmorphism, and responsive media queries (No heavy CSS frameworks).
- **AI Integration**: Direct HTTP REST calls to Google Gemini REST API endpoints.
- **Build System**: None! Pure native web modules running directly in Chromium engines without transpilation overhead.

---

## 🤝 Contributing

Contributions, feature requests, and domain rule updates are welcome!

1. **Fork the repository**
2. **Create your feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add some amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).