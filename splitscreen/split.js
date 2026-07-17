// Split Screen -- the split page.
// Arbitrary R x C grids of live pages, each pane resizable via draggable gutters.
// The whole layout (grid shape, sizes, pane URLs, name) is encoded into this tab's
// URL so you can bookmark a set with Ctrl+D; the tab wears the first pane's favicon.
// Header stripping (so sites load in a frame) is done by the service worker.

const container = document.getElementById('panes');
const addBtn = document.getElementById('addPane');
const gridBtn = document.getElementById('gridBtn');
const gridLabel = document.getElementById('gridLabel');
const gridPicker = document.getElementById('gridPicker');
const nameInput = document.getElementById('setName');
const copyBtn = document.getElementById('copyLink');
const saveBtn = document.getElementById('saveSet');
const bookmarksEl = document.getElementById('bookmarks');
const favicon = document.getElementById('favicon');

let savedSets = [];

const MAX_TRACKS = 6;
const MIN_SIZE = 80;

const panes = [];        // arbitrary length, row-major
let cols = 2;            // number of columns; rows derive from panes.length
let colSizes = [1, 1];   // fr weight per column
let rowSizes = [1];      // fr weight per row
let setName = '';
let building = false;    // suppress persistence while bulk-building

function rowCount() { return Math.max(1, Math.ceil(panes.length / cols)); }

// Enable framing for this tab before loading any URL.
const framingReady = (async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'enableFraming' });
    return !!(res && res.ok);
  } catch (e) {
    console.error('[Split Screen] could not enable framing', e);
    return false;
  }
})();

addBtn.addEventListener('click', () => {
  const p = createPaneObj();
  relayout();
  save();
  p.urlInput.focus();
});
gridBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleGridPicker(); });
nameInput.addEventListener('input', () => { setName = nameInput.value; save(); });
copyBtn.addEventListener('click', onCopyLink);
saveBtn.addEventListener('click', saveCurrentSet);

initBookmarks();

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.tab-menu') && !e.target.closest('.tabs')) closeMenus();
  if (!e.target.closest('.grid-picker') && !e.target.closest('#gridBtn')) gridPicker.hidden = true;
});

// The service worker asks us to add a pane when you use the right-click menu.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'addPane' && msg.url) fillFirstEmpty(msg.url);
});

// Keep the open-tab lists fresh as tabs come and go.
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAllTabLists, 250);
}
try {
  chrome.tabs.onCreated.addListener(scheduleRefresh);
  chrome.tabs.onRemoved.addListener(scheduleRefresh);
} catch (_) { /* events unavailable */ }

buildGridPicker();
restore();

// ---- panes ----

function createPaneObj() {
  const el = document.createElement('div');
  el.className = 'pane';
  el.innerHTML =
    '<div class="pane-bar">' +
      '<button class="icon reload" title="Reload">↻</button>' +
      '<input class="url" type="text" spellcheck="false" placeholder="Enter a URL or search, then press Enter">' +
      '<button class="icon tabs" title="Choose an open tab">☰</button>' +
      '<button class="icon open" title="Open in a new tab">↗</button>' +
      '<button class="icon close" title="Remove pane">✕</button>' +
      '<div class="tab-menu" hidden><div class="tablist"></div></div>' +
    '</div>' +
    '<div class="frame-wrap empty-state">' +
      '<iframe sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation" allow="fullscreen; autoplay; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      '<div class="empty"><div class="empty-inner">' +
        '<p class="empty-hint">Type a URL above, or pick an open tab:</p>' +
        '<div class="tablist"></div>' +
      '</div></div>' +
    '</div>';

  const menu = el.querySelector('.tab-menu');
  const pane = {
    el,
    url: '',
    iframe: el.querySelector('iframe'),
    urlInput: el.querySelector('.url'),
    wrap: el.querySelector('.frame-wrap'),
    menu,
    menuList: menu.querySelector('.tablist'),
    overlayList: el.querySelector('.frame-wrap .tablist')
  };
  el.__pane = pane;
  pane.menuList.__pane = pane;
  pane.overlayList.__pane = pane;

  el.querySelector('.reload').addEventListener('click', () => reload(pane));
  el.querySelector('.open').addEventListener('click', () => { if (pane.url) window.open(pane.url, '_blank'); });
  el.querySelector('.close').addEventListener('click', () => removePane(pane));
  el.querySelector('.tabs').addEventListener('click', () => toggleMenu(pane));
  pane.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(pane, pane.urlInput.value);
  });

  container.appendChild(el);
  panes.push(pane);
  renderTabList(pane.overlayList, pane);
  return pane;
}

