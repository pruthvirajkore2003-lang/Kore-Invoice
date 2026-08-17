(() => {
  "use strict";

  const STORAGE_KEY = "stk-invoice-draft-v1";
  const ITEM_COUNT = 6;
  const itemFields = ["particulars", "hsn", "bags", "uom", "quantity", "rate"];
  const GRAINS = [
    ["Maize (Makka)", "1005"],
    ["Chickpeas (Chana)", "0713"],
    ["Wheat", "1001"],
    ["Rice", "1006"],
    ["Jowar (Sorghum)", "1007"],
    ["Bajra (Pearl Millet)", "1008"],
    ["Barley", "1003"],
    ["Ragi (Finger Millet)", "1008"],
    ["Soybean", "1201"],
    ["Tur / Arhar (Pigeon Pea)", "0713"],
    ["Moong (Green Gram)", "0713"],
    ["Urad (Black Gram)", "0713"],
    ["Groundnut", "1202"],
    ["Sunflower Seeds", "1206"],
  ];
  const OTHER_GRAIN = "Other (type manually)";

  const syncGrainPicker = (select, value) => {
    const custom = select.parentElement.querySelector('[data-grain-picker="custom"]');
    const known = GRAINS.some(([name]) => name === value);
    select.value = known ? value : value ? OTHER_GRAIN : "";
    custom.value = known ? "" : value || "";
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

  const amountInWords = (amount) => {
    const totalPaise = Math.round(Math.max(0, amount) * 100);
    const rupees = Math.floor(totalPaise / 100);
    const paise = totalPaise % 100;
    const rupeeWords = `${integerToIndianWords(rupees)} Rupees`;
    return paise ? `${rupeeWords} and ${integerToIndianWords(paise)} Paise Only` : `${rupeeWords} Only`;
  };

  const createGrainPicker = (index) => {
    const fragment = document.createDocumentFragment();
    const select = document.createElement("select");
    select.dataset.itemIndex = String(index);
    select.dataset.itemField = "particulars";
    select.dataset.grainPicker = "select";
    select.append(new Option("Select grain", ""));
    GRAINS.forEach(([name]) => select.append(new Option(name, name)));
    select.append(new Option(OTHER_GRAIN, OTHER_GRAIN));
    const custom = document.createElement("input");
    custom.type = "text";
    custom.placeholder = "Type item name";
    custom.dataset.itemIndex = String(index);
    custom.dataset.itemField = "particulars";
    custom.dataset.grainPicker = "custom";
    fragment.append(select, custom);
    const value = state.items[index].particulars;
    const known = GRAINS.some(([name]) => name === value);
    select.value = known ? value : value ? OTHER_GRAIN : "";
    custom.value = known ? "" : value || "";
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
      name.textContent = item.particulars || `Item ${index + 1}`;
      const amount = document.createElement("strong");
      amount.className = "item-amount";
      summary.append(name, amount);

      const fields = document.createElement("div");
      fields.className = "item-fields";
      const definitions = [
        ["particulars", "Particulars", "text", "wide-field"],
        ["hsn", "HSN code", "text", ""],
        ["bags", "Bags", "number", ""],
        ["uom", "UOM", "text", ""],
        ["quantity", "Quantity", "number", ""],
        ["rate", "Rate (INR)", "number", ""],
      ];

      definitions.forEach(([field, labelText, type, className]) => {
        const label = document.createElement("label");
        if (className) label.className = className;
        label.append(document.createTextNode(labelText));
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
      const value = key.endsWith("Date") ? formatDate(state[key]) : state[key];
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
        editor.querySelector(".item-name").textContent = item.particulars || `Item ${index + 1}`;
        editor.querySelector(".item-amount").textContent = totals.supplies[index] ? `INR ${formatMoney(totals.supplies[index])}` : "";
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
    text("#amountWords", amountInWords(totals.grandTotal));
    saveState();
  };

  const applyStateToForm = () => {
    document.querySelectorAll("[data-field]").forEach((field) => {
      field.value = state[field.name] ?? "";
    });
    document.querySelectorAll("[data-item-field]").forEach((field) => {
      const value = state.items[Number(field.dataset.itemIndex)][field.dataset.itemField] ?? "";
      if (field.dataset.grainPicker === "select") {
        syncGrainPicker(field, value);
      } else if (field.dataset.grainPicker !== "custom") {
        field.value = value;
      }
    });
  };

  const setView = (view) => {
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

  const showToast = (message) => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  };

  const printInvoice = () => {
    setView("preview");
    document.title = state.invoiceNumber ? `Invoice-${state.invoiceNumber}` : "STK-Invoice";
    showToast("Choose Save as PDF in print screen");
    setTimeout(() => window.print(), 280);
  };

  // WhatsApp markdown: *bold*, plain bullets. Empty fields drop out entirely.
  const invoiceSummary = () => {
    const totals = calculate();
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

  const shareInvoiceBill = async (button) => {
    const text = invoiceSummary();
    if (!window.STKShare) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    setView("preview");
    document.title = state.invoiceNumber ? `Invoice-${state.invoiceNumber}` : "STK-Invoice";
    button.setAttribute("aria-busy", "true");
    showToast("Preparing invoice to share");
    // Let the preview finish laying out, otherwise the snapshot measures zero.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const result = await window.STKShare.shareBill({
        element: document.getElementById("invoice"),
        fileName: `${document.title}.png`,
        title: document.title,
        text,
        onFallbackPrint: () => setTimeout(() => window.print(), 500),
      });
      if (result === "shared-file") showToast("Shared - pick WhatsApp in the share sheet");
      else if (result === "shared-text") showToast("Invoice details shared as text");
      else if (result === "whatsapp-link") showToast("WhatsApp opened, PDF dialog follows");
    } catch {
      showToast("Share unavailable - use Create PDF");
    } finally {
      button.removeAttribute("aria-busy");
    }
  };

  const resetInvoice = () => {
    if (!window.confirm("Clear current invoice and start new?")) return;
    state = blankState();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore blocked device storage. */ }
    createItemEditors();
    applyStateToForm();
    render();
    setView("editor");
    showToast("New blank invoice ready");
  };

  createItemEditors();
  createPreviewRows();
  applyStateToForm();
  render();
  fitPreview();

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
        const grain = GRAINS.find(([name]) => name === field.value);
        if (field.value === OTHER_GRAIN) {
          custom.hidden = false;
          state.items[index].particulars = custom.value;
          custom.focus();
        } else {
          custom.hidden = true;
          if (grain) {
            state.items[index].hsn = grain[1];
            const hsnInput = document.querySelector(`[data-item-index="${index}"][data-item-field="hsn"]`);
            if (hsnInput) hsnInput.value = grain[1];
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
  window.addEventListener("resize", fitPreview, { passive: true });

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
