(() => {
  'use strict';

  // ── Tweet store ────────────────────────────────────────────────────────────
  // Keyed by tweet timestamp ID (YYYY-MM-DD_HH-MM-SS).
  // Persists across scrolling; duplicates are silently ignored.
  const tweetStore = new Map();

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Convert an ISO 8601 datetime string to our ID format.
   * "2024-06-04T09:15:30.000Z" → "2024-06-04_09-15-30"
   */
  function isoToId(isoString) {
    return isoString
      .replace('T', '_')
      .replace(/:/g, '-')
      .slice(0, 19); // drop milliseconds and Z
  }

  /**
   * Extract the original filename from a Twitter media URL.
   * "https://pbs.twimg.com/media/AbCdEf?format=jpg&name=large" → "AbCdEf.jpg"
   * Falls back to a generic name if parsing fails.
   */
  function mediaFilename(url, index = 0) {
    try {
      const u = new URL(url);
      // Images: pbs.twimg.com/media/<name>?format=<ext>&name=<size>
      if (u.hostname === 'pbs.twimg.com') {
        const parts = u.pathname.split('/');
        const base = parts[parts.length - 1];
        const fmt = u.searchParams.get('format') || 'jpg';
        return `${base}.${fmt}`;
      }
      // Videos: video.twimg.com/.../<file>.mp4
      if (u.hostname === 'video.twimg.com') {
        const parts = u.pathname.split('/');
        return parts[parts.length - 1] || `video_${index}.mp4`;
      }
    } catch (_) { /* fall through */ }
    return `media_${index}`;
  }

  /**
   * Build a best-quality image URL from a Twitter image URL.
   * Forces name=orig for maximum resolution.
   */
  function bestImageUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'pbs.twimg.com') {
        u.searchParams.set('name', 'orig');
        return u.toString();
      }
    } catch (_) { /* fall through */ }
    return url;
  }

  /**
   * Parse all media (images + videos) from a tweet article element.
   * Returns an array of { type, url, filename } objects.
   */
  function parseMedia(article) {
    const media = [];

    // ── Images ──
    // Twitter wraps tweet images in <a> tags linking to /photo/N
    article.querySelectorAll('a[href*="/photo/"]').forEach((a) => {
      const img = a.querySelector('img[src*="pbs.twimg.com/media"]');
      if (!img) return;
      const rawUrl = img.src.split('?')[0];
      const url = bestImageUrl(img.src);
      const filename = mediaFilename(rawUrl, media.length);
      // Avoid duplicates within the same tweet
      if (!media.find((m) => m.filename === filename)) {
        media.push({ type: 'image', url, filename });
      }
    });

    // ── Videos / GIFs ──
    // Twitter loads videos via a <video> element with a poster and src/source
    article.querySelectorAll('video').forEach((video) => {
      // Prefer the highest-quality source element
      const sources = Array.from(video.querySelectorAll('source'));
      let videoUrl = null;

      if (sources.length > 0) {
        // Pick the last source — Twitter usually orders from low to high quality
        videoUrl = sources[sources.length - 1].src;
      } else if (video.src) {
        videoUrl = video.src;
      }

      if (videoUrl) {
        const filename = mediaFilename(videoUrl, media.length);
        if (!media.find((m) => m.filename === filename)) {
          media.push({ type: 'video', url: videoUrl, filename });
        }
      }

      // Also capture the poster image as a fallback thumbnail
      if (video.poster && video.poster.includes('pbs.twimg.com')) {
        const filename = mediaFilename(video.poster, media.length);
        if (!media.find((m) => m.filename === filename)) {
          media.push({ type: 'thumbnail', url: video.poster, filename });
        }
      }
    });

    return media;
  }

  /**
   * Parse a single tweet article element into a tweet object.
   * Returns null if the element doesn't look like a real tweet.
   */
  function parseTweet(article) {
    // ── Timestamp & ID ──
    // The <time> element inside a tweet has a datetime attribute (ISO 8601)
    // and its parent <a> href contains the tweet's status URL.
    const timeEl = article.querySelector('time[datetime]');
    if (!timeEl) return null;

    const isoTimestamp = timeEl.getAttribute('datetime');
    if (!isoTimestamp) return null;

    const id = isoToId(isoTimestamp);
    const timestamp = isoTimestamp;

    // ── Author ──
    // Twitter renders the display name and username near the top of the article.
    // The username appears as "@handle" in a span, or we can extract from the
    // status link href: /username/status/...
    let username = '';
    let displayName = '';

    const statusLink = timeEl.closest('a[href*="/status/"]');
    if (statusLink) {
      const parts = statusLink.getAttribute('href').split('/');
      // href = /username/status/tweetId → parts[1] = username
      username = '@' + (parts[1] || '');
    }

    // Display name: first bold/strong-ish span near the top of the article
    const nameEl = article.querySelector('[data-testid="User-Name"] span span');
    if (nameEl) {
      displayName = nameEl.textContent.trim();
    }

    // ── Tweet text ──
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl ? textEl.innerText.trim() : '';

    // ── Tweet URL ──
    const tweetUrl = statusLink
      ? 'https://twitter.com' + statusLink.getAttribute('href')
      : '';

    // ── Media ──
    const media = parseMedia(article);

    return { id, timestamp, author: username, displayName, text, tweetUrl, media };
  }

  // ── Core scan ──────────────────────────────────────────────────────────────

  /**
   * Scan all tweet articles currently in the DOM.
   * New tweets are added to the store; existing ones are ignored.
   */
  function scanTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let newCount = 0;

    articles.forEach((article) => {
      const tweet = parseTweet(article);
      if (!tweet) return;
      if (tweetStore.has(tweet.id)) return; // duplicate — skip

      tweetStore.set(tweet.id, tweet);
      newCount++;
    });

    if (newCount > 0) {
      notifyBackground();
    }
  }

  // ── Background communication ───────────────────────────────────────────────

  /**
   * Push the current tweet store to the background script.
   * Called whenever new tweets are detected.
   */
  function notifyBackground() {
    browser.runtime.sendMessage({
      type: 'TWEETS_UPDATED',
      tweets: Array.from(tweetStore.values()),
      count: tweetStore.size,
    }).catch(() => {
      // Background may not be ready yet — that's fine
    });
  }

  /**
   * Handle messages from the background script or popup.
   */
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'GET_TWEETS':
        sendResponse({
          tweets: Array.from(tweetStore.values()),
          count: tweetStore.size,
        });
        break;

      case 'CLEAR_TWEETS':
        tweetStore.clear();
        sendResponse({ count: 0 });
        break;

      default:
        break;
    }
    // Return true to keep the message channel open for async sendResponse
    return true;
  });

  // ── MutationObserver ───────────────────────────────────────────────────────
  // Watches for new tweet articles added to the DOM as the user scrolls.
  // Debounced to avoid thrashing on rapid DOM updates.

  let debounceTimer = null;

  function debouncedScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanTweets, 300);
  }

  const observer = new MutationObserver((mutations) => {
    // Only react if at least one mutation added nodes
    const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
    if (hasAddedNodes) debouncedScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // ── Initial scan ───────────────────────────────────────────────────────────
  // Run once on load to catch tweets already in the DOM.
  scanTweets();

})();
