/* ============================================================
   tiftn.js — client-side TIFTN database (PQ-181, 2025)
   Lazy-loads a compact index + meta, supports Latin & Cyrillic
   search via transliteration, code lookup, notes / exclusions / OPI.
   ============================================================ */
(function () {
  "use strict";

  var DATA_DIR = "assets/data/";
  var idx = null;     // { seg, u, ch, e:[ [code, unitIdx, chapter, [segIdx..]] ] }
  var meta = null;    // { sections, chapters, opi, units_ref }
  var hay = null;     // per-entry normalized latin haystack
  var segLat = null;  // per-segment normalized latin
  var byCode = null;  // codeNorm -> entry index
  var loadingPromise = null;

  /* ---- Cyrillic (Uzbek) -> Latin ---- */
  var MAP = {
    "а":"a","б":"b","в":"v","г":"g","ғ":"g'","д":"d","е":"e","ё":"yo","ж":"j",
    "з":"z","и":"i","й":"y","к":"k","қ":"q","л":"l","м":"m","н":"n","о":"o",
    "п":"p","р":"r","с":"s","т":"t","у":"u","ў":"o'","ф":"f","х":"x","ҳ":"h",
    "ц":"ts","ч":"ch","ш":"sh","щ":"shch","ъ":"'","ь":"","ы":"i","э":"e",
    "ю":"yu","я":"ya","ј":"j","һ":"h"
  };
  function translit(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i], l = c.toLowerCase();
      out += MAP.hasOwnProperty(l) ? MAP[l] : l;
    }
    return out;
  }
  // normalize text for matching: translit + drop apostrophes + collapse spaces
  function norm(s) {
    return translit(s).replace(/['`ʻʼ’ʹ]/g, "").replace(/\s+/g, " ").trim();
  }
  function digits(s) { return s.replace(/\D/g, ""); }

  /* ---- loading (via <script> for file:// + http compatibility) ---- */
  function loadScript(name, globalName) {
    return new Promise(function (resolve, reject) {
      if (window[globalName]) return resolve(window[globalName]);
      var s = document.createElement("script");
      s.src = DATA_DIR + name;
      s.onload = function () {
        if (window[globalName]) resolve(window[globalName]);
        else reject(new Error("Loaded but missing " + globalName));
      };
      s.onerror = function () { reject(new Error("Failed to load " + name)); };
      document.head.appendChild(s);
    });
  }

  function load() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = Promise.all([
      loadScript("tiftn_index.js", "__TIFTN_INDEX__"),
      loadScript("tiftn_meta.js", "__TIFTN_META__")
    ]).then(function (res) {
        idx = res[0]; meta = res[1];
        // precompute per-segment latin
        segLat = new Array(idx.seg.length);
        for (var i = 0; i < idx.seg.length; i++) segLat[i] = norm(idx.seg[i]);
        // precompute per-entry haystack + code map
        hay = new Array(idx.e.length);
        byCode = Object.create(null);
        for (var j = 0; j < idx.e.length; j++) {
          var e = idx.e[j], p = e[3], parts = "";
          for (var k = 0; k < p.length; k++) parts += (k ? " " : "") + segLat[p[k]];
          hay[j] = parts;
          byCode[digits(e[0])] = j;
        }
        return true;
      });
    return loadingPromise;
  }

  function isReady() { return idx !== null && hay !== null; }

  /* ---- helpers ---- */
  function entryName(e) { var p = e[3]; return idx.seg[p[p.length - 1]]; }
  function entryPath(e) {
    var p = e[3], out = [];
    for (var i = 0; i < p.length; i++) out.push(idx.seg[p[i]]);
    return out;
  }
  function unitOf(e) { return idx.u[e[1]] || ""; }
  function chapterTitle(ch) { return (idx.ch && idx.ch[ch]) || ""; }

  function shape(e, j) {
    return {
      code: e[0],
      name: entryName(e),
      path: entryPath(e).join(" › "),
      pathArr: entryPath(e),
      unit: unitOf(e),
      chapter: e[2],
      chapterTitle: chapterTitle(e[2]),
      heading: digits(e[0]).slice(0, 4),
      terminal: e[4] === 1,
      _i: j
    };
  }

  /* ---- search ----
     Token-aware: a multi-word query like "paxta tampon" matches entries that
     contain ANY of the words, ranked by how many words hit (name > path), with
     bonuses for the whole phrase and for code-prefix matches. This makes free
     text product names (the common case for AI classification) actually work. */
  var STOP = { "va": 1, "uchun": 1, "bilan": 1, "ham": 1, "yoki": 1, "dan": 1, "ning": 1, "lar": 1 };

  // Synonyms: everyday / colloquial words → the vocabulary the nomenclature
  // actually uses. Keys & values are in normalized (latin, apostrophe-free)
  // form. This is what lets "noutbuk", "muzlatgich", "konditsioner" etc. find
  // the right heading instead of returning nothing.
  var SYN = {
    // computing (8471)
    "noutbuk": "portativ hisoblash mashina", "laptop": "portativ hisoblash mashina",
    "planshet": "portativ hisoblash mashina", "kompyuter": "hisoblash mashina malumotlarni qayta ishlovchi",
    "komputer": "hisoblash mashina malumotlarni qayta ishlovchi", "kompyuter": "hisoblash mashina malumotlarni qayta ishlovchi",
    "monoblok": "hisoblash mashina", "klaviatura": "kiritish qurilma", "printer": "bosib chiqaruvchi",
    // phones / comms (8517)
    "smartfon": "telefon apparat uyali", "smartphone": "telefon apparat uyali",
    "telefon": "telefon apparat uyali", "iphone": "telefon apparat uyali", "aymfon": "telefon apparat uyali",
    "router": "tarmoq apparat", "modem": "tarmoq apparat",
    // tv / display (8528)
    "televizor": "televizion qabul monitor", "tv": "televizion qabul", "monitor": "monitor proektor", "displey": "monitor",
    // appliances
    "muzlatgich": "sovutgich muzlatkich", "xolodilnik": "sovutgich muzlatkich", "holodilnik": "sovutgich muzlatkich",
    "konditsioner": "konditsiya havoni sovutish", "kondisioner": "konditsiya havoni sovutish", "kondicioner": "konditsiya havoni sovutish",
    "changyutgich": "chang yutuvchi", "pilesos": "chang yutuvchi",
    // materials
    "plastik": "plastmassa", "plastmassa": "plastik", "rezina": "kauchuk", "kauchuk": "rezina",
    "shisha": "oyna", "charm": "teri", "paxta": "paxta tola"
  };

  function search(query, limit) {
    if (!isReady() || !query) return [];
    limit = limit || 30;
    var qn = norm(query);
    var qd = digits(query);
    var useDigits = qd.length >= 3;
    var tokens = qn.split(/\s+/).filter(function (t) { return t.length >= 2 && !STOP[t]; });
    if (!tokens.length && qn) tokens = [qn];

    // weighted term list: core words (w=1) + synonym expansions (w=.6)
    var terms = [];
    for (var ci = 0; ci < tokens.length; ci++) terms.push({ s: tokens[ci], w: 1 });
    for (var si = 0; si < tokens.length; si++) {
      if (SYN[tokens[si]]) SYN[tokens[si]].split(" ").forEach(function (w) { if (w) terms.push({ s: w, w: 0.6 }); });
    }

    var res = [];
    for (var j = 0; j < idx.e.length; j++) {
      var e = idx.e[j], cd = digits(e[0]), score = 0;
      var nm = norm(entryName(e)), hayj = hay[j];

      if (useDigits) {
        if (cd.indexOf(qd) === 0) score += 1000;          // code prefix — strongest
        else if (cd.indexOf(qd) !== -1) score += 220;     // code appears
      }
      if (qn) {
        if (nm.indexOf(qn) !== -1) score += 420;          // whole phrase in name
        else if (hayj.indexOf(qn) !== -1) score += 150;   // whole phrase in path
      }

      var hits = 0, coreHits = 0;
      for (var t = 0; t < terms.length; t++) {
        var tok = terms[t].s, wt = terms[t].w, got = 0;
        if (nm.indexOf(tok) !== -1) { score += 60 * wt; got = 1; }
        else if (hayj.indexOf(tok) !== -1) { score += 24 * wt; got = 1; }
        else if (tok.length >= 6) {
          // stem match: catches morphological variants (plastik→plast, metalldan→metall)
          var stem = tok.slice(0, 5);
          if (nm.indexOf(stem) !== -1) { score += 34 * wt; got = 1; }
          else if (hayj.indexOf(stem) !== -1) { score += 14 * wt; got = 1; }
        }
        if (got) { hits++; if (wt === 1) coreHits++; }
      }
      // need a real signal: at least one word hit, or a code match
      if (hits === 0 && !(useDigits && score > 0)) continue;
      if (tokens.length > 1 && coreHits === tokens.length) score += 120; // all core words matched
      if (e[4] === 1) score += 8;                          // nudge terminal codes up

      res.push([j, score, nm.length]);
    }

    res.sort(function (a, b) {
      if (b[1] !== a[1]) return b[1] - a[1];               // higher score first
      if (a[2] !== b[2]) return a[2] - b[2];               // shorter name first
      return digits(idx.e[a[0]][0]) < digits(idx.e[b[0]][0]) ? -1 : 1;
    });
    var out = [];
    for (var i = 0; i < res.length && i < limit; i++) out.push(shape(idx.e[res[i][0]], res[i][0]));
    return out;
  }

  function get(code) {
    if (!isReady()) return null;
    var j = byCode[digits(code)];
    if (j == null) return null;
    var o = shape(idx.e[j], j);
    var ch = meta && meta.chapters[String(o.chapter)];
    o.section = ch ? ch.section : "";
    o.exclusions = applicableNotes(code).exclusions;
    return o;
  }

  function applicableNotes(code) {
    var empty = { sectionNotes: [], chapterNotes: [], chapterExclusions: [], sectionExclusions: [], exclusions: [] };
    if (!isReady() || !meta) return empty;
    var j = byCode[digits(code)];
    if (j == null) return empty;
    var chNum = String(idx.e[j][2]);
    var ch = meta.chapters[chNum];
    if (!ch) return empty;
    var sec = meta.sections[ch.section] || { notes: [], excl: [] };
    return {
      sectionNotes: sec.notes || [],
      chapterNotes: ch.notes || [],
      chapterExclusions: ch.excl || [],
      sectionExclusions: sec.excl || [],
      exclusions: (sec.excl || []).concat(ch.excl || [])
    };
  }

  // other terminal codes under the same 4-digit heading (real alternatives)
  function siblings(code, limit) {
    if (!isReady()) return [];
    limit = limit || 5;
    var self = digits(code), head = self.slice(0, 4), out = [];
    for (var j = 0; j < idx.e.length && out.length < limit; j++) {
      var e = idx.e[j], cd = digits(e[0]);
      if (e[4] === 1 && cd.slice(0, 4) === head && cd !== self) out.push(shape(e, j));
    }
    return out;
  }

  function opi() { return meta ? meta.opi : []; }
  function units() { return meta ? meta.units_ref : []; }
  function count() { return idx ? idx.e.length : 0; }

  // Case-preserving Cyrillic→Latin for DISPLAY (translit() lowercases for matching).
  function translitDisplay(s) {
    if (s == null) return "";
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i], l = c.toLowerCase(), has = MAP.hasOwnProperty(l);
      var m = has ? MAP[l] : c;
      if (has && c !== l) m = m.charAt(0).toUpperCase() + m.slice(1); // keep capitals
      out += m;
    }
    return out;
  }

  // Map any code to a 10-digit (terminal/national) code: itself if already
  // terminal, otherwise the first terminal code under the same prefix.
  function bestTerminal(code) {
    if (!isReady()) return code;
    var d = digits(code);
    var j = byCode[d];
    if (j != null && idx.e[j][4] === 1) return code;
    for (var k = 0; k < idx.e.length; k++) {
      var e = idx.e[k];
      if (e[4] === 1 && digits(e[0]).indexOf(d) === 0) return e[0];
    }
    return code;
  }

  // ---- hierarchy browsing (catalog) ----
  // Top level: all chapters (guruhlar).
  function chapters() {
    if (!isReady() || !idx.ch) return [];
    var out = [];
    for (var key in idx.ch) {
      if (!Object.prototype.hasOwnProperty.call(idx.ch, key)) continue;
      if (!idx.ch[key]) continue;
      var n = parseInt(key, 10);
      if (!n && n !== 0) continue;
      out.push({ code: (n < 10 ? "0" + n : "" + n), name: idx.ch[key], chapter: n, terminal: false });
    }
    out.sort(function (a, b) { return a.chapter - b.chapter; });
    return out;
  }

  // Immediate children of a code prefix (next level down the tree).
  function children(prefix) {
    if (!isReady()) return [];
    prefix = digits(prefix || "");
    var set = Object.create(null), list = [];
    for (var j = 0; j < idx.e.length; j++) {
      var cd = digits(idx.e[j][0]);
      if (cd.length > prefix.length && cd.indexOf(prefix) === 0) { set[cd] = 1; list.push(j); }
    }
    var out = [];
    for (var k = 0; k < list.length; k++) {
      var ej = list[k], c = digits(idx.e[ej][0]), immediate = true;
      for (var p = prefix.length + 1; p < c.length; p++) {
        if (set[c.slice(0, p)]) { immediate = false; break; }
      }
      if (immediate) out.push(shape(idx.e[ej], ej));
    }
    out.sort(function (a, b) { return digits(a.code) < digits(b.code) ? -1 : 1; });
    return out;
  }

  window.TifTn = {
    load: load, isReady: isReady, translit: translit, translitDisplay: translitDisplay, norm: norm,
    search: search, get: get, siblings: siblings, bestTerminal: bestTerminal,
    chapters: chapters, children: children,
    applicableNotes: applicableNotes, opi: opi, units: units, count: count
  };
})();
