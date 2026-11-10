---
id: adr:svgif/20261110120100
title: Do not depend on three.js
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# Do not depend on three.js

## Context

Scene, camera, transform and material ideas are useful. The `three` package is MIT, and copying it would still couple this library to another project's API and size.

## Decision

Math, the scene graph and geometry are owned here. The package.json of `@modootoday/svgif` must not depend on `three`, and source is not copied. Public class names live in the svgif namespace.

## Consequences

A contributor who imports `three` fails review and the export gate once the package exists.
