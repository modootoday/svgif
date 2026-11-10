---
handoff: 1
id: H-092-FILED
from: orch
to: orch
wp: WP-CSS-CLIP
milestone: M2
status: done
branch: cursor/mp4-done-9f5d
pr: https://github.com/modootoday/svgif/pull/141
paths:
  - .agents/handoff/assignments/H-092.md
  - .agents/handoff/assignments/H-093.md
  - .agents/handoff/outbox/orch/H-092-FILED.md
---

# Handoff clip compiler and second engine

## State

Commit `fd36f35`. The transitions re-review passed five presets and failed slide, wipe, iris, and maskReveal. H-088 has no pull request yet.

## Done

H-092 is `blocked` on H-086. It moves clip and shape geometry onto SMIL and leaves CSS for transform and opacity. H-084 is blocked on H-088 and H-092, and it fixes slide and maskReveal while regenerating the transitions. H-093 is `assigned` to release. The allowlist permits no runtime package, so the second engine is that review rather than a dependency added in the generator.

The mid-frame and full-reveal rules are in [[sot:svgif/preset-registry]].

## Next

Do not launch H-092 until H-086 has merged. Launch H-093. H-088 stays launchable and does not call a second engine.

## Blockers

None for this filing.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/141

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
