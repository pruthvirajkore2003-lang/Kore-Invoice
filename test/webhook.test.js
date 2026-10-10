import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/server.js";

const SECRET = "test-app-secret";
const TOKEN = "test-verify-token";
const events = [];
let server;
let base;

before(async () => {
  server = createServer(createApp({ appSecret: SECRET, verifyToken: TOKEN, onEvent: (payload) => events.push(payload) }));
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const sign = (body) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
const post = (body, signature) => fetch(`${base}/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(signature && { "X-Hub-Signature-256": signature }) },
  body,
});

test("GET /webhook echoes hub.challenge for the right token", async () => {
  const response = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.challenge=12345`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "12345");
});

test("GET /webhook rejects a wrong token", async () => {
  const response = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345`);
  assert.equal(response.status, 403);
});

test("POST /webhook rejects invalid or missing X-Hub-Signature-256 with 401", async () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  assert.equal((await post(body, `sha256=${"0".repeat(64)}`)).status, 401);
  assert.equal((await post(body, sign(`${body} `))).status, 401);
  assert.equal((await post(body)).status, 401);
  assert.equal(events.length, 0);
});

test("POST /webhook with a valid signature answers 200 fast, then processes", async () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "1" }] });
  const started = performance.now();
  const response = await post(body, sign(body));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "EVENT_RECEIVED");
  assert.ok(performance.now() - started < 500);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events.at(-1), JSON.parse(body));
});
