---
handoff: 1
id: 20261110T222100Z-preset-loop-map
from: orch
to: owner
wp: WP-PRESET-LOOP
milestone: M6
status: done
branch: cursor/preset-loop-map-9f5d
pr: ""
paths:
  - .spec/sot/preset-registry.sot.md
  - .agents/handoff/assignments/H-087.md
  - .agents/handoff/assignments/H-096.md
  - .agents/handoff/assignments/H-097.md
---

# Handoff 20261110T222100Z-preset-loop-map

## State

H-095 is merged. A preset still does not place `loop` on the timeline. The only preset-to-timeline function is `renderPresetGolden`.

## Done

- Recorded the parameter `{ "name": "loop", "value": true }` in [[sot:svgif/preset-registry]]. There is no top-level preset field.
- Filed H-097, blocked on H-094, to copy that parameter in `renderPresetGolden` and cover it with `--self-test`.
- Left the mapping out of H-096. The published package and Studio do not build a timeline from a preset.
- H-087 now waits on H-096 and H-097.

## Next

Launch H-097 after H-094 merges.

## Blockers

None.

## Links

- Rule: [[sot:svgif/preset-registry]]
- H-094: https://github.com/modootoday/svgif/pull/147

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
