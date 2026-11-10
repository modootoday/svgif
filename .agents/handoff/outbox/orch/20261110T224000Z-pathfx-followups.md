---
handoff: 1
id: 20261110T224000Z-pathfx-followups
from: orch
to: owner
wp: WP-PRESET-PATHFX-REFIX
milestone: M6
status: done
branch: cursor/pathfx-followups-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-084.md
  - .agents/handoff/assignments/H-099.md
  - .agents/handoff/assignments/H-100.md
  - .agents/handoff/assignments/H-101.md
  - .agents/handoff/assignments/H-102.md
---

# Handoff 20261110T224000Z-pathfx-followups

## State

The pathfx visual review on `26bd143` passed 0 of 7. The H-085 structural fixes hold. The new defects are split by owner.

## Done

- Filed H-099 for the filter-element keys and the `scene` parameter.
- Filed H-100 for the generator: drop constant tracks and invisible elements, honour `scene`, sample SMIL frames as pixels, and check one light stage.
- Filed H-101 for the SMIL compiler, blocked on H-096. It leaves `presets/pathfx/` alone.
- Filed H-102 for the pathfx refix, blocked on H-099, H-100, and H-101.
- Told H-084 not to regenerate `presets/pathfx/`.

## Next

Launch H-099 and H-100. Launch H-101 after H-096 merges. Launch H-102 after H-099, H-100, and H-101 merge. `--goldens` already rewrites categories that drift from the generator. H-100 records those paths and does not commit them. A later cleanup regenerates the leftovers after the open studio packages merge.

## Blockers

None.

## Links

- Review commit: `26bd143`
- H-085: https://github.com/modootoday/svgif/pull/154 at `005f67b`

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
