# Dekla AI — Cloudflare Worker (AI proxy)

This Worker keeps your Anthropic API key on the server. The browser sends a
request here; the Worker adds the key and forwards it to the Anthropic API. The
key is **never** exposed to the browser.

```
Browser (Dekla AI)  ──POST──►  Cloudflare Worker  ──+ x-api-key──►  api.anthropic.com
                               (ANTHROPIC_API_KEY secret)
```

---

## Deploy — option A: Wrangler CLI (recommended)

```bash
cd worker
npm install -g wrangler        # if you don't have it
wrangler login                  # opens the browser, log into Cloudflare

# store your key as a SECRET (you'll be prompted to paste sk-ant-...)
wrangler secret put ANTHROPIC_API_KEY

# (optional but recommended) lock the proxy to your site origin:
# edit wrangler.toml -> uncomment [vars] / ALLOWED_ORIGIN

wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g.:

```
https://dekla-ai.<your-subdomain>.workers.dev
```

## Deploy — option B: Cloudflare dashboard (no CLI)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Give it a name (e.g. `dekla-ai`) → **Deploy**, then **Edit code**.
3. Paste the contents of `worker.js` → **Save and deploy**.
4. Worker → **Settings** → **Variables and Secrets**:
   - Add **Secret** `ANTHROPIC_API_KEY` = your `sk-ant-...` key.
   - (Optional) Add **Variable** `ALLOWED_ORIGIN` = your site URL.
5. Copy the Worker URL from the Worker's page.

---

## Connect the app

Open **`index.html`** and set your Worker URL:

```html
<script>window.DEKLA_AI_ENDPOINT = "https://dekla-ai.<your-subdomain>.workers.dev";</script>
```

That's it. Open the app → AI savollar → "AI bilan aniqlash".

## Test the Worker directly

```bash
curl -X POST "https://dekla-ai.<your-subdomain>.workers.dev" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-8","max_tokens":64,"messages":[{"role":"user","content":"Salom"}]}'
```

A JSON response with a `content` array means it works.

---

## Security notes

- **Set `ALLOWED_ORIGIN`** to your site so only your app can call the Worker.
- The Worker whitelists the model and caps `max_tokens` (4096) so a caller can't
  run up arbitrary cost. Anyone who knows the URL can still send requests, so for
  a public deployment consider Cloudflare rate limiting or Access in front of it.
- `ANTHROPIC_API_KEY` is a **secret** — never commit it or put it in `wrangler.toml`.
