# Dekla AI — Cloudflare Worker (Qwen proxy)

This Worker keeps your Qwen (DashScope) API key on the server. The browser sends
an OpenAI-compatible Chat Completions request here; the Worker adds the key and
forwards it to Qwen. The key is **never** exposed to the browser.

```
Browser (Dekla AI)  ──POST──►  Cloudflare Worker  ──+ Authorization──►  dashscope (Qwen)
                               (DASHSCOPE_API_KEY secret)
```

---

## 1. Get a Qwen API key

1. Open **Alibaba Cloud Model Studio** (DashScope): https://www.alibabacloud.com/help/en/model-studio
2. Create / sign in, then **API-KEY** → **Create API Key**. It looks like `sk-...`.
3. Make sure the **Qwen** models you want (e.g. `qwen-max`, `qwen-plus`) are enabled.

> Region: this Worker defaults to the **international** endpoint
> (`dashscope-intl.aliyuncs.com`). For China-mainland keys, set `UPSTREAM_URL` to
> `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`.

## 2. Deploy the Worker

### Option A — Wrangler CLI (recommended)

```bash
cd worker
npm install -g wrangler
wrangler login

# store your Qwen key as a SECRET (paste sk-... when prompted)
wrangler secret put DASHSCOPE_API_KEY

wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g. `https://dekla-ai.<sub>.workers.dev`.

### Option B — Cloudflare dashboard (no CLI)

1. **Workers & Pages** → **Create** → **Create Worker** → name `dekla-ai` → **Deploy** → **Edit code**.
2. Paste `worker.js` → **Save and deploy**.
3. Worker → **Settings** → **Variables and Secrets**:
   - **Secret** `DASHSCOPE_API_KEY` = your `sk-...` key.
   - (Optional) **Variable** `QWEN_MODEL` = `qwen-plus`, `UPSTREAM_URL`, `ALLOWED_ORIGIN`.
4. Copy the Worker URL.

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
  -d '{"model":"qwen-max","max_tokens":64,"messages":[{"role":"user","content":"Salom, JSON: {\"ok\":true}"}]}'
```

A JSON response with a `choices` array means it works.

---

## Models & notes

- Change the model in `assets/js/ai.js` (`MODEL`) or with the `QWEN_MODEL` var:
  `qwen-max` (most capable), `qwen-plus` (balanced), `qwen-turbo` (fast/cheap),
  `qwen3-max`, etc.
- The Worker whitelists `qwen-*` models and caps `max_tokens` (4096).
- Uses JSON mode (`response_format: {type:"json_object"}`); the prompt describes
  the exact JSON shape, so the app gets a clean, parseable answer.

## Security

- **Set `ALLOWED_ORIGIN`** to your site so only your app can call the Worker.
- Anyone who knows the URL can still send requests (it spends your Qwen quota) —
  for a public deployment add Cloudflare rate limiting or Access.
- `DASHSCOPE_API_KEY` is a **secret** — never commit it or put it in `wrangler.toml`.
