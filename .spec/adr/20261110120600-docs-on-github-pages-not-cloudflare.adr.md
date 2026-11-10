---
id: adr:svgif/20261110120600
title: Docs on GitHub Pages, not Cloudflare
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/client-runtime
---

# Docs on GitHub Pages, not Cloudflare

## Context

The docs and Studio must be static files a person can open. Cloudflare can host sites and can also be confused with an encode server.

## Decision

The docs site and Studio are one GitHub Pages site built by Actions from `docs/` with `jekyll-theme-modootoday`. Cloudflare is only the CDN for immutable library JS and CSS. It is not the docs host and not an encoder.

## Consequences

Pages cannot set COOP/COEP. Threaded WASM stays out of the product. The CDN hostname is a separate open question; schema `$id` values stay on `modootoday.github.io`.
