import { normalizeInvoice, normalizeMemo } from "../src/services/calculations.js";

export const invoices = [
  normalizeInvoice({
    invoiceNumber: "STK/24-25/101",
    invoiceDate: "2026-10-10",
    buyerDetails: "Shree Ganesh Traders\nMarket Yard, Pune",
    poNumber: "PO-778",
    poDate: "09102026",
    truckNumber: "MH45 AB 1234",
    igstRate: "5",
    freight: "2,000",
    items: [
      { particulars: "Maize (Makka)", hsn: "1005", bags: "120", uom: "Quintal", quantity: "60.35", rate: "2150.75" },
      { particulars: "Wheat", hsn: "1001", bags: "80", uom: "Quintal", quantity: "40.1", rate: "2475.5" },
      { particulars: "Jowar (Sorghum)", hsn: "1007", bags: "33", uom: "Quintal", quantity: "16.67", rate: "3099.99" },
      { particulars: "Soybean", hsn: "1201", bags: "15", uom: "Quintal", quantity: "7.5", rate: "4600" },
      { particulars: "Tur / Arhar (Pigeon Pea)", hsn: "0713", bags: "9", uom: "Quintal", quantity: "4.33", rate: "7123.45" },
      { particulars: "Bajra (Pearl Millet)", hsn: "1008", bags: "1", uom: "Kg", quantity: "0.07", rate: "0.13" },
    ],
  }),
  normalizeInvoice({
    invoiceNumber: "102",
    sgstRate: "2.5",
    cgstRate: "2.5",
    freight: "1234.56",
    paymentStatus: "PAID",
    items: [
      { particulars: "Rice", quantity: "1,234.5", rate: "33.33" },
      { particulars: "Ragi (Finger Millet)", quantity: "99999", rate: "999.99" },
      { particulars: "Barley", quantity: "-5", rate: "100" },
      { particulars: "Groundnut", quantity: "abc", rate: "10" },
      { particulars: "Moong (Green Gram)", quantity: "12.345", rate: "0.015" },
      { particulars: "Urad (Black Gram)", quantity: "100000", rate: "100000" },
    ],
  }),
  normalizeInvoice({ invoiceNumber: "0", items: [] }),
];

export const memos = [
  normalizeMemo({
    memoNumber: "45",
    memoDate: "10.10.2026",
    partyName: "रामचंद्र पाटील",
    destination: "पुणे",
    vehicleNumber: "MH45 AB 1234",
    driverName: "सुनील",
    specialNote: "माल ओला होऊ देऊ नये",
    items: [
      { goodsDetails: "मका", weightKg: "6035", bags: "120", freightRate: "25.5", rateBasis: "bag", advancePaid: "1000" },
      { goodsDetails: "गहू", weightKg: "4010.5", bags: "80", freightRate: "61.25", rateBasis: "quintal", advancePaid: "500.50" },
      { goodsDetails: "ज्वारी", weightKg: "1667", bags: "33", rateBasis: "manual", manualTotal: "1,850.75", advancePaid: "2000" },
      { goodsDetails: "सोयाबीन", weightKg: "750", bags: "15", freightRate: "33.33", rateBasis: "bag", advancePaid: "" },
      { goodsDetails: "तूर", weightKg: "433.33", bags: "9", freightRate: "77.77", rateBasis: "quintal", advancePaid: "0.01" },
    ],
  }),
  normalizeMemo({ memoNumber: "46", items: [{ rateBasis: "manual" }] }),
  normalizeMemo({}),
];
