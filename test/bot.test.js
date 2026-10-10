import assert from "node:assert/strict";
import { test } from "node:test";
import { pdfFileName } from "../src/bot.js";
import { calculateInvoice, calculateMemo, formatMoney } from "../src/services/calculations.js";
import { fromJson, parseShorthand } from "../src/services/parser.js";
import { buildButtonsMessage, buildDocumentMessage } from "../src/services/whatsapp.js";

test("document message matches the Cloud API document schema", () => {
  const message = buildDocumentMessage("917057100034", "1234567890", "STK-Invoice-101.pdf", "x".repeat(2000));
  assert.deepEqual(Object.keys(message).sort(), ["document", "messaging_product", "recipient_type", "to", "type"]);
  assert.equal(message.messaging_product, "whatsapp");
  assert.equal(message.type, "document");
  assert.equal(message.document.id, "1234567890");
  assert.equal(message.document.filename, "STK-Invoice-101.pdf");
  assert.ok(message.document.caption.length <= 1024);
  assert.equal(message.document.link, undefined);
});

test("confirmation buttons respect WhatsApp limits", () => {
  const message = buildButtonsMessage("1", "y".repeat(3000), [
    { id: "gen:abc", title: "✅ तयार करा PDF" },
    { id: "cancel:abc", title: "❌ रद्द करा" },
  ]);
  assert.equal(message.interactive.type, "button");
  assert.ok(message.interactive.body.text.length <= 1024);
  for (const { type, reply } of message.interactive.action.buttons) {
    assert.equal(type, "reply");
    assert.ok(reply.title.length <= 20, reply.title);
  }
});

test("invoice shorthand parses into the canonical state", () => {
  const { type, state } = parseShorthand("Invoice\nno: 101\ndate: 10-10-2026\nbuyer: ABC Traders\nbuyer: Pune\nitem: Maize (Makka), 1005, 120, Quintal, 60, 2150\nigst: 5\nfreight: 2000");
  assert.equal(type, "INVOICE");
  assert.equal(state.invoiceDate, "10/10/2026");
  assert.equal(state.buyerDetails, "ABC Traders\nPune");
  assert.equal(state.items.length, 6);
  assert.equal(formatMoney(calculateInvoice(state).grandTotal), "1,37,450.00");
  assert.equal(pdfFileName({ type, state }), "STK-Invoice-101.pdf");
});

test("memo shorthand parses Marathi keys and rate basis", () => {
  const { type, state } = parseShorthand("माल पावती\nनं: 45\nश्री: रामचंद्र पाटील\nitem: गहू, 4000, 80, 60, quintal, 400\nitem: मका, , 100, 20, bag");
  assert.equal(type, "MEMO");
  assert.equal(state.partyName, "रामचंद्र पाटील");
  assert.deepEqual(state.items.map((item) => item.rateBasis), ["quintal", "bag"]);
  assert.equal(formatMoney(calculateMemo(state).balance), "4,000.00");
  assert.equal(pdfFileName({ type, state: { ...state, memoNumber: "../45 x" } }), "STK-Memo-45-x.pdf");
});

test("untrusted JSON is clamped to the schema", () => {
  const draft = fromJson({ type: "memo", state: { memoNumber: 7, evil: "x", items: Array(9).fill({ goodsDetails: "a", rateBasis: "Quintal", bags: {} }) } });
  assert.equal(draft.state.evil, undefined);
  assert.equal(draft.state.memoNumber, "7");
  assert.equal(draft.state.items.length, 5);
  assert.equal(draft.state.items[0].rateBasis, "quintal");
  assert.equal(draft.state.items[0].bags, "");
  assert.equal(fromJson({ type: "UNKNOWN" }), null);
  assert.equal(parseShorthand("hello"), null);
});
