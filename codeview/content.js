// Code Viewer -- content script. On a text-served source file, highlight it with
// the bundled highlight.js and show a reading view: line numbers, theme, wrap/raw
// toggles, copy, and a per-file favicon. hljs.min.js loads before this file in the
// same isolated world, so `hljs` is available here.

(async function () {
  const ct = (document.contentType || '').toLowerCase();
  const APP = ['application/json', 'application/javascript', 'text/javascript', 'application/xml',
    'application/x-sh', 'application/x-yaml', 'application/toml', 'application/sql', 'application/x-httpd-php'];
  // The browser renders a plain-text file as a single <pre> in the body -- a strong
  // signal it's source even if the content type is something unexpected.
  const b0 = document.body;
  const lonePre = !!(b0 && b0.children.length === 1 && b0.firstElementChild && b0.firstElementChild.tagName === 'PRE');
  // Code is served as text; text/html means a page meant to render -- leave that alone.
  const isCode = ct !== 'text/html' && (ct.startsWith('text/') || APP.indexOf(ct) !== -1 || lonePre);

  if (isCode) { try { document.documentElement.style.visibility = 'hidden'; } catch (_) { /* ignore */ } }
  const reveal = () => { try { document.documentElement.style.visibility = ''; } catch (_) { /* ignore */ } };

  let cfg = { cvEnabled: true, cvTheme: 'auto', cvWrap: false, cvFavicon: true };
  try {
    const s = await chrome.storage.local.get(['cvEnabled', 'cvTheme', 'cvWrap', 'cvFavicon']);
    if (typeof s.cvEnabled === 'boolean') cfg.cvEnabled = s.cvEnabled;
    if (s.cvTheme) cfg.cvTheme = s.cvTheme;
    if (typeof s.cvWrap === 'boolean') cfg.cvWrap = s.cvWrap;
    if (typeof s.cvFavicon === 'boolean') cfg.cvFavicon = s.cvFavicon;
  } catch (_) { /* ignore */ }

  if (!isCode || !cfg.cvEnabled || typeof hljs === 'undefined') {
    // Leave a breadcrumb so "nothing happened" is diagnosable from the console.
    console.debug('[Code Viewer] not transforming:',
      { contentType: ct, isCode, enabled: cfg.cvEnabled, hljsLoaded: typeof hljs !== 'undefined' });
    reveal();
    return;
  }

  const raw = extractRaw();
  if (raw == null || raw === '') { console.debug('[Code Viewer] empty body'); reveal(); return; }

  try { render(raw, cfg); } catch (e) { console.error('[Code Viewer]', e); }
  reveal();

  function extractRaw() {
    const pre = document.body && document.body.querySelector('pre');
    if (pre) return pre.textContent;
    return document.body ? document.body.textContent : '';
  }

  const EXT_LANG = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
    json: 'json', jsonc: 'json', sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', pyw: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp',
    php: 'php', css: 'css', scss: 'scss', less: 'less', yaml: 'yaml', yml: 'yaml',
    toml: 'ini', ini: 'ini', sql: 'sql', lua: 'lua', swift: 'swift', kt: 'kotlin',
    kts: 'kotlin', pl: 'perl', diff: 'diff', patch: 'diff', md: 'markdown'
  };

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // ---- per-file favicon (extension badge on a hashed color) ----
  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
  }
  function rr(x, px, py, w, h, r) {
    if (x.roundRect) { x.beginPath(); x.roundRect(px, py, w, h, r); return; }
    x.beginPath();
    x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r); x.closePath();
  }
  function setFavicon(ext, key) {
    try {
      const label = (ext || 'txt').toUpperCase().slice(0, 4);
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      rr(x, 2, 2, 60, 60, 13);
      x.fillStyle = 'hsl(' + hashHue(key) + ', 52%, 45%)';
      x.fill();
      x.fillStyle = '#fff';
      const size = label.length >= 4 ? 22 : label.length === 3 ? 27 : label.length === 2 ? 33 : 38;
      x.font = 'bold ' + size + 'px system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(label, 32, 34);
      document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((n) => n.remove());
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = c.toDataURL('image/png');
      (document.head || document.documentElement).appendChild(link);
    } catch (_) { /* ignore */ }
  }

  function render(rawText, conf) {
    const fileName = decodeURIComponent((location.pathname.split('/').pop() || '').split('?')[0]) || 'source';
    const ext = (fileName.match(/\.([a-z0-9]+)$/i) || [])[1] ? fileName.match(/\.([a-z0-9]+)$/i)[1].toLowerCase() : '';
    document.title = fileName;
    if (conf.cvFavicon) setFavicon(ext, location.href);

    // highlight
    let lang = EXT_LANG[ext];
    let html;
    let usedLang;
    if (lang && hljs.getLanguage(lang)) {
      html = hljs.highlight(rawText, { language: lang, ignoreIllegals: true }).value;
      usedLang = lang;
    } else if (rawText.length <= 300000) {
      const r = hljs.highlightAuto(rawText);
      html = r.value;
      usedLang = r.language || 'text';
    } else {
      html = esc(rawText);
      usedLang = 'text';
    }

    const lines = rawText.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const nLines = Math.max(1, lines.length);
    let gutter = '';
    for (let i = 1; i <= nLines; i++) gutter += i + '\n';

    document.body.className = 'cv' + (conf.cvWrap ? ' cv-wrapped' : '');
    document.body.setAttribute('data-cv-theme', conf.cvTheme || 'auto');
    document.body.innerHTML =
      '<div class="cv-toolbar">' +
        '<span class="cv-name"></span>' +
        '<span class="cv-lang"></span>' +
        '<span class="cv-flex"></span>' +
        '<span class="cv-info"></span>' +
        '<button class="cv-btn" data-act="wrap">Wrap</button>' +
        '<button class="cv-btn" data-act="raw">Raw</button>' +
        '<button class="cv-btn" data-act="copy">Copy</button>' +
        '<button class="cv-btn" data-act="theme">Theme</button>' +
      '</div>' +
      '<div class="cv-wrap">' +
        '<pre class="cv-gutter"></pre>' +
        '<pre class="cv-code"><code class="hljs"></code></pre>' +
      '</div>';

    document.querySelector('.cv-name').textContent = fileName;
    document.querySelector('.cv-lang').textContent = usedLang;
    document.querySelector('.cv-info').textContent = nLines + (nLines === 1 ? ' line' : ' lines');
    document.querySelector('.cv-gutter').textContent = gutter;
    const codeEl = document.querySelector('.cv-code code');
    codeEl.innerHTML = html;

    let showingRaw = false;
    document.querySelector('.cv-toolbar').addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'wrap') toggleWrap();
      else if (act === 'raw') toggleRaw();
      else if (act === 'copy') copy(e.target);
      else if (act === 'theme') cycleTheme();
    });

    function toggleWrap() {
      const on = document.body.classList.toggle('cv-wrapped');
      try { chrome.storage.local.set({ cvWrap: on }); } catch (_) { /* ignore */ }
    }
    function toggleRaw() {
      showingRaw = !showingRaw;
      const btn = document.querySelector('[data-act="raw"]');
      if (showingRaw) { codeEl.textContent = rawText; if (btn) btn.textContent = 'Highlighted'; }
      else { codeEl.innerHTML = html; if (btn) btn.textContent = 'Raw'; }
    }
    async function copy(btn) {
      const label = btn.textContent;
      try {
        await navigator.clipboard.writeText(rawText);
      } catch (_) {
        try {
          const ta = document.createElement('textarea');
          ta.value = rawText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        } catch (_2) { /* ignore */ }
      }
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = label; }, 1200);
    }
    function cycleTheme() {
      const order = ['auto', 'light', 'dark'];
      const cur = document.body.getAttribute('data-cv-theme') || 'auto';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      document.body.setAttribute('data-cv-theme', next);
      try { chrome.storage.local.set({ cvTheme: next }); } catch (_) { /* ignore */ }
    }
  }
})();
