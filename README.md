<div align="center">
  <img src="icons/icon128.png" alt="ClaroTab Logo" width="96" height="96">
  <h1>ClaroTab</h1>
  <p><strong>A smart, AI-assisted Chrome extension that groups, cleans up, and helps you restore your browser tabs.</strong></p>
</div>

---

## Overview

ClaroTab organizes messy tab sprawl into clear, color-coded categories at a glance. It combines an instant rule-based engine (no network calls, no waiting) with an optional AI layer, powered by Google's Gemini API, that classifies the tabs the rules can't confidently place. Everything runs locally in your browser — ClaroTab has no server of its own and collects no data.

## Features

- **Instant tab grouping** — categorizes open tabs the moment you open the popup, using a fast rule-based engine (no network required).
- **AI refinement (optional)** — ambiguous tabs that the rules can't confidently categorize are classified in the background via the Gemini API, then cached so the same site is never re-classified.
- **Duplicate detection** — spot and close duplicate tabs in one click, always keeping the tab you're actively viewing.
- **Session save & restore** — save your current tabs as a named session and reopen the whole set later, even after closing your browser.
- **Clean, responsive UI** — collapsible category groups, favicons, keyboard navigation, and dark mode support.

## Installation

ClaroTab isn't yet published on the Chrome Web Store, so for now it's installed manually as an unpacked extension. This works identically to a store install once loaded — the only difference is you won't get automatic updates.

1. Clone this repository:
   ```bash
   git clone https://github.com/Haseeb-Hassan66/ClaroTab.git
   ```
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions` — any Chromium-based browser works).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the cloned `ClaroTab` folder.
5. Pin the extension to your toolbar.

That's it — ClaroTab works immediately with rule-based grouping. AI refinement is optional and requires a one-time setup below.

## Enabling AI refinement (optional)

Most tabs are categorized instantly by the built-in rules and never touch the network. For the few that aren't recognized, ClaroTab can optionally ask Gemini to classify them:

1. Click the gear icon in the ClaroTab popup to open **Settings**.
2. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) (the Settings page links here too).
3. Paste the key in and click **Save & Test** — ClaroTab verifies it works before saving.

Your key is stored locally in the browser via `chrome.storage.local` and never leaves your device except when sent directly to Google's API to classify a tab. If you skip this step, ClaroTab still works fully — unrecognized tabs are simply grouped under "Other" instead of being AI-classified.

## Privacy

- ClaroTab reads the titles and URLs of your open tabs to categorize and group them. This happens entirely on your device.
- If AI refinement is enabled, only the title and URL of tabs the rule engine couldn't classify are sent to Google's Gemini API — never your full browsing history, and never tabs the rules already handled.
- Saved sessions and AI-category caches are stored locally in your browser via `chrome.storage.local`. Nothing is transmitted to any server operated by ClaroTab, because ClaroTab has no server.
- No analytics, tracking, or telemetry of any kind.

## Project structure

```text
ClaroTab/
├── manifest.json          # Extension config (Manifest V3)
├── background.js          # Service worker for background events
├── popup/                 # Toolbar popup UI (HTML, CSS, JS)
├── options/                # Settings page (API key entry, test, and removal)
├── src/
│   ├── categorize/         # Rule-based engine, Gemini fallback, and AI-result cache
│   ├── tabs/                # Tab querying and duplicate detection
│   ├── sessions/            # Session save/restore/delete
│   └── settings/            # API key storage (chrome.storage.local)
└── icons/                   # Extension icons (16 / 48 / 128px)
```

## Tech stack

- Vanilla JavaScript (Manifest V3 Chrome Extension APIs) — no build step, no framework
- Google Gemini API (free tier) for optional AI-assisted categorization
- `chrome.storage` for session persistence and AI-result caching

## Requirements

- Any Chromium-based browser: Chrome, Brave, or Edge (Firefox is not currently supported, as it uses a different extension API)
- A free Google account if you want to enable AI refinement — not required otherwise

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the project
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes with a clear message
4. Push and open a Pull Request

## License

Licensed under the [MIT License](LICENSE).