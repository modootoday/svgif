---
handoff: 1
id: H-WAVE1
from: orch
to: orch
wp: WP-WAVE1
milestone: M0
status: done
branch: cursor/orch-wave1-assignments-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/
  - .agents/handoff/outbox/orch/
---

# Handoff H-WAVE1

## State

Started from commit `5f52d5a24f1e944d026f5a032fd7b3a5ecdf74f9`. No assignment named `orch`. The design corpus is the source. The engine is not in the tree.

## Done

Opened the first assignment wave. Each file is one package, one role, and one pull request. Path lists do not overlap.

| Id | Role | Branch | Scope |
| --- | --- | --- | --- |
| H-001 | `schema` | `schema/wp-schema-m0` | Freeze the M0 registry, migrator, fixtures, and `scripts/ci/check-schema.mjs`. `$id` origin is `https://thumly.io/svgif/schema/`. |
| H-002 | `release` | `release/wp-release-align` | Align the `v*` and `main` ruleset records with what is live, add the Pages workflow for the `thumly.io` artifact layout, and record the host split in the distribution SoT. |
| H-003 | `govern` | `govern/wp-thumly-split` | Record the Thumly product split and the `thumly.io` Pages host, add the `thumly` role and path rows, and add the ownership checker. |
| H-004 | `docs` | `docs/wp-docs-host` | Point the docs-site record, CNAME, Jekyll config, and section pages at `https://thumly.io` with svgif under `/svgif/`. |
| H-005 | `export` | `export/wp-embed-host` | Move embed `canonicalBase` to `https://thumly.io/svgif`. No embed implementation. |

Product-intent had no path owner. Govern owns that record. Distribution is release. The docs-site record and the docs config are docs. They do not wait on M0.

## Next

Do not assign the following until H-001 is merged. They need the frozen registry.

- `WP-MATH` to `scene`, and `WP-IR` to `animation`. Those two can run beside each other. Branch names to use when they are assigned: `scene/wp-math` and `animation/wp-ir`.
- A `release` follow-up that runs `node scripts/ci/check-schema.mjs` from CI. Do not add it to the required `main` checks in that same change.
- `apps/thumly` implementation, role `thumly`. It also needs the engine packages it calls, so it is not assigned in the same breath as `WP-MATH`.
- `schema/embed/` and `WP-EMBED` implementation. They wait on HTML, WebP, and MP4 export as well as M0.
- An `e2e.yml` evidence upload. The workflow refuses to upload `release-readiness` because the matrix cannot run yet. Do not assign a fake artifact.

Not blocked on M0, and not in this wave:

- After H-003 merges, `release` can call `scripts/ci/check-ownership.mjs` from CI.
- `spec check` is named in the tier-2 CI row and is not a job in `.github/workflows/ci.yml`. The conventions pin is `modootoday/specfold@v0.8.1`. The repo does not record an install step, so this wave does not assign that job.
- [[sot:svgif/sensitive-content]] still cites `modootoday.github.io` as the public Pages host example. `security` can add `thumly.io` and `cdn.thumly.io` later. The sentence is an allow-list example, not the host rule.
- P2 and P3 docs stay in order. Schema reference text waits until M0 has merged. P0's move onto `thumly.io` is H-004, not a later wave.

## Blockers

None for this wave.

## Links

- Assignments: `.agents/handoff/assignments/H-001.md` through `H-005.md`
- Definition of done: roadmap M0 is the critical path; tier-2 Pages and branch-protection rows are in H-002 and H-004; the org-chart row is H-003

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
