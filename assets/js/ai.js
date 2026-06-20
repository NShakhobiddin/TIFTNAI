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

  function extractJson(s) {
    if (!s) return null;
    var t = String(s).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(t); } catch (e) {}
    var i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
    return null;
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
    }).catch(function (e) {
      // network / CORS failure (TypeError: Failed to fetch)
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
        return data;
      });
    }).then(function (data) {
      var choice = data && data.choices && data.choices[0];
      var content = choice && choice.message && choice.message.content;
      if (!content) {
        console.error("[DeklaAI] kutilmagan javob:", data);
        throw new Error("Modeldan kutilmagan javob keldi.");
      }
      var parsed = extractJson(content);
      if (!parsed || !parsed.code) {
        console.error("[DeklaAI] JSON o'qib bo'lmadi. Model javobi:", content);
        throw new Error("Model javobini o'qib bo'lmadi.");
      }
      return parsed;
    });
  }

  /* ---- image (vision) → product description, via qwen-vl ---- */
  var VL_MODEL = "qwen-vl-max";

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Rasmni o'qib bo'lmadi.")); };
      fr.readAsDataURL(file);
    });
  }

  // Look at the photo(s) and return {name, keywords} to feed the text classifier.
  function describeImage(files) {
    if (!configured()) return Promise.reject(new Error("AI server (Cloudflare Worker) sozlanmagan."));
    if (!files || !files.length) return Promise.reject(new Error("Rasm tanlanmagan."));

    var pics = [].slice.call(files).slice(0, 2);
    return Promise.all(pics.map(fileToDataUrl)).then(function (urls) {
      var content = [{
        type: "text",
        text: "Rasm(lar)dagi asosiy tovarni aniqla. FAQAT JSON qaytar (boshqa matnsiz): " +
          "{\"name\":\"<tovarning qisqa nomi, o'zbekcha>\",\"keywords\":\"<TIFTN qidiruvi uchun kalit so'zlar, o'zbekcha>\"}"
      }];
      urls.forEach(function (u) { content.push({ type: "image_url", image_url: { url: u } }); });

      var body = {
        model: VL_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: content }]
      };
      return fetch(endpoint(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }).catch(function (e) {
        console.error("[DeklaAI] rasm: tarmoq/CORS xatosi:", e);
        throw new Error("Server bilan bog'lanib bo'lmadi (tarmoq/CORS).");
      }).then(function (r) {
        return r.text().then(function (raw) {
          var data; try { data = JSON.parse(raw); } catch (e) { data = null; }
          if (!r.ok) {
            var msg = (data && data.error && (data.error.message || data.error)) || raw;
            console.error("[DeklaAI] rasm server xatosi", r.status, raw);
            throw new Error("HTTP " + r.status + ": " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
          }
          var c = data && data.choices && data.choices[0];
          var txt = c && c.message && c.message.content;
          var parsed = extractJson(txt) || {};
          var name = parsed.name || parsed.keywords || "";
          if (!name) { console.error("[DeklaAI] rasm: nomi topilmadi:", txt); throw new Error("Rasmdan tovar aniqlanmadi."); }
          return { name: name, keywords: parsed.keywords || name };
        });
      });
    });
  }

  window.DeklaAI = {
    classify: classify, describeImage: describeImage,
    configured: configured, endpoint: endpoint, model: MODEL, vlModel: VL_MODEL
  };
})();
