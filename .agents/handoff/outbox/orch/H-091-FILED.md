---
handoff: 1
id: H-091-FILED
from: orch
to: orch
wp: WP-PRESET-MOCKUPS-FIX
milestone: M6
status: done
branch: cursor/css-audio-9f5d
pr: https://github.com/modootoday/svgif/pull/138
paths:
  - .agents/handoff/assignments/H-091.md
  - .agents/handoff/assignments/H-084.md
  - .agents/handoff/outbox/orch/H-091-FILED.md
---

# Handoff mockups follow-up

## State

Commit `bcccf8b`. The mockups review failed on the missing SMIL `dur` and on layout. H-084 no longer owns `presets/mockups/`.

## Done

H-091 is `blocked` on H-083 and H-088. It animates one wrapper, replaces the opacity dip with a visible eased move, makes each mockup read as its object, fixes spacing and the stamp teeth, raises contrast, and leaves the stage to the shared fixture. The wrapper and stage rules are in [[sot:svgif/preset-registry]].

## Next

Do not launch H-091 until H-083 and H-088 have merged.

## Blockers

None for this filing.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/138

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
