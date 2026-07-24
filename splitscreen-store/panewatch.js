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

  // Back / forward. The parent page cannot move a cross-origin frame through its
  // history, but this script runs INSIDE the frame, so it can. Split Screen posts
  // {__splitNav: -1 | +1}; we step the frame's own session history by that much.
  // A no-op at the ends -- the browser has no cross-origin "can I go back?" query,
  // so the buttons stay enabled and simply do nothing when there's nowhere to go.
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || typeof d.__splitNav !== 'number') return;
    try { history.go(d.__splitNav); } catch (_) { /* navigation blocked */ }
  });

  // Single-page apps navigate with history.pushState in the page's own JS world,
  // which a content script can't hook from its isolated world. A cheap string
  // compare on a timer catches those without touching the page.
  setInterval(report, 1200);
})();
