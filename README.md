# Dekla AI

A fully working, mobile web implementation of **Dekla AI** — an assistant that
detects TIFTN (customs commodity) codes and calculates customs duties and
required documents.

The app is rendered full-bleed: the device bezel, the dynamic island and the
surrounding canvas frame from the original design have been removed, so the
screens fill the viewport like a real mobile app.

## Features

- **24 connected screens**: splash, login, SMS verification, onboarding,
  dashboard, quick search, new analysis, product info, image / Excel / document
  upload, AI questions, TIFTN result, alternative codes, value & costs, customs
  payments, permits & certificates, risk assessment, final result, profile,
  help, plans, calculations and saved items.
- **Real TIFTN database search** — the full PQ-181 (2025) nomenclature.
  Search runs across **all 16 377 codes** — headings (4-digit), subheadings
  (6-digit) and national codes (10-digit) — not just the final codes. Type a
  product name or a code and get instant results. The matcher is
  **token-aware** (multi-word names like `plastik quvur` work), tolerant of word
  variants (stemming, e.g. `plastik`→`plastmassa`), and ships a small
  **synonym layer** so everyday words map to the nomenclature's vocabulary
  (`noutbuk`→portativ hisoblash mashinasi/8471, `muzlatgich`→sovutgich/8418,
  `konditsioner`→8415, `televizor`→8528). Works in **both Latin and Cyrillic**
  (e.g. `paxta` finds `пахта`) via transliteration. Picking a result fills the
  TIFTN result screen with the real code, description and **real alternative
  codes** (final/terminal siblings under the same heading).
- **AI-generated clarifying questions** — instead of a fixed form, Claude reads
  the product name (or the photo) plus the candidate codes and writes its own
  2–4 questions to disambiguate; your answers are folded into the classification.
  Excel uploads skip the questions and classify directly.
- **AI code classification (Claude)** — on the "AI savollar" screen, enter a
  product name/description and Dekla calls **Claude (`claude-opus-4-8`)** to pick
  the best TIFTN code. The model is grounded in real data: the app first searches
  the local database for candidate codes, then sends them — together with the
  official OPI interpretation rules — to Claude via the native **Messages API**
  with **structured outputs** (a JSON schema), so it returns a schema-valid answer:
  the chosen code, a confidence score, an Uzbek explanation and ranked
  alternatives. The browser calls a **Cloudflare Worker proxy** (`worker/`) that
  holds the Anthropic API key as a secret, so the key is never exposed
  client-side. Set your Worker URL via `window.DEKLA_AI_ENDPOINT` in `index.html`
  — see `worker/README.md` for deployment.
- **TIFTN catalog (browse & manual pick)** — a dedicated section to explore the
  classifier yourself: drill down the hierarchy (guruh → tovar pozitsiyasi → …
  → 10-digit national code) or search, and tap any final code to select it.
- **Always-on code detection** — classification works even without AI: if the
  Worker/Claude is unavailable it falls back to the local TIFTN database and still
  returns the best-matching code.
- **Animated analysis** — every classification (text, image, Excel) runs behind
  a live overlay with a spinner and step-by-step progress, so you can see the
  app working instead of a result appearing out of nowhere.
- **Image upload (vision)** — pick product photos; the chosen photos appear as
  real thumbnails, and during analysis the image is shown with a **scanning
  animation** while Claude reads it (Claude is natively multimodal), derives a
  name, and the app classifies it into a TIFTN code.
