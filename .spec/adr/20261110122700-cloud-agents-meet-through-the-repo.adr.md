---
id: adr:svgif/20261110122700
title: Cloud agents meet through the repository
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/org-chart
    - adr:svgif/20261110122200
---

# Cloud agents meet through the repository

## Context

The owner runs the orchestrator and each role as its own Cursor Cloud Agent. A fresh machine cannot see another session's chat. An external launcher can start those sessions and report status. If that launcher also edited files, the org chart would have an unlisted author.

## Decision

1. Sessions interact only through branches, pull requests, issues, and the handoff files in [[sot:svgif/handoff]].
2. A session starts from its bootstrap brief plus the latest assignment and outbox. It ends by writing an outbox file and opening or updating a pull request.
3. A session does not merge its own pull request. The orchestrator may merge when the outbox says the work package is done, CI is green, and the diff stays inside that role's paths.
4. The orchestrator and every other role stay out of `SVGIF_RELEASE_ACTORS`. Merging a pull request is not a release. [[sot:svgif/release-gate]]
5. The launcher is not a role and does not commit.

## Consequences

Role ids stay the ones in [[sot:svgif/org-chart]], plus `orch` and `govern`. Handles that are not in that chart are not introduced. The protocol text is [[sot:svgif/handoff]].
