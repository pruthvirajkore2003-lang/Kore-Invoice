// Server copy of the pure math in public/invoice.js and public/memo.js.
// The browser files are standalone IIFEs, so this is a deliberate mirror;
// test/parity.test.js runs both against the same fixtures and fails on any drift.

export const INVOICE_ITEM_COUNT = 6;
export const MEMO_MAX_ITEMS = 5;

const INVOICE_FIELDS = ["invoiceDate", "invoiceNumber", "pinCode", "poNumber", "poDate", "buyerDetails", "stateCode", "buyerPan", "buyerGstin", "truckNumber", "paymentStatus", "igstRate", "sgstRate", "cgstRate", "freight"];
const INVOICE_ITEM_FIELDS = ["particulars", "hsn", "bags", "uom", "quantity", "rate"];
const MEMO_FIELDS = ["memoDate", "memoNumber", "partyName", "destination", "village", "fullAddress", "vehicleNumber", "ownerName", "driverName", "licenceNumber", "poNumber", "agentSignature", "agentPhone", "specialNote"];
const MEMO_ITEM_FIELDS = ["goodsDetails", "weightKg", "bags", "freightRate", "rateBasis", "manualTotal", "advancePaid"];

const numberFormatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const parseNumber = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const formatMoney = (value) => numberFormatter.format(Math.round((value + Number.EPSILON) * 100) / 100);

const pad2 = (value) => String(value).padStart(2, "0");
// Accepts YYYY-MM-DD, ISO timestamps, D/M/YYYY with / . or - separators, and bare DDMMYYYY.
export const formatDate = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  let day, month, year;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) [year, month, day] = raw.slice(0, 10).split("-");
  else if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(raw)) [day, month, year] = raw.split(/[/.-]/);
  else if (digits.length === 8 && digits === raw) [day, month, year] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
  else return raw;
  if (!(Number(day) >= 1 && Number(day) <= 31 && Number(month) >= 1 && Number(month) <= 12)) return raw;
  return `${pad2(Number(day))}/${pad2(Number(month))}/${year}`;
};

const smallNumbers = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const underThousand = (number) => {
  const parts = [];
  if (number >= 100) {
    parts.push(`${smallNumbers[Math.floor(number / 100)]} Hundred`);
    number %= 100;
  }
  if (number >= 20) {
    parts.push(tens[Math.floor(number / 10)]);
    number %= 10;
  }
  if (number > 0) parts.push(smallNumbers[number]);
  return parts.join(" ");
};

export const integerToIndianWords = (number) => {
  number = Math.max(0, Math.floor(number));
  if (number === 0) return "Zero";
  const groups = [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]];
  const parts = [];
  for (const [size, label] of groups) {
    if (number >= size) {
      parts.push(`${integerToIndianWords(Math.floor(number / size))} ${label}`);
      number %= size;
    }
  }
  if (number > 0) parts.push(underThousand(number));
  return parts.join(" ").replace(/\s+/g, " ").trim();
};

