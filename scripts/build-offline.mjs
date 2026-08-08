import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
const outputDir = resolve(root, "outputs");

const paper = (await readFile(resolve(publicDir, "invoice-paper.png"))).toString("base64");
const signature = (await readFile(resolve(publicDir, "signature.png"))).toString("base64");

const offlineLinks = {
  'href="/invoice.html"': 'href="STK_Invoice_Maker_Offline.html"',
  'href="/memo.html"': 'href="STK_Memo_Maker_Offline.html"',
};

async function buildOffline(name, outputName) {
  let html = await readFile(resolve(publicDir, `${name}.html`), "utf8");
  let css = await readFile(resolve(publicDir, `${name}.css`), "utf8");
  const js = (await readFile(resolve(publicDir, `${name}.js`), "utf8")).replace(/<\/script/gi, "<\\/script");

  css = css.replaceAll('url("/invoice-paper.png")', `url("data:image/png;base64,${paper}")`);
  html = html
    .replace(`<link rel="stylesheet" href="/${name}.css" />`, `<style>${css}</style>`)
    .replace('src="/signature.png"', `src="data:image/png;base64,${signature}"`)
    .replace(`<script src="/${name}.js"></script>`, `<script>${js}</script>`);
  for (const [from, to] of Object.entries(offlineLinks)) html = html.replaceAll(from, to);

  const output = resolve(outputDir, outputName);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, "utf8");
  console.log(`Built ${output}`);
}

await buildOffline("invoice", "STK_Invoice_Maker_Offline.html");
await buildOffline("memo", "STK_Memo_Maker_Offline.html");
