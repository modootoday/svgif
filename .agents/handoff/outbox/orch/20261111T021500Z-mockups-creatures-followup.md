---
handoff: 1
id: H-140
from: orch
to: studio
wp: WP-PRESET-MOCKUPS-WINDING
milestone: M6
status: assigned
branch: cursor/mockups-creatures-followup-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-127.md
  - .agents/handoff/assignments/H-129.md
  - .agents/handoff/assignments/H-134.md
  - .agents/handoff/assignments/H-140.md
  - .agents/handoff/assignments/H-141.md
  - .agents/handoff/outbox/orch/20261111T021500Z-mockups-creatures-followup.md
---

# Handoff

## State

`main` is `fefec54`. https://github.com/modootoday/svgif/pull/243 is already merged at `d3fd03c`. https://github.com/modootoday/svgif/pull/247 is merged at `fefec54`. H-134 is `done`. The diff stayed on `presets/transitions/`, `presets/pathfx/`, and the studio outbox. The transitions and pathfx review is still running. The mockups re-review passed motion on all twelve. Nine pass. Stamp, watch, and laptop fail on fill winding. The creatures review of https://github.com/modootoday/svgif/pull/239 passed `character-fairy` only.

## Done

H-140 is `assigned` and owns `presets/mockups/`. It rewrites `copied.ink.d` only: the stamp date squares, the watch hands, the laptop screen, the polaroid hill, the status-bar time, the notification divider, and reverse-wound tablet screen content. The mid frame sits at 74.7 percent of the travel. The band is unchanged.

H-141 is `assigned` and owns `presets/creatures/` plus the H-123 outbox. The thirteen failures take the owner poses, overlaps, and winds. The H-123 claim that the compiled SVG drops the fixture is corrected. `s-stage` is still in every golden. Light-page stage stays a record.

H-127, already `assigned` on `scripts/ci/check-presets.mjs`, also emits `dur = lastKey / fps` when a loop's last key repeats key 0, and fails an ink subpath whose overlap with a filled subpath of the same path rasters to nothing. H-133 stays `blocked` on that file. H-129 waits for H-127, H-140, and H-141, and regenerates the loop goldens after the duration fix.

## Next

Launch H-140 and H-141. They do not share a path, and neither waits on H-127. H-127 is already `assigned`. Read the two new bullets before that session edits the generator.

## Blockers

None for this bookkeeping.

## Links

- Pull request: open against `main`. Do not stack it.
