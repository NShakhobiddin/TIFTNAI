/* ============================================================
   ai.js — Dekla AI: Claude-powered TIFTN classification
   Static / no-backend: the user supplies their own Anthropic
   API key (stored in localStorage). The browser calls the
   Messages API directly using the direct-browser-access header.
   Structured output (output_config.format) guarantees the model
   returns a code chosen from the candidate list.
   ============================================================ */
(function () {
  "use strict";

  var API = "https://api.anthropic.com/v1/messages";
  var MODEL = "claude-opus-4-8";
  var KEY_STORE = "dekla_anthropic_key";

  function getKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
  function setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch (e) {} }
  function hasKey() { return !!getKey(); }

  // Structured-output schema — the model must return exactly this shape.
  var SCHEMA = {
    type: "object",
    properties: {
      code: { type: "string" },
      confidence: { type: "integer" },
      reasoning: { type: "string" },
      alternatives: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            confidence: { type: "integer" },
            note: { type: "string" }
          },
          required: ["code", "confidence", "note"],
          additionalProperties: false
        }
      }
    },
    required: ["code", "confidence", "reasoning", "alternatives"],
    additionalProperties: false
  };

  function buildPrompt(product, candidates, opi) {
    var cand = candidates.map(function (c, i) {
      return (i + 1) + ". " + c.code + " — " + c.name +
        (c.chapterTitle ? " | guruh: " + c.chapterTitle : "") +
        (c.path ? " | kontekst: " + c.path : "");
    }).join("\n");

    var opiText = (opi || []).map(function (o) { return o.rule + ") " + o.text; }).join("\n\n");

    return [
      "Sen O'zbekiston bojxonasi uchun TIF TN (TIFTN) tovar kodlarini tasniflovchi mutaxassissan.",
      "",
      "TOVAR MA'LUMOTI:",
      "Nomi: " + (product.name || "—"),
      "Tavsif: " + (product.desc || "—"),
      "Material: " + (product.material || "—"),
      "Ishlatilish sohasi: " + (product.usage || "—"),
      "",
      "NOMZOD KODLAR (faqat shu ro'yxatdan tanla, boshqa kod o'ylab topma):",
      cand,
      "",
      "TIF TN TALQIN ETISHNING ASOSIY QOIDALARI (OPI):",
      opiText,
      "",
      "VAZIFA: yuqoridagi nomzodlardan tovarga eng mos keladigan BITTA TIFTN kodini OPI qoidalari " +
      "(ayniqsa 1 va 3(a)/3(b)/3(v)) asosida tanla. Tanlangan 'code' aynan nomzodlar ro'yxatidagi " +
      "kod bilan bir xil bo'lsin. 'confidence' — 0..100 oralig'ida ishonch darajasi. 'reasoning' — " +
      "o'zbek tilida (lotin), 1-2 jumlali qisqa asoslash. 'alternatives' — ro'yxatdan 2-4 ta muqobil " +
      "kod, har biri code/confidence/note (o'zbekcha farqlovchi belgi) bilan. Faqat berilgan nomzod kodlardan foydalan."
    ].join("\n");
  }

  function classify(product, candidates, opi) {
    var key = getKey();
    if (!key) return Promise.reject(new Error("Anthropic API kaliti kiritilmagan."));
    if (!candidates || !candidates.length) return Promise.reject(new Error("Nomzod kodlar topilmadi. Tovar nomini aniqroq kiriting."));

    var body = {
      model: MODEL,
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: buildPrompt(product, candidates, opi) }]
    };

    return fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
          throw new Error(msg);
        }
        return data;
      });
    }).then(function (data) {
      if (data.stop_reason === "refusal") throw new Error("So'rov xavfsizlik sababli rad etildi.");
      var tb = (data.content || []).filter(function (b) { return b.type === "text"; })[0];
      if (!tb || !tb.text) throw new Error("Modeldan bo'sh javob keldi.");
      var parsed;
      try { parsed = JSON.parse(tb.text); } catch (e) { throw new Error("Javobni o'qib bo'lmadi."); }
      return parsed;
    });
  }

  window.DeklaAI = { getKey: getKey, setKey: setKey, hasKey: hasKey, classify: classify, model: MODEL };
})();
