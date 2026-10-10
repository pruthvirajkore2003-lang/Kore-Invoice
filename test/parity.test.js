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

test("fixture spot values", () => {
  assert.equal(server.formatMoney(server.calculateMemo(memos[0]).total), "8,204.13");
  assert.equal(memos[0].items.length, 5);
  assert.equal(invoices[0].items.length, 6);
});
