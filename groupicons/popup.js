// Group Icons -- popup.
// Tab groups only carry a text title + a color from a fixed palette (no image
// field). So an emoji title IS the icon: set a group's title to an emoji and the
// tab strip shows that emoji as the group's label. This popup makes that easy,
// and lets you recolor groups too. Everything is local.

// The nine colors the tabGroups API accepts, with an approximate swatch hex.
const COLORS = [
  ['grey', '#5f6368'], ['blue', '#1a73e8'], ['red', '#d93025'],
  ['yellow', '#f9ab00'], ['green', '#188038'], ['pink', '#d01884'],
  ['purple', '#a142f4'], ['cyan', '#007b83'], ['orange', '#fa903e']
];

const EMOJI = [
  '⭐', '🎨', '🎵', '🎬', '📺', '🎮', '📧', '📰', '💬', '📚',
  '💻', '🐙', '🧪', '🔧', '⚙️', '🛒', '💰', '📈', '📊', '📷',
  '✅', '🔒', '🌐', '🎯', '🧠', '📝', '🔍', '🚀', '💡', '🔥',
  '❤️', '🏠', '☕', '🍿', '🌙', '🐛', '📌', '🗂️', '🧩', '🎧'
];

// "Emoji from favicon" really means "emoji from the site behind it": there is no
// reliable way to convert an arbitrary favicon image into a Unicode emoji, so we
// map domains (and a few keywords) to a fitting emoji instead.
const DOMAIN_EMOJI = {
  'github.com': '🐙', 'gitlab.com': '🦊', 'bitbucket.org': '🪣',
  'youtube.com': '📺', 'youtu.be': '📺', 'music.youtube.com': '🎵', 'vimeo.com': '🎞️', 'twitch.tv': '🎮',
  'mail.google.com': '📧', 'gmail.com': '📧', 'outlook.com': '📧', 'outlook.office.com': '📧', 'proton.me': '📧',
  'docs.google.com': '📄', 'sheets.google.com': '📊', 'slides.google.com': '📽️', 'drive.google.com': '📁',
  'calendar.google.com': '📅', 'meet.google.com': '🎥', 'maps.google.com': '🗺️', 'gemini.google.com': '🤖',
  'cloud.google.com': '☁️', 'google.com': '🔍',
  'twitter.com': '🐦', 'x.com': '🐦', 'reddit.com': '👽', 'facebook.com': '👥', 'instagram.com': '📷',
  'linkedin.com': '💼', 'tiktok.com': '🎵', 'threads.net': '🧵', 'mastodon.social': '🐘', 'bsky.app': '🦋', 'pinterest.com': '📌',
  'stackoverflow.com': '📚', 'stackexchange.com': '📚', 'developer.mozilla.org': '📘', 'npmjs.com': '📦', 'pypi.org': '🐍',
  'amazon.com': '🛒', 'ebay.com': '🏷️', 'etsy.com': '🧶', 'walmart.com': '🛒', 'aliexpress.com': '🛒',
  'netflix.com': '🎬', 'disneyplus.com': '🏰', 'hulu.com': '🎬', 'spotify.com': '🎵', 'soundcloud.com': '🎧', 'music.apple.com': '🎵',
  'wikipedia.org': '📖', 'notion.so': '📝', 'figma.com': '🎨', 'canva.com': '🎨', 'slack.com': '💬', 'discord.com': '💬',
  'zoom.us': '🎥', 'trello.com': '📋', 'atlassian.net': '📋', 'asana.com': '✅', 'linear.app': '📐',
  'openai.com': '🤖', 'chatgpt.com': '🤖', 'claude.ai': '🤖', 'anthropic.com': '🤖', 'perplexity.ai': '🤖', 'huggingface.co': '🤗',
  'nytimes.com': '📰', 'bbc.com': '📰', 'bbc.co.uk': '📰', 'cnn.com': '📰', 'theguardian.com': '📰',
  'washingtonpost.com': '📰', 'reuters.com': '📰', 'bloomberg.com': '📰', 'news.ycombinator.com': '🍊',
  'paypal.com': '💳', 'stripe.com': '💳', 'wise.com': '💱', 'coinbase.com': '🪙', 'binance.com': '🪙',
  'apple.com': '🍎', 'microsoft.com': '🪟', 'office.com': '🪟',
  'dropbox.com': '📦', 'medium.com': '✍️', 'substack.com': '📩', 'wordpress.com': '📝',
  'airbnb.com': '🏠', 'booking.com': '🏨', 'expedia.com': '✈️', 'uber.com': '🚕', 'doordash.com': '🍔',
  'aws.amazon.com': '☁️', 'console.aws.amazon.com': '☁️', 'portal.azure.com': '☁️', 'cloudflare.com': '☁️',
  'vercel.com': '▲', 'netlify.com': '🌐', 'digitalocean.com': '🌊',
  'imdb.com': '🎬', 'goodreads.com': '📚', 'coursera.org': '🎓', 'udemy.com': '🎓', 'khanacademy.org': '🎓', 'duolingo.com': '🦉'
};

