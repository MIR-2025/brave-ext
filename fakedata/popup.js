// FakeData -- popup. Generates a persona (via filler.js), previews it, and injects
// fillPage into the active tab. Options persist in storage.

let persona = generatePersona();

const pfields = document.getElementById('pfields');
const statusEl = document.getElementById('status');
const optOverwrite = document.getElementById('optOverwrite');
const optControls = document.getElementById('optControls');
const optVisible = document.getElementById('optVisible');

renderPersona();
loadOptions();

document.getElementById('newId').addEventListener('click', () => {
  persona = generatePersona();
  renderPersona();
  setStatus('');
});
document.getElementById('fillBtn').addEventListener('click', fill);
for (const el of [optOverwrite, optControls, optVisible]) el.addEventListener('change', saveOptions);

function renderPersona() {
  const rows = [
    ['Name', persona.fullName],
    ['Email', persona.email],
    ['Phone', persona.phone],
    ['Address', persona.street + ', ' + persona.city + ', ' + persona.stateAbbr + ' ' + persona.zip],
    ['Company', persona.company]
  ];
  pfields.textContent = '';
  for (const [k, v] of rows) {
    const kk = document.createElement('div');
    kk.className = 'k';
    kk.textContent = k;
    const vv = document.createElement('div');
    vv.className = 'v';
    vv.textContent = v;
    vv.title = v;
    pfields.appendChild(kk);
    pfields.appendChild(vv);
  }
}

function readOptions() {
  return {
    overwrite: optOverwrite.checked,
    controls: optControls.checked,
    onlyVisible: optVisible.checked,
    scope: 'page'
  };
}

async function saveOptions() {
  try { await chrome.storage.local.set({ fdOptions: readOptions() }); } catch (_) { /* ignore */ }
}

async function loadOptions() {
  let o = null;
  try { o = (await chrome.storage.local.get('fdOptions')).fdOptions; } catch (_) { /* ignore */ }
  if (o) {
    optOverwrite.checked = o.overwrite !== false;
    optControls.checked = o.controls !== false;
    optVisible.checked = o.onlyVisible !== false;
  }
}

function setStatus(msg) { statusEl.textContent = msg; }

async function fill() {
  setStatus('Filling...');
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_) { /* ignore */ }
  if (!tab || !tab.id) { setStatus('No active tab.'); return; }

  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: fillPage,
      args: [persona, readOptions()]
    });
    const total = res.reduce((a, r) => a + (r && typeof r.result === 'number' ? r.result : 0), 0);
    setStatus(total ? ('Filled ' + total + ' field' + (total === 1 ? '' : 's') + '.') : 'No fillable fields found here.');
  } catch (e) {
    console.error(e);
    setStatus('Cannot fill this page (a restricted page such as brave://).');
  }
}
