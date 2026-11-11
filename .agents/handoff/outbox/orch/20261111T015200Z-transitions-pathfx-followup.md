---
handoff: 1
id: H-134
from: orch
to: studio
wp: WP-PRESET-TRANSITIONS-PATHFX-FOLLOWUP
milestone: M6
status: assigned
branch: cursor/transitions-pathfx-followup-9f5d
pr: https://github.com/modootoday/svgif/pull/235
paths:
  - .agents/handoff/assignments/H-127.md
  - .agents/handoff/assignments/H-129.md
  - .agents/handoff/assignments/H-134.md
  - .agents/handoff/outbox/orch/20261111T015200Z-transitions-pathfx-followup.md
---

# Handoff

## State

`main` is `21e80c6`. The transitions and pathfx review of H-121 passed 15 of 16, including `filter-drop-shadow`. `trans-crossfade` fails.

## Done

H-134 is `assigned`. It owns `presets/transitions/` and `presets/pathfx/`. Both directories are free. The outgoing crossfade card holds opacity 1. The incoming card fades 0 to 1 on top, with the right-hand cut-out and `{ "name": "scene", "value": false }`. Push turns the scene off and paints the incoming card `#ff8a00` against the outgoing `#7c5cff`. Drop-shadow easing becomes `cubic-bezier(0.4, 0, 0.2, 1)`. The iris end radius becomes 120. The package regenerates both categories and restores every other one.

H-127 is still `assigned` and owns `scripts/ci/check-presets.mjs`, so the sampler fix is folded into it. The check must rasterise with SMIL seeked. Computed style reports `filter-drop-shadow`, `trans-wipe`, `trans-iris`, and `trans-mask-reveal` as still, while Chrome shows those frame-0 and frame-12 pairs differ by 16260, 47104, 78409, and 79844 pixels at 2x. No second assignment edits that script. H-117 and H-133 stay `blocked`.

H-129 now waits on H-134 as well. The review runs after H-134 merges.

## Next

Launch H-134. It does not share a path with H-112, H-113, H-123, H-125, H-130, or H-132.

## Blockers

None for this bookkeeping.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/235
