# STK Invoice Maker

Mobile-friendly invoice and freight memo (माल पावती) maker for Suresh Tukaram Kore.

## Included

- Fixed seller identity, bank details, corn logo, and signature
- Buyer, invoice, PO, vehicle, payment, item, tax, and freight fields
- Six line items with automatic `quantity x rate` values
- Automatic GST totals, grand total, and Indian amount in words
- Marathi freight memo maker (`/memo.html`) with up to five goods items, per-bag / per-quintal / manual rates, and advance-balance totals
- Device-local draft saving
- One-page A4 print layout that creates a non-fillable browser PDF

## Phone use

Open `STK_Invoice_Maker_Offline.html` or `STK_Memo_Maker_Offline.html` in Chrome, fill details, tap **Create PDF** / **PDF तयार करा**, then choose **Save as PDF**. Both files cross-link to each other. Keep original HTML files as reusable masters.

## Build

Requires Node.js 20 or newer; no packages or subscription required.

```bash
npm run build
npm run build:offline
```

Browser-created PDFs contain no form fields. They are flattened for normal sharing but are not cryptographically signed; use certificate signing when tamper evidence is required.
