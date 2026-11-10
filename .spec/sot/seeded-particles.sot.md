---
id: sot:svgif/seeded-particles
title: Seeded particles
status: active
created: 2026-11-10T18:31:16Z
updated: 2026-11-10T18:32:15Z
rel:
  depends_on: [sot:svgif/scene-3d, sot:svgif/determinism, adr:svgif/20261110181452]
tags: [particles, determinism]
verify: [manual]
---

# Seeded particles

## Rule

A particle node stores `seed` as a finite integer. Sampling does not read `Math.random`, `Date.now`, or `performance.now`. Each instance is a pure function of that seed, the integer `frame`, the instance index, and the instance count. The emitted document is SVG, quantized the same way as every other frame. [[sot:svgif/determinism]] [[sot:svgif/scene-3d]]

The same seed, the same frame, and the same count produce the same SVG string on every run. A different seed may produce a different string.

### Fixed count

v1 acceptance is a fixed count on the node. The count is an integer from 0 through 40 inclusive. The count does not change with the frame. v1 has no emitter.

The golden files for that acceptance are:

- `packages/svgif/test/fixtures/seeded-particles/seed-1.frame-0.svg` for seed `1`, count `40`, frame `0`
- `packages/svgif/test/fixtures/seeded-particles/seed-2.frame-0.svg` for seed `2`, count `40`, frame `0`

A second run of seed `1` at frame `0` with count `40` matches `packages/svgif/test/fixtures/seeded-particles/seed-1.frame-0.svg`. The seed `2` file differs from the seed `1` file.

A separate vision review session passes those two renders. The session uses the designated vision review model chosen by the launcher. The fixed-count acceptance is not done until that session passes. This record does not open that session.

### Later emitter

The later acceptance is an emitter. The instance count changes over time, and the seed on the node stays the same. The same seed, the same frame, and the count at that frame still produce the same SVG string on every run.

The later golden files are:

- `packages/svgif/test/fixtures/seeded-particles/seed-1.emitter.frame-0.svg` for seed `1` at frame `0`
- `packages/svgif/test/fixtures/seeded-particles/seed-1.emitter.frame-30.svg` for seed `1` at frame `30`

The count at frame `30` may differ from the count at frame `0`. This emitter acceptance is recorded here. It is not a release blocker.

## Why

A fixed count keeps a v1 effect repeatable. The integer seed is the only source of variation, so a golden SVG can be compared as a string. The emitter is that same rule with a count that follows the frame, and it can land after the fixed-count acceptance.

## Out of scope

This record does not define a pivot or a parent-child transform. Skeletal IK, live boolean operations, and live audio FFT are out of scope and have no work package.

## Verification

When the two fixed-count files exist, a test renders seed `1` twice and seed `2` once at frame `0` with count `40`, and compares the SVG strings. The emitter files are not required for that test and are not a release blocker. The vision review is a separate session.
