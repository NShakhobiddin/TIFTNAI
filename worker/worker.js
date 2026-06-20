/* ============================================================
   Dekla AI — Cloudflare Worker proxy for Claude (Anthropic)
   The browser POSTs a native Anthropic Messages API body here;
   this Worker injects the secret ANTHROPIC_API_KEY and forwards
   it to api.anthropic.com, so the key never reaches the browser.

   Single file, no dependencies — paste it straight into the
   Cloudflare dashboard editor, or deploy with wrangler.

   Secrets / vars (set in Cloudflare):
     ANTHROPIC_API_KEY  (secret, required)  — your Anthropic key (sk-ant-...)
     CLAUDE_MODEL       (var, optional)      — default model (e.g. claude-haiku-4-5)
     ALLOWED_ORIGIN     (var, optional)      — e.g. https://nshakhobiddin.github.io ("*" = any)
   ============================================================ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";

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
    if (!env.ANTHROPIC_API_KEY) return err(500, "ANTHROPIC_API_KEY is not configured", cors);

    let body;
    try { body = await request.json(); } catch { return err(400, "Invalid JSON", cors); }
    if (!Array.isArray(body.messages)) return err(400, "messages is required", cors);

    // Only allow Claude models; otherwise fall back to the configured default.
    const model = (typeof body.model === "string" && /^claude/i.test(body.model))
      ? body.model
      : (env.CLAUDE_MODEL || DEFAULT_MODEL);

    // Forward only the fields we expect; cap max_tokens.
    const payload = {
      model,
      max_tokens: Math.min(Number(body.max_tokens) || 1024, 4096),
      messages: body.messages,
    };
    if (body.system) payload.system = body.system;
    if (body.output_config) payload.output_config = body.output_config;
    if (body.thinking) payload.thinking = body.thinking;

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
