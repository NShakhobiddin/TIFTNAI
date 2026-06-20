# Dekla AI — Cloudflare Worker (Claude proxy)

This Worker keeps your Anthropic (Claude) API key on the server. The browser
sends a native **Anthropic Messages API** request here; the Worker adds the key
and forwards it to `api.anthropic.com`. The key is **never** exposed to the
browser.

```
Browser (Dekla AI)  ──POST──►  Cloudflare Worker  ──+ x-api-key──►  api.anthropic.com (Claude)
                               (ANTHROPIC_API_KEY secret)
```

---

## 1. Get an Anthropic API key

1. Open the **Claude Developer Platform**: https://console.anthropic.com
2. Sign in → **API keys** → **Create key**. It looks like `sk-ant-...`.
3. Add credit / a billing method so the key can make requests.

> The default model is **`claude-opus-4-8`** (most capable). To run cheaper/faster,
> set the `CLAUDE_MODEL` variable to e.g. `claude-haiku-4-5` or `claude-sonnet-4-6`.

## 2. Deploy the Worker

### Option A — Cloudflare dashboard (no CLI, easiest)

The Worker is a **single dependency-free file**, so you can paste it directly:

1. **Workers & Pages** → **Create** → **Create Worker** → name `dekla-ai` → **Deploy** → **Edit code**.
2. Paste `worker.js` → **Save and deploy**.
3. Worker → **Settings** → **Variables and Secrets**:
   - **Secret** `ANTHROPIC_API_KEY` = your `sk-ant-...` key.
   - (Optional) **Variable** `CLAUDE_MODEL` (e.g. `claude-haiku-4-5`), `ALLOWED_ORIGIN`.
4. Copy the Worker URL.

### Option B — Wrangler CLI

```bash
cd worker
npm install -g wrangler
wrangler login

# store your Anthropic key as a SECRET (paste sk-ant-... when prompted)
wrangler secret put ANTHROPIC_API_KEY

wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g. `https://dekla-ai.<sub>.workers.dev`.

## 3. Connect the app

In **`index.html`** set your Worker URL:

```html
<script>window.DEKLA_AI_ENDPOINT = "https://dekla-ai.<sub>.workers.dev";</script>
```

Open the app → **AI savollar** → **"AI bilan aniqlash"**.

## 4. Test the Worker directly

```bash
curl -X POST "https://dekla-ai.<sub>.workers.dev" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-8","max_tokens":64,"messages":[{"role":"user","content":"Salom, javob ber"}]}'
```

A JSON response with a `content` array (`"type":"text"`) means it works. A `500`
with `ANTHROPIC_API_KEY is not configured` means the secret isn't set; a `401`
means the key is wrong.

---

## Models & notes

- Default model is `claude-opus-4-8`. Change it with the `CLAUDE_MODEL` var, or in
  `assets/js/ai.js` (`MODEL`). Structured outputs are supported on
  `claude-opus-4-8`, `claude-sonnet-4-6`, and `claude-haiku-4-5`.
- The Worker whitelists `claude-*` models, caps `max_tokens` (4096), and sets the
  required `anthropic-version: 2023-06-01` header.
- The app uses **structured outputs** (`output_config.format` with a JSON schema),
  so Claude returns a clean, schema-valid JSON answer the app parses directly.

## Security

- **Set `ALLOWED_ORIGIN`** to your site (e.g. `https://nshakhobiddin.github.io`)
  so browsers on other origins can't call the Worker.
- Anyone who knows the URL can still send requests (it spends your Anthropic
  quota) — for a public deployment add Cloudflare rate limiting or Access.
- `ANTHROPIC_API_KEY` is a **secret** — never commit it or put it in `wrangler.toml`.
