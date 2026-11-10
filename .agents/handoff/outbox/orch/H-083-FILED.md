---
handoff: 1
id: H-083-FILED
from: orch
to: orch
wp: WP-SMIL-DUR
milestone: M2
status: done
branch: cursor/audio-done-wave2-9f5d
pr: https://github.com/modootoday/svgif/pull/134
paths:
  - .agents/handoff/assignments/H-078.md
  - .agents/handoff/assignments/H-079.md
  - .agents/handoff/assignments/H-080.md
  - .agents/handoff/assignments/H-081.md
  - .agents/handoff/assignments/H-082.md
  - .agents/handoff/assignments/H-083.md
  - .agents/handoff/assignments/H-084.md
  - .agents/handoff/assignments/H-085.md
  - .agents/handoff/outbox/orch/H-083-FILED.md
---

# Handoff SMIL duration and preset holds

## State

Commit `b6fd7f8`. Audio H-072 is already merged. The pathfx review found that SMIL animation elements omit `dur`, so those goldens are stills. Wave 2 was filed in this pull request as `assigned`. It is now `blocked` so those 88 goldens are generated once, after the compiler fix.

## Done

H-083 is `assigned` to `animation` on `animation/wp-smil-dur`. It owns the SMIL backend and its test. It emits `dur` and adds the mid-frame check. It does not own `presets/`.

H-084 is `blocked` on H-083 and on H-077. It regenerates camera, audio, mockups, and transitions after the fix. H-085 is `blocked` on H-083. It applies the pathfx choreography fixes and regenerates those seven goldens.

H-078 through H-082 stay the wave-2 category assignments and are `blocked` on H-083. The two new authoring rules are in [[sot:svgif/preset-registry]], the release-gate preset row, and the plan: motion is visible at native size, and a mask or clip reveals content that differs from its own shape.

## Next

Launch H-083. Do not launch H-078 through H-082, H-084, or H-085 until H-083 has merged. Do not assign H-084 until H-077 is also `done`.

## Blockers

None for H-083.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/134

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
