# Vault -- a local-only password manager

A Manifest V3 browser extension that keeps your passwords **encrypted, on this
device, and nowhere else**. Import your browser's password CSV export, lock it
behind a master password, and you're done. No account, no sync, no server -- the
vault never leaves the machine.

## Security model

- **Master password → key.** Your master password is stretched with
  **PBKDF2-SHA256, 600,000 iterations** (WebCrypto) against a random 16-byte salt
  to derive a **256-bit AES-GCM** key. The master password itself is **never
  stored** -- forget it and the vault is unrecoverable (that's the point).
- **Vault → ciphertext at rest.** Entries are serialized to JSON and encrypted
  with **AES-256-GCM** (a fresh random IV every write). Only the ciphertext is
  ever written to `chrome.storage.local`. A wrong master password fails the GCM
  auth check on decrypt -- that *is* the password check, so no password hash is
  stored either.
- **Unlocked session.** On unlock the derived key is held in
  `chrome.storage.session` -- in memory only, wiped when the browser closes -- so
  the popup can reopen without re-deriving. An idle **auto-lock** (15 min, via
  `chrome.alarms`) clears it; **Lock** does so immediately.
- **Least privilege.** Permissions are `storage`, `clipboardWrite`, `alarms`.
  **No host permissions, no content scripts, no network.** The extension cannot
  read the pages you visit, and nothing it holds can be sent anywhere.
- **All standard WebCrypto.** No hand-rolled crypto anywhere.

## Import your Brave/Chrome passwords

An extension can't read the browser's saved-password store directly (there's no
API for it), so import from the CSV export:

1. In Brave: `brave://settings/passwords` → the **⋮** menu → **Export passwords**
   → save the `.csv`. (Chrome/Edge: same, under Passwords.)
2. Open Vault → **Import**. The vault opens in a **tab** to do this, because a
   file picker cannot run inside a browser action popup -- opening the OS dialog
   takes focus, which destroys the popup before the file is ever read. Pick the
   CSV there; it's parsed, encrypted, and stored.
3. **Delete the CSV.** It's a plaintext copy of every password -- Vault reminds
   you after import.

The importer maps columns **by header**, so exports from Bitwarden, 1Password,
LastPass, KeePass, etc. (any `name,url,username,password[,note]`-style CSV) work
too, in any column order.

## Install (load unpacked)

1. `brave://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `vault/` folder.
3. Pin it, click it, set a master password.

## Use

- **Search** filters by name / URL / username as you type.
- **＋** adds an entry; click any entry to view, reveal (👁), copy, edit, or delete.
- **Copy** on a row copies that password without opening it.
- **Lock** (top-right) locks immediately; it also auto-locks after 15 min idle.

## Files

```
manifest.json     MV3, minimal permissions
popup.html/css/js the whole UI + controller (setup / unlock / vault)
lib/crypto.js     PBKDF2 + AES-GCM helpers (WebCrypto only)
lib/csv.js        RFC-4180 CSV parser + password-export column mapping
background.js     auto-lock alarm (clears the in-memory session key)
icons/            padlock
```

## Limits / possible v2

- **No autofill yet.** v1 is a vault (view + copy). Autofill needs a content
  script and host access -- real added attack surface -- so it's a deliberate,
  separate v2, not a default.
- **No password generator** in v1 (easy add).
- **Export / encrypted backup** of the vault isn't exposed yet; the encrypted
  blob lives in `chrome.storage.local`. A "download encrypted backup" button is a
  natural v2.
- **Clipboard auto-clear** (wipe a copied password after ~20s) is a planned v2
  hardening.
