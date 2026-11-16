---
id: sot:svgif/roadmap
title: Roadmap
status: active
created: 2026-11-10
updated: 2026-11-16T06:04:45Z
verify: manual
tags: [roadmap]
rel:
  depends_on:
    - plan:svgif/20261110122000
---

# Roadmap

## Rule

The canonical order is [[plan:svgif/20261110122000]]. This page is the milestone list. Sizes are module counts, not dates.

| Milestone | Outcome | Done when |
| --- | --- | --- |
| M0 | Schema registry frozen | `node scripts/ci/check-schema.mjs` |
| M1 | Math, scene, IR, clock | Unit tests for those packages |
| M2 | Three backends and lowering | Golden SVG for css-external, css-embedded, and smil |
| M3 | 3D projection and bake | Golden SVG for the box fixture |
| M4 | Player | Scrub and static mount tests |
| M5 | Exporters | HTML, SVG, WebP, WebM, MP4 signatures |
| M6 | Studio UI, load/save, copy-source, relay | The tier-1 rows for those features |
| M7 | Docs in priority order | P0 `/`, then P1 `/studio/`, then P2 `/docs/guides/`, then P3 `/docs/reference/api/`. The docs home is `/docs/` |
| M8 | Studio live at `/studio/` | The live URL serves `data-svgif-studio="app"` |
| M9 | Studio simple mode | Simple mode is the default entry, Advanced keeps the current artboard shell, and the task table in [[plan:svgif/20261110122000]] passes at 1440×900 and 390×844 in that separate live acceptance. [[adr:svgif/20261114074819]] |
| M10 | Optional agent surface | CLI, MCP, public skills, and repo install manifests. Starts after M0 and the core engine. Does not block M6 or M8 |
| M11 | External embed | Static oEmbed, card meta, and `/embed/` on Pages. Starts after HTML, WebP, and MP4 export. Does not block M6 or M8 |
| M12 | Root gates run | From the root `package.json`, `typecheck`, `test`, `test:visual`, `test:export`, and `changelog:check` each run a script that is in the tree and exit 0. The same scripts exit non-zero when a package's tests are missing |
| M13 | Tier 1 closed | Every Tier 1 row in [[plan:svgif/20261110122000]] has its automated check in CI. Statement coverage on each owning package's `src/` is at least 90%, and the WebP, WebM, and MP4 encode paths are measured in a browser. `node scripts/ci/preset-coverage.mjs` reports a v1 gap of 0 |
| M14 | Tier 2 closed | Every Tier 2 row in [[plan:svgif/20261110122000]] passes on `main`. The required checks also pass on a Dependabot pull request, so the deny-term secret is among the Dependabot secrets. The `mode=check` dry run and the CDN dry run complete without a tag, an upload, or a purge |
| M15 | Scenario matrix | `e2e.yml` runs the 16 browser scenarios on Chromium, Firefox, and WebKit against the deployed site, runs the 7 agent rows, and uploads the release-readiness artifact. All 55 rows are first-attempt passes and `retryCount` is 0 |
| M16 | `v0.1.0` | Tiers 1, 2, and 3 pass on one commit. `mode=release` creates the tag, publishes with provenance, attaches the CycloneDX SBOM, and opens the GitHub Release. From the deployed site, the exact-version CDN URL and the alias URL pass the checks in [[adr:svgif/20261110164419]] |

A product release is not a milestone shortcut. `v0.1.0` waits until M0, the sensitive-content gate, and the full scenario manifest in [[sot:svgif/release-gate]] are green on the same commit. Docs work is sequenced P0, P1, P2, P3 inside M7, and the Pages check fails at the first missing priority.

M0 through M8 keep their numbers. M9 is Studio simple mode. The former M9 is M10. The former M10 is M11. [[sot:svgif/external-embed]], [[sot:svgif/agent-surface]], and [[adr:svgif/20261110122400]] still name the old numbers until their owners revise them. The Thumly app (`apps/thumly`) starts only after M0 has merged. Live pages are the landing at `/`, Studio at `/studio/`, and the docs home at `/docs/`. The old `/svgif/` URLs are removed. Do not add redirects for them. The Pages host change to `https://thumly.io` is not a milestone gate in front of M0. [[adr:svgif/20261110154621]]

## Path to completion

M0 through M11 are feature milestones. M12 through M16 close the distance from those features to the final definition of done in [[plan:svgif/20261110122000]]. M16 is the last milestone of the first release. No milestone sits between M16 and the tag.

| Milestone | Waits for | Role |
| --- | --- | --- |
| M12 | None | `release` for the root scripts. Each package's owner supplies its tests |
| M13 | M12 | `animation`, `scene`, `export`, `studio`, and `schema`, each for its own Tier 1 rows |
| M14 | None. It runs beside M12 and M13 | `release`, with `security` for the sensitive-content row and `docs` for the Pages row |
| M15 | M8, M10, M11, and M13 | `release` assembles the manifest. Each scenario's role is the one in [[sot:svgif/release-gate]] |
| M16 | M14 and M15 on the same commit | `release` dispatches. Every other role does not |

M10 and M11 stay off the Studio critical path. They are on the path to M15, because the manifest requires their rows. A green merge of any one milestone is not the release. [[sot:svgif/release-gate]]

## Measured state

This section is a snapshot and not a rule. A later measurement replaces it. It was measured on 2026-11-16 at commit `eccea34a14c894e790ccaff9f37aab49a2488c30`.

| Milestone | Measured |
| --- | --- |
| M9 | 16 of 17 plan checkboxes are checked. The open one is `WP-STUDIO-EXPORT-SOT-SYNC`, and a pull request that checks it is open |
| M10 | `packages/svgif-cli` and `packages/svgif-mcp` are not in the tree. `skills/` and the generated manifests are, and `node scripts/ci/render-agent-manifests.mjs` passes |
| M11 | `schema/embed/` is not in the tree. `node scripts/ci/render-external-embed.mjs --self-test` passes |
| M12 | `scripts/ci/engine-gate.sh`, `scripts/ci/visual-gate.sh`, `scripts/ci/export-gate.sh`, and `scripts/changelog.sh` are not in the tree, so the five root scripts exit 127 |
| M13 | `bun test` passes 319 tests in `packages/svgif` and 53 in `apps/studio`. Line coverage under `bun test` is 16% on `packages/svgif-export/src/mp4.ts`, 36% on `webm.ts`, and 69% on `webp.ts`. `packages/svgif/src/ir/path.ts` is at 76% and `apps/studio/src/player-boot.ts` is at 17%. v1 preset coverage is 136 of 476 types |
| M14 | The Public surface and Published artifacts checks fail on the open Dependabot pull request with `SVGIF_DENY_TERMS is not set`. The two CDN checkboxes in the plan are open |
| M15 | 0 of 55 rows have evidence. `e2e.yml` exits 1 by design |
| M16 | No `v*` tag exists. npm has `0.0.0-stage` and `0.0.0-reserved` only |

The live site was not measured in that session, so M7 and M8 have no row here.

## Why

Milestone ids are how parallel work packages name their entrances. The plan holds the dependency edges.

## Verification

`spec check` resolves this id and the plan id. The release self-test does not require M8 to be implemented; dispatching a release before the manifest exists fails closed. M12 is checked by running the five root scripts. M13 is checked by the coverage report of each package and by `node scripts/ci/preset-coverage.mjs`. M15 and M16 are checked by `node scripts/ci/check-release-readiness.mjs --sha <sha> --manifest <file>`.
