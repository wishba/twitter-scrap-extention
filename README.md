# Twitter Tweet Scraper Firefox Extension

A Firefox browser extension that allows users to download tweets from Twitter/X directly from their browser.

## Features
- **Automatic Tweet Detection**: Detects and identifies tweets on the Twitter page
- **One-Click Download**: Download detected tweets with a single click on the extension button
- **Infinite Scroll Support**: Automatically detects new tweets as you scroll down your feed
- **Real-time Updates**: Keeps track of tweets dynamically loaded on the page

## How It Works
1. Open Twitter/X in Firefox
2. The extension automatically detects visible tweets
3. Click the download button in the extension popup to download the tweets
4. As you scroll, new tweets are automatically detected and available for download

## Download Format

### What Gets Downloaded
- **Tweets Data File**: JSON file with download timestamp as filename containing all tweet information
- **Media Files**: Images and videos from tweets with original names and quality preserved
- **All files download to**: Your browser's default Downloads folder

### Filename Format

**JSON file (download timestamp):**
- `tweets_YYYY-MM-DD_HH-MM-SS.json`
- Example: `tweets_2024-06-04_10-30-45.json`

**Tweet ID in JSON (tweet upload timestamp):**
- `YYYY-MM-DD_HH-MM-SS`
- Example: `2024-06-04_09-15-30`

**Media files (tweet timestamp + original filename):**
- `{tweet_timestamp}_{original_filename}`
- Examples:
  - `2024-06-04_09-15-30_screenshot.jpg`
  - `2024-06-04_08-45-22_video.mp4`
  - `2024-06-04_08-45-22_image.png`

### Data Captured
- Tweet timestamp and unique identifier
- Tweet text content
- Author username and display name
- Media metadata and original filenames
- Media type (image, video, gif)
- Tweet URLs
- Original media quality and filenames

### Example tweets.json
```json
{
  "downloaded_at": "2024-06-04T10:30:45Z",
  "tweets_count": 25,
  "tweets": [
    {
      "id": "2024-06-04_09-15-30",
      "author": "@username",
      "text": "Tweet content here",
      "timestamp": "2024-06-04T09:15:30Z",
      "media": [
        {
          "type": "image",
          "filename": "2024-06-04_09-15-30_screenshot.jpg",
          "url": "https://..."
        }
      ]
    }
  ]
}
```