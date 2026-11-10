---
id: adr:svgif/20261110121900
title: Private strings stay in a secret
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/audiences
---

# Private strings stay in a secret

## Context

The repository is public. A denylist of private repository names, if committed, publishes the names it was meant to hide. Commit messages and pull-request text are public too.

## Decision

Concrete private substrings are supplied at check time by the Actions secret `SVGIF_DENY_TERMS`. They are not written in git. The committed scan rejects private-key blocks, `AKIA` prefixes, and tracked `.env` files. It also rejects a personal email address, and a `Co-authored-by` trailer that is not a GitHub noreply address, in the text that will land: the pull-request title and body when the merge is a squash, and each commit message on a push to the default branch. Intermediate commits on a squash-merged pull request are not that landed message. Tracked files and published artifacts are scanned either way. The CI job fails closed when `SVGIF_DENY_TERMS` is unset. Setting that secret is the one-time owner step in [[runbook:svgif/one-time-owner-setup]]. Matched terms are not printed; CI masks each line before the scan.

## Consequences

A leak is rotated, removed from the tip, and purged from history and from any CDN object that contains it. The value is not repeated in the commit that deletes it.
