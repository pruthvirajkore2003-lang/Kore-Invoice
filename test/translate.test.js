import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS, POST } from "../api/translate.js";

const post = (body) => POST(new Request("http://localhost/api/translate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
}));

test("OPTIONS answers CORS preflight for file:// bundles", () => {
  const response = OPTIONS();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("POST rejects bad input before calling Groq", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Groq must not be called"));
  delete process.env.GROQ_API_KEY;
  assert.equal((await post({ to: "mr", items: [{ id: "partyName", text: "Ram" }] })).status, 500);
  process.env.GROQ_API_KEY = "test-key";
  const field = { id: "partyName", text: "Ram" };
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post({ to: "hi", items: [field] })).status, 400);
  assert.equal((await post({ to: "mr", items: [] })).status, 400);
  assert.equal((await post({ to: "mr", items: Array.from({ length: 31 }, (_, index) => ({ id: `items.${index % 6}.uom`, text: "Kg" })) })).status, 400);
  for (const bad of [
    { id: "invoiceNumber", text: "101" }, // codes are never sent for conversion
    { id: "__proto__", text: "x" },
    { id: "items.9.particulars", text: "Wheat" },
    { id: "items.0.__proto__", text: "x" },
    { id: "partyName", text: "" },
    { id: "partyName", text: "x".repeat(501) },
    { id: "partyName", text: 5 },
  ]) assert.equal((await post({ to: "mr", items: [bad] })).status, 400, JSON.stringify(bad).slice(0, 60));
  assert.equal((await post({ to: "mr", items: [field, field] })).status, 400, "duplicate ids");
  assert.equal((await post("x".repeat(16001))).status, 413);
  delete process.env.GROQ_API_KEY;
});

test("POST converts whitelisted fields, keeps the facts, and keeps the key server-side", async (t) => {
  process.env.GROQ_API_KEY = "test-key";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    const content = JSON.stringify({ items: [
      { id: "partyName", text: "रामचंद्र पाटील" },
      { id: "fullAddress", text: "प्लॉट, एमआयडीसी" }, // lost "12": must be dropped
      { id: "items.0.goodsDetails", text: "मका" },
      { id: "destination", text: "पुणे ४११००१" }, // Devanagari digits come back as Western digits
      { id: "evil", text: "ignored" },
    ] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  const response = await post({ to: "mr", items: [
    { id: "partyName", text: "Ramchandra Patil" },
    { id: "fullAddress", text: "Plot 12, MIDC" },
    { id: "items.0.goodsDetails", text: "Maize" },
    { id: "destination", text: "Pune 411001" },
  ] });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result, { success: true, items: [
    { id: "partyName", text: "रामचंद्र पाटील" },
    { id: "items.0.goodsDetails", text: "मका" },
    { id: "destination", text: "पुणे 411001" },
  ] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  const request = JSON.parse(calls[0].init.body);
  assert.match(request.messages[0].content, /Marathi[\s\S]*never Hindi/);
  assert.ok(request.max_completion_tokens > 0);
  const sent = JSON.parse(request.messages[1].content);
  assert.equal(sent.to, "mr");
  assert.deepEqual(sent.items.map((item) => [item.id, item.kind]), [["partyName", "name"], ["fullAddress", "address"], ["items.0.goodsDetails", "goods"], ["destination", "place"]]);
  assert.ok(!JSON.stringify(result).includes("test-key"));
  delete process.env.GROQ_API_KEY;
});

test("POST reports an upstream failure without leaking details", async (t) => {
  process.env.GROQ_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => new Response("rate limited", { status: 429 }));
  t.mock.method(console, "error", () => {});
  const response = await post({ to: "en", items: [{ id: "partyName", text: "रामचंद्र पाटील" }] });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { success: false, error: "Translation failed" });
  delete process.env.GROQ_API_KEY;
});
