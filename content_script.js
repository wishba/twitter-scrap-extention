(() => {
  'use strict';

  // ── Tweet store ────────────────────────────────────────────────────────────
  const tweetStore = new Map();

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isoToId(isoString) {
    return isoString
      .replace('T', '_')
      .replace(/:/g, '-')
      .slice(0, 19);
  }

  function mediaBasename(url, index = 0) {
    try {
      const u = new URL(url);
      if (u.hostname === 'pbs.twimg.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        const key = parts[parts.length - 1];
        const fmt = u.searchParams.get('format') || 'jpg';
        return `${key}.${fmt}`;
      }
      if (u.hostname === 'video.twimg.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || `video_${index}.mp4`;
      }
    } catch (_) { /* fall through */ }
    return `media_${index}`;
  }

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

  function parseMedia(article) {
    const media = [];

    function makeFilename(url, index) {
      return mediaBasename(url, index);
    }

    // ── Images ──
    article.querySelectorAll('a[href*="/photo/"]').forEach((a) => {
      const img = a.querySelector('img[src*="pbs.twimg.com/media"]');
      if (!img) return;
      const url = bestImageUrl(img.src);
      const filename = makeFilename(img.src, media.length);
      if (!media.find((m) => m.filename === filename)) {
        media.push({ type: 'image', url, filename });
      }
    });

    // ── Videos / GIFs ──
    article.querySelectorAll('video').forEach((video) => {
      const sources = Array.from(video.querySelectorAll('source'));
      let videoUrl = null;

      if (sources.length > 0) {
        videoUrl = sources[sources.length - 1].src;
      } else if (video.src) {
        videoUrl = video.src;
      }

      if (videoUrl) {
        const filename = makeFilename(videoUrl, media.length);
        if (!media.find((m) => m.filename === filename)) {
          media.push({ type: 'video', url: videoUrl, filename });
        }
      }

      if (video.poster && video.poster.includes('pbs.twimg.com')) {
        const filename = makeFilename(video.poster, media.length);
        if (!media.find((m) => m.filename === filename)) {
          media.push({ type: 'thumbnail', url: video.poster, filename });
        }
      }
    });

    return media;
  }

  function parseTweet(article) {
    const timeEl = article.querySelector('time[datetime]');
    if (!timeEl) return null;

    const isoTimestamp = timeEl.getAttribute('datetime');
    if (!isoTimestamp) return null;

    const id = isoToId(isoTimestamp);
    const timestamp = isoTimestamp;

    let username = '';
    let displayName = '';

    const statusLink = timeEl.closest('a[href*="/status/"]');
    if (statusLink) {
      const parts = statusLink.getAttribute('href').split('/');
      username = '@' + (parts[1] || '');
    }

    const nameEl = article.querySelector('[data-testid="User-Name"] span span');
    if (nameEl) {
      displayName = nameEl.textContent.trim();
    }

    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = textEl ? textEl.innerText.trim() : '';

    const tweetUrl = statusLink
      ? 'https://twitter.com' + statusLink.getAttribute('href')
      : '';

    const media = parseMedia(article);

    return { id, timestamp, author: username, displayName, text, tweetUrl, media };
  }

  // ── Core scan ──────────────────────────────────────────────────────────────

  function scanTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let newCount = 0;

    articles.forEach((article) => {
      const tweet = parseTweet(article);
      if (!tweet) return;

      const existing = tweetStore.get(tweet.id);

      if (existing) {
        // Tweet already stored — but if media was empty on first scan (images
        // hadn't loaded yet), try to fill it in now that src is available.
        if (existing.media.length === 0 && tweet.media.length > 0) {
          tweetStore.set(tweet.id, tweet);
          newCount++;
        }
        return;
      }

      tweetStore.set(tweet.id, tweet);
      newCount++;
    });

    if (newCount > 0) {
      notifyBackground();
    }
  }

  // ── Background communication ───────────────────────────────────────────────

  function notifyBackground() {
    browser.runtime.sendMessage({
      type: 'TWEETS_UPDATED',
      tweets: Array.from(tweetStore.values()),
      count: tweetStore.size,
    }).catch(() => {});
  }

  /**
   * Fetch a single media item from within the Twitter tab context so the
   * request carries the correct Referer + session cookies.
   *
   * Instead of passing the blob bytes over the message bus (which can hit
   * Firefox's ~64 MB message size limit), we:
   *   1. fetch() the image/video into a Blob
   *   2. create a local blob: URL (just a short string)
   *   3. send only that short URL to the background
   *   4. background calls browser.downloads.download() with the blob: URL —
   *      Firefox can read blob: URLs created in any context via the downloads API
   *
   * The blob URL is revoked by the background after the download is queued.
   */
  async function fetchMediaAsBlobUrl(url) {
    console.log('[TweetScraper] Fetching media:', url);
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    console.log('[TweetScraper] Created blob URL:', blobUrl, 'for', url);
    return blobUrl;
  }

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

      // Background asks us to fetch a media file and return a blob: URL.
      // We do this here so the fetch carries Twitter's Referer + cookies.
      case 'FETCH_MEDIA':
        fetchMediaAsBlobUrl(message.url)
          .then((blobUrl) => sendResponse({ ok: true, blobUrl }))
          .catch((err) => {
            console.error('[TweetScraper] FETCH_MEDIA failed:', err.message);
            sendResponse({ ok: false, error: err.message });
          });
        return true; // keep channel open for async response

      default:
        break;
    }
    return true;
  });

  // ── MutationObserver ───────────────────────────────────────────────────────

  let debounceTimer = null;

  function debouncedScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanTweets, 1000);
  }

  const observer = new MutationObserver((mutations) => {
    const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
    if (hasAddedNodes) debouncedScan();
  });

  observer.observe(document.body, { childList: true, subtree: true });


  // ── "Show more replies" click handler ─────────────────────────────────────
  // Twitter hides long threads behind a "Show more replies" button.
  // Clicking it injects new tweet nodes asynchronously. We listen for clicks
  // on those buttons and schedule a rescan shortly after — giving Twitter
  // enough time to inject the new nodes first. The MutationObserver will also
  // catch the insertion, but the explicit timer ensures we don't miss a batch
  // that loads just outside the debounce window.

  const SHOW_MORE_PATTERNS = [
    /show more repl/i,
    /show replies/i,
    /more repl/i,
  ];

  function isShowMoreButton(el) {
    const button = el.closest('button, [role="button"], a');
    if (!button) return false;
    const text = button.innerText || button.textContent || '';
    return SHOW_MORE_PATTERNS.some((re) => re.test(text));
  }

  document.addEventListener('click', (e) => {
    if (!isShowMoreButton(e.target)) return;
    // First pass: most replies load within 1.5s
    setTimeout(scanTweets, 1500);
    // Second pass: catch slower-loading replies
    setTimeout(scanTweets, 3500);
  }, { capture: true });

  // ── Initial scan ───────────────────────────────────────────────────────────
  scanTweets();

})();
