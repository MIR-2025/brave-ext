# Split Screen -- side-by-side browsing

Open two (or more) live web pages side by side in a single tab. Drag the divider
to resize, flip between side-by-side and stacked layouts, and your panes come back
the way you left them next time. Local only -- no accounts, no network calls.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `splitscreen/` folder

Pin it, then click the icon to open a split tab.

## Use

- **Launching from a page** puts that page in the first pane automatically, so you
  can just pick what goes beside it.
- **Right-click menu**: right-click a link and choose **"Open link in Split Screen"**,
  or right-click a page and choose **"Open this page in Split Screen"**. If a split
  tab is already open, the page is added to it as a new pane (and the tab is focused);
  otherwise a new split tab opens with that page. Right-click your way to as many
  panes as you like.
- Load a page into a pane two ways:
  - **Type** a URL (or a search) in the pane's bar and press **Enter**, or
  - Click **☰** in the pane bar (or use the list shown in an empty pane) to pick
    from your **open tabs** -- favicon, title, and address. The list stays current
    as you open and close tabs elsewhere.
- **Drag the bar between panes** to resize them.
- **Layout** button toggles side-by-side vs stacked.
- **+ Pane** adds another (as many as you want). The **✕** on a pane closes it.
- Per pane: **↻** reload, **↗** open that page in a normal new tab.
- Your layout and URLs are remembered and restored when you reopen.

## The framing trick (and why it needs broad access)

Most big sites send `X-Frame-Options` or a `Content-Security-Policy: frame-ancestors`
header specifically to stop themselves being shown inside a frame. So that they'll
load here, the extension removes those response headers -- but **only for frames
inside the split tab**, using a `declarativeNetRequest` *session* rule scoped to
that one tab id. The moment you close the tab, the rule is gone. Nothing is changed
for any other tab, and nothing persists across a browser restart.

That scoping is why the extension asks for `<all_urls>` host access: the rule has to
be able to touch whatever site you choose to load. It is not used for anything else
-- there is no tracking, storage of your browsing, or network traffic of any kind.

## Limits and notes

- **Frame-busting sites**: a few sites run JavaScript to force themselves out of a
  frame. The panes are sandboxed without top-navigation to block most of this, but
  the occasional site will still refuse. Use **↗** to open it in a normal tab.
- **Login state** works normally (the frame keeps the site's own cookies), so you
  can view logged-in pages side by side.
- **In-frame clicks** (following links inside a page) do not update the pane's URL
  bar, because the browser does not expose a cross-origin frame's current URL to us.
- `brave://` and other browser pages cannot be framed -- that is a browser rule.
