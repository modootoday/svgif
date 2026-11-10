---
id: sot:svgif/roadmap
title: Roadmap
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [roadmap]
rel:
  depends_on:
    - plan:svgif/20261110122000
---

# Roadmap

## Rule

The canonical order is [[plan:svgif/20261110122000]]. This page is the milestone list. Sizes are module counts, not dates.

| Milestone | Outcome | Done when |
| --- | --- | --- |
| M0 | Schema registry frozen | `node scripts/ci/check-schema.mjs` |
| M1 | Math, scene, IR, clock | Unit tests for those packages |
| M2 | Three backends and lowering | Golden SVG for css-external, css-embedded, and smil |
| M3 | 3D projection and bake | Golden SVG for the box fixture |
| M4 | Player | Scrub and static mount tests |
| M5 | Exporters | HTML, SVG, WebP, WebM, MP4 signatures |
| M6 | Studio UI, load/save, copy-source, relay | The tier-1 rows for those features |
| M7 | Docs in priority order | P0 `/`, then P1 `/studio/`, then P2 `/docs/guides/`, then P3 `/docs/reference/api/`. The docs home is `/docs/` |
| M8 | Studio live at `/studio/` | The live URL serves `data-svgif-studio="app"` |
| M9 | Optional agent surface | CLI, MCP, public skills, and repo install manifests. Starts after M0 and the core engine. Does not block M6 or M8 |
| M10 | External embed | Static oEmbed, card meta, and `/embed/` on Pages. Starts after HTML, WebP, and MP4 export. Does not block M6 or M8 |

A product release is not a milestone shortcut. `v0.1.0` waits until M0, the sensitive-content gate, and the full scenario manifest in [[sot:svgif/release-gate]] are green on the same commit. Docs work is sequenced P0, P1, P2, P3 inside M7, and the Pages check fails at the first missing priority.

M0 through M10 keep these numbers. The Thumly app (`apps/thumly`) starts only after M0 has merged. Live pages are the landing at `/`, Studio at `/studio/`, and the docs home at `/docs/`. The old `/svgif/` URLs are removed. Do not add redirects for them. The Pages host change to `https://thumly.io` is not a milestone gate in front of M0. [[adr:svgif/20261110154621]]

## Why

Milestone ids are how parallel work packages name their entrances. The plan holds the dependency edges.

## Verification

`spec check` resolves this id and the plan id. The release self-test does not require M8 to be implemented; dispatching a release before the manifest exists fails closed.
