# Tab Overview -- visual grid of open tabs

See every open tab in one page: a grid of **thumbnails**, grouped by window, with
search and one-click switch or close. Thumbnails are captured as you browse. Local
only: nothing leaves your browser.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `taboverview/` folder
4. Pin it from the puzzle-piece menu

## Use

- Click the **Tab Overview** icon -- it opens (or focuses) the overview tab.
- **Click a card** to switch to that tab (and focus its window).
- **✕** on a card closes that tab.
- **Search** by title or URL to filter.
- Tabs are grouped by window; the active tab in each window is outlined.

## About the thumbnails (the honest bit)

Browser extensions **cannot** grab a thumbnail of a background tab on demand -- the
only capture API shoots the *currently visible* tab. So Tab Overview captures a tab
**as you settle on it** (a background worker snaps the visible tab ~0.7 s after it
becomes active, downscales it, and caches it by tab id). The grid then shows each
tab's **last-seen** preview. Which means:

- A tab you've viewed since installing shows a real thumbnail.
- A tab opened in the background and never focused shows its **favicon** with
  "no preview yet" -- until you visit it once.
- Thumbnails are stored in **session** storage: they live for the browser session
  and are cleared when you fully close the browser (they rebuild as you browse).
- Restricted pages (`brave://`, the Web Store, other extension pages, the PDF viewer)
  can't be captured, so they always show a favicon.

## Permissions

- **Host access to all sites** -- required by `captureVisibleTab` to snapshot the
  pages you view. Captures are downscaled to a small thumbnail and kept locally in
  session storage; there is no tracking and nothing is sent anywhere.
- **`storage`** -- holds the thumbnail cache (session-only).
