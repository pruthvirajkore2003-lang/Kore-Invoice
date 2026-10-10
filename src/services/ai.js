// Speech-to-text and free-text extraction over any OpenAI-compatible API (Groq default, OpenAI works too).
const config = () => {
  const { AI_API_KEY, AI_BASE_URL = "https://api.groq.com/openai/v1", STT_MODEL = "whisper-large-v3", LLM_MODEL = "openai/gpt-oss-120b", STT_LANGUAGE = "mr" } = process.env;
  if (!AI_API_KEY) throw new Error("AI_API_KEY is not set; voice and free-text input are disabled");
  return { key: AI_API_KEY, base: AI_BASE_URL.replace(/\/$/, ""), sttModel: STT_MODEL, llmModel: LLM_MODEL, sttLanguage: STT_LANGUAGE };
};

export const transcribe = async (buffer, mimeType) => {
  const { key, base, sttModel, sttLanguage } = config();
  const form = new FormData();
  form.append("model", sttModel);
  // Forced language + Devanagari-style prompt: Whisper otherwise auto-detects code-mixed Marathi as English.
  if (sttLanguage) form.append("language", sttLanguage);
  form.append("prompt", "आज शंभर पोती मका, दीडशे क्विंटल हरभरा, गहू, ज्वारी, सोयाबीन. भाडे दर तीस रुपये, पाच हजार उचल, बाकी. गाडी नंबर MH12AB1234, ड्रायव्हर, मालक. GST बिल, पावती.");
  form.append("file", new Blob([buffer], { type: mimeType }), "voice.ogg");
  const response = await fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!response.ok) throw new Error(`Transcription ${response.status}`);
  return String((await response.json()).text || "").trim();
};

const SCHEMA_PROMPT = `You convert a seller's spoken or typed request into JSON for an Indian agricultural business.
Return ONLY a JSON object: {"type":"INVOICE"|"MEMO"|"UNKNOWN","state":{...}}.
All values are strings. Numbers are plain digits with optional decimal point, no commas, no currency symbols. Dates as DD/MM/YYYY. Omit unknown fields; never invent values.
INVOICE (tax invoice, bill, GST) state keys: invoiceNumber, invoiceDate, buyerDetails (name and address), pinCode, poNumber, poDate, stateCode, buyerPan, buyerGstin, truckNumber, paymentStatus (PENDING or PAID), igstRate, sgstRate, cgstRate (percent), freight (rupees), items: up to 6 of {particulars, hsn, bags, uom, quantity, rate}.
MEMO (माल पावती, freight memo, transport, bhade) state keys: memoNumber, memoDate, partyName, destination, village, fullAddress, vehicleNumber, ownerName, driverName, licenceNumber, poNumber, agentSignature, agentPhone, specialNote, items: up to 5 of {goodsDetails, weightKg, bags, freightRate, rateBasis ("bag"|"quintal"|"manual"), manualTotal, advancePaid}.
Keep names and goods in the language spoken. Input is often Devanagari Marathi: convert Marathi number words and digits (शंभर=100, दीडशे=150, ५=5) to Western digits, read transliterated English (एडव्हान्स=advance, जीएसटी=GST), and join spoken vehicle/PAN/GSTIN letters and digits into one uppercase code. Use "UNKNOWN" if the request is neither.`;

export const extractDraft = async (text) => {
  const { key, base, llmModel } = config();
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: llmModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SCHEMA_PROMPT }, { role: "user", content: text.slice(0, 4000) }],
    }),
  });
  if (!response.ok) throw new Error(`Extraction ${response.status}`);
  const content = (await response.json()).choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
};
