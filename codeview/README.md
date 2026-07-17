# Code Viewer -- syntax-highlighted source files

Opens source files as clean, highlighted pages instead of raw text -- local
(`file://`) and remote. Line numbers, dark/light/auto themes, wrap and raw toggles,
a copy button, and a per-file favicon. Local only: no accounts, no network.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `codeview/` folder
4. **For local files:** click **Details** on Code Viewer and turn on
   **Allow access to file URLs**.

## Use

Open any supported source file -- a local `file://` path or a remote one served as
text (a raw GitHub URL, a dotfile, etc.). It highlights automatically. The toolbar:

- **language badge** -- what it detected
- **Wrap** -- toggle line wrapping (line numbers hide while wrapped)
- **Raw** -- flip between highlighted and plain text
- **Copy** -- copy the whole file
- **Theme** -- Auto -> Light -> Dark (remembered)

The popup (extension icon) has an on/off switch, a favicon toggle, a default-wrap
option, and the default theme.

## Languages

Highlighting is by a bundled copy of **highlight.js** (common languages, ~36 of
them). The language is chosen from the file extension, with auto-detection as a
fallback. JavaScript, TypeScript, JSON, and shell/bash are covered well, along with
Python, Go, Rust, Ruby, Java, C/C++, C#, PHP, CSS/SCSS/LESS, YAML, TOML, SQL, Lua,
Swift, Kotlin, diffs, and more. Files it doesn't recognize are shown as plain text.

## Notes and limits

- It only transforms files **served as text**. A `.html` served as a page (or an
  `.svg` served as an image) renders normally -- Code Viewer leaves it alone.
- Very large files (> ~300 KB) skip auto-detection and, if the extension isn't
  mapped, are shown unhighlighted (keeps things fast).
- No minimap or code folding -- it's a viewer, not an editor.

## Third-party

`lib/hljs.min.js` is [highlight.js](https://github.com/highlightjs/highlight.js)
(common-languages browser build, BSD-3-Clause), vendored unmodified. Its license is
in `lib/hljs.LICENSE`.

## Permissions

- **`storage`** -- remembers your toggles and theme.
- **`clipboardWrite`** -- for the Copy button.

Page access comes from the content-script match patterns (source-file URLs only);
local-file access is the manual "Allow access to file URLs" toggle you control.
