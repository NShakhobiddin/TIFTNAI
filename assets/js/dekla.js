/* ============================================================
   Dekla AI — runtime
   A tiny template engine that renders the design's markup
   (sc-if / sc-for / {{ }} bindings) driven by the app logic.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- App state & logic ---------------- */
  var state = {
    screen: "splash", stack: [], onb: 0,
    // tovar kelib chiqishi bo'yicha boj preferensiyasi
    originText: "", originCountry: "", originDetecting: false,
    certType: "none", // certType: none | origin | st1
    invoice: 10000, transport: 800, insurance: 200, other: 150, rate: 12600,
    // exchange rate (USD) source — auto from Central Bank until manually edited
    rateAuto: true, rateDate: "", rateLoading: false, rateError: false,
    q: "", results: [], selected: null, tiftnLoading: false,
    // TIFTN catalog (browse + manual pick)
    catStack: [], catQuery: "", catLoading: false,
    // AI classification
    productName: "", productDesc: "", material: "", usage: "", feature: "",
    aiLoading: false, aiError: "", aiResult: null, noteOpen: false,
    // AI-generated clarifying questions
    aiQuestions: [], aiAnswers: {}, candidates: [], productCtx: null,
    // uploads
    imageFiles: [], imageThumbs: [], excelName: "", excelRows: null, docName: ""
  };

  function setState(patch) {
    var p = (typeof patch === "function") ? patch(state) : patch;
    Object.assign(state, p);
    render();
  }

  // Silent update — store input values without re-rendering (keeps native
  // focus/caret on free-text fields the UI doesn't derive anything from).
  function setSilent(patch) { Object.assign(state, patch); }

  /* ---------------- Central Bank (CBU) exchange rate ----------------
     USD rasmiy kursini O'zbekiston Markaziy bankidan oladi:
     https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/
     Natija keshlanadi; tarmoq ishlamasa, kesh yoki standart kurs ishlatiladi. */
  var CBU_USD_URL = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/";
  var RATE_CACHE_KEY = "dekla_usd_rate";

  function readRateCache() {
    try {
      var c = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
      if (c && c.rate > 0) return c; // { rate, date, ts }
    } catch (e) {}
    return null;
  }
  function writeRateCache(rate, date) {
    try {
      localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ rate: rate, date: date, ts: Date.now() }));
    } catch (e) {}
  }

  function fetchCbuRate() {
    if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
    return fetch(CBU_USD_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        var row = Array.isArray(data) ? data[0] : data;
        var rate = row && parseFloat(String(row.Rate).replace(",", "."));
        if (!rate || !(rate > 0)) throw new Error("bad rate");
        return { rate: Math.round(rate * 100) / 100, date: (row && row.Date) || "" };
      });
  }

  // Boot: show cached rate immediately (if any), then refresh from CBU.
  // A manual edit (rateAuto === false) is never overwritten.
  function initRate() {
    var cached = readRateCache();
    if (cached && state.rateAuto) {
      setState({ rate: cached.rate, rateDate: cached.date });
    }
    setState({ rateLoading: true });
    fetchCbuRate().then(function (res) {
      writeRateCache(res.rate, res.date);
      setState(function (p) {
        return p.rateAuto
          ? { rate: res.rate, rateDate: res.date, rateLoading: false, rateError: false }
          : { rateLoading: false, rateError: false };
      });
    }).catch(function () {
      setState(function (p) { return { rateLoading: false, rateError: !p.rateDate }; });
    });
  }

  /* ---------------- Analysis overlay (animated, above #app) ---------------- */
  // Lives in <body> so it survives #app re-renders and animates smoothly.
  var Overlay = (function () {
    var el = null;
    var CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" ' +
      'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

    function show(opts) {
      remove();
      el = document.createElement("div");
      el.className = "dk-overlay";
      var card = document.createElement("div");
      card.className = "dk-card";

      if (opts.image) {
        var scan = document.createElement("div");
        scan.className = "dk-scan";
        var img = document.createElement("img");
        img.src = opts.image;
        scan.appendChild(img);
        card.appendChild(scan);
      } else {
        var orb = document.createElement("div");
        orb.className = "dk-orb";
        card.appendChild(orb);
      }

      var title = document.createElement("div");
      title.className = "dk-card-title";
      title.textContent = opts.title || "Tahlil qilinmoqda";
      card.appendChild(title);

      var sub = document.createElement("div");
      sub.className = "dk-card-sub";
      sub.textContent = opts.subtitle || "Iltimos, kuting…";
      card.appendChild(sub);

      var steps = document.createElement("div");
      steps.className = "dk-steps";
      (opts.steps || []).forEach(function (label) {
        var row = document.createElement("div");
        row.className = "dk-step";
        var ic = document.createElement("span");
        ic.className = "dk-step-ic";
        ic.innerHTML = '<span class="dk-dot"></span>';
        var lab = document.createElement("span");
        lab.className = "dk-step-label";
        lab.textContent = label;
        row.appendChild(ic); row.appendChild(lab);
        steps.appendChild(row);
      });
      card.appendChild(steps);
      el.appendChild(card);
      document.body.appendChild(el);
      setStep(0);
    }

    function setStep(i) {
      if (!el) return;
      var rows = el.querySelectorAll(".dk-step");
      for (var k = 0; k < rows.length; k++) {
        var ic = rows[k].querySelector(".dk-step-ic");
        if (k < i) { rows[k].className = "dk-step is-done"; ic.innerHTML = CHECK; }
        else if (k === i) { rows[k].className = "dk-step is-active"; ic.innerHTML = '<span class="dk-mini"></span>'; }
        else { rows[k].className = "dk-step"; ic.innerHTML = '<span class="dk-dot"></span>'; }
      }
    }

    function hide() {
      if (!el) return;
      var cur = el; el = null;
      cur.classList.add("is-hiding");
      setTimeout(function () { if (cur.parentNode) cur.parentNode.removeChild(cur); }, 230);
    }
    function remove() { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; }

    return { show: show, setStep: setStep, hide: hide };
  })();

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Mark step `i` active, run `work` (optional, may return a Promise), and keep
  // the step visible for at least `ms` so the animation reads as real work.
  function phase(i, ms, work) {
    Overlay.setStep(i);
    var t0 = Date.now();
    return Promise.resolve().then(function () { return work ? work() : null; }).then(function (r) {
      return delay(Math.max(0, ms - (Date.now() - t0))).then(function () { return r; });
    });
  }

  /* ---------------- TIFTN database search ---------------- */
  function tiftnReady() { return window.TifTn && window.TifTn.isReady(); }

  function runSearch(q) {
    if (!q || !q.trim()) { setState({ q: q, results: [] }); return; }
    if (tiftnReady()) {
      setState({ q: q, results: window.TifTn.search(q, 30) });
      return;
    }
    setState({ q: q, tiftnLoading: true });
    if (window.TifTn) {
      window.TifTn.load().then(function () {
        setState({ tiftnLoading: false, results: window.TifTn.search(state.q, 30) });
      }).catch(function () { setState({ tiftnLoading: false }); });
    }
  }

  function selectCode(code) {
    var sel = tiftnReady() ? window.TifTn.get(code) : { code: code };
    setState(function (p) { return { selected: sel, screen: "tiftn", stack: p.stack.concat([p.screen]), noteOpen: false }; });
  }

  /* ---------------- TIFTN catalog (browse + manual pick) ---------------- */
  function openCatalog() {
    setState(function (p) { return { screen: "katalog", stack: p.stack.concat([p.screen]), catStack: [], catQuery: "", catLoading: !tiftnReady() }; });
    if (!tiftnReady() && window.TifTn) {
      window.TifTn.load().then(function () { setState({ catLoading: false }); }).catch(function () { setState({ catLoading: false }); });
    }
  }
  function catSearch(e) { setState({ catQuery: e.target.value }); }
  function catOpen(code, name) { setState(function (p) { return { catStack: p.catStack.concat([{ code: code, name: name }]), catQuery: "" }; }); }
  function catJump(depth) { setState(function (p) { return { catStack: p.catStack.slice(0, depth), catQuery: "" }; }); }
  function catBack() {
    setState(function (p) {
      if (p.catQuery) return { catQuery: "" };
      if (p.catStack.length) return { catStack: p.catStack.slice(0, -1) };
      var st = p.stack.slice(); var prev = st.pop() || "dash"; return { screen: prev, stack: st };
    });
  }

  /* ---------------- AI classification (Qwen via Worker) ---------------- */
  var aiHas = function () { return !!(window.DeklaAI && window.DeklaAI.configured()); };

  // Anchor an AI result to a real DB code. The model is told to pick only from
  // the candidate list, but if it ever returns a code we can't find, fall back
  // to the strongest candidate while keeping the AI's reasoning/confidence.
  function groundResult(res, candidates) {
    if (!res) return res;
    if (tiftnReady() && window.TifTn.get(res.code)) return res;
    var top = candidates && candidates[0];
    if (top) { res.code = top.code; if (!res.name) res.name = top.name; }
    return res;
  }

  // Land on the TIFTN result screen with a classification result.
  // The code is anchored to a 10-digit (terminal/national) code.
  function finishResult(res) {
    var code = (tiftnReady() && window.TifTn.bestTerminal) ? window.TifTn.bestTerminal(res.code) : res.code;
    var sel = (tiftnReady() && window.TifTn.get(code)) || { code: code, name: res.name || "", path: "", chapterTitle: "", unit: "" };
    sel = Object.assign({}, sel, { confidence: res.confidence, reasoning: res.reasoning });
    setState(function (p) {
      return { aiLoading: false, aiResult: res, selected: sel, screen: "tiftn", stack: p.stack.concat([p.screen]), noteOpen: false };
    });
  }

  // Best-effort result from the local DB (used when AI is off or fails).
  function localResult(candidates, note) {
    var top = candidates[0];
    var alts = candidates.slice(1, 4).map(function (c, i) {
      return { code: c.code, confidence: 68 - i * 12, note: c.chapterTitle || c.name };
    });
    return {
      code: top.code, name: top.name, confidence: 76,
      reasoning: note || "Lokal TIFTN bazasi bo'yicha eng mos kod.",
      alternatives: alts, _local: true
    };
  }

  function ensureTiftn() { return tiftnReady() ? Promise.resolve() : window.TifTn.load(); }

  // Candidates for classification — prefer 10-digit (terminal/national) codes so
  // detection lands on a full code, not a 4/6-digit heading.
  function detectCandidates(query) {
    var all = tiftnReady() ? window.TifTn.search(query, 40) : [];
    var term = all.filter(function (c) { return c.terminal; });
    return (term.length >= 3 ? term : all).slice(0, 20);
  }

  // Classify a list of real DB candidates: AI when configured (grounded to the
  // DB), otherwise the best local match. Always resolves with a usable result.
  function classifyCandidates(product, candidates) {
    if (!aiHas()) return Promise.resolve(localResult(candidates));
    return window.DeklaAI.classify(product, candidates, window.TifTn.opi())
      .then(function (res) { return groundResult(res, candidates); })
      .catch(function (e) {
        // Fall back to the local DB silently — no scary technical error in the UI.
        console.warn("[Dekla] AI fallback:", e && e.message);
        return localResult(candidates);
      });
  }

  // Mark all steps done, hold briefly, then reveal the result.
  function finishWithOverlay(res, stepCount) {
    Overlay.setStep(stepCount);
    return delay(420).then(function () { Overlay.hide(); finishResult(res); });
  }
  function failOverlay(e) {
    Overlay.hide();
    setState({ aiLoading: false, aiError: (e && e.message) || "Tahlil xatosi." });
  }

  // Fold the answered AI questions into the product description for classify.
  function withAnswers(product) {
    var ans = state.aiAnswers || {};
    var qa = (state.aiQuestions || []).map(function (q, i) {
      return ans[i] ? (q.question + " — " + ans[i]) : "";
    }).filter(Boolean).join("; ");
    return Object.assign({}, product, { desc: [product.desc, qa].filter(Boolean).join(". ") });
  }

  // Direct classify (no questions) — used when AI is off, or from Excel.
  function goToClassify(product, query) {
    var useAI = aiHas();
    setSilent({ aiLoading: true, aiError: "" });
    Overlay.show({
      title: useAI ? "AI tahlil qilmoqda" : "TIFTN aniqlanmoqda",
      subtitle: "Eng mos TIFTN kodi tanlanmoqda",
      steps: ["TIFTN bazasi tayyorlanmoqda", useAI ? "AI eng mos kodni tanlamoqda" : "Eng mos kod tanlanmoqda"]
    });
    var cands = [];
    phase(0, 450, ensureTiftn)
      .then(function () { return phase(1, 0, function () {
        cands = detectCandidates(query);
        if (!cands.length) throw new Error("Mos kod topilmadi. Boshqacha yozib ko'ring.");
        return classifyCandidates(product, cands);
      }); })
      .then(function (res) { return finishWithOverlay(res, 2); })
      .catch(failOverlay);
  }

  // Text flow: from the product screen → AI generates its own questions, then
  // lands on the questions screen. No AI → classify directly.
  function genQuestions() {
    var name = (state.productName || "").trim();
    var desc = (state.productDesc || "").trim();
    if (!name && !desc) { setState({ aiError: "Avval tovar nomini kiriting." }); return; }
    var query = [name, desc].filter(Boolean).join(" ");
    var product = { name: name || query, desc: desc };
    setSilent({ aiError: "", aiAnswers: {}, productCtx: product });

    if (!aiHas()) { goToClassify(product, query); return; }

    setSilent({ aiLoading: true });
    Overlay.show({
      title: "AI savollar tayyorlamoqda",
      subtitle: "Tovaringizga mos savollar tuzilmoqda",
      steps: ["TIFTN bazasi tayyorlanmoqda", "Nomzod kodlar qidirilmoqda", "AI savollar tuzmoqda"]
    });
    var cands = [];
    phase(0, 450, ensureTiftn)
      .then(function () { return phase(1, 500, function () { cands = detectCandidates(query); }); })
      .then(function () {
        if (!cands.length) throw new Error("Mos kod topilmadi. Boshqacha yozib ko'ring.");
        return phase(2, 0, function () { return window.DeklaAI.askQuestions(product, cands).catch(function () { return []; }); });
      })
      .then(function (qs) {
        Overlay.setStep(3);
        return delay(300).then(function () {
          Overlay.hide();
          setState(function (p) { return { aiLoading: false, aiQuestions: qs || [], aiAnswers: {}, candidates: cands, screen: "ai", stack: p.stack.concat([p.screen]) }; });
        });
      })
      .catch(failOverlay);
  }

  // Questions screen → classify using stored candidates + the user's answers.
  function runAI() {
    var product = state.productCtx || { name: (state.productName || "").trim(), desc: (state.productDesc || "").trim() };
    var prod = withAnswers(product);
    var query = [prod.name, prod.desc].filter(Boolean).join(" ");
    setSilent({ aiLoading: true, aiError: "" });
    var useAI = aiHas();
    Overlay.show({
      title: useAI ? "AI tahlil qilmoqda" : "TIFTN aniqlanmoqda",
      subtitle: "Javoblaringiz asosida eng mos kod tanlanmoqda",
      steps: ["Javoblar hisobga olinmoqda", useAI ? "AI eng mos kodni tanlamoqda" : "Eng mos kod tanlanmoqda"]
    });
    var cands = [];
    phase(0, 450, ensureTiftn)
      .then(function () { return phase(1, 0, function () {
        cands = (state.candidates && state.candidates.length) ? state.candidates : detectCandidates(query);
        if (!cands.length) throw new Error("Mos kod topilmadi. Boshqacha yozib ko'ring.");
        return classifyCandidates(prod, cands);
      }); })
      .then(function (res) { return finishWithOverlay(res, 2); })
      .catch(failOverlay);
  }

  /* ---------------- File uploads ---------------- */
  function openPicker(accept, multiple, cb) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept; inp.multiple = !!multiple;
    inp.style.position = "fixed"; inp.style.left = "-9999px";
    inp.addEventListener("change", function () {
      var files = inp.files;
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (files && files.length) cb(files);
    });
    document.body.appendChild(inp);
    inp.click();
  }

  function pickImage() {
    openPicker("image/*", true, function (files) {
      (state.imageThumbs || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      var arr = [].slice.call(files);
      setState({ imageFiles: arr, imageThumbs: arr.map(function (f) { return URL.createObjectURL(f); }), aiError: "" });
    });
  }
  function pickExcel() {
    openPicker(".xlsx,.xls,.csv", false, function (files) {
      setState({ excelName: files[0].name, excelRows: null, aiError: "", _excelFile: files[0] });
    });
  }
  // Download the Excel template. Uses Telegram's native downloader inside the
  // Mini App; falls back to a normal anchor download in a browser.
  function downloadTemplate() {
    var url = new URL("assets/templates/dekla-tiftn-shablon.xlsx", location.href).href;
    var name = "dekla-tiftn-shablon.xlsx";
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.downloadFile === "function") {
      try { tg.downloadFile({ url: url, file_name: name }); return; } catch (e) { /* fall back */ }
    }
    try {
      var a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      try { window.open(url, "_blank"); } catch (e2) {}
    }
  }
  function pickDoc() {
    openPicker(".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx", false, function (files) {
      setState({ docName: files[0].name, aiError: "" });
    });
  }

  // Image → AI reads the photo → generates its own questions → questions screen.
  function runImageAI() {
    if (!state.imageFiles || !state.imageFiles.length) { setState({ aiError: "Avval rasm tanlang." }); return; }
    if (!aiHas()) { setState({ aiError: "Rasm tahlili uchun AI server (Worker) ulanishi kerak." }); return; }
    setSilent({ aiLoading: true, aiError: "" });
    Overlay.show({
      title: "Rasm tahlil qilinmoqda",
      subtitle: "AI rasmni o'qib, savollar tuzmoqda",
      image: (state.imageThumbs && state.imageThumbs[0]) || null,
      steps: ["Rasm tayyorlanmoqda", "AI rasmni ko'rib chiqmoqda", "Nomzod kodlar qidirilmoqda", "AI savollar tuzmoqda"]
    });
    var info = null, cands = [];
    phase(0, 500, ensureTiftn)
      .then(function () { return phase(1, 0, function () { return window.DeklaAI.describeImage(state.imageFiles); }); })
      .then(function (d) {
        info = d;
        return phase(2, 650, function () { cands = detectCandidates(d.keywords || d.name); });
      })
      .then(function () {
        if (!cands.length) throw new Error("Rasmdan TIFTN kodi topilmadi" + (info && info.name ? " (" + info.name + ")" : "") + ".");
        var product = { name: info.name, desc: "rasm orqali aniqlangan", keywords: info.keywords };
        setSilent({ productCtx: product });
        return phase(3, 0, function () { return window.DeklaAI.askQuestions(product, cands).catch(function () { return []; }); });
      })
      .then(function (qs) {
        Overlay.setStep(4);
        return delay(300).then(function () {
          Overlay.hide();
          setState(function (p) { return { aiLoading: false, aiQuestions: qs || [], aiAnswers: {}, candidates: cands, screen: "ai", stack: p.stack.concat([p.screen]) }; });
        });
      })
      .catch(failOverlay);
  }

  // Excel/CSV → parse first product row → classify
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      s.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX yuklanmadi")); };
      s.onerror = function () { reject(new Error("XLSX kutubxonasini yuklab bo'lmadi (internet).")); };
      document.head.appendChild(s);
    });
  }

  // Pick the first header key matching a pattern, skipping already-used columns.
  function colFor(keys, pattern, used) {
    for (var i = 0; i < keys.length; i++) {
      if (used.indexOf(keys[i]) < 0 && pattern.test(keys[i])) return keys[i];
    }
    return null;
  }
  // Read the first filled product row → {name, desc, material, usage}.
  // Columns are matched by header keywords (matches the Excel template).
  function firstProduct(rows) {
    var empty = { name: "", desc: "", material: "", usage: "" };
    if (!rows || !rows.length) return empty;
    var keys = Object.keys(rows[0] || {});
    var used = [];
    var nameK = colFor(keys, /nom|tovar|mahsulot|name|product/i, used); if (nameK) used.push(nameK);
    var descK = colFor(keys, /tavsif|izoh|desc|description/i, used); if (descK) used.push(descK);
    var matK = colFor(keys, /material|tarkib/i, used); if (matK) used.push(matK);
    var useK = colFor(keys, /ishlat|foydalan|usage|qo.?llan|soha|maqsad/i, used); if (useK) used.push(useK);
    var get = function (r, k) { return k ? String(r[k] == null ? "" : r[k]).trim() : ""; };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var nm = get(r, nameK);
      if (!nm) { // fallback: first non-empty text cell in the row
        for (var j = 0; j < keys.length; j++) {
          var v = r[keys[j]];
          if (typeof v === "string" && v.trim()) { nm = v.trim(); break; }
        }
      }
      if (nm) return { name: nm, desc: get(r, descK), material: get(r, matK), usage: get(r, useK) };
    }
    return empty;
  }

  function runExcelAI() {
    var file = state._excelFile;
    if (!file) { setState({ aiError: "Avval Excel fayl tanlang." }); return; }
    var useAI = aiHas();
    setSilent({ aiLoading: true, aiError: "" });
    Overlay.show({
      title: "Excel tahlil qilinmoqda",
      subtitle: "Fayldan tovar aniqlanib, TIFTN kodi tanlanmoqda",
      steps: ["Excel o'qilmoqda", "Tovar aniqlanmoqda", useAI ? "AI eng mos kodni tanlamoqda" : "Eng mos kod tanlanmoqda"]
    });
    var prod = { name: "", desc: "", material: "", usage: "" }, candidates = [];
    phase(0, 500, function () { return loadXlsx(); })
      .then(function (XLSX) {
        return phase(1, 550, function () {
          return file.arrayBuffer().then(function (buf) {
            var wb = XLSX.read(buf, { type: "array" });
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
            prod = firstProduct(rows);
            if (!prod.name) throw new Error("Excelda tovar nomi ustuni topilmadi.");
            setSilent({ excelRows: rows.length });
          });
        });
      })
      .then(ensureTiftn)
      .then(function () {
        candidates = detectCandidates(prod.name);
        if (!candidates.length) throw new Error("Excel tovari uchun mos kod topilmadi: " + prod.name);
        return phase(2, 0, function () {
          return classifyCandidates({ name: prod.name, desc: prod.desc || "Excel fayldan", material: prod.material, usage: prod.usage }, candidates);
        });
      })
      .then(function (res) { return finishWithOverlay(res, 3); })
      .catch(failOverlay);
  }

  function fmt(n) {
    return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function fmtUsd(n) {
    var f = (Number(n) || 0).toFixed(2);
    var p = f.split(".");
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + p[1];
  }

  /* ---- Bojxona rasmiylashtirish yig'imi ----
     Vazirlar Mahkamasining 2025-yil 31-yanvardagi 55-son qarori, 1-ilova.
     Foiz emas: bojxona qiymati (AQSH dollarida) bo'yicha BHM (bazaviy
     hisoblash miqdori) karralarida belgilangan qat'iy yig'im. BHM yiliga
     o'zgarib turadi — window.DEKLA_BHM orqali yangilash mumkin. */
  var BHM = (window.DEKLA_BHM && Number(window.DEKLA_BHM)) || 412000; // so'm
  var CLEARANCE_TIERS = [
    { max: 10000, k: 1 },      // 10 000 AQSH dollarigacha — BHMning 1 baravari
    { max: 20000, k: 1.5 },    // 10 000–20 000 — 1,5 baravari
    { max: 40000, k: 2.5 },    // 20 000–40 000 — 2,5 baravari
    { max: 60000, k: 4 },      // 40 000–60 000 — 4 baravari
    { max: 100000, k: 7 },     // 60 000–100 000 — 7 baravari
    { max: 200000, k: 10 },    // 100 000–200 000 — 10 baravari
    { max: 500000, k: 15 },    // 200 000–500 000 — 15 baravari
    { max: 1000000, k: 20 },   // 500 000–1 000 000 — 20 baravari
    { max: Infinity, k: 25 }   // 1 000 000 va undan ortiq — 25 baravari
  ];
  function clearanceMultiplier(valueUsd) {
    for (var i = 0; i < CLEARANCE_TIERS.length; i++) {
      if (valueUsd <= CLEARANCE_TIERS[i].max) return CLEARANCE_TIERS[i].k;
    }
    return 25;
  }
  // "1.5" -> "1,5" (Uzbek decimal comma) for display
  function numUz(n) { return String(n).replace(".", ","); }

  /* ---- Tovar kelib chiqishi bo'yicha boj preferensiyasi ----
     Manba: ITSV, TIV va DBQ ning 2020-yil 22-iyundagi
     2020/31-3, 51, 01-02/8-27-son qarori.
       1-ilova — eng ko'p qulaylik rejimi (MFN) davlatlari:
                 kelib chiqish sertifikati bilan boj = asosiy stavka (1×).
       2-ilova — erkin savdo rejimi davlatlari:
                 ST-1 sertifikati bilan boj = 0%.
       Kelib chiqish sertifikati bo'lmasa (qaysi davlatdan kelishidan qat'i
       nazar) advalor stavka pog'onasiga qarab qo'shimcha boj qo'shiladi. */
  var MFN_COUNTRIES = [ // 1-ilova
    "Avstriya Respublikasi", "Afg'oniston Islom Respublikasi", "Bangladesh Xalq Respublikasi",
    "Belgiya Qirolligi", "Bolgariya Respublikasi", "Braziliya Federativ Respublikasi",
    "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi", "Vengriya",
    "Vyetnam Sotsialistik Respublikasi", "Germaniya Federativ Respublikasi", "Gretsiya Respublikasi",
    "Daniya Qirolligi", "Misr Arab Respublikasi", "Isroil Davlati", "Hindiston Respublikasi",
    "Indoneziya Respublikasi", "Irlandiya", "Ispaniya Qirolligi", "Italiya Respublikasi",
    "Iordaniya Hoshimiylik Qirolligi", "Kipr Respublikasi", "Koreya Respublikasi",
    "Xitoy Xalq Respublikasi", "Latviya Respublikasi", "Litva Respublikasi", "Malta Respublikasi",
    "Lyuksemburg Buyuk Gersogligi", "Niderlandiya Qirolligi", "Portugaliya Respublikasi",
    "Pokiston Islom Respublikasi", "Polsha Respublikasi", "Sloveniya Respublikasi", "Ruminiya",
    "Slovakiya Respublikasi", "Singapur Respublikasi", "Amerika Qo'shma Shtatlari",
    "Turkiya Respublikasi", "Finlyandiya Respublikasi", "Fransiya Respublikasi",
    "Xorvatiya Respublikasi", "Chexiya Respublikasi", "Shvetsiya Qirolligi",
    "Shveysariya Konfederatsiyasi", "Estoniya Respublikasi", "Yaponiya",
    "Saudiya Arabistoni Qirolligi", "Malayziya"
  ];
  var FTA_COUNTRIES = [ // 2-ilova
    "Belarus Respublikasi", "Gruziya Respublikasi", "Qozog'iston Respublikasi",
    "Qirg'iziston Respublikasi", "Moldova Respublikasi", "Rossiya Federatsiyasi",
    "Turkmaniston", "Ukraina", "Tojikiston Respublikasi", "Ozarbayjon Respublikasi"
  ];
  // birlashgan, alifbo tartibidagi ro'yxat (tanlash uchun)
  var ALL_COUNTRIES = FTA_COUNTRIES.concat(MFN_COUNTRIES).slice()
    .sort(function (a, b) { return a.localeCompare(b); });

  // 0 = ro'yxatda yo'q (boshqa), 1 = 1-ilova (MFN), 2 = 2-ilova (erkin savdo)
  function countryAnnex(name) {
    if (!name) return 0;
    if (FTA_COUNTRIES.indexOf(name) >= 0) return 2;
    if (MFN_COUNTRIES.indexOf(name) >= 0) return 1;
    return 0;
  }

  // Free-text → official name matcher (instant, offline). Handles Uzbek names,
  // apostrophe variants, and common EN/RU aliases. Returns "" if unresolved.
  function normCty(s) {
    // drop apostrophe variants entirely so "qozogiston" == "Qozog'iston"
    return String(s || "").toLowerCase().replace(/[‘’ʻ'`]/g, "").replace(/\s+/g, " ").trim();
  }
  var COUNTRY_ALIASES = {
    "china": "Xitoy Xalq Respublikasi", "prc": "Xitoy Xalq Respublikasi", "китай": "Xitoy Xalq Respublikasi", "хитой": "Xitoy Xalq Respublikasi",
    "russia": "Rossiya Federatsiyasi", "россия": "Rossiya Federatsiyasi", "rf": "Rossiya Federatsiyasi",
    "usa": "Amerika Qo'shma Shtatlari", "us": "Amerika Qo'shma Shtatlari", "united states": "Amerika Qo'shma Shtatlari", "america": "Amerika Qo'shma Shtatlari", "сша": "Amerika Qo'shma Shtatlari", "aqsh": "Amerika Qo'shma Shtatlari",
    "turkey": "Turkiya Respublikasi", "turkiye": "Turkiya Respublikasi", "турция": "Turkiya Respublikasi",
    "germany": "Germaniya Federativ Respublikasi", "deutschland": "Germaniya Federativ Respublikasi", "германия": "Germaniya Federativ Respublikasi",
    "south korea": "Koreya Respublikasi", "korea": "Koreya Respublikasi", "корея": "Koreya Respublikasi",
    "japan": "Yaponiya", "япония": "Yaponiya",
    "kazakhstan": "Qozog'iston Respublikasi", "казахстан": "Qozog'iston Respublikasi",
    "kyrgyzstan": "Qirg'iziston Respublikasi", "kyrgyz": "Qirg'iziston Respublikasi", "киргизия": "Qirg'iziston Respublikasi", "кыргызстан": "Qirg'iziston Respublikasi",
    "tajikistan": "Tojikiston Respublikasi", "таджикистан": "Tojikiston Respublikasi",
    "belarus": "Belarus Respublikasi", "беларусь": "Belarus Respublikasi", "беларус": "Belarus Respublikasi",
    "ukraine": "Ukraina", "украина": "Ukraina",
    "uk": "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi", "united kingdom": "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi", "england": "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi", "britain": "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi", "англия": "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi", "великобритания": "Buyuk Britaniya va Shimoliy Irlandiya Birlashgan Qirolligi",
    "india": "Hindiston Respublikasi", "индия": "Hindiston Respublikasi",
    "france": "Fransiya Respublikasi", "франция": "Fransiya Respublikasi",
    "italy": "Italiya Respublikasi", "италия": "Italiya Respublikasi",
    "spain": "Ispaniya Qirolligi", "испания": "Ispaniya Qirolligi",
    "poland": "Polsha Respublikasi", "польша": "Polsha Respublikasi",
    "vietnam": "Vyetnam Sotsialistik Respublikasi", "вьетнам": "Vyetnam Sotsialistik Respublikasi",
    "azerbaijan": "Ozarbayjon Respublikasi", "азербайджан": "Ozarbayjon Respublikasi",
    "georgia": "Gruziya Respublikasi", "грузия": "Gruziya Respublikasi",
    "moldova": "Moldova Respublikasi", "молдова": "Moldova Respublikasi",
    "turkmenistan": "Turkmaniston", "туркменистан": "Turkmaniston"
  };
  function matchCountry(text) {
    var t = normCty(text);
    if (!t) return "";
    var all = FTA_COUNTRIES.concat(MFN_COUNTRIES);
    var i;
    for (i = 0; i < all.length; i++) { if (normCty(all[i]) === t) return all[i]; }   // exact name
    if (COUNTRY_ALIASES[t]) return COUNTRY_ALIASES[t];                                // exact alias
    // alias contained in the text ("from china", "rossiyadan") — longest alias first
    var keys = Object.keys(COUNTRY_ALIASES).sort(function (a, b) { return b.length - a.length; });
    for (i = 0; i < keys.length; i++) { if (keys[i].length >= 3 && t.indexOf(keys[i]) >= 0) return COUNTRY_ALIASES[keys[i]]; }
    // match against official names by leading word / substring (length-guarded)
    if (t.length >= 3) {
      var hits = [];
      for (i = 0; i < all.length; i++) {
        var n = normCty(all[i]), lead = n.split(" ")[0];
        if (n.indexOf(t) >= 0 || t.indexOf(lead) === 0 || lead.indexOf(t) === 0) hits.push(all[i]);
      }
      if (hits.length === 1) return hits[0];
      for (i = 0; i < hits.length; i++) { if (t.indexOf(normCty(hits[i]).split(" ")[0]) === 0) return hits[i]; }
      if (hits.length > 1) return hits[0];
    }
    return "";
  }
  function annexLabel(annex) {
    return annex === 2 ? "2-ilova · erkin savdo"
      : annex === 1 ? "1-ilova · eng ko'p qulaylik (MFN)"
      : "ro'yxatda yo'q (boshqa davlat)";
  }
  // AI orqali erkin matndan davlatni aniqlash (lokal moslik topilmaganda).
  function detectCountryAI() {
    var text = (state.originText || "").trim();
    if (!text || !(window.DeklaAI && window.DeklaAI.configured())) return;
    setState({ originDetecting: true });
    window.DeklaAI.detectCountry(text, FTA_COUNTRIES.concat(MFN_COUNTRIES)).then(function (name) {
      var resolved = matchCountry(name);
      setState({ originCountry: resolved, originText: resolved || text, originDetecting: false });
    }).catch(function () { setState({ originDetecting: false }); });
  }
  // sertifikatsiz qo'shimcha boj (advalor pog'onasi bo'yicha)
  function originSurcharge(baseAdv) {
    if (baseAdv < 10) return 5;
    if (baseAdv < 20) return 10;
    if (baseAdv < 30) return 15;
    return 20;
  }
  // Yakuniy boj stavkasini va qo'llanilgan qoidani qaytaradi.
  function effectiveDuty(baseAdv, country, certType) {
    var annex = countryAnnex(country);
    if (certType === "st1" && annex === 2) {
      return { rate: 0, kind: "fta", note: "2-ilova (erkin savdo) + ST-1 → boj 0%" };
    }
    if (certType !== "none" && annex === 1) {
      return { rate: baseAdv, kind: "mfn",
        note: "1-ilova (eng ko'p qulaylik) + kelib chiqish sertifikati → asosiy stavka (1×)" };
    }
    if (certType === "none") {
      var sur = originSurcharge(baseAdv);
      return { rate: baseAdv + sur, kind: "surcharge", surcharge: sur,
        note: "Kelib chiqish sertifikatisiz → asosiy " + numUz(baseAdv) + "% + qo'shimcha " + sur + "%" };
    }
    return { rate: baseAdv, kind: "base", note: "Sertifikat mavjud — asosiy stavka (1×)" };
  }

  function renderVals() {
    var s = state;
    var go = function (sc) {
      return function () {
        setState(function (p) { return { screen: sc, stack: p.stack.concat([p.screen]) }; });
      };
    };
    var back = function () {
      setState(function (p) { var st = p.stack.slice(); var prev = st.pop() || "dash"; return { screen: prev, stack: st }; });
    };
    var nextOnb = function () {
      setState(function (p) { return p.onb >= 2 ? { screen: "dash", stack: [] } : { onb: p.onb + 1 }; });
    };
    var num = function (f) {
      return function (e) {
        var v = parseFloat(String(e.target.value).replace(/[^0-9.]/g, "")) || 0;
        var o = {}; o[f] = v; setState(o);
      };
    };

    // ---- import-duty rate for the selected code (PP-3818) ----
    // Real per-code ad valorem rate; falls back to 5% if data unavailable.
    var dutyInfo = (s.selected && tiftnReady() && window.TifTn.duty)
      ? window.TifTn.duty(s.selected.code) : null;
    var dutyAdv = dutyInfo ? (dutyInfo.adv || 0) : 5;
    var dutyRateText = dutyInfo && window.TifTn.dutyText ? window.TifTn.dutyText(dutyInfo) : (dutyAdv + "%");

    var cipUsd = (s.invoice || 0) + (s.transport || 0) + (s.insurance || 0) + (s.other || 0);
    var cipUzs = cipUsd * (s.rate || 0);
    // import duty adjusted for the goods' country of origin + certificate
    var duty = effectiveDuty(dutyAdv, s.originCountry, s.certType);
    var effAdv = duty.rate;
    var boj = cipUzs * (effAdv / 100);
    var aksiz = 0; // aksiz solig'i — hozircha 0 (ayrim kodlar uchun keyin qo'shiladi)
    // QQS barcha tovarlarga 12%; bazasi = tovar qiymati + boj + aksiz.
    var qqs = (cipUzs + boj + aksiz) * 0.12;
    // Bojxona rasmiylashtirish yig'imi — bojxona qiymati (USD) bo'yicha BHM karralari.
    var clrMult = cipUsd > 0 ? clearanceMultiplier(cipUsd) : 0;
    var yigim = clrMult * BHM;
    // Jami bojxona to'lovlari = boj + aksiz + QQS + yig'im.
    var jamiUzs = boj + aksiz + qqs + yigim;
    var payments = [
      { label: "Bojxona boji", rate: numUz(effAdv) + "%", uzs: fmt(boj) },
      { label: "Aksiz", rate: "0%", uzs: "0" },
      { label: "QQS", rate: "12%", uzs: fmt(qqs) },
      { label: "Bojxona rasmiylashtirish yig'imi", rate: clrMult ? (numUz(clrMult) + "× BHM") : "—", uzs: fmt(yigim) }
    ];

    var sc = s.screen;
    var navColor = function (t) { return sc === t ? "#14284c" : "#9aa4b6"; };
    var dot = function (i) { return s.onb === i ? "#1ca354" : "#cfd7e3"; };

    // ---- TIFTN search results (with per-row pick handlers) ----
    // TL: Cyrillic → Latin for display (the DB is stored in Cyrillic).
    var TL = (tiftnReady() && window.TifTn.translitDisplay) ? window.TifTn.translitDisplay : function (x) { return x || ""; };
    var pickOf = function (code) { return function () { selectCode(code); }; };
    var results = (s.results || []).map(function (r) {
      return { code: r.code, name: TL(r.name), path: TL(r.path), unit: r.unit || "—",
        chapterTitle: TL(r.chapterTitle || ""), pick: pickOf(r.code) };
    });
    var hasQuery = !!(s.q && s.q.trim());

    // ---- TIFTN catalog (browse hierarchy + manual pick) ----
    var catStack = s.catStack || [];
    var catSearching = !!(s.catQuery && s.catQuery.trim());
    var catTitle = catStack.length ? TL(catStack[catStack.length - 1].name) : "Barcha guruhlar";
    var openOf = function (code, name) { return function () { catOpen(code, name); }; };
    var catItem = function (code, name, leaf, tap) {
      var L = String(code).replace(/\D/g, "").length;
      var tag = leaf ? "Kod" : (L <= 2 ? "Guruh" : L <= 4 ? "Pozitsiya" : L <= 6 ? "Subpozitsiya" : "Tarmoq");
      return {
        code: code, name: name, isLeaf: leaf, tap: tap, tag: tag,
        codeBg: leaf ? "#e9f6ee" : "#eef2fb",
        codeColor: leaf ? "#1a8c44" : "#41527a"
      };
    };
    var catList = [];
    if (tiftnReady()) {
      if (catSearching) {
        catList = window.TifTn.search(s.catQuery, 40).map(function (r) { return catItem(r.code, TL(r.name), true, pickOf(r.code)); });
      } else if (!catStack.length) {
        catList = window.TifTn.chapters().map(function (c) { return catItem(c.code, TL(c.name), false, openOf(c.code, c.name)); });
      } else {
        catList = window.TifTn.children(catStack[catStack.length - 1].code).map(function (r) {
          var leaf = !!r.terminal;
          return catItem(r.code, TL(r.name), leaf, leaf ? pickOf(r.code) : openOf(r.code, r.name));
        });
      }
    }
    var catCrumbs = [{ label: "Barchasi", jump: function () { catJump(0); } }];
    catStack.forEach(function (c, i) { catCrumbs.push({ label: c.code, jump: (function (d) { return function () { catJump(d); }; })(i + 1) }); });
    var catCount = catList.length;

    // ---- selected code (TIFTN result screen) ----
    var sel = s.selected;
    var aiOn = !!s.aiResult;
    var selCode = sel ? sel.code : "8471.30.000 0";
    var selName = sel ? TL(sel.name) : "Avtomatik ma'lumotlarni qayta ishlovchi mashinalar";
    // short, meaningful description under the code (leaf + nearest parent if short)
    var selDesc;
    if (sel) {
      var segs = (sel.pathArr || []).map(function (x) { return String(x || "").replace(/\s*[:;]\s*$/, "").trim(); }).filter(Boolean);
      var leaf = segs.length ? segs[segs.length - 1] : (sel.name || "");
      var d = leaf;
      if (segs.length > 1 && leaf.length < 38) {
        var prev = segs[segs.length - 2];
        if (prev && prev.toLowerCase() !== leaf.toLowerCase()) d = prev + ", " + leaf;
      }
      d = TL(d);
      if (d.length > 80) d = d.slice(0, 80).replace(/\s+\S*$/, "") + "…";
      selDesc = d || TL(sel.name) || "—";
    } else {
      selDesc = "Avtomatik ma'lumotlarni qayta ishlovchi mashinalar.";
    }
    var selUnit = sel ? (sel.unit || "—") : "—";
    var selConf = (sel && sel.confidence != null) ? sel.confidence : 94;
    var selConfPct = selConf + "%";
    var selReasoning = (sel && sel.reasoning)
      ? sel.reasoning
      : "Ushbu kod siz kiritgan ma'lumotlarga eng mos keladi.";

    // colour ramp for a confidence value
    var confBg = function (c) { return c >= 70 ? "#e6f6ec" : c >= 50 ? "#fef0e0" : "#fdeaea"; };
    var confColor = function (c) { return c >= 70 ? "#1a8c44" : c >= 50 ? "#c9821a" : "#d84a4a"; };

    // ---- alternative codes: AI-ranked when available, else DB siblings ----
    var alts = [];
    if (aiOn) {
      var seen = {};
      alts.push({ code: selCode, name: selName, pct: selConfPct, bg: confBg(selConf),
        color: confColor(selConf), rowBg: "#f3fbf6", pick: pickOf(selCode) });
      seen[selCode] = 1;
      (s.aiResult.alternatives || []).forEach(function (a) {
        if (seen[a.code]) return; seen[a.code] = 1;
        var info = tiftnReady() ? window.TifTn.get(a.code) : null;
        var c = a.confidence != null ? a.confidence : 50;
        alts.push({ code: a.code, name: TL((info && info.name) || a.note || "—"), pct: c + "%",
          bg: confBg(c), color: confColor(c), rowBg: "#ffffff", pick: pickOf(a.code) });
      });
    } else if (sel && tiftnReady()) {
      var altPct = ["94%", "78%", "64%", "52%", "43%"];
      var altBg = ["#e6f6ec", "#e6f6ec", "#fef0e0", "#fef0e0", "#fdeaea"];
      var altColor = ["#1a8c44", "#1a8c44", "#c9821a", "#c9821a", "#d84a4a"];
      var sibs = window.TifTn.siblings(sel.code, 4);
      alts.push({ code: sel.code, name: selName, pct: "94%", bg: "#e6f6ec", color: "#1a8c44",
        rowBg: "#f3fbf6", pick: pickOf(sel.code) });
      for (var ai = 0; ai < sibs.length; ai++) {
        alts.push({ code: sibs[ai].code, name: TL(sibs[ai].name), pct: altPct[ai + 1] || "40%",
          bg: altBg[ai + 1] || "#fdeaea", color: altColor[ai + 1] || "#d84a4a",
          rowBg: "#ffffff", pick: pickOf(sibs[ai].code) });
      }
    }

    // ---- official TIFTN note (izoh): only this product's GROUP (chapter) ----
    var noteLat = "";
    if (sel && tiftnReady() && window.TifTn.applicableNotes) {
      var nz = window.TifTn.applicableNotes(sel.code);
      var parts = [].concat(nz.chapterNotes || [], nz.chapterExclusions || []);
      var raw = parts.map(function (n) { return typeof n === "string" ? n : (n && (n.text || n.note)) || ""; })
        .filter(Boolean).join("\n\n");
      noteLat = raw ? TL(raw) : "";
    }
    var noteOpen = !!s.noteOpen;
    var notePreview = noteLat.length > 150 ? noteLat.slice(0, 150).replace(/\s+\S*$/, "") + "…" : noteLat;

    // ---- AI-generated clarifying questions (tappable option chips) ----
    var answers = s.aiAnswers || {};
    var aiQuestions = (s.aiQuestions || []).map(function (q, i) {
      var picked = answers[i];
      return {
        question: q.question,
        options: (q.options || []).map(function (opt) {
          var on = opt === picked;
          return {
            label: opt,
            bg: on ? "#14284c" : "#f7f9fc",
            color: on ? "#ffffff" : "#3a455c",
            border: on ? "#14284c" : "#dde3ee",
            pick: (function (idx, val) {
              return function () { var a = Object.assign({}, state.aiAnswers); a[idx] = val; setState({ aiAnswers: a }); };
            })(i, opt)
          };
        })
      };
    });

    return {
      isSplash: sc === "splash", isLogin: sc === "login", isSms: sc === "sms", isOnb: sc === "onb",
      isDash: sc === "dash", isTezkor: sc === "tezkor", isNew: sc === "new", isProduct: sc === "product",
      isImage: sc === "image", isExcel: sc === "excel", isHujjat: sc === "hujjat", isAi: sc === "ai",
      isTiftn: sc === "tiftn", isAlt: sc === "alt", isValue: sc === "value", isPay: sc === "pay",
      isPermit: sc === "permit", isRisk: sc === "risk", isFinal: sc === "final", isProfile: sc === "profile",
      isHelp: sc === "help", isTariffs: sc === "tariffs", isHisob: sc === "hisob", isSaqlangan: sc === "saqlangan",
      isKatalog: sc === "katalog",
      showLogoHeader: ["product", "image", "excel", "hujjat", "ai", "tiftn", "alt", "value", "pay", "permit", "risk", "final", "profile"].indexOf(sc) !== -1,
      showBottomNav: ["dash", "hisob", "saqlangan", "profile"].indexOf(sc) !== -1,
      screenBg: sc === "splash" ? "#0e2545" : "#f4f6fb",
      statusColor: sc === "splash" ? "#ffffff" : "#14284c",
      onb0: s.onb === 0, onb1: s.onb === 1, onb2: s.onb === 2,
      onbBtn: s.onb >= 2 ? "Boshlash" : "Keyingi",
      onbDot0: dot(0), onbDot1: dot(1), onbDot2: dot(2),
      // tovar kelib chiqishi bo'yicha preferensiya
      originText: s.originText || "",
      allCountries: ALL_COUNTRIES,
      originDetectNote: s.originDetecting ? "AI aniqlamoqda…"
        : (s.originCountry ? ("✓ " + s.originCountry + " — " + annexLabel(countryAnnex(s.originCountry)))
          : ((s.originText || "").trim() ? ("“" + s.originText.trim() + "” — ro'yxatda topilmadi (boshqa davlat)") : "")),
      originDetectColor: s.originCountry ? "#1ca354" : "#c9821a",
      hasOriginNote: !!(s.originDetecting || s.originCountry || (s.originText || "").trim()),
      showAiDetect: !!((s.originText || "").trim()) && !s.originCountry && !s.originDetecting
        && !!(window.DeklaAI && window.DeklaAI.configured()),
      aiDetectLabel: s.originDetecting ? "Aniqlanmoqda…" : "AI orqali aniqlash",
      certNoneBg: s.certType === "none" ? "#14284c" : "#fff",
      certNoneFg: s.certType === "none" ? "#fff" : "#5a6b86",
      certOriginBg: s.certType === "origin" ? "#14284c" : "#fff",
      certOriginFg: s.certType === "origin" ? "#fff" : "#5a6b86",
      certSt1Bg: s.certType === "st1" ? "#14284c" : "#fff",
      certSt1Fg: s.certType === "st1" ? "#fff" : "#5a6b86",
      dutyPrefNote: duty.note,
      invoice: s.invoice, transport: s.transport, insurance: s.insurance, other: s.other, rate: s.rate,
      // exchange-rate source note shown under the rate input
      rateNote: s.rateLoading ? "MB kursi yuklanmoqda…"
        : (!s.rateAuto ? "Qo'lda kiritilgan"
          : (s.rateError ? "MB ulanmadi — standart kurs"
            : (s.rateDate ? ("Markaziy bank · " + s.rateDate) : "Markaziy bank kursi"))),
      cipUsdStr: fmtUsd(cipUsd), cipUzsStr: fmt(cipUzs),
      jamiUzsStr: fmt(jamiUzs), jamiUsdStr: fmtUsd(jamiUzs / (s.rate || 1)),
      payments: payments,
      // customs clearance fee basis (VM 31.01.2025/55)
      bhmStr: fmt(BHM), clrMult: numUz(clrMult), clrFeeStr: fmt(yigim), hasClr: clrMult > 0,
      navAsosiy: navColor("dash"), navHisob: navColor("hisob"), navSaqlangan: navColor("saqlangan"), navProfil: navColor("profile"),
      // TIFTN search
      q: s.q || "", results: results, hasResults: results.length > 0,
      tiftnLoading: s.tiftnLoading, showRecents: !hasQuery && !s.tiftnLoading,
      noResults: hasQuery && !s.tiftnLoading && results.length === 0,
      // TIFTN catalog
      catQuery: s.catQuery || "", catList: catList, hasCat: catList.length > 0,
      catTitle: catTitle, catSearching: catSearching, catLoading: !!s.catLoading,
      catDrilled: catStack.length > 0, catCrumbs: catCrumbs, catCount: catCount,
      catShowCrumbs: catStack.length > 0 && !catSearching,
      catHeading: catSearching ? "Qidiruv natijalari" : catTitle,
      noCat: tiftnReady() && !s.catLoading && catList.length === 0,
      selCode: selCode, selName: selName, selDesc: selDesc, selUnit: selUnit,
      selConfPct: selConfPct, selReasoning: selReasoning,
      // import-duty rate for the selected code (PP-3818)
      dutyRateText: dutyRateText, hasDuty: !!dutyInfo, dutyAdvPct: numUz(dutyAdv) + "%",
      dutyFootnote: (dutyInfo && dutyInfo.footnote) ? dutyInfo.footnote : "",
      hasDutyFootnote: !!(dutyInfo && dutyInfo.footnote),
      hasNote: !!noteLat, noteOpen: noteOpen, selNote: noteLat, selNotePreview: notePreview,
      noteToggleLabel: noteOpen ? "Yopish" : "To'liq",
      alts: alts, hasAlts: alts.length > 0,
      // AI classification
      productName: s.productName || "",
      aiLoading: s.aiLoading, aiError: s.aiError || "", hasAiError: !!s.aiError,
      aiBtn: s.aiLoading ? "AI tahlil qilmoqda…" : "Natijani ko'rsatish",
      aiQuestions: aiQuestions, hasQuestions: aiQuestions.length > 0,
      // uploads
      imageThumbs: (s.imageThumbs || []).map(function (u) { return { url: u }; }),
      hasImages: (s.imageThumbs || []).length > 0,
      imageHint: (s.imageFiles && s.imageFiles.length)
        ? (s.imageFiles.length + " ta rasm tanlandi — tahlilga tayyor")
        : "JPG, PNG, WEBP · bosing va rasm tanlang",
      imageBtn: s.aiLoading ? "Tahlil qilinmoqda…" : "Rasm bo'yicha aniqlash",
      excelDisp: s.excelName || "Excel fayl tanlash",
      excelHint: s.excelName
        ? (s.excelRows != null ? (s.excelRows + " qator topildi") : "Tanlandi — bosing: Davom etish")
        : "Bosing va .xlsx / .csv faylni tanlang",
      excelBtn: s.aiLoading ? "Tahlil qilinmoqda…" : "Tahlil qilish",
      docDisp: s.docName || "",
      h: {
        onSearch: function (e) { runSearch(e.target.value); },
        openCatalog: openCatalog, catSearch: catSearch, catBack: catBack,
        onProductName: function (e) { setSilent({ productName: e.target.value }); },
        onProductDesc: function (e) { setSilent({ productDesc: e.target.value }); },
        onMaterial: function (e) { setSilent({ material: e.target.value }); },
        onUsage: function (e) { setSilent({ usage: e.target.value }); },
        onFeature: function (e) { setSilent({ feature: e.target.value }); },
        runAI: runAI, genQuestions: genQuestions, runImageAI: runImageAI, runExcelAI: runExcelAI,
        pickImage: pickImage, pickExcel: pickExcel, pickDoc: pickDoc, downloadTemplate: downloadTemplate,
        back: back, nextOnb: nextOnb,
        onCountryInput: function (e) { setState({ originText: e.target.value, originCountry: matchCountry(e.target.value) }); },
        detectCountry: detectCountryAI,
        certNone: function () { setState({ certType: "none" }); },
        certOrigin: function () { setState({ certType: "origin" }); },
        certSt1: function () { setState({ certType: "st1" }); },
        toggleNote: function () { setState(function (p) { return { noteOpen: !p.noteOpen }; }); },
        splash: go("splash"), login: go("login"), sms: go("sms"), onb: go("onb"), dash: go("dash"),
        tezkor: go("tezkor"), new: go("new"), product: go("product"), image: go("image"), excel: go("excel"),
        hujjat: go("hujjat"), ai: go("ai"), tiftn: go("tiftn"), alt: go("alt"), value: go("value"),
        pay: go("pay"), permit: go("permit"), risk: go("risk"), final: go("final"), profile: go("profile"),
        help: go("help"), tariffs: go("tariffs"), hisob: go("hisob"), saqlangan: go("saqlangan"),
        onInvoice: num("invoice"), onTransport: num("transport"), onInsurance: num("insurance"),
        onOther: num("other"),
        // manual rate edit switches the source off "auto" so CBU won't overwrite it
        onRate: function (e) {
          var v = parseFloat(String(e.target.value).replace(/[^0-9.]/g, "")) || 0;
          setState({ rate: v, rateAuto: false, rateError: false });
        },
        // re-enable auto and re-fetch the Central Bank rate
        refreshRate: function () { setState({ rateAuto: true }); initRate(); }
      }
    };
  }

  /* ---------------- Template engine ---------------- */
  var EXPR_CACHE = {};
  function evalExpr(expr, scope) {
    var fn = EXPR_CACHE[expr];
    if (!fn) {
      try { fn = EXPR_CACHE[expr] = new Function("$", "with($){ return (" + expr + "); }"); }
      catch (e) { EXPR_CACHE[expr] = function () { return undefined; }; return undefined; }
    }
    try { return fn(scope); } catch (e) { return undefined; }
  }

  function stripBraces(s) {
    if (s == null) return "";
    var m = /^\s*\{\{([\s\S]*?)\}\}\s*$/.exec(s);
    return m ? m[1].trim() : s.trim();
  }

  function interpolate(str, scope) {
    if (str.indexOf("{{") === -1) return str;
    return str.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, function (_, expr) {
      var v = evalExpr(expr, scope);
      return v == null ? "" : String(v);
    });
  }

  var EVENT_ATTRS = { onclick: "click", oninput: "input", onchange: "change", onsubmit: "submit" };

  function renderNodes(nodeList, scope, out) {
    for (var i = 0; i < nodeList.length; i++) {
      renderNode(nodeList[i], scope, out);
    }
  }

  function renderNode(node, scope, out) {
    // text
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interpolate(node.nodeValue, scope)));
      return;
    }
    // comment / other
    if (node.nodeType !== 1) return;

    var tag = node.localName;

    if (tag === "sc-if") {
      if (evalExpr(stripBraces(node.getAttribute("value")), scope)) {
        renderNodes(node.childNodes, scope, out);
      }
      return;
    }

    if (tag === "sc-for") {
      var list = evalExpr(stripBraces(node.getAttribute("list")), scope) || [];
      var as = node.getAttribute("as") || "item";
      for (var k = 0; k < list.length; k++) {
        var child = Object.create(scope);
        child[as] = list[k];
        child[as + "_index"] = k;
        renderNodes(node.childNodes, child, out);
      }
      return;
    }

    // regular element (preserve namespace so SVG renders correctly)
    var el = document.createElementNS(node.namespaceURI, node.localName);
    var attrs = node.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name, value = attrs[a].value;
      var evt = EVENT_ATTRS[name];
      if (evt) {
        var fn = evalExpr(stripBraces(value), scope);
        if (typeof fn === "function") el.addEventListener(evt, fn);
        if (name === "oninput") el.setAttribute("data-bind-key", stripBraces(value));
        continue;
      }
      el.setAttribute(name, interpolate(value, scope));
    }
    renderNodes(node.childNodes, scope, el);

    // keep controlled inputs in sync as a DOM property too
    // (select needs this after its <option>s are appended, to reflect selection)
    if ((node.localName === "input" || node.localName === "select" || node.localName === "textarea")
        && el.hasAttribute("value")) {
      el.value = el.getAttribute("value");
    }
    out.appendChild(el);
  }

  /* ---------------- Mount & render loop ---------------- */
  var root, template, lastScreen = null;

  function render() {
    // remember focus so number inputs don't lose it on re-render
    var active = document.activeElement;
    var focusKey = (active && active.getAttribute) ? active.getAttribute("data-bind-key") : null;

    var vals = renderVals();
    var frag = document.createDocumentFragment();
    renderNodes(template.childNodes, vals, frag);
    root.textContent = "";
    root.appendChild(frag);

    // subtle fade when the screen changes
    if (state.screen !== lastScreen) {
      var screenEl = root.querySelector("[data-screen-label]");
      if (screenEl) { screenEl.classList.add("dk-anim"); }
      lastScreen = state.screen;
    }

    // restore focus
    if (focusKey) {
      var again = root.querySelector('[data-bind-key="' + focusKey.replace(/"/g, '\\"') + '"]');
      if (again) {
        again.focus();
        // place the caret at the end — the value is reformatted each render,
        // so end-of-field is the natural, drift-free position for amount inputs
        try { var pos = again.value.length; again.setSelectionRange(pos, pos); } catch (e) {}
      }
    }
  }

  function init() {
    root = document.getElementById("app");
    var tplEl = document.getElementById("app-tpl");
    template = tplEl.content || tplEl;
    render();
    initRate(); // pull the live USD rate from the Central Bank
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
