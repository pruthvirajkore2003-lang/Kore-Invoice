import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
const output = resolve(root, "outputs/STK_Invoice_Maker_Offline.html");

let html = await readFile(resolve(publicDir, "invoice.html"), "utf8");
let css = await readFile(resolve(publicDir, "invoice.css"), "utf8");
const js = (await readFile(resolve(publicDir, "invoice.js"), "utf8")).replace(/<\/script/gi, "<\\/script");
const paper = (await readFile(resolve(publicDir, "invoice-paper.png"))).toString("base64");
const signature = (await readFile(resolve(publicDir, "signature.png"))).toString("base64");

css = css.replace('url("/invoice-paper.png")', `url("data:image/png;base64,${paper}")`);
html = html
  .replace('<link rel="stylesheet" href="/invoice.css" />', `<style>${css}</style>`)
  .replace('<img src="/signature.png" alt="Authorised signature" />', `<img src="data:image/png;base64,${signature}" alt="Authorised signature" />`)
  .replace('<script src="/invoice.js"></script>', `<script>${js}</script>`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, "utf8");
console.log(`Built ${output}`);
