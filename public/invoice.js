(() => {
  "use strict";

  const { t } = window.STKI18n;
  const STORAGE_KEY = "stk-invoice-draft-v1";
  const ITEM_COUNT = 6;
  const itemFields = ["particulars", "hsn", "bags", "uom", "quantity", "rate"];
  // [english, marathi, HSN]. Option values stay English; particulars stores the name in the current language.
  const GRAINS = window.STKI18n.grains;
  const OTHER_GRAIN = "Other (type manually)";
  const findGrain = (value) => GRAINS.find(([english, marathi]) => value === english || value === marathi);
  const grainName = (grain) => grain[window.STKI18n.getLang() === "mr" ? 1 : 0];

  const syncGrainPicker = (select, value) => {
    const custom = select.parentElement.querySelector('[data-grain-picker="custom"]');
    const grain = findGrain(value);
    // Already showing it (including "Other" picked with the name not typed yet): leave the picker alone.
    if (grain ? select.value === grain[0] : select.value === OTHER_GRAIN && custom.value === (value || "")) return;
    select.value = grain ? grain[0] : value ? OTHER_GRAIN : "";
    custom.value = grain ? "" : value || "";
    custom.hidden = select.value !== OTHER_GRAIN;
  };
  const blankItem = () => ({ particulars: "", hsn: "", bags: "", uom: "", quantity: "", rate: "" });
  const blankState = () => ({
    invoiceDate: "",
    invoiceNumber: "",
    pinCode: "",
    poNumber: "",
    poDate: "",
    buyerDetails: "",
    stateCode: "",
    buyerPan: "",
    buyerGstin: "",
    truckNumber: "",
    paymentStatus: "PENDING",
    igstRate: "",
    sgstRate: "",
    cgstRate: "",
    freight: "",
    items: Array.from({ length: ITEM_COUNT }, blankItem),
  });

  const numberFormatter = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const parseNumber = (value) => {
    const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const formatMoney = (value) => numberFormatter.format(Math.round((value + Number.EPSILON) * 100) / 100);

  const pad2 = (value) => String(value).padStart(2, "0");
  // Accepts YYYY-MM-DD, ISO timestamps, D/M/YYYY with / . or - separators, and bare DDMMYYYY.
  const formatDate = (value) => {
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
  const dmyToYmd = (value) => {
    const match = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(\d{4})$/.exec(formatDate(value));
    return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
  };
  // Types DD/MM/YYYY as the user goes; skipped while deleting so backspace can cross a slash.
  const maskDateField = (field, inputType) => {
    if (String(inputType || "").startsWith("delete")) return;
    if (field.selectionStart !== null && field.selectionStart !== field.value.length) return;
    const digits = field.value.replace(/\D/g, "").slice(0, 8);
    let masked = digits.slice(0, 2);
    if (digits.length >= 2) masked += `/${digits.slice(2, 4)}`;
    if (digits.length >= 4) masked += `/${digits.slice(4)}`;
    field.value = masked;
  };

  const loadState = () => {
    const fallback = blankState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return fallback;
      const merged = { ...fallback, ...saved };
      merged.items = Array.from({ length: ITEM_COUNT }, (_, index) => ({
        ...blankItem(),
        ...(saved.items && typeof saved.items[index] === "object" ? saved.items[index] : {}),
      }));
      merged.invoiceDate = formatDate(merged.invoiceDate);
      merged.poDate = formatDate(merged.poDate);
      return merged;
    } catch {
      return fallback;
    }
  };

  let state = loadState();
  let saveTimer;

  const saveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Device storage may be blocked. */ }
    }, 120);
  };

  const text = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value ?? "";
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

  const integerToIndianWords = (number) => {
    number = Math.max(0, Math.floor(number));
    if (number === 0) return "Zero";
    const groups = [
      [10000000, "Crore"],
      [100000, "Lakh"],
      [1000, "Thousand"],
    ];
    const parts = [];
    for (const [size, label] of groups) {
      if (number >= size) {
        const count = Math.floor(number / size);
        parts.push(`${integerToIndianWords(count)} ${label}`);
        number %= size;
      }
    }
    if (number > 0) parts.push(underThousand(number));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  // Marathi has its own word for every number below 100; tens and units never combine.
  const marathiNumbers = [
    "", "एक", "दोन", "तीन", "चार", "पाच", "सहा", "सात", "आठ", "नऊ",
    "दहा", "अकरा", "बारा", "तेरा", "चौदा", "पंधरा", "सोळा", "सतरा", "अठरा", "एकोणीस",
    "वीस", "एकवीस", "बावीस", "तेवीस", "चोवीस", "पंचवीस", "सव्वीस", "सत्तावीस", "अठ्ठावीस", "एकोणतीस",
    "तीस", "एकतीस", "बत्तीस", "तेहेतीस", "चौतीस", "पस्तीस", "छत्तीस", "सदतीस", "अडतीस", "एकोणचाळीस",
    "चाळीस", "एक्केचाळीस", "बेचाळीस", "त्रेचाळीस", "चव्वेचाळीस", "पंचेचाळीस", "सेहेचाळीस", "सत्तेचाळीस", "अठ्ठेचाळीस", "एकोणपन्नास",
    "पन्नास", "एक्कावन्न", "बावन्न", "त्रेपन्न", "चोपन्न", "पंचावन्न", "छप्पन्न", "सत्तावन्न", "अठ्ठावन्न", "एकोणसाठ",
    "साठ", "एकसष्ट", "बासष्ट", "त्रेसष्ट", "चौसष्ट", "पासष्ट", "सहासष्ट", "सदुसष्ट", "अडुसष्ट", "एकोणसत्तर",
    "सत्तर", "एक्काहत्तर", "बाहत्तर", "त्र्याहत्तर", "चौऱ्याहत्तर", "पंच्याहत्तर", "शहात्तर", "सत्त्याहत्तर", "अठ्ठ्याहत्तर", "एकोणऐंशी",
    "ऐंशी", "एक्क्याऐंशी", "ब्याऐंशी", "त्र्याऐंशी", "चौऱ्याऐंशी", "पंच्याऐंशी", "शहाऐंशी", "सत्त्याऐंशी", "अठ्ठ्याऐंशी", "एकोणनव्वद",
    "नव्वद", "एक्क्याण्णव", "ब्याण्णव", "त्र्याण्णव", "चौऱ्याण्णव", "पंच्याण्णव", "शहाण्णव", "सत्त्याण्णव", "अठ्ठ्याण्णव", "नव्याण्णव",
  ];

  // Hundreds join the number: दोनशे, नऊशे; exactly 100 is शंभर, 101-199 start with एकशे.
  const marathiUnderThousand = (number) => {
    const hundreds = Math.floor(number / 100);
    const rest = number % 100;
    const head = !hundreds ? "" : hundreds === 1 ? (rest ? "एकशे" : "शंभर") : `${marathiNumbers[hundreds]}शे`;
    return [head, marathiNumbers[rest]].filter(Boolean).join(" ");
  };

  const integerToMarathiWords = (number) => {
    number = Math.max(0, Math.floor(number));
    if (number === 0) return "शून्य";
    const parts = [];
    for (const [size, label] of [[10000000, "कोटी"], [100000, "लाख"], [1000, "हजार"]]) {
      if (number >= size) {
        parts.push(`${integerToMarathiWords(Math.floor(number / size))} ${label}`);
        number %= size;
      }
    }
    if (number > 0) parts.push(marathiUnderThousand(number));
    return parts.join(" ");
  };

  const amountInWords = (amount, lang = "en") => {
    const totalPaise = Math.round(Math.max(0, amount) * 100);
    const rupees = Math.floor(totalPaise / 100);
    const paise = totalPaise % 100;
    if (lang === "mr") {
      const rupeeWords = `${integerToMarathiWords(rupees)} ${rupees === 1 ? "रुपया" : "रुपये"}`;
      return paise ? `${rupeeWords} आणि ${integerToMarathiWords(paise)} ${paise === 1 ? "पैसा" : "पैसे"} फक्त` : `${rupeeWords} फक्त`;
    }
    const rupeeWords = `${integerToIndianWords(rupees)} Rupees`;
    return paise ? `${rupeeWords} and ${integerToIndianWords(paise)} Paise Only` : `${rupeeWords} Only`;
  };

  const createGrainPicker = (index) => {
    // Option text carries data-i18n so a language switch relabels it in place.
    const translatedOption = (key, value) => {
      const option = new Option(t(key), value);
      option.dataset.i18n = key;
      return option;
    };
    const fragment = document.createDocumentFragment();
    const select = document.createElement("select");
    select.dataset.itemIndex = String(index);
    select.dataset.itemField = "particulars";
    select.dataset.grainPicker = "select";
    select.append(translatedOption("inv.grain.select", ""));
    GRAINS.forEach(([english], grainIndex) => select.append(translatedOption(`grain.${grainIndex}`, english)));
    select.append(translatedOption("inv.grain.other", OTHER_GRAIN));
    const custom = document.createElement("input");
    custom.type = "text";
    custom.placeholder = t("inv.grain.custom");
    custom.dataset.i18nPlaceholder = "inv.grain.custom";
    custom.dataset.itemIndex = String(index);
    custom.dataset.itemField = "particulars";
    custom.dataset.grainPicker = "custom";
    fragment.append(select, custom);
    const value = state.items[index].particulars;
    const grain = findGrain(value);
    select.value = grain ? grain[0] : value ? OTHER_GRAIN : "";
    custom.value = grain ? "" : value || "";
    custom.hidden = select.value !== OTHER_GRAIN;
    return fragment;
  };

  const createItemEditors = () => {
    const host = document.getElementById("itemEditors");
    host.replaceChildren();
    state.items.forEach((item, index) => {
      const details = document.createElement("details");
      details.className = "item-editor";
      if (index === 0) details.open = true;

      const summary = document.createElement("summary");
      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = item.particulars || t("inv.item.n", { n: index + 1 });
      const amount = document.createElement("strong");
      amount.className = "item-amount";
      summary.append(name, amount);

      const fields = document.createElement("div");
      fields.className = "item-fields";
      const definitions = [
        ["particulars", "inv.item.particulars", "text", "wide-field"],
        ["hsn", "inv.item.hsn", "text", ""],
        ["bags", "inv.item.bags", "number", ""],
        ["uom", "inv.item.uom", "text", ""],
        ["quantity", "inv.item.quantity", "number", ""],
        ["rate", "inv.item.rate", "number", ""],
      ];

      definitions.forEach(([field, labelKey, type, className]) => {
        const label = document.createElement("label");
        if (className) label.className = className;
        label.dataset.i18n = labelKey;
        label.append(document.createTextNode(t(labelKey)));
        if (field === "particulars") {
          label.append(createGrainPicker(index));
        } else {
          const input = document.createElement("input");
          input.type = type;
          input.value = item[field] ?? "";
          input.dataset.itemIndex = String(index);
          input.dataset.itemField = field;
          if (type === "number") {
            input.min = "0";
            input.step = field === "bags" ? "1" : "0.01";
            input.inputMode = field === "bags" ? "numeric" : "decimal";
          }
          label.append(input);
        }
        fields.append(label);
      });

      details.append(summary, fields);
      host.append(details);
    });
  };

  const createPreviewRows = () => {
    const tbody = document.getElementById("previewItems");
    tbody.replaceChildren();
    for (let index = 0; index < ITEM_COUNT; index += 1) {
      const row = document.createElement("tr");
      const columns = ["serial", "particulars", "hsn", "bags", "uom", "quantity", "rate", "value"];
      columns.forEach((column) => {
        const cell = document.createElement("td");
        cell.dataset.row = String(index);
        cell.dataset.column = column;
        row.append(cell);
      });
      tbody.append(row);
    }
  };

  const calculate = () => {
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

  const render = () => {
    document.querySelectorAll("[data-out]").forEach((element) => {
      const key = element.dataset.out;
      let value = state[key];
      if (key.endsWith("Date")) value = formatDate(value);
      // Stored statuses stay English (voice fill and the bot rely on them); only the printed label changes.
      else if (key === "paymentStatus" && PAYMENT_STATUSES.includes(value)) value = t(`inv.payDoc.${value}`);
      element.textContent = value || "";
    });

    const totals = calculate();
    state.items.forEach((item, index) => {
      const values = {
        serial: itemFields.some((field) => String(item[field] || "").trim()) ? String(index + 1) : "",
        particulars: item.particulars,
        hsn: item.hsn,
        bags: item.bags,
        uom: item.uom,
        quantity: item.quantity,
        rate: item.rate ? formatMoney(parseNumber(item.rate)) : "",
        value: totals.supplies[index] ? formatMoney(totals.supplies[index]) : "",
      };
      Object.entries(values).forEach(([column, value]) => {
        text(`[data-row="${index}"][data-column="${column}"]`, value);
      });
      const editor = document.querySelectorAll(".item-editor")[index];
      if (editor) {
        editor.querySelector(".item-name").textContent = item.particulars || t("inv.item.n", { n: index + 1 });
        editor.querySelector(".item-amount").textContent = totals.supplies[index] ? t("inv.item.amount", { amount: formatMoney(totals.supplies[index]) }) : "";
      }
    });

    text("#igstRateOut", state.igstRate || "");
    text("#sgstRateOut", state.sgstRate || "");
    text("#cgstRateOut", state.cgstRate || "");
    text("#igstAmount", totals.igst ? formatMoney(totals.igst) : "");
    text("#sgstAmount", totals.sgst ? formatMoney(totals.sgst) : "");
    text("#cgstAmount", totals.cgst ? formatMoney(totals.cgst) : "");
    text("#freightAmount", totals.freight ? formatMoney(totals.freight) : "");
    text("#grandTotal", formatMoney(totals.grandTotal));
    text("#amountWords", amountInWords(totals.grandTotal, window.STKI18n.getLang()));
    saveState();
  };

  // Writes only values that differ: rewriting a field mid-typing ("63." reads back as "63") would eat the
  // decimal point and jump the caret when a late conversion lands.
  const applyStateToForm = () => {
    document.querySelectorAll("[data-field]").forEach((field) => {
      const value = state[field.name] ?? "";
      if (field.value !== value) field.value = value;
    });
    document.querySelectorAll("[data-item-field]").forEach((field) => {
      const value = state.items[Number(field.dataset.itemIndex)][field.dataset.itemField] ?? "";
      if (field.dataset.grainPicker === "select") {
        syncGrainPicker(field, value);
      } else if (field.dataset.grainPicker !== "custom" && field.value !== value) {
        field.value = value;
      }
    });
  };

  const setView = (view) => {
    document.activeElement?.blur();
    document.body.classList.toggle("view-preview", view === "preview");
    document.body.classList.toggle("view-editor", view !== "preview");
    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (view === "preview") {
      requestAnimationFrame(() => {
        fitPreview();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  };

  const fitPreview = () => {
    const invoice = document.getElementById("invoice");
    const stage = document.querySelector(".invoice-stage");
    if (!invoice || !stage || window.matchMedia("print").matches) return;
    const available = Math.min(794, stage.clientWidth);
    const scale = Math.max(0.35, available / 794);
    invoice.style.transform = scale < 1 ? `scale(${scale})` : "none";
    invoice.style.marginBottom = scale < 1 ? `${-invoice.offsetHeight * (1 - scale)}px` : "0";
  };

  let toastTimer;
  // sticky keeps a message up until the next one (e.g. while text converts); null just clears it.
  const showToast = (message, sticky = false) => {
    const toast = document.getElementById("toast");
    clearTimeout(toastTimer);
    if (message === null) return toast.classList.remove("show");
    toast.textContent = message;
    toast.classList.add("show");
    if (!sticky) toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  const printInvoice = () => {
    setView("preview");
    document.title = state.invoiceNumber ? `Invoice-${state.invoiceNumber}` : "STK-Invoice";
    showToast(t("common.toast.print"));
    setTimeout(() => window.print(), 280);
  };

  // WhatsApp markdown: *bold*, plain bullets. Empty fields drop out entirely.
  // Self-contained on purpose: test/parity.test.js runs this block alone, so its words live here.
  const invoiceSummary = (lang = "en") => {
    const words = lang === "mr"
      ? { title: "*STK - कर बीजक*", number: "बिल नं.", date: "तारीख", buyer: "खरेदीदार", po: "PO नं.", truck: "मोटार नं.", items: "*माल तपशील*", total: "एकूण रक्कम", currency: "रु.", payment: "पेमेंट", seller: "सुरेश तुकाराम कोरे, माळशिरस", status: { PENDING: "बाकी", PAID: "पूर्ण जमा", "PARTIALLY PAID": "अंशतः जमा" } }
      : { title: "*STK - Tax Invoice*", number: "Invoice no", date: "Date", buyer: "Buyer", po: "PO", truck: "Truck", items: "*Items*", total: "Grand total", currency: "INR", payment: "Payment", seller: "Suresh Tukaram Kore, Malshiras", status: {} };
    const totals = calculate();
    const buyer = String(state.buyerDetails || "").split("\n")[0].trim();
    const itemLines = state.items
      .map((item, index) => ({ item, value: totals.supplies[index] }))
      .filter(({ item }) => String(item.particulars || "").trim())
      .map(({ item, value }) => `  - ${item.particulars}${item.quantity ? ` x ${item.quantity} ${item.uom || ""}`.trimEnd() : ""} = ${words.currency} ${formatMoney(value || 0)}`);
    return [
      words.title,
      state.invoiceNumber ? `${words.number}: *${state.invoiceNumber}*` : "",
      state.invoiceDate ? `${words.date}: ${formatDate(state.invoiceDate)}` : "",
      buyer ? `${words.buyer}: ${buyer}` : "",
      state.poNumber ? `${words.po}: ${state.poNumber}${state.poDate ? ` (${formatDate(state.poDate)})` : ""}` : "",
      state.truckNumber ? `${words.truck}: ${state.truckNumber}` : "",
      itemLines.length ? words.items : "",
      ...itemLines,
      `${words.total}: *${words.currency} ${formatMoney(totals.grandTotal)}*`,
      amountInWords(totals.grandTotal, lang),
      state.paymentStatus ? `${words.payment}: ${words.status[state.paymentStatus] || state.paymentStatus}` : "",
      "",
      words.seller,
    ].filter(Boolean).join("\n");
  };

  const shareInvoiceBill = async (button) => {
    const text = invoiceSummary(window.STKI18n.getLang());
    if (!window.STKShare) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    setView("preview");
    document.title = state.invoiceNumber ? `Invoice-${state.invoiceNumber}` : "STK-Invoice";
    button.setAttribute("aria-busy", "true");
    showToast(t("inv.toast.preparing"));
    // Let the preview finish laying out, otherwise the snapshot measures zero.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const result = await window.STKShare.shareBill({
        element: document.getElementById("invoice"),
        fileName: `${document.title}.pdf`,
        title: document.title,
        text,
      });
      if (result === "shared-file") showToast(t("common.toast.sharedFile"));
      // Sticky: WhatsApp Web takes focus, so a timed toast would expire unseen in this tab.
      else if (result === "downloaded-pdf") showToast(t("common.toast.pdfDownloaded"), true);
      else if (result === "shared-text") showToast(t("inv.toast.sharedText"));
      else if (result === "whatsapp-link") showToast(t("common.toast.whatsapp"));
    } catch {
      showToast(t("common.toast.shareFailed"));
    } finally {
      button.removeAttribute("aria-busy");
    }
  };

  const resetInvoice = () => {
    if (!window.confirm(t("inv.confirm.new"))) return;
    window.STKI18n.reset();
    state = blankState();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore blocked device storage. */ }
    createItemEditors();
    applyStateToForm();
    render();
    setView("editor");
    showToast(t("inv.toast.newReady"));
  };

  // Voice data is untrusted model output: whitelist keys, coerce types, only fill what was spoken.
  const VOICE_NUMBER_FIELDS = new Set(["bags", "quantity", "rate", "igstRate", "sgstRate", "cgstRate", "freight"]);
  const PAYMENT_STATUSES = ["PENDING", "PAID", "PARTIALLY PAID"];
  const voiceValue = (key, value) => {
    if (typeof value !== "string" && typeof value !== "number") return "";
    const raw = String(value).trim().slice(0, 500);
    if (VOICE_NUMBER_FIELDS.has(key)) return parseNumber(raw) ? String(parseNumber(raw)) : "";
    if (key === "paymentStatus") return PAYMENT_STATUSES.includes(raw.toUpperCase()) ? raw.toUpperCase() : "";
    return key.endsWith("Date") ? formatDate(raw) : raw;
  };

  // Returns the field ids it wrote, so only those follow the page language afterwards.
  const applyVoiceData = (data) => {
    const written = new Set();
    Object.keys(blankState()).forEach((key) => {
      const value = key === "items" ? "" : voiceValue(key, data[key]);
      if (!value) return;
      state[key] = value;
      written.add(key);
    });
    // Spoken items go into the first empty rows; rows the user already filled stay untouched.
    let slot = 0;
    (Array.isArray(data.items) ? data.items : []).forEach((spoken) => {
      if (!spoken || typeof spoken !== "object") return;
      const item = Object.fromEntries(itemFields.map((field) => [field, voiceValue(field, spoken[field])]));
      if (!itemFields.some((field) => item[field])) return;
      while (slot < ITEM_COUNT && itemFields.some((field) => String(state.items[slot][field] || "").trim())) slot += 1;
      if (slot >= ITEM_COUNT) return;
      const grain = findGrain(item.particulars);
      if (grain && !item.hsn) item.hsn = grain[2];
      state.items[slot] = item;
      itemFields.forEach((field) => written.add(`items.${slot}.${field}`));
    });
    applyStateToForm();
    render();
    return written;
  };

  // Typed text that follows the language switch (api/translate.js keeps the same list). Codes, numbers,
  // dates and statuses never change. `only`: limit to these field ids (voice fill, retry).
  const CONVERTIBLE = ["buyerDetails", "stateCode"];
  const CONVERTIBLE_ITEM = ["particulars", "uom"];
  const convertTypedText = async (only) => {
    if (!(await window.STKI18n.convertDraft(() => state, CONVERTIBLE, CONVERTIBLE_ITEM, showToast, only))) return;
    applyStateToForm();
    render();
  };
  // Details left unconverted (offline, failed, or the page closed meanwhile) catch up; nothing else is touched.
  const retryMissed = () => {
    const missed = window.STKI18n.missedIds();
    if (missed.size) convertTypedText(missed);
  };

  window.STKI18n.init("invoice", "en");
  createItemEditors();
  createPreviewRows();
  applyStateToForm();
  render();
  fitPreview();
  retryMissed();

  const syncDateFromPicker = (native) => {
    const field = native.closest(".date-input-wrap")?.querySelector("[data-date-field]");
    if (!field) return;
    field.value = formatDate(native.value);
    state[field.name] = field.value;
    render();
  };

  const handleFieldInput = (event) => {
    const field = event.target;
    if (field.matches(".date-picker-native")) {
      syncDateFromPicker(field);
      return;
    }
    if (field.matches("[data-date-field]")) maskDateField(field, event.inputType);
    if (field.matches("[data-field]")) {
      state[field.name] = field.value;
    } else if (field.matches("[data-item-field]")) {
      const index = Number(field.dataset.itemIndex);
      const key = field.dataset.itemField;
      state.items[index][key] = field.value;
      if (field.dataset.grainPicker === "select") {
        const custom = field.parentElement.querySelector('[data-grain-picker="custom"]');
        const grain = GRAINS.find(([english]) => english === field.value);
        if (field.value === OTHER_GRAIN) {
          custom.hidden = false;
          state.items[index].particulars = custom.value;
          custom.focus();
        } else {
          custom.hidden = true;
          state.items[index].particulars = grain ? grainName(grain) : "";
          if (grain) {
            state.items[index].hsn = grain[2];
            const hsnInput = document.querySelector(`[data-item-index="${index}"][data-item-field="hsn"]`);
            if (hsnInput) hsnInput.value = grain[2];
          }
        }
      }
    }
    render();
  };

  const invoiceForm = document.getElementById("invoiceForm");
  invoiceForm.addEventListener("input", handleFieldInput);
  invoiceForm.addEventListener("change", handleFieldInput);
  invoiceForm.addEventListener("focusout", (event) => {
    const field = event.target;
    if (!field.matches("[data-date-field]")) return;
    const normalized = formatDate(field.value);
    if (normalized === field.value) return;
    field.value = normalized;
    state[field.name] = normalized;
    render();
  });
  invoiceForm.addEventListener("click", (event) => {
    const trigger = event.target.closest(".date-picker-trigger");
    if (!trigger) return;
    const wrap = trigger.closest(".date-input-wrap");
    const native = wrap?.querySelector(".date-picker-native");
    const field = wrap?.querySelector("[data-date-field]");
    if (!native || !field) return;
    native.value = dmyToYmd(field.value);
    if (typeof native.showPicker === "function") {
      try {
        native.showPicker();
        return;
      } catch { /* Browser blocked the picker; fall back to a plain click. */ }
    }
    native.click();
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.getElementById("mobilePreview").addEventListener("click", () => setView("preview"));
  document.getElementById("previewPrint").addEventListener("click", printInvoice);
  document.getElementById("newInvoice").addEventListener("click", resetInvoice);
  ["shareInvoice", "mobileShare"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener("click", () => shareInvoiceBill(button));
  });
  window.STKVoice?.initVoiceButton(document.getElementById("voiceFillBtn"), {
    docType: "invoice",
    toast: showToast,
    onResult: async ({ transcript, data }) => {
      const written = applyVoiceData(data);
      setView("preview");
      // Spoken names arrive in the script they were said in; bring just those into the page language.
      await convertTypedText(written);
      showToast(t("common.toast.voiceFilled", { text: transcript.length > 70 ? `${transcript.slice(0, 70)}...` : transcript }));
    },
  });
  document.getElementById("langSwitch").addEventListener("click", () => {
    window.STKI18n.toggle();
    render();
    fitPreview();
    convertTypedText();
  });
  window.addEventListener("online", retryMissed);
  window.addEventListener("resize", fitPreview, { passive: true });
  window.visualViewport?.addEventListener("resize", fitPreview, { passive: true });

  // No zoom compensation: the print stylesheet pins the sheet to exact A4, and any
  // scaling here is what used to leave the white band on Android.
  const preparePrint = () => {
    const invoice = document.getElementById("invoice");
    invoice.style.transform = "none";
    invoice.style.marginBottom = "0";
  };
  const restorePreview = () => {
    fitPreview();
  };
  const printMedia = window.matchMedia("print");
  const handlePrintMediaChange = (event) => (event.matches ? preparePrint() : restorePreview());

  window.addEventListener("beforeprint", preparePrint);
  window.addEventListener("afterprint", restorePreview);
  if (printMedia.addEventListener) printMedia.addEventListener("change", handlePrintMediaChange);
  else printMedia.addListener(handlePrintMediaChange);
})();
