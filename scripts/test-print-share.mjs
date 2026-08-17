import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

// Pull one balanced { ... } block starting at the given opening brace.
const blockAt = (source, index) => {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (source[cursor] === "{") depth += 1;
    else if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(index, cursor + 1);
    }
  }
  throw new Error("unbalanced block");
};

// Comments explain these very declarations, so they must not be matched as code.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const printBlock = (rawCss, label) => {
  const css = stripComments(rawCss);
  const start = css.indexOf("@media print");
  assert.ok(start >= 0, `${label}: no @media print block`);
  return blockAt(css, css.indexOf("{", start));
};

// A4 is 210mm x 297mm. 297mm is 1122.52px in print units, so the screen rule's
// min-height: 1123px must not survive into print or a blank page 2 appears.
const ruleFor = (block, selector, label) => {
  const pattern = new RegExp(`(^|[,{}\\s])${selector.replace(".", "\\.")}\\s*(,[^{]*)?\\{`, "m");
  const match = pattern.exec(block);
  assert.ok(match, `${label}: no print rule for ${selector}`);
  return blockAt(block, block.indexOf("{", match.index + match[0].length - 1));
};

const assertA4 = (rule, selector, label) => {
  for (const declaration of ["width: 210mm", "min-width: 210mm", "max-width: 210mm", "height: 297mm", "min-height: 297mm", "max-height: 297mm"]) {
    assert.ok(rule.includes(declaration), `${label} ${selector}: missing "${declaration}"`);
  }
  assert.ok(!/min-height:\s*1123px/.test(rule), `${label} ${selector}: 1123px min-height spills a second page`);
};

const apps = [
  { css: "public/invoice.css", shell: ".invoice-shell", stage: ".invoice-stage", bundle: "outputs/STK_Invoice_Maker_Offline.html", html: "public/invoice.html", shareId: "shareInvoice" },
  { css: "public/memo.css", shell: ".memo-shell", stage: ".memo-stage", bundle: "outputs/STK_Memo_Maker_Offline.html", html: "public/memo.html", shareId: "shareMemo" },
];

for (const app of apps) {
  const css = await read(app.css);
  const block = printBlock(css, app.css);

  assertA4(ruleFor(block, "html", app.css), "html", app.css);
  assertA4(ruleFor(block, "body", app.css), "body", app.css);

  const shell = ruleFor(block, app.shell, app.css);
  assertA4(shell, app.shell, app.css);
  assert.ok(/zoom:\s*1\s*!important/.test(shell), `${app.css}: shell zoom must be locked to 1`);
  assert.ok(/transform:\s*none\s*!important/.test(shell), `${app.css}: shell transform must be cleared`);
  assert.ok(/overflow:\s*hidden/.test(shell), `${app.css}: shell must clip overflow`);
  assert.ok(/margin:\s*0\s*!important/.test(shell), `${app.css}: shell must sit flush at 0 margin`);

  assert.ok(/\.mobile-create[,\s]/.test(block), `${app.css}: .mobile-create must be hidden while printing`);
  assert.ok(!css.includes("--print-zoom"), `${app.css}: --print-zoom hack still present`);

  const js = await read(app.css.replace(".css", ".js"));
  assert.ok(!js.includes("--print-zoom"), `${app.css.replace(".css", ".js")}: still sets --print-zoom`);

  const html = await read(app.html);
  assert.ok(html.includes(`id="${app.shareId}"`), `${app.html}: toolbar share button missing`);
  assert.ok(html.includes('id="mobileShare"'), `${app.html}: mobile share button missing`);
  assert.ok(html.includes('<script src="/share.js"></script>'), `${app.html}: share.js not loaded`);
  assert.ok(html.indexOf("/share.js") < html.indexOf(app.css.replace("public/", "/").replace(".css", ".js")), `${app.html}: share.js must load first`);
}

// Offline bundles must be genuinely standalone: everything inlined, no runtime
// network dependency except the user-initiated WhatsApp fallback link.
for (const app of apps) {
  const bundle = await read(app.bundle);
  assert.ok(bundle.includes("window.STKShare"), `${app.bundle}: share pipeline not inlined`);
  assert.ok(bundle.includes("shareBill"), `${app.bundle}: shareBill missing`);
  assert.ok(!/<script[^>]+src=/.test(bundle), `${app.bundle}: external script tag`);
  assert.ok(!/<link[^>]+stylesheet/.test(bundle), `${app.bundle}: external stylesheet link`);
  assert.ok(!bundle.includes("--print-zoom"), `${app.bundle}: stale --print-zoom`);
  assert.ok(!/url\(["']?\/[a-z-]+\.png/.test(bundle), `${app.bundle}: un-inlined image url`);

  const remoteUrls = (bundle.match(/https?:\/\/[^"'\s)]+/g) || [])
    .filter((url) => !url.startsWith("http://www.w3.org/"))
    .filter((url) => !url.startsWith("https://api.whatsapp.com/"));
  assert.deepEqual(remoteUrls, [], `${app.bundle}: unexpected remote URLs`);
}

console.log("print + share invariants ok");
