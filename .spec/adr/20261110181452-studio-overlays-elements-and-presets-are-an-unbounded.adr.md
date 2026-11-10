---
id: adr:svgif/20261110181452
title: Studio overlays elements and presets are an unbounded registry
status: active
created: 2026-11-10T18:14:52Z
updated: 2026-11-10T18:17:04Z
rel:
  depends_on: [adr:svgif/20261110173419, sot:svgif/product-intent, sot:svgif/licensing]
---

# Studio overlays elements and presets are an unbounded registry

## Context

[[adr:svgif/20261110173419]] records Studio as a composition editor and records the app shell. This decision extends that model. A person places elements on the artboard, and component presets are files in a registry with no maximum count. The shell sizes stay in that earlier decision. This decision does not restate them and does not change them. It does not create `presets/` or `apps/studio/`.

## Decision

1. A person places elements directly on the artboard. Elements stack as layers, with free placement, z-order, and grouping. The person configures each element. Studio is an overlay and composition editor. It is not a template editor. A template is a starting point and is not the default tab. The artboard is the default surface. The app shell stays the shell recorded in [[adr:svgif/20261110173419]].
2. A component preset is one file under `presets/`. The file holds a component definition, default parameters, and an optional motion preset. The registry has no maximum count. It grows by adding files. Studio does not keep a hardcoded list of preset ids. Studio reads a generated index. Adding a preset or a category does not require a code change.

## Catalogue and engine gaps

The catalogue extract is `.agents/handoff/assignments/catalogue-components.v1.json`. It has 536 types, 19 categories, and tiers v1 476, later 56, and out 4. H-044 copies it to `schema/catalogue/` and writes the catalogue record `sot:svgif/component-catalogue`. H-049 writes the locomotion record `sot:svgif/locomotion`. The engine gaps are H-045 (`sot:svgif/node-pivot`), H-046 (`sot:svgif/node-hierarchy`), H-047 (`sot:svgif/symbol-instance`), H-048 (`sot:svgif/cycle-metadata`), H-050 (`sot:svgif/stroke-draw`), and H-051 (`sot:svgif/seeded-particles`). Out of scope, with no work package: skeletal IK, live boolean operations, and live audio FFT. A bone hierarchy is not a package. The v1 method is a cutout rig.

## Consequences

[[sot:svgif/product-intent]] states that Studio overlays elements on the artboard and is not a template editor, and that component presets live in `presets/` with no fixed count. [[sot:svgif/licensing]] covers a preset file under the repository license. [[plan:svgif/20261110122000]] names the overlay and preset checks at milestone M6. Those rows stay unchecked.

The org chart gives this file to `govern`. It gives `presets/` and `scripts/ci/render-preset-index.mjs` to `studio`. It gives `sot:svgif/preset-registry`, `scripts/ci/check-presets.mjs`, `sot:svgif/component-catalogue`, and `scripts/ci/preset-coverage.mjs` to `schema`. It gives `sot:svgif/locomotion`, `sot:svgif/cycle-metadata`, and `sot:svgif/stroke-draw` to `animation`. It gives `sot:svgif/node-pivot`, `sot:svgif/node-hierarchy`, and `sot:svgif/seeded-particles` to `scene`. It gives `sot:svgif/symbol-instance` to `export`.
