# MarkdownView -- render .md in the browser

Opens Markdown files as clean, readable pages instead of raw text -- local
(`file://`) and remote. Reading-width layout, dark/light/auto themes, a table of
contents, and a one-click **View raw** toggle. Local only: no accounts, no network.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `markdownview/` folder
4. **For local files:** click **Details** on MarkdownView and turn on
   **Allow access to file URLs**. (Needed so it can read `file:///…/*.md`.)

## Use

- Open any `.md` (or `.markdown`, `.mdown`, `.mkd`, `.mdwn`, `.mkdn`) file --
  a local `file://` path or a remote one served as text (e.g. a raw GitHub URL).
- It renders automatically. Use the toolbar for **Contents**, **View raw**, and
  **Theme** (Auto -> Light -> Dark, remembered).
- The toolbar popup (extension icon) has a global on/off switch, the default theme,
  and a favicon toggle.

## Favicons for pages that have none

Markdown files normally give the tab a blank icon. MarkdownView fixes that:

- **Auto** -- each file gets a colored **monogram** (the first letter of its title,
  on a color derived from the filename), so several open `.md` tabs are easy to tell
  apart.
- **Custom, via front matter** -- add YAML front matter at the top and MarkdownView
  uses it (and hides it from the rendered page):

  ```
  ---
  title: My Design Doc
  favicon: 🎨
  ---
  ```

  `favicon:` accepts an **emoji**, a **URL**, or a **relative path** (e.g.
  `./logo.png`). `title:` sets the tab (and bookmark) title.

Turn the whole thing off with the **Give pages a favicon** switch in the popup.

## How it works

- A content script runs only on markdown-looking URLs, and only transforms the page
  when it's actually served as text (`text/plain`, `text/markdown`, ...). Pages that
  serve a `.md` URL as HTML (like the GitHub file browser) are left untouched.
- Markdown is parsed with a bundled copy of **marked** (GitHub-flavored: tables, task
  lists, fenced code). The output is **sanitized** -- `<script>`/`<iframe>`/etc. tags,
  `on*` event handlers, and `javascript:` URLs are stripped -- before it's inserted,
  so opening an untrusted `.md` can't run code.

## Notes and limits

- Rendered code blocks are monospaced but **not syntax-highlighted** (keeps the
  extension small and dependency-light).
- If a server sends a `.md` file as a download (rather than displaying it as text),
  there's no page to render -- that's the server's `Content-Type`, not something an
  extension can change.
- No syntax highlighting or Mermaid diagrams in v1.

## Third-party

`lib/marked.umd.js` is [marked](https://github.com/markedjs/marked) (v18, MIT),
vendored unmodified. Its license is in `lib/marked.LICENSE`.

## Permissions

- **`storage`** -- remembers the on/off switch and theme. That's the only permission;
  page access comes from the content-script match patterns (markdown URLs only), and
  local-file access is the manual "Allow access to file URLs" toggle you control.
