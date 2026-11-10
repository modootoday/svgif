---
handoff: 1
id: 20261110T230500Z-transitions-refix
from: orch
to: owner
wp: WP-PRESET-TRANSITIONS-REFIX
milestone: M6
status: done
branch: cursor/transitions-refix-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-084.md
  - .agents/handoff/assignments/H-100.md
  - .agents/handoff/assignments/H-104.md
  - .agents/handoff/assignments/H-107.md
---

# Handoff 20261110T230500Z-transitions-refix

## State

A transitions review of `presets/transitions/` on `958bc87` passed fade, slide, iris, and scale-pop. Zoom passes with notes. Crossfade, push, wipe, and mask-reveal fail. Frame 0 is the true start, the CSS-stripped frame 0 matches the markup, every golden moves, and the reveals cover the target at frame 24.

## Done

- Filed H-107, `studio/wp-preset-transitions-refix`, `blocked` on H-100. It owns only `presets/transitions/`.
- Confirmed the SMIL pause and seek belongs in H-100. The CSS-active sample already calls `setCurrentTime` and does not pause the SMIL clock. H-104 does not take that sampler.
- Recorded the channel decision on H-084. The golden is the SMIL artifact, so transform and opacity in these files are SMIL. CSS still emits those channels when the backend is CSS. That is [[sot:svgif/animation-backends]].
- Playing once and then holding is not a defect. The `#141414` stage contrast on a dark page stays with the fixture.

## Next

Launch H-107 after H-100 merges. Launch nothing else from this note.

## Blockers

None.

## Links

- Work package: `WP-PRESET-TRANSITIONS-REFIX`
- Branch: `cursor/transitions-refix-9f5d`
- Pull request: open this role's pull request against `main`. Do not stack it on another pull request.
