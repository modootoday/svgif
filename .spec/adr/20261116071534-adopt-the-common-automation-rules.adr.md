---
id: adr:svgif/20261116071534
title: Adopt the common automation rules
status: active
created: 2026-11-16T07:15:34Z
updated: 2026-11-16T07:16:11Z
rel:
  depends_on: [adr:svgif/20261110122700]
---

# Adopt the common automation rules

## Context

The owner runs three open-source projects with unattended agent sessions and asked for one set of shared rules. The projects differed in CI triggers, check names, the public-surface scan, and attribution trailers. A design session wrote the common automation rules, version 1.0, after a review by a session of each project. A session review is an opinion. The owner then told a session of this repository to apply the rules here.

## Decision

This repository adopts the common automation rules, version 1.0. Its copy is [[sot:svgif/automation-rules]], not a parallel policy file.

Four things change here. The secret scan check is named `Secret scan`, not after its tool. The `Co-authored-by` rule accepts only `@users.noreply.github.com`. `Public surface` scans every commit message in the pull request range, because the pushed branch is public before the squash. A commit carries no machine trailer; the session link goes in the pull request body.

[[sot:svgif/handoff]] no longer names one agent provider.

## Consequences

The owner must apply `.github/rulesets/main.json` again after the rename merges, or `Secret scan` is never satisfied. The owner creates the labels and registers the Dependabot secrets. Commits made before this record keep their trailers; history is not rewritten. A Dependabot commit keeps its own sign-off line, which is the one exemption in the message scan.
