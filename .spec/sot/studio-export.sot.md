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
    - adr:svgif/20261110120900
    - adr:svgif/20261110160436
---

# Studio preview and client-side export

## Rule

Studio and the library share `renderFrame(composition, frame) -> SVG string`. Preview paints that string into the page. Export walks integer frames in the browser and builds a `Blob`. The page triggers a download. No bytes are uploaded for encoding.

The first UI does not offer a GIF export button. GIF remains an optional codec in the table below and is not a required release scenario. v1 UI strings are English. [[adr:svgif/20261110120900]] [[adr:svgif/20261110160436]]

### Codecs

| Codec | Browser path | Fallback if the preferred API is missing | License constraint |
| --- | --- | --- | --- |
| SVG | `compile` to `css-embedded` (Studio preset) or `smil` if the user picks it. `css-external` is offered as a zip of two files, still built in the page | none | none |
| GIF | Rasterize each frame to RGBA, encode with a pure-JS GIF encoder (gifenc, MIT, or a replacement with an OSI license recorded in `THIRD_PARTY_NOTICES.md`) | The first UI has no GIF button. A later surface disables its GIF control when canvas cannot paint the SVG, and the error names the browser | no GPL |
| Animated WebP | Same RGBA frames into a WASM or pure-JS WebP encoder running in the page | Disable WebP and name the missing WASM compile. Do not call a server | no GPL; keep the encoder in `@modootoday/svgif-export` |
| WebM | `VideoEncoder` (WebCodecs) VP9 or VP8, mux with a pure-JS WebM muxer (webm-muxer, MIT, or a recorded replacement) | `MediaRecorder` when `VideoEncoder` is absent. If neither exists, disable WebM | no ffmpeg |

Rasterization draws the SVG into a canvas (`createImageBitmap` on a same-origin blob URL, or an equivalent canvas draw that does not leave the origin). A Worker does the loop when `OffscreenCanvas` exists. Otherwise the main thread runs the same functions.

### Browser matrix (minimum the UI must implement)

| Capability | Used for | If absent |
| --- | --- | --- |
| Canvas + blob SVG | GIF, WebP, WebM | WebP and WebM buttons disabled. A later GIF control is disabled the same way. The first UI offers no GIF button. SVG export still offered |
| Web Workers | Off-main encode | Main thread |
| `OffscreenCanvas` | Worker canvas | Main-thread canvas |
| WebCodecs `VideoEncoder` | WebM | `MediaRecorder` |
| `MediaRecorder` with a webm mime | WebM fallback | WebM disabled |
| WASM instantiate | WebP when the chosen encoder is WASM | Pure-JS WebP if one is bundled, else WebP disabled |
| `SharedArrayBuffer` | not used | not a fallback target |

The UI shows the matrix for the current browser (`svgif.exportSupport()`), not a static "works everywhere" claim. That matrix does not add a GIF export button to the first UI.

### What CI checks

A headless browser loads the built Studio from the local `_site` (or the live URL after deploy) and exports a one-frame SVG. The test asserts a `Blob` whose type and magic bytes match, that the first UI does not offer a GIF export button, and that the performance log contains no request to a host other than the page origin.

The first-UI check covers that SVG export and the missing GIF button. A later encoder test may still build a two-frame GIF outside the first UI. That later test is not a required release scenario.

## Why

Preview and download have to be the same sampler, or the file will not match the screen. Doing that without a server is the product constraint, so each codec has an in-page fallback or a disabled control. A disabled control is not a silent server hop. The first UI simply has no GIF control to show.

## Verification

The tier-1 export matrix in [[plan:svgif/20261110122000]] is HTML, SVG, WebP, WebM, and MP4 (`export-html`, `export-svg`, `export-webp`, `export-webm`, `export-mp4`). GIF is not a required scenario there. `scripts/ci/export-gate.sh` runs the first-UI browser check once `apps/studio` exists, and until then only checks that this SoT is present. A later GIF encoder test, if one is added, stays outside that first-UI check. M8 still checks the live Studio page.
