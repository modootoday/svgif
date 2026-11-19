---
id: adr:svgif/20261119195149
title: Adopt the playpilot commit-history rules
status: active
created: 2026-11-19T19:51:49Z
updated: 2026-11-19T19:51:49Z
rel:
  depends_on: [adr:svgif/20261116071534]
---

# Adopt the playpilot commit-history rules

## Context

The owner's projects share one commit-history canon, H1 to H7, in `modootoday/playpilot` under `.agents/rules/commit-history.md`. It sets one merge method per repository, takes the squash subject from the pull request title, limits what a topic branch may hold and who may rewrite it, and turns auto-merge on as soon as a pull request opens. The owner told a session of this repository to adopt it in two phases. Phase 1 records the rules and adds the `History` check without making it required. Phase 2 adds the `playpilot guard` hook once the cloud environment has the `playpilot` CLI.

## Decision

[[sot:svgif/automation-rules]] carries H1 to H7 in its Commit history section, with these project values:
- Squash stays the one merge method.
- The pull request title is the squash subject, a Conventional Commits subject of at most 72 characters, and the squash message is blank.
- A session turns auto-merge on right after it opens a pull request, `needs-human` included, and turns it off before it adds commits.
- The orchestrator keeps its own merge limits where they are stricter.

`.github/workflows/ci.yml` gains the job `History`. It builds `playpilot` at commit `0ddc0e1dfd1bac378901817a5fb106935fd5fba1` with `cargo install --locked` and runs `playpilot history-check --method squash` on the pull request range and title. It is not in `.github/rulesets/main.json`.

## Consequences

A `needs-human` pull request can now merge when its required checks pass, with no person in the loop, because the ruleset requires no approving review. Changes that remove or weaken a required check, loosen a ruleset, or release or tag stay with the owner, and auto-merge stays off for them. Pull request titles before this decision, such as `studio: …`, are not Conventional subjects. The `History` check reports such a title on an open pull request, and the session renames the pull request. Merged history is not rewritten. Making `History` required, and adding the guard hook, are later changes.
