// Tab Overview -- the grid page. Lists every open tab with its cached thumbnail
// (favicon fallback), grouped by window, with live updates, search, and click to
// switch / close.

const grouproot = document.getElementById('grouproot');
const searchEl = document.getElementById('search');
const countEl = document.getElementById('count');

let myTabId = null;
let allTabs = [];
let thumbs = {};
let heap = {};   // tabId -> { bytes } | { state: 'unloaded' | 'na' }

init();

async function init() {
  try { const me = await chrome.tabs.getCurrent(); myTabId = me && me.id; } catch (_) { /* ignore */ }
  await reload();
  searchEl.addEventListener('input', render);
  searchEl.focus();
  document.getElementById('memBtn').addEventListener('click', fetchHeap);
  fetchHeap();

  const refresh = debounce(reload, 200);
  for (const ev of ['onCreated', 'onRemoved', 'onUpdated', 'onActivated', 'onMoved', 'onAttached', 'onDetached']) {
    try { chrome.tabs[ev].addListener(refresh); } catch (_) { /* ignore */ }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    for (const k in changes) {
      if (!k.startsWith('thumb_')) continue;
      if (changes[k].newValue) thumbs[k] = changes[k].newValue; else delete thumbs[k];
      updateThumb(k.slice('thumb_'.length));
    }
  });
}

async function reload() {
  try { allTabs = await chrome.tabs.query({}); } catch (_) { allTabs = []; }
  try { thumbs = (await chrome.storage.session.get(null)) || {}; } catch (_) { thumbs = {}; }
  render();
}

function debounce(fn, ms) {
  let h = null;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

function hostOf(u) { try { return new URL(u).host || u; } catch (_) { return u || ''; } }

function visibleTabs() {
  const q = searchEl.value.trim().toLowerCase();
  return allTabs
    .filter((t) => t.id !== myTabId)
    .filter((t) => !q || ((t.title || '') + ' ' + (t.url || '')).toLowerCase().indexOf(q) !== -1);
}

function render() {
  const tabs = visibleTabs();
  grouproot.textContent = '';
  countEl.textContent = tabs.length + ' tab' + (tabs.length === 1 ? '' : 's');

  if (!tabs.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = searchEl.value.trim() ? 'No tabs match your search.' : 'No tabs.';
    grouproot.appendChild(e);
    return;
  }

  const order = [];
  const byWin = new Map();
  for (const t of tabs) {
    if (!byWin.has(t.windowId)) { byWin.set(t.windowId, []); order.push(t.windowId); }
    byWin.get(t.windowId).push(t);
  }
  const multi = order.length > 1;

  order.forEach((winId, i) => {
    const group = document.createElement('section');
    group.className = 'group';
    if (multi) {
      const title = document.createElement('div');
      title.className = 'group-title';
      title.textContent = 'Window ' + (i + 1) + '  ·  ' + byWin.get(winId).length + ' tabs';
      group.appendChild(title);
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const t of byWin.get(winId)) grid.appendChild(card(t));
    group.appendChild(grid);
    grouproot.appendChild(group);
  });
}

function favImg(cls, t) {
  const img = document.createElement('img');
  img.className = cls;
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => { img.style.visibility = 'hidden'; };
  if (t.favIconUrl && /^(https?|data):/i.test(t.favIconUrl)) img.src = t.favIconUrl;
  else img.style.visibility = 'hidden';
  return img;
}

function card(t) {
  const el = document.createElement('div');
  el.className = 'card' + (t.active ? ' active' : '');
  el.dataset.id = String(t.id);

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const th = thumbs['thumb_' + t.id];
  if (th && th.dataUrl) {
    const img = document.createElement('img');
    img.className = 'shot';
    img.alt = '';
    img.src = th.dataUrl;
    thumb.appendChild(img);
  } else {
    thumb.appendChild(favImg('fallback', t));
    const ns = document.createElement('span');
    ns.className = 'noshot';
    ns.textContent = 'no preview yet';
    thumb.appendChild(ns);
  }
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '✕';
  close.title = 'Close tab';
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id, el); });
  thumb.appendChild(close);

  const mem = document.createElement('span');
  mem.className = 'mem';
  mem.title = 'JS heap (approximate)';
  setMemText(mem, heap[t.id]);
  thumb.appendChild(mem);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.appendChild(favImg('fav', t));
  const text = document.createElement('div');
  text.className = 'text';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = t.title || hostOf(t.url);
  title.title = t.title || '';
  const host = document.createElement('div');
  host.className = 'host';
  host.textContent = hostOf(t.url);
  text.appendChild(title);
  text.appendChild(host);
  meta.appendChild(text);

  el.appendChild(thumb);
  el.appendChild(meta);
  el.addEventListener('click', () => activate(t));
  return el;
}

