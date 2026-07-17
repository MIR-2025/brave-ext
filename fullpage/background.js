// FullPage -- service worker.
// On toolbar click: scroll the active tab in viewport-sized steps, capture each
// step with captureVisibleTab, stitch them onto one OffscreenCanvas, then open a
// result tab that offers PNG / PDF / clipboard export. Everything stays local.

const CAPTURE_DELAY_MS = 500;        // stay under captureVisibleTab's ~2/sec quota
const SETTLE_MS = 120;               // let the page repaint after each scroll
const MAX_DIM = 16384;               // max canvas edge most engines allow
const MAX_AREA = 256 * 1024 * 1024;  // conservative max canvas area, in pixels

chrome.action.onClicked.addListener((tab) => {
  run(tab).catch((err) => fail(tab, err));
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function inject(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res && res.result;
}

async function badge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text, tabId });
  } catch (_) { /* tab may be gone */ }
}

async function captureWithRetry(windowId, attempt = 0) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (attempt < 6 && /quota|MAX_CAPTURE|not ready|being captured|cannot access/i.test(msg)) {
      await wait(700);
      return captureWithRetry(windowId, attempt + 1);
    }
    throw e;
  }
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return 'data:' + blob.type + ';base64,' + btoa(bin);
}

async function run(tab) {
  if (!tab || !tab.id) return;
  await badge(tab.id, '..', '#4c8bf5');

  const m = await inject(tab.id, pageMetrics);
  if (!m) throw new Error('Could not read the page (a restricted page such as brave:// cannot be captured).');

  await inject(tab.id, prepPage);

  const dpr = m.dpr;
  const vw = m.viewportWidth;
  const vh = m.viewportHeight;
  const cols = Math.max(1, Math.ceil(m.totalWidth / vw));
  const rows = Math.max(1, Math.ceil(m.totalHeight / vh));

  const fullW = m.totalWidth * dpr;
  const fullH = m.totalHeight * dpr;
  // Shrink to fit engine canvas limits if the page is enormous.
  const fit = Math.min(1, MAX_DIM / fullW, MAX_DIM / fullH, Math.sqrt(MAX_AREA / (fullW * fullH)));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.floor(fullW * fit)),
    Math.max(1, Math.floor(fullH * fit))
  );
  const ctx = canvas.getContext('2d');

  let first = true;
  let done = 0;
  const total = cols * rows;

  try {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pos = await inject(tab.id, scrollToCell, [col * vw, row * vh, !first]);
        await wait(SETTLE_MS);

        const dataUrl = await captureWithRetry(tab.windowId);
        const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());

        const sw = vw * dpr;           // crop to client width -> drops the scrollbar strip
        const sh = vh * dpr;
        const dx = pos.scrollX * dpr * fit;
        const dy = pos.scrollY * dpr * fit;
        ctx.drawImage(bmp, 0, 0, sw, sh, dx, dy, sw * fit, sh * fit);
        bmp.close();

        first = false;
        done++;
        await badge(tab.id, Math.round((done / total) * 100) + '%', '#4c8bf5');
        if (done < total) await wait(CAPTURE_DELAY_MS);
      }
    }
  } finally {
    await inject(tab.id, restorePage, [m.originalScrollX, m.originalScrollY]).catch(() => {});
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await blobToDataUrl(blob);

  // Keep only the latest capture in storage.
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith('cap_'));
  if (stale.length) await chrome.storage.local.remove(stale);

  const id = 'cap_' + Date.now();
  await chrome.storage.local.set({
    [id]: {
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      title: tab.title || 'screenshot',
      pageUrl: tab.url || '',
      scaled: fit < 1
    }
  });

  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') + '?id=' + id });
  await badge(tab.id, '', '#4c8bf5');
}

async function fail(tab, err) {
  console.error('[FullPage]', err);
  const tabId = tab && tab.id;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#e0503a' });
    await chrome.action.setBadgeText({ text: 'ERR', tabId });
    await chrome.action.setTitle({ tabId, title: 'FullPage: ' + ((err && err.message) || err) });
  } catch (_) { /* ignore */ }
}

// ---- functions injected into the page (must be self-contained) ----

function pageMetrics() {
  const de = document.documentElement;
  const b = document.body;
  return {
    totalWidth: Math.max(de.scrollWidth, b ? b.scrollWidth : 0, de.clientWidth),
    totalHeight: Math.max(de.scrollHeight, b ? b.scrollHeight : 0, de.clientHeight),
    viewportWidth: de.clientWidth,
    viewportHeight: de.clientHeight,
    dpr: window.devicePixelRatio || 1,
    originalScrollX: window.scrollX,
    originalScrollY: window.scrollY
  };
}

function prepPage() {
  const de = document.documentElement;
  const state = { scrollBehavior: de.style.scrollBehavior, fixed: [] };
  de.style.scrollBehavior = 'auto';
  const nodes = document.querySelectorAll('body *');
  for (const el of nodes) {
    const p = getComputedStyle(el).position;
    if (p === 'fixed' || p === 'sticky') state.fixed.push({ el, vis: el.style.visibility });
  }
  window.__FP = state;
}

function scrollToCell(x, y, hideFixed) {
  window.scrollTo(x, y);
  const st = window.__FP;
  if (st) {
    for (const f of st.fixed) {
      f.el.style.visibility = hideFixed ? 'hidden' : (f.vis || '');
    }
  }
  return { scrollX: window.scrollX, scrollY: window.scrollY };
}

function restorePage(x, y) {
  const st = window.__FP;
  if (st) {
    for (const f of st.fixed) f.el.style.visibility = f.vis || '';
    document.documentElement.style.scrollBehavior = st.scrollBehavior || '';
    delete window.__FP;
  }
  window.scrollTo(x, y);
}
