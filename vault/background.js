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
