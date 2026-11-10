---
handoff: 1
id: H-086-FILED
from: orch
to: orch
wp: WP-CSS-KEYS
milestone: M2
status: done
branch: cursor/css-audio-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-084.md
  - .agents/handoff/assignments/H-085.md
  - .agents/handoff/assignments/H-086.md
  - .agents/handoff/assignments/H-087.md
  - .agents/handoff/outbox/orch/H-086-FILED.md
---

# Handoff CSS keyframes and the audio follow-up

## State

Commit `e1e7b7f`. The audio review failed. Those goldens use the CSS backend. H-083 remains the SMIL duration fix and does not share this path.

## Done

H-086 is `assigned` to `animation` on `animation/wp-css-keys`. It emits keyframes only for changing properties, puts the last keyframe at 100 percent without a duplicated rest pose, and honours a loop setting. The size guard lives in the CSS test.

H-087 is `blocked` on H-083 and H-086. It owns `presets/audio/` and applies the audio choreography fixes. H-084 no longer includes `presets/audio/`.

The tempo, attack, anchor, and contrast rules are in [[sot:svgif/preset-registry]], the release-gate preset row, and the plan. Wave 2 assignments cite them.

## Next

Launch H-086 beside H-083. Do not launch H-087 until both have merged.

## Blockers

None for H-086.

## Links

- Assignment: H-086
- Branch: `animation/wp-css-keys`

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
