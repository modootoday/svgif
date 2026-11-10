---
id: sot:svgif/animation-backends
title: CSS external, CSS embedded, and SMIL backends
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [backend, css, smil]
rel:
  depends_on:
    - sot:svgif/animation-ir
    - adr:svgif/20261110120300
---

# CSS external, CSS embedded, and SMIL backends

## Rule

`compile(ir, backend)` is total. If the backend cannot express a channel, `lower` rewrites the IR first (usually per-frame keys or `hold`). The compiler does not drop a channel silently.

### Backends

| Backend | Artifact | How animation is stored |
| --- | --- | --- |
| `css-external` | `file.svg` plus `file.css` | Selectors on stable ids, `@keyframes`, `animation` |
| `css-embedded` | one `.svg` | A single `<style>` in `defs` with the same CSS |
| `smil` | one `.svg` | `<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`, `keyTimes` / `keySplines`, `begin` / `end` |

`css-external` and `css-embedded` share one CSS printer. Only the destination of the stylesheet differs. The library chrome file `svgif.css` is not this stylesheet.

### Feature matrix

Support here means "the compiler emits a native construct", not "the browser will run it in every embedding". Embeddings are the next table. "Lower" means bake to per-frame keys or `hold`.

| Channel | css-external | css-embedded | smil |
| --- | --- | --- | --- |
| translate / rotate / scale | `@keyframes` on `transform` | same CSS | `animateTransform` |
| 2D affine matrix | `transform` matrix | same | `animateTransform` type `matrix` if values stay affine, else lower |
| `matrix3d` / CSS 3D | not emitted | not emitted | no construct; never the 3D path |
| `attr.d` path | lower (CSS cannot interpolate path data portably) | lower | `animate` `attributeName="d"` if command lists match, else lower |
| fill, stroke, opacity | `@keyframes` | same | `animate` |
| `offset-path` + `offset-distance` | CSS motion path | same CSS | not CSS; use `animateMotion` when lowering from this channel |
| `animateMotion` / `mpath` | lower to `offset-path` or to baked transforms | same | native |
| `feGaussianBlur` stdDeviation, `feDisplacementMap` scale, `feTurbulence` baseFrequency / seed | lower (presentation attributes are not reliably keyframable) | lower | `animate` on the attribute |
| gradient stop offset and color | lower | lower | `animate` on the stop |
| mask / clipPath geometry | lower the geometry; the reference can be static | same | `animate` inside the clip or mask if the command list matches |
| discrete show/hide | `steps` or opacity | same | `<set>` |

### Where the file actually animates

| Embedding | External CSS | Embedded `<style>` | SMIL |
| --- | --- | --- | --- |
| Inline SVG in HTML | Applies if the stylesheet is loaded in the page | Runs | Runs in current Chromium, Gecko and WebKit (as of 2026-11; do not treat old "SMIL removed" blog posts as current) |
| Standalone `.svg` file opened as a document | Applies when the XML stylesheet link is kept and the CSS file is beside it | Runs | Runs |
| `<img>`, `background-image`, CSS `content` | Does not load external CSS | Runs in current major browsers | Runs in current major browsers |
| HTML sanitizers (DOMPurify defaults and many feed sanitizers) | Strips the external link or the class hooks | Often strips `<style>` | Often strips `<animate>` and friends |

Studio's default "share this file" export is `css-embedded` or `smil`, not `css-external`, because a single file survives `<img>`. `css-external` is the CDN and editor-roundtrip choice: the SVG stays smaller and the CSS can be cached. The caller passes `backend` explicitly. There is no silent default inside the library except the documented Studio preset in [[sot:svgif/studio-export]].

### Player versus static output

- Static artifacts do not include the JS player.
- `player` mode `static` inserts the artifact and lets CSS or SMIL run.
- `player` mode `scrub` pauses CSS (`animation-play-state: paused` and a negative delay equal to the frame time) or sets SMIL to that time via `setCurrentTime` where the browser exposes it. If the browser cannot seek SMIL, scrub mode re-calls `renderFrame` and replaces the SVG. Seeking must not use wall-clock accumulation.
- Raster export does not go through CSS or SMIL playback. It calls `renderFrame` per integer frame so a missing SMIL implementation cannot change the GIF.

## Why

The three backends are the product, not an afterthought. A matrix that names the lowering keeps "it animates in Chrome on a file:// URL" from being confused with "a sanitizer kept the style block".

## Verification

`WP-CSS`, `WP-SMIL` and `WP-LOW` golden tests: one IR fixture, three artifacts, and `sample(lowered, frame)` equals `sample(source, frame)` at every frame of a short fixture. A sanitizer fixture is a string test that documents stripped tags, not a claim that every sanitizer was executed.
