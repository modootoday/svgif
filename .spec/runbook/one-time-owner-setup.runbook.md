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
5. Apply `.github/rulesets/v-tags.json`. `v*` tags are immutable: no update, no deletion, and no non-fast-forward push. The ruleset does not block creation and it has no bypass actor. The creation guard is the publish job in `.github/workflows/release.yml`: the tagger must be `github-actions[bot]`, the tag message must contain `Release-Gate-Run`, and that run must be a `workflow_dispatch` gate for the tagged SHA. Do not weaken that check.
6. Enable GitHub Pages with GitHub Actions as the source so `.github/workflows/pages.yml` can deploy. The Pages custom domain is the apex `thumly.io`. `www.thumly.io` redirects to `https://thumly.io/`. It is not a second site and not the library CDN. DNS for that domain is outside this repository. Do not put DNS secret values in this file. `cdn.thumly.io` is not the Pages host.
7. Create the GitHub Environment `cdn-release` for the library upload. Put the API token in the environment secret `CLOUDFLARE_API_TOKEN`. Do not put that token in a repository secret. The job also reads the existing secret name `CLOUDFLARE_ACCOUNT_ID` and the existing variable `SVGIF_R2_BUCKET`, plus the environment variable `SVGIF_CDN_ZONE_ID` for cache purge. Values stay out of git. The token scope is R2 write on that bucket and cache purge on that zone. There is no OIDC broker. Do not set `SVGIF_CDN_BASE`. That variable becomes `https://cdn.thumly.io/svgif` only when the first gated release uploads. On the zone, set `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin`, and `Referrer-Policy: no-referrer-when-downgrade`. Do not put a strict Content-Security-Policy on these responses. On the bucket, allow CORS `GET` and `HEAD` from origin `*`. The custom domain has to answer before that upload's fetch check. DNS values stay out of this file. [[sot:svgif/distribution]] [[adr:svgif/20261110164419]]
8. In the repository security settings, enable Dependabot alerts and Dependabot security updates. The release workflow fails closed until the alerts API returns 200.
9. Enable secret scanning and secret scanning push protection.
10. Enable private vulnerability reporting. `SECURITY.md` tells reporters to use that channel.
11. Mark the Actions checks `Dependencies`, `Actions`, and `CodeQL` as required on `main` once they have run. `Scorecard` and `Tracking issue` are scheduled; they are not pull-request checks.
12. Do not create an MCP Registry publisher, a Cursor Marketplace submission, or any other plugin-directory account. Agents install `modootoday/svgif` at the `v*` tag.

## Record

Environment `npm` already exists with tag policy `v*` and no required reviewers. The release gate, not a reviewer click, is what stops a trivial publish.
