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
- **Live customs calculator** — CIP value, customs duty (5% / 0% with an ST-1
  certificate toggle), VAT (15%), customs and processing fees are recomputed
  instantly as you type.
- **Real navigation** with a back stack and a bottom navigation bar.
- **No build step, no dependencies** — pure HTML, CSS and a tiny ~5 KB runtime.

## How it works

The original design markup (the `sc-if` / `sc-for` / `{{ }}` bindings) is kept
verbatim inside `index.html` as an inert `<template>`. A small runtime in
`assets/js/dekla.js` interprets those bindings against the app state and the
calculation logic, and re-renders on every change.

```
index.html            # page shell + the design template (inert <template>)
assets/css/app.css     # full-screen layout, fonts, animations
assets/js/dekla.js     # template engine + app state & customs logic
```

## Run locally

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
