// FullPage -- result tab. Loads the stitched capture from storage and exports it.

const params = new URLSearchParams(location.search);
const id = params.get('id');

const img = document.getElementById('shot');
const metaEl = document.getElementById('meta');
const statusEl = document.getElementById('status');
const pngBtn = document.getElementById('pngBtn');
const pdfBtn = document.getElementById('pdfBtn');
const copyBtn = document.getElementById('copyBtn');

let capture = null;

init();

async function init() {
  if (!id) { statusEl.textContent = 'No capture id in the URL.'; return; }

  const store = await chrome.storage.local.get(id);
  capture = store[id];
  if (!capture) { statusEl.textContent = 'Capture not found (it may have expired).'; return; }

  img.src = capture.dataUrl;
  img.hidden = false;
  statusEl.hidden = true;
  document.title = 'FullPage -- ' + (capture.title || 'screenshot');
  metaEl.textContent = capture.width + ' x ' + capture.height + ' px' +
    (capture.scaled ? '  (scaled to fit canvas limits)' : '');

  for (const b of [pngBtn, pdfBtn, copyBtn]) {
    b.dataset.label = b.textContent;
    b.disabled = false;
  }

  pngBtn.addEventListener('click', onPng);
  pdfBtn.addEventListener('click', onPdf);
  copyBtn.addEventListener('click', onCopy);
}

function safeName(ext) {
  const base = (capture && capture.title ? capture.title : 'fullpage')
    .replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'fullpage';
  return base + '.' + ext;
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function flash(btn, text) {
  btn.textContent = text;
  btn.disabled = false;
  setTimeout(() => { btn.textContent = btn.dataset.label; }, 1500);
}

function busy(btn, text) {
  btn.textContent = text;
  btn.disabled = true;
}

function onPng() {
  download(capture.dataUrl, safeName('png'));
}

async function onCopy() {
  busy(copyBtn, 'Copying...');
  try {
    const blob = await (await fetch(capture.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    flash(copyBtn, 'Copied');
  } catch (e) {
    console.error(e);
    flash(copyBtn, 'Copy failed');
  }
}

async function onPdf() {
  busy(pdfBtn, 'Building PDF...');
  try {
    const jpeg = await pngToJpeg(capture.dataUrl, 0.92);
    const pdf = buildPdf(jpeg.bytes, jpeg.width, jpeg.height);
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    download(url, safeName('pdf'));
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    flash(pdfBtn, 'Saved');
  } catch (e) {
    console.error(e);
    flash(pdfBtn, 'PDF failed');
  }
}

function pngToJpeg(dataUrl, quality) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const cx = c.getContext('2d');
      cx.fillStyle = '#ffffff';           // JPEG has no alpha; flatten onto white
      cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(im, 0, 0);
      c.toBlob(async (b) => {
        if (!b) return reject(new Error('toBlob returned null'));
        resolve({ bytes: new Uint8Array(await b.arrayBuffer()), width: c.width, height: c.height });
      }, 'image/jpeg', quality);
    };
    im.onerror = () => reject(new Error('image decode failed'));
    im.src = dataUrl;
  });
}

// Minimal single-page PDF that embeds the JPEG directly via DCTDecode.
// No dependencies: we track byte offsets as we append and write the xref by hand.
function buildPdf(jpegBytes, w, h) {
  const enc = new TextEncoder();
  const parts = [];
  let len = 0;
  const offsets = [];

  function push(data) {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    len += bytes.length;
  }
  function obj() { offsets.push(len); }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  obj();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  obj();
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  obj();
  push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] ' +
       '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');

  obj();
  push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h +
       ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
       jpegBytes.length + ' >>\nstream\n');
  push(jpegBytes);
  push('\nendstream\nendobj\n');

  obj();
  const content = enc.encode('q\n' + w + ' 0 0 ' + h + ' 0 0 cm\n/Im0 Do\nQ\n');
  push('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n');
  push(content);
  push('\nendstream\nendobj\n');

  const xrefStart = len;
  const n = offsets.length;
  let xref = 'xref\n0 ' + (n + 1) + '\n0000000000 65535 f \n';
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  push(xref);
  push('trailer\n<< /Size ' + (n + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n');

  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
