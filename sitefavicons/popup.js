// Site Favicons -- popup. Set / manage a custom favicon per host. The chosen icon
// is stored as a ready-to-use href (a data URL for emoji/letter/upload, or the URL
// itself) in storage.local under faviconMap[host]; the content script applies it.

const curfav = document.getElementById('curfav');
const hostEl = document.getElementById('host');
const unsupported = document.getElementById('unsupported');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const emojiInput = document.getElementById('emoji');
const fileInput = document.getElementById('file');
const urlInput = document.getElementById('url');
const letterBtn = document.getElementById('letter');
const openEditorBtn = document.getElementById('openEditor');
const saveBtn = document.getElementById('save');
const removeBtn = document.getElementById('remove');
const listEl = document.getElementById('list');

let host = '';
let activeTabId = null;
let pending = null; // the href we'll save

// When opened as a standalone window from the right-click menu, the target site
// comes in as params (the "active tab" would otherwise be this popup window).
const params = new URLSearchParams(location.search);
const paramHost = params.get('host');
const paramTabId = params.get('tabId');

// A file picker cannot be used from the action popup: opening the OS dialog takes
// focus, which closes the popup and destroys its JS before the file is read. So
// uploads happen in EDITOR_MODE -- this page opened as a real window instead.
const EDITOR_MODE = params.get('editor') === '1';

init();

async function init() {
  if (EDITOR_MODE) openEditorBtn.remove();
  else fileInput.remove();

  if (paramHost) {
    host = paramHost;
    hostEl.textContent = host;
    activeTabId = paramTabId ? Number(paramTabId) : null;
    if (activeTabId) {
      try {
        const t = await chrome.tabs.get(activeTabId);
        if (t && t.favIconUrl) curfav.src = t.favIconUrl;
      } catch (_) { /* ignore */ }
    }
  } else {
    let tab;
    try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_) { /* ignore */ }
    activeTabId = tab && tab.id;

    let url = null;
    try { url = tab && tab.url ? new URL(tab.url) : null; } catch (_) { /* ignore */ }

    if (!url || !/^https?:$/.test(url.protocol)) {
      hostEl.textContent = url ? url.hostname || url.protocol : '--';
      editor.hidden = true;
      unsupported.hidden = false;
    } else {
      host = url.host; // includes :port when non-default -> per-port dev icons
      hostEl.textContent = host;
      if (tab.favIconUrl) curfav.src = tab.favIconUrl;
    }
  }

  wire();
  await renderExisting();
  await renderList();
}

function wire() {
  emojiInput.addEventListener('input', () => {
    const v = emojiInput.value.trim();
    if (v) setPending(glyphFavicon(v));
  });
  urlInput.addEventListener('input', () => {
    const v = urlInput.value.trim();
    if (v) setPending(v);
  });
  if (EDITOR_MODE) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => setPending(await toIcon(String(r.result)));
      r.onerror = () => flash(saveBtn, 'Could not read file');
      r.readAsDataURL(f);
    });
  } else {
    openEditorBtn.addEventListener('click', openEditorWindow);
  }

  const lbl = iconLabel(host || 'Site');
  letterBtn.textContent = /^\d+$/.test(lbl) ? ('Use the port number (' + lbl + ')') : 'Use a colored letter';
  letterBtn.addEventListener('click', () => setPending(monogramFavicon(host || 'Site')));

  saveBtn.addEventListener('click', onSave);
  removeBtn.addEventListener('click', onRemove);
}

async function openEditorWindow() {
  const url = chrome.runtime.getURL('popup.html') +
    '?editor=1&host=' + encodeURIComponent(host) + (activeTabId ? '&tabId=' + activeTabId : '');
  try { await chrome.windows.create({ url, type: 'popup', width: 390, height: 700 }); } catch (e) { console.error(e); }
  window.close();
}

// Decode whatever was uploaded (webp / avif / svg / gif / png / jpg) and re-encode
// it as a small square PNG. Normalising here means the favicon always works and the
// stored data URL stays a few KB instead of megabytes.
function toIcon(dataUrl) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      if (!im.naturalWidth || !im.naturalHeight) return resolve(dataUrl); // e.g. sizeless SVG
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        const s = Math.min(64 / im.naturalWidth, 64 / im.naturalHeight);
        const w = Math.max(1, Math.round(im.naturalWidth * s));
        const h = Math.max(1, Math.round(im.naturalHeight * s));
        x.drawImage(im, (64 - w) / 2, (64 - h) / 2, w, h); // contain, centred
        resolve(c.toDataURL('image/png'));
      } catch (_) {
        resolve(dataUrl); // tainted or unsupported -> use as-is
      }
    };
    im.onerror = () => resolve(dataUrl);
    im.src = dataUrl;
  });
}

