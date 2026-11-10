---
id: sot:svgif/release-gate
title: Release gate
status: active
created: 2026-11-10
updated: 2026-11-10T22:05:00Z
verify: node scripts/ci/check-release-readiness.mjs --self-test && node scripts/ci/release-version.mjs --self-test && bash scripts/ci/check-release-workflow.sh
tags: [release, dod]
rel:
  depends_on:
    - adr:svgif/20261110122200
    - adr:svgif/20261110121000
    - adr:svgif/20261110122100
    - adr:svgif/20261110181452
---

# Release gate

## Rule

A release is the annotated tag `v<version>`, the npm publish of `@modootoday/svgif`, and the GitHub Release for that tag. Those three happen only through `.github/workflows/release.yml`. A push to `main` does not start that workflow. [[adr:svgif/20261110122200]]

### What never releases

1. A merge or push of ordinary commits does not tag and does not publish.
2. Commit types `docs`, `chore`, `ci`, `test`, `refactor`, and `style` do not change the version. If the range since the previous `v*` tag contains none of `feat`, `fix`, `perf`, or a breaking change, the workflow exits before creating a tag. `scripts/ci/release-version.mjs` is that calculation.
3. Agents do not run `git tag`, `npm publish`, `npm version`, or `gh release create`. They do not dispatch this workflow unless they are acting as the release role. [[sot:svgif/org-chart]]
4. The `0.0.0-stage` name claim is not a release and is not this workflow. [[adr:svgif/20261110122100]]

### Who may start it

5. `workflow_dispatch` is the only entrance. `mode=check` packs with `npm publish --dry-run` when `packages/svgif` exists, and it does not tag. `mode=release` continues only when every gate below passes.
6. The job reads the secret `SVGIF_RELEASE_ACTORS` (comma-separated GitHub logins). The actor must be on that list. An empty secret fails closed. No other org-chart role is on that list.

### Evidence

7. The required pairs are the cartesian product of `schema/release-readiness/scenarios.v1.json`: every scenario id on Chromium, Firefox, and WebKit (48 browser rows) plus each agent scenario once (7 rows). That is 55 pairs. `schema/release-readiness/v1.schema.json` is the evidence shape. `cdn-exact-version`, `cdn-alias`, `cdn-dry-run`, and `readme-snippets` are in that catalog and are not marked passed.
8. `.github/workflows/e2e.yml` is the only producer of the `release-readiness` artifact. The release workflow downloads the artifact from a successful run of that workflow whose head SHA is the commit being tagged. It then runs `node scripts/ci/check-release-readiness.mjs --sha <sha> --manifest evidence/release-readiness.json`.
9. The checker fails closed unless all of these hold: `commit` and `e2eHeadSha` equal the release SHA; `specCheck`, `ciConclusion`, `sensitiveGate`, and `milestone0` are `passed`; `retryCount` is 0; every required pair is present once; each row has `status` `passed`, `attempts` 1, and a non-empty `evidence` path. A missing row, a skip, a second attempt, an unknown row, or a different SHA is a failure. There is no override input.

### Tag, then publish

10. After the checker and the version calculation pass, the workflow pushes an annotated tag onto that same SHA. The tagger is `github-actions[bot]`. The message contains `Release-Gate-Run: <run id>`. The workflow does not add a commit, because a new commit would make the evidence stale.
11. The tag push starts the publish job. That job fails closed unless the tagger is `github-actions[bot]`, the recorded gate run is a `workflow_dispatch` for this SHA, the gate job succeeded, and the evidence check passes again. It installs npm 11.5.1 or later and publishes with `--provenance` to `https://registry.npmjs.org` using environment `npm` and `id-token: write`. It does not read `NPM_TOKEN`.
12. Environment `npm` has no required reviewers. That deviation from specfold is [[adr:svgif/20261110121000]]. It applies only after this gate. The environment's tag policy `v*` matches the tag the workflow just created.

