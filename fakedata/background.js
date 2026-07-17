// FakeData -- service worker. Adds a right-click menu and the Alt+Shift+F command,
// both of which generate a fresh persona and inject fillPage into the active tab.
// filler.js provides generatePersona() and fillPage().

importScripts('filler.js');

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'fd-page', title: 'Fill this page with fake data', contexts: ['page', 'editable'] });
    chrome.contextMenus.create({ id: 'fd-field', title: 'Fill just this field', contexts: ['editable'] });
  });
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  const scope = info.menuItemId === 'fd-field' ? 'active' : 'page';
  await runFill(tab.id, scope);
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'fill') return;
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_) { return; }
  if (tab && tab.id) await runFill(tab.id, 'page');
});

async function getOptions() {
  const defaults = { overwrite: true, controls: true, onlyVisible: true };
  try {
    const o = (await chrome.storage.local.get('fdOptions')).fdOptions;
    return Object.assign(defaults, o || {});
  } catch (_) {
    return defaults;
  }
}

async function runFill(tabId, scope) {
  const persona = generatePersona();
  const options = await getOptions();
  options.scope = scope;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: scope !== 'active' },
      func: fillPage,
      args: [persona, options]
    });
  } catch (e) {
    console.error('[FakeData]', e);
  }
}