// Conservative substring fallbacks (all >= 4 chars to limit false positives).
const KEYWORDS = [
  ['webmail', '📧'], ['video', '📺'], ['music', '🎵'], ['audio', '🎧'], ['podcast', '🎙️'],
  ['shop', '🛒'], ['store', '🛒'], ['market', '🛒'], ['news', '📰'], ['herald', '📰'], ['tribune', '📰'],
  ['wiki', '📖'], ['blog', '✍️'], ['bank', '🏦'], ['finance', '💹'], ['crypto', '🪙'], ['cloud', '☁️'],
  ['gaming', '🎮'], ['photo', '📷'], ['gallery', '🖼️'], ['calendar', '📅'], ['weather', '⛅'],
  ['recipe', '🍳'], ['travel', '🧳'], ['hotel', '🏨'], ['flight', '✈️'], ['health', '🩺'],
  ['fitness', '🏋️'], ['sports', '🏆'], ['learn', '🎓'], ['course', '🎓'], ['forum', '💬'], ['social', '👥']
];

const TAB_GROUP_ID_NONE = -1;

const groupsEl = document.getElementById('groups');
const emptyEl = document.getElementById('empty');
const toolbox = document.getElementById('toolbox');
const paletteEl = document.getElementById('palette');
const colorsEl = document.getElementById('colors');
const customInput = document.getElementById('custom');
const selHint = document.getElementById('selHint');

let selectedId = null;

buildPalette();
buildColors();

document.getElementById('applyCustom').addEventListener('click', () => {
  if (selectedId != null) applyTitle(selectedId, customInput.value);
});
customInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && selectedId != null) applyTitle(selectedId, customInput.value);
});
document.getElementById('clearTitle').addEventListener('click', () => {
  if (selectedId != null) applyTitle(selectedId, '');
});
document.getElementById('autoOne').addEventListener('click', () => {
  if (selectedId != null) autoLabel(selectedId);
});
document.getElementById('autoAll').addEventListener('click', autoLabelAll);

render();

let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 150); }
for (const ev of ['onCreated', 'onUpdated', 'onRemoved']) {
  try { chrome.tabGroups[ev].addListener(scheduleRender); } catch (_) { /* ignore */ }
}
for (const ev of ['onCreated', 'onRemoved', 'onMoved', 'onAttached', 'onDetached', 'onUpdated']) {
  try { chrome.tabs[ev].addListener(scheduleRender); } catch (_) { /* ignore */ }
}

