---
id: sot:svgif/architecture
title: Architecture
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [architecture]
rel:
  depends_on:
    - sot:svgif/product-intent
    - sot:svgif/client-runtime
---

# Architecture

## Rule

The engine is one pipeline. Packages may split later, but the call order does not.

```
Composition (frame index)
  -> sample Timeline IR at that integer frame
  -> evaluate Scene (2D nodes and 3D nodes share one graph)
  -> 3D: world matrix, clip, project, cull, depth-sort, shade
  -> 2D shape list (paths, paints, filters, clips, masks, motion)
  -> either bake into IR keys, or emit through a backend
Backend: css-external | css-embedded | smil
Player: scrub the same sampler and write the DOM
Export (browser only): renderFrame(frame) -> SVG document string
        -> client canvas RGBA (Worker + OffscreenCanvas when present)
        -> gif | animated webp | webm in the page
        No product server. Studio does not require a CLI. [[sot:svgif/client-runtime]] [[adr:svgif/20261110122400]]
```

### Modules

| Module | Owns | Does not own |
| --- | --- | --- |
| `math` | `Vec2/3/4`, `Mat4`, quaternion, Euler, cameras, homogeneous clip, viewport map | SVG strings |
| `scene` | Node graph, local transforms, parent world matrix, stable ids | Time |
| `mesh` | Cube, sphere, torus, extrude, lathe, parametric surface, polyline in 3D | Shading |
| `ir` | Tracks, keys, sequences, property paths, capability-neutral values | Backend syntax |
| `clock` | fps, integer frame, easing, discrete spring | Dates, `performance.now` |
| `path` | SVG path data builder, quantization | Projection |
| `project` | Model-view-projection, near-plane clip, perspective divide, viewBox map, curve projection | Sort and light |
| `shade` | Back-face cull, painter sort, Lambert (and flat) to fill or gradient | CSS |
| `bake` | Per-frame shape list written back as IR keys | File IO |
| `backend` | Compile a sampled or baked IR to one of three artifacts | 3D math |
| `lower` | When a backend cannot express a channel, rewrite the IR (usually bake) | New features |
| `player` | Inline DOM scrub, or leave static CSS/SMIL to the browser | Encoding |
| `export` | In-browser SVG file plus canvas raster and GIF/WebP/WebM encoders. Studio calls `renderFrame` | A server, a required CLI, a second scene format |

### Contracts that are frozen before parallel implementation

These are specified here and in the linked SoTs. Work packages must not change them without a new ADR. TypeScript copies arrive only in work package `WP-TYPES` ([[plan:svgif/20261110122000]]).

| Id | Contract |
| --- | --- |
| C1 | `Vec3`, `Quat`, `Mat4`, `PerspectiveCamera`, `OrthographicCamera` field names in [[sot:svgif/scene-3d]] |
| C2 | Scene JSON: `{ id, children, transform, kind }` plus kind payloads |
| C3 | Timeline IR in [[sot:svgif/animation-ir]] |
| C4 | `compile(ir, backend, opts) -> { svg, css? }` |
| C5 | Time is an integer frame. `t = frame / fps`. No wall clock. |
| C6 | Emit quantization in [[sot:svgif/determinism]] |
| C7 | Package names in [[sot:svgif/package-layout]] |
| C8 | `renderFrame(composition, frame) -> string` (one SVG document) |
| C9 | `exportJob({ composition, backend, codec, fps, size })` in [[sot:svgif/studio-export]] |

Stable ids: an author-set `id`, otherwise the path of child indexes from the root (`n0/n2/n1`). CSS selectors and SMIL `id` attributes use that string prefixed with `s-`. Ids do not depend on object identity or insertion order beyond the child array.

## Why

A single sampler is what makes the player, the three static backends and the four Studio codecs agree. If each backend samples time its own way, golden SVG tests cannot exist.

## Verification

Until `packages/svgif/src` exists, verification is `spec check` and a review that C1–C9 are named in the linked SoTs. After it exists, `bun test` on the core package must cover `renderFrame` for a fixture composition.
