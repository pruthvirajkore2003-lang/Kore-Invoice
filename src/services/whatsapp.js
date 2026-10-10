// Meta WhatsApp Business Cloud API (Graph API). Token and IDs come from env only.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // WhatsApp audio limit

const config = () => {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, GRAPH_API_VERSION = "v23.0" } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required");
  return { token: WHATSAPP_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID, base: `https://graph.facebook.com/${GRAPH_API_VERSION}` };
};

const graph = async (path, init = {}) => {
  const { token, base } = config();
  const response = await fetch(`${base}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Graph ${path} ${response.status}: ${body?.error?.message || "request failed"}`);
  return body;
};

const sendMessage = (payload) => graph(`${config().phoneId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const buildTextMessage = (to, body) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "text",
  text: { preview_url: false, body: clip(body, 4096) },
});

// Interactive reply buttons: body <= 1024 chars, button title <= 20 chars, id <= 256 chars.
export const buildButtonsMessage = (to, body, buttons) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: clip(body, 1024) },
    action: { buttons: buttons.map(({ id, title }) => ({ type: "reply", reply: { id: id.slice(0, 256), title: clip(title, 20) } })) },
  },
});

// Document caption <= 1024 chars.
export const buildDocumentMessage = (to, mediaId, filename, caption) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "document",
  document: { id: mediaId, filename, caption: clip(caption, 1024) },
});

export const sendText = (to, body) => sendMessage(buildTextMessage(to, body));
export const sendButtons = (to, body, buttons) => sendMessage(buildButtonsMessage(to, body, buttons));
export const sendDocument = (to, mediaId, filename, caption) => sendMessage(buildDocumentMessage(to, mediaId, filename, caption));

export const uploadMedia = async (buffer, filename, mimeType) => {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const { id } = await graph(`${config().phoneId}/media`, { method: "POST", body: form });
  return id;
};

// Two steps: resolve the short-lived media URL, then fetch it with the same bearer token.
export const downloadMedia = async (mediaId) => {
  const meta = await graph(encodeURIComponent(mediaId));
  if (meta.file_size > MAX_MEDIA_BYTES) throw new Error("Media too large");
  const url = new URL(meta.url);
  if (url.protocol !== "https:") throw new Error("Unexpected media URL");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${config().token}` } });
  if (!response.ok) throw new Error(`Media download ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error("Media too large");
  return { buffer, mimeType: meta.mime_type || "audio/ogg" };
};
