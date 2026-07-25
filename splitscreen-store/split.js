// Split Screen -- the split page.
// Arbitrary R x C grids of live pages, each pane resizable via draggable gutters.
// The whole layout (grid shape, sizes, pane URLs, name) is encoded into this tab's
// URL so you can bookmark a set with Ctrl+D; the tab wears the first pane's favicon.
// Header stripping (so sites load in a frame) is done by the service worker.

const container = document.getElementById('panes');
const addBtn = document.getElementById('addPane');
const gridBtn = document.getElementById('gridBtn');
const gridLabel = document.getElementById('gridLabel');
const gridPicker = document.getElementById('gridPicker');
const nameInput = document.getElementById('setName');
const iconInput = document.getElementById('setIcon');
const copyBtn = document.getElementById('copyLink');
const saveBtn = document.getElementById('saveSet');
const bookmarksEl = document.getElementById('bookmarks');
const favicon = document.getElementById('favicon');
const themeBtn = document.getElementById('themeBtn');
const themePanel = document.getElementById('themePanel');

let savedSets = [];

// Global image carousel shared by EVERY blank pane. Stored as shrunk JPEG data
// URLs (persisted), so it survives reloads and any new/emptied pane picks it up.
let carouselImgs = [];

const MAX_TRACKS = 6;
const MIN_SIZE = 80;

const panes = [];        // arbitrary length, row-major
let paneSeq = 0;         // names each pane's iframe so it can report its URL back
let cols = 2;            // number of columns; rows derive from panes.length
let colSizes = [1, 1];   // fr weight per column
let rowSizes = [1];      // fr weight per row
let setName = '';
let setIcon = '';   // optional per-set tab icon (emoji)

// Declared up here, NOT next to notifyAlive() where it is used, and that placement
// is deliberate. `restore()` runs at the top level of this file, and it calls
// save() -> notifyAlive(), which touches this variable. A `let` further down the
// file is still in its temporal dead zone at that moment, so reading it threw
// "Cannot access 'aliveTimer' before initialization" -- and because that throw
// escaped during initialization, every listener wired up after restore() (the
// settings gear among them) was never attached. Keep this above restore().
let aliveTimer = null;
let building = false;    // suppress persistence while bulk-building

function rowCount() { return Math.max(1, Math.ceil(panes.length / cols)); }

// Enable framing for this tab before loading any URL.
const framingReady = (async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'enableFraming' });
    return !!(res && res.ok);
  } catch (e) {
    console.error('[Split Screen] could not enable framing', e);
    return false;
  }
})();

addBtn.addEventListener('click', () => {
  const p = createPaneObj();
  relayout();
  save();
  p.urlInput.focus();
});
gridBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleGridPicker(); });
document.getElementById('newGrid').addEventListener('click', () => {
  // A fresh grid in its own tab -- clean split.html, no ?set=, so it opens as a new
  // 2-pane workspace without disturbing this one.
  const url = chrome.runtime.getURL('split.html');
  try { chrome.tabs.create({ url }); } catch (_) { window.open(url, '_blank'); }
});
nameInput.addEventListener('input', () => { setName = nameInput.value; save(); refreshAllBookmarks(); });
iconInput.addEventListener('input', () => { setIcon = iconInput.value.trim(); save(); });
copyBtn.addEventListener('click', onCopyLink);
saveBtn.addEventListener('click', saveCurrentSet);

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.tab-menu') && !e.target.closest('.tabs')) closeMenus();
  if (!e.target.closest('.grid-picker') && !e.target.closest('#gridBtn')) gridPicker.hidden = true;
  if (!e.target.closest('.theme-panel') && !e.target.closest('#themeBtn')) themePanel.hidden = true;
});

// The service worker asks us to add a pane when you use the right-click menu.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'addPane' && msg.url) fillFirstEmpty(msg.url);
});

// Keep the open-tab lists fresh as tabs come and go.
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAllTabLists, 250);
}
try {
  chrome.tabs.onCreated.addListener(scheduleRefresh);
  chrome.tabs.onRemoved.addListener(scheduleRefresh);
} catch (_) { /* events unavailable */ }

// (Initialization runs at the BOTTOM of this file -- see the note down there.)

// ---- appearance ----
// The split page is our own extension page, so unlike browser chrome we can style it
// freely. Everything here just overrides the :root custom properties the stylesheet
// already uses. Stored in storage.local rather than in the set snapshot: a background
// image would bloat the bookmarkable URL far past what a URL can carry.

const THEME_DEFAULT = { bg: '#1b1e24', bar: '#23272f', accent: '#14b8a6', text: '#e7ebf1', img: '', dim: 35 };
// Colour-only presets (the swatch row): set the four colours, leave the banner.
const THEME_PRESETS = {
  Default:  { bg: '#1b1e24', bar: '#23272f', accent: '#14b8a6', text: '#e7ebf1' },
  Navy:     { bg: '#001028', bar: '#0a1834', accent: '#5b9dff', text: '#f2f5fa' },
  Graphite: { bg: '#17191c', bar: '#232629', accent: '#8ab4f8', text: '#f2f3f5' },
  Forest:   { bg: '#0d1f16', bar: '#123024', accent: '#4ade80', text: '#eaf5ee' },
  Plum:     { bg: '#1d1230', bar: '#2a1a45', accent: '#c084fc', text: '#f4eefc' },
  Paper:    { bg: '#eceef2', bar: '#f7f8fa', accent: '#1a56db', text: '#1b1f24' },
  Crimson:  { bg: '#1a0d10', bar: '#2a141a', accent: '#fb7185', text: '#fbe9ec' },
  Mint:     { bg: '#08201c', bar: '#0f312b', accent: '#2dd4bf', text: '#e6faf5' },
  Amber:    { bg: '#1c1503', bar: '#2c2208', accent: '#fbbf24', text: '#fbf4e2' },
  Slate:    { bg: '#0f172a', bar: '#1e293b', accent: '#94a3b8', text: '#eef2f7' }
};

// Built-in banner gradients (kept as lightweight extra options alongside the
// bundled photos). Each renders to an SVG data URL that flows through the same
// theme.img pipeline as an image, so no file is needed.
const BANNER_DEFS = {
  Dusk:  ['#2d1b4e', '#5b21b6', '#db2777'],
  Ember: ['#7c2d12', '#c2410c', '#f59e0b'],
  Tide:  ['#083344', '#0e7490', '#22d3ee'],
  Steel: ['#0f172a', '#334155', '#64748b']
};

// Bundled photographic banners. name -> path relative to split.html.
const IMAGE_BANNERS = {
  Sunset:   'banners/sunset.png',
  Ocean:    'banners/ocean.png',
  Twilight: 'banners/twilight.png',
  Forest:   'banners/forest.png',
  Aurora:   'banners/aurora.png',
  America:  'banners/america.png',
  Bubbles:  'banners/bubbles.png'
};

