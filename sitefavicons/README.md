# Site Favicons -- custom favicon for any site

Give any website the favicon **you** want. Handy for sites with a blank icon,
sites with a generic/ugly one, or a wall of internal tools that all look alike.
Local only: no accounts, no network, nothing leaves your browser.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `sitefavicons/` folder
4. Pin it from the puzzle-piece menu

## Use

### Right-click a page (quickest)

Right-click anywhere on a page -> **Site favicon** -> pick an emoji. It applies
instantly and is remembered for that host. The submenu also has **Use a colored
letter**, **More...** (image / URL / any emoji -- opens the editor), and **Remove
custom favicon**.

> **Why not right-click the tab itself?** Chromium extensions can't add items to the
> tab-strip context menu -- `chrome.contextMenus` has no `"tab"` context (that's a
> Firefox-only feature). Right-clicking the page is the closest thing that works.

### The popup (full control)

1. Go to the site you want to change, and click the **Site Favicons** icon.
2. The popup shows that site's hostname and its current icon. Pick a new one:
   - **Emoji** -- type or paste any emoji (e.g. `🚀`)
   - **Choose image...** -- opens the editor window, where you can upload a
     **PNG, JPG, WebP, AVIF, GIF, SVG, BMP or ICO**
   - **Image URL** -- paste a link to an image
   - **Use a colored letter** -- an auto monogram (first letter of the host, on a
     color derived from the name)
3. Check the **preview**, then hit **Save for this site**. It applies immediately.

> **Why does "Choose image..." open a separate window?** A file picker can't be used
> from a toolbar popup: opening the OS file dialog moves focus, which makes the
> browser close the popup and throw away its state before the file is ever read. The
> editor is a real window, so the picker works there. (The right-click **More...**
> item opens the same editor directly.)

Uploaded images are decoded and re-encoded as a **64x64 PNG**, so any format the
browser can read works (WebP included) and each stored icon stays a few KB.

**Remove** clears the custom icon for the current site and reloads the tab so the
site's real favicon comes back. The **All custom favicons** list at the bottom shows
everything you've set, with an **✕** to remove any of them.

## How it works

A content script runs on http/https pages, looks up the page's **hostname** in your
saved list, and swaps the page's `<link rel="icon">` for your choice. Emoji and letter
icons are drawn to a canvas and stored as data URLs, so they work offline forever;
uploads are embedded the same way.

Some sites set (or reset) their favicon from JavaScript after the page loads. A small
`MutationObserver` watches for that and re-asserts your icon, so your choice wins.

## Localhost and ports

Dev servers all live on `localhost`, so keying by hostname alone would make every
port share one icon. Instead each site is keyed by **host *and* port**:
`localhost:26715` and `localhost:3000` are separate entries, while normal sites
(which use the default port) are keyed exactly as before.

The auto icon is port-aware too: on a local host the badge shows the **port number**
rather than a useless "L", in a color derived from the whole host -- so a row of dev
tabs is instantly readable.

| Host | Auto icon |
| --- | --- |
| `localhost:26715` | **26715** |
| `localhost:3000` | **3000** |
| `127.0.0.1:5173` | **5173** |
| `192.168.1.50:9000` | **9000** |
| `github.com` | **G** |

"Local" means `localhost`, `127.x`, `::1`, `0.0.0.0`, a private LAN range
(`10.x`, `192.168.x`, `172.16-31.x`) or a `.local` / `.localhost` name. A public
host with a port (`example.com:8443`) still gets its letter.

An entry saved for the bare hostname (`localhost`) acts as a **fallback** for any
port you haven't given its own icon.

## Notes and limits

- **Already-open tabs:** the browser does not inject content scripts into tabs that
  were already open when you install (or reload) an extension. Saving still applies
  immediately -- the icon is injected directly into the active tab -- but a page you
  had open *before* installing won't be protected by the re-assert watcher until you
  reload it once.
- Matching is by **exact hostname** -- `docs.example.com` and `example.com` are set
  separately.
- Only normal `http` / `https` pages. Browser pages (`brave://`), the Web Store, and
  local files aren't scriptable (for local `.md` files, use `markdownview/`, which has
  its own favicon support).
- Removing an icon takes effect immediately in the **current** tab (it's reloaded);
  other open tabs of that site update on their next load.
- This changes the favicon **you** see in your browser. It doesn't alter the site.

## Permissions

- **Host access to all sites** -- unavoidable for "any site": the content script has to
  be able to run wherever you choose to set an icon. It only ever reads the hostname
  and swaps an icon link; there's no tracking, no storage of your browsing, and no
  network traffic.
- **`storage`** -- keeps your hostname -> icon list locally.
