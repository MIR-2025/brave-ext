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
})();
