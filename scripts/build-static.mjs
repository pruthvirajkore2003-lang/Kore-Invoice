import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist/server/index.js");

const textFiles = {
  "/invoice.html": {
    type: "text/html; charset=utf-8",
    body: await readFile(resolve(root, "public/invoice.html"), "utf8"),
  },
  "/invoice.css": {
    type: "text/css; charset=utf-8",
    body: await readFile(resolve(root, "public/invoice.css"), "utf8"),
  },
  "/invoice.js": {
    type: "text/javascript; charset=utf-8",
    body: await readFile(resolve(root, "public/invoice.js"), "utf8"),
  },
  "/memo.html": {
    type: "text/html; charset=utf-8",
    body: await readFile(resolve(root, "public/memo.html"), "utf8"),
  },
  "/memo.css": {
    type: "text/css; charset=utf-8",
    body: await readFile(resolve(root, "public/memo.css"), "utf8"),
  },
  "/memo.js": {
    type: "text/javascript; charset=utf-8",
    body: await readFile(resolve(root, "public/memo.js"), "utf8"),
  },
};

const binaryFiles = {
  "/signature.png": {
    type: "image/png",
    body: (await readFile(resolve(root, "public/signature.png"))).toString("base64"),
  },
  "/invoice-paper.png": {
    type: "image/png",
    body: (await readFile(resolve(root, "public/invoice-paper.png"))).toString("base64"),
  },
};

const worker = `const textFiles = ${JSON.stringify(textFiles)};
const binaryFiles = ${JSON.stringify(binaryFiles)};

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function decodeBase64(value) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(null, { status: 302, headers: { Location: "/invoice.html", ...securityHeaders } });
    }

    const textAsset = textFiles[url.pathname];
    if (textAsset) {
      return new Response(textAsset.body, {
        headers: { "Content-Type": textAsset.type, "Cache-Control": url.pathname.endsWith(".html") ? "no-cache" : "public, max-age=3600", ...securityHeaders },
      });
    }

    const binaryAsset = binaryFiles[url.pathname];
    if (binaryAsset) {
      return new Response(decodeBase64(binaryAsset.body), {
        headers: { "Content-Type": binaryAsset.type, "Cache-Control": "public, max-age=86400", ...securityHeaders },
      });
    }

    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...securityHeaders } });
  },
};
`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, worker, "utf8");
console.log(`Built ${output}`);
