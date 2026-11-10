# Releasing

Product releases are gated. A push to `main` does not tag and does not publish. Commit types `docs`, `chore`, `ci`, `test`, `refactor`, and `style` never change the version. The only path is `.github/workflows/release.yml`, and only after the scenario manifest for that exact commit is complete. The rule is [the release-gate SoT](../.spec/sot/release-gate.sot.md).

Unattended publish remains the npm step: environment `npm` has no required reviewers. That does not skip the gate.

## Modes

| Mode | How it starts | What it does |
| --- | --- | --- |
| `check` | `workflow_dispatch` by a login in `SVGIF_RELEASE_ACTORS` | Runs the gate self-tests. When `packages/svgif` exists, packs and runs `npm publish --dry-run`. Does not tag and does not publish. |
| `release` | same, `mode=release` | Downloads the `release-readiness` artifact from a successful `e2e.yml` run on this SHA, rejects a missing, skipped, retried, or stale row, rejects a trivial commit range, then pushes an annotated `v*` tag as `github-actions[bot]`. |
| publish | the tag push created above | Checks the tagger and the gate run, checks the manifest again, repeats the supply-chain audit, writes a CycloneDX SBOM, then `npm publish --provenance` and opens the GitHub Release with `sbom.cdx.json`. |

specfold's `bootstrap` workflow mode is not used. A draft GitHub Release is not a rehearsal.

## Version

`scripts/ci/release-version.mjs` reads commit subjects since the previous `v*` tag.

- No prior `v*` tag, and the range has a `feat`, `fix`, `perf`, or breaking commit: the tag is `v0.1.0`.
- Later `feat` bumps minor, `fix` or `perf` bumps patch, a breaking commit bumps major.
- A range made only of `docs`, `chore`, `ci`, `test`, `refactor`, and `style` produces no tag. The workflow stops.

The workflow does not add a commit. A new commit would be a different SHA from the evidence. The tag is the version bump. npm's packed manifest is set to that version in the runner only.

## Evidence

`schema/release-readiness/scenarios.v1.json` lists the scenario ids. Each one is required on Chromium, Firefox, and WebKit. The artifact file is `release-readiness.json` and must match `schema/release-readiness/v1.schema.json`. Every row needs `status` `passed`, `attempts` 1, and an evidence path. `retryCount` must be 0. `commit` and `e2eHeadSha` must be the tagged SHA. `specCheck`, `ciConclusion`, `sensitiveGate`, and `milestone0` must be `passed`.

`.github/workflows/e2e.yml` is the producer. Until it uploads that artifact, `mode=release` fails closed. A green job without the artifact is not evidence.

## npm

Package name: `@modootoday/svgif`. Extra packages, when they exist, use the same `@modootoday/` scope. The unscoped name `svgif` is an unrelated package created in 2021. Docs and CDN examples do not tell anyone to install it.

Trusted Publishing, mirrored from specfold's `release.yml`:

- job environment `npm` (this repository already has that environment, tag policy `v*`, no required reviewers)
- `permissions: id-token: write`
- `actions/setup-node` with `registry-url: https://registry.npmjs.org`
- npm 11.5.1 or later
- `npm publish --provenance --access public`
- no `NPM_TOKEN`

Provenance requires the repository to be public at publish time.

### Name claim (not a release)

npm accepts a trusted publisher only for a package that already exists. `@modootoday/specfold` published `0.0.0-stage` for that reason; that version is on the registry.

A maintainer logged in to npm publishes `@modootoday/svgif@0.0.0-stage` once, from their machine, before the first real release. The tarball is a placeholder README and the license. It is not a GitHub Release and not a `v*` tag. CI must not publish it. After it exists, add the trusted publisher: organization `modootoday`, repository `svgif`, workflow `release.yml`, environment `npm`. Require two-factor authentication and disallow tokens.

Any later `@modootoday/*` package needs the same one-time placeholder before its publisher can be attached.

### First product release

`v0.1.0` waits until all of these are true:

1. Milestone 0 is complete (`node scripts/ci/check-schema.mjs`).
2. The sensitive-content CI job is green with `SVGIF_REQUIRE_DENY_TERMS` set to `true`.
3. The release-readiness manifest for that commit is 100% satisfied, including every exporter, the relay round-trip, migration, both embed snippets, offline playback, and no server calls, on all three browsers.
4. The repository is public (required for provenance). Make it public, then dispatch `mode=release`. Do not push the tag by hand.
5. The supply-chain audit on that SHA is clean: pinned actions, `npm audit`, osv-scanner, and no open high or critical Dependabot alert. [[sot:svgif/supply-chain]]
6. Agent install manifests in that commit match `schema/agent-surface`, and `git archive` of the SHA is what clients install. There is no marketplace submission. [[sot:svgif/agent-distribution]]

## People and agents

`SVGIF_RELEASE_ACTORS` holds the GitHub logins allowed to dispatch the workflow. The release role is the only org-chart role on that list. Other agents do not dispatch it, do not tag, and do not publish.

Tag creation for `v*` is restricted by `.github/rulesets/v-tags.json` so a person or an agent cannot push the tag. The bypass is the GitHub Actions app, which is how the workflow pushes the tag it just verified. Applying that ruleset is a one-time owner step.

## One-time owner steps

- Publish `@modootoday/svgif@0.0.0-stage` once, then attach the trusted publisher and disallow tokens.
- Set the secret `SVGIF_RELEASE_ACTORS` to the release-role login.
- Set `SVGIF_DENY_TERMS` and the variable `SVGIF_REQUIRE_DENY_TERMS` to `true` before the repository is public.
- Apply `.github/rulesets/v-tags.json`.
- Enable GitHub Pages from Actions before the docs site is the public URL.
- CDN publish uses secret `CLOUDFLARE_API_TOKEN` and secret `CLOUDFLARE_ACCOUNT_ID`, plus variables `SVGIF_R2_BUCKET` and `SVGIF_CDN_BASE`, after the hostname is chosen. Those names are not values. The CDN upload is not a substitute for this gate.
- Enable Dependabot alerts, Dependabot security updates, secret scanning, push protection, and private vulnerability reporting. The steps are in the one-time owner setup runbook.
