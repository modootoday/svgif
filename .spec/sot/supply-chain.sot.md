---
id: sot:svgif/supply-chain
title: Supply chain
status: active
created: 2026-11-10
updated: 2026-11-16T08:58:01Z
verify: manual
tags: [security, ci]
rel:
  depends_on: [adr:svgif/20261110122300, sot:svgif/org-chart, sot:svgif/dependencies, sot:svgif/release-gate, research:svgif/20261117193735]
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

The workspace root has four `devDependencies`, all locked with integrity: `playwright` 1.65.0 for the scenario matrix, `@modootoday/specfold` 0.8.1 for `spec check`, `typescript` 5.9.3 for the root `typecheck` script, and `@types/node` 22.20.5 so that script can check the CLI and the MCP server. TypeScript is Apache-2.0, and 5.9.3 was published on 2025-09-30. `@types/node` is MIT, and 22.20.5 was published on 2026-10-01. It brings `undici-types` 6.21.0, which is MIT. `npm audit --audit-level=high` reported no advisory for the tree that adds each of them. They are tools, not runtime dependencies. [[adr:svgif/20261116064544]]

`bash scripts/ci/npm-audit.sh` runs `npm audit --audit-level=high`. When the lockfile lists at least one package, it also runs `npm audit signatures`. An empty lockfile has no signatures to verify. `bash scripts/ci/scan-lockfiles.sh` runs osv-scanner `v2.7.1` on both lockfiles and fails on high or critical.

Vendored `*.wasm` files and encoder binaries, when any are tracked, must be named in `THIRD_PARTY_NOTICES.md` with version and license. None are tracked in the design snapshot. Adopted npm encoder libraries go through the lockfile and this scan; the inventory is [[sot:svgif/dependencies]].

The remote theme is `modootoday/jekyll-theme-modootoday@v1.6.0`. `.github/supply-chain/theme-ref.txt` records that tag and commit `02012ba89c669d4dfc57eb30c37c1e0a44a9d903`. CI rejects a branch ref. `bash scripts/ci/check-theme-ref.sh` fails when the tag no longer points at that commit.

### Caches

A cache can be read by any run and written only from `main`. [[research:svgif/20261117193735]]
- **Reading and writing.**
  - A workflow restores with `actions/cache/restore` and saves with `actions/cache/save`.
  - The save step runs only when `github.ref` is `refs/heads/main`, so a pull request reads the cache that `main` wrote and never writes one.
  - The combined `actions/cache` step is not used, because it saves from every event.
- **Where caches are allowed.**
  - `release.yml` and `pages.yml` publish, so they use no Actions cache.
  - `actions/setup-node` runs with `package-manager-cache: false` everywhere, because its own cache saves from pull requests too.
- **The one cache.**
  - The cache holds the Playwright browsers, under `~/.cache/ms-playwright`, in the CI rehearsal job and in `e2e.yml`.
  - The key is the runner OS, the `playwright` version in `package-lock.json`, and the browser set. A new Playwright version is a new key, so an old browser is never reused.
  - The browsers are installed with `--only-shell`. The runners launch headless, and headless Chromium is the headless shell, so the full Chrome download is not needed.
- **What is not cached.**
  - The npm download cache is not kept, because `npm ci` installs the locked tools in under a second.
  - `node_modules`, build outputs, and coverage are never cached.

The cache steps use `actions/cache` at commit `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` with version comment `# v6.1.0`. The action is MIT. That commit was released on 2026-06-23.

### Tracked files

`bash scripts/ci/check-supply-chain.sh` fails in these cases:
- A tracked path is a build output, an installed package tree, coverage, a browser download, or a generated site. That covers `node_modules/`, `dist/`, `.bun/`, `coverage/`, `ms-playwright/`, `_site/`, the Jekyll and Sass caches, and `*.tsbuildinfo`.
- A tracked file is over 1 MiB.

The same check prints the size of the preset registry. Each preset and golden has its own byte budget in [[sot:svgif/preset-registry]], and the registry itself has no total cap.

`apps/studio/src/player-bundle.ts` is the one generated file that is tracked, because the type check and the tests read it without a build. CI fails when a fresh Studio build changes it.

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

### Golden-check engine

The golden check's first engine is the system Chromium binary. `scripts/ci/studio-shell.sh` finds that binary on `PATH`. It does not install a package.

A second headless engine was reviewed for that check. Gecko is permitted. WebKit is refused. No package was added.

Gecko is permitted because CI already has it as a system browser. Jobs in `.github/workflows/ci.yml` use `ubuntu-latest`. That runner image includes a `firefox` binary on `PATH`, which is the Gecko engine, and the lookup is the same kind the shell uses for Chromium. A missing `firefox` binary is not a reason to add a package. The permission is the system binary. The allowlist stays empty of names, so a runtime dependency is still refused. The shell's Chromium debugging flags are not part of this permission.

WebKit is refused. The same runner image does not include a system WebKit browser. This review does not name a package to fetch one. A later change that needs WebKit has to pass the adoption rules above before any name is added to `scripts/ci/dependency-allowlist.txt`.

This record does not change `scripts/ci/studio-shell.sh` or `scripts/ci/check-presets.mjs`. Permitting Gecko does not mark a golden row passed.

The refusal above is for the golden check. The scenario matrix in `scripts/e2e/` gets Chromium, Firefox, and WebKit from the locked `playwright` package, which passed the adoption rules in [[adr:svgif/20261116064544]].

## Why

A pin that is only reviewed when someone edits a workflow goes stale. The gem advisory below is the example: it is present on a lockfile that product code did not touch.

## Current finding

`docs/Gemfile` does not use the `github-pages` 232 meta gem, because that gem pins `jekyll-remote-theme` 0.4.3 and that pin cannot take `rubyzip` 3.4. The lockfile resolves `rubyzip` on the 3.4 line, which is the fix for GHSA-47m2-wp7j-p9vc. A later high or critical advisory still fails the job. There is no ignore entry.

## Verification

`bash scripts/ci/check-supply-chain.sh --self-test` and the same command without the flag. `python3 scripts/ci/osv_gate.py --self-test`. `bash scripts/ci/check-advisories.sh --self-test`. The workflow jobs `Dependencies`, `Actions`, and `CodeQL` are the pull-request checks. `Scorecard` and `Tracking issue` run on the schedule and on dispatch.
