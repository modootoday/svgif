---
id: adr:svgif/20261110121100
title: Encode in the browser
status: active
created: 2026-11-10
updated: 2026-11-14
rel:
  depends_on:
    - sot:svgif/client-runtime
---

# Encode in the browser

## Context

Export must match the preview. A server ffmpeg would be a second implementation and a hosted service.

## Decision

HTML, SVG, animated WebP, WebM, and MP4 are produced in the page. The muxers are in the export package. WebP is pure TypeScript. `exportSvg` takes `loop`. Raster export does not take `loop`. A browser that cannot rasterize or encode throws `ExportCapabilityError` and writes no file. It does not call `MediaRecorder`. GIF stays optional and is not required. No server is called.

## Consequences

The export gate fails if the core package depends on a rejected library.
