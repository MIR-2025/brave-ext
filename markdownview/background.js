// MarkdownView -- service worker.
//
// The content script only auto-runs on markdown-LOOKING URLs (*.md and friends).
// Plenty of markdown never matches that: a raw endpoint, an API response, a .txt,
// a gist URL with a query string. These right-click entries force the renderer onto
// whatever you're looking at.
//
// Permissions stay minimal on purpose: no host_permissions. `activeTab` grants
// access only at the moment you invoke a menu item, and only for that tab.

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'mdv-page',
      title: 'Render this page as Markdown',
      contexts: ['page', 'frame']      // 'frame' so it works inside a Split Screen pane
    });
    chrome.contextMenus.create({
      id: 'mdv-selection',
      title: 'Render selection as Markdown',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id == null) return;
  const id = String(info.menuItemId);
  if (id !== 'mdv-page' && id !== 'mdv-selection') return;
  // Target the exact frame that was right-clicked, so this works inside an iframe.
  const frameIds = typeof info.frameId === 'number' ? [info.frameId] : undefined;
  await renderNow(tab.id, frameIds, id === 'mdv-selection' ? 'selection' : 'page');
});

async function renderNow(tabId, frameIds, mode) {
  const target = frameIds ? { tabId, frameIds } : { tabId };
  try {
    // The declared content script brings markdown.css with it; an injected one
    // has to bring its own.
    await chrome.scripting.insertCSS({ target, files: ['markdown.css'] });
    await chrome.scripting.executeScript({ target, func: prime, args: [mode] });
    await chrome.scripting.executeScript({ target, files: ['lib/marked.umd.js', 'content.js'] });
    return true;
  } catch (e) {
    console.error('[MarkdownView]', e);
    return false;
  }
}

// Runs in the page's ISOLATED world -- the same world content.js is injected into,
// which is why it can see these flags.
function prime(mode) {
  window.__mdvForce = true;      // bypass the "does this look like markdown?" guard
  window.__mdvDone = false;      // allow a re-render if we've already run here
  if (mode === 'selection') {
    // Read the live selection rather than info.selectionText, which the browser
    // truncates -- we want the whole thing.
    try { window.__mdvRaw = String(window.getSelection() || ''); }
    catch (_) { window.__mdvRaw = ''; }
  } else {
    try { delete window.__mdvRaw; } catch (_) { window.__mdvRaw = undefined; }
  }
}
