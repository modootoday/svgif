---
handoff: 1
id: H-142
from: orch
to: studio
wp: WP-PRESET-CROSSFADE-FOLLOWUP
milestone: M6
status: assigned
branch: cursor/crossfade-followup-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-127.md
  - .agents/handoff/assignments/H-129.md
  - .agents/handoff/assignments/H-142.md
  - .agents/handoff/outbox/orch/20261111T022500Z-crossfade-followup.md
---

# Handoff

## State

`main` is `36fcf4c`. H-134 stays `done` at `fefec54`. The review of https://github.com/modootoday/svgif/pull/247 passed 15 of 16. `trans-crossfade` fails because the outgoing card stays opaque through the incoming cut-out.

## Done

H-142 is `assigned` and owns `presets/transitions/` and `presets/pathfx/`. The outgoing crossfade fades from frame 18 to frame 24. The darkness rule is CIE L* 0.5 below the darker endpoint, measured on the card body. The incoming crossfade, the push, and the drop shadow use `cubic-bezier(0.4, 0, 0.4, 1)`. The iris uses `cubic-bezier(0.4, 0, 0.2, 1)`. Outbox claims must come from a raster of frame 0, the mid frame, and the last frame.

H-127 has no pull request, so the checker additions stay on that package. Measure the band on the dominant visible track, not a short opacity fade. Reveal completion uses rasterised visible coverage, not a `clip-path` string compare. H-129 waits on H-142.

## Next

Launch H-142. It does not wait on H-127.

## Blockers

None for this bookkeeping.

## Links

- Pull request: open against `main`. Do not stack it.
