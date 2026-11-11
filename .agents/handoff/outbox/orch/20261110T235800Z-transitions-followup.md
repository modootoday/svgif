---
handoff: 1
id: 20261110T235800Z-transitions-followup
from: orch
to: owner
wp: WP-PRESET-TRANSITIONS-MARKS
milestone: M6
status: done
branch: cursor/transitions-followup-9f5d
pr: https://github.com/modootoday/svgif/pull/201
paths:
  - .agents/handoff/assignments/H-107.md
  - .agents/handoff/assignments/H-120.md
  - .agents/handoff/assignments/H-121.md
  - .agents/handoff/outbox/studio/H-107.md
---

# Handoff 20261110T235800Z-transitions-followup

## State

The re-review of the transitions merged in https://github.com/modootoday/svgif/pull/188 passed 6 of 9. Fade, slide, wipe, iris, zoom, and scale-pop passed. Crossfade, push, and mask-reveal still fail.

## Done

- Marked H-107 `done` at `8c45941`. The assignment file on main still said `assigned`.
- Corrected the H-107 outbox. Slide direction is `right`: the card enters from the left. The push cards do not overlap, and the solid fill is not a punch-through guard.
- Filed H-120, `studio`, `assigned`, `presets/transitions/` only. Push gets the two marks. Mask-reveal starts from the zero-height band. Wipe, iris, and mask-reveal drop the frame 0 to 1 opacity tracks. Zoom opacity runs over frames 0–6.
- Filed H-121, `studio`, `blocked` on H-120 and H-110. Crossfade becomes two layers after the generator can emit them.
- H-110, on https://github.com/modootoday/svgif/pull/190, gains ordered artwork layers. It is not a new package.

## Next

Launch H-120 now. Launch H-121 after H-120 and H-110.

## Blockers

None for this bookkeeping.

## Links

- Work package: `WP-PRESET-TRANSITIONS-MARKS`
- Branch: `cursor/transitions-followup-9f5d`
- Pull request: https://github.com/modootoday/svgif/pull/201
