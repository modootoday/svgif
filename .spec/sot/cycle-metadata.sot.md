---
id: sot:svgif/cycle-metadata
title: Cycle metadata
status: active
created: 2026-11-10T18:33:43Z
updated: 2026-11-10T18:38:34Z
rel:
  depends_on: [sot:svgif/animation-ir, sot:svgif/determinism]
tags: [animation, cycle]
verify: manual
---

# Cycle metadata

## Rule

A cycle names `stridePx`, `cycleMs`, and a contact flag on each planted foot. Its keys are loop-safe: the first pose equals the last pose, and the last frame is not drawn twice.

### Fields

1. `stridePx` is the stride in px. Over one step the root travels this far.
2. `cycleMs` is the length of one cycle in milliseconds.
3. Each foot has a contact flag. The flag is true on the drawn frames of one plant. Across those frames the planted foot's world position stays the same.

`groundSpeed = stride / stepTime`. `stride` is `stridePx` in px. `stepTime` is the step length in seconds. `sot:svgif/locomotion` is not a file yet, so this record holds that formula.

### Loop-safe keys

Drawn frames follow [[sot:svgif/animation-ir]]: `sample(ir, frame)` reads `0 .. durationInFrames - 1`.

The last pose is the key at frame `durationInFrames`. It equals the local pose at frame 0. That key is the cycle boundary. Playback and export draw frames `0 .. durationInFrames - 1` only, so the boundary is not drawn as a second copy of the first pose.

The local pose is the joint channels and the contact flags. Root travel is `groundSpeed` over time. It is not one of the looping keys, so the body can advance while the local pose repeats.

### Acceptance fixture

The fixture id is `biped-stride-80-cycle-1000`.

| Field | Value |
| --- | --- |
| `stridePx` | 80 |
| `cycleMs` | 1000 |
| fps | 24 |
| `durationInFrames` | 24 |
| drawn frames | 0 through 23 |
| boundary key | frame 24, equal to the local pose at frame 0, not drawn |
| biped step time | 500 ms |
| ground speed | 160 px per second |

The biped step time is half the cycle. `80 / 0.5 = 160`. From drawn frame 0 to drawn frame 12 the root's world x moves from 0 to 80.

Contact flags in this fixture:

| Foot | Contact frames | World x |
| --- | --- | --- |
| `footL` | 0 through 11 | 0 |
| `footR` | 12 through 23 | 80 |

Root world x at drawn frame `f` is `160 * f / 24` px. Golden SVG numbers are quantized to `1e-4`. [[sot:svgif/determinism]]

### Golden files

The acceptance renders are these files. Frame 24 has no file: that pose is frame 0, and it is not drawn again.

- `packages/svgif/test/fixtures/cycle/biped-stride-80-cycle-1000/frame-00.svg`
- `packages/svgif/test/fixtures/cycle/biped-stride-80-cycle-1000/frame-11.svg`
- `packages/svgif/test/fixtures/cycle/biped-stride-80-cycle-1000/frame-12.svg`
- `packages/svgif/test/fixtures/cycle/biped-stride-80-cycle-1000/frame-23.svg`

`frame-00.svg` and `frame-12.svg` are the 160 px per second golden. The root advances 80 px in 500 ms. `frame-00.svg` with `frame-11.svg` holds `footL` at world x 0. `frame-12.svg` with `frame-23.svg` holds `footR` at world x 80.

A separate vision review session passes these renders. The session is the designated vision review model chosen by the launcher.

## Why

Stride, cycle length, and a contact flag are what keep a planted foot still in world space while the root moves at `stride / stepTime`. The boundary key matches frame 0 so the cycle can repeat, and leaving that key out of the drawn frames keeps the first pose from appearing twice.

## Verification

`WP-CYCLE-METADATA`. The fixture in this record is the check. The four golden files are the quantized SVG for the named frames. On each contact run the planted foot's world x is constant. The boundary key at frame 24 equals the local pose at frame 0 and is outside the drawn set. The renders count as accepted when the vision review session passes.
