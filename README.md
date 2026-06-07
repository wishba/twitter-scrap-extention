# Twitter Tweet Scraper Firefox Extension

A Firefox browser extension that detects and downloads tweets from the currently open Twitter/X page.

## Features
- **Automatic Tweet Detection**: Detects and identifies tweets on the current Twitter/X page
- **One-Click Download**: Download all captured tweets with a single click on the extension popup
- **Infinite Scroll Support**: Automatically detects new tweets as you scroll down your feed
- **Duplicate Prevention**: Each tweet is stored once — scrolling past the same tweet twice won't create duplicates
- **Clear Button**: Reset the captured tweet store at any time without reloading the page
- **Media Downloads**: Images and videos are downloaded alongside the JSON file

## How It Works
1. Open any Twitter/X page in Firefox (feed, profile, search — any page works)
2. The extension automatically detects visible tweets as you browse
3. Scroll down to capture more tweets — they accumulate in the store
4. Click the extension icon to open the popup and see how many tweets have been captured
5. Click **Download JSON + media** to save everything to your Downloads folder
6. Use the **Clear** button to wipe the store and start fresh

## Download Format

### What Gets Downloaded
- **JSON file**: Array of all captured tweet objects, named with the download timestamp
- **Media files**: Images and videos from tweets using their original CDN filenames
- **All files download to**: Your browser's default Downloads folder

### Filename Format

**JSON file:**
- `tweets_YYYY-MM-DD_HH-MM-SS.json`
- Example: `tweets_2024-06-04_10-30-45.json`

**Tweet ID in JSON (tweet posted timestamp):**
- `YYYY-MM-DD_HH-MM-SS`
- Example: `2024-06-04_09-15-30`

**Media files (original CDN filename only):**
- `{media_key}.{ext}`
- Examples:
  - `HJzCFx_a0AAL3u_.jpg`
  - `AbCdEfGhIjKl.mp4`
  - `XyZ123abc456.png`

### Data Captured per Tweet
- Tweet ID (derived from posted timestamp)
- Posted timestamp (ISO 8601)
- Author username (`@handle`) and display name
- Tweet text content
- Tweet URL
- Media array: type, original CDN filename, and URL for each attached file
- Media types: `image`, `video`, `thumbnail`

### Example tweets.json
```json
[
  {
    "id": "2024-06-04_09-15-30",
    "timestamp": "2024-06-04T09:15:30.000Z",
    "author": "@username",
    "displayName": "Display Name",
    "text": "Tweet content here",
    "tweetUrl": "https://twitter.com/username/status/...",
    "media": [
      {
        "type": "image",
        "url": "https://pbs.twimg.com/media/HJzCFx_a0AAL3u_?format=jpg&name=orig",
        "filename": "HJzCFx_a0AAL3u_.jpg"
      }
    ]
  }
]
```

## Project Structure

```
twitter-scraper-ext/
├── manifest.json         Extension manifest (MV3, Firefox)
├── content_script.js     DOM observer + tweet parser (runs on Twitter/X pages)
├── background.js         Message handler + download orchestration
├── popup.html            Extension popup UI
├── popup.js              Popup logic (count, download, clear)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon96.png
```

## Installation (Development)

1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select `manifest.json` from the project folder
5. Open [Twitter/X](https://twitter.com) and start scrolling

> Note: Temporary add-ons are removed when Firefox restarts. For persistent installation, the extension would need to be signed via [AMO](https://addons.mozilla.org).

## Technical Notes

- Built with **Manifest V3** and the `browser.*` WebExtensions API (Firefox-native)
- Uses a `MutationObserver` (debounced at 300ms) to detect new tweets injected into the DOM during scroll
- Tweet detection relies on Twitter's `data-testid="tweet"` attribute on article elements — this may need updating if Twitter changes its DOM structure
- Images are downloaded at original quality (`name=orig`)
- Videos are captured via the `<video>` element's highest-quality `<source>` tag
- Requires Firefox 109+
