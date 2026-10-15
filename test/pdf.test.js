import assert from "node:assert/strict";
import { after, test } from "node:test";
import { amountInWords, calculateInvoice, calculateMemo, formatMoney } from "../src/services/calculations.js";
import { closeBrowser, renderPdf } from "../src/services/pdf.js";
import { invoices, memos } from "./fixtures.js";

const skip = process.env.CHROME_PATH ? false : "set CHROME_PATH to a Chrome/Chromium binary to run PDF tests";
after(closeBrowser);

const assertSinglePageA4 = (pdf) => {
  const raw = pdf.toString("latin1");
  assert.equal(raw.slice(0, 5), "%PDF-");
  assert.equal(raw.match(/\/Type\s*\/Page\b/g)?.length, 1, "exactly one page");
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(raw);
  assert.ok(box && Math.abs(box[1] - 595.92) < 1 && Math.abs(box[2] - 842.88) < 1, "A4 media box");
  assert.ok((raw.match(/\/Subtype\s*\/Image/g)?.length ?? 0) >= 1, "embeds raster images (signature, paper)");
};

test("invoice PDF renders all fields, seller header, logo and signature", { skip, timeout: 60000 }, async () => {
  const state = invoices[0];
  const { pdf, shown } = await renderPdf("INVOICE", state);
  const totals = calculateInvoice(state);
  assert.equal(shown.grandTotal, formatMoney(totals.grandTotal));
  assert.equal(shown.igst, formatMoney(totals.igst));
  assert.equal(shown.freight, formatMoney(totals.freight));
  assert.equal(shown.amountWords, amountInWords(totals.grandTotal));
  for (const text of ["SURESH TUKARAM KORE", "Mhaswad Road Malshiras", "Maharashtra - 413107", "7057100034", "ACOPK3657P", state.invoiceNumber, state.invoiceDate, "Shree Ganesh Traders", "MH45 AB 1234", "Tur / Arhar (Pigeon Pea)"]) {
    assert.ok(shown.sellerText.includes(text), `missing ${text}`);
  }
  assert.ok(shown.logoSvg, "corn logo SVG");
  assert.ok(shown.signatureLoaded, "signature.png");
  assert.ok(shown.sellerText.includes("TAX INVOICE"), "bot invoices stay English by default");
  assert.equal(shown.overflows, false, "nothing clipped off the A4 sheet");
  assertSinglePageA4(pdf);
});

test("Marathi invoice PDF keeps totals, legal markers and one A4 page", { skip, timeout: 60000 }, async () => {
  const state = invoices[0];
  const { pdf, shown } = await renderPdf("INVOICE", state, "mr");
  const totals = calculateInvoice(state);
  assert.equal(shown.grandTotal, formatMoney(totals.grandTotal));
  assert.equal(shown.igst, formatMoney(totals.igst));
  assert.match(shown.amountWords, /रुपये .*फक्त$/);
  for (const text of ["सुरेश तुकाराम कोरे", "कर बीजक", "TAX INVOICE", "ORIGINAL FOR RECIPIENT", "7057100034", "ACOPK3657P", state.invoiceNumber, "MH45 AB 1234"]) {
    assert.ok(shown.sellerText.includes(text), `missing ${text}`);
  }
  assert.equal(shown.overflows, false, "nothing clipped off the A4 sheet");
  assertSinglePageA4(pdf);
});

test("memo PDF renders Marathi fields, totals and signature", { skip, timeout: 60000 }, async () => {
  const state = memos[0];
  const { pdf, shown } = await renderPdf("MEMO", state);
  const totals = calculateMemo(state);
  assert.equal(shown.memoTotal, formatMoney(totals.total));
  assert.equal(shown.memoAdvance, formatMoney(totals.advance));
  assert.equal(shown.memoBalance, formatMoney(totals.balance));
  for (const text of [state.memoNumber, state.memoDate, "रामचंद्र पाटील", "पुणे", "MH45 AB 1234", "सोयाबीन", "माल ओला होऊ देऊ नये"]) {
    assert.ok(shown.sellerText.includes(text), `missing ${text}`);
  }
  assert.ok(shown.signatureLoaded, "signature.png");
  assert.ok(shown.sellerText.includes("बाकी भाडे"), "bot memos stay Marathi by default");
  assert.equal(shown.overflows, false, "nothing clipped off the A4 sheet");
  assertSinglePageA4(pdf);
});

test("English memo PDF keeps totals and one A4 page with five items", { skip, timeout: 60000 }, async () => {
  const state = memos[0];
  const { pdf, shown } = await renderPdf("MEMO", state, "en");
  const totals = calculateMemo(state);
  assert.equal(shown.memoTotal, formatMoney(totals.total));
  assert.equal(shown.memoBalance, formatMoney(totals.balance));
  for (const text of ["Suresh Tukaram Kore", "Balance freight", "Vehicle No.", "MH45 AB 1234", "॥ श्री ॥"]) {
    assert.ok(shown.sellerText.includes(text), `missing ${text}`);
  }
  assert.equal(shown.overflows, false, "nothing clipped off the A4 sheet");
  assertSinglePageA4(pdf);
});