async function activate(t) {
  try {
    await chrome.tabs.update(t.id, { active: true });
    if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
  } catch (_) { /* ignore */ }
}

async function closeTab(id, el) {
  try { await chrome.tabs.remove(id); } catch (_) { /* ignore */ }
  el.remove();
  allTabs = allTabs.filter((t) => t.id !== id);
  const n = visibleTabs().length;
  countEl.textContent = n + ' tab' + (n === 1 ? '' : 's');
}

function updateThumb(id) {
  const el = grouproot.querySelector('.card[data-id="' + id + '"]');
  if (!el) return;
  const th = thumbs['thumb_' + id];
  if (!th || !th.dataUrl) return;
  const thumbEl = el.querySelector('.thumb');
  let img = thumbEl.querySelector('img.shot');
  if (!img) {
    const close = thumbEl.querySelector('.close');
    thumbEl.querySelectorAll('img.fallback, .noshot').forEach((n) => n.remove());
    img = document.createElement('img');
    img.className = 'shot';
    img.alt = '';
    thumbEl.insertBefore(img, close || null);
  }
  img.src = th.dataUrl;
}

// ---- per-tab JS heap (best effort; see README) ----

// Injected into each tab. performance.memory is Chrome-specific, JS-heap only, and
// may be coarsened or unavailable (e.g. under Brave's fingerprinting protection).
function readHeap() {
  try { return (window.performance && performance.memory) ? performance.memory.usedJSHeapSize : null; }
  catch (e) { return null; }
}

async function fetchHeap() {
  const btn = document.getElementById('memBtn');
  if (btn) btn.classList.add('busy');
  const targets = allTabs.filter((t) => t.id !== myTabId);
  await Promise.all(targets.map(async (t) => {
    if (t.discarded) { heap[t.id] = { state: 'unloaded' }; updateMemBadge(t.id); return; }
    if (!/^(https?|file):/i.test(t.url || '')) { heap[t.id] = { state: 'na' }; updateMemBadge(t.id); return; }
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: readHeap });
      const bytes = res && typeof res.result === 'number' ? res.result : null;
      heap[t.id] = (bytes != null) ? { bytes } : { state: 'na' };
    } catch (_) {
      heap[t.id] = { state: 'na' };
    }
    updateMemBadge(t.id);
  }));
  if (btn) btn.classList.remove('busy');
}

function fmtBytes(b) {
  const mb = b / 1048576;
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
  if (mb >= 10) return Math.round(mb) + ' MB';
  return mb.toFixed(1) + ' MB';
}

function setMemText(el, h) {
  if (!h) { el.hidden = true; el.classList.remove('dim'); return; }
  if (h.state === 'unloaded') { el.textContent = 'unloaded'; el.classList.add('dim'); el.hidden = false; return; }
  if (h.state === 'na' || typeof h.bytes !== 'number') { el.hidden = true; return; }
  el.classList.remove('dim');
  el.textContent = fmtBytes(h.bytes);
  el.hidden = false;
}

function updateMemBadge(id) {
  const el = grouproot.querySelector('.card[data-id="' + id + '"] .mem');
  if (el) setMemText(el, heap[id]);
}
