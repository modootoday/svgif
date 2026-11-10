---
id: sot:svgif/sensitive-content
title: Nothing sensitive on the public surface
status: active
created: 2026-11-10
updated: 2026-11-10
verify: bash scripts/ci/public-surface.sh
tags: [security, public, agents]
rel:
  depends_on:
    - sot:svgif/audiences
    - adr:svgif/20261110121900
    - adr:svgif/20261110164419
---

# Nothing sensitive on the public surface

## Rule

The repository, the docs site, the CDN, the public skills, and the plugin manifests are public. Agents and people do not put sensitive content on that surface. `AGENTS.md`, `CLAUDE.md`, and `.agents/rules/20-public-surface.mdc` repeat this rule. The four audience lanes in [[sot:svgif/audiences]] stay separate. Plugin owner fields do not carry an email address.

### What is sensitive

- Secrets, tokens, keys, passwords, session cookies, private key blocks.
- Account identifiers, including cloud account ids and zone ids.
- Names or paths of repositories that are not public, and internal product hostnames.
- Personal data, including a personal email address, and private business details that are not already part of the public product name.
- A `Co-authored-by` trailer whose address is not a GitHub noreply address (`@users.noreply.github.com`).
- Agent transcripts, hidden prompts, and scratch notes from a private session.
- Machine paths from a developer or CI sandbox, and the names of internal tools that are not part of this product.
- Source maps that contain any of the above.

The list of concrete private strings is not stored in git. It is supplied at check time. [[adr:svgif/20261110121900]]

### Where it is forbidden

Code, comments, docs, the docs site, commit messages, pull-request titles and bodies, issues, `CHANGELOG.md`, release notes, workflow logs, uploaded artifacts, CDN bundles, and source maps. Source maps are not published. The package `files` list omits them.

### What is allowed

- GitHub Actions secret **names** and variable names. Never values.
- Placeholders such as `<cdn-host>`, `example.invalid`, and `sha384-...`.
- Public repository names that this tree already cites as conventions: specfold, meari, arks, jekyll-theme-modootoday, pmcp, envs, devtools-public, humanymous.
- The public Pages host `modootoday.github.io` and the public npm scope `@modootoday`.

### CDN upload token

Library upload uses an API token. Official CI OIDC for R2 does not exist. [[adr:svgif/20261110164419]] The token is the GitHub Environment secret `CLOUDFLARE_API_TOKEN` on `cdn-release`. Store that secret on `cdn-release` only. Its scope is R2 write on that bucket and cache purge on that zone. No account-wide write.

Secret names and variable names may appear. The names are `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SVGIF_R2_BUCKET`, and `SVGIF_CDN_BASE`. A token value, an account id, and a zone id stay out of workflows, docs, and every other tracked file.

Rotation replaces the environment secret `CLOUDFLARE_API_TOKEN`. The value is never committed. After a leak, revoke the token first. Purge caches of an object that actually contains the value. A clean exact-version object stays in place. Do not delete that object to roll back.

`bash scripts/ci/public-surface.sh` is the check. A workflow or a doc that contains a token value or an account id fails that scan. The value is a line of `SVGIF_DENY_TERMS`, supplied at check time. The self-test does not contain a sample account id or a sample zone id.

### Enforcement

1. `scripts/ci/public-surface.sh` scans every tracked file against `scripts/ci/deny-patterns.txt` (private-key blocks and `AKIA` prefixes) and rejects tracked `.env` files. That file scan does not depend on how the branch is merged. A non-noreply email address fails. A `Co-authored-by` trailer fails unless every address on that line is a GitHub noreply address. The script does not print the matched text. Before the scan, CI registers each deny-term line with the Actions log masker so a later log line cannot show it.
2. The message scan covers only text that will land. On a pull request, `SVGIF_LANDING=squash`: the landed message is the pull-request title and the description. Intermediate branch commits are not scanned. A generated link footer after `<!-- CURSOR_AGENT_PR_BODY_END -->` is not the squash message and is not scanned. On a push to `main`, `SVGIF_LANDING=push`: every commit in `SVGIF_COMMIT_RANGE` landed, so each message is scanned. An unknown landing mode fails closed. `.githooks/commit-msg` still rejects a bad trailer in a new commit.
3. Each non-empty line of `SVGIF_DENY_TERMS` is an extra forbidden substring, for files and for the landed message. A workflow or a doc that contains a token value or an account id fails when that value is one of those lines. CI always sets `SVGIF_REQUIRE_DENY_TERMS=true`. An empty secret fails the job. A local run without the secret still scans the committed patterns and says the extra list was skipped. The self-test does not embed a sample account id or a sample zone id.
4. `scripts/ci/check-published-artifacts.sh` scans the built docs site and the npm tarball. A path that includes `.spec`, `.agents`, or `AGENTS.md`, a `*.map` source map, or a deny term fails the job. This scan is not skipped for a squash. The docs build sets Sass sourcemaps to `never` and deletes any `*.map` the theme copied, so the tree handed to the scan has no source maps. A map that remains still fails the job.
5. GitHub secret scanning and push protection stay enabled. `gitleaks detect --redact` runs in CI.
6. `.githooks/pre-commit` runs the file scan. `.githooks/commit-msg` rejects a bad trailer in the message being created. Set `git config core.hooksPath .githooks`. `spec hook` is additional, not a replacement.
7. `.github/pull_request_template.md` has a checklist line for this rule.
8. `.github/CODEOWNERS` covers the repository, `.github/`, `schema/`, and `.spec/sot/sensitive-content.sot.md`.

### Incident

If a secret or a private name lands on a public branch: revoke or rotate the credential first, then remove it from the tip, then purge it from history and from CDN caches of any bundle that contains it. Open a GitHub security advisory if the value was pushed. Do not paste the value into the advisory body, the issue, or the commit message that removes it. A leaked CDN upload token follows the CDN upload token rule: revoke the `cdn-release` secret first, purge caches of an object that actually contains the value, and do not delete a clean exact-version object to roll back.

## Why

A public animation library is copied widely. A single committed hostname or token stays in forks and in the CDN cache.

## Verification

`bash scripts/ci/public-surface.sh --self-test` and `bash scripts/ci/check-published-artifacts.sh --self-test`. The CI workflow `.github/workflows/ci.yml` runs the file scan, the landed-message scan, gitleaks, and the artifact scan. The public-surface job fails when `SVGIF_DENY_TERMS` is unset. Creating that secret is a one-time owner step in [[runbook:svgif/one-time-owner-setup]].
