---
handoff: 1
id: 20261110T230900Z-filter-emit-done
from: orch
to: owner
wp: WP-FILTER-REGION
milestone: M2
status: done
branch: cursor/filter-emit-done-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-101.md
  - .agents/handoff/assignments/H-102.md
---

# Handoff 20261110T230900Z-filter-emit-done

## State

H-101 is merged at `13b01eb` in https://github.com/modootoday/svgif/pull/170. `filter.x`, `filter.y`, `filter.width`, and `filter.height` are attributes of `<filter>`. A span is SMIL `animate` on that attribute. `filter.feDropShadow.x` stays on the primitive.

## Done

- Marked H-101 `done`.
- H-102 stays `blocked` on H-100 only. H-099 is merged at `ef4ba32` and H-101 is merged at `13b01eb`.

## Next

Launch H-102 after H-100. H-109 on https://github.com/modootoday/svgif/pull/173 can be `assigned` once that branch contains this H-101 `done` mark. Until then it stays `blocked`, because both would own the SMIL compiler.

## Blockers

None.

## Links

- Work package: `WP-FILTER-REGION`
- Branch: `cursor/filter-emit-done-9f5d`
- Pull request: open this role's pull request against `main`. Do not stack it on another pull request.
