// Dev Dashboard -- popup. Lists local dev servers and deployed sites with a live
// up/down check (a no-cors fetch: connects => up, throws => down) and one-click
// open. Entries live in storage.local and are fully editable.

const DEFAULTS = [
  { group: 'local', name: 'Notes', url: 'http://localhost:26715/' },
  { group: 'local', name: 'volt', url: 'http://localhost:26628/' },
  { group: 'local', name: 'rulesandprompts', url: 'http://localhost:26611/' },
  { group: 'local', name: 'Curio (dev)', url: 'http://localhost:26529/' },
  { group: 'deployed', name: 'MIR', url: 'https://mir.events/' },
  { group: 'deployed', name: 'Volt Control', url: 'https://host.voltjs.com/' },
  { group: 'deployed', name: 'Curio', url: 'https://getcurio.chat/' }
];

const PING_TIMEOUT = 4000;

const listLocal = document.getElementById('list-local');
const listDeployed = document.getElementById('list-deployed');
const form = document.getElementById('form');
const fName = document.getElementById('f-name');
const fUrl = document.getElementById('f-url');
const fSave = document.getElementById('f-save');

let entries = [];
let editingId = null;

init();

document.getElementById('add').addEventListener('click', () => openForm());
document.getElementById('refresh').addEventListener('click', pingAll);
document.getElementById('f-cancel').addEventListener('click', closeForm);
fSave.addEventListener('click', onSave);
fUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSave(); });

async function init() {
  let stored = null;
  try { stored = (await chrome.storage.local.get('dashEntries')).dashEntries; } catch (_) { /* ignore */ }
  if (Array.isArray(stored)) {
    entries = stored;
  } else {
    entries = DEFAULTS.map((d) => ({ id: uid(), ...d }));
    persist();
  }
  render();
  pingAll();
}

function uid() {
  try { return crypto.randomUUID(); } catch (_) { return 'e' + Date.now() + Math.round(Math.random() * 1e6); }
}

function persist() {
  try { chrome.storage.local.set({ dashEntries: entries }); } catch (_) { /* ignore */ }
}

function render() {
  drawList(listLocal, entries.filter((e) => e.group === 'local'));
  drawList(listDeployed, entries.filter((e) => e.group === 'deployed'));
}

function drawList(container, items) {
  container.textContent = '';
  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'list-empty';
    e.textContent = 'Nothing here yet -- use + to add one.';
    container.appendChild(e);
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = item.id;

    const dot = document.createElement('span');
    dot.className = 'dot checking';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name || item.url;
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = prettyUrl(item.url);
    meta.appendChild(name);
    meta.appendChild(url);

    const ms = document.createElement('span');
    ms.className = 'ms';

    const edit = document.createElement('button');
    edit.className = 'rbtn edit';
    edit.textContent = '✎';
    edit.title = 'Edit';
    edit.addEventListener('click', (ev) => { ev.stopPropagation(); openForm(item.id); });

    const del = document.createElement('button');
    del.className = 'rbtn del';
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', (ev) => { ev.stopPropagation(); removeEntry(item.id); });

    row.appendChild(dot);
    row.appendChild(meta);
    row.appendChild(ms);
    row.appendChild(edit);
    row.appendChild(del);
    row.addEventListener('click', () => open(item.url));
    container.appendChild(row);
  }
}

function prettyUrl(u) {
  return String(u).replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function open(url) {
  chrome.tabs.create({ url });
  window.close();
}

async function pingAll() {
  document.querySelectorAll('.row').forEach((r) => {
    r.querySelector('.dot').className = 'dot checking';
    r.querySelector('.ms').className = 'ms';
    r.querySelector('.ms').textContent = '';
  });
  await Promise.all(entries.map(async (e) => {
    const res = await ping(e.url);
    const row = document.querySelector('.row[data-id="' + e.id + '"]');
    if (!row) return;
    const dot = row.querySelector('.dot');
    const ms = row.querySelector('.ms');
    if (res.up) {
      dot.className = 'dot up';
      ms.className = 'ms';
      ms.textContent = res.ms + 'ms';
    } else {
      dot.className = 'dot down';
      ms.className = 'ms down';
      ms.textContent = 'down';
    }
  }));
}

async function ping(url) {
  const started = performance.now();
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(PING_TIMEOUT) });
    return { up: true, ms: Math.round(performance.now() - started) };
  } catch (_) {
    return { up: false, ms: null };
  }
}

// ---- add / edit form ----

function openForm(id) {
  editingId = id || null;
  const e = id ? entries.find((x) => x.id === id) : null;
  fName.value = e ? e.name : '';
  fUrl.value = e ? e.url : '';
  const grp = e ? e.group : 'local';
  form.querySelector('input[value="' + grp + '"]').checked = true;
  form.hidden = false;
  fName.focus();
}

function closeForm() {
  form.hidden = true;
  editingId = null;
}

function onSave() {
  const name = fName.value.trim();
  const group = form.querySelector('input[name="grp"]:checked').value;
  const url = normalizeUrl(fUrl.value, group);
  if (!url) { fUrl.focus(); return; }

  if (editingId) {
    const e = entries.find((x) => x.id === editingId);
    if (e) { e.name = name || prettyUrl(url); e.url = url; e.group = group; }
  } else {
    entries.push({ id: uid(), group, name: name || prettyUrl(url), url });
  }
  persist();
  closeForm();
  render();
  pingAll();
}

function removeEntry(id) {
  entries = entries.filter((e) => e.id !== id);
  persist();
  render();
}

function normalizeUrl(raw, group) {
  raw = (raw || '').trim().replace(/^\/+/, '');
  if (!raw) return '';
  let s;
  if (/^https?:\/\//i.test(raw)) {
    s = raw;
  } else {
    const hostpart = raw.split('/')[0];
    const local = group === 'local'
      || /^(localhost|0\.0\.0\.0)/i.test(hostpart)
      || /^127\./.test(hostpart) || /^10\./.test(hostpart) || /^192\.168\./.test(hostpart)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostpart)
      || /:\d+$/.test(hostpart) || /\.local$/i.test(hostpart);
    s = (local ? 'http://' : 'https://') + raw;
  }
  try { return new URL(s).href; } catch (_) { return s; }
}
