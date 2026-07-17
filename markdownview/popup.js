// MarkdownView -- popup. Toggles rendering on/off and the default theme.

const enabled = document.getElementById('enabled');
const theme = document.getElementById('theme');

load();

enabled.addEventListener('change', () => {
  chrome.storage.local.set({ mdvEnabled: enabled.checked });
});
theme.addEventListener('change', () => {
  chrome.storage.local.set({ mdvTheme: theme.value });
});

async function load() {
  let s = {};
  try { s = await chrome.storage.local.get(['mdvEnabled', 'mdvTheme']); } catch (_) { /* ignore */ }
  enabled.checked = s.mdvEnabled !== false;
  theme.value = s.mdvTheme || 'auto';
}
