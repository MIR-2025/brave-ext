// Split Screen -- the split page. Manages panes, the draggable divider, the
// layout direction, an open-tabs picker, and remembers your last session.
// Header stripping (so sites will load in a frame) is handled by the service
// worker for this tab only.

const container = document.getElementById('panes');
const addBtn = document.getElementById('addPane');
const toggleDirBtn = document.getElementById('toggleDir');

const MAX_PANES = 50; // effectively arbitrary; a guard against runaways
const MIN_SIZE = 80;

const panes = [];
let direction = 'row'; // 'row' = side by side, 'column' = stacked

// Ask the service worker to strip frame-blocking headers for this tab, and wait
// for it before loading any URL so the very first request is covered.
const framingReady = (async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'enableFraming' });
    return !!(res && res.ok);
  } catch (e) {
    console.error('[Split Screen] could not enable framing', e);
    return false;
  }
})();

addBtn.addEventListener('click', () => addPane(''));
toggleDirBtn.addEventListener('click', () => setDirection(direction === 'row' ? 'column' : 'row'));

// Close any open tab menu when clicking elsewhere.
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.tab-menu') && !e.target.closest('.tabs')) closeMenus();
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

// The service worker asks us to add a pane when you use the right-click menu
// while this split tab is already open.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'addPane' && msg.url) addPane(msg.url);
});

restore();

// ---- panes ----

function createPane(weight) {
  const el = document.createElement('div');
  el.className = 'pane';
  el.style.flexGrow = String(weight);
  el.innerHTML =
    '<div class="pane-bar">' +
      '<button class="icon reload" title="Reload">↻</button>' +
      '<input class="url" type="text" spellcheck="false" placeholder="Enter a URL or search, then press Enter">' +
      '<button class="icon tabs" title="Choose an open tab">☰</button>' +
      '<button class="icon open" title="Open in a new tab">↗</button>' +
      '<button class="icon close" title="Close pane">✕</button>' +
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
  const menuList = menu.querySelector('.tablist');
  const overlayList = el.querySelector('.frame-wrap .tablist');

  const pane = {
    el,
    weight,
    url: '',
    iframe: el.querySelector('iframe'),
    urlInput: el.querySelector('.url'),
    wrap: el.querySelector('.frame-wrap'),
    menu,
    menuList,
    overlayList
  };
  el.__pane = pane;
  menuList.__pane = pane;
  overlayList.__pane = pane;

  el.querySelector('.reload').addEventListener('click', () => reload(pane));
  el.querySelector('.open').addEventListener('click', () => {
    if (pane.url) window.open(pane.url, '_blank');
  });
  el.querySelector('.close').addEventListener('click', () => removePane(pane));
  el.querySelector('.tabs').addEventListener('click', () => toggleMenu(pane));
  pane.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(pane, pane.urlInput.value);
  });

  return pane;
}

function addPane(url = '', weight = 1) {
  if (panes.length >= MAX_PANES) return null;
  const pane = createPane(weight);
  if (panes.length > 0) container.appendChild(createDivider());
  container.appendChild(pane.el);
  panes.push(pane);
  updateControls();
  renderTabList(pane.overlayList, pane); // seed the empty-state picker
  if (url) navigate(pane, url);
  else pane.urlInput.focus();
  persist();
  return pane;
}

function removePane(pane) {
  if (panes.length <= 1) return;
  const idx = panes.indexOf(pane);
  if (idx === -1) return;
  const before = pane.el.previousElementSibling;
  const after = pane.el.nextElementSibling;
  if (before && before.classList.contains('divider')) before.remove();
  else if (after && after.classList.contains('divider')) after.remove();
  pane.el.remove();
  panes.splice(idx, 1);
  updateControls();
  persist();
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
  persist();
}

function reload(pane) {
  if (pane.url) pane.iframe.src = pane.url; // reassigning src reloads the frame
}

function updateControls() {
  addBtn.disabled = panes.length >= MAX_PANES;
  const single = panes.length <= 1;
  for (const p of panes) p.el.querySelector('.close').disabled = single;
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

async function renderTabList(container, pane) {
  container.textContent = 'Loading tabs...';
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) {
    container.textContent = 'Could not read open tabs.';
    return;
  }
  fillTabList(container, pane, tabs);
}

