---
id: sot:svgif/open-questions
title: Open questions
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [questions]
rel:
  depends_on:
    - sot:svgif/product-intent
---

# Open questions

## Rule

These are unresolved. They are not permission to guess in a pull request.

1. The CDN hostname is unset. Schema `$id` values stay on `https://modootoday.github.io/svgif/schema/...` until the owner chooses a host. Variable name: `SVGIF_CDN_BASE`.
2. Whether a custom domain is added in front of GitHub Pages.
3. Trademark clearance for the words "svgif" and "svgif.js", given the public repositories `arnoson/svgif` and `miyanokomiya/svgif` and the unrelated unscoped npm package `svgif`.
4. Whether optional GIF remains in the UI after the first export matrix, or stays off. It is not a required release scenario.

## Why

Shipping a hostname or a trademark claim in the design snapshot would publish a guess.

## Verification

A pull request that fills one of these in product copy without an ADR is sent back. The questions stay in this file until an ADR supersedes the row.
