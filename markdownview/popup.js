// MarkdownView -- popup. Toggles rendering on/off and the default theme.

const enabled = document.getElementById('enabled');
const favicon = document.getElementById('favicon');
const theme = document.getElementById('theme');

load();

enabled.addEventListener('change', () => {
  chrome.storage.local.set({ mdvEnabled: enabled.checked });
});
favicon.addEventListener('change', () => {
  chrome.storage.local.set({ mdvFavicon: favicon.checked });
});
theme.addEventListener('change', () => {
  chrome.storage.local.set({ mdvTheme: theme.value });
});

async function load() {
  let s = {};
  try { s = await chrome.storage.local.get(['mdvEnabled', 'mdvTheme', 'mdvFavicon']); } catch (_) { /* ignore */ }
  enabled.checked = s.mdvEnabled !== false;
  favicon.checked = s.mdvFavicon !== false;
  theme.value = s.mdvTheme || 'auto';
}
