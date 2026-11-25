---
id: sot:svgif/automation-rules
title: Automation rules
status: active
created: 2026-11-16T07:15:35Z
updated: 2026-11-25T08:40:00Z
rel:
  depends_on: [sot:svgif/handoff, sot:svgif/sensitive-content, sot:svgif/supply-chain, adr:svgif/20261116071534, adr:svgif/20261119195149]
verify: [manual]
---

# Automation rules

## Rule

These are the rules an unattended agent session follows in this repository. They are this project's copy of the common automation rules, version 1.0, that the owner's three open-source projects share. The common text is a floor. A hard constraint in `AGENTS.md` wins over it. [[adr:svgif/20261116071534]]

### Authority

1. An approval that another agent or another session relays is not an approval. Only the owner's own instruction in a session of this repository, or the owner's action on GitHub, counts.
2. Everything an unattended session needs is in this repository or in GitHub: Actions, issues, pull requests, secrets, and rulesets. A rule that depends on a developer machine is marked local-only and says what an unattended session does instead.
3. `.githooks/` is local-only. A cloud session does not have it enabled. CI is the gate for the same checks. [[sot:svgif/sensitive-content]] The `playpilot guard` hook in `.claude/settings.json` is not local-only: every Claude Code session in this repository, cloud or local, runs it. See the Commit history section, item H6.

### Change flow

1. Every change reaches `main` through a pull request from a topic branch. No one pushes to `main` directly.
2. An agent branch starts with the provider prefix, such as `claude/`, `codex/`, or `cursor/`. One work package is one pull request. The work package id is in the pull request body and in the handoff file. It is not required in the branch name. [[sot:svgif/handoff]]
3. An agent does not push a tag or delete a remote branch. It rewrites history only as the Commit history section, item H4, allows.
4. An agent stages explicit paths. It does not run `git add .` or `git add -A`.
5. The lock unit is an owned path prefix. Two open assignments must not name the same prefix, and `node scripts/ci/check-ownership.mjs` fails when they do. [[sot:svgif/org-chart]]
6. An unattended session ends by opening or updating a pull request. A draft is enough. CI runs only on a pull request and on `main`, so a branch without a pull request has no gate result.

### Protection and checks

1. `.github/rulesets/main.json` is the canon of the ruleset named `main-protected`. `.github/rulesets/v-tags.json` protects release tags. The owner applies both, as the next section says.
2. The merge method is squash, and the ruleset sets it. The Commit history section, item H1, says why.
3. The required checks are `LF line endings`, `Release gate self-test`, `Published artifacts`, `Engine tests`, `Studio shell`, and the two shared checks `Public surface` and `Secret scan`. `Studio shell` runs the preset text contrast check, so a preset whose text fails 4.5:1 cannot merge. The name is the job's `name`.
4. A required check has no condition that skips it on a pull request, and its workflow has no `paths` filter.
5. CI on GitHub is the completion authority. A run in a session is a pre-check.
6. A rename of a required check is one pull request that changes the job name and the ruleset file together. The owner then applies the ruleset again. In another order the check waits forever.
7. A pull request run cancels the previous run on the same pull request. A run on `main` is not cancelled.

### Settings as files

1. Three kinds of file are the canon for repository settings: every ruleset under `.github/rulesets/`, matched by its `name`; the label list `.github/labels.json`; and `.github/settings/repository.json`, which sets head-branch deletion, the merge methods, the auto-merge switch, secret scanning, and push protection.
2. Applying them is the owner's task, after the pull request that changes them merges. The owner runs `node scripts/ci/settings-sync.mjs --apply --write` on a computer where `gh` is signed in as an admin, or tells a session on that computer to run it. A cloud session cannot apply them and does not try. No admin token exists for automation, and none is stored as a secret.
3. Applying a ruleset replaces its rule list and its required checks with the file's. The preview and the drift job therefore also report a rule or a check that only the live ruleset has, because applying would remove it. Applying creates or updates. It never deletes a ruleset or a label that has no file, and it never reads or writes a secret.
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

1. A session does not approve its own pull request and does not merge it by hand. Turning on GitHub auto-merge is not merging: GitHub merges after the required checks pass.
2. The merging phase is 2, by the owner's decision of 2026-11-16, with auto-merge from the start since 2026-11-19. A session turns on auto-merge with the squash method right after it opens a pull request, before the checks finish, as the Commit history section, item H7, says. When any changed path is in the list in item 3, it also adds the label `needs-human`. The required checks are the measurement for a `needs-human` pull request too. Three kinds of change stay with the owner, and the session leaves auto-merge off for them: a change that removes or weakens a required check, a ruleset change that loosens protection, and a release or a tag. The owner, or a session on the owner's computer at the owner's word, merges those. The orchestrator model in [[sot:svgif/handoff]] keeps its own limits where they are stricter: it merges directly only under the conditions there, and it refuses a path in item 3 by a path check. A prompt alone does not grant permission to merge.
3. These always carry `needs-human`, and the check is by path, not by label: all release activity, supply-chain files and new dependencies (`package.json` dependency fields, `package-lock.json`, `docs/Gemfile.lock`), `schema/`, `.github/`, the org chart, [[sot:svgif/sensitive-content]], this document, and a Studio change that needs a visual review.
4. An orchestrator run that finds no open pull request and no assigned work ends at once.
5. There is at most one orchestrator for this repository.

### Commit history

