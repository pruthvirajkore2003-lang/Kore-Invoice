/* English <-> Marathi switch shared by the invoice and memo pages.
   UI text: STRINGS holds [english, marathi] per key; elements name their key in data-i18n*.
   Typed values convert through fixed vocabulary, then this device's translation memory,
   then /api/translate (LLM). Offline, anything without a known conversion stays as typed. */
(() => {
  "use strict";

  // Same deployed origin voice.js uses; offline bundles (file://, content://) call it directly.
  const API = /^https?:$/.test(location.protocol) ? "/api/translate" : "https://www.korewebs.site/api/translate";
  const MAX_TEXT = 500; // Same cap the drafts and api/translate.js use.
  const TIMEOUT_MS = 20000;

  // [english, marathi]. The page's authored language must match its HTML text exactly (test/i18n.test.js).
  const STRINGS = {
    "common.switchTo": ["मराठी", "English"],
    "common.seller": ["Suresh Tukaram Kore", "सुरेश तुकाराम कोरे"],
    "common.pickDate": ["Pick date", "तारीख निवडा"],
    "common.fillDetails": ["Fill details", "माहिती भरा"],
    "common.share": ["Share to WhatsApp", "WhatsApp वर पाठवा"],
    "common.createPdf": ["Create PDF", "PDF तयार करा"],
    "common.toast.print": ["Choose Save as PDF in print screen", "Print मध्ये Save as PDF निवडा"],
    "common.toast.sharedFile": ["Shared - pick WhatsApp in the share sheet", "शेअर करा - WhatsApp निवडा"],
    "common.toast.whatsapp": ["WhatsApp opened, PDF dialog follows", "WhatsApp उघडले, PDF स्क्रीन येईल"],
    "common.toast.shareFailed": ["Share unavailable - use Create PDF", "शेअर शक्य नाही - PDF तयार करा"],
    "common.toast.voiceFilled": ["Filled from voice: \"{text}\"", "आवाजातून माहिती भरली: \"{text}\""],
    "common.convert.working": ["Changing typed details to English...", "भरलेली माहिती मराठीत बदलत आहे..."],
    "common.convert.done": ["Typed details changed to English", "भरलेली माहिती मराठीत बदलली"],
    "common.convert.offline": ["No internet: some typed details are kept as typed. They change when you are back online.", "इंटरनेट नाही: काही भरलेली माहिती आहे तशीच ठेवली. इंटरनेट आल्यावर आपोआप बदलेल."],
    "common.convert.failed": ["Some typed details could not be changed and are kept as typed.", "काही भरलेली माहिती बदलता आली नाही, ती आहे तशीच ठेवली."],

    "voice.title": ["Speak to fill form", "बोलून माहिती भरा"],
    "voice.idle": ["Voice fill", "बोलून भरा"],
    "voice.stop": ["Stop", "थांबवा"],
    "voice.reading": ["Reading...", "वाचत आहे..."],
    "voice.offline": ["Voice fill requires internet. You can still fill the form manually.", "बोलून भरण्यासाठी इंटरनेट लागते. तरीही तुम्ही माहिती स्वतः भरू शकता."],
    "voice.failed": ["Voice fill failed. Please try again or fill manually.", "बोलून भरता आले नाही. कृपया पुन्हा प्रयत्न करा किंवा माहिती स्वतः भरा."],
    "voice.unsupported": ["Voice recording is not supported in this browser. Please fill manually.", "या ब्राउझरमध्ये आवाज रेकॉर्ड करता येत नाही. कृपया माहिती स्वतः भरा."],
    "voice.denied": ["Microphone permission denied. Please allow mic access or fill manually.", "मायक्रोफोनला परवानगी मिळाली नाही. कृपया माईकची परवानगी द्या किंवा माहिती स्वतः भरा."],
    "voice.noAudio": ["No audio captured. Please try again.", "आवाज रेकॉर्ड झाला नाही. कृपया पुन्हा प्रयत्न करा."],
    "voice.processing": ["Reading your voice note...", "तुमचे बोलणे समजून घेत आहे..."],
    "voice.empty": ["Could not hear anything. Please try again.", "काहीच ऐकू आले नाही. कृपया पुन्हा प्रयत्न करा."],
    "voice.listening": ["Listening... tap 🎤 again to stop", "ऐकत आहे... थांबवण्यासाठी पुन्हा 🎤 दाबा"],
    "voice.error": ["Voice fill failed. Please fill manually.", "बोलून भरता आले नाही. कृपया माहिती स्वतः भरा."],

    "inv.title": ["STK Invoice Maker", "STK डिजिटल GST बिल"],
    "inv.brand": ["Invoice Maker", "डिजिटल GST बिल"],
    "inv.memoLink": ["Freight memo", "माल पावती"],
    "inv.new": ["New invoice", "नवीन बिल"],
    "inv.viewNav": ["Invoice view", "बिल दृश्य"],
    "inv.tab.preview": ["Preview", "बिल पहा"],
    "inv.intro.eyebrow": ["New tax invoice", "नवीन GST बिल"],
    "inv.intro.title": ["Enter invoice details", "बिलाची माहिती भरा"],
    "inv.intro.text": ["Draft saves automatically on this phone. Rate entered in rupees, for example 63.75.", "माहिती या फोनवर आपोआप जतन होते. दर रुपयांत भरा, उदा. 63.75."],
    "inv.form.invoice": ["Invoice", "बिल"],
    "inv.form.invoiceDate": ["Invoice date", "बिलाची तारीख"],
    "inv.form.pickInvoiceDate": ["Pick invoice date", "बिलाची तारीख निवडा"],
    "inv.form.invoiceNumber": ["Invoice number", "बिल नं."],
    "inv.form.pinCode": ["PIN code", "पिन कोड"],
    "inv.form.poNumber": ["PO number", "PO नं."],
    "inv.form.poDate": ["PO date", "PO तारीख"],
    "inv.form.pickPoDate": ["Pick PO date", "PO तारीख निवडा"],
    "inv.form.billTo": ["Bill to party", "खरेदीदार"],
    "inv.form.buyerDetails": ["Buyer name and address", "खरेदीदाराचे नाव आणि पत्ता"],
    "inv.form.stateCode": ["State / code", "राज्य / कोड"],
    "inv.form.truckNumber": ["Truck number", "मोटार नं."],
    "inv.form.items": ["Item details", "मालाचा तपशील"],
    "inv.form.taxPayment": ["Tax and payment", "कर आणि पेमेंट"],
    "inv.form.freight": ["Freight (INR)", "भाडे (रुपये)"],
    "inv.form.paymentStatus": ["Payment status", "पेमेंट स्थिती"],
    "inv.pay.pending": ["Pending", "बाकी"],
    "inv.pay.paid": ["Paid", "पूर्ण जमा"],
    "inv.pay.partial": ["Partially paid", "अंशतः जमा"],
    "inv.payDoc.PENDING": ["PENDING", "बाकी"],
    "inv.payDoc.PAID": ["PAID", "पूर्ण जमा"],
    "inv.payDoc.PARTIALLY PAID": ["PARTIALLY PAID", "अंशतः जमा"],
    "inv.mobilePreview": ["Preview invoice", "बिल पहा"],
    "inv.stage": ["Printable invoice preview", "छापण्यासाठी बिल"],
    "inv.livePreview": ["Live preview", "थेट बिल दृश्य"],
    "inv.item.particulars": ["Particulars", "मालाचा तपशील"],
    "inv.item.hsn": ["HSN code", "HSN कोड"],
    "inv.item.bags": ["Bags", "पोती नग"],
    "inv.item.uom": ["UOM", "UOM (एकक)"],
    "inv.item.quantity": ["Quantity", "परिमाण"],
    "inv.item.rate": ["Rate (INR)", "दर (रुपये)"],
    "inv.item.n": ["Item {n}", "माल {n}"],
    "inv.item.amount": ["INR {amount}", "रु. {amount}"],
    "inv.grain.select": ["Select grain", "माल निवडा"],
    "inv.grain.other": ["Other (type manually)", "इतर (स्वतः भरा)"],
    "inv.grain.custom": ["Type item name", "मालाचे नाव लिहा"],
    "inv.doc.seller": ["SURESH TUKARAM KORE", "सुरेश तुकाराम कोरे"],
    "inv.doc.address": ["Mhaswad Road Malshiras, Dist. Solapur, Malshiras", "म्हसवड रोड, माळशिरस, जि. सोलापूर"],
    "inv.doc.state": ["Maharashtra - 413107", "महाराष्ट्र - 413107"],
    "inv.doc.contact": ["Mobile: 7057100034\u00a0 | \u00a0PAN: ACOPK3657P", "मोबाईल: 7057100034\u00a0 | \u00a0PAN: ACOPK3657P"],
    "inv.doc.taxInvoice": ["TAX INVOICE", "कर बीजक"],
    "inv.doc.original": ["ORIGINAL FOR RECIPIENT", "मूळ प्रत - प्राप्तकर्त्यासाठी"],
    "inv.doc.invoiceDate": ["INVOICE DATE", "बिलाची तारीख"],
    "inv.doc.invoiceNo": ["INVOICE NO.", "बिल नं."],
    "inv.doc.pinCode": ["PIN CODE", "पिन कोड"],
    "inv.doc.poNo": ["PO NO.", "PO नं."],
    "inv.doc.poDate": ["PO DATE", "PO तारीख"],
    "inv.doc.billTo": ["BILL TO PARTY", "खरेदीदार"],
    "inv.doc.stateCode": ["STATE / CODE", "राज्य / कोड"],
    "inv.doc.truckNo": ["TRUCK NO.", "मोटार नं."],
    "inv.doc.items": ["ITEM DETAILS", "मालाचा तपशील"],
    "inv.doc.serial": ["S. No.", "अ. क्र."],
    "inv.doc.particulars": ["PARTICULARS", "तपशील"],
    "inv.doc.hsn": ["HSN Code", "HSN कोड"],
    "inv.doc.bags": ["Bags", "पोती"],
    "inv.doc.uom": ["UOM", "एकक"],
    "inv.doc.quantity": ["Quantity", "परिमाण"],
    "inv.doc.rate": ["Rate", "दर"],
    "inv.doc.valueOf": ["Value of", "पुरवठ्याचे"],
    "inv.doc.supply": ["Supply", "मूल्य"],
    "inv.doc.paymentStatus": ["PAYMENT STATUS", "पेमेंट स्थिती"],
    "inv.doc.amountWords": ["AMOUNT IN WORDS", "अक्षरी रक्कम"],
    "inv.doc.freight": ["FREIGHT", "भाडे"],
    "inv.doc.grandTotal": ["GRAND TOTAL", "एकूण रक्कम"],
    "inv.doc.bank": ["BANK DETAILS", "बँक तपशील"],
    "inv.doc.bankName": ["Bank Name", "बँकेचे नाव"],
    "inv.doc.bankNameValue": ["ICICI BANK", "ICICI बँक"],
    "inv.doc.branch": ["Branch Name", "शाखा"],
    "inv.doc.branchValue": ["Akluj", "अकलूज"],
    "inv.doc.account": ["Bank A/c", "खाते क्रमांक"],
    "inv.doc.ifsc": ["IFSC Code", "IFSC कोड"],
    "inv.doc.forSeller": ["FOR SURESH TUKARAM KORE", "सुरेश तुकाराम कोरे करिता"],
    "inv.doc.signatureAlt": ["Authorised signature", "अधिकृत सही"],
    "inv.doc.signatory": ["Authorised Signatory", "अधिकृत सही"],
    "inv.doc.computer": ["Computer generated invoice", "संगणकाद्वारे तयार केलेले बिल"],
    "inv.doc.page": ["Page 1 of 1", "पान 1 / 1"],
    "inv.toast.preparing": ["Preparing invoice to share", "बिल पाठवण्यासाठी तयार होत आहे"],
    "inv.toast.sharedText": ["Invoice details shared as text", "बिलाचा तपशील मजकूर म्हणून पाठवला"],
    "inv.toast.newReady": ["New blank invoice ready", "नवीन कोरे बिल तयार"],
    "inv.confirm.new": ["Clear current invoice and start new?", "सध्याचे बिल साफ करून नवीन बिल सुरू करायचे?"],

    "memo.title": ["STK Digital Freight Memo", "STK डिजिटल माल पावती"],
    "memo.brand": ["Digital Freight Memo", "डिजिटल माल पावती"],
    "memo.invoiceLink": ["Tax Invoice", "GST बिल"],
    "memo.new": ["New", "नवीन"],
    "memo.viewNav": ["Memo view", "पावती दृश्य"],
    "memo.tab.preview": ["View memo", "पावती पहा"],
    "memo.intro.eyebrow": ["Goods transport memo", "माल वाहतूक पावती"],
    "memo.intro.title": ["Enter memo details", "पावतीची माहिती भरा"],
    "memo.intro.text": ["Details are saved automatically on this phone. Freight and balance are calculated automatically.", "माहिती या फोनवर आपोआप जतन होते. भाडे आणि बाकी रक्कम आपोआप मोजली जाते."],
    "memo.form.memo": ["Memo", "पावती"],
    "memo.form.date": ["Date", "तारीख"],
    "memo.form.memoNumber": ["Memo No.", "पावती नं."],
    "memo.form.recipient": ["Consignee", "प्राप्तकर्ता"],
    "memo.form.partyName": ["Party / Firm name", "श्री / फर्मचे नाव"],
    "memo.form.destination": ["Destination", "मुक्काम"],
    "memo.form.village": ["Village", "गाव"],
    "memo.form.fullAddress": ["Full address", "संपूर्ण पत्ता"],
    "memo.form.transport": ["Transport details", "वाहतूक माहिती"],
    "memo.form.vehicleNumber": ["Vehicle No.", "मोटार नं."],
    "memo.form.ownerName": ["Vehicle owner", "मोटार मालक"],
    "memo.form.driverName": ["Driver", "ड्रायव्हर"],
    "memo.form.licenceNumber": ["Licence No.", "लायसन्स नं."],
    "memo.form.poNumber": ["PO No.", "PO नं."],
    "memo.form.agentSignature": ["Motor agent signature / name", "सही मोटर एजंट / नाव"],
    "memo.form.agentPhone": ["Motor agent mobile", "मोटार एजंट मोबाईल"],
    "memo.form.goods": ["Goods and freight", "माल आणि भाडे"],
    "memo.form.goodsHint": ["Enter each item separately.", "प्रत्येक मालाचा तपशील स्वतंत्रपणे भरा."],
    "memo.form.extra": ["Additional note", "अतिरिक्त नोंद"],
    "memo.form.specialNote": ["Special instructions", "विशेष सूचना"],
    "memo.addItem": ["+ Add item", "+ माल जोडा"],
    "memo.maxItems": ["Max 5 items", "कमाल ५ माल"],
    "memo.totalFreight": ["Total freight", "एकूण भाडे"],
    "memo.totalAdvance": ["Total advance", "एकूण उचल"],
    "memo.balance": ["Balance freight", "बाकी भाडे"],
    "memo.payable": ["Payable (Rs.)", "देय रुपये"],
    "memo.stage": ["Freight memo for printing", "छापण्यासाठी माल पावती"],
    "memo.livePreview": ["Live memo preview", "थेट पावती दृश्य"],
    "memo.item.title": ["Item {n}", "माल {n}"],
    "memo.item.remove": ["Remove", "काढा"],
    "memo.item.removeAria": ["Remove item {n}", "माल {n} काढा"],
    "memo.item.goods": ["Goods details", "मालाचा तपशील"],
    "memo.item.weight": ["Weight (kg)", "वजन (किलो)"],
    "memo.item.bags": ["No. of bags", "पोती नग"],
    "memo.item.rate": ["Freight rate", "भाडे दर"],
    "memo.item.basis": ["Rate basis", "दर पद्धत"],
    "memo.item.manualTotal": ["Total freight", "एकूण भाडे"],
    "memo.item.advance": ["Advance paid (Rs.)", "उचल दिली रुपये"],
    "memo.item.freight": ["Item freight", "या मालाचे भाडे"],
    "memo.item.balance": ["Balance", "बाकी भाडे"],
    "memo.option.bag": ["Per bag", "प्रति पोते"],
    "memo.option.quintal": ["Per quintal", "प्रति क्विंटल"],
    "memo.option.manual": ["Enter total manually", "एकूण भाडे स्वतः भरा"],
    "memo.basis.bag": ["per bag", "प्रति पोते"],
    "memo.basis.quintal": ["per quintal", "प्रति क्विंटल"],
    "memo.basis.manual": ["Lump sum", "स्वतः भरलेले"],
    "memo.doc.place": ["Malshiras", "माळशिरस"],
    "memo.doc.date": ["Date:", "तारीख:"],
    "memo.doc.party": ["To, Shri / M/s.", "श्री. रा. रा."],
    "memo.doc.destination": ["Destination", "मुक्काम"],
    "memo.doc.address": ["Full address", "संपूर्ण पत्ता"],
    "memo.doc.from": ["From :- Suresh Tukaram Kore, Malshiras", "माळशिरसमधून :- सुरेश तुकाराम कोरे"],
    "memo.doc.trade": ["Food Grain Merchant \u00a0\u00a0 Mhaswad Road, Malshiras, Dist. Solapur - 413107", "भुसार मालाचे व्यापारी \u00a0\u00a0 म्हसवड रोड, माळशिरस, जि. सोलापूर - ४१३१०७"],
    "memo.doc.greeting": ["Warm greetings. Today we have dispatched goods from here in Vehicle No.", "यांचा सप्रेम नमस्कार वि. वि. आज रोजी इकडून मोटार नं."],
    "memo.doc.in": ["", "मध्ये"],
    "memo.doc.owner": ["Vehicle owner", "मोटार मालक"],
    "memo.doc.village": ["Village", "गाव"],
    "memo.doc.driver": ["Driver", "ड्रायव्हर"],
    "memo.doc.licence": ["Licence No.", "ला. नं."],
    "memo.doc.sent": ["The goods were sent in the above vehicle. Details are given below.", "यांचे मोटारीमधून माल पाठविला. त्याचा तपशील खालीलप्रमाणे"],
    "memo.doc.po": ["PO No.", "PO नं."],
    "memo.doc.goods": ["Goods details", "मालाचा तपशील"],
    "memo.doc.bags": ["Bags", "पोती"],
    "memo.doc.count": ["Nos.", "नग"],
    "memo.doc.rate": ["Rate", "भाडे दर"],
    "memo.doc.basis": ["Rate basis", "दर पद्धत"],
    "memo.doc.total": ["Total freight", "एकूण भाडे"],
    "memo.doc.rupees": ["Rupees", "रुपये"],
    "memo.doc.advance": ["Advance paid", "उचल दिली"],
    "memo.doc.balance": ["Balance freight", "बाकी भाडे"],
    "memo.doc.balanceShort": ["Balance", "बाकी भाडे"],
    "memo.doc.payable": ["Payable (Rs.)", "देय रुपये"],
    "memo.doc.summary": ["Grand total", "एकूण सारांश"],
    "memo.doc.allGoods": ["All goods", "सर्व माल"],
    "memo.doc.declaration": ["The goods have been dispatched as stated above. After dispatch, the transporter shall be fully responsible for any breakage, damage, shortage or excess, or any other matter concerning the goods. Kindly send the acknowledgement of delivery immediately.", "वरीलप्रमाणे माल पाठविला आहे. माल रवाना झाल्यानंतर मालाची तूटफूट, कमी-जास्त किंवा कोणत्याही प्रकारच्या बाबतीत जबाबदारी सर्वस्वी वाहतूकदाराची राहील. मालाची पोहोच ताबडतोब द्यावी."],
    "memo.doc.noteLabel": ["Note:", "टीप:"],
    "memo.doc.note": ["The above goods have been checked and taken for delivery. If the weight is found short, do not pay the freight.", "वरीलप्रमाणे माल तपासून पोहोच करण्याकरिता घेतला आहे. वजन कमी आल्यास भाडे देऊ नये."],
    "memo.doc.agentSign": ["Motor agent signature", "सही मोटर एजंट"],
    "memo.doc.mobile": ["Mobile", "मोबाईल"],
    "memo.doc.ownerAlt": ["Signature of Suresh Tukaram Kore", "सुरेश तुकाराम कोरे यांची सही"],
    "memo.doc.weight": ["Weight: {kg} kg", "वजन: {kg} किलो"],
    "memo.toast.preparing": ["Preparing memo to share", "पावती पाठवण्यासाठी तयार होत आहे"],
    "memo.toast.sharedText": ["Memo details shared as text", "पावती तपशील मजकूर म्हणून पाठवला"],
    "memo.toast.newReady": ["New blank memo ready", "नवीन कोरी पावती तयार"],
    "memo.confirm.new": ["Clear the current memo and start a new one?", "सध्याची पावती साफ करून नवीन पावती सुरू करायची?"],
  };

  // [english, marathi, invoice HSN]. English names are what the invoice picker and voice fill already store.
  const GRAINS = [
    ["Maize (Makka)", "मका", "1005"],
    ["Chickpeas (Chana)", "हरभरा", "0713"],
    ["Wheat", "गहू", "1001"],
    ["Rice", "तांदूळ", "1006"],
    ["Jowar (Sorghum)", "ज्वारी", "1007"],
    ["Bajra (Pearl Millet)", "बाजरी", "1008"],
    ["Barley", "जव", "1003"],
    ["Ragi (Finger Millet)", "नाचणी", "1008"],
    ["Soybean", "सोयाबीन", "1201"],
    ["Tur / Arhar (Pigeon Pea)", "तूर", "0713"],
    ["Moong (Green Gram)", "मूग", "0713"],
    ["Urad (Black Gram)", "उडीद", "0713"],
    ["Groundnut", "भुईमूग", "1202"],
    ["Sunflower Seeds", "सूर्यफूल बी", "1206"],
  ];
  GRAINS.forEach(([english, marathi], index) => { STRINGS[`grain.${index}`] = [english, marathi]; });

  // Whole-value conversions that never need the network: [english, marathi, ...other spellings].
  const VOCAB = [
    ["Maize (Makka)", "मका", "Maize", "Makka", "Corn", "मकई"],
    ["Chickpeas (Chana)", "हरभरा", "Chickpeas", "Chickpea", "Chana", "Gram", "चना", "हरबरा"],
    ["Wheat", "गहू", "Gahu"],
    ["Rice", "तांदूळ", "Tandul"],
    ["Jowar (Sorghum)", "ज्वारी", "Jowar", "Jwari", "Sorghum"],
    ["Bajra (Pearl Millet)", "बाजरी", "Bajra", "Bajri", "Pearl Millet"],
    ["Barley", "जव", "सातू"],
    ["Ragi (Finger Millet)", "नाचणी", "Ragi", "Nachni", "Finger Millet"],
    ["Soybean", "सोयाबीन", "Soyabean", "Soya"],
    ["Tur / Arhar (Pigeon Pea)", "तूर", "Tur", "Toor", "Arhar", "Pigeon Pea", "तुरी"],
    ["Moong (Green Gram)", "मूग", "Moong", "Mung", "Green Gram"],
    ["Urad (Black Gram)", "उडीद", "Urad", "Black Gram"],
    ["Groundnut", "भुईमूग", "Groundnuts", "Peanut", "शेंगदाणा"],
    ["Sunflower Seeds", "सूर्यफूल बी", "Sunflower", "सूर्यफूल"],
    ["Quintal", "क्विंटल", "Qtl", "Quintals"],
    ["Kg", "किलो", "Kgs", "Kilo", "किलोग्रॅम"],
    ["Bags", "पोती", "Bag", "पोते"],
    ["Ton", "टन", "Tonne", "Tons"],
  ];

  let lang = "en";
  let docType = "";

  const other = (code) => (code === "mr" ? "en" : "mr");

  const t = (key, vars) => {
    const pair = STRINGS[key];
    const text = pair ? pair[lang === "mr" ? 1 : 0] : key;
    return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;
  };

  // Elements that also hold inputs, icons or data spans keep them: only their own text node is swapped.
  const setText = (element, text) => {
    if (!element.firstElementChild) {
      element.textContent = text;
      return;
    }
    const node = Array.from(element.childNodes).find((child) => child.nodeType === 3 && child.nodeValue.trim());
    if (node) node.nodeValue = text;
    else element.prepend(text);
  };

  const apply = (root = document) => {
    root.querySelectorAll("[data-i18n]").forEach((element) => setText(element, t(element.dataset.i18n)));
    for (const attribute of ["placeholder", "title", "aria-label", "alt"]) {
      root.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
        element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
      });
    }
  };

  // body.lang-* drives CSS: share.js copies body classes into the PNG snapshot, so this survives there too.
  const setLang = (next) => {
    lang = next === "mr" ? "mr" : "en";
    document.documentElement.lang = lang;
    document.body.classList.toggle("lang-mr", lang === "mr");
    document.body.classList.toggle("lang-en", lang === "en");
    apply(document);
    const button = document.getElementById("langSwitch");
    if (button) button.lang = other(lang);
  };

  const storageKey = () => `stk-${docType}-lang-v1`;

  const init = (type, fallback) => {
    docType = type;
    let saved = null;
    try { saved = localStorage.getItem(storageKey()); } catch { /* Storage blocked: use the page default. */ }
    setLang(saved === "en" || saved === "mr" ? saved : fallback);
    loadPairs();
  };

  const toggle = () => {
    setLang(other(lang));
    try { localStorage.setItem(storageKey(), lang); } catch { /* Storage blocked: the switch lasts this visit. */ }
    document.dispatchEvent(new CustomEvent("stk:langchange", { detail: { lang } }));
    return lang;
  };

  const SCRIPT = { en: /[A-Za-z]/, mr: /[\u0900-\u097F]/ };
  // Whether a value still reads in the other language. Marathi text may keep codes and acronyms in Latin
  // capitals (GSTIN, MIDC, MH12AB1234), so only lowercase Latin makes mixed text count as English.
  const needsConversion = (text, to) => {
    const value = String(text ?? "");
    if (to === "en") return SCRIPT.mr.test(value);
    return SCRIPT.mr.test(value) ? /[a-z]/.test(value) : SCRIPT.en.test(value);
  };

  const fold = (text) => String(text).trim().toLowerCase();
  const fromVocab = (text, to) => {
    const needle = fold(text);
    const row = VOCAB.find((words) => words.some((word) => fold(word) === needle));
    return row ? row[to === "mr" ? 1 : 0] : undefined;
  };

  // Same checks as api/translate.js: numbers, codes (MH12AB1234, PAN, GSTIN) and line breaks must survive.
  const asciiDigits = (text) => text.replace(/[\u0966-\u096F]/g, (digit) => String(digit.charCodeAt(0) - 0x966));
  const digitsOf = (text) => (asciiDigits(text).match(/\d+/g) || []).join(" ");
  const codesOf = (text) => (text.match(/[A-Z0-9]+/g) || []).filter((token) => /\d/.test(token) && /[A-Z]/.test(token)).join(" ");
  const keepsFacts = (source, result) => result.trim() !== "" && result.length <= MAX_TEXT
    && digitsOf(result) === digitsOf(source) && codesOf(result) === codesOf(source)
    && result.split("\n").length === source.split("\n").length;

  // field id -> { en, mr } from its last conversion, plus the ids still waiting for one (offline or failed).
  // Switching back reuses a pair only while the field holds exactly that text, so the original returns
  // untouched and any edit invalidates it. Saved next to the draft so this survives a reload; cleared by New.
  let pairs = new Map();
  let missed = new Set();
  let runs = 0;
  let busy = 0;
  let focusBeforeBusy = null;

  const pairsKey = () => `stk-${docType}-pairs-v1`;
  const savePairs = () => {
    try { localStorage.setItem(pairsKey(), JSON.stringify({ pairs: [...pairs], missed: [...missed] })); } catch { /* Storage blocked: lasts this visit. */ }
  };
  const loadPairs = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(pairsKey()) || "null");
      const isPair = (entry) => Array.isArray(entry) && typeof entry[0] === "string" && entry[1] && typeof entry[1] === "object"
        && ["en", "mr"].every((code) => entry[1][code] === undefined || typeof entry[1][code] === "string");
      pairs = new Map((Array.isArray(saved?.pairs) ? saved.pairs : []).filter(isPair).map(([id, pair]) => [id, { en: pair.en, mr: pair.mr }]));
      missed = new Set((Array.isArray(saved?.missed) ? saved.missed : []).filter((id) => typeof id === "string"));
    } catch { /* Corrupt or blocked storage: start empty. */ }
  };

  // Share and print wait while text is converting, so they never capture half-changed details.
  const setBusy = (on) => {
    if (on && !busy) focusBeforeBusy = document.activeElement;
    busy += on ? 1 : -1;
    const buttons = [...document.querySelectorAll("#langSwitch, .button.share, #previewPrint")];
    buttons.forEach((button) => { button.disabled = busy > 0; });
    // Disabling the focused switch drops focus to <body>; hand it back to keyboard users.
    if (!busy && buttons.includes(focusBeforeBusy) && document.activeElement === document.body) focusBeforeBusy.focus();
  };

  // entries: [{ id, text }]. Never rejects; resolves { results: Map(id -> text), failed: [id], offline, networked }.
  const convert = async (entries, to, onNetwork) => {
    const results = new Map();
    const pending = [];
    const failed = [];
    for (const { id, text } of entries) {
      const source = typeof text === "string" ? text : "";
      if (!source.trim() || !needsConversion(source, to)) continue;
      const pair = pairs.get(id);
      if (pair?.[to] === source) continue; // Already this field's conversion into `to`.
      const known = pair?.[other(to)] === source ? pair[to] : fromVocab(source, to);
      if (known !== undefined) results.set(id, known);
      else if (source.length > MAX_TEXT) failed.push(id); // Never truncate what was typed.
      else pending.push({ id, text: source });
    }
    const unsent = () => [...failed, ...pending.map(({ id }) => id)];
    if (!pending.length) return { results, failed, offline: false, networked: false };
    if (navigator.onLine === false) return { results, failed: unsent(), offline: true, networked: false };

    onNetwork?.();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, items: pending }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || !Array.isArray(body.items)) throw new Error("translate failed");
      // Only the ids this page asked for are read; nothing from the response is used as a key path.
      const converted = new Map(body.items
        .filter((item) => typeof item?.id === "string" && typeof item.text === "string")
        .map((item) => [item.id, item.text]));
      for (const { id, text } of pending) {
        const value = converted.get(id);
        if (value !== undefined && keepsFacts(text, value)) results.set(id, value);
        else failed.push(id);
      }
      return { results, failed, offline: false, networked: true };
    } catch {
      return { results, failed: unsent(), offline: navigator.onLine === false, networked: true };
    } finally {
      clearTimeout(timer);
    }
  };

  // Converts a page draft's typed text (top-level fields + items[i][itemFields]) into the current language,
  // in place. `only` (a Set of field ids) limits it to what voice fill just wrote or what failed earlier.
  // Each call supersedes the previous one. toast(message, sticky) / toast(null) clears. Resolves true on change.
  const convertDraft = async (getState, fields, itemFields, toast, only) => {
    const run = ++runs;
    const to = lang;
    const state = getState();
    const entries = [
      ...fields.map((key) => ({ id: key, text: state[key] })),
      ...state.items.flatMap((item, index) => itemFields.map((key) => ({ id: `items.${index}.${key}`, text: item[key] }))),
    ].filter(({ id }) => !only || only.has(id));
    let networked = false;
    const outcome = await convert(entries, to, () => {
      networked = true;
      setBusy(true);
      toast(t("common.convert.working"), true);
    });
    if (networked) setBusy(false);
    if (run !== runs) { // A newer switch, voice fill or New owns the draft now.
      if (networked && !busy) toast(null);
      return false;
    }
    const current = getState();
    let changed = false;
    for (const { id, text } of entries) {
      const value = outcome.results.get(id);
      const [first, index, key] = id.split(".");
      const target = key ? current.items[Number(index)] : current;
      const field = key || first;
      // Unchanged answers and fields edited while the request was out are left alone.
      if (value === undefined || value === text || !target || target[field] !== text) continue;
      target[field] = value;
      // Only a genuine other-language original is remembered, so switching back can restore it.
      if (!SCRIPT[to].test(text)) pairs.set(id, { [other(to)]: text, [to]: value });
      changed = true;
    }
    entries.forEach(({ id }) => missed.delete(id));
    outcome.failed.forEach((id) => missed.add(id));
    savePairs();
    if (outcome.offline) toast(t("common.convert.offline"));
    else if (outcome.failed.length) toast(t("common.convert.failed"));
    else if (networked && changed) toast(t("common.convert.done"));
    else if (networked) toast(null); // Nothing to report: clear the sticky "changing..." note.
    return changed;
  };

  // New draft: forget converted pairs and pending retries, and ignore any answer still in flight.
  const reset = () => {
    pairs = new Map();
    missed = new Set();
    runs += 1;
    try { localStorage.removeItem(pairsKey()); } catch { /* Storage blocked: nothing saved. */ }
  };

  window.STKI18n = {
    t,
    apply,
    init,
    toggle,
    getLang: () => lang,
    grains: GRAINS,
    convertDraft,
    reset,
    // Field ids that still wait for a conversion (offline or failed), for a retry when the connection returns.
    missedIds: () => new Set(missed),
    // Exposed for tests.
    strings: STRINGS,
    convert,
    needsConversion,
    fromVocab,
    keepsFacts,
  };
})();
