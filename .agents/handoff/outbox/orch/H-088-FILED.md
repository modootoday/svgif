---
handoff: 1
id: H-088-FILED
from: orch
to: orch
wp: WP-PRESET-GOLDEN
milestone: M6
status: done
branch: cursor/css-audio-9f5d
pr: https://github.com/modootoday/svgif/pull/138
paths:
  - .agents/handoff/assignments/H-088.md
  - .agents/handoff/assignments/H-089.md
  - .agents/handoff/assignments/H-090.md
  - .agents/handoff/outbox/orch/H-088-FILED.md
---

# Handoff golden generator and camera

## State

Commit `e1e7b7f`. The camera review found hand-drawn goldens. H-084 has not launched. It now waits on the generator and no longer owns `presets/camera/`.

## Done

H-088 is `assigned` to `schema` on `schema/wp-preset-golden`. It commits the generator and the shared demo fixture. H-089 is `assigned` to `scene` on `scene/wp-camera-3d`. Dolly is camera depth and orbit is camera azimuth, using the existing cull and depth sort. H-090 is `blocked` on H-088 and H-089. It applies the camera choreography fixes and writes goldens only through the generator.

The composition, shake, parameter, and reproducibility rules are in [[sot:svgif/preset-registry]].

## Next

Launch H-088 and H-089. Do not launch H-090 until both have merged. Do not launch H-084 until H-088 has merged as well.

## Blockers

None for H-088 or H-089.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/138

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
