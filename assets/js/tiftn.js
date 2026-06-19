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
      _i: j
    };
  }

  /* ---- search ---- */
  function search(query, limit) {
    if (!isReady() || !query) return [];
    limit = limit || 30;
    var q = norm(query);
    var qd = digits(query);
    var useDigits = qd.length >= 3;
    var res = [];
    for (var j = 0; j < idx.e.length; j++) {
      var e = idx.e[j], cd = digits(e[0]), score = -1;
      if (useDigits && cd.indexOf(qd) === 0) score = 0;                  // code prefix — best
      else if (q && norm(entryName(e)).indexOf(q) !== -1) score = 1;     // name match
      else if (q && hay[j].indexOf(q) !== -1) score = 2;                 // path/context match
      else if (useDigits && cd.indexOf(qd) !== -1) score = 3;            // code anywhere
      if (score >= 0) res.push([j, score]);
    }
    // by relevance score, then shorter name, then code order
    res.sort(function (a, b) {
      if (a[1] !== b[1]) return a[1] - b[1];
      var na = entryName(idx.e[a[0]]).length, nb = entryName(idx.e[b[0]]).length;
      if (na !== nb) return na - nb;
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
    var empty = { sectionNotes: [], chapterNotes: [], exclusions: [] };
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
      if (cd.slice(0, 4) === head && cd !== self) out.push(shape(e, j));
    }
    return out;
  }

  function opi() { return meta ? meta.opi : []; }
  function units() { return meta ? meta.units_ref : []; }
  function count() { return idx ? idx.e.length : 0; }

  window.TifTn = {
    load: load, isReady: isReady, translit: translit, norm: norm,
    search: search, get: get, siblings: siblings, applicableNotes: applicableNotes,
    opi: opi, units: units, count: count
  };
})();
