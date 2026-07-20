// MarkdownView -- content script. Runs on markdown-looking URLs. If the page is a
// text-served markdown file, parse it with the bundled `marked`, sanitize, and
// replace the raw text with a styled reading view. marked.umd.js is loaded before
// this file in the same isolated world, so `marked` is available here.

(async function () {
  const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown', 'text/x-web-markdown', 'application/markdown'];
  const ct = (document.contentType || '').toLowerCase();
  const looksMd = TEXT_TYPES.indexOf(ct) !== -1;

  // Set by the right-click menu (see background.js): render regardless of what the
  // URL or content-type says, optionally over just the selected text.
  const forced = !!window.__mdvForce;
  const forcedRaw = (typeof window.__mdvRaw === 'string' && window.__mdvRaw) ? window.__mdvRaw : null;
  if (window.__mdvDone) return;                       // already rendered here

  // Hide the raw text immediately to avoid a flash, revealed after we render (or bail).
  if (looksMd) { try { document.documentElement.style.visibility = 'hidden'; } catch (_) { /* ignore */ } }
  const reveal = () => { try { document.documentElement.style.visibility = ''; } catch (_) { /* ignore */ } };

  let cfg = { mdvEnabled: true, mdvTheme: 'auto', mdvFavicon: true };
  try {
    const s = await chrome.storage.local.get(['mdvEnabled', 'mdvTheme', 'mdvFavicon']);
    if (typeof s.mdvEnabled === 'boolean') cfg.mdvEnabled = s.mdvEnabled;
    if (s.mdvTheme) cfg.mdvTheme = s.mdvTheme;
    if (typeof s.mdvFavicon === 'boolean') cfg.mdvFavicon = s.mdvFavicon;
  } catch (_) { /* ignore */ }

  if ((!looksMd && !forced) || !cfg.mdvEnabled || typeof marked === 'undefined') { reveal(); return; }

  const raw = forcedRaw != null ? forcedRaw : extractRaw();
  if (raw == null || raw === '') { reveal(); return; }

  try {
    renderDoc(raw, cfg.mdvTheme, cfg.mdvFavicon);
    window.__mdvDone = true;
  } catch (e) { console.error('[MarkdownView]', e); }
  reveal();

  function extractRaw() {
    const pre = document.body && document.body.querySelector('pre');
    if (pre) return pre.textContent;
    return document.body ? document.body.textContent : '';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const BAD = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,noscript';
    doc.querySelectorAll(BAD).forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value || '';
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'srcset') && /^\s*javascript:/i.test(val)) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return doc.body.innerHTML;
  }

  function slugify(text) {
    return String(text).toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'section';
  }

  function addHeadingIds(root) {
    const seen = {};
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (h.id) return;
      let base = slugify(h.textContent);
      let id = base;
      let i = 1;
      while (seen[id]) id = base + '-' + (i++);
      seen[id] = true;
      h.id = id;
    });
  }

  function buildToc(content, tocEl) {
    const heads = Array.from(content.querySelectorAll('h1, h2, h3')).filter((h) => h.id);
    if (heads.length < 2) { tocEl.remove(); return null; }
    const title = document.createElement('div');
    title.className = 'mdv-toc-title';
    title.textContent = 'Contents';
    tocEl.appendChild(title);
    for (const h of heads) {
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = 'mdv-toc-l' + h.tagName.substring(1);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const t = document.getElementById(h.id);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tocEl.appendChild(a);
    }
    return tocEl;
  }

  // --- YAML-ish front matter (flat key: value between --- fences at the top) ---
  function splitFrontMatter(raw) {
    const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(raw);
    if (!m) return { meta: {}, body: raw };
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/.exec(line);
      if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '');
    }
    return { meta, body: raw.slice(m[0].length) };
  }

  // --- favicons for pages that don't have one ---
  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
  }
  function roundRect(x, px, py, w, h, r) {
    if (x.roundRect) { x.beginPath(); x.roundRect(px, py, w, h, r); return; }
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function monogramFavicon(title) {
    const letter = ((title || '').trim()[0] || 'M').toUpperCase();
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    roundRect(x, 2, 2, 60, 60, 13);
    x.fillStyle = 'hsl(' + hashHue(title || 'md') + ', 52%, 45%)';
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 38px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(letter, 32, 35);
    return c.toDataURL('image/png');
  }
  function glyphFavicon(text) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const len = Array.from(text).length;
    x.font = (len > 1 ? 34 : 52) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 32, 36);
    return c.toDataURL('image/png');
  }
  function faviconFor(meta, title) {
    const spec = (meta.favicon || meta.icon || '').trim();
    if (spec) {
      if (/^(https?:|data:|\/|\.\.?\/)/i.test(spec)) return spec; // url / path -> use as-is
      return glyphFavicon(spec);                                   // emoji / short text -> draw it
    }
    return monogramFavicon(title);
  }
  function setFavicon(href) {
    if (!href) return;
    try {
      document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((n) => n.remove());
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = href;
      (document.head || document.documentElement).appendChild(link);
    } catch (_) { /* ignore */ }
  }

  function renderDoc(rawText, themePref, faviconOn) {
    const fileName = decodeURIComponent((location.pathname.split('/').pop() || '').split('?')[0]) || 'Markdown';
    const { meta, body } = splitFrontMatter(rawText);
    const name = meta.title || fileName;
    document.title = name;
    if (faviconOn) setFavicon(faviconFor(meta, name));

    marked.setOptions({ gfm: true, breaks: false });
    let html;
    try { html = marked.parse(body); } catch (_) { html = '<pre>' + esc(rawText) + '</pre>'; }
    const safe = sanitize(html);

    document.body.className = 'mdv';
    document.body.setAttribute('data-mdv-theme', themePref || 'auto');
    document.body.innerHTML =
      '<div class="mdv-toolbar">' +
        '<span class="mdv-name"></span>' +
        '<span class="mdv-flex"></span>' +
        '<button class="mdv-btn" data-act="toc">Contents</button>' +
        '<button class="mdv-btn" data-act="raw">View raw</button>' +
        '<button class="mdv-btn" data-act="theme">Theme</button>' +
      '</div>' +
      '<div class="mdv-toc" hidden></div>' +
      '<main class="mdv-main"><article class="mdv-content"></article></main>';

    document.querySelector('.mdv-name').textContent = name;
    const content = document.querySelector('.mdv-content');
    content.innerHTML = safe;
    addHeadingIds(content);

    const toc = buildToc(content, document.querySelector('.mdv-toc'));
    const tocBtn = document.querySelector('[data-act="toc"]');
    if (!toc && tocBtn) tocBtn.remove();

    let showingRaw = false;
    document.querySelector('.mdv-toolbar').addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'raw') toggleRaw();
      else if (act === 'theme') cycleTheme();
      else if (act === 'toc' && toc) toc.hidden = !toc.hidden;
    });

    function toggleRaw() {
      showingRaw = !showingRaw;
      const btn = document.querySelector('[data-act="raw"]');
      if (showingRaw) {
        content.innerHTML = '';
        const pre = document.createElement('pre');
        pre.className = 'mdv-rawpre';
        pre.textContent = rawText;
        content.appendChild(pre);
        if (btn) btn.textContent = 'View rendered';
      } else {
        content.innerHTML = safe;
        addHeadingIds(content);
        if (btn) btn.textContent = 'View raw';
      }
    }

    function cycleTheme() {
      const order = ['auto', 'light', 'dark'];
      const cur = document.body.getAttribute('data-mdv-theme') || 'auto';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      document.body.setAttribute('data-mdv-theme', next);
      try { chrome.storage.local.set({ mdvTheme: next }); } catch (_) { /* ignore */ }
    }
  }
})();
