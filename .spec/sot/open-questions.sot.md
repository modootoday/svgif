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

An open row is not permission to guess in a pull request. A resolved row names the ADR that closed it.

1. Resolved by [[adr:svgif/20261110164419]]. The library origin is an R2 Standard bucket on the custom domain `cdn.thumly.io`. Variable name: `SVGIF_CDN_BASE`. It stays unset until the first gated release uploads there. The value then is `https://cdn.thumly.io/svgif`.
2. Resolved by [[adr:svgif/20261110154621]]. The Pages custom domain is `thumly.io`.
3. Trademark clearance for the words "svgif" and "svgif.js", given the public repositories `arnoson/svgif` and `miyanokomiya/svgif` and the unrelated unscoped npm package `svgif`.
4. Whether optional GIF remains in the UI after the first export matrix, or stays off. It is not a required release scenario.

English v1 copy, the theme-token call to action, the missing GIF button in the first UI, and oEmbed `provider_name` `Thumly` are [[adr:svgif/20261110160436]]. They are not questions in this file. Question 3 stays open.

## Why

The Pages custom domain and the library CDN origin are decided. `SVGIF_CDN_BASE` stays unset until the first gated upload. The trademark is still unresolved. Shipping that word as a guess would publish a guess. Question 4 stays open.

## Verification

A pull request that fills an open row in product copy without an ADR is sent back. A resolved row names the ADR and stays in this file.
