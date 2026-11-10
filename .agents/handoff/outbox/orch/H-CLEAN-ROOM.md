---
handoff: 1
id: H-CLEAN-ROOM
from: orch
to: orch
wp: WP-CLEAN-ROOM
milestone: continuous
status: done
branch: cursor/clean-room-assignments-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-014.md
  - .agents/handoff/assignments/H-021.md
  - .agents/handoff/assignments/H-022.md
  - .agents/handoff/assignments/H-023.md
  - .agents/handoff/assignments/H-024.md
  - .agents/handoff/outbox/orch/H-CLEAN-ROOM.md
---

# Handoff clean room

## State

PR 24 is merged at `90ff922`. PR 25 was already merged. The public tree still names other animation and 3D products in design records, `AGENTS.md`, and `NOTICE`. README and `docs/` do not. Skills and manifests do not. Git history stays as it is.

## Done

Filed four packages. Removed one package-name sentence from H-014.

| Id | Role | Branch | Status | Blocker |
| --- | --- | --- | --- | --- |
| H-021 | `govern` | `govern/wp-clean-room` | blocked | H-017 |
| H-022 | `docs` | `docs/wp-clean-room` | blocked | H-020 |
| H-023 | `security` | `security/wp-deny-names` | blocked | H-021 and H-019 |
| H-024 | `release` | `release/wp-dep-allowlist` | blocked | H-021 |

None of these four is ready to start.

## Owner actions

Create the repository secret `SVGIF_DENY_NAMES`. The value is newline-separated literals, the same shape as `SVGIF_DENY_TERMS`. Do not commit the value. The scanner reads it only after H-023 and H-024 have merged.

## Next

Start none of H-021 through H-024 until the named blocker is merged. H-014, H-015, H-017, H-018, and H-020 stay as they were after PR 24. H-018 is already `done`.

## Blockers

None for this bookkeeping package.

## Links

- Assignments: `H-021.md` through `H-024.md`

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
