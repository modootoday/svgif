---
id: sot:svgif/stroke-draw
title: Stroke draw
status: active
created: 2026-11-10T18:33:55Z
updated: 2026-11-10T18:37:03Z
rel:
  depends_on: [sot:svgif/animation-ir, sot:svgif/determinism, adr:svgif/20261110181452]
tags: [animation, stroke]
verify: manual
---

# Stroke draw

## Rule

A stroke is keyed on `pathLength` and `dashoffset`. Both are first-class attributes.

- `pathLength` is the SVG `pathLength` attribute. It is the length the dash pattern uses, in the path's own units.
- `dashoffset` is the SVG `stroke-dashoffset` attribute.

[[sot:svgif/animation-ir]] does not list those two channels yet. This record does not edit that list and does not add a second timeline. A later edit of the IR record adds the channels. `sample(ir, frame)` still returns one concrete value per channel.

A draw-on runs `dashoffset` from the length to zero. The dash array is one dash of `pathLength` followed by a gap of `pathLength`. At the start, `dashoffset` equals `pathLength` and the stroke is not drawn. At the end, `dashoffset` is zero and the stroke is fully drawn. The part that is drawn is the start of the path through the drawn length. The rest is the gap.

The acceptance fixture is one path with `pathLength` 100. The path data is `M0 10H100`. The dash array is `100 100`. The fixture does not set `stroke-linecap`, so the default butt cap applies. Only `dashoffset` changes across the three frames.

| Drawn | `dashoffset` | Golden file |
| --- | --- | --- |
| 0 percent | 100 | `fixtures/stroke-draw/path-length-100-drawn-0.svg` |
| 50 percent | 50 | `fixtures/stroke-draw/path-length-100-drawn-50.svg` |
| 100 percent | 0 | `fixtures/stroke-draw/path-length-100-drawn-100.svg` |

The golden SVG for 0 percent drawn:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20" viewBox="0 0 100 20">
  <path d="M0 10H100" fill="none" stroke="#000000" stroke-width="4" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
</svg>
```

The string for `fixtures/stroke-draw/path-length-100-drawn-50.svg` is that same document with `stroke-dashoffset="50"`. The string for `fixtures/stroke-draw/path-length-100-drawn-100.svg` is that same document with `stroke-dashoffset="0"`. Each golden string is that document and nothing else. Comparison is the quantized SVG string in [[sot:svgif/determinism]].

`text.handwritingReveal` and `path.trim` stay tier `later`. This record does not promote either type to v1 and does not edit the catalogue. H-044 owns the catalogue file. Circular progress types that depend on the same attributes stay at their current tier.

The three renders pass only after a separate vision review session. The session uses the designated vision review model chosen by the launcher. This record does not open that session.

## Why

Handwriting reveal, path trim, and circular progress all need a normalized length and an offset the compilers can key. A special case per type would fork the backends. One keyed `pathLength` and one keyed `dashoffset` keep the draw-on on the same timeline as every other stroke attribute.

## Verification

`WP-STROKE-DRAW`. The fixture is the one path above. The golden files are `fixtures/stroke-draw/path-length-100-drawn-0.svg`, `fixtures/stroke-draw/path-length-100-drawn-50.svg`, and `fixtures/stroke-draw/path-length-100-drawn-100.svg`. A separate vision review session passes those three renders. The session uses the designated vision review model chosen by the launcher.
