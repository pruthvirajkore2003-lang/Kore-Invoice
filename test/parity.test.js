import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as server from "../src/services/calculations.js";
import { invoices, memos } from "./fixtures.js";

// Same technique as scripts/test-dates.mjs: lift the pure blocks out of the browser IIFE verbatim.
const slice = (source, from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `block ${from} not found`);
  return source.slice(start, end);
};

const browserInvoice = async (state) => {
  const source = await readFile(new URL("../public/invoice.js", import.meta.url), "utf8");
  const code = [
    slice(source, "const numberFormatter", "const loadState"),
    slice(source, "const smallNumbers", "const createGrainPicker"),
    slice(source, "const calculate = ", "const render = "),
    slice(source, "const invoiceSummary", "const shareInvoiceBill"),
  ].join("\n");
  return new Function("state", `${code}\nreturn { calculate, amountInWords, integerToIndianWords, invoiceSummary };`)(state);
};

const browserMemo = async (state) => {
  const source = await readFile(new URL("../public/memo.js", import.meta.url), "utf8");
  const code = [
    slice(source, "const money =", "const normalizeItem"),
    slice(source, "const calculateItem", "const addTextElement"),
    slice(source, "const memoSummary", "const shareMemoBill"),
  ].join("\n");
  return new Function("state", `${code}\nreturn { calculate, memoSummary };`)(state);
};

test("6-item tax invoices match public/invoice.js exactly", async () => {
  for (const state of invoices) {
    const browser = await browserInvoice(state);
    const totals = server.calculateInvoice(state);
    assert.deepEqual(totals, browser.calculate());
    assert.equal(server.amountInWords(totals.grandTotal), browser.amountInWords(totals.grandTotal));
    assert.equal(server.invoiceSummary(state), browser.invoiceSummary());
  }
});

test("5-item Marathi memos match public/memo.js exactly", async () => {
  for (const state of memos) {
    const browser = await browserMemo(state);
    assert.deepEqual(server.calculateMemo(state), browser.calculate());
    assert.equal(server.memoSummary(state), browser.memoSummary());
  }
});

test("Indian words use Lakh/Crore grouping like the browser", async () => {
  const browser = await browserInvoice(invoices[0]);
  for (const amount of [0, 0.01, 1, 19.99, 100, 1001, 99999.5, 100000, 1234567.89, 10000000, 987654321.07, 1e10]) {
    assert.equal(server.amountInWords(amount), browser.amountInWords(amount), `amount ${amount}`);
  }
  assert.equal(server.amountInWords(12345678.9), "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Ninety Paise Only");
});

test("Marathi amount in words uses the 0-99 table, शंभर/एकशे and कोटी/लाख/हजार", async () => {
  const { amountInWords } = await browserInvoice(invoices[0]);
  const cases = [
    [0, "शून्य रुपये फक्त"],
    [1, "एक रुपया फक्त"],
    [0.01, "शून्य रुपये आणि एक पैसा फक्त"],
    [21, "एकवीस रुपये फक्त"],
    [99, "नव्याण्णव रुपये फक्त"],
    [100, "शंभर रुपये फक्त"],
    [101, "एकशे एक रुपये फक्त"],
    [250, "दोनशे पन्नास रुपये फक्त"],
    [1100, "एक हजार शंभर रुपये फक्त"],
    [100000, "एक लाख रुपये फक्त"],
    [137450, "एक लाख सदतीस हजार चारशे पन्नास रुपये फक्त"],
    [12345678.9, "एक कोटी तेवीस लाख पंचेचाळीस हजार सहाशे अठ्ठ्याहत्तर रुपये आणि नव्वद पैसे फक्त"],
    [1e10, "एक हजार कोटी रुपये फक्त"],
  ];
  for (const [amount, words] of cases) assert.equal(amountInWords(amount, "mr"), words, `amount ${amount}`);
  assert.equal(amountInWords(12345678.9), server.amountInWords(12345678.9), "English stays the default");
});

// Switching language must never change a number on the WhatsApp text.
const money = (text) => text.match(/\d[\d,]*\.\d{2}/g);

test("invoice summary in Marathi keeps every amount", async () => {
  for (const state of invoices) {
    const browser = await browserInvoice(state);
    const marathi = browser.invoiceSummary("mr");
    assert.deepEqual(money(marathi), money(browser.invoiceSummary()));
    assert.match(marathi, /^\*STK - कर बीजक\*/);
    assert.ok(!/Grand total|Invoice no|Rupees/.test(marathi), marathi);
  }
});

test("memo summary in English keeps every amount", async () => {
  for (const state of memos) {
    const browser = await browserMemo(state);
    const english = browser.memoSummary("en");
    assert.deepEqual(money(english), money(browser.memoSummary()));
    assert.match(english, /^\*STK Digital Freight Memo\*/);
    assert.ok(!/एकूण भाडे|बाकी भाडे|पावती नं|रु\./.test(english), english);
  }
});

test("fixture spot values", () => {
  assert.equal(server.formatMoney(server.calculateMemo(memos[0]).total), "8,204.13");
  assert.equal(memos[0].items.length, 5);
  assert.equal(invoices[0].items.length, 6);
});
