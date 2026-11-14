---
id: adr:svgif/20261110173419
title: Studio is a composition editor
status: active
created: 2026-11-10T17:34:19Z
updated: 2026-11-14T07:48:19Z
rel:
  depends_on: [sot:svgif/product-intent, sot:svgif/studio-export, adr:svgif/20261110121400]
---

# Studio is a composition editor

## Context

Studio is the static editor a person opens at `/studio/`. [[adr:svgif/20261110121400]] [[sot:svgif/product-intent]] Preview and export stay in the browser. [[sot:svgif/studio-export]] This decision records how that person builds a composition on the artboard. It does not create `apps/studio/`, and the library is not claimed to already run.

## Decision

1. A person builds an animated SVG on an artboard by adding components from a library. The library holds shapes, text, icons and stickers, 3D primitives, and motion presets.
2. Each placed component is a scene node. The layer list is those nodes. Reordering a layer reorders the node.
3. The properties shown depend on the selected node.
4. Each node has its own timeline. Editing that timeline edits that node's tracks.
5. A motion preset is a reusable animation block. Applying it to a node writes that block onto the node's tracks. It does not create a second timeline.
6. A template is a starting point. It is not the default tab. The artboard is the default surface.
7. The app shell is part of this decision. The Shell section records it. The sizes there are exact.

Simple mode is the default entry, and the artboard shell recorded here stays Advanced. [[adr:svgif/20261114074819]]

## Shell

The shell is a full-viewport grid of `100dvh` with `overflow: hidden`. There is no page-level horizontal or vertical scroll at any viewport. Scroll and pan happen only inside panels and in the artboard transform. After a panel collapses or a sash moves, the artboard fits.

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

## Consequences

[[sot:svgif/product-intent]] states that Studio is this composition editor. [[plan:svgif/20261110122000]] names the composition checks and the shell checks at milestone M6. Those rows stay unchecked.

`sot:svgif/studio-ui` is the Studio record of this model. [[sot:svgif/animation-ir]] stays the timeline record. The org chart gives this file to `govern`, `sot:svgif/studio-ui` and `scripts/ci/studio-shell.sh` to `studio`, and [[sot:svgif/animation-ir]] to `animation`.
