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

1. The library CDN hostname is unset. Variable name: `SVGIF_CDN_BASE`. `cdn.thumly.io` is not that hostname.
2. Resolved by [[adr:svgif/20261110154621]]. The Pages custom domain is `thumly.io`.
3. Trademark clearance for the words "svgif" and "svgif.js", given the public repositories `arnoson/svgif` and `miyanokomiya/svgif` and the unrelated unscoped npm package `svgif`.
4. Whether optional GIF remains in the UI after the first export matrix, or stays off. It is not a required release scenario.

## Why

The Pages custom domain is decided. The library CDN hostname and the trademark are still unresolved. Shipping either as a guess would publish a guess.

## Verification

A pull request that fills an open row in product copy without an ADR is sent back. A resolved row names the ADR and stays in this file.