// One-click full "looks": colours AND a coordinated banner together. `img` gives
// a bundled image path; `banner` names a gradient in BANNER_DEFS instead.
const LOOK_PRESETS = {
  Bubbles:  { bg: '#272027', bar: '#3a303a', accent: '#cf9be0', text: '#eae6ea', img: 'banners/bubbles.png' },
  Sunset:   { bg: '#1a0f0a', bar: '#2a1810', accent: '#f59e0b', text: '#fdf0e6', img: 'banners/sunset.png' },
  Ocean:    { bg: '#04141f', bar: '#0a2434', accent: '#22d3ee', text: '#e6f6fb', img: 'banners/ocean.png' },
  Twilight: { bg: '#14091f', bar: '#221033', accent: '#c084fc', text: '#f4eefc', img: 'banners/twilight.png' },
  Woods:    { bg: '#0a1a0f', bar: '#122a1a', accent: '#4ade80', text: '#eafaf0', img: 'banners/forest.png' },
  Aurora:   { bg: '#0a1020', bar: '#141c32', accent: '#8ab4f8', text: '#eef2fb', img: 'banners/aurora.png' },
  America:  { bg: '#242c37', bar: '#364252', accent: '#6aa9ff', text: '#eaedf2', img: 'banners/america.png' },
  Mono:     { bg: '#0f1115', bar: '#1b1f26', accent: '#94a3b8', text: '#e7ebf1', banner: 'Steel' }
};

// A look's banner is either its bundled image or its named gradient.
function lookBanner(L) { return L.img || svgGradient(BANNER_DEFS[L.banner] || []); }

function svgGradient(colors) {
  const n = Math.max(1, colors.length - 1);
  const stops = colors
    .map((c, i) => `<stop offset='${Math.round((i / n) * 100)}%' stop-color='${c}'/>`)
    .join('');
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='120'>" +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='0'>${stops}</linearGradient></defs>` +
    "<rect width='1920' height='120' fill='url(#g)'/></svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function bannerCss(colors) { return 'linear-gradient(90deg,' + colors.join(',') + ')'; }
let theme = { ...THEME_DEFAULT };

function applyTheme(t) {
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--bar', t.bar);
  r.setProperty('--text', t.text);
  r.setProperty('--accent', t.accent);
  r.setProperty('--accent-hi', t.accent);
  r.setProperty('--divider-hi', t.accent);
  r.setProperty('--dim', (t.dim ?? 35) / 100);
  // The banner is painted by a fixed ::before layer (see split.css) that reads
  // --bg-img; the bars in the band are transparent windows onto it. Setting a var
  // rather than an element background is what lets one image span the toolbar, the
  // saved-sets bar and the pane URL bars seamlessly.
  // Quoted so data URLs (which contain parens/commas, e.g. SVG gradients) and
  // relative file paths both parse cleanly inside url().
  r.setProperty('--bg-img', t.img ? 'url("' + t.img + '")' : 'none');
  document.body.classList.toggle('has-bgimg', !!t.img);
  if (t.img) updateBanner();
  document.getElementById('tpDimRow').hidden = !t.img;
  document.getElementById('tpClearImg').hidden = !t.img;
}

// Height of the banner strip = the header (toolbar + saved-sets bar) plus one pane
// URL bar, so the image reaches down through the URL row. It may run a touch tall
// without harm: the overshoot hides behind the opaque panes below the URL bars.
// Re-measured whenever the layout that changes those heights changes.
function bannerSize() {
  const header = document.querySelector('.header');
  const bar = document.querySelector('.pane-bar');
  return {
    w: Math.round(window.innerWidth),
    h: (header ? header.offsetHeight : 92) + (bar ? bar.offsetHeight : 44),
  };
}

function updateBanner() {
  document.documentElement.style.setProperty('--banner-h', bannerSize().h + 'px');
}

// The banner is stretched to exactly (window width x band height), so the image
// that fits with no distortion is one of those pixel dimensions. Show the live
// figure for THIS window so the number is real, not a guessed 1920-wide default.
function updateImgHint() {
  const el = document.getElementById('tpImgHint');
  if (!el) return;
  const { w, h } = bannerSize();
  el.innerHTML =
    `Fills the top bar. Ideal: <b>${w} &times; ${h}px</b> ` +
    `(a wide strip, about ${(w / h).toFixed(0)}:1). It is stretched to fit, so ` +
    `match the shape and any width works.`;
}

async function initTheme() {
  try {
    const saved = (await chrome.storage.local.get('splitTheme')).splitTheme;
    if (saved) theme = { ...THEME_DEFAULT, ...saved };
  } catch (_) { /* defaults */ }
  syncThemeInputs();
  applyTheme(theme);

  // Colors: swatch sets the four colours, leaves the banner alone.
  const presets = document.getElementById('tpPresets');
  Object.entries(THEME_PRESETS).forEach(([name, p]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = name; b.style.background = p.bg;
    b.addEventListener('click', () => { theme = { ...theme, ...p }; syncThemeInputs(); commitTheme(); });
    presets.appendChild(b);
  });

  // Looks: one click sets colours AND a coordinated banner.
  const looks = document.getElementById('tpLooks');
  Object.entries(LOOK_PRESETS).forEach(([name, L]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-look'; b.textContent = name;
    b.title = name + ' -- colours + banner';
    b.style.background = L.img
      ? 'center/cover no-repeat url("' + L.img + '")'
      : bannerCss(BANNER_DEFS[L.banner] || [L.bar, L.accent]);
    b.style.color = L.text;
    b.addEventListener('click', () => {
      theme = { ...theme, bg: L.bg, bar: L.bar, accent: L.accent, text: L.text, img: lookBanner(L) };
      syncThemeInputs(); commitTheme();
    });
    looks.appendChild(b);
  });

  // Banner: pick a built-in gradient (or None) without touching colours.
  const banners = document.getElementById('tpBanners');
  const none = document.createElement('button');
  none.type = 'button'; none.className = 'tp-banner none'; none.title = 'No banner';
  none.textContent = '∅';
  none.addEventListener('click', () => { theme = { ...theme, img: '' }; commitTheme(); });
  banners.appendChild(none);
  Object.entries(BANNER_DEFS).forEach(([name, cols]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-banner'; b.title = name;
    b.style.background = bannerCss(cols);
    b.addEventListener('click', () => { theme = { ...theme, img: svgGradient(cols) }; commitTheme(); });
    banners.appendChild(b);
  });
  // Bundled image banners.
  Object.entries(IMAGE_BANNERS).forEach(([name, path]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-banner img'; b.title = name;
    b.style.background = 'center/cover no-repeat url("' + path + '")';
    b.addEventListener('click', () => { theme = { ...theme, img: path }; commitTheme(); });
    banners.appendChild(b);
  });

  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themePanel.hidden = !themePanel.hidden;
    if (!themePanel.hidden) updateImgHint(); // refresh dims each time it opens
  });
  updateImgHint();
  const bind = (id, key) => document.getElementById(id).addEventListener('input', (e) => {
    theme[key] = e.target.value; commitTheme();
  });
  bind('tpBg', 'bg'); bind('tpBar', 'bar'); bind('tpAccent', 'accent'); bind('tpText', 'text');

  document.getElementById('tpDim').addEventListener('input', (e) => {
    theme.dim = Number(e.target.value);
    document.getElementById('tpDimVal').textContent = theme.dim + '%';
    commitTheme();
  });
  document.getElementById('tpImg').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      theme.img = await shrinkImage(f, 2560, 1600);
      commitTheme();
    } catch (_) { /* ignore */ }
    e.target.value = '';
  });
  document.getElementById('tpClearImg').addEventListener('click', () => {
    theme.img = ''; commitTheme();
  });
  document.getElementById('tpReset').addEventListener('click', () => {
    theme = { ...THEME_DEFAULT }; syncThemeInputs(); commitTheme();
  });

}

