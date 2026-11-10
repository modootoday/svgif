---
id: sot:svgif/product-intent
title: Product intent
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [product]
rel:
  depends_on:
    - sot:svgif/conventions-adopted
---

# Product intent

## Rule

1. Product name **svgif.js**. npm package `@modootoday/svgif`. Repository `modootoday/svgif`. License MIT OR Apache-2.0, with no second license. IIFE global `svgif`. The unscoped npm name `svgif` is an unrelated package created in 2021 and is never the install name. [[adr:svgif/20261110120800]] [[adr:svgif/20261110122100]]
2. The library draws with SVG only. A 3D scene is still SVG paths, paints and filters, not a pixel framebuffer. [[adr:svgif/20261110120000]]
3. Two control models. Scene graph, cameras, transforms, material-like paint and a render loop are the three.js ideas. Integer frames, compositions, sequences, interpolation and deterministic sampling are the Remotion ideas. Neither project's code is imported. [[adr:svgif/20261110120100]] [[adr:svgif/20261110120200]]
4. Three file backends are first-class: external CSS, an embedded `<style>`, and SMIL. [[adr:svgif/20261110120300]]
5. Studio is a static page. It previews with the same frame sampler and exports HTML, SVG, animated WebP, WebM, and MP4 entirely in the browser. GIF is optional and is not a release scenario. [[sot:svgif/studio-export]] [[sot:svgif/client-runtime]]
6. Distribution of the library is npm plus versioned immutable CDN artifacts. The product people open is Thumly at `https://thumly.io/`, a static-only animated SVG sticker studio and playground. svgif docs and Studio are the `/svgif/` section of that GitHub Pages site. [[adr:svgif/20261110154621]] [[sot:svgif/distribution]] [[sot:svgif/docs-site]] There is one Thumly app, `apps/thumly`. The library Studio at `apps/studio` is the `/svgif/studio/` editor and is not a second Thumly app. v1 UI and landing copy are English. [[adr:svgif/20261110160436]]
7. This tree does not contain the engine. Public sentences say the design is the source and implementation follows milestone DoD. Do not write as if the library already runs. The Thumly app is not shipped either.
8. Unrelated small editors exist at `arnoson/svgif` and `miyanokomiya/svgif` (public GitHub, checked 2026-11-10). Distinguish this product as `@modootoday/svgif` and "svgif.js" in docs. Trademark clearance stays in [[sot:svgif/open-questions]].

## Why

Names have to be stable before packages, CDN paths, the global and the docs title diverge. Claiming shipped behavior before the DoD commands exist breaks the public-surface honesty rule.

## Verification

A person checks that `README.md` and `docs/index.md` state item 7. `spec check`.
