// Split Screen -- service worker.
// Opens the split page, and while a split tab is open, strips the response
// headers that stop sites being framed (X-Frame-Options, CSP frame-ancestors) --
// but ONLY for sub-frames inside that one tab, via a per-tab session rule. When
// the tab closes, the rule is removed. Nothing global, nothing persisted.

const FRAME_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'frame-options'
];

const SPLIT_URL = chrome.runtime.getURL('split.html');

chrome.action.onClicked.addListener(async (tab) => {
  // Seed the first pane with the page you launched from (if it can be framed).
  const current = tab && tab.url;
  const seed = current && /^(https?|file):/i.test(current) ? current : '';
  const url = SPLIT_URL + (seed ? '?first=' + encodeURIComponent(seed) : '');
  await chrome.tabs.create({ url });
});

// ---- right-click ("context") menu ----

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'split-page', title: 'Open this page in Split Screen', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'split-link', title: 'Open link in Split Screen', contexts: ['link'] });
  });
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url = '';
  if (info.menuItemId === 'split-link') url = info.linkUrl;
  else if (info.menuItemId === 'split-page') url = (tab && tab.url) || info.pageUrl;
  if (!url || !/^(https?|file):/i.test(url)) return;
  await addToSplit(url);
});

// Reuse an open Split Screen tab if there is one (add the page as a new pane);
// otherwise open a fresh split tab holding that page.
async function addToSplit(url) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (_) { /* ignore */ }
  const existing = tabs.find((t) => t.url && t.url.startsWith(SPLIT_URL));
  if (existing && typeof existing.id === 'number') {
    try {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
      await chrome.tabs.sendMessage(existing.id, { type: 'addPane', url });
      return;
    } catch (_) {
      // the split page was not ready to receive a message; fall through to open one
    }
  }
  await chrome.tabs.create({ url: SPLIT_URL + '?add=' + encodeURIComponent(url) });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'enableFraming') {
    const tabId = sender.tab && sender.tab.id;
    if (typeof tabId === 'number') {
      enableFraming(tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true; // keep the message channel open for the async response
    }
    sendResponse({ ok: false, error: 'no tab id' });
    return;
  }
  if (msg && msg.type === 'splitAlive') {
    const tabId = sender.tab && sender.tab.id;
    if (typeof tabId === 'number') recordSplit(tabId, msg.set);
    return; // no response needed
  }
});

async function enableFraming(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [{
      id: tabId,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: FRAME_HEADERS.map((header) => ({ header, operation: 'remove' }))
      },
      condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] }
    }]
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
  } catch (_) { /* rule may not exist */ }
  markSplitClosed(tabId);
});

// ---- survive extension reload / browser restart ----
// Reloading an unpacked extension closes its pages, so split tabs would vanish. We
// keep a record of open split tabs (with their encoded layout) and reopen them when
// the extension is (re)loaded or the browser starts.

async function getOpenSplits() {
  try { return (await chrome.storage.local.get('openSplits')).openSplits || {}; } catch (_) { return {}; }
}

async function recordSplit(tabId, setParam) {
  const map = await getOpenSplits();
  map[tabId] = { set: setParam || '', alive: true, ts: Date.now() };
  try { await chrome.storage.local.set({ openSplits: map }); } catch (_) { /* ignore */ }
}

async function markSplitClosed(tabId) {
  const map = await getOpenSplits();
  if (map[tabId]) {
    map[tabId].alive = false;
    map[tabId].ts = Date.now();
    try { await chrome.storage.local.set({ openSplits: map }); } catch (_) { /* ignore */ }
  }
}

async function reopenSplits() {
  const map = await getOpenSplits();
  const now = Date.now();
  // Reopen tabs that were alive, or closed within the last 15s (i.e. by this reload).
  const wanted = Object.values(map)
    .filter((e) => e && e.set && (e.alive || (now - (e.ts || 0) < 15000)))
    .map((e) => e.set);
  try { await chrome.storage.local.set({ openSplits: {} }); } catch (_) { /* reopened tabs re-register */ }
  if (!wanted.length) return;

  // Dedupe against split tabs the browser may have restored on startup.
  let present = new Set();
  try {
    const tabs = await chrome.tabs.query({});
    present = new Set(tabs
      .filter((t) => t.url && t.url.startsWith(SPLIT_URL))
      .map((t) => { try { return new URL(t.url).searchParams.get('set'); } catch (_) { return null; } })
      .filter(Boolean));
  } catch (_) { /* ignore */ }

  for (const set of wanted) {
    if (present.has(set)) continue;
    present.add(set);
    try { await chrome.tabs.create({ url: SPLIT_URL + '?set=' + set, active: false }); } catch (_) { /* ignore */ }
  }
}

chrome.runtime.onInstalled.addListener(reopenSplits);
chrome.runtime.onStartup.addListener(reopenSplits);
