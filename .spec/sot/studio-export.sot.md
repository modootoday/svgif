---
id: sot:svgif/studio-export
title: Studio preview and client-side export
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [studio, export]
rel:
  depends_on:
    - sot:svgif/client-runtime
    - sot:svgif/animation-backends
    - sot:svgif/determinism
    - adr:svgif/20261110121100
---

# Studio preview and client-side export

## Rule

Studio and the library share `renderFrame(composition, frame) -> SVG string`. Preview paints that string into the page. Export walks integer frames in the browser and builds a `Blob`. The page triggers a download. No bytes are uploaded for encoding.

### Codecs

| Codec | Browser path | Fallback if the preferred API is missing | License constraint |
| --- | --- | --- | --- |
| SVG | `compile` to `css-embedded` (Studio preset) or `smil` if the user picks it. `css-external` is offered as a zip of two files, still built in the page | none | none |
| GIF | Rasterize each frame to RGBA, encode with a pure-JS GIF encoder (gifenc, MIT, or a replacement with an OSI license recorded in `THIRD_PARTY_NOTICES.md`) | none other than disabling the button if canvas cannot paint the SVG; the error names the browser | no GPL |
| Animated WebP | Same RGBA frames into a WASM or pure-JS WebP encoder running in the page | Disable WebP and name the missing WASM compile. Do not call a server | no GPL; keep the encoder in `@modootoday/svgif-export` |
| WebM | `VideoEncoder` (WebCodecs) VP9 or VP8, mux with a pure-JS WebM muxer (webm-muxer, MIT, or a recorded replacement) | `MediaRecorder` when `VideoEncoder` is absent. If neither exists, disable WebM | no ffmpeg |

Rasterization draws the SVG into a canvas (`createImageBitmap` on a same-origin blob URL, or an equivalent canvas draw that does not leave the origin). A Worker does the loop when `OffscreenCanvas` exists. Otherwise the main thread runs the same functions.

### Browser matrix (minimum the UI must implement)

| Capability | Used for | If absent |
| --- | --- | --- |
| Canvas + blob SVG | GIF, WebP, WebM | Raster buttons disabled. SVG export still offered |
| Web Workers | Off-main encode | Main thread |
| `OffscreenCanvas` | Worker canvas | Main-thread canvas |
| WebCodecs `VideoEncoder` | WebM | `MediaRecorder` |
| `MediaRecorder` with a webm mime | WebM fallback | WebM disabled |
| WASM instantiate | WebP when the chosen encoder is WASM | Pure-JS WebP if one is bundled, else WebP disabled |
| `SharedArrayBuffer` | not used | not a fallback target |

The UI shows the matrix for the current browser (`svgif.exportSupport()`), not a static "works everywhere" claim.

### What CI checks

A headless browser loads the built Studio from the local `_site` (or the live URL after deploy) and exports a one-frame SVG plus a two-frame GIF. The test asserts a `Blob` whose type and magic bytes match, and that the performance log contains no request to a host other than the page origin.

## Why

Preview and download have to be the same sampler, or the file will not match the screen. Doing that without a server is the product constraint, so each codec has an in-page fallback or a disabled control. A disabled control is not a silent server hop.

## Verification

`WP-GIF`, `WP-WEBP`, `WP-WEBM` and M8 in [[plan:svgif/20261110122000]]. `scripts/ci/export-gate.sh` runs those browser checks once `apps/studio` exists, and until then only checks that this SoT is present.