function removePane(pane) {
  if (panes.length <= 1) { clearPane(pane); return; }
  const idx = panes.indexOf(pane);
  if (idx === -1) return;
  panes.splice(idx, 1);
  pane.el.remove();
  relayout();
  save();
}

function clearPane(pane) {
  pane.url = '';
  pane.urlInput.value = '';
  pane.iframe.src = 'about:blank';
  pane.wrap.classList.add('empty-state');
  renderTabList(pane.overlayList, pane);
  save();
}

async function navigate(pane, raw) {
  const url = normalizeUrl(raw);
  if (!url) return;
  await framingReady;
  pane.url = url;
  pane.urlInput.value = url;
  pane.wrap.classList.remove('empty-state');
  pane.iframe.src = url;
  closeMenus();
  save();
}

function reload(pane) {
  if (pane.url) pane.iframe.src = pane.url; // reassigning src reloads the frame
}

function fillFirstEmpty(url) {
  let pane = panes.find((p) => !p.url);
  if (!pane) { const p = createPaneObj(); relayout(); pane = p; }
  navigate(pane, url);
}

// ---- grid layout ----

function applyGrid(newCols, targetPanes) {
  cols = Math.max(1, Math.min(MAX_TRACKS, newCols));
  if (targetPanes) {
    while (panes.length < targetPanes) createPaneObj();
    // only trim trailing EMPTY panes -- never drop a loaded page
    while (panes.length > targetPanes && !panes[panes.length - 1].url) {
      const p = panes.pop();
      p.el.remove();
    }
  }
  relayout();
  save();
}

function relayout() {
  ensureSizes();
  applyTemplate();
  placePanes();
  buildGutters();
  gridLabel.textContent = cols + ' × ' + rowCount();
}

function ensureSizes() {
  colSizes = fitSizes(colSizes, cols);
  rowSizes = fitSizes(rowSizes, rowCount());
}
function fitSizes(arr, n) {
  const out = (arr || []).slice(0, n).map((x) => (x > 0 ? x : 1));
  while (out.length < n) out.push(1);
  return out;
}

function trackList(sizes) {
  const parts = [];
  for (let i = 0; i < sizes.length; i++) {
    parts.push(sizes[i] + 'fr');
    if (i < sizes.length - 1) parts.push('6px');
  }
  return parts.join(' ');
}
function applyTemplate() {
  container.style.gridTemplateColumns = trackList(colSizes);
  container.style.gridTemplateRows = trackList(rowSizes);
}

function placePanes() {
  for (let i = 0; i < panes.length; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    panes[i].el.style.gridColumn = String(2 * c + 1);
    panes[i].el.style.gridRow = String(2 * r + 1);
  }
}

function buildGutters() {
  container.querySelectorAll('.gutter').forEach((g) => g.remove());
  const rows = rowCount();
  for (let k = 0; k < cols - 1; k++) {
    const g = makeGutter('col', k);
    g.style.gridColumn = String(2 * k + 2);
    g.style.gridRow = '1 / -1';
    container.appendChild(g);
  }
  for (let k = 0; k < rows - 1; k++) {
    const g = makeGutter('row', k);
    g.style.gridRow = String(2 * k + 2);
    g.style.gridColumn = '1 / -1';
    container.appendChild(g);
  }
}

