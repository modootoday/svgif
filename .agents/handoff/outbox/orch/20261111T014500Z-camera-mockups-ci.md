---
handoff: 1
id: H-130
from: orch
to: studio
wp: WP-PRESET-CAMERA-FOLLOWUP
milestone: M6
status: assigned
branch: cursor/camera-mockups-ci-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-111.md
  - .agents/handoff/assignments/H-112.md
  - .agents/handoff/assignments/H-117.md
  - .agents/handoff/assignments/H-127.md
  - .agents/handoff/assignments/H-129.md
  - .agents/handoff/assignments/H-130.md
  - .agents/handoff/assignments/H-131.md
  - .agents/handoff/assignments/H-132.md
  - .agents/handoff/assignments/H-133.md
  - .agents/handoff/outbox/orch/20261111T014500Z-camera-mockups-ci.md
---

# Handoff

## State

`main` is `92804a3`. https://github.com/modootoday/svgif/pull/229 was green and stayed on the registry, `scripts/ci/check-presets.mjs`, and `schema/fixtures/preset/motion-class.json`. It is squash-merged as `feat: enforce the preset motion band on goldens`.

## Done

H-111 is `done` at `92804a3`. A beat already returns before `last frame does not move when CSS is active`, so `camera.shake` resting at the last frame is exempt. The entrance gap of at least 2 px was not in that merge. H-127 adds it.

H-112 is `assigned`. `presets/nature/` is free. H-127 is `assigned` on `scripts/ci/check-presets.mjs`. H-117 stays `blocked` until H-127 and H-133 are `done`, so the script has one open owner. H-118 stays `blocked` on H-117.

H-130 is `assigned` for the camera follow-up. It owns only `presets/camera/`. Dolly, orbit, and parallax take the review tracks. The six passing shots stay. The cut golden must show the H-128 `keyTime` step. The recorded parallax travel replaces the 41.22 px and 24.29 px pins. H-127 reads that outbox, with an expected slab of about 50 px and a cube of about 30.5 px.

H-127 also reads every declared camera parameter, and it exempts a rest-to-rest impact from the last-frame sampler message.

H-132 is `assigned` for the mockups follow-up. It owns only `presets/mockups/`. All twelve end at frame 23 on `cubic-bezier(0.4, 0, 0.2, 1)`. The artwork boxes are in that assignment. The mockups review runs after it merges.

H-133 is `blocked` on H-127. It merges horizontal pixel-text runs in the generator and does not edit `presets/`.

H-131 is `blocked` on H-127 and H-129. It adds `Preset self-test` and `Preset goldens` to CI only after those commands are green. It does not edit the `main-protected` ruleset. The owner adds the two job names after they are green on `main`.

H-129 now waits for H-130, H-132, and H-133 as well as the open category refixes.

## Next

Launch H-112, H-127, H-130, and H-132. They do not share a path. Leave H-117, H-118, H-129, H-131, and H-133 `blocked`.

## Blockers

None for this bookkeeping.

## Links

- Pull request: open against `main`