export const amountInWords = (amount) => {
  const totalPaise = Math.round(Math.max(0, amount) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  const rupeeWords = `${integerToIndianWords(rupees)} Rupees`;
  return paise ? `${rupeeWords} and ${integerToIndianWords(paise)} Paise Only` : `${rupeeWords} Only`;
};

// Trust boundary: parser/LLM output is untrusted. Keep only known string fields, cap lengths.
const pickStrings = (source, fields, max) => Object.fromEntries(fields.map((name) => {
  const raw = source?.[name];
  return [name, typeof raw === "string" || typeof raw === "number" ? String(raw).slice(0, max) : ""];
}));

export const normalizeInvoice = (input) => {
  const state = pickStrings(input, INVOICE_FIELDS, 500);
  state.paymentStatus ||= "PENDING";
  state.invoiceDate = formatDate(state.invoiceDate);
  state.poDate = formatDate(state.poDate);
  const items = Array.isArray(input?.items) ? input.items : [];
  state.items = Array.from({ length: INVOICE_ITEM_COUNT }, (_, index) => pickStrings(items[index], INVOICE_ITEM_FIELDS, 120));
  return state;
};

export const normalizeMemo = (input) => {
  const state = pickStrings(input, MEMO_FIELDS, 500);
  state.memoDate = formatDate(state.memoDate);
  const items = (Array.isArray(input?.items) ? input.items : []).slice(0, MEMO_MAX_ITEMS).map((item) => {
    const clean = pickStrings(item, MEMO_ITEM_FIELDS, 80);
    clean.goodsDetails = String(item?.goodsDetails ?? "").slice(0, 500);
    clean.rateBasis = ["bag", "quintal", "manual"].includes(clean.rateBasis) ? clean.rateBasis : "bag";
    return clean;
  });
  state.items = items.length ? items : [pickStrings({ rateBasis: "bag" }, MEMO_ITEM_FIELDS, 80)];
  return state;
};

export const calculateInvoice = (state) => {
  const supplies = state.items.map((item) => {
    const quantity = parseNumber(item.quantity);
    const rate = parseNumber(item.rate);
    return quantity > 0 && rate > 0 ? quantity * rate : 0;
  });
  const subtotal = supplies.reduce((sum, value) => sum + value, 0);
  const igst = subtotal * parseNumber(state.igstRate) / 100;
  const sgst = subtotal * parseNumber(state.sgstRate) / 100;
  const cgst = subtotal * parseNumber(state.cgstRate) / 100;
  const freight = parseNumber(state.freight);
  const grandTotal = subtotal + igst + sgst + cgst + freight;
  return { supplies, subtotal, igst, sgst, cgst, freight, grandTotal };
};

export const calculateMemoItem = (item) => {
  const rate = parseNumber(item.freightRate);
  let total = 0;
  if (item.rateBasis === "quintal") total = parseNumber(item.weightKg) / 100 * rate;
  else if (item.rateBasis === "manual") total = parseNumber(item.manualTotal);
  else total = parseNumber(item.bags) * rate;
  const advance = parseNumber(item.advancePaid);
  return { total, advance, balance: Math.max(0, total - advance) };
};

export const calculateMemo = (state) => {
  const rows = state.items.map(calculateMemoItem);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const advance = rows.reduce((sum, row) => sum + row.advance, 0);
  const balance = rows.reduce((sum, row) => sum + row.balance, 0);
  return { rows, total, advance, balance };
};

const memoItemHasData = (item) => Boolean(item.goodsDetails || item.weightKg || item.bags || item.freightRate || item.manualTotal || item.advancePaid || item.rateBasis !== "bag");

// WhatsApp markdown: *bold*, plain bullets. Empty fields drop out entirely.
export const invoiceSummary = (state) => {
  const totals = calculateInvoice(state);
  const buyer = String(state.buyerDetails || "").split("\n")[0].trim();
  const itemLines = state.items
    .map((item, index) => ({ item, value: totals.supplies[index] }))
    .filter(({ item }) => String(item.particulars || "").trim())
    .map(({ item, value }) => `  - ${item.particulars}${item.quantity ? ` x ${item.quantity} ${item.uom || ""}`.trimEnd() : ""} = INR ${formatMoney(value || 0)}`);
  return [
    "*STK - Tax Invoice*",
    state.invoiceNumber ? `Invoice no: *${state.invoiceNumber}*` : "",
    state.invoiceDate ? `Date: ${formatDate(state.invoiceDate)}` : "",
    buyer ? `Buyer: ${buyer}` : "",
    state.poNumber ? `PO: ${state.poNumber}${state.poDate ? ` (${formatDate(state.poDate)})` : ""}` : "",
    state.truckNumber ? `Truck: ${state.truckNumber}` : "",
    itemLines.length ? "*Items*" : "",
    ...itemLines,
    `Grand total: *INR ${formatMoney(totals.grandTotal)}*`,
    amountInWords(totals.grandTotal),
    state.paymentStatus ? `Payment: ${state.paymentStatus}` : "",
    "",
    "Suresh Tukaram Kore, Malshiras",
  ].filter(Boolean).join("\n");
};

export const memoSummary = (state) => {
  const totals = calculateMemo(state);
  const itemLines = state.items
    .map((item, index) => ({ item, row: totals.rows[index] || { total: 0 } }))
    .filter(({ item }) => memoItemHasData(item))
    .map(({ item, row }) => {
      const detail = [item.bags ? `${item.bags} नग` : "", item.weightKg ? `${item.weightKg} किलो` : ""].filter(Boolean).join(" / ");
      return `  - ${item.goodsDetails || "माल"}${detail ? ` (${detail})` : ""} = रु. ${formatMoney(row.total)}`;
    });
  return [
    "*STK डिजिटल माल पावती*",
    state.memoNumber ? `पावती नं.: *${state.memoNumber}*` : "",
    state.memoDate ? `तारीख: ${formatDate(state.memoDate)}` : "",
    state.partyName ? `श्री: ${state.partyName}` : "",
    state.destination ? `मुक्काम: ${state.destination}` : "",
    state.vehicleNumber ? `मोटार नं.: ${state.vehicleNumber}` : "",
    state.driverName ? `ड्रायव्हर: ${state.driverName}` : "",
    itemLines.length ? "*माल तपशील*" : "",
    ...itemLines,
    `एकूण भाडे: *रु. ${formatMoney(totals.total)}*`,
    totals.advance ? `उचल दिली: रु. ${formatMoney(totals.advance)}` : "",
    `बाकी भाडे: *रु. ${formatMoney(totals.balance)}*`,
    state.specialNote ? `सूचना: ${state.specialNote}` : "",
    "",
    "सुरेश तुकाराम कोरे, माळशिरस - 7057100034",
  ].filter(Boolean).join("\n");
};
