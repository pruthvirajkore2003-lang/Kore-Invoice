# STK Invoice Maker

Mobile-friendly invoice and freight memo (माल पावती) maker for Suresh Tukaram Kore.

## Included

- Fixed seller identity, bank details, corn logo, and signature
- Buyer, invoice, PO, vehicle, payment, item, tax, and freight fields
- Six line items with automatic `quantity x rate` values
- Automatic GST totals, grand total, and Indian amount in words
- Marathi freight memo maker (`/memo.html`) with up to five goods items, per-bag / per-quintal / manual rates, and advance-balance totals
- English ⇄ मराठी switch on both pages (see below)
- Device-local draft saving
- One-page A4 print layout that creates a non-fillable browser PDF

## Phone use

Open `STK_Invoice_Maker_Offline.html` or `STK_Memo_Maker_Offline.html` in Chrome, fill details, tap **Create PDF** / **PDF तयार करा**, then choose **Save as PDF**. Both files cross-link to each other. Keep original HTML files as reusable masters.

## Language switch

The top-bar button (**मराठी** / **English**) switches the whole page: form, preview, printed PDF, share image, WhatsApp text and voice messages. Each page remembers its own choice; the invoice opens in English and the memo in Marathi until changed. Strings live in `public/i18n.js` as `[english, marathi]` pairs.

Typed details follow the switch. Known goods and units (मका ⇄ Maize, क्विंटल ⇄ Quintal) convert instantly, even offline. Names, places, addresses and notes go to `api/translate.js` (same `GROQ_API_KEY` as voice fill; optional `TRANSLATE_MODEL`): names are transliterated, notes translated, and any answer that changes a number, code or line break is rejected, so the typed text stays. Switching back restores exactly what was typed. Offline, untranslated details stay as typed and convert when the connection returns. Invoice/memo numbers, dates, amounts, vehicle/PAN/GSTIN codes and the motor agent's signature never change. On a Marathi invoice the GST markers stay bilingual (कर बीजक / TAX INVOICE). Consider a Vercel Firewall rate limit on `/api/translate` and `/api/parse-voice`.

## Build

Requires Node.js 20 or newer; no packages or subscription required.

```bash
npm run build
npm run build:offline
```

## WhatsApp bot

`src/server.js` is a Meta WhatsApp Cloud API webhook. Send a voice note, a typed message, or a Flow form; the bot replies with the summary and two buttons, then sends the A4 PDF in the chat. The PDF is rendered from `public/invoice.html` / `public/memo.html` in headless Chrome, so it is identical to the web app's print.

Shorthand (first line `invoice` or `memo`/`पावती`, then `key: value`):

```
invoice
no: 101
date: 10/10/2026
buyer: ABC Traders, Pune
item: Maize (Makka), 1005, 120, Quintal, 60, 2150
igst: 5
freight: 2000
```

Invoice item = `name, HSN, bags, UOM, qty, rate`. Memo item = `goods, kg, bags, rate, bag|quintal|manual, advance, manual total`. Other text and voice go through the LLM in `src/services/ai.js` (needs `AI_API_KEY`). Flow submissions (`nfm_reply`) must return `{"type":"INVOICE"|"MEMO", ...state fields}`.

Run: copy `.env.example` to `.env`, fill it, then `npm install` and `npm run dev` (local) or build the `Dockerfile` (production). Host on an always-on server (Render, Railway, Fly, VPS); serverless freezes the work done after the 200 reply.

Register with Meta:

1. developers.facebook.com > Create app > Business > add **WhatsApp**. Note the Phone number ID; create a System User token with `whatsapp_business_messaging` (and `whatsapp_business_management`).
2. App settings > Basic: copy the App secret into `META_APP_SECRET`.
3. WhatsApp > Configuration > Webhook: Callback URL `https://<your-host>/webhook`, Verify token = `WEBHOOK_VERIFY_TOKEN`. Click Verify and save.
4. Webhook fields: subscribe to `messages`.
5. Put the owner's number in `ALLOWED_SENDERS`; everyone else is ignored.

Tests: `npm test` (set `CHROME_PATH` to include the PDF tests).

Browser-created PDFs contain no form fields. They are flattened for normal sharing but are not cryptographically signed; use certificate signing when tamper evidence is required.
