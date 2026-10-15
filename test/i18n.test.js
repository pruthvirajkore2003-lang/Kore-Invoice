import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// public/i18n.js is a browser IIFE; run it against just enough of a DOM for the code paths under test.
const loadI18n = async ({ fetch = () => assert.fail("network not expected"), storage = new Map(), online = true } = {}) => {
  const window = {};
  const element = () => ({ classList: { toggle() {} }, querySelectorAll: () => [] });
  const document = {
    documentElement: {},
    body: element(),
    querySelectorAll: () => [],
    getElementById: () => null,
    dispatchEvent() {},
  };
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const source = await read("public/i18n.js");
  new Function("window", "document", "localStorage", "location", "navigator", "fetch", "CustomEvent", source)(
    window, document, localStorage, { protocol: "https:" }, { onLine: online }, fetch, class {},
  );
  return window.STKI18n;
};

// A fake /api/translate that answers from a table and records what it was asked.
const translator = (answers) => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify({ success: true, items: body.items.map(({ id, text }) => ({ id, text: answers[text] ?? text })) }));
  };
  return { calls, fetch };
};

const pages = [
  { html: "public/invoice.html", lang: 0 }, // authored in English
  { html: "public/memo.html", lang: 1 }, // authored in Marathi
];
const normalize = (text) => text.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

test("every dictionary entry has an English and a Marathi string", async () => {
  const { strings } = await loadI18n();
  for (const [key, pair] of Object.entries(strings)) {
    assert.ok(Array.isArray(pair) && pair.length === 2 && pair.every((value) => typeof value === "string"), key);
    assert.ok(pair[0] || pair[1], `${key} is empty in both languages`);
    if (key !== "memo.doc.in") assert.ok(pair[0] && pair[1], `${key} is missing a language`);
  }
});

test("every key the pages use exists, and authored HTML matches the dictionary", async () => {
  const { strings } = await loadI18n();
  for (const { html, lang } of pages) {
    const source = await read(html);
    for (const [, kind, key, rest] of source.matchAll(/data-i18n(-[a-z-]+)?="([^"]+)"([^>]*>[^<]*)?/g)) {
      assert.ok(strings[key], `${html}: unknown key ${key}`);
      if (!kind) {
        // Text right after the opening tag is the authored text (blank when the tag starts with a child).
        const authored = normalize((rest || "").slice((rest || "").indexOf(">") + 1));
        if (authored) assert.equal(authored, normalize(strings[key][lang]), `${html}: ${key} drifted from the dictionary`);
      }
    }
    for (const [tag] of source.matchAll(/<[^>]+data-i18n-(placeholder|title|aria-label|alt)="[^"]+"[^>]*>/g)) {
      for (const [, attribute, key] of tag.matchAll(/data-i18n-(placeholder|title|aria-label|alt)="([^"]+)"/g)) {
        const authored = new RegExp(`\\s${attribute}="([^"]*)"`).exec(tag)?.[1];
        assert.equal(normalize(authored ?? ""), normalize(strings[key][lang]), `${html}: ${attribute} of ${key} drifted`);
      }
    }
  }
  for (const script of ["public/invoice.js", "public/memo.js", "public/voice.js", "public/i18n.js"]) {
    const source = await read(script);
    for (const [, key] of source.matchAll(/["=]((?:common|voice|inv|memo)\.[\w.]+)"/g)) assert.ok(strings[key], `${script}: unknown key ${key}`);
  }
  // Keys built from values at runtime.
  for (const status of ["PENDING", "PAID", "PARTIALLY PAID"]) assert.ok(strings[`inv.payDoc.${status}`], status);
  for (const basis of ["bag", "quintal", "manual"]) assert.ok(strings[`memo.basis.${basis}`], basis);
});

test("t() fills placeholders and never throws on unknown keys", async () => {
  const i18n = await loadI18n();
  assert.equal(i18n.t("memo.item.title", { n: 3 }), "Item 3");
  assert.equal(i18n.t("missing.key"), "missing.key");
});

test("known goods and units convert both ways without the network", async () => {
  const { grains, fromVocab } = await loadI18n();
  for (const [english, marathi] of grains) {
    assert.equal(fromVocab(english, "mr"), marathi, english);
    assert.equal(fromVocab(marathi, "en"), english, marathi);
  }
  assert.equal(fromVocab(" maize ", "mr"), "मका");
  assert.equal(fromVocab("Quintal", "mr"), "क्विंटल");
  assert.equal(fromVocab("पोती", "en"), "Bags");
  assert.equal(fromVocab("Wheat bran", "mr"), undefined, "only whole values match");
});