- **Excel upload** — download the ready template
  (`assets/templates/dekla-tiftn-shablon.xlsx`: Tovar nomi / Tavsif / Material /
  Ishlatilish sohasi columns + a Yo'riqnoma sheet), fill it in, and upload an
  `.xlsx`/`.csv`. The app parses it (SheetJS), maps the columns by header
  keywords, and classifies the first product row (name + description + material
  + usage). The template download uses Telegram's native downloader inside the
  Mini App and a normal anchor download in a browser.
- **Document upload** — pick an invoice / spec / packing-list file (file picker
  wired; manual continue).
- **Telegram Mini App** — opens inside a Telegram bot via the WebApp SDK
  (`assets/js/telegram.js`): expands to fullscreen, themes, and syncs the Back
  button. Reserves the correct top safe area (device notch/status bar **plus**
  Telegram's floating controls, summed) so the header is never hidden, and locks
  the page against rubber-band/overscroll so only the in-app list scrolls —
  native-app-like and stable. The bottom nav and content respect the home
  indicator.
- **Real import-duty rates (PP-3818)** — every code carries its official import
  customs-duty rate from Resolution PP-3818. The TIFTN result screen shows the
  rate (`Import boj stavkasi`), including compound rates (e.g. `15% + 1 USD/kub
  sm` or `20%, lekin kamida 0.5 USD/dona`), and the customs calculator uses the
  selected code's real ad-valorem rate instead of a flat 5%. Rates are resolved
  by longest-matching code prefix and ship as a compact 22 KB runtime index
  (`assets/data/tiftn_duty.js`).
- **Live customs calculator** — CIP value, customs duty (the selected code's real
  rate, or 0% with an ST-1 certificate toggle), excise, VAT (12%, charged on
  value + duty + excise) and the customs clearance fee are recomputed instantly
  as you type. Total = duty + excise + VAT + clearance fee.
- **Live Central Bank exchange rate** — the USD rate is fetched from the Central
  Bank of Uzbekistan (`cbu.uz/uz/arkhiv-kursov-valyut/json/USD/`) on load, cached
  in `localStorage`, and shown with its official date. A refresh button re-pulls
  it; a manual edit switches the field to manual (and is never overwritten). If
  the bank is unreachable the last cached or default rate is used.
- **Real customs clearance fee (Resolution No. 55, 31 Jan 2025)** — the
  `Bojxona rasmiylashtirish yig'imi` is not a flat percentage but a sliding
  scale fixed in multiples of the BHM (base calculation unit) by the customs
  value in USD: ≤10k → 1×, 10–20k → 1.5×, 20–40k → 2.5×, 40–60k → 4×,
  60–100k → 7×, 100–200k → 10×, 200–500k → 15×, 500k–1M → 20×, ≥1M → 25×.
  BHM defaults to 412 000 so'm and can be updated yearly via
  `window.DEKLA_BHM`. The payments screen shows the applied multiplier and the
  basis.
- **Country-of-origin duty preferences (Resolution 2020/31-3, 22 Jun 2020)** —
  the payments screen has a country-of-origin field (pick from the 47 MFN "eng
  ko'p qulaylik" countries in Annex 1 and 10 free-trade countries in Annex 2 via
  autocomplete, **or just type it** — a local matcher resolves common Uzbek/EN/RU
  names instantly and Claude resolves anything else on demand) and a certificate
  choice (Sertifikatsiz / Mavjud / ST-1). The import duty is adjusted
  accordingly: Annex 2 + ST-1 → 0%; Annex 1 + certificate of origin → base rate
  (1×); no certificate → base rate plus a surcharge by tier (base <10% → +5%,
  10–20% → +10%, 20–30% → +15%, ≥30% → +20%). The applied rule is shown under
  the payments table.
- **Real navigation** with a back stack and a bottom navigation bar.
- **No build step, no dependencies, no server** — pure HTML, CSS and a small
  vanilla-JS runtime. Opens straight from `file://`.

## How it works

The original design markup (the `sc-if` / `sc-for` / `{{ }}` bindings) is kept
verbatim inside `index.html` as an inert `<template>`. A small runtime in
`assets/js/dekla.js` interprets those bindings against the app state and the
calculation logic, and re-renders on every change.

The TIFTN database lives in `assets/data/` as a compact search index (a
deduplicated path-segment dictionary, ~1.8 MB) plus a meta file (chapter /
section notes, exclusions, OPI rules, units). It is **lazy-loaded on the first
search** via a `<script>` tag, so the app stays fast and works offline.

```
index.html               # page shell + the design template (inert <template>)
assets/css/app.css        # full-screen layout, fonts, animations
assets/js/dekla.js        # template engine + app state & customs logic
assets/js/tiftn.js        # TIFTN search: transliteration, search, code lookup
assets/js/ai.js           # Claude classifier (Messages API via Worker, structured outputs)
assets/data/tiftn_index.js  # compact runtime code index (all 16 377 codes)
assets/data/tiftn_meta.js   # chapter/section notes, exclusions, OPI, units
assets/data/tiftn_duty.js   # import-duty rates per code (PP-3818), prefix-resolved
data/tiftn_tree.json        # full source tree — all 20 652 nodes (16 377 codes)
```

`data/tiftn_tree.json` is the complete, authoritative nomenclature tree
(chapters → headings → subheadings → national codes, with parent links and full
paths). The compact runtime index in `assets/data/` is derived from it; the full
tree is kept in the repo as the source of truth and for future features such as
browsing the hierarchy or looking up non-terminal codes.

> Data source: Decree of the President of the Republic of Uzbekistan No. PQ-181
> (14 May 2025), Annex 1 — TIFTN classification code list.

## Run locally

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
