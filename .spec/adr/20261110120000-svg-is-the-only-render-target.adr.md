---
id: adr:svgif/20261110120000
title: SVG is the only render target
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# SVG is the only render target

## Context

The product is an animation library. Canvas, WebGL and a raster framebuffer are the usual way to draw frames. The owner required SVG as the only render output.

## Decision

Every frame the library shows or exports as a vector file is an SVG document. A canvas is allowed only inside the export package, as a client-side raster step for animated WebP, WebM and MP4. GIF, if built, uses the same raster step and is optional. WebGL is not a render target.

## Consequences

Backends, the player and golden tests compare SVG strings. Raster codecs cannot become the primary API.
