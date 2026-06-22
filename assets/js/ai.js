/* ============================================================
   ai.js — Dekla AI: Claude-powered TIFTN classification
   Uses Anthropic's native Messages API (https://docs.claude.com).
   The browser calls YOUR Cloudflare Worker proxy (not Anthropic
   directly); the Worker holds ANTHROPIC_API_KEY as a secret and
   forwards the request — so the key never reaches the browser.

   Configure the endpoint in index.html:
     <script>window.DEKLA_AI_ENDPOINT = "https://your-worker.workers.dev";</script>
   ============================================================ */
(function () {
  "use strict";

  // Default model. Override on the Worker via the CLAUDE_MODEL var
  // (e.g. claude-haiku-4-5 for cheaper/faster runs).
  var MODEL = "claude-opus-4-8";

  function endpoint() { return (window.DEKLA_AI_ENDPOINT || "").trim(); }
  function configured() {
    var e = endpoint();
    return !!e && e.indexOf("YOUR-WORKER") === -1;
  }

  // ---- Structured-output schemas (Anthropic guarantees valid JSON) ----
  var RESULT_SCHEMA = {
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

  var VISION_SCHEMA = {
    type: "object",
    properties: { name: { type: "string" }, keywords: { type: "string" } },
    required: ["name", "keywords"],
    additionalProperties: false
  };

  function systemPrompt() {
    return "Sen O'zbekiston bojxonasi uchun TIF TN (TIFTN) tovar kodlarini tasniflovchi mutaxassissan. " +
      "Sizga nomzod kodlar ro'yxati beriladi — faqat shu ro'yxatdan tovarga eng mos BITTA kodni tanla, " +
      "o'ylab kod topma. Tanlovni TIF TN talqin qoidalari (OPI), ayniqsa 1 va 3(a)/3(b)/3(v) asosida amalga oshir.";
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
      "VAZIFA: nomzodlardan tovarga eng mos keladigan BITTA TIFTN kodini tanla. 'code' aynan " +
      "ro'yxatdagi kod bilan bir xil bo'lsin. 'confidence' — 0..100. 'reasoning' — o'zbekcha (lotin), " +
      "1-2 jumla. 'alternatives' — ro'yxatdan 2-4 ta muqobil kod (code/confidence/note). Faqat berilgan " +
      "nomzod kodlardan foydalan."
    ].join("\n");
  }

  // First text block of an Anthropic Messages response.
  function firstText(data) {
    var c = data && data.content;
    if (Array.isArray(c)) {
      for (var i = 0; i < c.length; i++) {
        if (c[i] && c[i].type === "text" && c[i].text) return c[i].text;
      }
    }
    return "";
  }

  // Tolerant JSON reader (structured outputs return clean JSON; this is a safety net).
  function extractJson(s) {
    if (!s) return null;
    var t = String(s).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(t); } catch (e) {}
    var i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
    return null;
  }

  // POST a Messages body to the Worker and return the parsed Anthropic response.
  function postMessages(body) {
    return fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).catch(function (e) {
      console.error("[DeklaAI] tarmoq/CORS xatosi:", e);
      throw new Error("Server bilan bog'lanib bo'lmadi (tarmoq yoki CORS). Worker manzili va ALLOWED_ORIGIN ni tekshiring.");
    }).then(function (r) {
      return r.text().then(function (raw) {
        var data;
        try { data = JSON.parse(raw); } catch (e) { data = null; }
        if (!r.ok) {
          var msg = (data && data.error && (data.error.message || data.error)) || raw || ("HTTP " + r.status);
          console.error("[DeklaAI] server xatosi", r.status, raw);
          throw new Error("HTTP " + r.status + ": " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
        }
        if (data && data.stop_reason === "refusal") {
          console.error("[DeklaAI] model rad etdi:", data.stop_details);
          throw new Error("Model so'rovni rad etdi.");
        }
        return data;
      });
    });
  }

  function classify(product, candidates, opi) {
    if (!configured()) return Promise.reject(new Error("AI server (Cloudflare Worker) sozlanmagan."));
    if (!candidates || !candidates.length) return Promise.reject(new Error("Nomzod kodlar topilmadi. Tovar nomini aniqroq kiriting."));

    var body = {
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(product, candidates, opi) }],
      output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } }
    };

    return postMessages(body).then(function (data) {
      var parsed = extractJson(firstText(data));
      if (!parsed || !parsed.code) {
        console.error("[DeklaAI] JSON o'qib bo'lmadi. Model javobi:", data);
        throw new Error("Model javobini o'qib bo'lmadi.");
      }
      return parsed;
    });
  }

  /* ---- AI-generated clarifying questions (no fixed template) ---- */
  var QUESTIONS_SCHEMA = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } }
          },
          required: ["question", "options"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  };

  function questionsPrompt(product, candidates) {
    var cand = (candidates || []).slice(0, 15).map(function (c, i) {
      return (i + 1) + ". " + c.code + " — " + c.name;
    }).join("\n");
    return [
      "TOVAR: " + (product.name || product.keywords || "—") + (product.desc ? " (" + product.desc + ")" : ""),
      "",
      "Ushbu tovar uchun mumkin bo'lgan TIFTN nomzod kodlar:",
      cand,
      "",
      "VAZIFA: yuqoridagi nomzodlardan to'g'ri TIFTN kodini ajratish uchun foydalanuvchiga 2-4 ta qisqa, " +
      "ANIQ savol ber. Har bir savol AYNAN shu tovar va nomzod kodlar farqiga qarab bo'lsin (masalan material, " +
      "tarkibi, vazifasi, o'lchovi, quvvati — qaysi biri kodni farqlasa). Umumiy/shablon savol berma. " +
      "Har bir savolga 2-4 ta aniq variant ber. Savol va variantlar o'zbekcha (lotin alifbosida) bo'lsin."
    ].join("\n");
  }

  // Returns an array of {question, options[]}.
  function askQuestions(product, candidates) {
    if (!configured()) return Promise.reject(new Error("AI sozlanmagan."));
    var body = {
      model: MODEL,
      max_tokens: 700,
      system: "Sen O'zbekiston bojxonasi TIFTN tasnifi bo'yicha mutaxassissan. Tovarni to'g'ri tasniflash uchun aniqlovchi savollar tuzasan.",
      messages: [{ role: "user", content: questionsPrompt(product, candidates) }],
      output_config: { format: { type: "json_schema", schema: QUESTIONS_SCHEMA } }
    };
    return postMessages(body).then(function (data) {
      var parsed = extractJson(firstText(data)) || {};
      return (parsed.questions || []).filter(function (q) { return q && q.question && (q.options || []).length; });
    });
  }

  /* ---- image (vision) → product description ---- */
  function fileToImageBlock(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var url = String(fr.result || "");
        var comma = url.indexOf(",");
        var data = comma >= 0 ? url.slice(comma + 1) : url;
        var mt = (file.type && /^image\/(jpeg|png|gif|webp)$/.test(file.type)) ? file.type : "image/jpeg";
        resolve({ type: "image", source: { type: "base64", media_type: mt, data: data } });
      };
      fr.onerror = function () { reject(new Error("Rasmni o'qib bo'lmadi.")); };
      fr.readAsDataURL(file);
    });
  }

  // Look at the photo(s) and return {name, keywords} to feed the text classifier.
  function describeImage(files) {
    if (!configured()) return Promise.reject(new Error("AI server (Cloudflare Worker) sozlanmagan."));
    if (!files || !files.length) return Promise.reject(new Error("Rasm tanlanmagan."));

    var pics = [].slice.call(files).slice(0, 2);
    return Promise.all(pics.map(fileToImageBlock)).then(function (blocks) {
      var content = [{
        type: "text",
        text: "Rasm(lar)dagi asosiy tovarni aniqla. 'name' — tovarning qisqa nomi (o'zbekcha), " +
          "'keywords' — TIFTN qidiruvi uchun kalit so'zlar (o'zbekcha)."
      }].concat(blocks);

      var body = {
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: content }],
        output_config: { format: { type: "json_schema", schema: VISION_SCHEMA } }
      };

      return postMessages(body).then(function (data) {
        var parsed = extractJson(firstText(data)) || {};
        var name = parsed.name || parsed.keywords || "";
        if (!name) { console.error("[DeklaAI] rasm: nomi topilmadi:", data); throw new Error("Rasmdan tovar aniqlanmadi."); }
        return { name: name, keywords: parsed.keywords || name };
      });
    });
  }

  window.DeklaAI = {
    classify: classify, askQuestions: askQuestions, describeImage: describeImage,
    configured: configured, endpoint: endpoint, model: MODEL
  };
})();
