---
handoff: 1
id: 20261111T003200Z-layers-unblocked
from: orch
to: owner
wp: WP-PRESET-INK
milestone: M6
status: done
branch: cursor/layers-unblocked-9f5d
pr: https://github.com/modootoday/svgif/pull/217
paths:
  - .agents/handoff/assignments/H-110.md
  - .agents/handoff/assignments/H-111.md
  - .agents/handoff/assignments/H-116.md
  - .agents/handoff/assignments/H-117.md
  - .agents/handoff/assignments/H-118.md
  - .agents/handoff/assignments/H-123.md
  - .agents/handoff/assignments/H-124.md
  - .agents/handoff/assignments/H-125.md
---

# Handoff 20261111T003200Z-layers-unblocked

## State

H-110 and H-122 are both merged. The layer field and the loop duration are on main.

## Done

- Merged https://github.com/modootoday/svgif/pull/211 at `de01fd8`. H-110 is `done`. H-122 was already merged at `11379ea` and is `done`.
- Set to `assigned`: H-111, H-116, H-119, H-123, and H-125.
- H-117 stays `blocked` on H-111. They share the preset registry and the golden check.
- H-118 stays `blocked` on H-117 and H-119.
- H-121 is left for https://github.com/modootoday/svgif/pull/218, which marks H-120 done and assigns the crossfade plus the drop-shadow panel. H-124 is already `done` as the interim.

## Next

H-119 is already `assigned`. Launch H-111, H-116, H-123, and H-125 after this lands. H-117 stays behind H-111. H-118 stays behind H-117 and H-119. https://github.com/modootoday/svgif/pull/218 assigns H-121.

## Blockers

None for this bookkeeping.

## Links

- Work package: `WP-PRESET-INK`
- Branch: `cursor/layers-unblocked-9f5d`
- Pull request: https://github.com/modootoday/svgif/pull/217