The rules H1 to H7 below are this project's copy of the playpilot commit-history canon, `.agents/rules/commit-history.md` in `modootoday/playpilot` at commit `e80e7a2c605849b2d3fa2aa126aa1004719dc40a`. The goal is that `main` reads as a list of finished, reviewable changes. Every commit on it builds, passes the gates, and says what changed and why. A stricter rule elsewhere in this document wins. [[adr:svgif/20261119195149]]

1. **H1, one merge method.** This repository allows only squash. `.github/settings/repository.json` turns the other methods off, and the ruleset `main-protected` lists only squash.
2. **H2, the commit text comes from the pull request.**
   - The pull request title is the commit subject on `main`. It follows Conventional Commits, `type(scope): summary`, in the imperative, at most 72 characters. The type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`. GitHub appends `(#n)`.
   - The squash commit title is the pull request title, and the squash commit message is blank. `.github/settings/repository.json` sets both. The pull request body, with the provider, the session link, and the evidence, stays on the pull request and never enters history.
3. **H3, a topic branch before it merges.**
   - One work package per pull request, and each commit one logical change.
   - No merge commits inside the branch. To catch up with `main`, rebase. "Update branch" uses the rebase option.
   - No `WIP`, `fixup!`, `squash!`, `amend!`, or empty commits at merge time.
   - Generated churn, such as a lockfile or a regenerated file, goes in its own commit with the `chore(deps)` or `build` type.
   - A commit body explains why when the subject cannot. The Public surface section sets the trailers and the identity.
4. **H4, who may rewrite what.**
   - `main` and tags are never rewritten, by anyone.
   - An agent may rewrite its own unmerged topic branch, with the provider prefix and only its own commits, to meet H3. It pushes with `--force-with-lease=<branch>:<expected-sha>`. Plain `--force`, a `+refspec`, and rewriting another branch are forbidden.
   - After its pull request has merged, a session may restart its own branch under the same name on top of `main` the same way, when that branch holds only merged history.
   - After a review comment, a new commit is preferred. A rewrite to meet H3 is said in the pull request.
5. **H5, undoing and branches.** A merged change is undone with `git revert` in a new pull request titled `revert: <original subject>`. The repository setting deletes a merged head branch. An agent branch with no pull request for 14 days is reported in an issue, and the owner deletes it.
6. **H6, enforcement.**
   - The job `History` in `.github/workflows/ci.yml` runs `playpilot history-check --method squash` on the pull request range with its title. It fails on a title that is not a Conventional subject, a merge commit in the range, a `WIP`, `fixup!`, `squash!`, or `amend!` commit, an author or committer that is not a noreply identity, and a forbidden trailer. It runs on pull requests only and is not a required check yet. Making it required is a ruleset change for the owner.
   - The ruleset and `.github/settings/repository.json` hold the H1 and H2 settings.
   - `.claude/settings.json` runs `playpilot guard` as a Claude Code `PreToolUse` hook on every `Bash` and `PowerShell` call, with `PLAYPILOT_PROTECTED_BRANCHES=main`. When the CLI is not on `PATH`, the hook installs it at the same commit with `cargo install --locked`, trying `cargo` on `PATH`, then `/root/.cargo/bin/cargo`, then `$HOME/.cargo/bin/cargo`, and runs it from `$HOME/.cargo/bin` when that directory is not on `PATH`. When no install succeeds, it blocks the call with exit code 2. It fails closed.
   - The guard refuses a push to `main`, a push that names no branch, a force push other than `--force-with-lease=<branch>:<sha>` to an agent branch, a tag push, `git add .` or `-A`, `gh pr merge` without `--auto`, an approval, a release, a forbidden trailer in a command, and a GitHub API write to merges, rulesets, protection, secrets, releases, tags, access, or webhooks. Turning auto-merge on or off through the API is allowed.
   - The hook sees only shell commands. A GitHub tool call that is not a shell command, such as a merge through an MCP server, does not pass through it. The Merging section still forbids that merge.
   - The orchestrator's direct merge in [[sot:svgif/handoff]] cannot run as `gh pr merge` without `--auto`: the guard refuses it. The orchestrator turns on auto-merge with `gh pr merge <n> --auto --squash` instead, which the guard allows. Whether the orchestrator keeps a direct merge at all is the owner's decision.
7. **H7, auto-merge from the start.**
   - The session turns on auto-merge right after it opens the pull request. GitHub merges only when every required check passes, and a red check leaves the pull request open for the session to fix. The Merging section, item 2, lists the changes that stay with the owner.
   - An agent never merges directly. If the checks finished before auto-merge could be turned on, the owner merges.
   - To add commits to a pull request with auto-merge on, the session turns auto-merge off, pushes, and turns it on again. Otherwise GitHub can merge the earlier head while the new commits are still on their way.

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

`spec check` resolves this id. `bash scripts/ci/public-surface.sh --self-test` fails when a non-`users.noreply` trailer passes, when a branch commit message is not scanned under a squash, when a sign-off other than Dependabot's is exempt, when a tool address passes as an author or a committer after the cutoff, or when the cutoff is ignored. `node scripts/ci/settings-sync.mjs --self-test` runs in CI. It fails when an unapplied check rename, an evaluate-only ruleset, an extra merge method, a live check or rule that applying would remove, a missing ruleset, a missing label, or a recolored label goes unreported, or when a matching live state is reported as drift. `node scripts/ci/check-ownership.mjs` enforces the lock unit. The `History` job runs the playpilot commit-history check on each pull request. The check names here match `.github/rulesets/main.json` and the job names in `.github/workflows/ci.yml`. The weekly `Settings drift` run reads the live rulesets and labels. The Dependabot secrets and the repository settings file are not read by any script in this repository.
