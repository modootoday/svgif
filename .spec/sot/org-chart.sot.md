---
id: sot:svgif/org-chart
title: Org chart
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [roles]
rel:
  depends_on:
    - sot:svgif/release-gate
---

# Org chart

## Rule

Roles are responsibilities, not extra people. One person may hold several roles. A role does not grant a second way to publish.

| Role id | Owns | Must not |
| --- | --- | --- |
| `schema` | Milestone 0 schemas, migrators, migration evidence | dispatch the release workflow |
| `animation` | IR, the three backends, filters, motion, masks, the player | dispatch the release workflow |
| `scene` | The 3D pipeline and its golden SVG | dispatch the release workflow |
| `export` | HTML, SVG, WebP, WebM, and MP4 evidence, plus the external-embed bundle | dispatch the release workflow |
| `studio` | Studio UI, load/save, copy-source, the in-file relay, offline playback | dispatch the release workflow |
| `docs` | Landing page, `/studio/` placement, user guide, developer guide, in that order | dispatch the release workflow; edit `docs/Gemfile.lock` |
| `security` | Sensitive-content gate, the no-server-calls evidence, secret names | dispatch the release workflow; edit supply-chain files |
| `agent` | The optional CLI, the MCP server, public skills, and the generated install manifests | dispatch the release workflow; edit `.agents/**`; edit Studio; edit supply-chain files |
| `release` | The release workflow, the readiness manifest, and supply-chain review | tag or publish except by dispatching `.github/workflows/release.yml`; edit agent-surface source |
| `orch` | Assignments under `.agents/handoff/assignments/`. May merge a role pull request only when that role's outbox says done, CI is green, and the diff stays in that role's paths | dispatch the release workflow; edit product, schema, or workflow files; create a `v*` tag |
| `govern` | The org chart, handoff policy, and `.agents/roles/` | dispatch the release workflow; edit product code |

Supply-chain files have one owner, `release`. No other role edits them.

| Path | Owner |
| --- | --- |
| `.github/dependabot.yml` | `release` |
| `.github/workflows/` | `release` |
| `.github/supply-chain/` | `release` |
| `SECURITY.md` | `release` |
| `package-lock.json` | `release` |
| `docs/Gemfile.lock` | `release` |
| `scripts/ci/check_supply_chain.py`, `scripts/ci/check-supply-chain.sh`, `scripts/ci/osv_gate.py`, `scripts/ci/scan-lockfiles.sh`, `scripts/ci/npm-audit.sh`, `scripts/ci/check-advisories.sh`, `scripts/ci/check-theme-ref.sh`, `scripts/ci/install-osv-scanner.sh`, `scripts/ci/update-supply-issue.sh` | `release` |

`security` keeps the sensitive-content gate. It does not also own action pins, Dependabot, the SBOM, or the advisory clock. Those are [[sot:svgif/supply-chain]].

The longest matching prefix wins. `docs/llms.txt` is `agent` and `docs/Gemfile.lock` is `release`, even though the rest of `docs/` is `docs`.

The `agent` role is the only owner of the agent product lane. [[sot:svgif/agent-surface]] [[sot:svgif/agent-distribution]]

| Path | Owner |
| --- | --- |
| `schema/agent-surface/` | `agent` |
| `skills/` | `agent` |
| `.claude-plugin/` | `agent` |
| `.cursor-plugin/` | `agent` |
| `.codex-plugin/` | `agent` |
| `plugin.json` | `agent` |
| `mcp.json` | `agent` |
| `distribution/` | `agent` |
| `docs/llms.txt` | `agent` |
| `packages/svgif-cli/` | `agent` |
| `packages/svgif-mcp/` | `agent` |
| `scripts/ci/render-agent-manifests.mjs` | `agent` |
| `scripts/ci/install-from-repo.mjs` | `agent` |

External embed files have one owner each. [[sot:svgif/external-embed]]

| Path | Owner |
| --- | --- |
| `schema/embed/` | `schema` |
| `.spec/sot/external-embed.sot.md` | `export` |
| `scripts/ci/render-external-embed.mjs` | `export` |

Handoff files have one owner each. [[sot:svgif/handoff]]

| Path | Owner |
| --- | --- |
| `.spec/sot/org-chart.sot.md` | `govern` |
| `.spec/sot/handoff.sot.md` | `govern` |
| `.agents/roles/` | `govern` |
| `.agents/handoff/TEMPLATE.md` | `govern` |
| `.agents/handoff/assignments/` | `orch` |
| `.agents/handoff/outbox/<role>/` | that role |

Only `release` may appear in `SVGIF_RELEASE_ACTORS`. `orch`, `govern`, and the launcher are not on that list. An agent session that is not that role does not dispatch the workflow, does not create a `v*` tag, and does not run `npm publish`. [[sot:svgif/release-gate]]

## Why

The definition of done names an owner for each row. Without a role id, "someone should release" becomes any agent with a token.

## Verification

A pull request that adds a workflow with `npm publish` outside `release.yml`, or a second dispatch path, fails review by the release role. `bash scripts/ci/check-release-workflow.sh` checks the one workflow that is allowed to publish.
