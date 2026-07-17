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
    chrome.contextMenus.create({ id: 'sf-letter', parentId: 'sf-root', title: 'Use a colored letter', contexts: CTX });
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
    host = u.hostname;
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
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html') + '?editor=1&host=' + encodeURIComponent(host) + '&tabId=' + tab.id,
      type: 'popup',
      width: 390,
      height: 700
    });
  } catch (e) { console.error('[Site Favicons]', e); }
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
    const t = String(spec.value || 'S').replace(/^www\./, '');
    rr(x, 2, 2, 60, 60, 13);
    x.fillStyle = 'hsl(' + hashHue(t) + ', 55%, 46%)';
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 38px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText((t.trim()[0] || 'S').toUpperCase(), 32, 35);
  }
  const href = c.toDataURL('image/png');
  document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((n) => n.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  (document.head || document.documentElement).appendChild(link);
  return href;
}