### Supply chain on the same SHA

13. The gate job and the publish job fail closed unless this commit passes `bash scripts/ci/check-supply-chain.sh`, `npm ci`, `bash scripts/ci/npm-audit.sh`, and `bash scripts/ci/scan-lockfiles.sh`. An unpinned action, a failed signature audit, or a high or critical osv-scanner result stops the release.
14. `bash scripts/ci/check-advisories.sh` must read the Dependabot alerts API and find no open high or critical alert. If the API does not return 200, the job fails closed. The publish job writes a CycloneDX `sbom.cdx.json` with `npm sbom` and attaches it to the GitHub Release, and `npm publish --provenance` stays required. [[sot:svgif/supply-chain]]
15. After the gate, Environment `cdn-release` runs the library upload. `mode=check` lists the exact-version keys, fails if that prefix exists, and does not upload or purge. With no environment token it stops after the local key plan. `mode=release` writes the exact-version prefix once, copies those bytes to the alias prefixes, purges only the alias URLs, fetches the exact-version URL, and compares status, content type, and sha384. Rollback rewrites alias keys to the previous version's bytes and purges those URLs. It does not delete an exact-version object. `SVGIF_CDN_BASE` stays unset until that first upload. [[sot:svgif/distribution]] [[adr:svgif/20261110164419]]
16. A release is not done until every command and every code snippet in `README.md` runs. That row is `readme-snippets`. This record does not mark it passed.
17. The Pages site uses Studio at `/studio/`, the docs home at `/docs/`, and the machine-readable schema at `/schema/svgif/v1.json`. The old `/svgif/` section is removed. CDN object keys stay `/svgif/<npm-version>/`. `schema/release-readiness/v1.schema.json` uses `$id` `https://thumly.io/schema/svgif/release-readiness/v1.schema.json`. `scripts/ci/check-release-readiness.mjs` requires that string.

### Preset registry

[[adr:svgif/20261110181452]] records the unbounded preset registry. The rows below are the definition of done for that registry. They are not scenario ids. They are not added to `schema/release-readiness/`. None of them is marked passed. The required evidence stays 55 pairs: 48 browser rows and 7 agent rows.

| Check | Pass condition |
| --- | --- |
| Preset documents | Every file under `presets/` validates against `schema/preset/`. An empty registry passes |
| Preset render | The same preset at the same integer frame matches its golden SVG, and a separate vision review session passes |
| Preset index | The committed index matches a walk of `presets/` and lists every preset |
| Preset search | Studio search reaches every preset in the generated index |
| Preset public surface | `presets/` passes the public-surface check |
| v1 type coverage | At release, every v1 type has at least one schema-valid preset and a deterministic golden SVG. Until that release, `node scripts/ci/preset-coverage.mjs` reports the gap and does not fail the build |
| Preset authoring | Frame 0 is the true start state, with nothing revealed unless the type says otherwise. That frame-0 state is visible in the SVG markup with the CSS removed. Geometric motion defaults to non-linear easing. The motion is visible at native size: travel is meaningful, and a change of about 2px is not the motion. A mask or a clip reveals content that differs from its own shape. Tempo matches the declared bpm. A beat uses a fast-attack ease-out and a slower decay. Growth scales from its anchor, the baseline or the inner radius. Non-text graphics have at least 3:1 contrast against their background. The end frame keeps its subject fully in frame, with no accent clipped at the edge. A shake starts and ends at rest and decays. Every declared parameter is visible in the golden. The committed generator reproduces every golden from the preset plus the shared demo fixture. Entrance or settle motion animates one wrapper unless the type needs per-part motion. The preset artwork does not paint an opaque full-bleed stage. The review and the golden check sample a mid frame and the last frame with CSS active. The end state of a reveal covers its target fully. A preset-authoring assignment cites these rules. [[sot:svgif/preset-registry]] |

### Vision review