test("conversion only touches text in the other script and keeps its facts", async () => {
  const { needsConversion, keepsFacts } = await loadI18n();
  assert.equal(needsConversion("Ramchandra Patil", "mr"), true);
  assert.equal(needsConversion("रामचंद्र पाटील", "mr"), false);
  assert.equal(needsConversion("27", "en"), false);
  assert.equal(needsConversion("पुणे 411001", "en"), true);
  assert.equal(needsConversion("SHREE GANESH TRADERS", "mr"), true, "capital English names still convert");
  assert.equal(needsConversion("श्री गणेश ट्रेडर्स\nGSTIN 27ABCDE1234F1Z5, MIDC", "mr"), false, "Marathi may keep codes and acronyms");
  assert.equal(needsConversion("रामचंद्र Patil", "mr"), true, "mixed text with English words converts");
  assert.equal(keepsFacts("Plot 12, MIDC\nPune 411001", "प्लॉट 12, एमआयडीसी\nपुणे 411001"), true);
  assert.equal(keepsFacts("Pune 411001", "पुणे ४११००१"), true, "Devanagari digits are the same number");
  assert.equal(keepsFacts("Plot 12, MIDC", "प्लॉट, एमआयडीसी"), false, "a dropped number is rejected");
  assert.equal(keepsFacts("Truck MH12AB1234", "ट्रक एमएच12एबी1234"), false, "codes stay in Latin");
  assert.equal(keepsFacts("Ganesh Traders\nPune", "गणेश ट्रेडर्स, पुणे"), false, "line breaks stay");
  assert.equal(keepsFacts("SHREE GANESH TRADERS", "श्री गणेश ट्रेडर्स"), true, "capital names are not codes");
});

test("switching back restores the exact typed text, and edits invalidate it", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const answers = { "Ramchandra Patil": "रामचंद्र पाटील", "Ramchandra Patil, Pune": "रामचंद्र पाटील, पुणे", "Wheat bran": "गव्हाचा कोंडा" };
    return new Response(JSON.stringify({ success: true, items: body.items.map(({ id, text }) => ({ id, text: answers[text] })).filter((item) => item.text) }));
  };
  const i18n = await loadI18n({ fetch });
  const toasts = [];
  const state = { partyName: "Ramchandra Patil", destination: "", items: [{ goodsDetails: "Wheat bran" }, { goodsDetails: "Maize" }] };
  const run = () => i18n.convertDraft(() => state, ["partyName", "destination"], ["goodsDetails"], (message) => toasts.push(message));

  i18n.init("memo", "en");
  i18n.toggle(); // -> mr
  assert.equal(await run(), true);
  assert.deepEqual(state, { partyName: "रामचंद्र पाटील", destination: "", items: [{ goodsDetails: "गव्हाचा कोंडा" }, { goodsDetails: "मका" }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/translate");
  assert.deepEqual(calls[0].body, { to: "mr", items: [{ id: "partyName", text: "Ramchandra Patil" }, { id: "items.0.goodsDetails", text: "Wheat bran" }] });

  i18n.toggle(); // -> en: restored from the pairs, no request, exactly as typed ("Maize", not "Maize (Makka)")
  assert.equal(await run(), true);
  assert.deepEqual(state, { partyName: "Ramchandra Patil", destination: "", items: [{ goodsDetails: "Wheat bran" }, { goodsDetails: "Maize" }] });
  assert.equal(calls.length, 1);

  state.partyName = "Ramchandra Patil, Pune"; // edited: the old pair no longer applies
  i18n.toggle(); // -> mr
  await run();
  assert.equal(state.partyName, "रामचंद्र पाटील, पुणे");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.items.map((item) => item.id), ["partyName"]);
});

test("text keeping a GSTIN is not re-sent, and switching back still restores the English original", async () => {
  const typed = "Shree Ganesh Traders\nGSTIN 27ABCDE1234F1Z5";
  const marathi = "श्री गणेश ट्रेडर्स\nGSTIN 27ABCDE1234F1Z5";
  const { calls, fetch } = translator({ [typed]: marathi });
  const i18n = await loadI18n({ fetch });
  const state = { buyerDetails: typed, items: [] };
  const run = (only) => i18n.convertDraft(() => state, ["buyerDetails"], [], () => {}, only);
  i18n.init("invoice", "en");
  i18n.toggle(); // -> mr
  await run();
  assert.equal(state.buyerDetails, marathi);
  assert.equal(await run(), false, "a second pass in Marathi (voice fill, reconnect) changes nothing");
  assert.equal(calls.length, 1);
  i18n.toggle(); // -> en
  await run();
  assert.equal(state.buyerDetails, typed);
  assert.equal(calls.length, 1);
});

