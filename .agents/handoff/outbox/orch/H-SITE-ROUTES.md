---
handoff: 1
id: H-SITE-ROUTES
from: orch
to: orch
wp: WP-SITE-ROUTES
milestone: M7
status: done
branch: cursor/site-routes-9f5d
pr: https://github.com/modootoday/svgif/pull/27
paths:
  - .agents/handoff/assignments/H-016.md
  - .agents/handoff/assignments/H-020.md
  - .agents/handoff/assignments/H-021.md
  - .agents/handoff/assignments/H-022.md
  - .agents/handoff/assignments/H-025.md
  - .agents/handoff/assignments/H-026.md
  - .agents/handoff/assignments/H-027.md
  - .agents/handoff/assignments/H-028.md
  - .agents/handoff/assignments/H-029.md
  - .agents/handoff/outbox/orch/H-SITE-ROUTES.md
---

# Handoff site routes

## State

Commit `ce6975f`. The owner replaced the live `/svgif/` section with a root route map on `https://thumly.io`. CDN keys `/svgif/<version>/` stay. The old site paths are removed. The site was never indexed, so there is no redirect.

## Done

Folded the docs work into H-020. H-022 keeps those routes when it runs. Other roles received only the paths the org chart gives them.

| Id | Role | Branch | Status | Blocker | Ready |
| --- | --- | --- | --- | --- | --- |
| H-020 | `docs` | `docs/wp-cdn-docs` | assigned | none | yes |
| H-026 | `release` | `release/wp-site-routes` | assigned | none | yes |
| H-027 | `schema` | `schema/wp-site-routes` | assigned | none | yes |
| H-028 | `export` | `export/wp-site-routes` | assigned | none | yes |
| H-025 | `govern` | `govern/wp-site-routes` | blocked | H-017 and H-021 | no |
| H-029 | `agent` | `agent/wp-site-routes` | blocked | H-020 | no |
| H-016 | `release` | `release/wp-cdn-r2` | blocked | H-017 and H-021 | no |
| H-022 | `docs` | `docs/wp-clean-room` | blocked | H-020 | no |

## Next

Start H-020, H-026, H-027, and H-028. Each pull request opens against `main`.

## Blockers

None for this bookkeeping package.

## Links

- Assignments: `H-025.md` through `H-029.md`
- Pull request: https://github.com/modootoday/svgif/pull/27

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
