// Site Favicons -- service worker.
// Right-click menu for setting a site's favicon, and the shared "draw + apply"
// injection used by both the menu and the popup.
//
// Note: Chromium extensions cannot add items to the TAB STRIP context menu --
// chrome.contextMenus has no "tab" context (that's a Firefox-only feature). So the
// menu lives on the page context: right-click anywhere on a page.

const EMOJI = ['⭐', '🔥', '🎨', '📧', '💻', '🐙', '📺', '🎵', '📚', '🛒', '💬', '🚀', '✅', '🔒', '🐛', '📝'];
const CTX = ['page', 'selection', 'link', 'image'];

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'sf-root', title: 'Site favicon', contexts: CTX });
    for (const e of EMOJI) {
      chrome.contextMenus.create({ id: 'sf-emoji-' + e, parentId: 'sf-root', title: e + '   set ' + e, contexts: CTX });
    }
    chrome.contextMenus.create({ id: 'sf-sep1', parentId: 'sf-root', type: 'separator', contexts: CTX });
    chrome.contextMenus.create({ id: 'sf-letter', parentId: 'sf-root', title: 'Auto icon (letter, or port on localhost)', contexts: CTX });
    chrome.contextMenus.create({ id: 'sf-more', parentId: 'sf-root', title: 'More... (image, URL, any emoji)', contexts: CTX });
    chrome.contextMenus.create({ id: 'sf-sep2', parentId: 'sf-root', type: 'separator', contexts: CTX });
    chrome.contextMenus.create({ id: 'sf-remove', parentId: 'sf-root', title: 'Remove custom favicon', contexts: CTX });
  });
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id || !tab.url) return;
  let host = '';
  try {
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return;
    host = u.host; // includes :port when non-default -> per-port dev icons
  } catch (_) { return; }

  const id = String(info.menuItemId);
  if (id.startsWith('sf-emoji-')) await applyAndStore(tab.id, host, { kind: 'emoji', value: id.slice('sf-emoji-'.length) });
  else if (id === 'sf-letter') await applyAndStore(tab.id, host, { kind: 'letter', value: host });
  else if (id === 'sf-remove') await removeFor(tab.id, host);
  else if (id === 'sf-more') await openEditor(tab, host);
});

async function applyAndStore(tabId, host, spec) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: drawApply, args: [spec] });
    const href = res && res.result;
    if (!href) return;
    const map = (await chrome.storage.local.get('faviconMap')).faviconMap || {};
    map[host] = href;
    await chrome.storage.local.set({ faviconMap: map });
  } catch (e) {
    console.error('[Site Favicons]', e);
  }
}

async function removeFor(tabId, host) {
  const map = (await chrome.storage.local.get('faviconMap')).faviconMap || {};
  delete map[host];
  await chrome.storage.local.set({ faviconMap: map });
  try { await chrome.tabs.reload(tabId); } catch (_) { /* ignore */ }
}

// Always a real window (never the action popup): a file picker can't be used from
// an action popup, because opening the OS dialog closes the popup.
async function openEditor(tab, host) {
  const tabId = tab && tab.id;
  const url = chrome.runtime.getURL('popup.html') + '?editor=1&host=' + encodeURIComponent(host) +
              (tabId ? '&tabId=' + tabId : '');
  try {
    await chrome.windows.create({ url, type: 'popup', width: 390, height: 700 });
    return true;
  } catch (e) {
    console.error('[Site Favicons] windows.create failed', e);
  }
  // Fallback: a normal tab always works, and a file picker is fine from a tab.
  // Better to land somewhere than to leave the user staring at nothing.
  try {
    await chrome.tabs.create({ url });
    return true;
  } catch (e) {
    console.error('[Site Favicons] tabs.create failed', e);
    return false;
  }
}

// ---- work requested by the popup ------------------------------------------
// The action popup is destroyed the instant it loses focus, and that kills any
// async work it had in flight -- chrome.windows.create never opens the window,
// a storage write never lands. (Same reason a file picker can't be used from it.)
// So the popup asks the service worker to do these instead: the worker isn't tied
// to popup focus, so the work actually completes even as the popup disappears.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) return sendResponse({ ok: false });

      if (msg.type === 'openEditor') {
        const ok = await openEditor({ id: msg.tabId }, msg.host);
        return sendResponse({ ok });   // report the truth so the popup can say so
      }

      if (msg.type === 'save') {
        const map = (await chrome.storage.local.get('faviconMap')).faviconMap || {};
        map[msg.host] = msg.href;
        await chrome.storage.local.set({ faviconMap: map });
        let applied = false;
        if (msg.tabId) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: msg.tabId }, func: applyHrefInPage, args: [msg.href]
            });
            applied = true;
          } catch (_) { /* tab gone or not scriptable */ }
        }
        return sendResponse({ ok: true, applied });
      }

      if (msg.type === 'remove') {
        const map = (await chrome.storage.local.get('faviconMap')).faviconMap || {};
        delete map[msg.host];
        await chrome.storage.local.set({ faviconMap: map });
        if (msg.tabId) { try { await chrome.tabs.reload(msg.tabId); } catch (_) { /* ignore */ } }
        return sendResponse({ ok: true });
      }

      sendResponse({ ok: false });
    } catch (e) {
      console.error('[Site Favicons]', e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;   // async response -- keep the message channel open
});

// Injected: swap the page's icon link for ours.
function applyHrefInPage(href) {
  document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    .forEach((n) => n.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  (document.head || document.documentElement).appendChild(link);
}

// Injected into the page: draw the icon, apply it, and return the data URL so we
// can store it. Runs in the page so emoji use the real system emoji font.
function drawApply(spec) {
  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
  }
  function rr(x, px, py, w, h, r) {
    if (x.roundRect) { x.beginPath(); x.roundRect(px, py, w, h, r); return; }
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (spec.kind === 'emoji') {
    const len = Array.from(spec.value).length;
    x.font = (len > 1 ? 34 : 52) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(spec.value, 32, 36);
  } else {
    // On a local dev host the port is the identity ("26715" beats a generic "L").
    const host = String(spec.value || 'S');
    const m = /^(.*?):(\d+)$/.exec(host);
    const name = (m ? m[1] : host).replace(/^\[|\]$/g, '');
    const port = m ? m[2] : '';
    const n = name.toLowerCase();
    const local = n === 'localhost' || n === '::1' || n === '0.0.0.0' ||
      /\.local$/.test(n) || /\.localhost$/.test(n) ||
      /^127\./.test(n) || /^10\./.test(n) || /^192\.168\./.test(n) || /^172\.(1[6-9]|2\d|3[01])\./.test(n);
    const label = (port && local) ? port : ((name.replace(/^www\./, '').trim()[0] || 'S').toUpperCase());
    const L = label.length;
    const size = L >= 5 ? 19 : L === 4 ? 23 : L === 3 ? 29 : L === 2 ? 34 : 38;

    rr(x, 2, 2, 60, 60, 13);
    x.fillStyle = 'hsl(' + hashHue(host) + ', 55%, 46%)';
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold ' + size + 'px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, 32, 34);
  }
  const href = c.toDataURL('image/png');
  document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((n) => n.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  (document.head || document.documentElement).appendChild(link);
  return href;
}
