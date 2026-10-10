import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 1024 * 1024;

export const verifySignature = (rawBody, header, appSecret) => {
  if (!appSecret || typeof header !== "string" || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const received = Buffer.from(header.slice(7));
  return received.length === expected.length && timingSafeEqual(received, expected);
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(new Error("Body too large"));
      req.destroy();
    } else chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
};

// onEvent runs after the 200 is sent, so Meta never waits on STT or PDF work.
export const createApp = ({ appSecret, verifyToken, onEvent }) => async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") return send(res, 200, "ok");
  if (url.pathname !== "/webhook") return send(res, 404, "Not found");

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && verifyToken && token === verifyToken) return send(res, 200, challenge);
    return send(res, 403, "Forbidden");
  }

  if (req.method === "POST") {
    let raw;
    try {
      raw = await readBody(req);
    } catch {
      return send(res, 413, "Payload too large");
    }
    if (!verifySignature(raw, req.headers["x-hub-signature-256"], appSecret)) return send(res, 401, "Invalid signature");
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return send(res, 400, "Invalid JSON");
    }
    send(res, 200, "EVENT_RECEIVED");
    setImmediate(() => Promise.resolve(onEvent(payload)).catch((error) => console.error("Webhook processing failed:", error)));
    return;
  }

  send(res, 405, "Method not allowed");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { META_APP_SECRET, WEBHOOK_VERIFY_TOKEN, PORT = "3000" } = process.env;
  if (!META_APP_SECRET || !WEBHOOK_VERIFY_TOKEN) throw new Error("META_APP_SECRET and WEBHOOK_VERIFY_TOKEN are required");
  const { handleWebhook } = await import("./bot.js");
  createServer(createApp({ appSecret: META_APP_SECRET, verifyToken: WEBHOOK_VERIFY_TOKEN, onEvent: handleWebhook }))
    .listen(Number(PORT), () => console.log(`STK WhatsApp bot listening on :${PORT}`));
}
