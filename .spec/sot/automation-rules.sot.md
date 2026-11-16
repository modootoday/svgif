---
id: sot:svgif/automation-rules
title: Automation rules
status: active
created: 2026-11-16T07:15:35Z
updated: 2026-11-16T07:41:25Z
rel:
  depends_on: [sot:svgif/handoff, sot:svgif/sensitive-content, sot:svgif/supply-chain, adr:svgif/20261116071534]
verify: [manual]
---

# Automation rules

## Rule

These are the rules an unattended agent session follows in this repository. They are this project's copy of the common automation rules, version 1.0, that the owner's three open-source projects share. The common text is a floor. A hard constraint in `AGENTS.md` wins over it. [[adr:svgif/20261116071534]]

### Authority

1. An approval that another agent or another session relays is not an approval. Only the owner's own instruction in a session of this repository, or the owner's action on GitHub, counts.
2. Everything an unattended session needs is in this repository or in GitHub: Actions, issues, pull requests, secrets, and rulesets. A rule that depends on a developer machine is marked local-only and says what an unattended session does instead.
3. `.githooks/` is local-only. A cloud session does not have it enabled. CI is the gate for the same checks. [[sot:svgif/sensitive-content]]

### Change flow

1. Every change reaches `main` through a pull request from a topic branch. No one pushes to `main` directly.
2. An agent branch starts with the provider prefix, such as `claude/`, `codex/`, or `cursor/`. One work package is one pull request. The work package id is in the pull request body and in the handoff file. It is not required in the branch name. [[sot:svgif/handoff]]
3. An agent does not rewrite pushed history, push a tag, or delete a remote branch. One exception: after its pull request has merged, a session may restart its own branch under the same name on top of `main` with `--force-with-lease`, when that branch holds only merged history.
4. An agent stages explicit paths. It does not run `git add .` or `git add -A`.
5. The lock unit is an owned path prefix. Two open assignments must not name the same prefix, and `node scripts/ci/check-ownership.mjs` fails when they do. [[sot:svgif/org-chart]]
6. An unattended session ends by opening or updating a pull request. A draft is enough. CI runs only on a pull request and on `main`, so a branch without a pull request has no gate result.

### Protection and checks

1. `.github/rulesets/main.json` is the canon of the ruleset named `main-protected`. `.github/rulesets/v-tags.json` protects release tags. The owner applies both, as the next section says.
2. The merge method is squash, and the ruleset sets it.
3. The required checks are `LF line endings`, `Release gate self-test`, `Published artifacts`, and the two shared checks `Public surface` and `Secret scan`. The name is the job's `name`.
4. A required check has no condition that skips it on a pull request, and its workflow has no `paths` filter.
5. CI on GitHub is the completion authority. A run in a session is a pre-check.
6. A rename of a required check is one pull request that changes the job name and the ruleset file together. The owner then applies the ruleset again. In another order the check waits forever.
7. A pull request run cancels the previous run on the same pull request. A run on `main` is not cancelled.

### Settings as files

1. Three kinds of file are the canon for repository settings: every ruleset under `.github/rulesets/`, matched by its `name`; the label list `.github/labels.json`; and `.github/settings/repository.json`, which sets head-branch deletion, the merge methods, the auto-merge switch, secret scanning, and push protection.
2. Applying them is the owner's task, after the pull request that changes them merges. The owner runs `node scripts/ci/settings-sync.mjs --apply --write` on a computer where `gh` is signed in as an admin, or tells a session on that computer to run it. A cloud session cannot apply them and does not try. No admin token exists for automation, and none is stored as a secret.
3. Applying creates or updates. It never deletes a ruleset or a label that has no file, and it never reads or writes a secret.
4. `.github/workflows/settings-drift.yml` runs the job `Settings drift` weekly, on a push to `main` that changes those files, and by hand. It uses `GITHUB_TOKEN`, compares only the keys the files state, and changes no setting. When the live rulesets or labels differ, including a merged change that nobody applied, it opens or updates the issue `Settings drift` with the label `needs-owner`. It closes that issue when a later run finds no difference. It is not a required check. The repository settings file is not compared, because `GITHUB_TOKEN` cannot read every key in it.
5. A pull request that changes `.github/rulesets/`, `.github/settings/`, `.github/labels.json`, or the drift workflow is `needs-human`. A merging orchestrator refuses those paths by a path check, not by the label alone.

### Public surface

