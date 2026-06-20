/* ============================================================
   ai.js — Dekla AI: Qwen-powered TIFTN classification
   Uses Qwen's OpenAI-compatible Chat Completions API.
   The browser calls YOUR Cloudflare Worker proxy (not DashScope
   directly); the Worker holds DASHSCOPE_API_KEY as a secret and
   forwards the request — so the key never reaches the browser.

   Configure the endpoint in index.html:
     <script>window.DEKLA_AI_ENDPOINT = "https://your-worker.workers.dev";</script>
   ============================================================ */
(function () {
  "use strict";

  var MODEL = "qwen-max"; // qwen-max | qwen-plus | qwen-turbo | qwen3-max ...

  function endpoint() { return (window.DEKLA_AI_ENDPOINT || "").trim(); }
  function configured() {
    var e = endpoint();
    return !!e && e.indexOf("YOUR-WORKER") === -1;
  }

  // Required output shape (described in the prompt; Qwen returns JSON).
  var SHAPE =
    '{"code":"<tanlangan kod>","confidence":<0-100>,"reasoning":"<o\'zbekcha asoslash>",' +
    '"alternatives":[{"code":"<kod>","confidence":<0-100>,"note":"<farqlovchi belgi>"}]}';

  function systemPrompt() {
    return "Sen O'zbekiston bojxonasi uchun TIF TN (TIFTN) tovar kodlarini tasniflovchi mutaxassissan. " +
      "Javobni FAQAT quyidagi ko'rinishdagi JSON sifatida qaytar (boshqa matnsiz, kod bloklarisiz): " + SHAPE;
  }

  function userPrompt(product, candidates, opi) {
    var cand = candidates.map(function (c, i) {
      return (i + 1) + ". " + c.code + " — " + c.name +
        (c.chapterTitle ? " | guruh: " + c.chapterTitle : "") +
        (c.path ? " | kontekst: " + c.path : "");
    }).join("\n");
    var opiText = (opi || []).map(function (o) { return o.rule + ") " + o.text; }).join("\n\n");

    return [
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
      "VAZIFA: nomzodlardan tovarga eng mos keladigan BITTA TIFTN kodini OPI qoidalari (ayniqsa 1 va " +
      "3(a)/3(b)/3(v)) asosida tanla. 'code' aynan ro'yxatdagi kod bilan bir xil bo'lsin. 'confidence' — " +
      "0..100. 'reasoning' — o'zbekcha (lotin), 1-2 jumla. 'alternatives' — ro'yxatdan 2-4 ta muqobil " +
      "kod (code/confidence/note). Faqat berilgan nomzod kodlardan foydalan. Javob JSON bo'lsin."
    ].join("\n");
  }

  function classify(product, candidates, opi) {
    if (!configured()) return Promise.reject(new Error("AI server (Cloudflare Worker) sozlanmagan."));
    if (!candidates || !candidates.length) return Promise.reject(new Error("Nomzod kodlar topilmadi. Tovar nomini aniqroq kiriting."));

    // OpenAI-compatible Chat Completions body — the Worker injects the key & forwards it.
    var body = {
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(product, candidates, opi) }
      ]
    };

    return fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var msg = (data && data.error && (data.error.message || data.error)) || ("HTTP " + r.status);
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
        return data;
      });
    }).then(function (data) {
      var choice = data.choices && data.choices[0];
      var content = choice && choice.message && choice.message.content;
      if (!content) throw new Error("Modeldan bo'sh javob keldi.");
      // strip ```json fences if the model added them
      var txt = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      var parsed;
      try { parsed = JSON.parse(txt); } catch (e) { throw new Error("Javobni o'qib bo'lmadi."); }
      return parsed;
    });
  }

  window.DeklaAI = { classify: classify, configured: configured, endpoint: endpoint, model: MODEL };
})();
