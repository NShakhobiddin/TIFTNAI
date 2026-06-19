/* ============================================================
   Dekla AI — runtime
   A tiny template engine that renders the design's markup
   (sc-if / sc-for / {{ }} bindings) driven by the app logic.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- App state & logic ---------------- */
  var state = {
    screen: "splash", stack: [], onb: 0, cert: false,
    invoice: 10000, transport: 800, insurance: 200, other: 150, rate: 12600,
    q: "", results: [], selected: null, tiftnLoading: false
  };

  function setState(patch) {
    var p = (typeof patch === "function") ? patch(state) : patch;
    Object.assign(state, p);
    render();
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
    setState(function (p) { return { selected: sel, screen: "tiftn", stack: p.stack.concat([p.screen]) }; });
  }

  function fmt(n) {
    return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function fmtUsd(n) {
    var f = (Number(n) || 0).toFixed(2);
    var p = f.split(".");
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + p[1];
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

    var cipUsd = (s.invoice || 0) + (s.transport || 0) + (s.insurance || 0) + (s.other || 0);
    var cipUzs = cipUsd * (s.rate || 0);
    var boj = s.cert ? 0 : cipUzs * 0.05;
    var qqs = cipUzs * 0.15, aksiz = 0, yigim = cipUzs * 0.003, rasmiy = cipUzs * 0.001;
    var jamiUzs = boj + qqs + aksiz + yigim + rasmiy;
    var payments = [
      { label: "Bojxona boji", rate: s.cert ? "0%" : "5%", uzs: fmt(boj) },
      { label: "QQS", rate: "15%", uzs: fmt(qqs) },
      { label: "Aksiz", rate: "0%", uzs: "0" },
      { label: "Bojxona yig'imi", rate: "0.3%", uzs: fmt(yigim) },
      { label: "Rasmiylashtirish yig'imi", rate: "0.1%", uzs: fmt(rasmiy) }
    ];

    var sc = s.screen;
    var navColor = function (t) { return sc === t ? "#14284c" : "#9aa4b6"; };
    var dot = function (i) { return s.onb === i ? "#1ca354" : "#cfd7e3"; };

    // ---- TIFTN search results (with per-row pick handlers) ----
    var pickOf = function (code) { return function () { selectCode(code); }; };
    var results = (s.results || []).map(function (r) {
      return { code: r.code, name: r.name, path: r.path, unit: r.unit || "—",
        chapterTitle: r.chapterTitle || "", pick: pickOf(r.code) };
    });
    var hasQuery = !!(s.q && s.q.trim());

    // ---- selected code (TIFTN result screen) ----
    var sel = s.selected;
    var selCode = sel ? sel.code : "8471.30.000 0";
    var selName = sel ? sel.name : "Avtomatik ma'lumotlarni qayta ishlovchi mashinalar";
    var selDesc = sel
      ? (sel.name + (sel.chapterTitle ? " · " + sel.chapterTitle : ""))
      : "Avtomatik ma'lumotlarni qayta ishlovchi mashinalar; ularning bloklari; magnit yoki optik o'quv qurilmalari.";
    var selUnit = sel ? (sel.unit || "—") : "—";

    // ---- alternative codes (real siblings under the same heading) ----
    var altPct = ["94%", "78%", "64%", "52%", "43%"];
    var altBg = ["#e6f6ec", "#e6f6ec", "#fef0e0", "#fef0e0", "#fdeaea"];
    var altColor = ["#1a8c44", "#1a8c44", "#c9821a", "#c9821a", "#d84a4a"];
    var alts = [];
    if (sel && tiftnReady()) {
      var sibs = window.TifTn.siblings(sel.code, 4);
      alts.push({ code: sel.code, name: sel.name, pct: "94%", bg: "#e6f6ec", color: "#1a8c44",
        rowBg: "#f3fbf6", pick: pickOf(sel.code) });
      for (var ai = 0; ai < sibs.length; ai++) {
        alts.push({ code: sibs[ai].code, name: sibs[ai].name, pct: altPct[ai + 1] || "40%",
          bg: altBg[ai + 1] || "#fdeaea", color: altColor[ai + 1] || "#d84a4a",
          rowBg: "#ffffff", pick: pickOf(sibs[ai].code) });
      }
    }

    return {
      isSplash: sc === "splash", isLogin: sc === "login", isSms: sc === "sms", isOnb: sc === "onb",
      isDash: sc === "dash", isTezkor: sc === "tezkor", isNew: sc === "new", isProduct: sc === "product",
      isImage: sc === "image", isExcel: sc === "excel", isHujjat: sc === "hujjat", isAi: sc === "ai",
      isTiftn: sc === "tiftn", isAlt: sc === "alt", isValue: sc === "value", isPay: sc === "pay",
      isPermit: sc === "permit", isRisk: sc === "risk", isFinal: sc === "final", isProfile: sc === "profile",
      isHelp: sc === "help", isTariffs: sc === "tariffs", isHisob: sc === "hisob", isSaqlangan: sc === "saqlangan",
      showLogoHeader: ["product", "image", "excel", "hujjat", "ai", "tiftn", "alt", "value", "pay", "permit", "risk", "final", "profile"].indexOf(sc) !== -1,
      showBottomNav: ["dash", "hisob", "saqlangan", "profile"].indexOf(sc) !== -1,
      screenBg: sc === "splash" ? "#0e2545" : "#f4f6fb",
      statusColor: sc === "splash" ? "#ffffff" : "#14284c",
      onb0: s.onb === 0, onb1: s.onb === 1, onb2: s.onb === 2,
      onbBtn: s.onb >= 2 ? "Boshlash" : "Keyingi",
      onbDot0: dot(0), onbDot1: dot(1), onbDot2: dot(2),
      cert: s.cert,
      certLabel: s.cert ? "ST-1 sertifikat: mavjud (boj 0%)" : "ST-1 sertifikat: yo'q",
      certToggleBg: s.cert ? "#1ca354" : "#cfd7e3",
      certToggleJustify: s.cert ? "flex-end" : "flex-start",
      invoice: s.invoice, transport: s.transport, insurance: s.insurance, other: s.other, rate: s.rate,
      cipUsdStr: fmtUsd(cipUsd), cipUzsStr: fmt(cipUzs),
      jamiUzsStr: fmt(jamiUzs), jamiUsdStr: fmtUsd(jamiUzs / (s.rate || 1)),
      payments: payments,
      navAsosiy: navColor("dash"), navHisob: navColor("hisob"), navSaqlangan: navColor("saqlangan"), navProfil: navColor("profile"),
      // TIFTN search
      q: s.q || "", results: results, hasResults: results.length > 0,
      tiftnLoading: s.tiftnLoading, showRecents: !hasQuery && !s.tiftnLoading,
      noResults: hasQuery && !s.tiftnLoading && results.length === 0,
      selCode: selCode, selName: selName, selDesc: selDesc, selUnit: selUnit,
      alts: alts, hasAlts: alts.length > 0,
      h: {
        onSearch: function (e) { runSearch(e.target.value); },
        back: back, nextOnb: nextOnb, toggleCert: function () { setState(function (p) { return { cert: !p.cert }; }); },
        splash: go("splash"), login: go("login"), sms: go("sms"), onb: go("onb"), dash: go("dash"),
        tezkor: go("tezkor"), new: go("new"), product: go("product"), image: go("image"), excel: go("excel"),
        hujjat: go("hujjat"), ai: go("ai"), tiftn: go("tiftn"), alt: go("alt"), value: go("value"),
        pay: go("pay"), permit: go("permit"), risk: go("risk"), final: go("final"), profile: go("profile"),
        help: go("help"), tariffs: go("tariffs"), hisob: go("hisob"), saqlangan: go("saqlangan"),
        onInvoice: num("invoice"), onTransport: num("transport"), onInsurance: num("insurance"),
        onOther: num("other"), onRate: num("rate")
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
    if (node.localName === "input" && el.hasAttribute("value")) {
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
