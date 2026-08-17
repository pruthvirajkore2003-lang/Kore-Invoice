import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The two apps are standalone IIFEs with no shared module, so the date helpers are
// duplicated on purpose. Pull the block out of each file and hold both to one table.
const loadDateHelpers = async (name) => {
  const source = await readFile(resolve(root, "public", name), "utf8");
  const start = source.indexOf("const pad2 =");
  const end = source.indexOf("  // Types DD/MM/YYYY");
  assert.ok(start >= 0 && end > start, `${name}: date helper block not found`);
  return new Function(`${source.slice(start, end)}\nreturn { formatDate, dmyToYmd };`)();
};

const cases = [
  ["2026-08-14", "14/08/2026"],
  ["2026-08-14T00:00:00.000Z", "14/08/2026"],
  ["14/08/2026", "14/08/2026"],
  ["14-08-2026", "14/08/2026"],
  ["14.08.2026", "14/08/2026"],
  ["4/8/2026", "04/08/2026"],
  ["14082026", "14/08/2026"],
  ["", ""],
  [null, ""],
  [undefined, ""],
  ["45/13/2026", "45/13/2026"], // impossible date is passed through, never rewritten
  ["14/08/26", "14/08/26"], // ambiguous, left alone
  ["on demand", "on demand"],
];

for (const name of ["invoice.js", "memo.js"]) {
  const { formatDate, dmyToYmd } = await loadDateHelpers(name);
  for (const [input, expected] of cases) {
    assert.equal(formatDate(input), expected, `${name}: formatDate(${JSON.stringify(input)})`);
  }
  assert.equal(formatDate(formatDate("2026-08-14")), "14/08/2026", `${name}: formatDate is idempotent`);
  assert.equal(dmyToYmd("14/08/2026"), "2026-08-14", `${name}: dmyToYmd round trip`);
  assert.equal(dmyToYmd("2026-08-14"), "2026-08-14", `${name}: dmyToYmd normalizes first`);
  assert.equal(dmyToYmd("45/13/2026"), "", `${name}: dmyToYmd rejects impossible dates`);
  assert.equal(dmyToYmd(""), "", `${name}: dmyToYmd on empty`);
}

console.log("date helpers ok");
