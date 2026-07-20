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
- **Grid** button: hover the little matrix and click to set an arbitrary grid --
  2x2, 2x4, 4x4, 3x3, anything up to 6x6. A single row is side-by-side; a single
  column is stacked.
- **Drag any gutter** between columns or rows to resize.
- **Reposition a pane**: grab the **⠿** handle on a pane's bar and drag it onto
  another pane -- the two swap places. The cells keep their sizes; only the
  contents move, so you can rearrange a layout without rebuilding it. Since the
  first pane supplies the tab's icon and title, swapping something into slot one
  re-badges the tab.
- **Give the set its own icon**: type or paste an emoji into the small box next to
  the set name. That becomes the tab's favicon, overriding the one inherited from
  the first pane, and it's saved with the set (and in the bookmarkable link). Handy
  because a split tab is an extension page -- Site Favicons and other favicon tools
  physically cannot touch it, so the icon has to come from here.
- **+ Pane** adds one more (the grid grows to fit). The **✕** on a pane removes it
  (the last one just clears instead).
- Per pane: **↻** reload, **↗** open that page in a normal new tab.
- Your layout and URLs are remembered and restored when you reopen.

## Bookmarking a set

The entire layout -- grid shape, gutter sizes, every pane's URL, and the name --
is encoded into this tab's address live, so **the address bar always matches what
you see**. To save a set:

- Press **Ctrl+D** (or click the star) to bookmark it like any page, or click
  **🔖 Copy link** to copy the URL and paste it wherever you keep things.
- Give it a **name** in the toolbar field -- that becomes the bookmark's title.
- The tab **inherits the first pane's favicon**, so each saved set looks like its
  primary site in your bookmarks bar. (An empty first pane falls back to the Split
  Screen icon.) This includes **localhost** -- if your dev server serves a favicon,
  that is what you get. Only when a site genuinely has no icon (many dev servers
  don't) does the tab fall back to a generated badge coloured per `host:port` with
  the port stamped on it, so `:3000` and `:26717` stay tellable apart.

Opening a bookmarked set rebuilds it exactly. Note: the bookmark points at this
extension's internal address (`chrome-extension://<id>/...`), which stays valid as
long as the extension stays installed from the same folder -- moving or reinstalling
it from a different path changes the id and breaks old bookmarks.

### The saved-sets bar (no browser bookmarks involved)

If you would rather not touch your browser's bookmarks at all, hit **★ Save** in the
toolbar. The current layout gets pinned as a chip in the **bar right under the
toolbar** -- named from the "Name this set" field (or the first pane's site), wearing
that site's favicon. Click a chip to reload that set; the **✕** on it removes it. These
are stored inside the extension only -- nothing is imported from or written to your
browser bookmarks.

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

## Surviving an extension reload

Split tabs are extension pages, so reloading the extension (a dev iteration, or an
update) would normally close them and lose your panes. Instead, the extension keeps a
small record of which split tabs are open (and their exact layout) and **reopens them
automatically** when it is reloaded or the browser restarts -- deduped against any the
browser restored on its own. So a reload brings your split views right back.

## Limits and notes

- **Frame-busting sites**: a few sites run JavaScript to force themselves out of a
  frame. The panes are sandboxed without top-navigation to block most of this, but
  the occasional site will still refuse. Use **↗** to open it in a normal tab.
- **Login state** works normally (the frame keeps the site's own cookies), so you
  can view logged-in pages side by side.
- **In-frame clicks now update the pane's URL bar.** Follow links inside a pane and
  its address field keeps up, so ★ Save and the bookmarkable link capture where you
  actually ended up rather than where you started. The browser won't let the parent
  page read a cross-origin frame's location, so the pane reports its own: Split Screen
  names each iframe, and `window.name` survives navigation inside that frame, so the
  page still knows which pane it is however deep you click. A pane can only speak for
  itself -- the report is accepted only when it comes from that pane's own window.
- `brave://` and other browser pages cannot be framed -- that is a browser rule.