function makeGutter(kind, index) {
  const g = document.createElement('div');
  g.className = 'gutter ' + kind;
  g.addEventListener('mousedown', (e) => onGutterDown(kind, index, e));
  return g;
}

function onGutterDown(kind, k, e) {
  e.preventDefault();
  const horizontal = kind === 'col';
  const sizes = horizontal ? colSizes : rowSizes;
  if (k + 1 >= sizes.length) return;

  const containerPx = horizontal ? container.clientWidth : container.clientHeight;
  const gutterPx = (sizes.length - 1) * 6;
  const avail = Math.max(1, containerPx - gutterPx);
  const sumFr = sizes.reduce((a, b) => a + b, 0);
  const pxPerFr = avail / sumFr;

  const totalFr = sizes[k] + sizes[k + 1];
  const combinedPx = totalFr * pxPerFr;
  const start = horizontal ? e.clientX : e.clientY;
  const startKpx = sizes[k] * pxPerFr;

  document.body.classList.add('dragging', horizontal ? 'col-resize' : 'row-resize');

  function move(ev) {
    const pos = horizontal ? ev.clientX : ev.clientY;
    let newK = startKpx + (pos - start);
    newK = Math.max(MIN_SIZE, Math.min(combinedPx - MIN_SIZE, newK));
    sizes[k] = totalFr * (newK / combinedPx);
    sizes[k + 1] = totalFr - sizes[k];
    applyTemplate();
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('dragging', 'col-resize', 'row-resize');
    save();
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

// ---- grid-size picker ----

function buildGridPicker() {
  const grid = document.createElement('div');
  grid.className = 'gp-grid';
  const label = document.createElement('div');
  label.className = 'gp-label';
  label.textContent = 'Pick a grid';
  const cells = [];

  for (let r = 1; r <= MAX_TRACKS; r++) {
    for (let c = 1; c <= MAX_TRACKS; c++) {
      const cell = document.createElement('div');
      cell.className = 'gp-cell';
      cell.dataset.c = String(c);
      cell.dataset.r = String(r);
      cell.addEventListener('mouseenter', () => {
        for (const x of cells) {
          x.classList.toggle('on', Number(x.dataset.c) <= c && Number(x.dataset.r) <= r);
        }
        label.textContent = c + ' × ' + r;
      });
      cell.addEventListener('click', () => {
        applyGrid(c, c * r);
        gridPicker.hidden = true;
      });
      grid.appendChild(cell);
      cells.push(cell);
    }
  }
  gridPicker.appendChild(grid);
  gridPicker.appendChild(label);
}

function toggleGridPicker() {
  closeMenus();
  gridPicker.hidden = !gridPicker.hidden;
}

// ---- open-tabs picker ----

function toggleMenu(pane) {
  const wasOpen = !pane.menu.hidden;
  closeMenus();
  if (!wasOpen) {
    pane.menu.hidden = false;
    renderTabList(pane.menuList, pane);
  }
}
function closeMenus() {
  for (const p of panes) if (p.menu) p.menu.hidden = true;
}

async function renderTabList(target, pane) {
  target.textContent = 'Loading tabs...';
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) { target.textContent = 'Could not read open tabs.'; return; }
  fillTabList(target, pane, tabs);
}

function fillTabList(target, pane, tabs) {
  const selfPrefix = chrome.runtime.getURL('');
  const list = tabs.filter((t) => t.url && /^(https?|file):/i.test(t.url) && !t.url.startsWith(selfPrefix));
  target.textContent = '';
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'tab-empty';
    p.textContent = 'No open tabs to show.';
    target.appendChild(p);
    return;
  }
  for (const t of list) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tab-row';

    const fav = document.createElement('img');
    fav.className = 'fav';
    fav.width = 16;
    fav.height = 16;
    fav.referrerPolicy = 'no-referrer';
    fav.onerror = () => { fav.style.visibility = 'hidden'; };
    if (t.favIconUrl && /^(https?|data):/i.test(t.favIconUrl)) fav.src = t.favIconUrl;
    else fav.style.visibility = 'hidden';

    const text = document.createElement('span');
    text.className = 'tab-text';
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = t.title || t.url;
    const url = document.createElement('span');
    url.className = 'tab-url';
    url.textContent = prettyUrl(t.url);
    text.appendChild(title);
    text.appendChild(url);

    row.appendChild(fav);
    row.appendChild(text);
    row.addEventListener('click', () => navigate(pane, t.url));
    target.appendChild(row);
  }
}

