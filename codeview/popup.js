// Code Viewer -- popup. Toggles highlighting, favicon, default wrap, and theme.

const enabled = document.getElementById('enabled');
const favicon = document.getElementById('favicon');
const wrap = document.getElementById('wrap');
const theme = document.getElementById('theme');

load();

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
