import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Same technique as test/parity.test.js: lift the pure PDF writer out of the browser IIFE verbatim.
const loadWriter = async () => {
  const source = await readFile(new URL("../public/share.js", import.meta.url), "utf8");
  const start = source.indexOf("const latin1");
  const end = source.indexOf("const renderToPdfBlob", start);
  assert.ok(start >= 0 && end > start, "PDF writer not found in share.js");
  const constants = /const A4_POINTS = .*;/.exec(source)[0];
  return new Function(`${constants}\n${source.slice(start, end)}\nreturn jpegToPdf;`)();
};

test("jpegToPdf writes a single-page A4 PDF 1.4 with a valid xref table", async () => {
  const jpegToPdf = await loadWriter();
  // Fake JPEG payload with bytes that would break a UTF-8 or string-length based writer.
  const bytes = Uint8Array.from({ length: 300 }, (_, index) => (index * 37) & 0xff);
  const blob = jpegToPdf({ bytes, width: 1588, height: 2246 });
  assert.equal(blob.type, "application/pdf");

  const raw = Buffer.from(await blob.arrayBuffer());
  const text = raw.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF"));
  assert.equal(raw.indexOf(Buffer.from(bytes)) > 0, true, "JPEG bytes embedded untouched");
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(text, /\/Width 1588 \/Height 2246 .*\/Filter \/DCTDecode \/Length 300 >>/);
  assert.equal(text.match(/\/Type \/Page\b/g).length, 1, "exactly one page");

  // startxref must point at "xref", and every entry at its "N 0 obj".
  const startxref = Number(/startxref\n(\d+)\n%%EOF$/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const table = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text.slice(startxref));
  assert.equal(Number(table[1]), 6);
  const entries = table[2].match(/.{20}/gs);
  assert.equal(entries.length, 6, "20-byte entries");
  assert.equal(entries[0], "0000000000 65535 f \n");
  entries.slice(1).forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
  });

  // Image is scaled to fit A4 and centred; content stream /Length matches its bytes.
  const content = /<< \/Length (\d+) >>\nstream\n(.*)\nendstream/.exec(text);
  assert.equal(Number(content[1]), content[2].length);
  const [, w, h, x, y] = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im0 Do Q/.exec(content[2]).map(Number);
  assert.ok(w <= 595.28 && h <= 841.89 + 0.01, "fits the page");
  assert.ok(Math.abs(x * 2 + w - 595.28) < 0.02 && Math.abs(y * 2 + h - 841.89) < 0.02, "centred");
});
