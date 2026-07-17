# Dev Dashboard -- localhost & deployed status

A toolbar popup that lists your dev servers and deployed sites with a live
**up/down** check and one-click open. Pre-seeded with your apps and fully editable.
Local only: no accounts, no network beyond the health checks you configure.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `devdash/` folder
4. Pin it from the puzzle-piece menu

## Use

Click the icon. You get two groups -- **Local** and **Deployed** -- each a list of
entries with a status dot:

- 🟢 **green** = up (with round-trip time in ms)
- 🔴 **red** = down
- ⚪ **grey, pulsing** = checking

**Click a row** to open it in a new tab. **↻** re-checks everything. **+** adds an
entry; hover a row for **✎ edit** and **✕ remove**. Everything is stored locally.

When you add an entry, the URL is normalised for you: a bare `localhost:3000` (or an
IP, or anything with a port) becomes `http://...`; a plain domain becomes `https://...`.

## How the up/down check works

Each entry is pinged with a `fetch(url, { mode: 'no-cors' })` and a 4-second timeout.
If the server responds at all, the request resolves -> **up** (and we time it). If the
connection is refused or times out, the fetch throws -> **down**. We never read the
response body -- only whether it connected -- so it works across origins without CORS.

`http://localhost` pings work from the popup because localhost is a trusted origin;
deployed sites are `https`. (A plain-`http` box on your LAN may be blocked as mixed
content -- use `https` or `localhost` there.)

## Permissions

- **Host access to all sites** -- needed so it can ping whatever hosts you add
  (localhost ports and your own domains). It only makes those health-check requests;
  no content scripts, no reading page data, no tracking.
- **`storage`** -- keeps your list of entries locally.
