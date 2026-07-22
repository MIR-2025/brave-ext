'use strict';

// ---- constants ------------------------------------------------------------
const AUTOLOCK_MIN = 15;
const VC = self.VaultCrypto;

// Opened as a real tab (for importing) rather than as the action popup.
const IS_TAB = new URLSearchParams(location.search).get('tab') === '1';

// ---- in-memory state (this popup instance only) ---------------------------
let _key = null;       // AES-GCM CryptoKey while unlocked
let _vault = null;     // { version, entries: [{id,name,url,username,password,note}] }
let _editingId = null; // id of the entry open in the detail overlay, or null = new

// ---- tiny DOM helpers -----------------------------------------------------
const $ = (id) => document.getElementById(id);
const show = (id, on) => { $(id).hidden = !on; };
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 1600);
}

// ---- storage helpers ------------------------------------------------------
const getLocal = (k) => chrome.storage.local.get(k).then((o) => o[k]);
const setLocal = (obj) => chrome.storage.local.set(obj);
const getSession = (keys) => chrome.storage.session.get(keys);

async function storeSession() {
  await chrome.storage.session.set({
    vaultKey: await VC.exportKey(_key),
    vaultUnlockedAt: Date.now(),
  });
  chrome.runtime.sendMessage({ type: 'armAutolock', minutes: AUTOLOCK_MIN });
}

// ---- persistence ----------------------------------------------------------
async function saveVault() {
  const enc = await VC.encryptObj(_key, _vault);
  await setLocal({ vaultData: enc });
  await storeSession(); // refresh the idle timer on every write
}

// ---- lifecycle: setup / unlock / lock -------------------------------------
async function doSetup(pw) {
  const salt = VC.randomSalt();
  _key = await VC.deriveKey(pw, salt, VC.ITERATIONS);
  _vault = { version: 1, entries: [] };
  await VC.encryptObj(_key, _vault).then((enc) => setLocal({ vaultData: enc }));
  await setLocal({ vaultMeta: { salt: VC.b64(salt), iterations: VC.ITERATIONS } });
  await storeSession();
  renderUnlocked();
}

async function doUnlock(pw) {
  const meta = await getLocal('vaultMeta');
  const data = await getLocal('vaultData');
  const key = await VC.deriveKey(pw, VC.ub64(meta.salt), meta.iterations);
  let vault;
  try {
    vault = await VC.decryptObj(key, data.iv, data.data); // throws on wrong pw
  } catch (e) {
    return false;
  }
  _key = key;
  _vault = vault;
  await storeSession();
  renderUnlocked();
  return true;
}

async function lock() {
  _key = null;
  _vault = null;
  chrome.runtime.sendMessage({ type: 'lockNow' });
  await chrome.storage.session.remove(['vaultKey', 'vaultUnlockedAt']);
  showPane('locked');
  $('pw').value = '';
  setTimeout(() => $('pw').focus(), 0);
}

// ---- pane switching -------------------------------------------------------
function showPane(name) {
  for (const p of ['setup', 'locked', 'unlocked']) show(p, p === name);
  show('lockBtn', name === 'unlocked');
  if (name !== 'unlocked') $('detail').hidden = true;
}

// ---- unlocked view --------------------------------------------------------
function renderUnlocked() {
  showPane('unlocked');
  $('search').value = '';
  renderList('');
  $('search').focus();
}

function faviconLetter(name) {
  const c = (name || '?').trim().charAt(0).toUpperCase();
  return c || '?';
}

