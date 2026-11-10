---
id: adr:svgif/20261110121700
title: Export libraries and their licenses
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/licensing
---

# Export libraries and their licenses

## Context

Muxing and raster need libraries. Deprecated muxers and GPL encoders are the wrong default. Versions were read from the public npm registry on 2026-11-10.

## Decision

Adopt, in `@modootoday/svgif-export` only: `mediabunny` 1.65.2 (MPL-2.0, unmodified, notice, not in the player) for MP4 and WebM; `@jsquash/webp` 1.5.0 (Apache-2.0, libwebp BSD-3, single-thread WASM) for animated WebP; `fflate` 0.8.3 (MIT) for zip. Optional: `gifenc` 1.0.3 (MIT). Reject `mp4-muxer` 5.2.2, `webm-muxer` 5.1.4, ffmpeg, `@mediabunny/aac-encoder`, and UI frameworks. No audio in v1.

## Consequences

Player gzip budget is 80 KB. Studio gzip budget is 400 KB excluding the WebP wasm, which loads on the first WebP export. A lockfile bump updates the inventory SoT in the same pull request.
