// CSV parsing for the password-manager import.
//
// Handles RFC-4180 quoting (quoted fields, embedded commas/newlines, "" escapes)
// so a password containing a comma or a note spanning lines survives the round-trip.
// fromPasswordCSV() maps a Brave/Chrome (or other manager's) export onto our entry
// shape by column header, so it doesn't matter what order the columns come in.
(function () {
  'use strict';

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    text = text.replace(/^﻿/, ''); // strip a UTF-8 BOM if present
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } // "" -> literal quote
          else quoted = false;
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore, handled by \n */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function fromPasswordCSV(text) {
    const rows = parseCSV(text).filter((r) => r.some((x) => x !== ''));
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (names) => {
      for (const n of names) {
        const k = header.indexOf(n);
        if (k !== -1) return k;
      }
      return -1;
    };
    const iName = col(['name', 'title']);
    const iUrl = col(['url', 'website', 'origin', 'login_uri']);
    const iUser = col(['username', 'user', 'login', 'login_username']);
    const iPass = col(['password', 'pass', 'login_password']);
    const iNote = col(['note', 'notes']);
    const at = (row, i) => (i !== -1 && row[i] != null ? row[i] : '');

    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const url = at(row, iUrl);
      const username = at(row, iUser);
      const password = at(row, iPass);
      const note = at(row, iNote);
      if (!url && !username && !password) continue; // skip blank lines
      out.push({
        name: at(row, iName) || url || username || 'Untitled',
        url, username, password, note,
      });
    }
    return out;
  }

  self.VaultCSV = { parseCSV, fromPasswordCSV };
})();
