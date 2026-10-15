import { randomUUID } from "node:crypto";
import { calculateInvoice, calculateMemo, formatMoney, invoiceSummary, memoSummary } from "./services/calculations.js";
import { fromJson, parseShorthand } from "./services/parser.js";
import { renderPdf } from "./services/pdf.js";
import * as wa from "./services/whatsapp.js";
import * as ai from "./services/ai.js";

const DRAFT_TTL_MS = 30 * 60 * 1000;
// ponytail: in-memory drafts and dedupe, single process only; move to Redis if you run more than one instance.
const drafts = new Map();
const seenMessages = new Set();

const HELP = [
  "*STK बॉट* - बिल किंवा माल पावती तयार करा",
  "व्हॉइस नोट पाठवा, किंवा असे लिहा:",
  "",
  "invoice",
  "no: 101",
  "date: 10/10/2026",
  "buyer: ABC Traders, Pune",
  "item: Maize (Makka), 1005, 120, Quintal, 60, 2150",
  "igst: 5",
  "freight: 2000",
  "",
  "memo",
  "no: 45",
  "party: रामचंद्र पाटील",
  "destination: पुणे",
  "vehicle: MH45 AB 1234",
  "item: मका, 6000, 120, 25, bag, 1000",
  "",
  "(item = invoice: name, HSN, bags, UOM, qty, rate | memo: goods, kg, bags, rate, bag/quintal/manual, advance, manual total)",
].join("\n");

const summaryFor = ({ type, state }) => (type === "INVOICE" ? invoiceSummary(state) : memoSummary(state));

const allowedSenders = () => new Set(String(process.env.ALLOWED_SENDERS || "").split(",").map((id) => id.trim()).filter(Boolean));

const pruneDrafts = () => {
  const cutoff = Date.now() - DRAFT_TTL_MS;
  for (const [id, draft] of drafts) if (draft.createdAt < cutoff) drafts.delete(id);
};

const markSeen = (id) => {
  if (seenMessages.has(id)) return false;
  seenMessages.add(id);
  if (seenMessages.size > 5000) seenMessages.delete(seenMessages.values().next().value);
  return true;
};

const draftFromText = async (text) => {
  const shorthand = parseShorthand(text);
  if (shorthand) return shorthand;
  if (!process.env.AI_API_KEY) return null;
  return fromJson(await ai.extractDraft(text));
};

const offerDraft = async (from, draft) => {
  pruneDrafts();
  const id = randomUUID();
  drafts.set(id, { ...draft, from, createdAt: Date.now() });
  await wa.sendButtons(from, summaryFor(draft), [
    { id: `gen:${id}`, title: "✅ तयार करा PDF" },
    { id: `cancel:${id}`, title: "❌ रद्द करा" },
  ]);
};

export const pdfFileName = ({ type, state }) => {
  const number = String(type === "INVOICE" ? state.invoiceNumber : state.memoNumber).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return `STK-${type === "INVOICE" ? "Invoice" : "Memo"}-${number || Date.now()}.pdf`;
};

// The page computes its own totals from the same state; refuse to send if they ever disagree with the server.
const assertParity = ({ type, state }, shown) => {
  const checks = type === "INVOICE"
    ? (({ grandTotal }) => [[shown.grandTotal, formatMoney(grandTotal)]])(calculateInvoice(state))
    : (({ total, balance }) => [[shown.memoTotal, formatMoney(total)], [shown.memoBalance, formatMoney(balance)]])(calculateMemo(state));
  for (const [onPage, expected] of checks) {
    // The invoice always prints a grand total, so an empty one means the page script never ran.
    if ((onPage || type === "INVOICE") && onPage !== expected) throw new Error(`Total mismatch: page ${onPage || "(empty)"} vs server ${expected}`);
  }
};

const generate = async (from, draft) => {
  await wa.sendText(from, "PDF तयार होत आहे… / Generating PDF…");
  const { pdf, shown } = await renderPdf(draft.type, draft.state);
  assertParity(draft, shown);
  const filename = pdfFileName(draft);
  const mediaId = await wa.uploadMedia(pdf, filename, "application/pdf");
  const totals = draft.type === "INVOICE" ? `INR ${formatMoney(calculateInvoice(draft.state).grandTotal)}` : `रु. ${formatMoney(calculateMemo(draft.state).balance)} बाकी`;
  await wa.sendDocument(from, mediaId, filename, `${filename.replace(/\.pdf$/, "")} - ${totals}`);
};

const handleButton = async (from, replyId) => {
  const [action, id] = String(replyId).split(":");
  const draft = drafts.get(id);
  if (!draft || draft.from !== from) return wa.sendText(from, "ही पावती कालबाह्य झाली. पुन्हा पाठवा. / Draft expired, please send again.");
  drafts.delete(id); // one PDF per confirmation, even if the button is tapped twice
  if (action === "cancel") return wa.sendText(from, "रद्द केले. / Cancelled.");
  if (action === "gen") return generate(from, draft);
};

const handleMessage = async (message) => {
  const from = message.from;
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return handleButton(from, message.interactive.button_reply.id);
  }
  let draft = null;
  if (message.type === "interactive" && message.interactive?.type === "nfm_reply") {
    // WhatsApp Flow submit: response_json keys must match the state schema plus "type".
    draft = fromJson(JSON.parse(message.interactive.nfm_reply.response_json || "{}"));
  } else if (message.type === "text") {
    draft = await draftFromText(message.text.body);
  } else if (message.type === "audio") {
    if (!process.env.AI_API_KEY) return wa.sendText(from, "Voice input is not configured. Please type the details.\n\n" + HELP);
    const { buffer, mimeType } = await wa.downloadMedia(message.audio.id);
    const transcript = await ai.transcribe(buffer, mimeType);
    if (!transcript) return wa.sendText(from, "आवाज समजला नाही. पुन्हा पाठवा. / Could not understand the voice note.");
    draft = await draftFromText(transcript);
  }
  if (!draft) return wa.sendText(from, HELP);
  return offerDraft(from, draft);
};

// Entry point for a verified webhook payload. Never throws; failures are logged and reported to the sender.
export const handleWebhook = async (payload) => {
  const allowed = allowedSenders();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message?.id || !markSeen(message.id)) continue;
        if (!allowed.has(message.from)) {
          console.warn(`Ignoring message from unlisted sender ${message.from}`);
          continue;
        }
        try {
          await handleMessage(message);
        } catch (error) {
          console.error("Message handling failed:", error);
          await wa.sendText(message.from, "त्रुटी आली, पुन्हा प्रयत्न करा. / Something went wrong, please try again.").catch(() => {});
        }
      }
    }
  }
};
