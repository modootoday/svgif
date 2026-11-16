---
id: adr:svgif/20261116064544
title: The scenario matrix runs on Playwright from the lockfile
status: active
created: 2026-11-16T06:45:44Z
updated: 2026-11-16T06:46:12Z
rel:
  depends_on: [adr:svgif/20261110122200, adr:svgif/20261116060632]
---

# The scenario matrix runs on Playwright from the lockfile

## Context

[[plan:svgif/20261110122000]] says the Tier 3 evidence is a Playwright run on Chromium, Firefox, and WebKit. `.github/workflows/e2e.yml` exited 1 by design and no runner existed. [[sot:svgif/supply-chain]] refused a WebKit package for the golden check, because the runner image has no system WebKit and no package had passed the adoption rules. The scenario matrix needs WebKit, so it needs a package.

A rehearsal on 2026-11-16 found one product defect the unit tests had not shown. A 1920 by 1080 composition of 90 frames exported as a 746,507,924 byte WebP, because every frame cost four bytes a pixel. Commit `9458a92` fixed the encoder, and the same export is 69,884 bytes.

## Decision

1. `playwright` 1.63.0 is a `devDependencies` entry of the workspace root, with its integrity in `package-lock.json`. Its license is Apache-2.0. `npm audit` reports no advisory, and `npm audit signatures` verifies the registry signatures. It is a tool. It is not a runtime dependency, and `scripts/ci/dependency-allowlist.txt` stays empty.
2. `@modootoday/specfold` 0.8.1 is locked the same way, so a workflow runs `spec check` after `npm ci` and does not fetch an unlocked package.
3. Workflows install both with `npm ci --ignore-scripts`. The browsers come from `npx --no-install playwright install --with-deps`, which uses the locked package.
4. `scripts/e2e/browser.mjs` runs the 16 browser scenarios for one browser. `scripts/e2e/agent.mjs` runs the 7 agent rows. Each scenario runs once. A row is `passed`, `failed`, or `blocked`. A scenario that cannot run is `blocked` with the reason and is never written as `passed`.
5. `scripts/e2e/assemble.mjs` writes `release-readiness.json` only when all 55 pairs passed on the first attempt, every browser row ran with `--target site`, the deployed `studio.js` has the sha256 of this commit's build, every agent row names this commit, the run attempt is 1, and the spec check, CI, sensitive-content, and Milestone 0 gates are `passed`. In every other case it writes `e2e-report.json` and exits 1.
6. `--target local` serves this commit's Studio build on a loopback port and answers `https://thumly.io/studio/` from that build. It is a rehearsal. CI runs it on Chromium for every commit. It is not evidence.
7. The golden check keeps its engines. This decision does not change `scripts/ci/studio-shell.sh` or `scripts/ci/check-presets.mjs`.

## Consequences

`e2e.yml` can now end green, and only with a complete manifest. Until the first CDN upload and the first published work, these rows stay `blocked`: `embed-cdn`, `cdn-exact-version`, `cdn-alias`, `oembed-json`, `social-card`, `embed-player`, `cdn-dry-run`, and `readme-snippets`. The first release cannot be cut from a complete manifest while the CDN rows need an upload that only the release makes. The release role resolves that order in [[sot:svgif/release-gate]]. This record does not.

A rehearsal on Chromium at this decision: 10 browser rows passed, 6 were blocked, 5 agent rows passed, and 2 were blocked. Firefox and WebKit have not run. The lockfile now lists packages, so `npm audit signatures` and the osv scan have a tree to read, and Dependabot proposes updates for both tools.
