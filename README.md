# brave-ext

A small set of personal **Brave / Chrome extensions** (Manifest V3), built to
replace third-party tools with code you own and can read end to end. They are
meant to be **loaded unpacked** -- there is no Web Store listing, no account, no
telemetry. Everything runs locally in your browser and nothing is sent anywhere.

## Extensions

| Folder | What it does |
| --- | --- |
| [`fullpage/`](fullpage/) | Full-page screenshots. Scrolls the page, stitches every viewport into one image, and exports as **PNG** or **PDF**, or copies to the clipboard. A local clone of GoFullPage. |
| [`splitscreen/`](splitscreen/) | View two or more live pages **side by side in one tab**. Arbitrary R×C grids with draggable gutters, an open-tabs picker, a right-click "Open in Split Screen" menu, and **bookmarkable sets** (each wearing its first pane's favicon). |
| [`groupicons/`](groupicons/) | Put an **emoji icon on a tab group** instead of a text label, and recolor groups. |
| [`fakedata/`](fakedata/) | **Smart form filler.** Fills forms with one coherent fake persona, matching each field (email, name, address, Luhn-valid test card...). Popup, right-click, or Alt+Shift+F. |
| [`markdownview/`](markdownview/) | **Renders `.md` files** (local and remote) as clean pages -- reading layout, dark/light themes, table of contents, raw toggle. |

## Install (load unpacked)

Each extension is a self-contained folder. To install one:

1. Open `brave://extensions` (or `chrome://extensions`)
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose the extension's folder (e.g. `fullpage/`)
4. Pin it from the puzzle-piece menu

Because they are loaded unpacked, they never auto-update -- to get changes, pull
this repo and click the **reload** icon on the extension's card.

Each folder has its own `README.md` with usage, the permissions it asks for, and
why, plus its known limits.

## Why not the Web Store?

For personal use you do not need it. Unpacked extensions run permanently, and
Brave does not nag about developer-mode extensions the way stock Chrome does. The
Store would add a review process, a developer fee, and auto-update plumbing that
none of these need. Skipping it also keeps the code fully in your hands.

## Design principles

- **Manifest V3**, no build step, no bundler, and nothing fetched at runtime. The
  only third-party library is `marked`, vendored locally inside `markdownview/`.
- **Local only** -- no network calls, no analytics, no accounts.
- **Least privilege** -- each extension asks for the narrowest permissions that
  make it work, and each README explains every permission it requests.

## License

[MIT](LICENSE)