async function refreshAllTabLists() {
  const lists = document.querySelectorAll('.tablist');
  if (!lists.length) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (_) { return; }
  for (const el of lists) if (el.__pane) fillTabList(el, el.__pane, tabs);
}

function prettyUrl(u) {
  return String(u).replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// ---- url handling ----

function normalizeUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^(about:|chrome:|brave:|edge:|view-source:)/i.test(raw)) return raw;
  if (!/\s/.test(raw) && /^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(raw)) return 'https://' + raw;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(raw);
}

// ---- the tab's identity: favicon (first pane) + title ----

function faviconHref(pageUrl) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', '32');
  return u.toString();
}
function domainOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}
function updateIdentity() {
  const first = panes.find((p) => p.url);
  favicon.href = first ? faviconHref(first.url) : 'icons/icon32.png';

  const domains = [...new Set(panes.map((p) => p.url).filter(Boolean).map(domainOf).filter(Boolean))];
  document.title = setName || (domains.length ? domains.slice(0, 3).join(' | ') : 'Split Screen');
}

// ---- persistence + bookmarkable URL ----

function snapshot() {
  return {
    c: cols,
    cs: colSizes.map((x) => Math.round(x * 1000) / 1000),
    rs: rowSizes.map((x) => Math.round(x * 1000) / 1000),
    n: setName,
    u: panes.map((p) => p.url || '')
  };
}

let aliveTimer = null;
function notifyAlive(enc) {
  clearTimeout(aliveTimer);
  aliveTimer = setTimeout(() => {
    try { chrome.runtime.sendMessage({ type: 'splitAlive', set: enc }); } catch (_) { /* ignore */ }
  }, 400);
}

