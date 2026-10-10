// Vercel Function: voice note -> Groq Whisper transcript -> Groq Llama JSON for the invoice/memo forms.
// Set GROQ_API_KEY in Vercel > Project > Settings > Environment Variables. Never ship it to the browser.

const GROQ = "https://api.groq.com/openai/v1";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB; 60 s of opus/aac is well under 1 MB.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const WHISPER_PROMPT =
  "Marathi, Hindi and Indian English bill dictation. मका, हरभरा, गहू, ज्वारी, बाजरी, सोयाबीन, तूर, पोती, क्विंटल, किलो, भाडे, उचल, बाकी, पावती, मोटार, ड्रायव्हर. Maize makka, chana, wheat, jowar, bajra, quintal, bags, freight, advance, GST, invoice, PO.";

const COMMON = `You fill a form for an Indian agricultural trader from a spoken note (Marathi, Hindi, English or mixed).
Return ONLY a JSON object with the keys listed below. Omit any key that was not spoken; never invent values.
All values are strings. Numbers use plain Western digits (convert Marathi/Hindi digits and number words), optional decimal point, no commas, no units, no currency symbols.
Dates are DD/MM/YYYY. Resolve relative dates (आज/aaj/today, काल/kal/yesterday) against today's date given below.
Keep personal names, places and addresses in the language/script they were spoken.`;

const PROMPTS = {
  invoice: `${COMMON}
Document: GST tax invoice. Keys: invoiceDate, invoiceNumber, pinCode, poNumber, poDate, buyerDetails (buyer name and address), stateCode, buyerPan, buyerGstin, truckNumber, paymentStatus ("PENDING" | "PAID" | "PARTIALLY PAID"), igstRate, sgstRate, cgstRate (percent), freight (rupees), items.
items: array (max 6) of {particulars, hsn, bags, uom, quantity, rate}. rate is rupees per uom. uom is e.g. "Quintal", "Kg", "Bags".
For particulars prefer these exact names when the goods match: "Maize (Makka)", "Chickpeas (Chana)", "Wheat", "Rice", "Jowar (Sorghum)", "Bajra (Pearl Millet)", "Barley", "Ragi (Finger Millet)", "Soybean", "Tur / Arhar (Pigeon Pea)", "Moong (Green Gram)", "Urad (Black Gram)", "Groundnut", "Sunflower Seeds". मका=Maize, हरभरा/चना=Chickpeas, गहू/गेहूं=Wheat, ज्वारी=Jowar, बाजरी=Bajra.
Vehicle and PAN/GSTIN values in uppercase without spaces.`,
  memo: `${COMMON}
Document: Marathi freight memo (माल पावती). Keys: memoDate, memoNumber, partyName, destination, village, fullAddress, vehicleNumber, ownerName, driverName, licenceNumber, poNumber, specialNote, items.
items: array (max 5) of {goodsDetails, weightKg, bags, freightRate, rateBasis, manualTotal, advancePaid}.
goodsDetails in Marathi (e.g. मका, हरभरा, गहू). weightKg in kilograms (1 क्विंटल = 100 kg, 1 टन = 1000 kg). bags = पोती count. freightRate = भाडे दर. advancePaid = उचल.
rateBasis: "bag" when the rate is per पोते/bag, "quintal" when per क्विंटल, "manual" when only a lump-sum total freight is spoken (put it in manualTotal).
vehicleNumber uppercase without spaces (e.g. MH45AB1234). मुक्काम = destination, गाव = village, मालक = ownerName.`,
};

const groq = async (path, key, init) => {
  const response = await fetch(`${GROQ}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers } });
  if (!response.ok) throw new Error(`Groq ${path} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
};

// CORS stays open so the file:// offline bundles (Origin: null) can call it too.
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });

export async function POST(request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ success: false, error: "Voice service not configured" }, 500);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ success: false, error: "Expected multipart/form-data" }, 400);
  }

  const audio = form.get("audio");
  const docType = form.get("docType");
  if (!(audio instanceof File) || audio.size === 0) return json({ success: false, error: "Missing audio" }, 400);
  if (audio.size > MAX_AUDIO_BYTES) return json({ success: false, error: "Audio too large" }, 413);
  if (!/^(audio|video)\//.test(audio.type || "audio/webm")) return json({ success: false, error: "Unsupported audio type" }, 415);
  if (docType !== "invoice" && docType !== "memo") return json({ success: false, error: "docType must be invoice or memo" }, 400);

  const rawDate = String(form.get("currentDate") || "");
  const currentDate = /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate) ? rawDate : "unknown";

  try {
    const upload = new FormData();
    upload.append("model", "whisper-large-v3");
    upload.append("prompt", WHISPER_PROMPT);
    upload.append("temperature", "0");
    upload.append("response_format", "json");
    upload.append("file", audio, audio.name || "voice.webm");
    const transcript = String((await groq("/audio/transcriptions", key, { method: "POST", body: upload })).text || "").trim();
    if (!transcript) return json({ success: true, transcript: "", data: {} });

    const completion = await groq("/chat/completions", key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        reasoning_effort: "low",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${PROMPTS[docType]}\nToday's date: ${currentDate}.` },
          { role: "user", content: transcript.slice(0, 4000) },
        ],
      }),
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return json({ success: true, transcript, data });
  } catch (error) {
    console.error(error);
    return json({ success: false, error: "Voice processing failed" }, 502);
  }
}
