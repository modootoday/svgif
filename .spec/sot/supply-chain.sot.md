---
id: sot:svgif/supply-chain
title: Supply chain
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [security, ci]
rel:
  depends_on:
    - adr:svgif/20261110122300
    - sot:svgif/org-chart
    - sot:svgif/dependencies
    - sot:svgif/release-gate
---

# Supply chain

## Rule

The `release` role owns supply-chain review. Other roles do not edit the files named in [[sot:svgif/org-chart]]. A week with no product commit still re-scans every action pin and every lockfile.

### GitHub Actions

Every third-party `uses:` is a 40-character commit SHA. The same line carries a version comment such as `# v6.1.0`. Local `./` actions are the only exception, and this repository has none. The workflow file starts with `permissions: {}`. Each job sets its own `permissions`. `pull_request_target` is forbidden, including a job that would checkout the pull request head. `bash scripts/ci/check-supply-chain.sh` enforces this offline.

`zizmor` and `actionlint` run in `.github/workflows/supply-chain.yml` on pull requests and on the weekly schedule. Downloaded CLIs are pinned by version and sha256.

`step-security/harden-runner` is optional and is not enabled. The reason is [[adr:svgif/20261110122300]]: the scanners must reach the public registries, and an allowlist is not guessed here.

### Dependencies

`package-lock.json` and `docs/Gemfile.lock` are committed. CI and the release workflow install the npm tree with `npm ci` only. The release job activates npm 11.5.1 with `corepack prepare npm@11.5.1 --activate` so the publish CLI is pinned without `npm install`.

`.github/dependabot.yml` groups updates for `npm`, `github-actions`, and `bundler` (`/docs`). Dependabot security updates are turned on in the repository settings. [[runbook:svgif/one-time-owner-setup]]

On a pull request, `actions/dependency-review-action` fails the check at high severity and on the licenses GPL-2.0, GPL-3.0, LGPL-2.0, LGPL-2.1, LGPL-3.0, AGPL-3.0, and SSPL-1.0. Jekyll pulls `eventmachine` 1.2.7, which is dual-licensed under the Ruby License or GPL-2.0. This repo elects the Ruby License. The action matches either identifier, so that one package version is listed in `allow-dependencies-licenses`. The deny list is unchanged, and the entry is not a vulnerability ignore.

`bash scripts/ci/npm-audit.sh` runs `npm audit --audit-level=high`. When the lockfile lists at least one package, it also runs `npm audit signatures`. An empty lockfile has no signatures to verify. `bash scripts/ci/scan-lockfiles.sh` runs osv-scanner `v2.7.1` on both lockfiles and fails on high or critical.

Vendored `*.wasm` files and encoder binaries, when any are tracked, must be named in `THIRD_PARTY_NOTICES.md` with version and license. None are tracked in the design snapshot. Adopted npm encoder libraries go through the lockfile and this scan; the inventory is [[sot:svgif/dependencies]].

The remote theme is `modootoday/jekyll-theme-modootoday@v1.6.0`. `.github/supply-chain/theme-ref.txt` records that tag and commit `02012ba89c669d4dfc57eb30c37c1e0a44a9d903`. CI rejects a branch ref. `bash scripts/ci/check-theme-ref.sh` fails when the tag no longer points at that commit.

### Scheduled scan

`.github/workflows/supply-chain.yml` runs on pull requests, on `workflow_dispatch`, and every Monday at 06:17 UTC. The scheduled run and the manual run repeat the audits with no requirement that the tree changed. They also run OpenSSF Scorecard and CodeQL for JavaScript and TypeScript. The `track` job opens or updates one issue titled `Supply-chain findings`. It records job results and advisory ids. It does not copy secret values.

### Library object upload

The `cdn` job in `.github/workflows/release.yml` runs after the gate, in Environment `cdn-release`. It does not request an OIDC token. There is no OIDC broker. The API token is the environment secret `CLOUDFLARE_API_TOKEN`, not a repository secret. Its scope is R2 write on that bucket and cache purge on that zone. [[adr:svgif/20261110164419]]

The upload action is `cloudflare/wrangler-action` at commit `953926a2e2182532811c01a25e53647d93bf07c0` with version comment `# v4.1.3`. Wrangler is pinned to `4.160.0`. Both the action and that Wrangler release use MIT OR Apache-2.0. The action is not an npm dependency of this repository, so `package-lock.json` does not list it. The workflow pin is the lock. The job stores `Content-Type` and `Cache-Control` with that CLI. The weekly scan re-checks this pin with the other actions.

### Release

Before a tag, and again before `npm publish`, the release workflow runs the pin check, `npm ci`, the npm audit, the osv-scanner gate, and `bash scripts/ci/check-advisories.sh`. The alerts API must return 200. An open high or critical Dependabot alert fails the job. A non-200 response fails the job. The publish job writes `sbom.cdx.json` with `npm sbom --sbom-format cyclonedx` and uploads it on the GitHub Release. `npm publish --provenance` is unchanged. [[sot:svgif/release-gate]]

### Response clock

| Severity | Clock |
| --- | --- |
| Critical | 2 days to mitigate, or to merge an ADR that records the exception |
| High | 7 days, on the same terms |
| Medium | Before the next product release |
| Low | Best effort, and not a release blocker |

An exception ADR does not add an ignore rule to the scanner. The release stays closed while the advisory is still in the lockfile or still open on the commit.

### Adopting a dependency

A new npm package, gem, action, or vendored encoder is adopted only when all of these are true in the same pull request:

1. The SPDX license is MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0, 0BSD, Unlicense, or CC0-1.0. Any other license needs an ADR first. The dependency-review deny list still rejects the copyleft and SSPL identifiers above.
2. osv-scanner and `npm audit --audit-level=high` report no high or critical advisory for the new tree.
3. The project published a release in the last 24 months, or an ADR explains the pin.
4. A runtime library updates the table in [[sot:svgif/dependencies]] in that pull request.
5. The lockfile is updated. Workflows keep using `npm ci`.

## Why

A pin that is only reviewed when someone edits a workflow goes stale. The gem advisory below is the example: it is present on a lockfile that product code did not touch.

## Current finding

`docs/Gemfile` does not use the `github-pages` 232 meta gem, because that gem pins `jekyll-remote-theme` 0.4.3 and that pin cannot take `rubyzip` 3.4. The lockfile resolves `rubyzip` on the 3.4 line, which is the fix for GHSA-47m2-wp7j-p9vc. A later high or critical advisory still fails the job. There is no ignore entry.

## Verification

`bash scripts/ci/check-supply-chain.sh --self-test` and the same command without the flag. `python3 scripts/ci/osv_gate.py --self-test`. `bash scripts/ci/check-advisories.sh --self-test`. The workflow jobs `Dependencies`, `Actions`, and `CodeQL` are the pull-request checks. `Scorecard` and `Tracking issue` run on the schedule and on dispatch.
