---
id: adr:svgif/20261110120300
title: One IR and three animation backends
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/animation-ir
---

# One IR and three animation backends

## Context

Authors need one timeline. Viewers need SVG that plays in an img, inline, or as a file. CSS and SMIL cover those cases differently.

## Decision

One IR compiles to three backends: `css-external` (stylesheet beside the SVG), `css-embedded` (one `<style>` in the file) and `smil`. Filters, motion paths, masks, gradients and transforms are tracks on that IR. A feature the backend cannot express is baked to per-frame keys or held, and the compiler records the lowering.

## Consequences

Studio's share preset is `css-embedded` or `smil`. `css-external` is the cached pair. There is no fourth timeline.
