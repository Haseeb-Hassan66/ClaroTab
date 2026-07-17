# ClaroTab

A Chrome extension that automatically groups, cleans up, and helps you restore your browser tabs — so you never lose track of 30 open tabs again.

## Status

🚧 Early development — building step by step.

## Features (planned)

- [ ] Automatic tab grouping by category (rule-based)
- [ ] Smarter categorization via Gemini API fallback
- [ ] Close duplicate tabs
- [ ] Save and restore full tab sessions
- [ ] Popup UI to browse and jump between groups

## Project structure

```
clarotab/
├── manifest.json          # Extension config (Manifest V3)
├── background.js          # Service worker — background event handling
├── popup/                 # Toolbar popup UI
├── src/
│   ├── categorize/        # Rule-based + Gemini categorization logic
│   ├── tabs/               # Tab querying, grouping, duplicate detection
│   └── sessions/           # Save/restore tab sessions
└── icons/                  # Extension icons
```

## Development setup

1. Clone this repo
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder
5. Pin the extension and click its icon to open the popup

## Tech stack

- Vanilla JavaScript (Manifest V3 Chrome Extension APIs)
- Gemini API (free tier) for AI-assisted categorization
- Chrome `storage` API for session persistence

## License

TBD
