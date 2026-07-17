// Group Icons -- popup.
// Tab groups only carry a text title + a color from a fixed palette (no image
// field). So an emoji title IS the icon: set a group's title to an emoji and the
// tab strip shows that emoji as the group's label. This popup makes that easy,
// and lets you recolor groups too. Everything is local.

// The nine colors the tabGroups API accepts, with an approximate swatch hex.
const COLORS = [
  ['grey', '#5f6368'], ['blue', '#1a73e8'], ['red', '#d93025'],
  ['yellow', '#f9ab00'], ['green', '#188038'], ['pink', '#d01884'],
  ['purple', '#a142f4'], ['cyan', '#007b83'], ['orange', '#fa903e']
];

const EMOJI = [
  '⭐', '🎨', '🎵', '🎬', '📺', '🎮', '📧', '📰', '💬', '📚',
  '💻', '🐙', '🧪', '🔧', '⚙️', '🛒', '💰', '📈', '📊', '📷',
  '✅', '🔒', '🌐', '🎯', '🧠', '📝', '🔍', '🚀', '💡', '🔥',
  '❤️', '🏠', '☕', '🍿', '🌙', '🐛', '📌', '🗂️', '🧩', '🎧'
];

const TAB_GROUP_ID_NONE = -1;

const groupsEl = document.getElementById('groups');
const emptyEl = document.getElementById('empty');
const toolbox = document.getElementById('toolbox');
const paletteEl = document.getElementById('palette');
const colorsEl = document.getElementById('colors');
const customInput = document.getElementById('custom');
const selHint = document.getElementById('selHint');

let selectedId = null;

buildPalette();
buildColors();

document.getElementById('applyCustom').addEventListener('click', () => {
  if (selectedId != null) applyTitle(selectedId, customInput.value);
});
customInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && selectedId != null) applyTitle(selectedId, customInput.value);
});
document.getElementById('clearTitle').addEventListener('click', () => {
  if (selectedId != null) applyTitle(selectedId, '');
});

render();

let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 150); }
for (const ev of ['onCreated', 'onUpdated', 'onRemoved']) {
  try { chrome.tabGroups[ev].addListener(scheduleRender); } catch (_) { /* ignore */ }
}
for (const ev of ['onCreated', 'onRemoved', 'onMoved', 'onAttached', 'onDetached', 'onUpdated']) {
  try { chrome.tabs[ev].addListener(scheduleRender); } catch (_) { /* ignore */ }
}

async function render() {
  let groups = [];
  try { groups = await chrome.tabGroups.query({}); } catch (_) { /* ignore */ }

  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (_) { /* ignore */ }
  const byGroup = new Map();
  for (const t of tabs) {
    if (t.groupId != null && t.groupId !== TAB_GROUP_ID_NONE) {
      if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
      byGroup.get(t.groupId).push(t);
    }
  }

  groupsEl.textContent = '';

  if (!groups.length) {
    emptyEl.hidden = false;
    toolbox.classList.add('disabled');
    return;
  }
  emptyEl.hidden = true;
  toolbox.classList.remove('disabled');

  if (selectedId != null && !groups.some((g) => g.id === selectedId)) selectedId = null;
  if (selectedId == null) selectedId = groups[0].id;

  for (const g of groups) {
    const card = document.createElement('div');
    card.className = 'group' + (g.id === selectedId ? ' sel' : '');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = colorHex(g.color);

    const label = document.createElement('span');
    label.className = 'glabel' + (g.title ? '' : ' muted');
    label.textContent = g.title || '(no label)';

    const favs = document.createElement('span');
    favs.className = 'favs';
    const list = byGroup.get(g.id) || [];
    for (const tb of list.slice(0, 6)) {
      const im = document.createElement('img');
      im.className = 'fav';
      im.width = 14;
      im.height = 14;
      im.referrerPolicy = 'no-referrer';
      im.title = tb.title || '';
      im.onerror = () => { im.style.visibility = 'hidden'; };
      if (tb.favIconUrl && /^(https?|data):/i.test(tb.favIconUrl)) im.src = tb.favIconUrl;
      else im.style.visibility = 'hidden';
      im.addEventListener('click', (e) => { e.stopPropagation(); activateTab(tb); });
      favs.appendChild(im);
    }

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(list.length);

    card.appendChild(dot);
    card.appendChild(label);
    card.appendChild(favs);
    card.appendChild(count);
    card.addEventListener('click', () => select(g.id));
    groupsEl.appendChild(card);
  }

  const sel = groups.find((g) => g.id === selectedId);
  selHint.textContent = sel
    ? ('Selected: ' + (sel.title || '(no label)'))
    : 'Select a group above, then pick an icon.';
}

function select(id) {
  selectedId = id;
  render();
}

async function applyTitle(id, title) {
  try {
    await chrome.tabGroups.update(id, { title: String(title || '') });
  } catch (e) { console.error(e); }
  customInput.value = '';
  scheduleRender();
}

async function applyColor(id, color) {
  try {
    await chrome.tabGroups.update(id, { color });
  } catch (e) { console.error(e); }
  scheduleRender();
}

async function activateTab(tb) {
  try {
    await chrome.tabs.update(tb.id, { active: true });
    if (tb.windowId != null) await chrome.windows.update(tb.windowId, { focused: true });
  } catch (_) { /* ignore */ }
}

function buildPalette() {
  for (const e of EMOJI) {
    const b = document.createElement('button');
    b.className = 'emoji';
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => { if (selectedId != null) applyTitle(selectedId, e); });
    paletteEl.appendChild(b);
  }
}

function buildColors() {
  for (const [name, hex] of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.type = 'button';
    b.title = name;
    b.style.background = hex;
    b.addEventListener('click', () => { if (selectedId != null) applyColor(selectedId, name); });
    colorsEl.appendChild(b);
  }
}

function colorHex(name) {
  const f = COLORS.find((c) => c[0] === name);
  return f ? f[1] : '#5f6368';
}