1. `Public surface` scans every tracked file, every commit message in the pull request range, and the pull request title and body. The rules are in [[sot:svgif/sensitive-content]].
2. The deny lists are the secrets `SVGIF_DENY_TERMS` and `SVGIF_DENY_NAMES`. They are not committed and not given to a session. The same values are registered as Dependabot secrets. `scripts/ci/deny-patterns.txt` holds only generic patterns and is committed.
3. The job fails closed. A pull request from a fork fails this check and the owner reviews it.
4. A `Co-authored-by` trailer passes only when its address ends in `@users.noreply.github.com`. This overrides a tool's default trailer.
5. The author and the committer of an agent commit are the owner's GitHub noreply identity, set in the session's git configuration. A tool's default identity is not used. The committer may also be GitHub's own `noreply@github.com`, which GitHub sets on a squash, a merge commit, and a web edit. `Public surface` checks both addresses on every commit in the range. The check applies to commits made on or after 2026-11-17 UTC; earlier commits keep the identity they had. Which agent did the work is read from the branch prefix and the pull request body.
6. A commit carries no other machine trailer. The provider, the work package, and the session link go in the pull request body, in the `Agent` fields of the template.

### State

| Need | Where |
| --- | --- |
| Lock between runs | An open assignment on the same path prefix, plus workflow `concurrency` |
| Progress and run log | The pull request body and the Actions run history. Run logs are not committed |
| Record of a finished work package | The handoff file under `.agents/handoff/outbox/`. It is a record, not a log |
| Bug | A GitHub issue with the label `bug` |
| Owner decision pending | A GitHub issue with the label `needs-owner`, assigned to the owner. [[sot:svgif/open-questions]] keeps design questions |
| Change that automation must not merge or build on | The pull request label `needs-human` |
| What to do next | [[sot:svgif/roadmap]], [[plan:svgif/20261110122000]], and `.agents/handoff/assignments/`. Work with an open `needs-owner` issue is skipped |
| Build environment | `.github/workflows/ci.yml`. A cloud environment's setup script copies its tool versions |
| Coordination between sessions | Repository files and pull requests. Not messages between sessions |

### Merging

1. A session does not approve or merge its own pull request.
2. The merging phase is 1: the owner merges. The orchestrator model in [[sot:svgif/handoff]] starts only when the owner turns it on. A prompt alone does not grant permission to merge.
3. These always carry `needs-human`: all release activity, supply-chain files and new dependencies, `schema/`, `.github/`, the org chart, [[sot:svgif/sensitive-content]], this document, and a Studio change that needs a visual review.
4. An orchestrator run that finds no open pull request and no assigned work ends at once.
5. There is at most one orchestrator for this repository.

### Releases and entry points

1. An agent does not tag, publish, or dispatch the release workflow, except as [[sot:svgif/release-gate]] allows for the release role.
2. `AGENTS.md` is the entry. `CLAUDE.md` is a tracked pointer to it. Rules, roles, and skills are tracked under `.agents/`.
3. A scheduled task prompt names the task, says to end with a pull request, and points to these files. It holds no policy.
4. Dependabot covers npm, GitHub Actions, and Bundler weekly, with the label `dependencies` and a Conventional Commits prefix.
5. The repository has `SECURITY.md`, a pull request template with the `Agent` fields, issue templates for `bug` and `needs-owner`, and `CODEOWNERS` that names the owner for `.github/`.

### Open

The home of the common text and of a shared workflow is not decided. Whether past history is rewritten is not decided. Both are the owner's decisions and are not settled by this document.

## Why

The source is open, so the scan of what becomes public is the main gate for work that no person watches. Three projects had different triggers, check names, and trailer rules, and one session could not carry a habit from one repository to the next.

## Verification

`spec check` resolves this id. `bash scripts/ci/public-surface.sh --self-test` fails when a non-`users.noreply` trailer passes, when a branch commit message is not scanned under a squash, when a sign-off other than Dependabot's is exempt, when a tool address passes as an author or a committer after the cutoff, or when the cutoff is ignored. `node scripts/ci/settings-sync.mjs --self-test` runs in CI. It fails when an unapplied check rename, an evaluate-only ruleset, an extra merge method, a missing ruleset, a missing label, or a recolored label goes unreported, or when a matching live state is reported as drift. `node scripts/ci/check-ownership.mjs` enforces the lock unit. The check names here match `.github/rulesets/main.json` and the job names in `.github/workflows/ci.yml`. The weekly `Settings drift` run reads the live rulesets and labels. The Dependabot secrets and the repository settings file are not read by any script in this repository.
