---
id: sot:svgif/org-chart
title: Org chart
status: active
created: 2026-11-10
updated: 2026-11-10T17:38:39Z
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
| `thumly` | `apps/thumly/` only | dispatch the release workflow; edit `packages/`, `apps/studio/`, `schema/`, `docs/`, or supply-chain files; start work without an assignment |
| `docs` | Landing page, `/studio/` placement, user guide, developer guide, in that order | dispatch the release workflow; edit `docs/Gemfile.lock` |
| `security` | Sensitive-content gate, the no-server-calls evidence, secret names | dispatch the release workflow; edit supply-chain files |
| `agent` | The optional CLI, the MCP server, public skills, and the generated install manifests | dispatch the release workflow; edit `.agents/**`; edit Studio; edit supply-chain files |
| `release` | The release workflow, the readiness manifest, and supply-chain review | tag or publish except by dispatching `.github/workflows/release.yml`; edit agent-surface source |
| `orch` | Assignments under `.agents/handoff/assignments/`. May merge a role pull request only when that role's outbox says done, CI is green, and the diff stays in that role's paths | dispatch the release workflow; edit product, schema, or workflow files; create a `v*` tag |
| `govern` | The org chart, handoff policy, `.agents/roles/`, and the product-intent, roadmap, package-layout, and open-questions records | dispatch the release workflow; edit product code |

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

The longest matching prefix wins. `docs/llms.txt` is `agent` and `docs/Gemfile.lock` is `release`, even though the rest of `docs/` is `docs`. `docs/assets/readme/` is `docs`, the same owner as `README.md`.

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

Product and policy paths. The longest matching prefix still wins. These rows do not grant `.spec/adr/` or `scripts/ci/`. `packages/svgif/` itself has no row. Math and the IR sampler are separate prefixes under that package.

| Path | Owner |
| --- | --- |
| `apps/thumly/` | `thumly` |
| `apps/studio/` | `studio` |
| `.spec/sot/studio-export.sot.md` | `studio` |
| `.spec/sot/studio-ui.sot.md` | `studio` |
| `scripts/ci/studio-shell.sh` | `studio` |
| `schema/` | `schema` |
| `schema/release-readiness/` | `release` |
| `scripts/ci/check-schema.mjs` | `schema` |
| `.spec/sot/schema-versioning.sot.md` | `schema` |
| `.github/RELEASING.md` | `release` |
| `.github/rulesets/` | `release` |
| `.spec/runbook/one-time-owner-setup.runbook.md` | `release` |
| `.spec/sot/distribution.sot.md` | `release` |
| `scripts/ci/studio-pages-dod.sh` | `release` |
| `docs/` | `docs` |
| `docs/assets/readme/` | `docs` |
| `README.md` | `docs` |
| `.spec/sot/docs-site.sot.md` | `docs` |
| `scripts/ci/docs-ia.sh` | `docs` |
| `.spec/sot/product-intent.sot.md` | `govern` |
| `.spec/sot/roadmap.sot.md` | `govern` |
| `.spec/sot/package-layout.sot.md` | `govern` |
| `.spec/sot/open-questions.sot.md` | `govern` |
| `scripts/ci/check-ownership.mjs` | `govern` |
| `.spec/adr/20261110154621-thumly-io-is-the-pages-host.adr.md` | `govern` |
| `.spec/adr/20261110160436-thumly-v1-ui-copy-token-and-gif-button.adr.md` | `govern` |
| `.spec/adr/20261110164419-library-objects-live-on-an-r2-bucket-at-cdn-thumly-io.adr.md` | `govern` |
| `.spec/plan/20261110122000-implementation.plan.md` | `govern` |
| `.spec/sot/supply-chain.sot.md` | `release` |
| `.spec/sot/release-gate.sot.md` | `release` |
| `.spec/sot/sensitive-content.sot.md` | `security` |
| `scripts/ci/check-release-workflow.sh` | `release` |
| `packages/svgif/package.json` | `scene` |
| `packages/svgif/tsconfig.json` | `scene` |
| `packages/svgif/src/math/` | `scene` |
| `packages/svgif/test/math.test.ts` | `scene` |
| `packages/svgif/src/ir/` | `animation` |
| `.spec/sot/animation-ir.sot.md` | `animation` |
| `packages/svgif/test/ir.test.ts` | `animation` |
| `AGENTS.md` | `govern` |
| `NOTICE` | `govern` |
| `.spec/sot/licensing.sot.md` | `govern` |
| `.spec/sot/public-api.sot.md` | `govern` |
| `.spec/sot/scene-3d.sot.md` | `govern` |
| `.spec/adr/20261110170052-dependencies-are-allowlisted-no-external-scene-or-timeline.adr.md` | `govern` |
| `.spec/adr/20261110173419-studio-is-a-composition-editor.adr.md` | `govern` |
| `scripts/ci/public_surface.py` | `security` |
| `scripts/ci/public-surface.sh` | `security` |
| `scripts/ci/check_published_artifacts.py` | `security` |
| `scripts/ci/dependency-allowlist.txt` | `release` |
| `scripts/ci/check-dependency-allowlist.sh` | `release` |
| `scripts/ci/check-release-readiness.mjs` | `release` |
| `.spec/adr/20261110121600-in-file-studio-loads-from-the-cdn.adr.md` | `govern` |
| `.spec/adr/20261110121800-milestone-0-freezes-the-schemas.adr.md` | `govern` |
| `.spec/adr/20261110122600-static-oembed-no-query-endpoint.adr.md` | `govern` |

Only `release` may appear in `SVGIF_RELEASE_ACTORS`. `orch`, `govern`, and the launcher are not on that list. An agent session that is not that role does not dispatch the workflow, does not create a `v*` tag, and does not run `npm publish`. [[sot:svgif/release-gate]]

## Why

The definition of done names an owner for each row. Without a role id, "someone should release" becomes any agent with a token.

## Verification

A pull request that adds a workflow with `npm publish` outside `release.yml`, or a second dispatch path, fails review by the release role. `bash scripts/ci/check-release-workflow.sh` checks the one workflow that is allowed to publish.