function syncThemeInputs() {
  document.getElementById('tpBg').value = theme.bg;
  document.getElementById('tpBar').value = theme.bar;
  document.getElementById('tpAccent').value = theme.accent;
  document.getElementById('tpText').value = theme.text;
  document.getElementById('tpDim').value = theme.dim ?? 35;
  document.getElementById('tpDimVal').textContent = (theme.dim ?? 35) + '%';
}

function saveTheme() {
  try { chrome.storage.local.set({ splitTheme: theme }); } catch (_) { /* ignore */ }
}

// ---- per-workspace theming --------------------------------------------------
// Each saved workspace carries its own look. The tab's live `theme` is the working
// copy (persisted as splitTheme for reload continuity); when the current layout IS
// a saved workspace, edits fold back into that workspace so switching to it later
// restores the same room.

function syncActiveSetTheme() {
  if (!setName) return;
  const s = savedSets.find((x) => x.name === setName);
  if (s) { s.theme = { ...theme }; persistSaved(); }
}

// One call for every theme edit: repaint, persist the working theme, fold into the
// active workspace.
function commitTheme() {
  applyTheme(theme);
  saveTheme();
  syncActiveSetTheme();
}

// Switching TO a workspace applies its saved theme (if it has one). This is a
// switch, not an edit, so it does not write back.
function applyWorkspaceTheme(set) {
  if (!set || !set.theme) return;
  theme = { ...THEME_DEFAULT, ...set.theme };
  syncThemeInputs();
  applyTheme(theme);
  saveTheme();
}

// Re-encode to PNG at a sane size: a phone photo would otherwise sit in storage as a
// multi-megabyte data URL and get read on every page load.
function shrinkImage(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('read failed'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error('decode failed'));
      im.onload = () => {
        const s = Math.min(1, maxW / im.naturalWidth, maxH / im.naturalHeight);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * s));
        c.height = Math.max(1, Math.round(im.naturalHeight * s));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      im.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

// ---- panes ----

function createPaneObj() {
  const el = document.createElement('div');
  el.className = 'pane';
  el.innerHTML =
    '<div class="pane-bar">' +
      '<button class="icon grip" title="Drag to move this pane">⠿</button>' +
      '<button class="icon back" title="Back">‹</button>' +
      '<button class="icon fwd" title="Forward">›</button>' +
      '<button class="icon reload" title="Reload">↻</button>' +
      '<input class="url" type="text" spellcheck="false" placeholder="Enter a URL or search, then press Enter">' +
      '<button class="icon star" title="Bookmark this page in the current workspace">☆</button>' +
      '<button class="icon tabs" title="Choose an open tab">☰</button>' +
      '<button class="icon open" title="Open in a new window">↗</button>' +
      '<button class="icon close" title="Remove pane">✕</button>' +
      '<div class="tab-menu" hidden><div class="tablist"></div></div>' +
    '</div>' +
    '<div class="frame-wrap empty-state">' +
      '<iframe sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation" allow="fullscreen; autoplay; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      '<div class="empty"><div class="empty-inner">' +
        '<div class="bm-section" hidden><p class="empty-hint">This workspace\'s bookmarks:</p>' +
          '<div class="bmlist"></div></div>' +
        '<p class="empty-hint">Type a URL above, or pick an open tab:</p>' +
        '<div class="tablist"></div>' +
        '<div class="empty-or">or</div>' +
        '<button class="carousel-add" type="button">🖼 Show a carousel of my images</button>' +
        '<p class="empty-sub">shown in every blank pane</p>' +
      '</div></div>' +
      // outside .empty so it stays clickable even while the carousel is showing
      '<input class="carousel-file" type="file" accept="image/*" multiple hidden>' +
      '<div class="carousel" hidden>' +
        '<img class="carousel-img" alt="" draggable="false">' +
        '<button class="carousel-nav prev" type="button" title="Previous (←)">‹</button>' +
        '<button class="carousel-nav next" type="button" title="Next (→)">›</button>' +
        '<div class="carousel-count"></div>' +
        '<button class="carousel-nav add-more" type="button" title="Add / replace images">＋</button>' +
        '<button class="carousel-nav close" type="button" title="Close carousel">✕</button>' +
      '</div>' +
    '</div>';

  // Name the frame: window.name survives navigation inside it, so the pane
  // stays identifiable however deep the user clicks (see panewatch.js).
  const ifr = el.querySelector('iframe');
  ifr.name = 'splitpane:' + (++paneSeq);

  const menu = el.querySelector('.tab-menu');
  const pane = {
    el,
    url: '',
    iframe: el.querySelector('iframe'),
    urlInput: el.querySelector('.url'),
    wrap: el.querySelector('.frame-wrap'),
    menu,
    menuList: menu.querySelector('.tablist'),
    overlayList: el.querySelector('.frame-wrap .tablist')
  };
  el.__pane = pane;
  pane.menuList.__pane = pane;
  pane.overlayList.__pane = pane;

  el.querySelector('.back').addEventListener('click', () => paneNav(pane, -1));
  el.querySelector('.fwd').addEventListener('click', () => paneNav(pane, 1));
  el.querySelector('.reload').addEventListener('click', () => reload(pane));
  el.querySelector('.open').addEventListener('click', () => {
    if (!pane.url) return;
    // A real new browser window, not a tab. chrome.windows.create is available on
    // our extension page; fall back to a popup window if it somehow isn't.
    try { chrome.windows.create({ url: pane.url, focused: true }); }
    catch (_) { window.open(pane.url, '_blank', 'noopener,width=1280,height=860'); }
  });
  el.querySelector('.close').addEventListener('click', () => removePane(pane));
  el.querySelector('.tabs').addEventListener('click', () => toggleMenu(pane));
  el.querySelector('.star').addEventListener('click', () => toggleBookmark(pane));

  // Image carousel: the shared image set shown in every blank pane. Uploading or
  // clearing from ANY pane updates all of them; prev/next steps only this pane.
  pane.carIdx = 0;
  const cfile = el.querySelector('.carousel-file');
  el.querySelector('.carousel-add').addEventListener('click', () => cfile.click());
  el.querySelector('.carousel .add-more').addEventListener('click', () => cfile.click());
  cfile.addEventListener('change', () => { setCarouselFromFiles(cfile.files); cfile.value = ''; });
  el.querySelector('.carousel .prev').addEventListener('click', () => stepCarousel(pane, -1));
  el.querySelector('.carousel .next').addEventListener('click', () => stepCarousel(pane, 1));
  el.querySelector('.carousel-img').addEventListener('click', () => stepCarousel(pane, 1));
  el.querySelector('.carousel .close').addEventListener('click', () => clearCarousel());

  pane.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(pane, pane.urlInput.value);
  });
  wireReorder(pane, el);

  container.appendChild(el);
  panes.push(pane);
  renderTabList(pane.overlayList, pane);
  renderPaneCarousel(pane);   // a fresh blank pane shows the shared carousel if set
  renderPaneBookmarks(pane);  // ...and the current workspace's bookmarks
  updatePaneStar(pane);
  return pane;
}

