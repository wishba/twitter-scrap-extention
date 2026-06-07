(() => {
  'use strict';

  // ── Tweet cache ────────────────────────────────────────────────────────────
  // The background script keeps a mirror of the content script's store.
  // This lets the popup query tweet data even if the content script is briefly
  // suspended between messages.
  let cachedTweets = [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Return the current UTC datetime as a filename-safe string.
   * e.g. "2024-06-04_10-30-45"
   */
  function nowTimestamp() {
    return new Date()
      .toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .slice(0, 19);
  }

  /**
   * Convert an array of tweet objects to a formatted JSON Blob URL.
   * The caller is responsible for revoking the URL after use.
   */
  function tweetsToObjectUrl(tweets) {
    const json = JSON.stringify(tweets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }

  /**
   * Download a single file via the browser.downloads API.
   * Returns a Promise that resolves to the download id.
   *
   * @param {string} url        - Object URL or remote URL
   * @param {string} filename   - Suggested filename (no path separators)
   * @param {boolean} revoke    - Whether to revoke the object URL after initiating
   */
  function downloadFile(url, filename, revoke = false) {
    return browser.downloads.download({ url, filename, conflictAction: 'overwrite' })
      .then((id) => {
        if (revoke) URL.revokeObjectURL(url);
        return id;
      });
  }

  /**
   * Sanitise a string so it's safe to use as part of a filename.
   * Strips characters that are illegal on Windows/macOS/Linux.
   */
  function safeFilename(str) {
    return str.replace(/[/\\:*?"<>|]/g, '_');
  }

  /**
   * Derive a file extension from a media URL.
   * Falls back to a sensible default based on media type.
   */
  function mediaExt(url, type) {
    try {
      const u = new URL(url);
      // Images: pbs.twimg.com uses ?format=jpg|png|webp
      const fmt = u.searchParams.get('format');
      if (fmt) return fmt;
      // Videos: last path segment often ends in .mp4
      const seg = u.pathname.split('/').pop();
      const dot = seg.lastIndexOf('.');
      if (dot !== -1) return seg.slice(dot + 1);
    } catch (_) { /* fall through */ }
    return type === 'video' ? 'mp4' : 'jpg';
  }

  // ── Download orchestration ─────────────────────────────────────────────────

  /**
   * Download the tweets JSON file.
   */
  async function downloadJson(tweets) {
    const url = tweetsToObjectUrl(tweets);
    const filename = `tweets_${nowTimestamp()}.json`;
    await downloadFile(url, filename, true);
  }

  /**
   * Download all media files referenced in the tweet list.
   *
   * Filename format: {tweet_timestamp}_{author}_{index}.{ext}
   * Example: "2024-06-04_09-15-30_username_1.jpg"
   *
   * Note: Twitter strips original filenames on upload — they are gone by the
   * time media reaches the CDN. This scheme uses all the meaningful info we
   * actually have: when the tweet was posted, who posted it, and the media type.
   *
   * Media downloads are fire-and-forget — we don't block the JSON download
   * on them, and individual failures are caught and logged without aborting
   * the rest.
   */
  async function downloadMedia(tweets) {
    const tasks = [];

    for (const tweet of tweets) {
      if (!tweet.media || tweet.media.length === 0) continue;

      // Skip poster thumbnails when we already have the actual video
      const mediaItems = tweet.media.filter((m) => m.type !== 'thumbnail');

      mediaItems.forEach((item) => {
        // Use item.filename verbatim — it's already "{tweet_id}_{media_key}.{ext}"
        // and matches exactly what's recorded in the JSON.
        const filename = safeFilename(item.filename);

        tasks.push(
          downloadFile(item.url, filename)
            .catch((err) => {
              console.warn(`[TweetScraper] Failed to download media: ${item.url}`, err);
            })
        );
      });
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Main download handler — called when the popup triggers a download.
   * Downloads the JSON first, then kicks off all media downloads in parallel.
   *
   * @param {Object[]} tweets - Array of tweet objects from the content script
   * @returns {{ success: boolean, count: number, error?: string }}
   */
  async function handleDownload(tweets) {
    if (!tweets || tweets.length === 0) {
      return { success: false, count: 0, error: 'No tweets to download.' };
    }

    try {
      await downloadJson(tweets);
      downloadMedia(tweets); // intentionally not awaited — runs in background
      return { success: true, count: tweets.length };
    } catch (err) {
      console.error('[TweetScraper] Download failed:', err);
      return { success: false, count: 0, error: err.message };
    }
  }

  // ── Get tweets from the active tab's content script ───────────────────────

  /**
   * Ask the content script in the currently active tab for its tweet store.
   * Returns the tweet array, or falls back to the cached copy if the
   * content script doesn't respond (e.g. on a non-Twitter page).
   */
  async function getTweetsFromTab() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return cachedTweets;

      const response = await browser.tabs.sendMessage(tab.id, { type: 'GET_TWEETS' });
      if (response?.tweets) {
        cachedTweets = response.tweets;
        return cachedTweets;
      }
    } catch (_) {
      // Content script not present on this tab — return cache
    }
    return cachedTweets;
  }

  /**
   * Tell the content script in the active tab to clear its store.
   */
  async function clearTweetsInTab() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await browser.tabs.sendMessage(tab.id, { type: 'CLEAR_TWEETS' });
    } catch (_) { /* tab may not have the content script */ }
    cachedTweets = [];
  }

  // ── Message router ─────────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {

      // Content script pushes updates whenever new tweets are found
      case 'TWEETS_UPDATED':
        cachedTweets = message.tweets || [];
        sendResponse({ ok: true });
        break;

      // Popup asks for current count + tweet list
      case 'GET_TWEETS':
        getTweetsFromTab().then((tweets) => {
          sendResponse({ tweets, count: tweets.length });
        });
        return true; // keep channel open for async response

      // Popup triggers a download
      case 'DOWNLOAD':
        getTweetsFromTab().then((tweets) => {
          handleDownload(tweets).then(sendResponse);
        });
        return true;

      // Popup triggers a clear
      case 'CLEAR_TWEETS':
        clearTweetsInTab().then(() => {
          sendResponse({ count: 0 });
        });
        return true;

      default:
        break;
    }
  });

})();
