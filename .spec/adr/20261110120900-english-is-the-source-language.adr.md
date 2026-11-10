---
id: adr:svgif/20261110120900
title: English is the source language
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# English is the source language

## Context

The repository will be public and the docs are the product surface. An earlier note suggested Korean user-facing copy. Sibling public docs that this project follows are English.

## Decision

Authored documents, the docs site, agent rules, workflow comments, code comments, commit subjects and pull-request text are English. A Korean docs locale may be added later only as `*.ko.md` with `lang: ko`. It is not the source.

## Consequences

A Hangul character in a tracked text file fails `scripts/ci/check-english.sh`.
