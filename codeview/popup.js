// Code Viewer -- popup. Toggles highlighting, favicon, default wrap, and theme.

const enabled = document.getElementById('enabled');
const favicon = document.getElementById('favicon');
const wrap = document.getElementById('wrap');
const theme = document.getElementById('theme');
const applyNow = document.getElementById('applyNow');
const applyMsg = document.getElementById('applyMsg');

applyNow.addEventListener('click', highlightThisTab);

load();

// Force-inject the highlighter into the current tab. Works even on tabs that were
// already open (which never get the auto content script), and on file:// pages when
// "Allow access to file URLs" is on.
async function highlightThisTab() {
  applyMsg.textContent = '';
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_) { /* ignore */ }
  if (!tab || !tab.id) { applyMsg.textContent = 'No active tab.'; return; }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/hljs.min.js', 'content.js'] });
    window.close();
  } catch (e) {
    console.error(e);
    applyMsg.textContent = /file/i.test(String(e && e.message))
      ? 'Enable "Allow access to file URLs" on the Details page.'
      : 'Cannot run on this page (a restricted page such as brave://).';
  }
}

enabled.addEventListener('change', () => chrome.storage.local.set({ cvEnabled: enabled.checked }));
favicon.addEventListener('change', () => chrome.storage.local.set({ cvFavicon: favicon.checked }));
wrap.addEventListener('change', () => chrome.storage.local.set({ cvWrap: wrap.checked }));
theme.addEventListener('change', () => chrome.storage.local.set({ cvTheme: theme.value }));

async function load() {
  let s = {};
  try { s = await chrome.storage.local.get(['cvEnabled', 'cvFavicon', 'cvWrap', 'cvTheme']); } catch (_) { /* ignore */ }
  enabled.checked = s.cvEnabled !== false;
  favicon.checked = s.cvFavicon !== false;
  wrap.checked = s.cvWrap === true;
  theme.value = s.cvTheme || 'auto';
}
