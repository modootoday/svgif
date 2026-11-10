---
handoff: 1
id: H-PR-BASE
from: orch
to: orch
wp: WP-CDN-R2
milestone: continuous
status: done
branch: cursor/pr-against-main-9f5d
pr: https://github.com/modootoday/svgif/pull/21
paths:
  - .agents/handoff/assignments/H-007.md
  - .agents/handoff/assignments/H-010.md
  - .agents/handoff/assignments/H-013.md
  - .agents/handoff/assignments/H-014.md
  - .agents/handoff/assignments/H-015.md
  - .agents/handoff/assignments/H-016.md
  - .agents/handoff/assignments/H-017.md
  - .agents/handoff/assignments/H-018.md
  - .agents/handoff/assignments/H-019.md
  - .agents/handoff/assignments/H-020.md
  - .agents/handoff/outbox/orch/H-PR-BASE.md
---

# Handoff pull-request base

## State

PR 17 is merged at `15fb478`. H-010 and H-013 are started. H-013 is not merged. The CDN scope from that merge already widens H-016 and H-017 and adds H-018, H-019, and H-020.

## Done

Role assignments that are still open say to open the pull request against `main` and not to stack it. The next orchestrator merge uses a normal squash with an empty body. If a pull request is stacked, retarget it to `main` first. Do not call the stacked merge API.

## Next

When H-013 is `done` and merged, mark it done and say that H-014, H-015, and H-017 are ready. H-016 stays blocked on H-017 until that package is merged. H-018 is ready now.

## Blockers

None.

## Links

- Pull request: https://github.com/modootoday/svgif/pull/21

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