function fillTabList(container, pane, tabs) {
  const selfPrefix = chrome.runtime.getURL('');
  const list = tabs.filter((t) => t.url && /^(https?|file):/i.test(t.url) && !t.url.startsWith(selfPrefix));
  container.textContent = '';
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'tab-empty';
    p.textContent = 'No open tabs to show.';
    container.appendChild(p);
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
    container.appendChild(row);
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

// ---- layout direction ----

function setDirection(dir) {
  direction = dir === 'column' ? 'column' : 'row';
  container.classList.toggle('row', direction === 'row');
  container.classList.toggle('column', direction === 'column');
  for (const d of container.querySelectorAll('.divider')) {
    d.classList.toggle('v', direction === 'row');
    d.classList.toggle('h', direction === 'column');
  }
  toggleDirBtn.textContent = 'Layout: ' + (direction === 'row' ? 'Side by side' : 'Stacked');
  persist();
}

// ---- draggable divider ----

function createDivider() {
  const d = document.createElement('div');
  d.className = 'divider ' + (direction === 'row' ? 'v' : 'h');
  d.addEventListener('mousedown', (e) => onDividerDown(d, e));
  return d;
}

function onDividerDown(divider, e) {
  e.preventDefault();
  const prevEl = divider.previousElementSibling;
  const nextEl = divider.nextElementSibling;
  if (!prevEl || !nextEl) return;
  const prev = prevEl.__pane;
  const next = nextEl.__pane;
  const horizontal = direction === 'row';

  const prevRect = prevEl.getBoundingClientRect();
  const nextRect = nextEl.getBoundingClientRect();
  const start = horizontal ? e.clientX : e.clientY;
  const prevSize = horizontal ? prevRect.width : prevRect.height;
  const nextSize = horizontal ? nextRect.width : nextRect.height;
  const combined = prevSize + nextSize;
  const totalWeight = prev.weight + next.weight;

  document.body.classList.add('dragging', horizontal ? 'col-resize' : 'row-resize');

  function move(ev) {
    const pos = horizontal ? ev.clientX : ev.clientY;
    let newPrev = prevSize + (pos - start);
    newPrev = Math.max(MIN_SIZE, Math.min(combined - MIN_SIZE, newPrev));
    prev.weight = totalWeight * (newPrev / combined);
    next.weight = totalWeight - prev.weight;
    prevEl.style.flexGrow = String(prev.weight);
    nextEl.style.flexGrow = String(next.weight);
  }

  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('dragging', 'col-resize', 'row-resize');
    persist();
  }

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

// ---- url handling ----

function normalizeUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;      // already has a scheme
  if (/^(about:|chrome:|brave:|edge:|view-source:)/i.test(raw)) return raw;
  // looks like a bare domain (has a dot, no spaces) -> https
  if (!/\s/.test(raw) && /^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(raw)) return 'https://' + raw;
  // otherwise treat it as a search
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(raw);
}

// ---- persistence ----

function persist() {
  const state = {
    direction,
    panes: panes.map((p) => ({ url: p.url, weight: p.weight }))
  };
  try { chrome.storage.local.set({ splitState: state }); } catch (_) { /* ignore */ }
}

async function restore() {
  const params = new URLSearchParams(location.search);
  const first = params.get('first') || '';  // page you launched from -> first pane
  const add = params.get('add') || '';       // page sent from the right-click menu -> extra pane
  // Drop the query so a manual reload of this tab restores from storage instead.
  try { history.replaceState(null, '', location.pathname); } catch (_) { /* ignore */ }

  let state = null;
  try { state = (await chrome.storage.local.get('splitState')).splitState; } catch (_) { /* ignore */ }

  if (state && Array.isArray(state.panes) && state.panes.length) {
    setDirection(state.direction || 'row');
    state.panes.forEach((p, i) => addPane(i === 0 && first ? first : (p.url || ''), p.weight || 1));
  } else {
    setDirection('row');
    if (!add) {
      addPane(first || '');
      addPane('');
    }
  }
  if (add) addPane(add);
  updateControls();
}
