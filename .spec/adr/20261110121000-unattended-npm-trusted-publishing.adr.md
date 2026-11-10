---
id: adr:svgif/20261110121000
title: Unattended npm Trusted Publishing
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/conventions-adopted
---

# Unattended npm Trusted Publishing

## Context

specfold publishes `@modootoday/specfold` from `.github/workflows/release.yml` with npm Trusted Publishing: environment `npm`, `permissions: id-token: write`, `actions/setup-node` with `registry-url: https://registry.npmjs.org`, npm 11.5.1 or later, and `--provenance`. specfold's `npm` environment has required reviewers. The owner wants releases with no human approval after the one-time setup.

## Decision

Mirror the npm job for `@modootoday/svgif` and any later `@modootoday/*` package: environment `npm`, `id-token: write`, `actions/setup-node` with `registry-url: https://registry.npmjs.org`, npm 11.5.1 or later, `--provenance`, no `NPM_TOKEN`. The GitHub environment `npm` already exists with deployment tag policy `v*` and no required reviewers. That missing reviewer is a deliberate deviation from specfold. It does not mean a tag or a merge publishes. When a release is allowed at all is [[sot:svgif/release-gate]] and [[adr:svgif/20261110122200]]. Timing and the scoped name are [[adr:svgif/20261110122100]].

## Consequences

Publish stays unattended after the one-time npm setup, and it still cannot start from a branch push. `mode=check` rehearses packing and never publishes. A product tag exists only after the release gate has passed for that commit.