function renderList(query) {
  const list = $('list');
  list.textContent = '';
  const q = query.trim().toLowerCase();
  const entries = _vault.entries
    .filter((e) => !q ||
      (e.name + ' ' + e.url + ' ' + e.username).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  show('emptyMsg', _vault.entries.length === 0);
  for (const e of entries) {
    const item = document.createElement('div');
    item.className = 'item';

    const fav = document.createElement('div');
    fav.className = 'fav';
    fav.textContent = faviconLetter(e.name);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = e.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = e.username || e.url || '';
    meta.append(name, sub);

    const copy = document.createElement('button');
    copy.className = 'ghost copybtn';
    copy.textContent = 'Copy';
    copy.title = 'Copy password';
    copy.addEventListener('click', (ev) => {
      ev.stopPropagation();
      copyText(e.password, 'Password copied');
    });

    item.append(fav, meta, copy);
    item.addEventListener('click', () => openDetail(e.id));
    list.append(item);
  }
}

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text || '');
    toast(msg || 'Copied');
  } catch (e) {
    toast('Copy failed');
  }
}

// ---- detail overlay -------------------------------------------------------
function openDetail(id) {
  _editingId = id;
  const e = id ? _vault.entries.find((x) => x.id === id) : null;
  $('fName').value = e ? e.name : '';
  $('fUrl').value = e ? e.url : '';
  $('fUser').value = e ? e.username : '';
  $('fPass').value = e ? e.password : '';
  $('fNote').value = e ? e.note : '';
  $('fPass').type = 'password';
  show('deleteBtn', !!id);
  $('detail').hidden = false;
  $('fName').focus();
}

function closeDetail() {
  $('detail').hidden = true;
  _editingId = null;
}

async function saveEntry(ev) {
  ev.preventDefault();
  const entry = {
    name: $('fName').value.trim() || 'Untitled',
    url: $('fUrl').value.trim(),
    username: $('fUser').value,
    password: $('fPass').value,
    note: $('fNote').value,
  };
  if (_editingId) {
    const e = _vault.entries.find((x) => x.id === _editingId);
    Object.assign(e, entry);
  } else {
    entry.id = crypto.randomUUID();
    _vault.entries.push(entry);
  }
  await saveVault();
  closeDetail();
  renderList($('search').value);
  toast('Saved');
}

async function deleteEntry() {
  if (!_editingId) return;
  _vault.entries = _vault.entries.filter((x) => x.id !== _editingId);
  await saveVault();
  closeDetail();
  renderList($('search').value);
  toast('Deleted');
}

// ---- encrypted backup: export ---------------------------------------------
//
// The file is the same AES-256-GCM ciphertext that sits in storage.local, plus
// the KDF parameters needed to reproduce the key. That is the whole trick: the
// salt travels WITH the backup, so the file opens on any machine given the
// master password that was in force when it was written -- no key export, no
// second secret, nothing in the file that is useful without the password.
const BACKUP_FORMAT = 'vault-backup';