test("an answer identical to the text is not a change and leaves no pair or toast behind", async () => {
  const { calls, fetch } = translator({}); // echoes every value back unchanged
  const i18n = await loadI18n({ fetch });
  const toasts = [];
  const state = { specialNote: "Handle with care", items: [] };
  i18n.init("memo", "mr");
  assert.equal(await i18n.convertDraft(() => state, ["specialNote"], [], (message, sticky) => toasts.push([message, sticky])), false);
  assert.equal(state.specialNote, "Handle with care");
  assert.equal(calls.length, 1);
  assert.deepEqual(toasts.map(([message, sticky]) => [message === null ? null : "text", Boolean(sticky)]), [["text", true], [null, false]], "sticky note shown, then cleared");
});

test("only listed fields convert, and failed ones are remembered for a retry", async () => {
  const storage = new Map();
  const offline = await loadI18n({ storage, online: false });
  const state = { partyName: "Shree Ganesh Traders", specialNote: "Handle with care", items: [{ goodsDetails: "Wheat" }] };
  offline.init("memo", "mr");
  const toasts = [];
  await offline.convertDraft(() => state, ["partyName", "specialNote"], ["goodsDetails"], (message) => toasts.push(message), new Set(["partyName", "items.0.goodsDetails"]));
  assert.equal(state.items[0].goodsDetails, "गहू", "known goods convert offline");
  assert.equal(state.partyName, "Shree Ganesh Traders", "names wait for the network");
  assert.equal(state.specialNote, "Handle with care", "fields outside `only` are never touched");
  assert.deepEqual([...offline.missedIds()], ["partyName"]);
  assert.match(toasts.at(-1), /इंटरनेट नाही/);

  // Reopened online (same device storage): only the missed field is retried.
  const { calls, fetch } = translator({ "Shree Ganesh Traders": "श्री गणेश ट्रेडर्स" });
  const online = await loadI18n({ storage, fetch });
  online.init("memo", "mr");
  assert.deepEqual([...online.missedIds()], ["partyName"]);
  await online.convertDraft(() => state, ["partyName", "specialNote"], ["goodsDetails"], () => {}, online.missedIds());
  assert.equal(state.partyName, "श्री गणेश ट्रेडर्स");
  assert.equal(state.specialNote, "Handle with care");
  assert.deepEqual(calls.map((call) => call.items.map((item) => item.id)), [["partyName"]]);
  assert.equal(online.missedIds().size, 0);
});

test("restore survives a reload, and New forgets it", async () => {
  const storage = new Map();
  const { calls, fetch } = translator({ "Ramchandra Patil": "रामचंद्र पाटील" });
  const first = await loadI18n({ storage, fetch });
  const state = { partyName: "Ramchandra Patil", items: [] };
  first.init("memo", "en");
  first.toggle(); // -> mr, saved
  await first.convertDraft(() => state, ["partyName"], [], () => {});
  assert.equal(state.partyName, "रामचंद्र पाटील");

  const reloaded = await loadI18n({ storage, fetch });
  reloaded.init("memo", "en");
  assert.equal(reloaded.getLang(), "mr");
  reloaded.toggle(); // -> en
  await reloaded.convertDraft(() => state, ["partyName"], [], () => {});
  assert.equal(state.partyName, "Ramchandra Patil", "exact original back without a request");
  assert.equal(calls.length, 1);

  reloaded.reset();
  assert.equal(storage.has("stk-memo-pairs-v1"), false);
});

test("a superseded or failed conversion never overwrites the draft", async () => {
  let release;
  const fetch = () => new Promise((resolve) => { release = () => resolve(new Response(JSON.stringify({ success: true, items: [{ id: "partyName", text: "रामचंद्र पाटील" }] }))); });
  const i18n = await loadI18n({ fetch });
  const state = { partyName: "Ramchandra Patil", items: [] };
  i18n.init("memo", "mr");
  const pending = i18n.convertDraft(() => state, ["partyName"], [], () => {});
  i18n.reset(); // "New" pressed while the request was out
  release();
  assert.equal(await pending, false);
  assert.equal(state.partyName, "Ramchandra Patil");

  const failing = await loadI18n({ fetch: async () => new Response("{}", { status: 502 }) });
  const toasts = [];
  failing.init("memo", "mr");
  assert.equal(await failing.convertDraft(() => state, ["partyName"], [], (message) => toasts.push(message)), false);
  assert.equal(state.partyName, "Ramchandra Patil");
  assert.match(toasts.at(-1), /बदलता आली नाही/);
});
