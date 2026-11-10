---
handoff: 1
id: H-076-FILED
from: orch
to: orch
wp: WP-COMPONENT-ID
milestone: M6
status: assigned
branch: cursor/component-id-9f5d
pr: "https://github.com/modootoday/svgif/pull/115"
paths:
  - .agents/handoff/assignments/H-076.md
  - .agents/handoff/outbox/orch/H-076-FILED.md
---

# Handoff H-076 filed

## State

Commit `1c05a77`. H-070 is running and was not extended. H-071 confirmed the pathfx ids. H-072 confirmed the seven audio ids. H-075 confirmed `mock.chatBubble`, `mock.circleCrop`, `mock.speechPanel`, and `mock.statusBar`. All three are the same `component.id` pattern. Their preset paths were not edited.

## Done

H-076 is `assigned` to `schema` on `schema/wp-component-id`. One widened grammar matches every catalogue type id, including the four mockups ids from H-075. Wave 1 v1 ids rejected by the current pattern: pathfx 2 of 7, audio 7 of 8, transitions 2 of 9, camera 1 of 9, mockups 4 of 12.

## Next

Launch H-076. Do not merge the blocked pathfx, audio, or mockups pull requests. Those sessions rework the presets after H-076 merges.

## Blockers

None for this filing.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/115

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