function setPending(href) {
  pending = href;
  preview.src = href;
  saveBtn.disabled = !host || !href;
}

async function getMap() {
  try { return (await chrome.storage.local.get('faviconMap')).faviconMap || {}; } catch (_) { return {}; }
}

async function renderExisting() {
  const map = await getMap();
  if (host && map[host]) {
    setPending(map[host]);
    removeBtn.hidden = false;
  }
}

async function onSave() {
  if (!host || !pending) return;
  const map = await getMap();
  map[host] = pending;
  await chrome.storage.local.set({ faviconMap: map });
  removeBtn.hidden = false;
  await renderList();

  // Apply right now. We can't rely on the content script being present: content
  // scripts are not injected into tabs that were already open when the extension
  // was installed/reloaded, so inject the swap directly.
  let applied = false;
  if (activeTabId) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: activeTabId }, func: applyHrefInPage, args: [pending] });
      applied = true;
    } catch (e) { console.error('[Site Favicons]', e); }
  }
  flash(saveBtn, applied ? 'Saved ✓' : 'Saved (reload page)');
}

// Injected: swap the page's icon link for ours.
function applyHrefInPage(href) {
  document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((n) => n.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  (document.head || document.documentElement).appendChild(link);
}

async function onRemove() {
  const map = await getMap();
  delete map[host];
  await chrome.storage.local.set({ faviconMap: map });
  removeBtn.hidden = true;
  await renderList();
  if (activeTabId) { try { await chrome.tabs.reload(activeTabId); } catch (_) { /* ignore */ } }
}

async function removeHost(h) {
  const map = await getMap();
  delete map[h];
  await chrome.storage.local.set({ faviconMap: map });
  if (h === host) removeBtn.hidden = true;
  await renderList();
}

async function renderList() {
  const map = await getMap();
  const hosts = Object.keys(map).sort();
  listEl.textContent = '';
  if (!hosts.length) {
    const e = document.createElement('div');
    e.className = 'list-empty';
    e.textContent = 'No custom favicons yet.';
    listEl.appendChild(e);
    return;
  }
  for (const h of hosts) {
    const row = document.createElement('div');
    row.className = 'list-row';
    const img = document.createElement('img');
    img.src = map[h];
    img.alt = '';
    const name = document.createElement('span');
    name.className = 'lh';
    name.textContent = h;
    if (h === host) name.textContent += '  (this site)';
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Remove ' + h;
    del.addEventListener('click', () => removeHost(h));
    row.appendChild(img);
    row.appendChild(name);
    row.appendChild(del);
    listEl.appendChild(row);
  }
}

function flash(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1200);
}

// ---- favicon drawing (same approach as MarkdownView) ----

function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}
function roundRect(x, px, py, w, h, r) {
  if (x.roundRect) { x.beginPath(); x.roundRect(px, py, w, h, r); return; }
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
// On a local dev host the port is the identity ("26715" beats a generic "L"), so
// show it. Elsewhere fall back to the first letter of the name.
function iconLabel(host) {
  const m = /^(.*?):(\d+)$/.exec(host || '');
  const name = (m ? m[1] : (host || '')).replace(/^\[|\]$/g, '');
  const port = m ? m[2] : '';
  const n = name.toLowerCase();
  const local = n === 'localhost' || n === '::1' || n === '0.0.0.0' ||
    /\.local$/.test(n) || /\.localhost$/.test(n) ||
    /^127\./.test(n) || /^10\./.test(n) || /^192\.168\./.test(n) || /^172\.(1[6-9]|2\d|3[01])\./.test(n);
  if (port && local) return port;
  return (name.replace(/^www\./, '').trim()[0] || 'S').toUpperCase();
}
function labelFont(label) {
  const L = label.length;
  return L >= 5 ? 19 : L === 4 ? 23 : L === 3 ? 29 : L === 2 ? 34 : 38;
}

function monogramFavicon(host) {
  const label = iconLabel(host);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  roundRect(x, 2, 2, 60, 60, 13);
  x.fillStyle = 'hsl(' + hashHue(host || 'site') + ', 55%, 46%)';
  x.fill();
  x.fillStyle = '#fff';
  x.font = 'bold ' + labelFont(label) + 'px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(label, 32, 34);
  return c.toDataURL('image/png');
}
function glyphFavicon(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const len = Array.from(text).length;
  x.font = (len > 1 ? 34 : 52) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 32, 36);
  return c.toDataURL('image/png');
}
