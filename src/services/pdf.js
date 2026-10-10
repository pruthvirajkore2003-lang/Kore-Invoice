import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../public");
// Fake origin so the templates' absolute paths (/invoice.css, /signature.png) resolve and localStorage works.
const ORIGIN = "http://stk.local";
const ASSETS = {
  "/invoice.html": "text/html; charset=utf-8",
  "/invoice.css": "text/css; charset=utf-8",
  "/invoice.js": "text/javascript; charset=utf-8",
  "/memo.html": "text/html; charset=utf-8",
  "/memo.css": "text/css; charset=utf-8",
  "/memo.js": "text/javascript; charset=utf-8",
  "/share.js": "text/javascript; charset=utf-8",
  "/voice.js": "text/javascript; charset=utf-8",
  "/signature.png": "image/png",
  "/invoice-paper.png": "image/png",
};
// The page scripts read their draft from these keys, so the browser's own invoice.js/memo.js does the math.
const TEMPLATES = {
  INVOICE: { page: "/invoice.html", storageKey: "stk-invoice-draft-v1", shell: "#invoice" },
  MEMO: { page: "/memo.html", storageKey: "stk-digital-memo-v1", shell: "#memo" },
};

let browserPromise;
// ponytail: one shared browser, one tab per render, no concurrency cap; add a queue if volume grows.
const getBrowser = async () => {
  const browser = await browserPromise;
  if (browser?.connected) return browser;
  if (!process.env.CHROME_PATH) throw new Error("CHROME_PATH is not set");
  browserPromise = puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  return browserPromise;
};

export const closeBrowser = async () => (await browserPromise)?.close();

// Returns the PDF plus the totals the page itself displayed, so callers can cross-check the server math.
export const renderPdf = async (type, state) => {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown document type ${type}`);
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width: 1280, height: 1800 });
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const url = new URL(request.url());
      const type = url.origin === ORIGIN && ASSETS[url.pathname];
      // Block every other request: the render must never reach the network.
      if (!type) return request.abort();
      request.respond({ status: 200, contentType: type, body: await readFile(resolve(publicDir, `.${url.pathname}`)) });
    });
    await page.evaluateOnNewDocument((key, json) => localStorage.setItem(key, json), template.storageKey, JSON.stringify(state));
    await page.goto(`${ORIGIN}${template.page}`, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);

    const shown = await page.$eval(template.shell, (shell) => {
      const text = (selector) => shell.querySelector(selector)?.textContent.trim() ?? "";
      const signature = shell.querySelector('img[src="/signature.png"]');
      return {
        sellerText: shell.textContent.replace(/\s+/g, " "),
        signatureLoaded: Boolean(signature?.complete && signature.naturalWidth > 0),
        logoSvg: Boolean(shell.querySelector(".agri-logo svg")),
        grandTotal: text("#grandTotal"),
        amountWords: text("#amountWords"),
        igst: text("#igstAmount"),
        sgst: text("#sgstAmount"),
        cgst: text("#cgstAmount"),
        freight: text("#freightAmount"),
        memoTotal: text("#memoGrandTotal"),
        memoAdvance: text("#memoAdvanceTotal"),
        memoBalance: text("#memoBalanceTotal"),
      };
    });
    if (!shown.signatureLoaded) throw new Error("Signature image failed to load; refusing to issue unsigned PDF");

    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    return { pdf: Buffer.from(pdf), shown };
  } finally {
    await page.close();
  }
};