// ---- per-workspace bookmarks ------------------------------------------------
// Each saved workspace holds a list of links. They cost ~nothing until opened
// (that's the memory win over keeping every page as a live tab): a blank pane
// lists them, one click loads one, the star saves the current page into them.

function activeWorkspace() {
  return setName ? savedSets.find((s) => s.name === setName) : null;
}

function toggleBookmark(pane) {
  const ws = activeWorkspace();
  if (!ws) { toast('Save this as a workspace first (＋ Workspace)'); return; }
  if (!pane.url) { toast('Load a page in this pane first'); return; }
  ws.links = ws.links || [];
  const at = ws.links.findIndex((l) => l.url === pane.url);
  if (at >= 0) { ws.links.splice(at, 1); toast('Removed bookmark'); }
  else { ws.links.push({ url: pane.url, title: domainOf(pane.url) || pane.url }); toast('Bookmarked'); }
  persistSaved();
  refreshAllBookmarks();
}

function removeBookmark(url) {
  const ws = activeWorkspace();
  if (!ws || !ws.links) return;
  ws.links = ws.links.filter((l) => l.url !== url);
  persistSaved();
  refreshAllBookmarks();
}

// A filled star means the pane's page is in the workspace's bookmarks.
function updatePaneStar(pane) {
  const star = pane.el.querySelector('.star');
  if (!star) return;
  const ws = activeWorkspace();
  const saved = !!(pane.url && ws && ws.links && ws.links.some((l) => l.url === pane.url));
  star.textContent = saved ? '★' : '☆';
  star.classList.toggle('on', saved);
}

function renderPaneBookmarks(pane) {
  const section = pane.el.querySelector('.bm-section');
  const list = pane.el.querySelector('.bmlist');
  if (!section || !list) return;
  const ws = activeWorkspace();
  const links = (ws && ws.links) || [];
  list.textContent = '';
  section.hidden = links.length === 0;
  for (const l of links) {
    const chip = document.createElement('div');
    chip.className = 'bm-link';
    chip.title = l.url;

    const fav = document.createElement('img');
    fav.referrerPolicy = 'no-referrer';
    fav.src = faviconHref(l.url);
    fav.onerror = () => { fav.src = 'icons/icon32.png'; };

    const nm = document.createElement('span');
    nm.className = 'bm-link-name';
    nm.textContent = l.title || l.url;

    const x = document.createElement('span');
    x.className = 'bm-link-x';
    x.textContent = '✕';
    x.title = 'Remove bookmark';
    x.addEventListener('click', (e) => { e.stopPropagation(); removeBookmark(l.url); });

    chip.append(fav, nm, x);
    chip.addEventListener('click', () => navigate(pane, l.url));
    list.appendChild(chip);
  }
}

function refreshAllBookmarks() {
  panes.forEach((p) => { renderPaneBookmarks(p); updatePaneStar(p); });
}

// ---- toast ------------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

function removePane(pane) {
  if (panes.length <= 1) { clearPane(pane); return; }
  const idx = panes.indexOf(pane);
  if (idx === -1) return;
  panes.splice(idx, 1);
  pane.el.remove();
  relayout();
  save();
}

function clearPane(pane) {
  pane.url = '';
  pane.urlInput.value = '';
  pane.iframe.src = 'about:blank';
  renderPaneCarousel(pane);   // show the shared carousel if any, else the empty prompt
  renderPaneBookmarks(pane);  // a now-blank pane offers the workspace's bookmarks
  updatePaneStar(pane);
  renderTabList(pane.overlayList, pane);
  save();
}

async function navigate(pane, raw) {
  const url = normalizeUrl(raw);
  if (!url) return;
  await framingReady;
  pane.url = url;
  pane.urlInput.value = url;
  renderPaneCarousel(pane);              // a loaded URL hides the shared carousel here
  pane.wrap.classList.remove('empty-state');
  pane.iframe.src = url;
  updatePaneStar(pane);                  // reflect whether this page is bookmarked
  closeMenus();
  save();
}

function reload(pane) {
  if (pane.url) pane.iframe.src = pane.url; // reassigning src reloads the frame
}

// Step this pane's frame back (-1) or forward (+1) through its own history. The
// content script inside the frame does the actual history.go (see panewatch.js);
// a cross-origin parent can't. postMessage to '*' is fine -- the payload carries
// no secrets and the receiver checks the message came from its parent.
function paneNav(pane, dir) {
  if (!pane.iframe || !pane.iframe.contentWindow) return;
  try { pane.iframe.contentWindow.postMessage({ __splitNav: dir }, '*'); } catch (_) { /* frame gone */ }
}

// ---- image carousel --------------------------------------------------------
// One shared set of images that every BLANK pane displays -- a backdrop for panes
// with no page loaded. The files never leave the machine: each is re-encoded to a
// shrunk JPEG data URL and kept in chrome.storage.local, so the set persists and
// any pane that later goes blank picks it up. object-fit:cover in the CSS makes
// each image fill its pane and crop the overflow (a wide image loses its sides)
// rather than distort.

function saveCarousel() {
  try { chrome.storage.local.set({ splitCarousel: carouselImgs }); } catch (_) { /* ignore */ }
}

// Replace the shared set from picked files, then show it in every blank pane.
async function setCarouselFromFiles(fileList) {
  const files = Array.from(fileList || [])
    .filter((f) => f.type.startsWith('image/'))
    .slice(0, 24);                     // bound how much we persist
  if (!files.length) return;
  const urls = [];
  for (const f of files) {
    try { urls.push(await shrinkImage(f, 1920, 1200)); } catch (_) { /* skip bad file */ }
  }
  if (!urls.length) return;
  carouselImgs = urls;
  saveCarousel();
  refreshAllCarousels(true);
}

function clearCarousel() {
  carouselImgs = [];
  saveCarousel();
  refreshAllCarousels();
}

// Re-render the carousel in every pane. `reset` staggers each pane's start index
// so a grid of blank panes shows a spread of the images rather than all the same.
function refreshAllCarousels(reset) {
  panes.forEach((p, i) => {
    if (reset) p.carIdx = carouselImgs.length ? i % carouselImgs.length : 0;
    renderPaneCarousel(p);
  });
}

