(() => {
  "use strict";

  const { t } = window.STKI18n;
  const STORAGE_KEY = "stk-digital-memo-v1";
  const MAX_ITEMS = 5;
  const blankItem = () => ({
    goodsDetails: "",
    weightKg: "",
    bags: "",
    freightRate: "",
    rateBasis: "bag",
    manualTotal: "",
    advancePaid: "",
  });
  const blankState = () => ({
    memoDate: "",
    memoNumber: "",
    partyName: "",
    destination: "",
    village: "",
    fullAddress: "",
    vehicleNumber: "",
    ownerName: "",
    driverName: "",
    licenceNumber: "",
    poNumber: "",
    agentSignature: "",
    agentPhone: "",
    items: [blankItem()],
    specialNote: "",
  });

  const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numeric = (value) => {
    const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };
  const formatMoney = (value) => money.format(Math.round((value + Number.EPSILON) * 100) / 100);
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
  const normalizeItem = (value) => {
    const source = value && typeof value === "object" ? value : {};
    const field = (name, max = 80) => {
      const raw = source[name];
      return typeof raw === "string" || typeof raw === "number" ? String(raw).slice(0, max) : "";
    };
    const rateBasis = ["bag", "quintal", "manual"].includes(source.rateBasis) ? source.rateBasis : "bag";
    return {
      goodsDetails: field("goodsDetails", 500),
      weightKg: field("weightKg"),
      bags: field("bags"),
      freightRate: field("freightRate"),
      rateBasis,
      manualTotal: field("manualTotal"),
      advancePaid: field("advancePaid"),
    };
  };

  const loadState = () => {
    const fallback = blankState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return fallback;
      const merged = { ...fallback, ...saved };
      const legacyItem = normalizeItem(saved);
      const savedItems = Array.isArray(saved.items) ? saved.items.slice(0, MAX_ITEMS).map(normalizeItem) : [legacyItem];
      const hasPerItemAdvance = Array.isArray(saved.items) && saved.items.some((item) => item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "advancePaid"));
      if (!hasPerItemAdvance && savedItems[0] && (typeof saved.advancePaid === "string" || typeof saved.advancePaid === "number")) {
        savedItems[0].advancePaid = String(saved.advancePaid).slice(0, 80);
      }
      merged.items = savedItems.length ? savedItems : [blankItem()];
      merged.memoDate = formatDate(merged.memoDate);
      delete merged.advancePaid;
      if (!("agentSignature" in saved) && saved.agentPhone === "8975933293") merged.agentPhone = "";
      return merged;
    } catch {
      return fallback;
    }
  };

  let state = loadState();
  let saveTimer;

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Device storage may be blocked. */ }
    }, 120);
  };

  const calculateItem = (item) => {
    const rate = numeric(item.freightRate);
    let total = 0;
    if (item.rateBasis === "quintal") total = numeric(item.weightKg) / 100 * rate;
    else if (item.rateBasis === "manual") total = numeric(item.manualTotal);
    else total = numeric(item.bags) * rate;
    const advance = numeric(item.advancePaid);
    return { total, advance, balance: Math.max(0, total - advance) };
  };

  const calculate = () => {
    const rows = state.items.map(calculateItem);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const advance = rows.reduce((sum, row) => sum + row.advance, 0);
    const balance = rows.reduce((sum, row) => sum + row.balance, 0);
    return { rows, total, advance, balance };
  };

  const itemHasData = (item) => Boolean(item.goodsDetails || item.weightKg || item.bags || item.freightRate || item.manualTotal || item.advancePaid || item.rateBasis !== "bag");

  const addTextElement = (parent, tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value || "";
    parent.appendChild(element);
    return element;
  };

  const renderPreviewItems = (totals) => {
    const tbody = document.getElementById("memoItemsBody");
    const table = tbody.closest("table");
    const items = state.items.length ? state.items : [blankItem()];
    const hasAnyData = items.some(itemHasData);
    tbody.replaceChildren();
    table.style.setProperty("--memo-item-count", String(items.length));
    table.classList.toggle("multiple-items", items.length > 1);

    items.forEach((item, index) => {
      const hasItemData = itemHasData(item);
      const rowTotals = totals.rows[index] || { total: 0, advance: 0, balance: 0 };
      const row = document.createElement("tr");
      const goodsCell = document.createElement("td");
      goodsCell.className = "goods-value";
      addTextElement(goodsCell, "strong", "", item.goodsDetails);
      addTextElement(goodsCell, "span", "", item.weightKg ? t("memo.doc.weight", { kg: item.weightKg }) : "");
      if (index === 0) addTextElement(goodsCell, "small", "", state.specialNote);
      row.appendChild(goodsCell);

      addTextElement(row, "td", "", item.bags);
      const rateCell = addTextElement(row, "td", "rate-value", item.rateBasis === "manual" && hasItemData ? "-" : (item.freightRate ? formatMoney(numeric(item.freightRate)) : ""));
      addTextElement(rateCell, "small", "", hasItemData ? t(`memo.basis.${item.rateBasis}`) : "");
      addTextElement(row, "td", "", hasItemData ? formatMoney(rowTotals.total) : "");
      addTextElement(row, "td", "settlement-cell", rowTotals.advance ? formatMoney(rowTotals.advance) : "");
      addTextElement(row, "td", "settlement-cell row-balance-value", hasItemData ? formatMoney(rowTotals.balance) : "");
      tbody.appendChild(row);
    });
    document.getElementById("memoGrandTotal").textContent = hasAnyData ? formatMoney(totals.total) : "";
    document.getElementById("memoAdvanceTotal").textContent = totals.advance ? formatMoney(totals.advance) : "";
    document.getElementById("memoBalanceTotal").textContent = hasAnyData ? formatMoney(totals.balance) : "";
  };

  const renderItemEditorSummaries = (totals) => {
    document.querySelectorAll(".memo-item-card").forEach((card) => {
      const index = Number.parseInt(card.dataset.itemIndex, 10);
      const item = state.items[index];
      if (!item) return;
      card.querySelector("[data-item-title]").textContent = t("memo.item.title", { n: index + 1 });
      card.querySelector("[data-remove-item]").setAttribute("aria-label", t("memo.item.removeAria", { n: index + 1 }));
      card.querySelector(".manual-total-item").hidden = item.rateBasis !== "manual";
      card.querySelector("[data-item-total]").textContent = formatMoney(totals.rows[index].total);
      card.querySelector("[data-item-balance]").textContent = formatMoney(totals.rows[index].balance);
    });
    const addButton = document.getElementById("addMemoItem");
    addButton.textContent = t(addButton.disabled ? "memo.maxItems" : "memo.addItem");
    document.getElementById("formTotalFreight").textContent = formatMoney(totals.total);
    document.getElementById("formAdvance").textContent = formatMoney(totals.advance);
    document.getElementById("formBalance").textContent = formatMoney(totals.balance);
  };

  // Markup only; every word comes from STKI18n through data-i18n, so a switch relabels cards in place.
  const renderItemEditors = () => {
    const container = document.getElementById("memoItemEditors");
    container.replaceChildren();
    state.items.forEach((item, index) => {
      const card = document.createElement("section");
      card.className = "memo-item-card";
      card.dataset.itemIndex = String(index);
      card.innerHTML = `
        <div class="memo-item-card-head">
          <strong data-item-title></strong>
          <button class="memo-remove-item" type="button" data-remove-item data-i18n="memo.item.remove"></button>
        </div>
        <label data-i18n="memo.item.goods"><textarea rows="2" name="itemGoodsDetails-${index}" data-item-field="goodsDetails"></textarea></label>
        <div class="form-grid two">
          <label data-i18n="memo.item.weight"><input type="number" min="0" step="0.01" inputmode="decimal" name="itemWeight-${index}" data-item-field="weightKg" /></label>
          <label data-i18n="memo.item.bags"><input type="number" min="0" step="1" inputmode="numeric" name="itemBags-${index}" data-item-field="bags" /></label>
          <label data-i18n="memo.item.rate"><input type="number" min="0" step="0.01" inputmode="decimal" name="itemRate-${index}" data-item-field="freightRate" /></label>
          <label data-i18n="memo.item.basis">
            <select name="itemBasis-${index}" data-item-field="rateBasis">
              <option value="bag" data-i18n="memo.option.bag"></option>
              <option value="quintal" data-i18n="memo.option.quintal"></option>
              <option value="manual" data-i18n="memo.option.manual"></option>
            </select>
          </label>
          <label class="manual-total-item" hidden data-i18n="memo.item.manualTotal"><input type="number" min="0" step="0.01" inputmode="decimal" name="itemManualTotal-${index}" data-item-field="manualTotal" /></label>
          <label data-i18n="memo.item.advance"><input type="number" min="0" step="0.01" inputmode="decimal" name="itemAdvance-${index}" data-item-field="advancePaid" /></label>
        </div>
        <div class="memo-item-calculated">
          <div><span data-i18n="memo.item.freight"></span><output data-item-total>0.00</output></div>
          <div><span data-i18n="memo.item.balance"></span><output data-item-balance>0.00</output></div>
        </div>`;
      window.STKI18n.apply(card);
      card.querySelectorAll("[data-item-field]").forEach((field) => {
        field.value = item[field.dataset.itemField] ?? "";
      });
      card.querySelector("[data-remove-item]").disabled = state.items.length === 1;
      container.appendChild(card);
    });

    document.getElementById("addMemoItem").disabled = state.items.length >= MAX_ITEMS;
  };

  const render = () => {
    document.querySelectorAll("[data-out]").forEach((element) => {
      const key = element.dataset.out;
      element.textContent = key === "memoDate" ? formatDate(state[key]) : (state[key] || "");
    });

    const totals = calculate();
    renderPreviewItems(totals);
    renderItemEditorSummaries(totals);
    save();
  };

  const applyState = () => {
    document.querySelectorAll("[data-field]").forEach((field) => {
      field.value = state[field.name] ?? "";
    });
    renderItemEditors();
  };

  const fitPreview = () => {
    const memo = document.getElementById("memo");
    const stage = document.querySelector(".memo-stage");
    if (!memo || !stage || window.matchMedia("print").matches) return;
    const available = Math.min(794, stage.clientWidth);
    const scale = Math.max(0.35, available / 794);
    memo.style.transform = scale < 1 ? `scale(${scale})` : "none";
    memo.style.marginBottom = scale < 1 ? `${-memo.offsetHeight * (1 - scale)}px` : "0";
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
    if (view === "preview") requestAnimationFrame(() => { fitPreview(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  };

  let toastTimer;
  // sticky keeps a message up until the next one (e.g. while text converts); null just clears it.
  const showToast = (message, sticky = false) => {
    const toast = document.getElementById("toast");
    clearTimeout(toastTimer);
    if (message === null) return toast.classList.remove("show");
    toast.textContent = message;
    toast.classList.add("show");
    if (!sticky) toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
  };

  const printMemo = () => {
    setView("preview");
    document.title = state.memoNumber ? `STK-Memo-${state.memoNumber}` : "STK-Memo";
    showToast(t("common.toast.print"));
    setTimeout(() => window.print(), 280);
  };

  // WhatsApp markdown: *bold*, plain bullets. Empty fields drop out entirely.
  // Self-contained on purpose: test/parity.test.js runs this block alone, so its words live here.
  const memoSummary = (lang = "mr") => {
    const words = lang === "en"
      ? { title: "*STK Digital Freight Memo*", number: "Memo no.", date: "Date", party: "To", destination: "Destination", vehicle: "Vehicle no.", driver: "Driver", items: "*Goods*", goods: "Goods", bags: "bags", kg: "kg", currency: "Rs.", total: "Total freight", advance: "Advance paid", balance: "Balance freight", note: "Note", seller: "Suresh Tukaram Kore, Malshiras - 7057100034" }
      : { title: "*STK डिजिटल माल पावती*", number: "पावती नं.", date: "तारीख", party: "श्री", destination: "मुक्काम", vehicle: "मोटार नं.", driver: "ड्रायव्हर", items: "*माल तपशील*", goods: "माल", bags: "नग", kg: "किलो", currency: "रु.", total: "एकूण भाडे", advance: "उचल दिली", balance: "बाकी भाडे", note: "सूचना", seller: "सुरेश तुकाराम कोरे, माळशिरस - 7057100034" };
    const totals = calculate();
    const itemLines = state.items
      .map((item, index) => ({ item, row: totals.rows[index] || { total: 0 } }))
      .filter(({ item }) => itemHasData(item))
      .map(({ item, row }) => {
        const detail = [item.bags ? `${item.bags} ${words.bags}` : "", item.weightKg ? `${item.weightKg} ${words.kg}` : ""].filter(Boolean).join(" / ");
        return `  - ${item.goodsDetails || words.goods}${detail ? ` (${detail})` : ""} = ${words.currency} ${formatMoney(row.total)}`;
      });
    return [
      words.title,
      state.memoNumber ? `${words.number}: *${state.memoNumber}*` : "",
      state.memoDate ? `${words.date}: ${formatDate(state.memoDate)}` : "",
      state.partyName ? `${words.party}: ${state.partyName}` : "",
      state.destination ? `${words.destination}: ${state.destination}` : "",
      state.vehicleNumber ? `${words.vehicle}: ${state.vehicleNumber}` : "",
      state.driverName ? `${words.driver}: ${state.driverName}` : "",
      itemLines.length ? words.items : "",
      ...itemLines,
      `${words.total}: *${words.currency} ${formatMoney(totals.total)}*`,
      totals.advance ? `${words.advance}: ${words.currency} ${formatMoney(totals.advance)}` : "",
      `${words.balance}: *${words.currency} ${formatMoney(totals.balance)}*`,
      state.specialNote ? `${words.note}: ${state.specialNote}` : "",
      "",
      words.seller,
    ].filter(Boolean).join("\n");
  };

  const shareMemoBill = async (button) => {
    const text = memoSummary(window.STKI18n.getLang());
    if (!window.STKShare) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    setView("preview");
    document.title = state.memoNumber ? `STK-Memo-${state.memoNumber}` : "STK-Memo";
    button.setAttribute("aria-busy", "true");
    showToast(t("memo.toast.preparing"));
    // Let the preview finish laying out, otherwise the snapshot measures zero.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const result = await window.STKShare.shareBill({
        element: document.getElementById("memo"),
        fileName: `${document.title}.pdf`,
        title: document.title,
        text,
      });
      if (result === "shared-file") showToast(t("common.toast.sharedFile"));
      // Sticky: WhatsApp Web takes focus, so a timed toast would expire unseen in this tab.
      else if (result === "downloaded-pdf") showToast(t("common.toast.pdfDownloaded"), true);
      else if (result === "shared-text") showToast(t("memo.toast.sharedText"));
      else if (result === "whatsapp-link") showToast(t("common.toast.whatsapp"));
    } catch {
      showToast(t("common.toast.shareFailed"));
    } finally {
      button.removeAttribute("aria-busy");
    }
  };

  const resetMemo = () => {
    if (!window.confirm(t("memo.confirm.new"))) return;
    window.STKI18n.reset();
    state = blankState();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore blocked device storage. */ }
    applyState();
    render();
    setView("editor");
    showToast(t("memo.toast.newReady"));
  };

  // Voice data is untrusted model output: whitelist keys, coerce types, only fill what was spoken.
  const VOICE_NUMBER_FIELDS = ["weightKg", "bags", "freightRate", "manualTotal", "advancePaid"];
  // Returns the field ids it wrote, so only those follow the page language afterwards.
  const applyVoiceData = (data) => {
    const written = new Set();
    Object.keys(blankState()).forEach((key) => {
      const raw = data[key];
      if (key === "items" || (typeof raw !== "string" && typeof raw !== "number")) return;
      const value = String(raw).trim().slice(0, 500);
      if (!value) return;
      state[key] = key === "memoDate" ? formatDate(value) : value;
      written.add(key);
    });
    // Spoken items replace empty cards first, then append up to MAX_ITEMS; filled cards stay untouched.
    (Array.isArray(data.items) ? data.items : []).forEach((spoken) => {
      const item = normalizeItem(spoken);
      VOICE_NUMBER_FIELDS.forEach((key) => { item[key] = numeric(item[key]) ? String(numeric(item[key])) : ""; });
      if (!itemHasData(item)) return;
      const empty = state.items.findIndex((existing) => !itemHasData(existing));
      const slot = empty >= 0 ? empty : state.items.length < MAX_ITEMS ? state.items.length : -1;
      if (slot < 0) return;
      state.items[slot] = item;
      written.add(`items.${slot}.goodsDetails`);
    });
    applyState();
    render();
    return written;
  };

  // Writes state into the existing inputs without rebuilding item cards, so focus and typing survive.
  // Only differing values are written: rewriting "60." (read back as "60") would eat the decimal point.
  const syncFormValues = () => {
    const write = (field, value) => { if (field.value !== value) field.value = value; };
    document.querySelectorAll("[data-field]").forEach((field) => write(field, state[field.name] ?? ""));
    document.querySelectorAll(".memo-item-card").forEach((card) => {
      const item = state.items[Number.parseInt(card.dataset.itemIndex, 10)];
      if (!item) return;
      card.querySelectorAll("[data-item-field]").forEach((field) => write(field, item[field.dataset.itemField] ?? ""));
    });
  };

  // Typed text that follows the language switch (api/translate.js keeps the same list). Codes, numbers
  // and dates never change; agentSignature prints as the agent's signature, so it stays as written.
  // `only`: limit to these field ids (voice fill, retry).
  const CONVERTIBLE = ["partyName", "destination", "village", "fullAddress", "ownerName", "driverName", "specialNote"];
  const CONVERTIBLE_ITEM = ["goodsDetails"];
  const convertTypedText = async (only) => {
    if (!(await window.STKI18n.convertDraft(() => state, CONVERTIBLE, CONVERTIBLE_ITEM, showToast, only))) return;
    syncFormValues();
    render();
  };
  // Details left unconverted (offline, failed, or the page closed meanwhile) catch up; nothing else is touched.
  const retryMissed = () => {
    const missed = window.STKI18n.missedIds();
    if (missed.size) convertTypedText(missed);
  };

  window.STKI18n.init("memo", "mr");
  applyState();
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

  const updateFormField = (event) => {
    const field = event.target;
    if (field.matches(".date-picker-native")) {
      syncDateFromPicker(field);
      return;
    }
    if (field.matches("[data-date-field]")) maskDateField(field, event.inputType);
    if (field.matches("[data-field]")) {
      state[field.name] = field.value;
    } else if (field.matches("[data-item-field]")) {
      const card = field.closest(".memo-item-card");
      const index = Number.parseInt(card?.dataset.itemIndex || "", 10);
      const key = field.dataset.itemField;
      if (!Number.isInteger(index) || !state.items[index] || !(key in blankItem())) return;
      state.items[index][key] = field.value;
    } else {
      return;
    }
    render();
  };

  const memoForm = document.getElementById("memoForm");
  memoForm.addEventListener("input", updateFormField);
  memoForm.addEventListener("change", updateFormField);
  memoForm.addEventListener("focusout", (event) => {
    const field = event.target;
    if (!field.matches("[data-date-field]")) return;
    const normalized = formatDate(field.value);
    if (normalized === field.value) return;
    field.value = normalized;
    state[field.name] = normalized;
    render();
  });
  memoForm.addEventListener("click", (event) => {
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
  document.getElementById("addMemoItem").addEventListener("click", () => {
    if (state.items.length >= MAX_ITEMS) return;
    state.items.push(blankItem());
    renderItemEditors();
    render();
    document.querySelector(`.memo-item-card[data-item-index="${state.items.length - 1}"] textarea`)?.focus();
  });
  document.getElementById("memoItemEditors").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-item]");
    if (!button || state.items.length === 1) return;
    const card = button.closest(".memo-item-card");
    const index = Number.parseInt(card?.dataset.itemIndex || "", 10);
    if (!Number.isInteger(index) || !state.items[index]) return;
    state.items.splice(index, 1);
    renderItemEditors();
    render();
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.getElementById("mobilePreview").addEventListener("click", () => setView("preview"));
  document.getElementById("previewPrint").addEventListener("click", printMemo);
  document.getElementById("newMemo").addEventListener("click", resetMemo);
  ["shareMemo", "mobileShare"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener("click", () => shareMemoBill(button));
  });
  window.STKVoice?.initVoiceButton(document.getElementById("voiceFillBtn"), {
    docType: "memo",
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
    const memo = document.getElementById("memo");
    memo.style.transform = "none";
    memo.style.marginBottom = "0";
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
