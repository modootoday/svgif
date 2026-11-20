---
id: adr:svgif/20261119231420
title: Cut the first release in two phases
status: active
created: 2026-11-19T23:14:20Z
updated: 2026-11-20T00:50:00Z
rel:
  depends_on: [adr:svgif/20261116064544]
---

# Cut the first release in two phases

## Context

[[sot:svgif/release-gate]] lets `release.yml` run in `mode=release` only with a complete `release-readiness.json` for that commit. `scripts/e2e/assemble.mjs` writes that file only when all 55 pairs passed against the deployed site.

Three scenarios read the library CDN:
- `embed-cdn`
- `cdn-exact-version`
- `cdn-alias`

In three browsers, those are 9 pairs. They cannot pass before an upload, and only `mode=release` uploads, after the gate. [[adr:svgif/20261116064544]] named this order and left it to the release role.

Two agent rows have no runner yet, and both are blocked for that reason:
- `cdn-dry-run` needs a `mode=check` run of `release.yml`.
- `readme-snippets` needs a published package.

Run 44631924675 of `e2e.yml` at `b8282e0` passed 44 of 55 pairs. The 11 blocked pairs are exactly these. The owner chose the two-phase option in issue #572.

## Decision

Every release, the first included, goes through these steps on one commit:

1. **`mode=check` on the commit.** It lists the exact-version keys, fails when that prefix exists, and does not upload or purge. It uploads its key plan and the prefix result as the artifact `cdn-dry-run`.
2. **First `e2e.yml` run on the commit.**
   - The `cdn-dry-run` row passes when a successful `mode=check` run for this commit has that artifact, and the prefix was absent.
   - The `readme-snippets` row runs the README's install and command lines against `npm pack` tarballs of this commit, in place of the registry. The README's CDN `<script>` line needs the upload, so the row is `blocked` until then, and only when every other README check is true.
   - `scripts/e2e/assemble.mjs` writes `stage-readiness.json` when every pair passed, except the 9 CDN pairs and `readme-snippets@agent`. Each of those 10 must be `passed` or `blocked`; `failed` or missing refuses the file. The other rules for evidence hold: first attempt, target site, the deployed build, gates `passed`.
3. **`mode=stage`, which is new.**
   - It requires `stage-readiness.json` for the commit, and the release role.
   - It uploads the exact-version prefix and the alias keys as `mode=release` does today.
   - It purges only the alias URLs, compares the exact-version responses with the build's sha384, and keeps that as evidence.
   - It does not tag, publish, or create a GitHub Release.
4. **Second `e2e.yml` run on the same commit**, with `SVGIF_CDN_BASE` set. All 55 pairs must pass, and `release-readiness.json` is written exactly as today. The v1 manifest and its schema do not change.
5. **`mode=release`** requires that manifest, as today.
   - When the exact-version prefix exists, it must hold exactly the bytes of this commit's build, by sha384, for every file. Then the upload is skipped.
   - Any other existing prefix fails, as today.
   - It then tags. The tag push publishes with provenance and opens the GitHub Release, as today.

`release-readiness.json` keeps its meaning: every one of the 55 pairs passed on one commit before the tag.

## Consequences

**The alias keys point at the new version once `mode=stage` runs.** That is before the tag and before npm has the version. If the release stops there, `mode=rollback` with the previous version rewrites the aliases. For the first release no earlier version exists, and the aliases are the only copy.

**An exact-version prefix is written once and never deleted.** A staged version that never releases keeps its prefix. The next attempt therefore needs a new version or the same bytes.

**`mode=check` now fails after `mode=stage`,** because the prefix exists. The `cdn-dry-run` row reads the `mode=check` run made before staging.

**Two pull requests carry this.**
- The first changes [[sot:svgif/release-gate]], `scripts/e2e/assemble.mjs`, and `scripts/ci/check-release-readiness.mjs`. The assembler gains `--phase stage`, and the checker gains a stage check, each with self-tests.
- The second changes `release.yml` and `e2e.yml`, and the two agent rows in `scripts/e2e/agent.mjs`.

Both carry `needs-human`. Dispatching the workflow stays with the release role.
