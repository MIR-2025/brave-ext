# Group Icons -- emoji labels for tab groups

Give any tab group an **emoji icon instead of a text label** -- and recolor it
while you're there. Local only: no accounts, no network, nothing leaves your
browser.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `groupicons/` folder
4. Pin it from the puzzle-piece menu

## Use

1. Make a tab group if you have none (right-click a tab -> **Add tab to new group**).
2. Click the **Group Icons** toolbar icon.
3. The popup lists your groups -- color dot, current label, and the favicons of the
   tabs inside so you can tell them apart. Click a group to select it.
4. Click an **emoji** from the palette to make it that group's label, or type/paste
   your own in the box and hit **Set**. **Clear** removes the label.
5. The **color dots** recolor the selected group.

Tip: clicking a tab's favicon in a group row jumps to that tab, so you can confirm
which group you're labelling.

## How it works (and its one real limit)

Brave/Chrome's `tabGroups` API only exposes a group's **text title** and a **color**
from a fixed set of nine. There is no field for a custom image. The trick is that a
title can be an **emoji**, and a group whose title is just an emoji shows that emoji
as its label in the tab strip. So:

- "Icons" here means **emoji** (any emoji, plus short text if you prefer). You cannot
  set an arbitrary PNG/SVG on a native group -- the browser does not allow it.
- Colors are limited to the nine the browser supports (grey, blue, red, yellow,
  green, pink, purple, cyan, orange).

## Permissions

- **`tabGroups`** -- to read your groups and set their emoji title and color. This is
  the whole point of the extension.
- **`tabs`** -- to show each group's tab **favicons and titles** in the popup so you
  can identify which group is which, and to jump to a tab when you click its favicon.
  Nothing is stored or sent anywhere.
