# Twitter Tweet Scraper Firefox Extension

A Firefox browser extension that allows users to download tweets from Twitter/X directly from their browser.

## Features
- **Automatic Tweet Detection**: Detects and identifies tweets on the current Twitter page
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
- **Media Files**: Images at original quality, videos at best available quality
- **All files download to**: Your browser's default Downloads folder

### Filename Format

**JSON file (download timestamp):**
- `tweets_YYYY-MM-DD_HH-MM-SS.json`
- Example: `tweets_2024-06-04_10-30-45.json`

**Tweet ID in JSON (tweet posted timestamp):**
- `YYYY-MM-DD_HH-MM-SS`
- Example: `2024-06-04_09-15-30`

**Media files:**
- `{tweet_timestamp}_{author}_{index}.{ext}`
- Examples:
  - `2024-06-04_09-15-30_username_1.jpg`
  - `2024-06-04_08-45-22_username_1.mp4`
  - `2024-06-04_08-45-22_username_2.jpg`

> **Note:** Twitter strips original filenames when media is uploaded to their CDN.
> There is no way to recover them. Files are named using the tweet timestamp,
> author handle, and a sequential index instead.

### Data Captured
- Tweet timestamp and unique identifier
- Tweet text content
- Author username and display name
- Media URLs and types (image, video)
- Tweet URL

### Example tweets.json
```json
{
  "downloaded_at": "2024-06-04T10:30:45Z",
  "tweets_count": 25,
  "tweets": [
    {
      "id": "2024-06-04_09-15-30",
      "author": "@username",
      "displayName": "Display Name",
      "text": "Tweet content here",
      "timestamp": "2024-06-04T09:15:30Z",
      "tweetUrl": "https://twitter.com/username/status/...",
      "media": [
        {
          "type": "image",
          "url": "https://pbs.twimg.com/media/...",
          "filename": "2024-06-04_09-15-30_username_1.jpg"
        }
      ]
    }
  ]
}
```