The Studio UI acceptance, the preset golden render, and the site pages each need a separate vision review session. The launcher starts the session. The reviewer is the designated vision review model chosen by the launcher. This record does not open that session. A later visual-review assignment names the screenshots or renders to capture, the criteria (layout fit with no page scroll, alignment, contrast, spacing, motion smoothness), and a pass/fail report.

### Roles for each scenario

| Scenario id | What the evidence must show | Role |
| --- | --- | --- |
| `export-html` | Saved HTML validates against the project schema and plays | [[sot:svgif/org-chart]] role `export` |
| `export-svg` | SVG document, expected root and dimensions | role `export` |
| `export-webp` | RIFF/WEBP signature, frame count, duration | role `export` |
| `export-webm` | EBML signature, duration | role `export` |
| `export-mp4` | `ftyp` signature, duration | role `export` |
| `relay-round-trip` | Save HTML, reopen, Edit loads CDN Studio, edit, save a new valid file | role `studio` |
| `schema-migration` | An N file migrates to N+1 or the v1 identity migrator accepts a v1 file and refuses a newer one | role `schema` |
| `embed-cdn` | Copied CDN snippet loads the pinned file with SRI | role `studio` |
| `embed-inline` | Copied inline snippet plays with no network | role `studio` |
| `offline-playback` | Inline player plays with the network disabled | role `studio` |
| `no-server-calls` | The run's request log has no project encode host | role `security` |
| `oembed-json` | The static oEmbed JSON validates, type is `rich` or `video`, and `html` is an iframe to `/embed/` with no `?url=` | role `export` |
| `social-card` | `og:title`, `og:description`, `og:image`, and `twitter:card` `summary_large_image` match `presentation`. `twitter:player` is not required | role `export` |
| `embed-player` | The iframe page plays, and `studio.js` is not requested until Edit | role `export` |
| `cli-contract` | `svgif --json` validate, migrate, describe, compile, new, and embed match the exit codes | role `agent` |
| `mcp-tools` | The stdio server lists the `_v1` tools and rejects a non-loopback HTTP bind | role `agent` |
| `skill-install` | `git archive` of the release SHA lists the public skills and no registry submit | role `agent` |
| `cli-studio-parity` | CLI SVG and HTML bytes match Studio on one fixture | role `agent` |
| `repo-install` | Claude, Codex, Cursor, and skills install paths resolve from that SHA | role `agent` |
| `cdn-dry-run` | `mode=check` lists the exact-version keys, fails if that prefix exists, and does not upload or purge | role `release` |
| `cdn-exact-version` | The exact-version URL returns 200 with the immutable Cache-Control, the content type, and the sha384 | role `release` |
| `cdn-alias` | The alias URL uses `max-age=300` and the embed snippet has no SRI | role `release` |
| `readme-snippets` | Every command and every code snippet in `README.md` runs | role `release` |

Browser rows are repeated for `chromium`, `firefox`, and `webkit`. The seven agent rows are a single `agent` result each. The agent install rows use the release SHA, not a plugin registry. `cdn-dry-run` and `readme-snippets` are single rows for the same reason: one result, not one per browser. The release role owns the manifest. Other roles produce evidence and do not dispatch the release. [[sot:svgif/agent-distribution]] The CDN rows and `readme-snippets` are not marked passed.

## Why

A unit-test job on a docs commit is not proof that export, the relay, and the three browsers still work. The manifest is the list, and the workflow is the only thing allowed to turn a complete list into a tag.

## Verification

`node scripts/ci/check-release-readiness.mjs --self-test` accepts one complete manifest and rejects missing, skipped, retried, and stale fixtures. That self-test still expects 55 pairs. The preset-registry rows are not pairs in the manifest. `node scripts/ci/release-version.mjs --self-test` rejects a trivial range. `bash scripts/ci/check-release-workflow.sh` rejects a branch-push trigger. CI runs all three. Dispatching `mode=release` on a commit without the artifact fails closed.
