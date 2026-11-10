---
id: sot:svgif/studio-ui
title: Studio composition editor
status: active
created: 2026-11-10T18:17:51Z
updated: 2026-11-10T18:17:51Z
rel:
  depends_on: [adr:svgif/20261110173419, sot:svgif/studio-export, sot:svgif/animation-ir]
tags: [studio, ui]
verify: [bash scripts/ci/studio-shell.sh]
---

# Studio composition editor

## Rule

The artboard is where a person builds an animated SVG. [[adr:svgif/20261110173419]] Preview and export stay [[sot:svgif/studio-export]]. Tracks stay [[sot:svgif/animation-ir]].

The library holds shapes, text, icons and stickers, 3D primitives, and motion presets. Adding a shape, text, icon, sticker, or 3D primitive creates a scene node on the artboard.

Layers are those scene nodes. Reordering a layer reorders the node.

The property controls follow the selected node.

Each node has its own timeline. An edit on that timeline changes that node's tracks.

A motion preset is a reusable animation block applied to one node. Applying it writes the block onto that node's tracks. It does not add a second timeline.

A template is a starting point and is not the default tab. The artboard is the default surface.

## Shell

The shell is a full-viewport grid of `100dvh` with `overflow: hidden`. There is no page-level horizontal or vertical scroll at any viewport. That is the no-page-scroll rule. Scroll and pan happen only inside panels and in the artboard transform. After a panel collapses or a sash moves, the artboard fits.

Desktop, 1100px and wider:

- Top bar height 48.
- Rail width 48, plus a library width 280. The library resizes from 240 to 400 and collapses to 0.
- Artboard column `minmax(0, 1fr)`.
- Inspector width 300. It resizes from 260 to 400 and collapses.
- Per-layer timeline height 168. The minimum is 120. The maximum is the smaller of 360px and `40dvh`. It collapses to a transport of height 48.
- The splits between panels are resizable sashes.

Tablet, 768px through 1099px:

- Rail plus artboard.
- One overlay of width 320. It is either the library or the inspector, not both.
- Timeline height 120, maximum `32dvh`, or the transport of height 48.

Phone, below 768px:

- Top bar height 48 plus the safe area at the top.
- Artboard `1fr`.
- A bottom sheet snaps at `40dvh`, `70dvh`, and `90dvh`.
- Mode tabs are Preview, Library, Inspect, and Timeline. The tab row is height 56 plus the safe area at the bottom.

Interactions:

- Space is play and pause.
- Pan with H, the middle mouse button, or two fingers.
- A layer row and a timeline row share one id. Selecting a row selects that node in the inspector.
- The timeline has a filter named selected layer only.
- Templates are a starting point, not the default tab.

## Vision review

The vision review is a separate session. The launcher starts it. This package does not open that session. The designated vision review model chosen by the launcher reviews the capture. The capture is the shell at 1440×900, 1024×768, 390×844, and 360×640. The criteria are layout fit with no page scroll, alignment, contrast, spacing, and motion smoothness. The report is one row per viewport. Each criterion is `pass` or `fail`. The review fails if any viewport fails.

## Why

One editor model keeps the artboard, the library, the layers, and each node's timeline on the same scene. A preset that added a second timeline would split the tracks the sampler reads. A template that opened as the default tab would hide the artboard.

## Verification

`bash scripts/ci/studio-shell.sh` is the shell check. The viewports are 1440×900, 1024×768, 390×844, and 360×640. A shell page is `apps/studio/dist/index.html` when that file exists, otherwise `apps/studio/index.html`. Until one of those files exists, the script passes when this record names those four sizes and the no-page-scroll rule. When a shell page exists, the same script fails unless at each of those sizes the document `scrollWidth` is at most `clientWidth` and `scrollHeight` is at most `clientHeight`. The check adds no dependency. The composition rows in [[plan:svgif/20261110122000]] stay a component test. This record does not build `apps/studio/`.