function renderPaneCarousel(pane) {
  const car = pane.el.querySelector('.carousel');
  const has = carouselImgs.length > 0;
  if (pane.url || !has) {                       // a loaded page, or nothing to show
    car.hidden = true;
    pane.el.querySelector('.carousel-img').removeAttribute('src');
    pane.wrap.classList.remove('carousel-state');
    if (!pane.url) pane.wrap.classList.add('empty-state');
    return;
  }
  const n = carouselImgs.length;
  const idx = (((pane.carIdx || 0) % n) + n) % n;
  pane.carIdx = idx;
  pane.wrap.classList.remove('empty-state');
  pane.wrap.classList.add('carousel-state');
  car.hidden = false;
  pane.el.querySelector('.carousel-img').src = carouselImgs[idx];
  pane.el.querySelector('.carousel-count').textContent = (idx + 1) + ' / ' + n;
  const multi = n > 1;
  car.querySelector('.prev').style.display = multi ? '' : 'none';
  car.querySelector('.next').style.display = multi ? '' : 'none';
}

function stepCarousel(pane, d) {
  const n = carouselImgs.length;
  if (n < 2) return;
  pane.carIdx = (((pane.carIdx + d) % n) + n) % n;
  renderPaneCarousel(pane);
}

function fillFirstEmpty(url) {
  let pane = panes.find((p) => !p.url);
  if (!pane) { const p = createPaneObj(); relayout(); pane = p; }
  navigate(pane, url);
}

// ---- grid layout ----

// ---- drag a pane to reposition it in the grid ----
// panes[] is row-major and placePanes() maps index -> cell, so moving a pane is
// just swapping two array entries. Dragging is anchored to the grip handle so the
// URL field still selects text normally.
let dragSrc = null;

// Pointer-based rather than HTML5 drag-and-drop: native DnD is unreliable across
// iframes, and this matches how the resize gutters already work.
function wireReorder(pane, el) {
  const grip = el.querySelector('.grip');
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    beginReorder(pane, el);
  });
}

function beginReorder(pane, el) {
  dragSrc = pane;
  // Shield the iframes: with pointer-events live, elementFromPoint returns the
  // frame instead of the pane and you can never land on a pane showing a page.
  container.classList.add('reordering');
  el.classList.add('drag-source');
  let target = null;

  const move = (ev) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const hit = under && under.closest ? under.closest('.pane') : null;
    const next = (hit && hit.__pane && hit.__pane !== pane) ? hit : null;
    if (next === target) return;
    if (target) target.classList.remove('drop-target');
    target = next;
    if (target) target.classList.add('drop-target');
  };

  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (target && target.__pane) swapPanes(pane, target.__pane);
    endReorder();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function endReorder() {
  dragSrc = null;
  container.classList.remove('reordering');
  container.querySelectorAll('.pane').forEach((p) => {
    p.classList.remove('drop-target', 'drag-source');
  });
}

function swapPanes(a, b) {
  const i = panes.indexOf(a);
  const j = panes.indexOf(b);
  if (i === -1 || j === -1 || i === j) return;
  panes[i] = b;
  panes[j] = a;
  placePanes();
  save();   // persists the new order; also refreshes the tab's icon + title
}

function applyGrid(newCols, targetPanes) {
  cols = Math.max(1, Math.min(MAX_TRACKS, newCols));
  if (targetPanes) {
    while (panes.length < targetPanes) createPaneObj();
    // only trim trailing EMPTY panes -- never drop a loaded page
    while (panes.length > targetPanes && !panes[panes.length - 1].url) {
      const p = panes.pop();
      p.el.remove();
    }
  }
  relayout();
  save();
}

function relayout() {
  ensureSizes();
  applyTemplate();
  placePanes();
  buildGutters();
  gridLabel.textContent = cols + ' × ' + rowCount();
  updateBanner(); // grid/pane changes can alter the pane-bar row height
}

function ensureSizes() {
  colSizes = fitSizes(colSizes, cols);
  rowSizes = fitSizes(rowSizes, rowCount());
}
function fitSizes(arr, n) {
  const out = (arr || []).slice(0, n).map((x) => (x > 0 ? x : 1));
  while (out.length < n) out.push(1);
  return out;
}

function trackList(sizes) {
  const parts = [];
  for (let i = 0; i < sizes.length; i++) {
    parts.push(sizes[i] + 'fr');
    if (i < sizes.length - 1) parts.push('6px');
  }
  return parts.join(' ');
}
function applyTemplate() {
  container.style.gridTemplateColumns = trackList(colSizes);
  container.style.gridTemplateRows = trackList(rowSizes);
}

function placePanes() {
  for (let i = 0; i < panes.length; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    panes[i].el.style.gridColumn = String(2 * c + 1);
    panes[i].el.style.gridRow = String(2 * r + 1);
  }
}

function buildGutters() {
  container.querySelectorAll('.gutter').forEach((g) => g.remove());
  const rows = rowCount();
  for (let k = 0; k < cols - 1; k++) {
    const g = makeGutter('col', k);
    g.style.gridColumn = String(2 * k + 2);
    g.style.gridRow = '1 / -1';
    container.appendChild(g);
  }
  for (let k = 0; k < rows - 1; k++) {
    const g = makeGutter('row', k);
    g.style.gridRow = String(2 * k + 2);
    g.style.gridColumn = '1 / -1';
    container.appendChild(g);
  }
  // A draggable handle at every interior crossing -- resize row + column together.
  for (let kc = 0; kc < cols - 1; kc++) {
    for (let kr = 0; kr < rows - 1; kr++) {
      const c = document.createElement('div');
      c.className = 'gutter corner';
      c.title = 'Drag to resize both directions';
      c.style.gridColumn = String(2 * kc + 2);
      c.style.gridRow = String(2 * kr + 2);
      c.addEventListener('mousedown', (e) => onCornerDown(kc, kr, e));
      container.appendChild(c);
    }
  }
}

function makeGutter(kind, index) {
  const g = document.createElement('div');
  g.className = 'gutter ' + kind;
  g.addEventListener('mousedown', (e) => onGutterDown(kind, index, e));
  return g;
}

// Set up a resize of tracks k and k+1 along one axis. Returns a function that takes
// a pixel delta and repartitions just those two tracks (respecting MIN_SIZE), or
// null if k has no neighbour. Captures the starting geometry once, at grab time.
function axisResizer(kind, k) {
  const sizes = kind === 'col' ? colSizes : rowSizes;
  if (k + 1 >= sizes.length) return null;
  const containerPx = kind === 'col' ? container.clientWidth : container.clientHeight;
  const avail = Math.max(1, containerPx - (sizes.length - 1) * 6);
  const pxPerFr = avail / sizes.reduce((a, b) => a + b, 0);
  const totalFr = sizes[k] + sizes[k + 1];
  const combinedPx = totalFr * pxPerFr;
  const startKpx = sizes[k] * pxPerFr;
  return function (deltaPx) {
    const newK = Math.max(MIN_SIZE, Math.min(combinedPx - MIN_SIZE, startKpx + deltaPx));
    sizes[k] = totalFr * (newK / combinedPx);
    sizes[k + 1] = totalFr - sizes[k];
  };
}

