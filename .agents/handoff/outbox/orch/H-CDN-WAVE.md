---
handoff: 1
id: H-CDN-WAVE
from: orch
to: orch
wp: WP-CDN-R2
milestone: T2
status: done
branch: cursor/m0-next-wave-9f5d
pr: https://github.com/modootoday/svgif/pull/17
paths:
  - .agents/handoff/assignments/H-016.md
  - .agents/handoff/assignments/H-017.md
  - .agents/handoff/assignments/H-018.md
  - .agents/handoff/assignments/H-019.md
  - .agents/handoff/assignments/H-020.md
  - .agents/handoff/outbox/orch/H-CDN-WAVE.md
---

# Handoff CDN wave

## State

The CDN decision is wider than the first upload note. The design records stay with the owning roles. This session does not edit those files.

## Done

Filed the ADR, the SoT rules, the plan checks, and the role packages. H-016 and H-017 are the widened packages. H-018, H-019, and H-020 are new.

| Id | Role | Branch | Status | Scope |
| --- | --- | --- | --- | --- |
| H-017 | `govern` | `govern/wp-cdn-decision` | blocked on H-013 | ADR, open question 1, plan checkboxes, path rows. |
| H-016 | `release` | `release/wp-cdn-r2` | blocked on H-017 | Distribution rules, upload job, dry-run, rollback, tier-3 scenario ids. |
| H-018 | `export` | `export/wp-cdn-sri` | assigned | Embed snippets: SRI on exact versions only. |
| H-019 | `security` | `security/wp-cdn-token` | blocked on H-017 | Token names, rotation, no account ids in git. |
| H-020 | `docs` | `docs/wp-cdn-docs` | blocked on H-007 | Public sentences. The variable stays unset. |

H-008 is already merged, so the release package is not blocked on it.

## Owner actions

These stay outside the repository. No role creates them.

- Create the R2 Standard bucket. Leave the r2.dev public development URL off.
- Attach the custom domain `cdn.thumly.io` as a proxied record on the existing zone. Minimum TLS 1.2. Do not CNAME the hostname to r2.dev.
- Bucket CORS: `GET` and `HEAD`, allowed origins `*`.
- Cache the hostname, including JSON. Prefer tiered cache. Response headers: `nosniff`, `Cross-Origin-Resource-Policy: cross-origin`, `Referrer-Policy: no-referrer-when-downgrade`. Leave compression to the edge. Do not enable hotlink protection.
- Create the GitHub Environment `cdn-release`. Store `CLOUDFLARE_API_TOKEN` as a secret on that environment only. Scope it to R2 write on that bucket and cache purge on that zone. Do not grant account-wide write. Do not put the token, the account id, or the zone id in git.
- Do not set `SVGIF_CDN_BASE` until the first gated release has uploaded.

## Next

Start H-018. Do not start H-016, H-017, H-019, or H-020 until the named blocker is merged.

## Blockers

None for H-018.

## Links

- Assignments: `H-016.md` through `H-020.md`

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