async function render() {
  let groups = [];
  try { groups = await chrome.tabGroups.query({}); } catch (_) { /* ignore */ }

  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (_) { /* ignore */ }
  const byGroup = new Map();
  for (const t of tabs) {
    if (t.groupId != null && t.groupId !== TAB_GROUP_ID_NONE) {
      if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
      byGroup.get(t.groupId).push(t);
    }
  }

  groupsEl.textContent = '';

  if (!groups.length) {
    emptyEl.hidden = false;
    toolbox.classList.add('disabled');
    return;
  }
  emptyEl.hidden = true;
  toolbox.classList.remove('disabled');

  if (selectedId != null && !groups.some((g) => g.id === selectedId)) selectedId = null;
  if (selectedId == null) selectedId = groups[0].id;

  for (const g of groups) {
    const card = document.createElement('div');
    card.className = 'group' + (g.id === selectedId ? ' sel' : '');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = colorHex(g.color);

    const label = document.createElement('span');
    label.className = 'glabel' + (g.title ? '' : ' muted');
    label.textContent = g.title || '(no label)';

    const favs = document.createElement('span');
    favs.className = 'favs';
    const list = byGroup.get(g.id) || [];
    for (const tb of list.slice(0, 6)) {
      const im = document.createElement('img');
      im.className = 'fav';
      im.width = 14;
      im.height = 14;
      im.referrerPolicy = 'no-referrer';
      im.title = tb.title || '';
      im.onerror = () => { im.style.visibility = 'hidden'; };
      if (tb.favIconUrl && /^(https?|data):/i.test(tb.favIconUrl)) im.src = tb.favIconUrl;
      else im.style.visibility = 'hidden';
      im.addEventListener('click', (e) => { e.stopPropagation(); activateTab(tb); });
      favs.appendChild(im);
    }

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(list.length);

    card.appendChild(dot);
    card.appendChild(label);
    card.appendChild(favs);
    card.appendChild(count);
    card.addEventListener('click', () => select(g.id));
    groupsEl.appendChild(card);
  }

  const sel = groups.find((g) => g.id === selectedId);
  selHint.textContent = sel
    ? ('Selected: ' + (sel.title || '(no label)'))
    : 'Select a group above, then pick an icon.';
}

function select(id) {
  selectedId = id;
  render();
}

async function applyTitle(id, title) {
  try {
    await chrome.tabGroups.update(id, { title: String(title || '') });
  } catch (e) { console.error(e); }
  customInput.value = '';
  scheduleRender();
}

async function applyColor(id, color) {
  try {
    await chrome.tabGroups.update(id, { color });
  } catch (e) { console.error(e); }
  scheduleRender();
}

async function activateTab(tb) {
  try {
    await chrome.tabs.update(tb.id, { active: true });
    if (tb.windowId != null) await chrome.windows.update(tb.windowId, { focused: true });
  } catch (_) { /* ignore */ }
}

function buildPalette() {
  for (const e of EMOJI) {
    const b = document.createElement('button');
    b.className = 'emoji';
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => { if (selectedId != null) applyTitle(selectedId, e); });
    paletteEl.appendChild(b);
  }
}

function buildColors() {
  for (const [name, hex] of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.type = 'button';
    b.title = name;
    b.style.background = hex;
    b.addEventListener('click', () => { if (selectedId != null) applyColor(selectedId, name); });
    colorsEl.appendChild(b);
  }
}

function colorHex(name) {
  const f = COLORS.find((c) => c[0] === name);
  return f ? f[1] : '#5f6368';
}

// ---- auto emoji from the group's sites ----

function emojiForUrl(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return null; }
  if (!host) return null;
  if (host === 'localhost' || /^127\./.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return '🛠️';
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const cand = parts.slice(i).join('.');
    if (DOMAIN_EMOJI[cand]) return DOMAIN_EMOJI[cand];
  }
  for (const [kw, em] of KEYWORDS) if (host.includes(kw)) return em;
  return null;
}

// The best emoji for a group = the most common one across its tabs' sites.
async function autoEmojiForGroup(groupId) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ groupId }); } catch (_) { /* ignore */ }
  const counts = new Map();
  for (const t of tabs) {
    const e = emojiForUrl(t.url);
    if (e) counts.set(e, (counts.get(e) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [e, n] of counts) if (n > bestN) { best = e; bestN = n; }
  return best || '🌐';
}

async function autoLabel(groupId) {
  const emoji = await autoEmojiForGroup(groupId);
  await applyTitle(groupId, emoji);
}

async function autoLabelAll() {
  let groups = [];
  try { groups = await chrome.tabGroups.query({}); } catch (_) { /* ignore */ }
  for (const g of groups) {
    const emoji = await autoEmojiForGroup(g.id);
    try { await chrome.tabGroups.update(g.id, { title: emoji }); } catch (e) { console.error(e); }
  }
  scheduleRender();
}