function onGutterDown(kind, k, e) {
  e.preventDefault();
  const horizontal = kind === 'col';
  const resize = axisResizer(kind, k);
  if (!resize) return;
  const start = horizontal ? e.clientX : e.clientY;
  document.body.classList.add('dragging', horizontal ? 'col-resize' : 'row-resize');
  function move(ev) { resize((horizontal ? ev.clientX : ev.clientY) - start); applyTemplate(); }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('dragging', 'col-resize', 'row-resize');
    save();
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

// Corner drag: resize the column pair AND the row pair that meet at this crossing,
// reshaping all four surrounding panes at once. dx drives the columns, dy the rows.
function onCornerDown(kc, kr, e) {
  e.preventDefault();
  e.stopPropagation();
  const rc = axisResizer('col', kc);
  const rr = axisResizer('row', kr);
  if (!rc && !rr) return;
  const startX = e.clientX, startY = e.clientY;
  document.body.classList.add('dragging', 'corner-resize');
  function move(ev) {
    if (rc) rc(ev.clientX - startX);
    if (rr) rr(ev.clientY - startY);
    applyTemplate();
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('dragging', 'corner-resize');
    save();
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

// ---- grid-size picker ----

function buildGridPicker() {
  const grid = document.createElement('div');
  grid.className = 'gp-grid';
  const label = document.createElement('div');
  label.className = 'gp-label';
  label.textContent = 'Pick a grid';
  const cells = [];

  for (let r = 1; r <= MAX_TRACKS; r++) {
    for (let c = 1; c <= MAX_TRACKS; c++) {
      const cell = document.createElement('div');
      cell.className = 'gp-cell';
      cell.dataset.c = String(c);
      cell.dataset.r = String(r);
      cell.addEventListener('mouseenter', () => {
        for (const x of cells) {
          x.classList.toggle('on', Number(x.dataset.c) <= c && Number(x.dataset.r) <= r);
        }
        label.textContent = c + ' × ' + r;
      });
      cell.addEventListener('click', () => {
        applyGrid(c, c * r);
        gridPicker.hidden = true;
      });
      grid.appendChild(cell);
      cells.push(cell);
    }
  }
  gridPicker.appendChild(grid);
  gridPicker.appendChild(label);
}

function toggleGridPicker() {
  closeMenus();
  gridPicker.hidden = !gridPicker.hidden;
}

// ---- open-tabs picker ----

function toggleMenu(pane) {
  const wasOpen = !pane.menu.hidden;
  closeMenus();
  if (!wasOpen) {
    pane.menu.hidden = false;
    renderTabList(pane.menuList, pane);
  }
}
function closeMenus() {
  for (const p of panes) if (p.menu) p.menu.hidden = true;
}

async function renderTabList(target, pane) {
  target.textContent = 'Loading tabs...';
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) { target.textContent = 'Could not read open tabs.'; return; }
  fillTabList(target, pane, tabs);
}

function fillTabList(target, pane, tabs) {
  const selfPrefix = chrome.runtime.getURL('');
  const list = tabs.filter((t) => t.url && /^(https?|file):/i.test(t.url) && !t.url.startsWith(selfPrefix));
  target.textContent = '';
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'tab-empty';
    p.textContent = 'No open tabs to show.';
    target.appendChild(p);
    return;
  }
  for (const t of list) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tab-row';

    const fav = document.createElement('img');
    fav.className = 'fav';
    fav.width = 16;
    fav.height = 16;
    fav.referrerPolicy = 'no-referrer';
    fav.onerror = () => { fav.style.visibility = 'hidden'; };
    if (t.favIconUrl && /^(https?|data):/i.test(t.favIconUrl)) fav.src = t.favIconUrl;
    else fav.style.visibility = 'hidden';

    const text = document.createElement('span');
    text.className = 'tab-text';
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = t.title || t.url;
    const url = document.createElement('span');
    url.className = 'tab-url';
    url.textContent = prettyUrl(t.url);
    text.appendChild(title);
    text.appendChild(url);

    row.appendChild(fav);
    row.appendChild(text);
    row.addEventListener('click', () => navigate(pane, t.url));
    target.appendChild(row);
  }
}

async function refreshAllTabLists() {
  const lists = document.querySelectorAll('.tablist');
  if (!lists.length) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (_) { return; }
  for (const el of lists) if (el.__pane) fillTabList(el, el.__pane, tabs);
}

function prettyUrl(u) {
  return String(u).replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// ---- url handling ----

function normalizeUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^(about:|chrome:|brave:|edge:|view-source:)/i.test(raw)) return raw;
  if (!/\s/.test(raw) && /^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(raw)) return 'https://' + raw;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(raw);
}

// ---- the tab's identity: favicon (first pane) + title ----

// Local dev servers are all "localhost" and almost never serve a favicon, so
// Chrome's favicon cache hands back the same blank globe for every one of them.
// For those we synthesize an icon instead: a colour derived from host:port, with
// the port number stamped on it -- so :26717 and :3000 are told apart at a glance.
const LOCAL_HOST_RE = /^(localhost|127(?:\.\d+){3}|\[?::1\]?|0\.0\.0\.0)$/i;

