---
handoff: 1
id: H-DOCS-LAYOUT
from: orch
to: orch
wp: WP-DOCS-LAYOUT
milestone: M7
status: done
branch: cursor/docs-layout-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-041.md
  - .agents/handoff/assignments/H-042.md
  - .agents/handoff/outbox/orch/H-DOCS-LAYOUT.md
---

# Handoff H-DOCS-LAYOUT

## State

Owner directive. Every page under `https://thumly.io/docs/` uses one three-panel layout from the pinned theme. Commit `2aa2ad6`. Pull request #42 is already merged. This filing does not touch that branch.

## Done

The theme layout is `doc` in `jekyll-theme-modootoday` v1.6.0. `_layouts/reference.html` does not render the left section nav and the right page contents. H-042 (`govern`) writes the ADR after the org chart is free. H-041 (`docs`) then sets `layout: doc` on every docs page, keeps one nav file, and extends `docs-ia.sh`. The scroll-spy gap stays a theme request. No project layout is added.

No vision review is due until H-041 is merged. The capture list is in H-041.

## Next

Start neither package until its blocker is merged. Each pull request opens against `main`.

## Blockers

None for this filing.

## Links

- Work package: `WP-DOCS-LAYOUT`

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
