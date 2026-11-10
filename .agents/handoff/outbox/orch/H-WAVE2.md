---
handoff: 1
id: H-WAVE2
from: orch
to: orch
wp: WP-OWNER-DECISIONS
milestone: continuous
status: done
branch: cursor/owner-decisions-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-006.md
  - .agents/handoff/assignments/H-007.md
  - .agents/handoff/assignments/H-008.md
  - .agents/handoff/assignments/H-009.md
  - .agents/handoff/assignments/H-010.md
  - .agents/handoff/outbox/orch/H-WAVE2.md
---

# Handoff H-WAVE2

## State

Commit `54df9956bedc8bf4da3843fdbe0ca62d3729c2be`. H-005 is merged. H-001, H-002, H-003, and H-004 are still `assigned`. Their path lists are unchanged.

## Done

Filed the final owner decisions. Only H-006 is `assigned`. H-007 through H-010 are `blocked` so a session does not start them while the open packages hold those paths.

| Id | Role | Branch | Status | Scope |
| --- | --- | --- | --- | --- |
| H-006 | `export` | `export/wp-oembed-provider` | assigned | Set oEmbed `provider_name` to `Thumly`. Leave the `/svgif/` URLs alone. |
| H-007 | `docs` | `docs/wp-readme-brand` | blocked on H-004 | GitHub README branding, interim hero, theme-token overrides, apex canonical host. |
| H-008 | `release` | `release/wp-www-apex` | blocked on H-002 | Record that `www.thumly.io` redirects to the apex. Do not move the section layout. |
| H-009 | `govern` | `govern/wp-thumly-v1` | blocked on H-003 | One Thumly app, English v1 copy, path rows, ADR. Trademark stays open. |
| H-010 | `studio` | `studio/wp-no-gif-button` | blocked on H-009 | No GIF button in the first UI. GIF stays optional. |

The URL layout already assigned in H-002 and H-004 stays: `https://thumly.io/` is the Thumly root, and svgif engine pages stay under `/svgif/`. The new host fact is only the www redirect.

## Next

Start H-006. Do not start H-007, H-008, H-009, or H-010 until the named blocker is merged. H-010 also waits on H-009, which waits on H-003.

## Blockers

None for H-006.

## Links

- Assignments: `H-006.md` through `H-010.md`
- Open packages left untouched: H-001, H-002, H-003, H-004

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
