---
handoff: 1
id: 20261110T222600Z-golden-frames-done
from: orch
to: owner
wp: WP-GOLDEN-FRAMES
milestone: M6
status: done
branch: cursor/golden-frames-done-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-078.md
  - .agents/handoff/assignments/H-079.md
  - .agents/handoff/assignments/H-080.md
  - .agents/handoff/assignments/H-081.md
  - .agents/handoff/assignments/H-082.md
  - .agents/handoff/assignments/H-094.md
  - .agents/handoff/assignments/H-097.md
---

# Handoff 20261110T222600Z-golden-frames-done

## State

H-094 is merged at `4e72c69`. The default preset walk stays green. `--goldens` still fails while the committed goldens differ from the generator.

## Done

- Marked H-094 `done`. The painted clip sample is in `--goldens`.
- Set H-097 to `assigned`.
- H-078 through H-082 now wait on H-090, H-085, and H-091.

## Next

Launch H-097. Hold wave 2 until the three studio fixes merge.

## Blockers

None.

## Links

- H-094: https://github.com/modootoday/svgif/pull/147 at `4e72c69`

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
