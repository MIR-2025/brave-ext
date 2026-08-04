// Split Screen -- pane URL reporter.
//
// The parent page cannot read a cross-origin frame's location, which is why a
// pane's address bar used to go stale the moment you clicked a link inside it. So
// the frame reports its own URL instead.
//
// How a frame knows it's one of our panes: Split Screen names each pane's iframe
// ("splitpane:N"), and window.name SURVIVES navigation within that frame -- so the
// name is still there after you follow links, several pages deep. Any frame that
// isn't one of ours does nothing at all here.

(function () {
  let name = '';
  try { name = window.name || ''; } catch (_) { return; }
  if (name.indexOf('splitpane:') !== 0) return;   // not a Split Screen pane
  if (window === window.top) return;              // panes are always sub-frames

  let last = '';

  function report() {
    let href = '';
    try { href = location.href; } catch (_) { return; }
    if (!href || href === last) return;
    last = href;
    try {
      window.parent.postMessage({ __splitPaneUrl: href, pane: name }, '*');
    } catch (_) { /* parent gone */ }
  }

  report();
  window.addEventListener('pageshow', report);
  window.addEventListener('popstate', report);
  window.addEventListener('hashchange', report);

  // (Back / forward is handled entirely in the parent page now -- it keeps a
  // per-pane history stack from these URL reports -- so this frame no longer needs
  // to act on nav commands.)

  // Single-page apps navigate with history.pushState in the page's own JS world,
  // which a content script can't hook from its isolated world. A cheap string
  // compare on a timer catches those without touching the page.
  setInterval(report, 1200);

  // ---- hovered-link overlay -------------------------------------------------
  // Like the browser's status bar, but in-page and pinned to THIS pane's lower-right
  // corner. The parent can't see cross-origin hovers, but we're inside the frame, so
  // we can. Rendered in a Shadow DOM (position:fixed = the pane's viewport) so the host
  // page's CSS can't touch it and ours can't leak; pointer-events:none so it never eats
  // a click. Styles are set via the CSSOM, which page CSP does not restrict.
  let host = null, label = null;
  function ensureOverlay() {
    if (host) return;
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;right:0;bottom:0;z-index:2147483647;pointer-events:none;display:none';
    const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    label = document.createElement('div');
    label.style.cssText = [
      'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'max-width:70vw', 'padding:2px 9px',
      'background:rgba(18,20,26,.92)', 'color:#eef2f8',
      'border-top-left-radius:7px', 'box-shadow:0 -1px 6px rgba(0,0,0,.35)',
      'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis'
    ].join(';');
    root.appendChild(label);
    (document.documentElement || document.body).appendChild(host);
  }
  function showLink(href) { ensureOverlay(); label.textContent = href; host.style.display = 'block'; }
  function hideLink() { if (host) host.style.display = 'none'; }

  document.addEventListener('mouseover', function (e) {
    const t = e.target;
    const a = t && t.closest ? t.closest('a[href]') : null;
    const href = a && a.href;
    if (href && href.lastIndexOf('javascript:', 0) !== 0) showLink(href);
    else hideLink();
  }, true);
  // Clear when the pointer leaves the pane entirely.
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) hideLink(); }, true);
  window.addEventListener('blur', hideLink);

  // ---- find in page ---------------------------------------------------------
  // Native Ctrl+F can't reach into a cross-origin frame, so the pane bar drives a
  // find from in here. Matches are painted with the CSS Custom Highlight API -- no
  // DOM mutation -- and the ::highlight styles go in via a constructed stylesheet,
  // which page CSP does not restrict. Degrades to nothing if the API is missing.
  const HL_OK = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined' &&
                   document.createTreeWalker);
  let fRanges = [], fIdx = -1, fQuery = '', fStyled = false;

  function styleOnce() {
    if (fStyled || !HL_OK) return;
    fStyled = true;
    const css = '::highlight(splitfind){background:#ffe066;color:#111}' +
                '::highlight(splitfind-current){background:#ff8f1f;color:#111}';
    try {
      const s = new CSSStyleSheet();
      s.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
    } catch (_) {
      try {
        const el = document.createElement('style');
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
      } catch (__) { /* ignore */ }
    }
  }

  function clearFind() {
    fRanges = []; fIdx = -1;
    try { CSS.highlights.delete('splitfind'); CSS.highlights.delete('splitfind-current'); } catch (_) {}
  }

  function paintCurrent(scroll) {
    if (fIdx < 0 || fIdx >= fRanges.length) return;
    try { CSS.highlights.set('splitfind-current', new Highlight(fRanges[fIdx])); } catch (_) {}
    if (scroll) {
      try {
        const el = fRanges[fIdx].startContainer.parentElement;
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_) {}
    }
  }

  function runFind(q) {
    clearFind();
    fQuery = q || '';
    const needle = fQuery.toLowerCase();
    if (!needle || !HL_OK) return { count: 0, index: 0, ok: HL_OK };
    styleOnce();
    const root = document.body || document.documentElement;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const v = n.nodeValue;
        if (!v || v.toLowerCase().indexOf(needle) === -1) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (p.offsetParent === null && p.offsetWidth === 0 && p.offsetHeight === 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const lower = node.nodeValue.toLowerCase();
      let from = 0, i;
      while ((i = lower.indexOf(needle, from)) !== -1) {
        try {
          const r = document.createRange();
          r.setStart(node, i); r.setEnd(node, i + needle.length);
          fRanges.push(r);
        } catch (_) {}
        from = i + needle.length;
        if (fRanges.length >= 2000) break;
      }
      if (fRanges.length >= 2000) break;
    }
    if (!fRanges.length) return { count: 0, index: 0, ok: true };
    try { CSS.highlights.set('splitfind', new Highlight(...fRanges)); } catch (_) {}
    fIdx = 0; paintCurrent(true);
    return { count: fRanges.length, index: 1, ok: true };
  }

  function stepFind(delta) {
    if (!fRanges.length) return { count: 0, index: 0, ok: HL_OK };
    fIdx = (fIdx + delta + fRanges.length) % fRanges.length;
    paintCurrent(true);
    return { count: fRanges.length, index: fIdx + 1, ok: true };
  }

  function reply(res) {
    try { window.parent.postMessage({ __splitFindResult: res, pane: name }, '*'); } catch (_) {}
  }

  window.addEventListener('message', function (e) {
    const d = e.data;
    if (!d || !d.__splitFind || e.source !== window.parent) return;
    const c = d.__splitFind, action = c.action;
    if (action === 'clear') { clearFind(); fQuery = ''; return; }
    if (action === 'find') { reply(runFind(c.query)); return; }
    if (action === 'next' || action === 'prev') {
      if (c.query != null && c.query !== fQuery) { reply(runFind(c.query)); return; }
      reply(stepFind(action === 'next' ? 1 : -1));
    }
  });

  // Ctrl/Cmd+F while focus is inside this frame -> hand it to the pane bar's Find
  // box (the browser's own find can't see into this cross-origin frame anyway).
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      try { window.parent.postMessage({ __splitFindFocus: true, pane: name }, '*'); } catch (_) {}
    }
  }, true);
})();
