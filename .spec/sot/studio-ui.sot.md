---
id: sot:svgif/studio-ui
title: Studio composition editor
status: active
created: 2026-11-10T18:17:51Z
updated: 2026-11-14T11:20:00Z
rel:
  depends_on:
    - adr:svgif/20261110173419
    - adr:svgif/20261110181452
    - adr:svgif/20261114074819
    - sot:svgif/studio-export
    - sot:svgif/animation-ir
tags: [studio, ui]
verify: [bash scripts/ci/studio-shell.sh, node scripts/ci/render-preset-index.mjs --check]
---

# Studio composition editor

## Rule

Simple mode is Studio's default entry. Advanced keeps the artboard, the library, the inspector, and the per-layer timeline. A segmented switch in the top bar shows Simple and Advanced together. The active option is marked with `aria-pressed` true, and the other option is marked false. The choice is remembered. [[adr:svgif/20261114074819]]

The page accepts an explicit mode in the URL: `?mode=simple` and `?mode=advanced`. The URL wins over the remembered choice. Loading either URL leaves the remembered choice as it was. The remembered choice changes only when the person uses the toggle. A first visit, with no URL mode and no remembered choice, opens Simple mode. The mode comes from that URL and from the remembered choice. A user-agent string, a webdriver flag, or a headless check is outside this record.

Simple mode is a plain-language panel. It shows none of the timeline, track names, a JSON dump, or a Frame field. It also stays clear of keyframes, property paths (`attr.d`, `transform.*`), frame numbers, hex input as the only color path, codec or backend names, capability tables, and preset slugs. Those stay in Advanced. Templates, motions, length, undo, and plain download are later work. Simple mode leaves labelled placeholders for them.

In Simple mode a person selects an element on the artboard by tapping or clicking it. The selection shows an outline and corner handles around the pose drawn at the current frame. Dragging the element body adds the same artboard delta to every key of its horizontal and vertical position. A position track that is missing gains one key at frame 0. Dragging a corner handle scales every shape key by the same amount, about one anchor in artboard space. That scale comes from the bounds of the pose at the current frame. Each shape key keeps its command list. Move is one action. Resize is one action. The drag does not add a key at the current frame, so the motion between keys stays. Simple mode has no coordinate fields. Each handle has a hit area of at least 44 by 44 CSS pixels, including at 390×844. Pointer events serve the mouse and touch. A blank project starts with one shape, so there is something to select. That shape is not a template. An opened project is left as it was.

Advanced is the composition editor. The artboard is a direct overlay and is the default surface in Advanced. A person places elements, stacks them as layers, sets free position and z-order, and groups them. The person configures each element. The shell sizes stay the sizes in [[adr:svgif/20261110173419]]. [[adr:svgif/20261110181452]] keeps the overlay model and the unbounded preset registry.

Preview and export stay [[sot:svgif/studio-export]]. Tracks stay [[sot:svgif/animation-ir]].

The library is the generated index of `presets/`. Studio does not contain a hardcoded list of preset ids or categories. Search reads that index. Adding a preset file or a category directory requires no Studio code change. A v1 category is a type id from the catalogue. H-044 owns that file.

Elements on the artboard are scene nodes. Layers are those scene nodes. Reordering a layer reorders the node.

The property controls follow the selected node.

Each node has its own timeline. An edit on that timeline changes that node's tracks.

A motion preset is a reusable animation block applied to one node. Applying it writes the block onto that node's tracks. It does not add a second timeline.

In Advanced, the artboard is the default surface.

## Definition of done

Studio UI is done when a person can add a component, overlay and transform and z-order, group, apply a motion preset, edit the per-layer timeline, and save and load the composition round-trip. Studio UI acceptance also needs a separate vision review session. The launcher starts it. The record names only the designated vision review model chosen by the launcher. This package does not open that session.

## Shell

The shell is a full-viewport grid of `100dvh` with `overflow: hidden`. There is no page-level horizontal or vertical scroll at any viewport. That is the no-page-scroll rule. Scroll and pan happen only inside panels and in the artboard transform. After a panel collapses or a sash moves, the artboard fits. The sizes below are the Advanced shell. They stay the sizes in [[adr:svgif/20261110173419]]. Simple mode uses the same full-viewport grid and the same no-page-scroll rule. The Simple / Advanced segmented switch is in the top bar. Both names are visible. The active option has aria-pressed true and the other option has aria-pressed false.

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
- Simple mode is the default entry. In Advanced, the artboard is the default surface.
- In Simple mode, selecting an element shows an outline and handles around the pose at the current frame. A body drag shifts every position key by the same delta. A corner drag scales every shape key about one artboard anchor.

## Preset index

`scripts/ci/render-preset-index.mjs` walks `presets/<category>/<id>.json` and writes `presets/index.json`. The index is generated. It is not a hand-written catalogue. Each entry records that file's category, id, and path. The array is ordered by category, then id. Zero presets writes an empty `presets` array. `--check` fails when the committed index differs from that walk. `presets/index.json` is the index, not a preset document. A golden SVG beside a preset is not an index entry.

## Vision review

The vision review is a separate session. The launcher starts it. This package does not open that session. The designated vision review model chosen by the launcher reviews the capture. The capture is the shell at 1440×900, 1024×768, 390×844, and 360×640. The criteria are layout fit with no page scroll, alignment, contrast, spacing, and motion smoothness. The report is one row per viewport. Each criterion is `pass` or `fail`. The review fails if any viewport fails.

## Why

One editor model keeps the artboard, the library, the layers, and each node's timeline on the same scene. Elements stack on that artboard with free position, z-order, and groups. A preset that added a second timeline would split the tracks the sampler reads. Simple mode is the entry. The segmented switch shows both names, so the current mode is a choice rather than a label. Direct manipulation moves or resizes the whole element, including the motion it already has. Advanced keeps its own artboard drag, which writes a key at the playhead. Advanced keeps that artboard as its default surface. A hardcoded list of preset ids would make a new preset file a code change. The generated index is what Advanced search reads.

## Verification

`bash scripts/ci/studio-shell.sh` is the shell check. The viewports are 1440×900, 1024×768, 390×844, and 360×640. A shell page is `apps/studio/dist/index.html` when that file exists, otherwise `apps/studio/index.html`. Until one of those files exists, the script passes when this record names those four sizes and the no-page-scroll rule. When a shell page exists, the same script loads `?mode=advanced` for the existing assertions at those four viewports and fails unless at each of those sizes the document `scrollWidth` is at most `clientWidth` and `scrollHeight` is at most `clientHeight`. On the default load, with no mode parameter, the same script asserts Simple mode at those four viewports: the timeline, track names, the JSON dump, and the Frame field are not visible, the document does not scroll, and the segmented switch shows both names. The active option is aria-pressed true and the other is false. Choosing Advanced switches the page to Advanced. At 1440×900 and at 390×844 the same script selects the blank shape, checks the outline and the handles, drags once, and checks that the position changed by that drag in artboard units. It then drags one handle and checks that the shape resized. At 390×844 the pointer is touch. Each handle's hit area is at least 44 by 44 CSS pixels. The check does not read a user-agent string, a webdriver flag, or a headless check. The check adds no dependency. The composition rows in [[plan:svgif/20261110122000]] stay a component test. This record does not build `apps/studio/`.

`node scripts/ci/render-preset-index.mjs --check` is the preset index check. It passes when `presets/index.json` matches the walk, including when that walk finds zero preset files.
