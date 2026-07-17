// Site Favicons -- content script. If this host has a custom favicon saved, swap
// the page's icon <link> for it, and keep re-asserting it (some sites set their
// favicon from JavaScript, which would otherwise overwrite ours).

(function () {
  // location.host includes ":port" when it isn't the default, so localhost:3000 and
  // localhost:26715 get their own icons while normal sites are keyed as before.
  const host = location.host;
  const bareHost = location.hostname;
  if (!host) return;

  let applying = false;
  let currentHref = null;
  let observer = null;

  // Exact host:port wins; a bare-hostname entry acts as a fallback for other ports.
  const lookup = (map) => (map && (map[host] || map[bareHost])) || null;

  chrome.storage.local.get('faviconMap').then(({ faviconMap }) => {
    const href = lookup(faviconMap || {});
    if (href) boot(href);
  }).catch((e) => console.warn('[Site Favicons]', e));

  // Live updates from the popup: apply on save; removals take effect on next load
  // (the popup reloads the active tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.faviconMap) return;
    const href = lookup(changes.faviconMap.newValue || {});
    if (href) boot(href);
  });

  function boot(href) {
    currentHref = href;
    if (document.head) {
      setFavicon(href);
      startObserver();
      return;
    }
    // <head> not built yet (document_start): apply as soon as it appears.
    const mo = new MutationObserver(() => {
      if (document.head) {
        setFavicon(currentHref);
        startObserver();
        mo.disconnect();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => {
      if (document.head) { setFavicon(currentHref); startObserver(); }
    });
  }

  function setFavicon(href) {
    applying = true;
    try {
      document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
        .forEach((n) => n.remove());
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = href;
      (document.head || document.documentElement).appendChild(link);
      currentHref = href;
    } catch (_) { /* ignore */ }
    setTimeout(() => { applying = false; }, 0);
  }

  function startObserver() {
    if (observer || !document.head) return;
    observer = new MutationObserver(() => {
      if (applying) return;
      const links = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'));
      const hasForeign = links.some((l) => l.href !== currentHref);
      const missingOurs = !links.some((l) => l.href === currentHref);
      if (hasForeign || missingOurs) setFavicon(currentHref);
    });
    observer.observe(document.head, { childList: true });
  }
})();
