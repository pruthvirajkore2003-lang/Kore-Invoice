(() => {
  "use strict";

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
    bookNumber: "",
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
  const formatDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
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

  const basisLabels = { bag: "प्रति पोते", quintal: "प्रति क्विंटल", manual: "स्वतः भरलेले" };

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
    tbody.replaceChildren();
    table.style.setProperty("--memo-item-count", String(items.length));
    table.classList.toggle("multiple-items", items.length > 1);

    items.forEach((item, index) => {
      const hasItemData = Boolean(item.goodsDetails || item.weightKg || item.bags || item.freightRate || item.manualTotal || item.advancePaid || item.rateBasis !== "bag");
      const rowTotals = totals.rows[index];
      const row = document.createElement("tr");
      const goodsCell = document.createElement("td");
      goodsCell.className = "goods-value";
      addTextElement(goodsCell, "strong", "", item.goodsDetails);
      addTextElement(goodsCell, "span", "", item.weightKg ? `वजन: ${item.weightKg} किलो` : "");
      if (index === 0) addTextElement(goodsCell, "small", "", state.specialNote);
      row.appendChild(goodsCell);

      addTextElement(row, "td", "", item.bags);
      const rateCell = addTextElement(row, "td", "rate-value", item.rateBasis === "manual" && hasItemData ? "-" : (item.freightRate ? formatMoney(numeric(item.freightRate)) : ""));
      addTextElement(rateCell, "small", "", hasItemData ? basisLabels[item.rateBasis] : "");
      addTextElement(row, "td", "", rowTotals.total ? formatMoney(rowTotals.total) : "");
      addTextElement(row, "td", "settlement-cell", rowTotals.advance ? formatMoney(rowTotals.advance) : "");
      addTextElement(row, "td", "settlement-cell row-balance-value", rowTotals.total || rowTotals.advance ? formatMoney(rowTotals.balance) : "");
      tbody.appendChild(row);
    });
    document.getElementById("memoGrandTotal").textContent = totals.total ? formatMoney(totals.total) : "";
    document.getElementById("memoAdvanceTotal").textContent = totals.advance ? formatMoney(totals.advance) : "";
    document.getElementById("memoBalanceTotal").textContent = totals.total || totals.advance ? formatMoney(totals.balance) : "";
  };

  const renderItemEditorSummaries = (totals) => {
    document.querySelectorAll(".memo-item-card").forEach((card) => {
      const index = Number.parseInt(card.dataset.itemIndex, 10);
      const item = state.items[index];
      if (!item) return;
      card.querySelector(".manual-total-item").hidden = item.rateBasis !== "manual";
      card.querySelector("[data-item-total]").textContent = formatMoney(totals.rows[index].total);
      card.querySelector("[data-item-balance]").textContent = formatMoney(totals.rows[index].balance);
    });
    document.getElementById("formTotalFreight").textContent = formatMoney(totals.total);
    document.getElementById("formAdvance").textContent = formatMoney(totals.advance);
    document.getElementById("formBalance").textContent = formatMoney(totals.balance);
  };

  const renderItemEditors = () => {
    const container = document.getElementById("memoItemEditors");
    container.replaceChildren();
    state.items.forEach((item, index) => {
      const card = document.createElement("section");
      card.className = "memo-item-card";
      card.dataset.itemIndex = String(index);
      card.innerHTML = `
        <div class="memo-item-card-head">
          <strong>माल ${index + 1}</strong>
          <button class="memo-remove-item" type="button" data-remove-item aria-label="माल ${index + 1} काढा">काढा</button>
        </div>
        <label>मालाचा तपशील<textarea rows="2" name="itemGoodsDetails-${index}" data-item-field="goodsDetails"></textarea></label>
        <div class="form-grid two">
          <label>वजन (किलो)<input type="number" min="0" step="0.01" inputmode="decimal" name="itemWeight-${index}" data-item-field="weightKg" /></label>
          <label>पोती नग<input type="number" min="0" step="1" inputmode="numeric" name="itemBags-${index}" data-item-field="bags" /></label>
          <label>भाडे दर<input type="number" min="0" step="0.01" inputmode="decimal" name="itemRate-${index}" data-item-field="freightRate" /></label>
          <label>दर पद्धत
            <select name="itemBasis-${index}" data-item-field="rateBasis">
              <option value="bag">प्रति पोते</option>
              <option value="quintal">प्रति क्विंटल</option>
              <option value="manual">एकूण भाडे स्वतः भरा</option>
            </select>
          </label>
          <label class="manual-total-item" hidden>एकूण भाडे<input type="number" min="0" step="0.01" inputmode="decimal" name="itemManualTotal-${index}" data-item-field="manualTotal" /></label>
          <label>उचल दिली रुपये<input type="number" min="0" step="0.01" inputmode="decimal" name="itemAdvance-${index}" data-item-field="advancePaid" /></label>
        </div>
        <div class="memo-item-calculated">
          <div><span>या मालाचे भाडे</span><output data-item-total>0.00</output></div>
          <div><span>बाकी भाडे</span><output data-item-balance>0.00</output></div>
        </div>`;
      card.querySelectorAll("[data-item-field]").forEach((field) => {
        field.value = item[field.dataset.itemField] ?? "";
      });
      card.querySelector("[data-remove-item]").disabled = state.items.length === 1;
      container.appendChild(card);
    });

    const addButton = document.getElementById("addMemoItem");
    addButton.disabled = state.items.length >= MAX_ITEMS;
    addButton.textContent = addButton.disabled ? "कमाल ५ माल" : "+ माल जोडा";
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
    document.body.classList.toggle("view-preview", view === "preview");
    document.body.classList.toggle("view-editor", view !== "preview");
    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (view === "preview") requestAnimationFrame(() => { fitPreview(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  };

  const showToast = (message) => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  };

  const printMemo = () => {
    setView("preview");
    document.title = state.memoNumber ? `STK-Memo-${state.memoNumber}` : "STK-Memo";
    showToast("Print मध्ये Save as PDF निवडा");
    setTimeout(() => window.print(), 280);
  };

  const resetMemo = () => {
    if (!window.confirm("सध्याची पावती साफ करून नवीन पावती सुरू करायची?")) return;
    state = blankState();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore blocked device storage. */ }
    applyState();
    render();
    setView("editor");
    showToast("नवीन कोरी पावती तयार");
  };

  applyState();
  render();
  fitPreview();

  const updateFormField = (event) => {
    const field = event.target;
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

  document.getElementById("memoForm").addEventListener("input", updateFormField);
  document.getElementById("memoForm").addEventListener("change", updateFormField);
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
  window.addEventListener("resize", fitPreview, { passive: true });
  window.addEventListener("beforeprint", () => {
    const isMobilePrint = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    document.documentElement.style.setProperty("--print-zoom", isMobilePrint ? "0.92" : "1");
    const memo = document.getElementById("memo");
    memo.style.transform = "none";
    memo.style.marginBottom = "0";
  });
  window.addEventListener("afterprint", () => {
    document.documentElement.style.setProperty("--print-zoom", "1");
    fitPreview();
  });
})();
