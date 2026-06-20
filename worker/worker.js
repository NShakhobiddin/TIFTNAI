/* ============================================================
   Dekla AI — Cloudflare Worker proxy for the Anthropic API
   The browser POSTs an Anthropic Messages body here; this Worker
   injects the secret ANTHROPIC_API_KEY and forwards it to Anthropic,
   so the key never reaches the browser.

   Secrets / vars (set in Cloudflare):
     ANTHROPIC_API_KEY  (secret, required)  — your sk-ant-... key
     ALLOWED_ORIGIN     (var, optional)     — e.g. https://you.github.io
                                              omit or "*" to allow any origin
   ============================================================ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== "*"
      ? env.ALLOWED_ORIGIN
      : "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return err(405, "Method not allowed", cors);
    if (!env.ANTHROPIC_API_KEY) return err(500, "ANTHROPIC_API_KEY is not configured", cors);

    let body;
    try { body = await request.json(); } catch { return err(400, "Invalid JSON", cors); }
    if (!Array.isArray(body.messages)) return err(400, "messages is required", cors);

    // Build a safe payload — never trust the client to pick an arbitrary model.
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : "claude-opus-4-8";
    const payload = {
      model,
      max_tokens: Math.min(Number(body.max_tokens) || 1024, 4096),
      messages: body.messages,
    };
    if (body.output_config) payload.output_config = body.output_config;
    if (body.system) payload.system = body.system;

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
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
