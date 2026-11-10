---
id: adr:svgif/20261110160436
title: "Thumly v1 UI copy, token, and GIF button"
status: active
created: 2026-11-10T16:04:36Z
updated: 2026-11-10T17:50:00Z
rel:
  depends_on: [adr:svgif/20261110120900, adr:svgif/20261110154621, adr:svgif/20261110122600, sot:svgif/product-intent]
---

# Thumly v1 UI copy, token, and GIF button

## Context

Thumly is one app. Its directory is `apps/thumly`. The library Studio at `apps/studio` is the `/studio/` editor. It is not a second Thumly app. The engine is still not shipped, and this decision does not create `apps/thumly/`.

The Pages host stays [[adr:svgif/20261110154621]]. `https://thumly.io/` is the Thumly landing. Studio is `/studio/`. The docs home is `/docs/`. This decision does not reopen that layout.

English is already the source language for authored text. [[adr:svgif/20261110120900]] v1 UI and landing copy follow that rule.

The docs site uses jekyll-theme-modootoday. In that theme the primary color is the modootoday brand orange family: the `brand` scale, surfaced as `primary`. A site changes tokens through the theme's override maps. It does not fork the theme.

GIF remains an optional codec and is not a release scenario. [[sot:svgif/product-intent]] The first UI is a separate choice from the codec list in [[sot:svgif/studio-export]]. This decision does not edit that file.

oEmbed stays static files with no query endpoint. [[adr:svgif/20261110122600]] The provider name a consumer shows is part of the v1 product, and [[sot:svgif/external-embed]] is where the export role records it. This decision does not edit that file.

Trademark clearance for "svgif" stays open. [[sot:svgif/open-questions]]

## Decision

1. v1 UI and landing copy are English.
2. The primary call to action uses the modootoday family orange token from jekyll-theme-modootoday (the `brand` scale, surfaced as `primary`). Tokens are overridden, never forked. A missing theme feature is an upstream request, not a copy of the theme in this repository.
3. The first UI has no GIF export button. GIF stays optional and is not a release scenario.
4. The oEmbed `provider_name` is `Thumly`.
5. There is one Thumly app directory, `apps/thumly`. This decision does not add another Thumly app directory and does not create the tree.

## Consequences

[[sot:svgif/product-intent]] records the one app, the English v1 copy, and the library Studio path. [[sot:svgif/package-layout]] names `apps/thumly` once and does not create it. [[sot:svgif/open-questions]] keeps the trademark open. English copy, the call-to-action token, the missing GIF button, and `provider_name` are not new questions.

The org chart gives this file to `govern` and gives [[sot:svgif/studio-export]] to `studio`. This decision does not reopen the host routes.
