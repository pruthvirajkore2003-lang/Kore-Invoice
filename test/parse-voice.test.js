import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS, POST } from "../api/parse-voice.js";

const post = (fields) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return POST(new Request("http://localhost/api/parse-voice", { method: "POST", body: form }));
};
const audio = () => new File(["fake-opus"], "voice.webm", { type: "audio/webm" });

test("OPTIONS answers CORS preflight for file:// bundles", () => {
  const response = OPTIONS();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("POST rejects bad input before calling Groq", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Groq must not be called"));
  process.env.GROQ_API_KEY = "test-key";
  assert.equal((await post({ docType: "memo" })).status, 400);
  assert.equal((await post({ audio: audio(), docType: "receipt" })).status, 400);
  assert.equal((await post({ audio: new File(["x"], "a.txt", { type: "text/plain" }), docType: "memo" })).status, 415);
  delete process.env.GROQ_API_KEY;
  assert.equal((await post({ audio: audio(), docType: "memo" })).status, 500);
});

test("POST transcribes, extracts memo JSON, and keeps the key server-side", async (t) => {
  process.env.GROQ_API_KEY = "test-key";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    const body = url.endsWith("/audio/transcriptions")
      ? { text: "मका शंभर पोती तीस रुपये भाडे" }
      : { choices: [{ message: { content: JSON.stringify({ items: [{ goodsDetails: "मका", bags: "100", freightRate: "30", rateBasis: "bag" }] }) } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const response = await post({ audio: audio(), docType: "memo", currentDate: "10/10/2026" });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.data.items[0].bags, "100");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.match(JSON.parse(calls[1].init.body).messages[0].content, /माल पावती[\s\S]*10\/10\/2026/);
  assert.ok(!JSON.stringify(result).includes("test-key"));
  delete process.env.GROQ_API_KEY;
});
