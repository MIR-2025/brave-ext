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
- **JS heap ↻** reads each tab's approximate JS heap and shows it on the card (see
  the honest caveats below).

## Per-tab memory (the honest bit)

You cannot get a tab's **real total memory** (the numbers in Brave's Task Manager)
from an extension -- the API that exposes it, `chrome.processes`, is **Dev-channel
only** and is absent from stable Brave/Chrome.

What the badge shows instead is each tab's **JavaScript heap** (`usedJSHeapSize`),
read by briefly injecting a one-line script into each tab. That means:

- It's the **JS heap only** -- not images, video, GPU, or the render process. A tab
  can use a lot of real memory with a small heap, so treat this as a rough signal
  for "which tabs are running heavy JavaScript," not a true memory total.
- The number is **approximate**. `performance.memory` is coarse by design, and
  **Brave's fingerprinting protection may round it further -- or return nothing at
  all**, in which case cards simply show no badge.
- **Discarded** (sleeping) tabs show `unloaded`; restricted pages (`brave://`, the
  Web Store, other extension pages) show no badge.
- It's read on demand -- when the page opens and when you click **JS heap ↻**.

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

## Surviving an extension reload

The overview is an extension page, so reloading the extension (a dev iteration or an
update) would normally close it. Instead the worker remembers that it was open and
**reopens it automatically** when the extension reloads or the browser restarts
(deduped against one the browser restored itself).

## Permissions

- **Host access to all sites** -- required by `captureVisibleTab` (thumbnails) and by
  reading each tab's JS heap. Captures are downscaled to a small thumbnail and kept
  locally in session storage; there is no tracking and nothing is sent anywhere.
- **`storage`** -- holds the thumbnail cache (session-only).
- **`scripting`** -- to inject the one-line `performance.memory` read into each tab
  for the JS-heap badge.
