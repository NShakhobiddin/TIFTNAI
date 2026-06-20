/* ============================================================
   Dekla AI — Cloudflare Worker proxy for Qwen (DashScope)
   The browser POSTs an OpenAI-compatible Chat Completions body
   here; this Worker injects the secret DASHSCOPE_API_KEY and
   forwards it to Qwen, so the key never reaches the browser.

   Secrets / vars (set in Cloudflare):
     DASHSCOPE_API_KEY  (secret, required)  — your Qwen API key (sk-...)
     UPSTREAM_URL       (var, optional)     — override the Qwen endpoint
     QWEN_MODEL         (var, optional)     — default model (e.g. qwen-plus)
     ALLOWED_ORIGIN     (var, optional)     — e.g. https://you.github.io ("*" = any)
   ============================================================ */

// International (Singapore) endpoint. China mainland alternative:
//   https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
const DEFAULT_UPSTREAM = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_MODEL = "qwen-max";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== "*" ? env.ALLOWED_ORIGIN : "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return err(405, "Method not allowed", cors);
    if (!env.DASHSCOPE_API_KEY) return err(500, "DASHSCOPE_API_KEY is not configured", cors);

    let body;
    try { body = await request.json(); } catch { return err(400, "Invalid JSON", cors); }
    if (!Array.isArray(body.messages)) return err(400, "messages is required", cors);

    // Only allow Qwen models; otherwise fall back to the configured default.
    const model = (typeof body.model === "string" && /^qwen/i.test(body.model))
      ? body.model
      : (env.QWEN_MODEL || DEFAULT_MODEL);

    const payload = {
      model,
      messages: body.messages,
      max_tokens: Math.min(Number(body.max_tokens) || 1024, 4096),
    };
    if (body.response_format) payload.response_format = body.response_format;
    if (body.temperature != null) payload.temperature = body.temperature;

    let upstream;
    try {
      upstream = await fetch(env.UPSTREAM_URL || DEFAULT_UPSTREAM, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + env.DASHSCOPE_API_KEY,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return err(502, "Upstream request failed: " + e.message, cors);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, "content-type": "application/json" },
    });
  },
};

function err(status, message, cors) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
