---
handoff: 1
id: 20261110T235500Z-background-refix
from: orch
to: owner
wp: WP-PRESET-BACKGROUNDS-REFIX
milestone: M6
status: done
branch: cursor/background-refix-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-117.md
  - .agents/handoff/assignments/H-118.md
  - .agents/handoff/assignments/H-119.md
---

# Handoff 20261110T235500Z-background-refix

## State

The backgrounds review of the sixteen presets merged in https://github.com/modootoday/svgif/pull/184 failed all sixteen. Each one is a 0.6 second slide-in of an inset card over the demo subject.

## Done

- Filed H-117, `schema`, for the full-bleed exception and the paint order. It is `blocked` on H-111. Opaque full-bleed is only `bg.solid`, `bg.linearGradient`, `bg.sky`, and `bg.radialGradient`. Patterns stay non-opaque so the subject keeps 3:1. The generator paints the group after `s-stage` and before the subject. Scene stays on.
- Filed H-119, `animation`, `blocked` on H-109. A looping timeline does not set `fill="freeze"`. A `gradient.kind.stop-color` of `radial` compiles to `radialGradient`. H-109 stays as assigned.
- Filed H-118, `studio`, `presets/backgrounds/` only. It is `blocked` on H-117 and H-119. The vision review waits for that regen.
- H-111 now marks every v1 background ambient. The seamless wrap, 0 percent changed pixels on the frame after the last frame, is that same ambient rule. Backgrounds are no longer in the scene-off list.

## Next

Launch H-117 after H-111. Launch H-119 after H-109. Launch H-118 after H-117 and H-119. Launch H-110 after H-117 as well.

## Blockers

None for this bookkeeping.

## Links

- Work package: `WP-PRESET-BACKGROUNDS-REFIX`
- Branch: `cursor/background-refix-9f5d`
- Pull request: open this role's pull request against `main`. Do not stack it on another pull request.
