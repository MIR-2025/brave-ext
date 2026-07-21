// Vault crypto -- WebCrypto only, nothing hand-rolled.
//
//   master password --PBKDF2-SHA256--> AES-256-GCM key --> encrypts the vault JSON.
//
// The master password is never stored. The vault is only ever written to disk
// encrypted (storage.local). While unlocked, the derived key lives in
// storage.session (in-memory, wiped when the browser closes) so the popup can
// re-open without re-deriving; an idle alarm clears it (auto-lock).
(function () {
  'use strict';

  // OWASP 2023 floor for PBKDF2-SHA256. ~0.3-1s to derive once, on unlock.
  const ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function ub64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randomSalt() {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  // password + salt -> AES-GCM CryptoKey. Extractable so we can stash it in
  // storage.session (in-memory) for the unlocked-session lifetime.
  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iterations || ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async function exportKey(key) {
    return b64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
  }

  async function importKey(b64key) {
    return crypto.subtle.importKey(
      'raw', ub64(b64key), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
    );
  }

  // Fresh random IV every write (never reuse an IV with GCM).
  async function encryptObj(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))
    );
    return { iv: b64(iv), data: b64(new Uint8Array(ct)) };
  }

  // Throws (GCM auth-tag mismatch) on a wrong key -- that is how we detect a bad
  // master password, so no separate password hash is ever stored.
  async function decryptObj(key, ivB64, dataB64) {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ub64(ivB64) }, key, ub64(dataB64)
    );
    return JSON.parse(dec.decode(pt));
  }

  self.VaultCrypto = {
    ITERATIONS, b64, ub64, randomSalt,
    deriveKey, exportKey, importKey, encryptObj, decryptObj,
  };
})();
