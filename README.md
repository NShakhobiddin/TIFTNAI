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
- **Real TIFTN database search** — the full PQ-181 (2025) nomenclature: 12 302
  ten-digit codes. Type a product name or a code and get instant results.
  Works in **both Latin and Cyrillic** (e.g. `paxta` finds `пахта`) via
  transliteration. Picking a result fills the TIFTN result screen with the real
  code, description and **real alternative codes** (siblings under the same
  heading).
- **Live customs calculator** — CIP value, customs duty (5% / 0% with an ST-1
  certificate toggle), VAT (15%), customs and processing fees are recomputed
  instantly as you type.
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
assets/data/tiftn_index.js  # compact code index (12 302 codes)
assets/data/tiftn_meta.js   # chapter/section notes, exclusions, OPI, units
```

> Data source: Decree of the President of the Republic of Uzbekistan No. PQ-181
> (14 May 2025), Annex 1 — TIFTN classification code list.

## Run locally

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