function isLocalUrl(pageUrl) {
  try {
    const h = new URL(pageUrl).hostname;
    return LOCAL_HOST_RE.test(h) || /^192\.168\./.test(h) || /^10\./.test(h) ||
           /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch (_) { return false; }
}

const portIconCache = new Map();

// FNV-1a + murmur3 finalizer. A plain `h*31 + char` hash is useless here: keys
// that differ only in the last character (localhost:3000 vs :3001) land on
// adjacent hues and render as the same colour. The avalanche step scatters them.
function hashKey(key) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function portIcon(port, key) {
  if (portIconCache.has(key)) return portIconCache.get(key);
  // deterministic hue from the full host:port, so a port keeps its colour forever
  const h = hashKey(key);
  const hue = h % 360;

  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  // second axis: two unrelated ports that happen to land on a close hue still
  // differ in lightness, so they don't read as the same badge
  const light = 38 + ((h >>> 16) % 15);
  const r = 13;                                  // rounded-square badge
  g.fillStyle = `hsl(${hue}, 62%, ${light}%)`;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(S, 0, S, S, r); g.arcTo(S, S, 0, S, r);
  g.arcTo(0, S, 0, 0, r); g.arcTo(0, 0, S, 0, r);
  g.closePath(); g.fill();

  const label = String(port);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = label.length >= 5 ? 21 : label.length === 4 ? 26 : 32;
  g.font = `bold ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  g.fillText(label, S / 2, S / 2 + 1);

  const url = c.toDataURL('image/png');
  portIconCache.set(key, url);
  return url;
}

function faviconApi(pageUrl, size) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size || 32));
  return u.toString();
}

// Chrome's favicon service always returns SOMETHING -- a generic globe when it has
// no icon for that page -- so you can't tell "real icon" from "nothing" by whether
// the image loads. Fingerprint the generic one once (ask for an address that can
// never exist), then compare. That way a dev server that DOES serve a favicon keeps
// its own icon, and the generated port badge is only used when there truly isn't one.
let defaultSigPromise = null;
const realIconCache = new Map();   // pageUrl -> true (real icon) | false (generic)

function iconSignature(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const g = c.getContext('2d');
        g.drawImage(im, 0, 0, 16, 16);
        resolve(c.toDataURL('image/png'));
      } catch (_) { resolve(null); }
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function defaultIconSig() {
  if (!defaultSigPromise) {
    defaultSigPromise = iconSignature(faviconApi('http://no-such-host.invalid/', 32));
  }
  return defaultSigPromise;
}

async function hasRealFavicon(pageUrl) {
  if (realIconCache.has(pageUrl)) return realIconCache.get(pageUrl);
  const [sig, def] = await Promise.all([iconSignature(faviconApi(pageUrl, 32)), defaultIconSig()]);
  const real = !!sig && sig !== def;
  realIconCache.set(pageUrl, real);
  return real;
}

function faviconHref(pageUrl) {
  if (isLocalUrl(pageUrl)) {
    // Real favicon wins whenever the browser has one -- localhost or not.
    if (realIconCache.get(pageUrl) === true) return faviconApi(pageUrl, 32);
    if (!realIconCache.has(pageUrl)) {
      // Probe once; if it turns out to have a real icon, re-badge the tab.
      hasRealFavicon(pageUrl).then((real) => { if (real) updateIdentity(); });
    }
    try {
      const u = new URL(pageUrl);
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      return portIcon(port, u.hostname + ':' + port);   // fallback: no icon served
    } catch (_) { /* fall through */ }
  }
  return faviconApi(pageUrl, 32);
}

// Keep the port in the label -- otherwise every dev server reads "localhost".
function domainOf(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    return url.port ? host + ':' + url.port : host;
  } catch (_) { return ''; }
}
const glyphCache = new Map();

// Render a chosen emoji to a real PNG. Setting <link rel=icon> straight to an
// emoji character doesn't work -- it has to be an image.
function glyphIcon(glyph) {
  if (glyphCache.has(glyph)) return glyphCache.get(glyph);
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const chars = Array.from(glyph).length;
  g.font = (chars > 1 ? 32 : 52) +
    'px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",system-ui,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, S / 2, S / 2 + 4);
  const url = c.toDataURL('image/png');
  glyphCache.set(glyph, url);
  return url;
}

// ---- keep each pane's address bar in step with in-frame navigation ----
// A cross-origin frame won't expose its location, so the pane tells us (panewatch.js).
// Only believe it if the message really came from one of our panes' windows --
// comparing window identity is allowed cross-origin, reading their URL is not.
let urlSaveTimer = null;
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d.__splitPaneUrl !== 'string') return;
  const pane = panes.find((p) => p.iframe && p.iframe.contentWindow === e.source);
  if (!pane) return;
  const href = d.__splitPaneUrl;
  if (!href || href === 'about:blank' || href === pane.url) return;
  pane.url = href;
  // don't fight the user if they're mid-edit in that box
  if (document.activeElement !== pane.urlInput) pane.urlInput.value = href;
  clearTimeout(urlSaveTimer);
  urlSaveTimer = setTimeout(() => save(), 500);   // persists state + bookmarkable link
});

function updateIdentity() {
  const first = panes.find((p) => p.url);
  // An explicit per-set icon wins over the first pane's favicon.
  favicon.href = setIcon ? glyphIcon(setIcon)
    : (first ? faviconHref(first.url) : 'icons/icon32.png');

  const domains = [...new Set(panes.map((p) => p.url).filter(Boolean).map(domainOf).filter(Boolean))];
  document.title = setName || (domains.length ? domains.slice(0, 3).join(' | ') : 'Split Screen');
}

// ---- persistence + bookmarkable URL ----

function snapshot() {
  return {
    c: cols,
    cs: colSizes.map((x) => Math.round(x * 1000) / 1000),
    rs: rowSizes.map((x) => Math.round(x * 1000) / 1000),
    n: setName,
    i: setIcon,
    u: panes.map((p) => p.url || '')
  };
}

// (aliveTimer is declared at the top of the file -- see the note there.)
function notifyAlive(enc) {
  clearTimeout(aliveTimer);
  aliveTimer = setTimeout(() => {
    try { chrome.runtime.sendMessage({ type: 'splitAlive', set: enc }); } catch (_) { /* ignore */ }
  }, 400);
}

// The layout is mirrored into the tab's ?set= URL so a set stays bookmarkable.
// But writing it on EVERY change (each pane load, resize, in-frame navigation)
// made Brave log a browser-history visit per distinct URL -- dozens per session.
// So defer + dedupe the URL write: a burst of edits collapses to a single history
// entry once things settle. State (storage) and reopen-recording still happen
// immediately in save(); only the visible/bookmarkable URL is debounced.
let urlTimer = null;
let lastUrlEnc = null;
let pendingUrlEnc = null;
function flushUrl() {
  clearTimeout(urlTimer); urlTimer = null;
  if (pendingUrlEnc && pendingUrlEnc !== lastUrlEnc) {
    try {
      history.replaceState(null, '', location.pathname + '?set=' + pendingUrlEnc);
      lastUrlEnc = pendingUrlEnc;
    } catch (_) { /* ignore */ }
  }
}

function save() {
  if (building) return;
  const snap = snapshot();
  try { chrome.storage.local.set({ splitState: snap }); } catch (_) { /* ignore */ }
  let enc = '';
  try { enc = b64urlEncode(JSON.stringify(snap)); } catch (_) { /* ignore */ }
  if (enc && enc !== lastUrlEnc) {
    pendingUrlEnc = enc;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(flushUrl, 1500);   // one history entry per settled state
  }
  if (enc) notifyAlive(enc);           // let the worker record this tab so a reload can reopen it
  updateIdentity();
  updateActiveChips();
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(b) {
  b = b.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function buildFromSnapshot(snap, firstOverride) {
  cols = Math.max(1, Math.min(MAX_TRACKS, snap.c || 2));
  setName = snap.n || '';
  nameInput.value = setName;
  setIcon = snap.i || '';
  iconInput.value = setIcon;
  const urls = Array.isArray(snap.u) ? snap.u : [];
  const count = Math.max(1, urls.length);
  for (let i = 0; i < count; i++) createPaneObj();
  colSizes = fitSizes(snap.cs, cols);
  rowSizes = fitSizes(snap.rs, rowCount());
  relayout();
  urls.forEach((u, i) => {
    const target = (i === 0 && firstOverride) ? firstOverride : u;
    if (target) navigate(panes[i], target);
  });
}

async function restore() {
  building = true;
  const params = new URLSearchParams(location.search);
  const setParam = params.get('set');
  const first = params.get('first') || '';   // page you launched from
  const add = params.get('add') || '';        // page sent from the right-click menu

  let loaded = false;
  if (setParam) {
    try { buildFromSnapshot(JSON.parse(b64urlDecode(setParam)), first); loaded = true; } catch (_) { /* fall through */ }
  }
  if (!loaded) {
    let snap = null;
    try { snap = (await chrome.storage.local.get('splitState')).splitState; } catch (_) { /* ignore */ }
    if (snap && Array.isArray(snap.u) && snap.u.length) {
      buildFromSnapshot(snap, first);
    } else {
      cols = 2;
      createPaneObj();
      createPaneObj();
      colSizes = [1, 1];
      rowSizes = [1];
      relayout();
      if (first) navigate(panes[0], first);
    }
  }

  building = false;
  if (add) fillFirstEmpty(add);
  // A reopened tab wears its workspace's own theme, if the layout matches a saved
  // one by name. Otherwise the working theme (splitTheme, already applied) stands.
  const ws = setName ? savedSets.find((s) => s.name === setName) : null;
  if (ws) applyWorkspaceTheme(ws);
  refreshAllBookmarks();           // a reopened workspace shows its bookmark library
  save();
}

// ---- saved sets (in-extension bookmarks bar) ----

async function initBookmarks() {
  try { savedSets = (await chrome.storage.local.get('savedSets')).savedSets || []; } catch (_) { savedSets = []; }
  if (!Array.isArray(savedSets)) savedSets = [];
  renderBookmarks();
}

function persistSaved() {
  try { chrome.storage.local.set({ savedSets }); } catch (_) { /* ignore */ }
}

function saveCurrentSet() {
  const snap = snapshot();
  const firstDom = (() => { const p = panes.find((x) => x.url); return p ? domainOf(p.url) : ''; })();
  const name = String(setName || firstDom).trim().slice(0, 40)
    || 'Workspace ' + (savedSets.length + 1);
  // If the user is clearly on an existing workspace by this name, update it in place
  // (theme + seeded bookmarks) rather than pushing a duplicate.
  const existing = savedSets.find((s) => s.name === name);
  // Seed the workspace's bookmarks with the pages it currently holds, so it opens
  // as a ready library rather than empty.
  const seeded = [...new Set(panes.map((p) => p.url).filter(Boolean))]
    .map((u) => ({ url: u, title: domainOf(u) || u }));
  if (existing) {
    existing.snap = snap;
    existing.theme = { ...theme };
    existing.links = mergeLinks(existing.links || [], seeded);
  } else {
    savedSets.push({ id: 'set_' + Date.now(), name, snap, theme: { ...theme }, links: seeded });
  }
  if (!setName) { setName = name; nameInput.value = name; }
  persistSaved();
  renderBookmarks();
  refreshAllBookmarks();
  toast('Workspace saved');
}

// Union two link lists by URL, keeping order (existing first, then new).
function mergeLinks(a, b) {
  const seen = new Set(a.map((l) => l.url));
  return a.concat(b.filter((l) => !seen.has(l.url)));
}

function deleteSet(id) {
  savedSets = savedSets.filter((s) => s.id !== id);
  persistSaved();
  renderBookmarks();
}

function firstUrlOf(snap) {
  return (snap && Array.isArray(snap.u) ? snap.u.find(Boolean) : '') || '';
}

function renderBookmarks() {
  bookmarksEl.textContent = '';
  const label = document.createElement('span');
  label.className = 'bm-label';
  label.textContent = 'Workspaces:';
  bookmarksEl.appendChild(label);

  if (!savedSets.length) {
    const e = document.createElement('span');
    e.className = 'bm-empty';
    e.textContent = 'none yet -- build a layout and hit ＋ Workspace';
    bookmarksEl.appendChild(e);
    return;
  }

  for (const s of savedSets) {
    const chip = document.createElement('div');
    chip.className = 'bm-chip' + (s.name === setName && setName ? ' active' : '');
    chip.dataset.name = s.name;
    chip.title = 'Open "' + s.name + '"';

    const fav = document.createElement('img');
    fav.referrerPolicy = 'no-referrer';
    const fu = firstUrlOf(s.snap);
    fav.src = fu ? faviconHref(fu) : 'icons/icon32.png';
    fav.onerror = () => { fav.src = 'icons/icon32.png'; };

    const nm = document.createElement('span');
    nm.className = 'bm-name';
    nm.textContent = s.name;

    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '✕';
    x.title = 'Remove';
    x.addEventListener('click', (e) => { e.stopPropagation(); deleteSet(s.id); });

    chip.appendChild(fav);
    chip.appendChild(nm);
    chip.appendChild(x);
    chip.addEventListener('click', () => loadSet(s));
    bookmarksEl.appendChild(chip);
  }
  updateBanner(); // the saved-sets row can wrap to a new height, changing the band
}

function updateActiveChips() {
  for (const chip of bookmarksEl.querySelectorAll('.bm-chip')) {
    chip.classList.toggle('active', !!setName && chip.dataset.name === setName);
  }
}

function loadSet(set) {
  building = true;
  for (const p of panes) p.el.remove();
  panes.length = 0;
  container.querySelectorAll('.gutter').forEach((g) => g.remove());
  buildFromSnapshot(set.snap);
  applyWorkspaceTheme(set);        // switch to this workspace's own look
  building = false;
  save();
  renderBookmarks();
  refreshAllBookmarks();           // show this workspace's link library in blank panes
}

// ---- copy bookmarkable link ----

async function onCopyLink() {
  const original = copyBtn.textContent;
  flushUrl();   // make sure the URL reflects the latest layout before copying it
  try {
    await navigator.clipboard.writeText(location.href);
    copyBtn.textContent = 'Copied ✓';
  } catch (e) {
    console.error(e);
    copyBtn.textContent = 'Copy failed';
  }
  setTimeout(() => { copyBtn.textContent = original; }, 1500);
}

// ---- init ----------------------------------------------------------------
// This block runs LAST, and that is load-bearing -- do not hoist it back to the
// top of the file.
//
// These four calls read module-level state (icon caches, LOCAL_HOST_RE, the
// theme presets) that is declared further down. Run them from the top and those
// `const`/`let` bindings are still in their temporal dead zone, so the first one
// touched throws "Cannot access X before initialization". That is not a
// contained failure: the throw escapes top-level evaluation, so every listener
// registered after it -- including the settings gear -- is never attached, and
// you get a split page you can look at but cannot configure.
//
// Running init after every declaration in the file has been evaluated makes that
// whole class of bug impossible rather than fixing it one variable at a time.
async function init() {
  // Await these: restore() matches the reopened layout against savedSets to apply
  // that workspace's theme, so the saved sets (and the working theme) must be
  // loaded first.
  await initBookmarks();
  await initTheme();
  buildGridPicker();
  // the banner strip height tracks the header + URL bar, which change on resize
  window.addEventListener('resize', () => { updateBanner(); updateImgHint(); });
  // restore() rebuilds the entire layout from storage, so it touches the most
  // state and is the likeliest thing here to throw. Contained so that a bad
  // restore costs you the restore and nothing else.
  try {
    await restore();
  } catch (e) {
    console.error('[Split Screen] restore failed; continuing with an empty layout', e);
  }
  // Load the shared blank-pane carousel and paint it into whatever panes are blank.
  chrome.storage.local.get('splitCarousel').then((o) => {
    if (Array.isArray(o.splitCarousel) && o.splitCarousel.length) {
      carouselImgs = o.splitCarousel;
      refreshAllCarousels(true);
    }
  }).catch(() => { /* ignore */ });
}

init();