async function exportBackup() {
  const meta = await getLocal('vaultMeta');
  const enc = await VC.encryptObj(_key, _vault); // fresh IV, never reused
  const doc = {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    entryCount: _vault.entries.length,
    kdf: { name: 'PBKDF2-SHA256', salt: meta.salt, iterations: meta.iterations },
    cipher: 'AES-256-GCM',
    iv: enc.iv,
    data: enc.data,
  };

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-${new Date().toISOString().slice(0, 10)}.vault`;
  document.body.append(a);
  a.click();  // synchronous -- the download is captured even if the popup then closes
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);

  const note = $('importNote');
  note.textContent =
    `Backed up ${doc.entryCount} ${doc.entryCount === 1 ? 'entry' : 'entries'}, ` +
    `encrypted. Safe to copy anywhere -- it is useless without your master password.`;
  note.hidden = false;
  toast('Backup downloaded');
}

// ---- encrypted backup: restore --------------------------------------------
let _pendingBackup = null;

function looksLikeBackup(text) {
  const t = text.trimStart();
  return t.startsWith('{') && t.includes(`"${BACKUP_FORMAT}"`);
}

function openRestore(doc) {
  _pendingBackup = doc;
  const when = doc.createdAt ? new Date(doc.createdAt).toLocaleString() : 'an unknown date';
  const n = doc.entryCount;
  $('restoreInfo').textContent =
    `Backup from ${when}` + (typeof n === 'number' ? `, ${n} ${n === 1 ? 'entry' : 'entries'}.` : '.');
  $('restoreErr').hidden = true;
  $('restorePw').value = '';
  $('restore').hidden = false;
  $('restorePw').focus();
}

function closeRestore() {
  $('restore').hidden = true;
  _pendingBackup = null;
}

// Everything here comes out of a file we did not write, so treat it as hostile:
// clamp the iteration count before handing it to PBKDF2 (a file claiming a
// billion rounds would otherwise wedge the browser on submit).
async function restoreFromBackup(doc, pw) {
  const iters = Math.min(Math.max(parseInt(doc.kdf.iterations, 10) || 0, 1000), 2000000);
  const key = await VC.deriveKey(pw, VC.ub64(doc.kdf.salt), iters);
  let payload;
  try {
    payload = await VC.decryptObj(key, doc.iv, doc.data); // throws on wrong password
  } catch (e) {
    return null;
  }
  const incoming = Array.isArray(payload && payload.entries) ? payload.entries : [];

  // Merge, never replace: a restore should not be able to destroy entries that
  // only exist in the vault you are restoring INTO. Identical entries are
  // skipped so restoring the same file twice is a no-op.
  const sig = (e) => [e.name, e.url, e.username, e.password].join(' ');
  const have = new Set(_vault.entries.map(sig));
  let added = 0, skipped = 0;
  for (const e of incoming) {
    if (have.has(sig(e))) { skipped++; continue; }
    have.add(sig(e));
    _vault.entries.push({
      id: crypto.randomUUID(), // fresh id -- never trust ids from a file
      name: e.name || 'Untitled',
      url: e.url || '',
      username: e.username || '',
      password: e.password || '',
      note: e.note || '',
    });
    added++;
  }
  await saveVault();
  return { added, skipped };
}

// ---- file picked: CSV or .vault -------------------------------------------
async function handleFile(file) {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.vault') || looksLikeBackup(text)) {
    let doc = null;
    try { doc = JSON.parse(text); } catch (e) { /* handled below */ }
    if (!doc || doc.format !== BACKUP_FORMAT || !doc.kdf || !doc.iv || !doc.data) {
      toast('That is not a Vault backup file');
      return;
    }
    openRestore(doc);
    return;
  }
  await importCSV(text);
}

// ---- CSV import -----------------------------------------------------------
async function importCSV(text) {
  const rows = self.VaultCSV.fromPasswordCSV(text);
  if (!rows.length) {
    toast('No rows found in that CSV');
    return;
  }
  for (const r of rows) {
    _vault.entries.push({ id: crypto.randomUUID(), ...r });
  }
  await saveVault();
  renderList($('search').value);
  const note = $('importNote');
  note.textContent =
    `Imported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}. ` +
    `Now delete that CSV file -- it holds every password in plain text.`;
  note.hidden = false;
}

// ---- password strength meter (setup) --------------------------------------
function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

// ---- wire up --------------------------------------------------------------
function wire() {
  $('setupForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const a = $('newPw').value;
    const b = $('newPw2').value;
    const err = $('setupErr');
    err.hidden = true;
    if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
    if (a !== b) { err.textContent = "Passwords don't match."; err.hidden = false; return; }
    await doSetup(a);
  });

  $('newPw').addEventListener('input', () => {
    const s = strength($('newPw').value);
    const bar = $('pwStrength');
    const pct = [8, 30, 55, 80, 100][s];
    const col = ['#ef4444', '#ef4444', '#f59e0b', '#eab308', '#10b981'][s];
    bar.style.width = pct + '%';
    bar.style.background = col;
  });

  $('unlockForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('unlockErr');
    err.hidden = true;
    const ok = await doUnlock($('pw').value);
    if (!ok) {
      err.textContent = 'Wrong master password.';
      err.hidden = false;
      $('pw').select();
    }
  });

  $('lockBtn').addEventListener('click', lock);
  $('search').addEventListener('input', () => renderList($('search').value));
  $('addBtn').addEventListener('click', () => openDetail(null));

  $('importBtn').addEventListener('click', onImportClick);
  $('importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (f) await handleFile(f);
    ev.target.value = ''; // allow re-selecting the same file
  });

  // Export needs no file picker -- a blob download does not steal focus the way
  // an OS open-dialog does, so this works from the action popup as-is.
  $('exportBtn').addEventListener('click', async () => {
    $('exportBtn').disabled = true;
    try { await exportBackup(); } catch (e) {
      console.error('[Vault]', e);
      toast('Export failed');
    }
    $('exportBtn').disabled = false;
  });

  $('restoreForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!_pendingBackup) return;
    const err = $('restoreErr');
    err.hidden = true;
    $('restoreGo').disabled = true;
    const res = await restoreFromBackup(_pendingBackup, $('restorePw').value);
    $('restoreGo').disabled = false;
    if (!res) {
      err.textContent = 'Wrong master password for this backup.';
      err.hidden = false;
      $('restorePw').select();
      return;
    }
    closeRestore();
    renderList($('search').value);
    const note = $('importNote');
    note.textContent = `Restored ${res.added} ${res.added === 1 ? 'entry' : 'entries'}` +
      (res.skipped ? `, skipped ${res.skipped} already here.` : '.');
    note.hidden = false;
    toast('Restored');
  });
  $('restoreCancel').addEventListener('click', closeRestore);
  $('restore').addEventListener('click', (ev) => { if (ev.target === $('restore')) closeRestore(); });

  $('entryForm').addEventListener('submit', saveEntry);
  $('cancelBtn').addEventListener('click', closeDetail);
  $('deleteBtn').addEventListener('click', deleteEntry);
  $('revealBtn').addEventListener('click', () => {
    const p = $('fPass');
    p.type = p.type === 'password' ? 'text' : 'password';
  });
  $('copyUser').addEventListener('click', () => copyText($('fUser').value, 'Username copied'));
  $('copyPass').addEventListener('click', () => copyText($('fPass').value, 'Password copied'));

  $('detail').addEventListener('click', (ev) => { if (ev.target === $('detail')) closeDetail(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('restore').hidden) closeRestore();
    else if (!$('detail').hidden) closeDetail();
  });
}

async function onImportClick() {
  if (IS_TAB) { $('importFile').click(); return; }  // in a tab the picker works normally
  // In the action popup it cannot: the OS dialog steals focus and the popup (and this
  // script) are destroyed before the file is read. Hand off to the worker, and wait
  // for its reply -- closing first would kill the message along with us.
  $('importBtn').disabled = true;
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ type: 'openTab' });
  } catch (e) {
    console.error('[Vault]', e);
  }
  if (res && res.ok) { window.close(); return; }
  $('importBtn').disabled = false;
  toast('Could not open the vault tab');
}

// ---- boot -----------------------------------------------------------------
async function init() {
  if (IS_TAB) document.body.classList.add('as-tab');
  wire();
  const meta = await getLocal('vaultMeta');
  if (!meta) { showPane('setup'); $('newPw').focus(); return; }

  const sess = await getSession(['vaultKey', 'vaultUnlockedAt']);
  const fresh = sess.vaultUnlockedAt &&
    (Date.now() - sess.vaultUnlockedAt) < AUTOLOCK_MIN * 60 * 1000;

  if (sess.vaultKey && fresh) {
    try {
      _key = await VC.importKey(sess.vaultKey);
      const data = await getLocal('vaultData');
      _vault = await VC.decryptObj(_key, data.iv, data.data);
      await storeSession(); // slide the idle window forward
      renderUnlocked();
      return;
    } catch (e) {
      // fall through to locked
    }
  }
  await chrome.storage.session.remove(['vaultKey', 'vaultUnlockedAt']);
  showPane('locked');
  $('pw').focus();
}

init();
