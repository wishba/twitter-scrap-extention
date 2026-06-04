(() => {
  'use strict';

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const counterValue = document.getElementById('counterValue');
  const counterSub   = document.getElementById('counterSub');
  const statusDot    = document.getElementById('statusDot');
  const btnDownload  = document.getElementById('btnDownload');
  const btnClear     = document.getElementById('btnClear');
  const toast        = document.getElementById('toast');
  const toastMsg     = document.getElementById('toastMsg');
  const toastIcon    = document.getElementById('toastIcon');

  // ── SVG icon paths ─────────────────────────────────────────────────────────
  const ICON_CHECK = '<polyline points="20 6 9 17 4 12"/>';
  const ICON_X     = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

  // ── State ──────────────────────────────────────────────────────────────────
  let toastTimer = null;

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function setCount(n) {
    counterValue.textContent = n;
    counterValue.classList.toggle('zero', n === 0);

    if (n === 0) {
      counterSub.textContent = 'Scroll your feed to capture tweets';
      statusDot.classList.remove('active');
    } else {
      counterSub.textContent = `${n} tweet${n === 1 ? '' : 's'} ready to download`;
      statusDot.classList.add('active');
    }

    btnDownload.disabled = n === 0;
    btnClear.disabled    = n === 0;
  }

  function showToast(type, message) {
    clearTimeout(toastTimer);
    toast.className = `toast show ${type}`;
    toastIcon.innerHTML = type === 'success' ? ICON_CHECK : ICON_X;
    toastMsg.textContent = message;
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  function setLoading(button, loading) {
    button.disabled = loading;
    // Dim the other button too so only one action runs at a time
    const other = button === btnDownload ? btnClear : btnDownload;
    other.disabled = loading;
  }

  // ── Background messaging ───────────────────────────────────────────────────

  function sendMessage(msg) {
    return browser.runtime.sendMessage(msg);
  }

  // ── Initialise: fetch current count ───────────────────────────────────────

  async function init() {
    try {
      const res = await sendMessage({ type: 'GET_TWEETS' });
      setCount(res?.count ?? 0);
    } catch (_) {
      setCount(0);
    }
  }

  // ── Download ───────────────────────────────────────────────────────────────

  btnDownload.addEventListener('click', async () => {
    setLoading(btnDownload, true);
    btnDownload.textContent = 'Downloading…';

    try {
      const res = await sendMessage({ type: 'DOWNLOAD' });

      if (res?.success) {
        showToast('success', `Downloaded ${res.count} tweet${res.count === 1 ? '' : 's'}`);
      } else {
        showToast('error', res?.error || 'Download failed.');
      }
    } catch (err) {
      showToast('error', 'Could not reach background script.');
    } finally {
      // Restore button label and re-fetch count
      btnDownload.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download JSON + media`;
      const res = await sendMessage({ type: 'GET_TWEETS' }).catch(() => null);
      setCount(res?.count ?? 0);
    }
  });

  // ── Clear ──────────────────────────────────────────────────────────────────

  btnClear.addEventListener('click', async () => {
    setLoading(btnClear, true);

    try {
      await sendMessage({ type: 'CLEAR_TWEETS' });
      setCount(0);
      showToast('success', 'Tweet store cleared.');
    } catch (_) {
      showToast('error', 'Could not clear tweets.');
    } finally {
      setLoading(btnClear, false);
    }
  });

  // ── Boot ───────────────────────────────────────────────────────────────────
  init();

})();
