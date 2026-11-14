---
id: adr:svgif/20261110121700
title: Export libraries and their licenses
status: active
created: 2026-11-10
updated: 2026-11-14
rel:
  depends_on:
    - sot:svgif/licensing
---

# Export libraries and their licenses

## Context

Muxing and raster run in the page. Deprecated muxers and GPL encoders are the wrong default. Versions of the libraries that were considered were read from the public npm registry on 2026-11-10.

## Decision

The export package does not depend on `mediabunny`, `@jsquash/webp`, or `fflate`. Animated WebP is the VP8L writer in `packages/svgif-export/src/webp.ts`. WebM and MP4 are muxed by `webm.ts` and `mp4.ts`. Those picture tracks come from the browser `VideoEncoder`. `exportSvg` takes `loop`. `gifenc` 1.0.3 (MIT) stays optional and is not required. Reject `mp4-muxer` 5.2.2, `webm-muxer` 5.1.4, ffmpeg, `@mediabunny/aac-encoder`, and UI frameworks. No audio in v1.

## Consequences

Player gzip budget is 80 KB. Studio gzip budget is 400 KB. There is no WebP wasm, so the studio gzip budget does not exclude one. A lockfile bump updates the inventory SoT in the same pull request.
