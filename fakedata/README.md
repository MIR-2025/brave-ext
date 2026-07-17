# FakeData -- smart form filler

Fill any form with realistic, **consistent** fake data. It reads each field and
picks a matching value: an email in the email box, a first name in the first-name
box, a real US state/zip pairing, a Luhn-valid test card, and so on -- all from one
coherent fake person, so the name, email, and username line up. Local only: no
accounts, no network, nothing leaves your browser.

## Install (load unpacked)

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this `fakedata/` folder
4. Pin it from the puzzle-piece menu

## Use

Three ways to fill the page you're on:

- **Click the toolbar icon** -> preview the identity, then **Fill this page**.
- **Alt+Shift+F** to fill without opening the popup.
- **Right-click** the page -> **Fill this page with fake data**, or right-click a
  field -> **Fill just this field**.

In the popup you can hit **🔄 New** for a fresh identity, and toggle:

- **Overwrite existing values** -- off means only empty fields are touched.
- **Fill dropdowns, radios & required checkboxes** -- picks a valid `<select>`
  option, one radio per group, and ticks `required` checkboxes.
- **Only visible fields** -- skip hidden/off-screen inputs.

## How it matches fields

For each field it builds a signal from the `autocomplete` attribute, the input
`type`, and the `name` / `id` / `placeholder` / `<label>` / `aria-label`, then maps
it to a kind (email, phone, street, city, state, zip, company, password, card, date,
message, and more). State and country `<select>`s try to match the persona's real
state before falling back to a random valid option.

Values are written with the native value setter and an `input` + `change` event, so
**React / Vue / other framework forms register the change** rather than ignoring a
directly-assigned `.value`.

## Notes and limits

- US-style data (names, states, zips, phone). Structured so more locales can be
  added later.
- The credit-card number is **Luhn-valid but fake** (a `4...` test number) -- for
  filling test/checkout forms, not for real payments.
- Restricted pages (`brave://`, the Web Store, the PDF viewer) can't be scripted.
- Cross-origin embedded iframes can't be filled (browser rule); same-origin frames
  on the page are filled too.

## Permissions

- **`activeTab`** + **`scripting`** -- to fill the page you explicitly act on. There
  is no broad host permission: it only ever runs on the tab you trigger it from.
- **`contextMenus`** -- the right-click entries.
- **`storage`** -- remembers your option toggles.
