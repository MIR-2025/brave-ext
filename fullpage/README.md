# FullPage -- full page screenshot

A local, dependency-free clone of GoFullPage. Click the toolbar icon, it scrolls
the page top to bottom, stitches every viewport into one image, and opens a result
tab where you can save it as PNG or PDF, or copy it to the clipboard.

Nothing is sent anywhere. No accounts, no network calls, no watermark.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `fullpage/` folder

Pin it from the puzzle-piece menu so the icon is always visible.

## Use

- Click the **FullPage** toolbar icon on any normal web page.
- The badge shows capture progress (a percentage). When it finishes, a result tab opens.
- In the result tab: **Download PNG**, **Download PDF**, or **Copy to clipboard**.

## How it works

- The service worker measures the page, then scrolls it in viewport-sized steps,
  calling `captureVisibleTab` at each step (throttled to stay under the browser's
  ~2-per-second capture quota).
- Slices are stitched onto an `OffscreenCanvas` at the correct offsets and device
  pixel ratio, so the output is full resolution.
- `position: fixed` / `sticky` elements are shown on the first shot only, then
  hidden, so sticky headers don't repeat down the image.
- The PDF is built by hand and embeds the image directly (DCTDecode) -- no library.

## Limits and notes

- **Restricted pages** (`brave://`, the Web Store, `view-source:`, the PDF viewer)
  cannot be scripted or captured -- the badge shows `ERR`. That is a browser rule,
  not a bug.
- **Very tall pages**: browser canvases top out around 16384 px per edge. Beyond
  that the capture is scaled down to fit; the result tab notes when this happened.
- Only the latest capture is kept in storage, so reloading the result tab works
  until you take another shot.
- Tall pages take a few seconds because captures are deliberately throttled -- if
  they weren't, the browser would reject them.
