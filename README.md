# STK Invoice Maker

Mobile-friendly invoice maker for Suresh Tukaram Kore.

## Included

- Fixed seller identity, bank details, corn logo, and signature
- Buyer, invoice, PO, vehicle, payment, item, tax, and freight fields
- Six line items with automatic `quantity x rate` values
- Automatic GST totals, grand total, and Indian amount in words
- Device-local draft saving
- One-page A4 print layout that creates a non-fillable browser PDF

## Phone use

Open `STK_Invoice_Maker_Offline.html` in Chrome, fill details, tap **Create PDF**, then choose **Save as PDF**. Keep original HTML file as reusable master.

## Build

Requires Node.js 20 or newer; no packages or subscription required.

```bash
npm run build
npm run build:offline
```

Browser-created PDFs contain no form fields. They are flattened for normal sharing but are not cryptographically signed; use certificate signing when tamper evidence is required.
