importScripts('lib/crypto.js');
const VC = self.VaultCrypto;

// ---- context-menu quick-add ------------------------------------------------
// Start a Vault entry from the page you're on, WITHOUT any host permission. A
// context-menu click hands an extension only the page URL and the text you
// selected -- never the page's contents -- so this reads nothing about the sites
// you visit. You still type or paste the secret yourself. Filling a site's field
// would require content-script/host access, which is the line Vault won't cross.
const MENUS = [
  { id: 'vault-save', title: 'Save a login for this site to Vault',        contexts: ['page', 'editable'] },
  { id: 'vault-gen',  title: 'New Vault entry with a generated password',  contexts: ['page', 'editable'] },
  { id: 'vault-sel',  title: 'Save selection to Vault as a password',      contexts: ['selection'] },
];

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create(m);
  });
}
chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

function nameFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') || 'New login'; }
  catch (_) { return 'New login'; }
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!info.menuItemId || String(info.menuItemId).indexOf('vault-') !== 0) return;
  const url = info.pageUrl || '';
  const pending = { url, name: nameFromUrl(url), username: '', password: '', note: '' };
  if (info.menuItemId === 'vault-gen') pending.password = VC.generatePassword(20);
  if (info.menuItemId === 'vault-sel') pending.password = (info.selectionText || '').trim();
  // Passed via storage.session (in-memory), NOT the tab URL -- a secret never
  // belongs in a URL. The tab opens with only ?add=1.
  await chrome.storage.session.set({ pendingAdd: pending });
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?add=1'), active: true });
});

// Auto-lock. The popup re-arms this alarm on every unlock/interaction; if the
// vault sits idle past the timeout, we wipe the in-memory session key so the next
// open requires the master password again. storage.session is already cleared when
// the browser closes -- this covers the "left it unlocked and walked away" case.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'openTab') {
    // The action popup cannot host a file picker: opening the OS dialog takes focus,
    // which destroys the popup and its JS before the file is read. So importing
    // happens in a real tab. A TAB, not a detached window -- the browser places a
    // popup window wherever it likes, and on a multi-monitor desktop that can be a
    // screen you aren't looking at.
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab=1'), active: true })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => { console.error('[Vault]', e); sendResponse({ ok: false }); });
    return true;   // keep the channel open for the async reply
  }
  if (msg && msg.type === 'armAutolock') {
    chrome.alarms.create('autolock', {
      delayInMinutes: Math.max(1, msg.minutes || 15),
    });
  } else if (msg && msg.type === 'lockNow') {
    chrome.alarms.clear('autolock');
    chrome.storage.session.remove(['vaultKey', 'vaultUnlockedAt']);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autolock') {
    chrome.storage.session.remove(['vaultKey', 'vaultUnlockedAt']);
  }
});
