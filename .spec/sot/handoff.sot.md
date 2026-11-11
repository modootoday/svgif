---
id: sot:svgif/handoff
title: Cloud-agent handoff
status: active
created: 2026-11-10
updated: 2026-11-11T02:13:33Z
verify: manual
tags: [roles, agents]
rel:
  depends_on:
    - sot:svgif/org-chart
    - adr:svgif/20261110122700
---

# Cloud-agent handoff

## Rule

The orchestrator and every role run as separate Cursor Cloud Agents. Each session starts on a fresh virtual machine. Sessions do not share a chat. They meet only through this repository: branches, pull requests, issues, and the handoff files below. [[adr:svgif/20261110122700]]

An external launcher may start a session, report status to the owner, and trigger automation. It is not a role. It is not listed in `SVGIF_RELEASE_ACTORS`. It does not edit the repository and it does not dispatch the release workflow.

### What a session reads

1. `AGENTS.md`
2. [[sot:svgif/org-chart]]
3. This document
4. `.agents/roles/<role>/BOOTSTRAP.md`
5. The assignment under `.agents/handoff/assignments/` whose `to` is that role and whose status is `assigned` or `in-progress`
6. That role's latest file under `.agents/handoff/outbox/<role>/`

The chat transcript is not a source. A new session that cannot find the assignment does no product work.

### Assignment and return

The orchestrator writes assignments. One assignment is one work package, one role, and one pull request. The file is `.agents/handoff/TEMPLATE.md` copied to `.agents/handoff/assignments/<id>.md`.

A session ends by copying that template to `.agents/handoff/outbox/<role>/<id>.md`, committing it on the role branch, and opening or updating the pull request. Status is `done` or `blocked`. A blocked file names the role that must move first. It does not name a second owner for a path.

For a studio preset outbox, a per-preset pass or fail must come from a raster of frame 0, the mid frame, and the last frame at the stated coordinates. A source parameter, a path string, or a key value is not that measurement. A claim that names a coordinate the raster does not show is a failed report. [[sot:svgif/handoff]] [[sot:svgif/preset-registry]]

The session does not merge its own pull request. The orchestrator may merge only when all of these hold: the outbox says `done`, CI on that pull request is green, and every changed path is one that [[sot:svgif/org-chart]] gives that role. One exception: a compiler pull request may also contain `presets/<category>/*.golden.svg` files that are the byte output of `node scripts/ci/check-presets.mjs --goldens`. It runs that generator and commits only those SVG files. It does not edit a preset JSON document, `presets/index.json`, or a fixture. The outbox names the command and each golden path. The assignment does not list `presets/` in `paths`, because that prefix belongs to `studio`. The orchestrator applies this exception at merge. It does not apply when a studio assignment already owns that category and is sequenced to regenerate it after the compiler merges. In that case the compiler pull request leaves the goldens alone, and the studio pull request runs the generator. The default `node scripts/ci/check-presets.mjs` does not compare goldens, so the compiler pull request stays green either way. The orchestrator does not create a `v*` tag and does not dispatch the release workflow.

### Ownership

Path ownership is the tables in [[sot:svgif/org-chart]]. The longest matching prefix wins, so `docs/llms.txt` stays with `agent` and `docs/Gemfile.lock` stays with `release` even though `docs/` is `docs`. Two open assignments must not name the same prefix. The orchestrator does not edit the org chart. The `govern` role does, in its own pull request.

## Why

A shared chat hides which role changed a path. A file in the repository is the record the next fresh machine can read.

## Verification

`spec check` resolves this id. `node scripts/ci/check-ownership.mjs` reads the org-chart role table and path rows, then `.agents/handoff/assignments/`. It exits non-zero when `to` is missing or is not a role id, when an assignment whose status is `assigned` or `in-progress` has a missing or empty `paths` list, when two of those open assignments use the same path or one path is a prefix of the other, or when a listed path has no owning row or the longest matching row names a different role than `to`.
