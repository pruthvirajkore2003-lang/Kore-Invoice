import { normalizeInvoice, normalizeMemo } from "./calculations.js";

// Text shorthand: first line names the document, then "key: value" lines. See README "WhatsApp bot".
const INVOICE_KEYS = {
  no: "invoiceNumber", number: "invoiceNumber", date: "invoiceDate", buyer: "buyerDetails", pin: "pinCode",
  po: "poNumber", podate: "poDate", state: "stateCode", pan: "buyerPan", gstin: "buyerGstin", gst: "buyerGstin",
  truck: "truckNumber", payment: "paymentStatus", igst: "igstRate", sgst: "sgstRate", cgst: "cgstRate", freight: "freight",
};
const MEMO_KEYS = {
  no: "memoNumber", number: "memoNumber", "नं": "memoNumber", date: "memoDate", "तारीख": "memoDate",
  party: "partyName", "श्री": "partyName", destination: "destination", "मुक्काम": "destination", village: "village", "गाव": "village",
  address: "fullAddress", "पत्ता": "fullAddress", vehicle: "vehicleNumber", truck: "vehicleNumber", "मोटार": "vehicleNumber",
  owner: "ownerName", "मालक": "ownerName", driver: "driverName", "ड्रायव्हर": "driverName", licence: "licenceNumber", license: "licenceNumber",
  po: "poNumber", agent: "agentSignature", phone: "agentPhone", note: "specialNote", "सूचना": "specialNote",
};
const INVOICE_ITEM = ["particulars", "hsn", "bags", "uom", "quantity", "rate"];
const MEMO_ITEM = ["goodsDetails", "weightKg", "bags", "freightRate", "rateBasis", "advancePaid", "manualTotal"];
const ITEM_KEYS = new Set(["item", "माल"]);

export const detectType = (line) => {
  const head = String(line || "").trim().toLowerCase();
  if (/^(invoice|bill|बिल|इनव्हॉइस)/u.test(head)) return "INVOICE";
  if (/^(memo|पावती|माल पावती)/u.test(head)) return "MEMO";
  return null;
};

// Returns { type, state } or null when the text is not shorthand (caller may then try the LLM).
export const parseShorthand = (text) => {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const type = detectType(lines[0]);
  if (!type) return null;
  const keys = type === "INVOICE" ? INVOICE_KEYS : MEMO_KEYS;
  const itemFields = type === "INVOICE" ? INVOICE_ITEM : MEMO_ITEM;
  const raw = { items: [] };
  for (const line of lines.slice(1)) {
    const match = /^([^:：]+)[:：]\s*(.*)$/u.exec(line);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/[\s.]/g, "");
    const value = match[2].trim();
    if (ITEM_KEYS.has(key)) {
      const parts = value.split(",").map((part) => part.trim());
      raw.items.push(Object.fromEntries(itemFields.map((field, index) => [field, parts[index] ?? ""])));
    } else if (keys[key]) {
      const field = keys[key];
      // Repeated buyer/address lines build a multi-line block, as in the web form.
      raw[field] = raw[field] && (field === "buyerDetails" || field === "fullAddress") ? `${raw[field]}\n${value}` : value;
    }
  }
  if (type === "MEMO") raw.items.forEach((item) => { item.rateBasis = normalizeBasis(item.rateBasis); });
  return { type, state: type === "INVOICE" ? normalizeInvoice(raw) : normalizeMemo(raw) };
};

const normalizeBasis = (value) => {
  const basis = String(value || "").toLowerCase();
  if (/^(q|quintal|क्विंटल)/u.test(basis)) return "quintal";
  if (/^(m|manual|एकूण)/u.test(basis)) return "manual";
  return "bag";
};

// Untrusted JSON (LLM output, WhatsApp Flow response) to a validated draft.
export const fromJson = (json) => {
  const type = String(json?.type || "").toUpperCase();
  if (type === "INVOICE") return { type, state: normalizeInvoice(json.state ?? json) };
  if (type === "MEMO") {
    const source = json.state ?? json;
    const items = Array.isArray(source.items) ? source.items.map((item) => ({ ...item, rateBasis: normalizeBasis(item?.rateBasis) })) : [];
    return { type, state: normalizeMemo({ ...source, items }) };
  }
  return null;
};
