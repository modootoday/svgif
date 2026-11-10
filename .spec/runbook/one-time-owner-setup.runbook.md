---
id: runbook:svgif/one-time-owner-setup
title: One-time owner setup
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/release-gate
    - sot:svgif/supply-chain
    - adr:svgif/20261110122100
---

# One-time owner setup

## Goal

Steps a maintainer does once. Agents do not invent the secret values and do not publish.

## Steps

1. Publish the placeholder `@modootoday/svgif@0.0.0-stage` from a logged-in npm session. Do not create a GitHub Release or a `v*` tag for it.
2. On npmjs.com, add the trusted publisher: organization `modootoday`, repository `svgif`, workflow `release.yml`, environment `npm`. Require two-factor authentication and disallow tokens.
3. Create the Actions secret `SVGIF_RELEASE_ACTORS` with the release-role GitHub login only.
4. Create the Actions secret `SVGIF_DENY_TERMS` now. The repository is already public, and the public-surface CI job fails closed until this secret exists. Put one private substring per line. Do not commit the substrings, and do not paste them into an issue or a commit message.
5. Apply `.github/rulesets/v-tags.json` so only the GitHub Actions app can create `v*` tags.
6. Enable GitHub Pages with GitHub Actions as the source when the docs workflow should deploy.
7. After the CDN hostname is chosen, set secret `CLOUDFLARE_API_TOKEN`, secret `CLOUDFLARE_ACCOUNT_ID`, variable `SVGIF_R2_BUCKET`, and variable `SVGIF_CDN_BASE`.
8. In the repository security settings, enable Dependabot alerts and Dependabot security updates. The release workflow fails closed until the alerts API returns 200.
9. Enable secret scanning and secret scanning push protection.
10. Enable private vulnerability reporting. `SECURITY.md` tells reporters to use that channel.
11. Mark the Actions checks `Dependencies`, `Actions`, and `CodeQL` as required on `main` once they have run. `Scorecard` and `Tracking issue` are scheduled; they are not pull-request checks.
12. Do not create an MCP Registry publisher, a Cursor Marketplace submission, or any other plugin-directory account. Agents install `modootoday/svgif` at the `v*` tag.

## Record

Environment `npm` already exists with tag policy `v*` and no required reviewers. The release gate, not a reviewer click, is what stops a trivial publish.
