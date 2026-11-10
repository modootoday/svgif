---
handoff: 1
id: H-083-DONE
from: orch
to: orch
wp: WP-SMIL-DUR
milestone: M2
status: done
branch: cursor/mp4-done-9f5d
pr: https://github.com/modootoday/svgif/pull/141
paths:
  - .agents/handoff/assignments/H-083.md
  - .agents/handoff/outbox/orch/H-083-DONE.md
---

# Handoff H-083 done

## State

Commit `fd36f35`. H-083 is merged. The preset walk still skips a golden with motion markup and no `dur`. `presets/pathfx/` and `presets/mockups/` are those goldens.

## Done

H-083 is `done` at `fd36f35`. H-084, H-085, H-087, H-091, and wave 2 no longer wait on it. H-087 still waits on H-086 and H-088. H-090 still waits on H-088 and H-089. The others that waited on H-083 now wait on H-088 only.

H-085 and H-091 regenerate the pre-fix SMIL goldens. Each non-static golden must carry `dur` and differ between frame 0 and a mid frame. H-088's `--goldens` check does not skip a missing `dur`. The test skip stays until both directories carry `dur`, because animation owns `packages/svgif/test/smil.test.ts`.

## Next

Do not launch the preset regenerations until H-088 has merged. Launch H-086 and H-088 and H-089 now if they are not already running.

## Blockers

None for this filing.

## Links

- Pull requests: https://github.com/modootoday/svgif/pull/139 and https://github.com/modootoday/svgif/pull/141

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [x] `spec check` is green
