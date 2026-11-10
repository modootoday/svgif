---
id: adr:svgif/20261110121100
title: Encode in the browser
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/client-runtime
---

# Encode in the browser

## Context

Export must match the preview. A server ffmpeg would be a second implementation and a hosted service.

## Decision

HTML, SVG, animated WebP, WebM and MP4 are produced in the page. MP4 and WebM are muxed with `mediabunny` (MPL-2.0, unmodified, export package only). WebP uses `@jsquash/webp` single-threaded WASM. GIF uses optional `gifenc` and is not required. The player bundle does not include those libraries. Fallbacks are `MediaRecorder` then `UnsupportedError`. No server is called.

## Consequences

The export gate fails if the core package depends on a rejected library.
