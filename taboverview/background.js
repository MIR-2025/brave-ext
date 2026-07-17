// Tab Overview -- service worker.
// Real per-tab thumbnails aren't available on demand (captureVisibleTab only shoots
// the *visible* tab), so we capture a tab whenever you settle on it, downscale it,
// and cache it by tab id in session storage. The overview page shows the last-seen
// thumbnail for each tab, and a favicon fallback for tabs never viewed / not capturable.

const THUMB = 'thumb_';
const MAX_W = 360;
const SETTLE_MS = 700;         // also keeps us under captureVisibleTab's ~2/sec quota
const OVERVIEW_URL = chrome.runtime.getURL('tabs.html');

let timer = null;
let pending = null;

// Open (or focus) the overview tab; capture the tab you're leaving first so it's fresh.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) { try { await capture(tab.windowId, tab.id); } catch (_) { /* ignore */ } }
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url && t.url.startsWith(OVERVIEW_URL));
    if (existing && typeof existing.id === 'number') {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: OVERVIEW_URL });
    }
  } catch (e) { console.error('[Tab Overview]', e); }
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => schedule(windowId, tabId));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab && tab.active) schedule(tab.windowId, tabId);
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.storage.session.remove(THUMB + tabId).catch(() => {});
  const ov = await getOverview();
  if (ov && ov.tabId === tabId) { ov.alive = false; ov.ts = Date.now(); await setOverview(ov); }
});

// ---- survive extension reload / browser restart ----
// The overview is an extension page, so reloading the extension closes it. Track
// whether it was open and reopen it when the extension (re)loads or the browser starts.

async function getOverview() {
  try { return (await chrome.storage.local.get('overviewState')).overviewState || null; } catch (_) { return null; }
}
async function setOverview(s) {
  try { await chrome.storage.local.set({ overviewState: s }); } catch (_) { /* ignore */ }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'overviewAlive') {
    const tabId = sender.tab && sender.tab.id;
    setOverview({ alive: true, ts: Date.now(), tabId: typeof tabId === 'number' ? tabId : null });
  }
});

async function reopenOverview() {
  const ov = await getOverview();
  const now = Date.now();
  const should = ov && (ov.alive || (now - (ov.ts || 0) < 15000));
  await setOverview(null); // clear; the reopened page re-registers itself
  if (!should) return;
  try {
    const tabs = await chrome.tabs.query({});
    if (tabs.some((t) => t.url && t.url.startsWith(OVERVIEW_URL))) return; // already open / restored
  } catch (_) { /* ignore */ }
  try { await chrome.tabs.create({ url: OVERVIEW_URL, active: false }); } catch (_) { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(reopenOverview);
chrome.runtime.onStartup.addListener(reopenOverview);

function schedule(windowId, tabId) {
  clearTimeout(timer);
  pending = { windowId, tabId };
  timer = setTimeout(() => { if (pending) capture(pending.windowId, pending.tabId).catch(() => {}); }, SETTLE_MS);
}

async function capture(windowId, tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.active) return;
  const url = tab.url || '';
  if (!/^(https?|file):/i.test(url)) return;            // skip brave://, extension pages, etc.
  if (url.startsWith(OVERVIEW_URL)) return;             // don't thumbnail ourselves

  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
  const thumb = await downscale(shot);
  await chrome.storage.session.set({ [THUMB + tabId]: { dataUrl: thumb, url, ts: Date.now() } });
}

async function downscale(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_W / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
  return blobToDataUrl(out);
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  return 'data:' + (blob.type || 'image/jpeg') + ';base64,' + btoa(bin);
}