function save() {
  if (building) return;
  const snap = snapshot();
  try { chrome.storage.local.set({ splitState: snap }); } catch (_) { /* ignore */ }
  let enc = '';
  try {
    enc = b64urlEncode(JSON.stringify(snap));
    history.replaceState(null, '', location.pathname + '?set=' + enc);
  } catch (_) { /* ignore */ }
  if (enc) notifyAlive(enc);           // let the worker record this tab so a reload can reopen it
  updateIdentity();
  updateActiveChips();
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(b) {
  b = b.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function buildFromSnapshot(snap, firstOverride) {
  cols = Math.max(1, Math.min(MAX_TRACKS, snap.c || 2));
  setName = snap.n || '';
  nameInput.value = setName;
  const urls = Array.isArray(snap.u) ? snap.u : [];
  const count = Math.max(1, urls.length);
  for (let i = 0; i < count; i++) createPaneObj();
  colSizes = fitSizes(snap.cs, cols);
  rowSizes = fitSizes(snap.rs, rowCount());
  relayout();
  urls.forEach((u, i) => {
    const target = (i === 0 && firstOverride) ? firstOverride : u;
    if (target) navigate(panes[i], target);
  });
}

async function restore() {
  building = true;
  const params = new URLSearchParams(location.search);
  const setParam = params.get('set');
  const first = params.get('first') || '';   // page you launched from
  const add = params.get('add') || '';        // page sent from the right-click menu

  let loaded = false;
  if (setParam) {
    try { buildFromSnapshot(JSON.parse(b64urlDecode(setParam)), first); loaded = true; } catch (_) { /* fall through */ }
  }
  if (!loaded) {
    let snap = null;
    try { snap = (await chrome.storage.local.get('splitState')).splitState; } catch (_) { /* ignore */ }
    if (snap && Array.isArray(snap.u) && snap.u.length) {
      buildFromSnapshot(snap, first);
    } else {
      cols = 2;
      createPaneObj();
      createPaneObj();
      colSizes = [1, 1];
      rowSizes = [1];
      relayout();
      if (first) navigate(panes[0], first);
    }
  }

  building = false;
  if (add) fillFirstEmpty(add);
  save();
}

// ---- saved sets (in-extension bookmarks bar) ----

async function initBookmarks() {
  try { savedSets = (await chrome.storage.local.get('savedSets')).savedSets || []; } catch (_) { savedSets = []; }
  if (!Array.isArray(savedSets)) savedSets = [];
  renderBookmarks();
}

function persistSaved() {
  try { chrome.storage.local.set({ savedSets }); } catch (_) { /* ignore */ }
}

function saveCurrentSet() {
  const snap = snapshot();
  const firstDom = (() => { const p = panes.find((x) => x.url); return p ? domainOf(p.url) : ''; })();
  const name = String(setName || firstDom || 'Set').trim().slice(0, 40) || 'Set';
  savedSets.push({ id: 'set_' + Date.now(), name, snap });
  persistSaved();
  renderBookmarks();
}

function deleteSet(id) {
  savedSets = savedSets.filter((s) => s.id !== id);
  persistSaved();
  renderBookmarks();
}

function firstUrlOf(snap) {
  return (snap && Array.isArray(snap.u) ? snap.u.find(Boolean) : '') || '';
}

function renderBookmarks() {
  bookmarksEl.textContent = '';
  const label = document.createElement('span');
  label.className = 'bm-label';
  label.textContent = 'Saved:';
  bookmarksEl.appendChild(label);

  if (!savedSets.length) {
    const e = document.createElement('span');
    e.className = 'bm-empty';
    e.textContent = 'none yet -- build a layout and hit ★ Save';
    bookmarksEl.appendChild(e);
    return;
  }

  for (const s of savedSets) {
    const chip = document.createElement('div');
    chip.className = 'bm-chip' + (s.name === setName && setName ? ' active' : '');
    chip.dataset.name = s.name;
    chip.title = 'Open "' + s.name + '"';

    const fav = document.createElement('img');
    fav.referrerPolicy = 'no-referrer';
    const fu = firstUrlOf(s.snap);
    fav.src = fu ? faviconHref(fu) : 'icons/icon32.png';
    fav.onerror = () => { fav.src = 'icons/icon32.png'; };

    const nm = document.createElement('span');
    nm.className = 'bm-name';
    nm.textContent = s.name;

    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '✕';
    x.title = 'Remove';
    x.addEventListener('click', (e) => { e.stopPropagation(); deleteSet(s.id); });

    chip.appendChild(fav);
    chip.appendChild(nm);
    chip.appendChild(x);
    chip.addEventListener('click', () => loadSet(s.snap));
    bookmarksEl.appendChild(chip);
  }
}

function updateActiveChips() {
  for (const chip of bookmarksEl.querySelectorAll('.bm-chip')) {
    chip.classList.toggle('active', !!setName && chip.dataset.name === setName);
  }
}

function loadSet(snap) {
  building = true;
  for (const p of panes) p.el.remove();
  panes.length = 0;
  container.querySelectorAll('.gutter').forEach((g) => g.remove());
  buildFromSnapshot(snap);
  building = false;
  save();
  renderBookmarks();
}

// ---- copy bookmarkable link ----

async function onCopyLink() {
  const original = copyBtn.textContent;
  try {
    await navigator.clipboard.writeText(location.href);
    copyBtn.textContent = 'Copied ✓';
  } catch (e) {
    console.error(e);
    copyBtn.textContent = 'Copy failed';
  }
  setTimeout(() => { copyBtn.textContent = original; }, 1500);
}
