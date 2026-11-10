---
handoff: 1
id: 20261110T230000Z-filter-region-done
from: orch
to: owner
wp: WP-FILTER-REGION-KEY
milestone: M2
status: done
branch: cursor/filter-region-done-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-078.md
  - .agents/handoff/assignments/H-079.md
  - .agents/handoff/assignments/H-080.md
  - .agents/handoff/assignments/H-081.md
  - .agents/handoff/assignments/H-082.md
  - .agents/handoff/assignments/H-099.md
  - .agents/handoff/assignments/H-101.md
  - .agents/handoff/assignments/H-102.md
  - .agents/handoff/assignments/H-103.md
  - .agents/handoff/assignments/H-105.md
---

# Handoff 20261110T230000Z-filter-region-done

## State

H-099 is merged at `ef4ba32` in https://github.com/modootoday/svgif/pull/168. The motion-preset schema accepts `filter.x`, `filter.y`, `filter.width`, and `filter.height`. Primitive keys stay valid. The preset registry records those keys and `{ "name": "scene", "value": false }`.

## Done

- Marked H-099 `done`.
- Marked H-101, H-078, H-079, H-080, H-081, H-082, H-103, and H-105 `in-progress`. Those sessions are running.
- H-104 stays `blocked` on H-100.
- H-102 stays `blocked`. H-099 is merged. It still waits on H-100 and H-101.
- H-100 stays `assigned`.

## Next

Launch nothing new from this note. H-104 starts after H-100. H-102 starts after H-100 and H-101.

## Blockers

None.

## Links

- Work package: `WP-FILTER-REGION-KEY`
- Branch: `cursor/filter-region-done-9f5d`
- Pull request: open this role's pull request against `main`. Do not stack it on another pull request.
