---
handoff: 1
id: H-136
from: orch
to: scene
wp: WP-CAMERA-BAKE-HOLD
milestone: M6
status: assigned
branch: cursor/camera-bake-hold-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-127.md
  - .agents/handoff/assignments/H-129.md
  - .agents/handoff/assignments/H-130.md
  - .agents/handoff/assignments/H-136.md
  - .agents/handoff/assignments/H-137.md
  - .agents/handoff/outbox/orch/20261111T020000Z-camera-bake-hold.md
---

# Handoff

## State

`main` is `ed31b34`. https://github.com/modootoday/svgif/pull/236 was squash-merged. The required checks passed. The diff is the studio outbox plus the dolly, orbit, and parallax documents and goldens.

## Done

H-130 is `partial`, not `done`. Dolly, orbit, and parallax match the review tracks. Parallax travel is a slab of 50 px and a cube of 30.497 px. The cut golden still has 25 linear `keyTimes`. The baker writes one path key per frame and drops the hold, so H-128's repeated `keyTime` never reaches it.

H-136 is `assigned` to `scene`. It owns `packages/svgif/src/bake/` and `packages/svgif/test/bake.test.ts`. A hold bakes to a repeated `keyTime`. An eased segment stays one eased span. The package does not commit a golden.

H-137 is `blocked` on H-136. It regenerates only `presets/camera/camera-cut.golden.svg` and restores every other file. The camera review runs after H-137, not after this partial.

H-127, which is running, now pins the parallax travel at 50 px and 30.497 px. H-129 waits on H-137 instead of H-130. The dolly, orbit, and parallax goldens are already on `main`.

## Next

Launch H-136. Leave H-137 `blocked` until that bake has merged.

## Blockers

None for this bookkeeping.

## Links

- Merged pull request: https://github.com/modootoday/svgif/pull/236
- Pull request: open against `main`
