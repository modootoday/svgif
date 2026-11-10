---
id: sot:svgif/conventions-adopted
title: Conventions adopted from sibling repositories
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [conventions, specfold, language]
---

# Conventions adopted from sibling repositories

This document is the rule for what svgif took from ModooToday sibling repositories and what it refused. Each item names its source. Repositories that could not be read are not guessed.

## Rule

### Precedence

Layout follows the standard of the tool or language being used. A sibling repository is a source of product convention only where it does not contradict that standard. [[sot:svgif/package-layout]] is the directory rule.

| Concern | Standard that wins | Sibling use |
| --- | --- | --- |
| TypeScript packages | npm `workspaces` (`packages/*`, `apps/*`), per-package `package.json` `exports`, `src/`, `test/`, `dist/`, `tsconfig.json` | Bun, `tsup`, or Vitest may be the tool inside those directories. They do not invent a second tree. |
| Docs site | Jekyll: `docs/_config.yml`, `_data/`, `_layouts/`, `_includes/`, `assets/`, and `_site/` as the build | The theme gem and a public site such as meari show one way to fill those directories. |
| GitHub | `.github/workflows/`, `.github/ISSUE_TEMPLATE/`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/dependabot.yml` | Workflow *behavior* may follow a public sibling. The paths stay GitHub's. |
| JSON Schema | `$id`, `$schema`, files named `*.schema.json` under `/schema` | No sibling layout overrides this. |
| Design records | specfold: root `spec.toml` and `.spec/<type>/` as in specfold's own docs | humanymous root `sots/` and `plan/` are not used. |

1. If a sibling path and an ecosystem path disagree, the ecosystem path is the one svgif creates.
2. Items below cite public siblings for license, language, release, and audience split. They do not move directories.

### Line endings

1. Text is LF everywhere. `.gitattributes` sets `* text=auto eol=lf`. Images, fonts, wasm, and media are `binary` (`*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.ico`, `*.woff`, `*.woff2`, `*.wasm`, `*.webm`, `*.mp4`, `*.pdf`). `.editorconfig` sets `end_of_line = lf` for `[*]`.
2. `scripts/ci/check-lf.sh` fails when `git ls-files --eol` reports `i/crlf` or `i/mixed`. `.github/workflows/ci.yml` runs that script on pull requests and on pushes to `main`. This is a Git attribute, not a sibling-repo layout.

### Language

1. **English is the source language of this repository.** Authored documents, the docs site, agent governance, workflow comments, code comments, commit subjects and pull-request text are English. A Korean translation of the docs site may be added later only as an i18n locale (`*.ko.md` with `lang: ko`), never as the source. This is also the first hard constraint in `AGENTS.md` and in `.agents/rules/05-english-only.mdc`. Decision: [[adr:svgif/20261110120900]].
2. That rule matches the English lock in arks `.spec/sot/language-english-only.sot.md` (which cites the public humanymous repository), the English public docs of specfold, meari `docs/`, and humanymous `AGENTS.md`. It supersedes an earlier instruction to write user-facing docs in Korean. meari `.spec/sot/conventions.sot.md` is Korean; svgif does not copy that for its source prose. jekyll-theme-modootoday ships a `ko` catalog and `full_languages`, which is how a later locale would be added, not how the source is written.

### Documents

3. Design, planning and maintenance records use specfold types (`sot`, `adr`, `plan`, `research`, `evidence`, `guide`, `page`, `runbook`, `change`) under the root `.spec/`. Sources: specfold `README.md` and `docs/concepts/document-types.md`; meari `AGENTS.md`; arks `spec.toml`.
4. `spec.toml` is `schema = 1`, one owner, and `[[assets]]` entries for `AGENTS.md`, `.agents/rules` and `.agents/skills`. Source: arks `spec.toml`. CI pins `modootoday/specfold@v0.8.1`.
5. humanymous keeps `sots/` and `plan/` at the repository root (`AGENTS.md`). svgif does not copy that layout. The specfold standard is `.spec/`, and the public repos meari, arks and jekyll-theme-modootoday use it.
6. Conventions are cited only from repositories that are public. Names of repositories that are not public are not written in this tree. [[sot:svgif/sensitive-content]]

### Audiences, packages, license

7. Human surfaces and agent governance are separate lanes. Source: arks `.spec/sot/public-surface.sot.md` items 4–6. svgif paths: [[sot:svgif/audiences]].
8. npm scope is `@modootoday`. Sources: `@modootoday/specfold`, pmcp `package.json` (`@modootoday/pmcp`), `@modootoday/envs`, devtools-public workspace name.
9. Packages are ESM and expose an `exports` map. A sibling may suggest the installer or the test runner (pmcp and envs use Bun, tsup, and Vitest). Those tools run inside the npm workspace layout. They are not a reason to add a package-manager-specific workspace file or a non-standard test directory. No engine package is created in the design snapshot.
10. License is MIT OR Apache-2.0. Sources: specfold, meari `LICENSE-MIT` / `LICENSE-APACHE`, jekyll-theme-modootoday MIT, devtools-public README (MIT), humanymous description (Apache-2.0). Elastic-2.0 from pmcp and envs is not adopted. [[adr:svgif/20261110120800]]
11. `packages/*` and `apps/*` are the npm workspaces seats (also read by pnpm and Bun). devtools-public happening to use `packages/` agrees with that standard; it is not the reason for the seat. Directories are created when the first package is, not before. [[sot:svgif/package-layout]]

### Site and release

12. The public site is Jekyll in `docs/` on `jekyll-theme-modootoday`, with twins, `llms.txt` and `modootoday-check`. The Gemfile uses Jekyll 4 and `jekyll-remote-theme` 0.6 so `rubyzip` can stay on the patched 3.4 line. Hosting is GitHub Pages built by Actions. [[adr:svgif/20261110120600]]
13. The changelog is generated only by git-cliff from Conventional Commits. Section names follow jekyll-theme-modootoday `cliff.toml` (Keep a Changelog). The hand-written summary paragraph in that repo's `RELEASING.md` step 2 is not adopted. [[adr:svgif/20261110120700]]
14. Registry publish is OIDC trusted publishing from `.github/workflows/release.yml`. Sources: specfold `.github/RELEASING.md` and `release.yml`. Required human reviewers on the `npm` environment are not adopted. A branch push does not publish, and a trivial commit type does not cut a version. [[adr:svgif/20261110121000]] [[sot:svgif/release-gate]]
15. Dependabot, code scanning, labels and stale handling are GitHub Actions. Source: jekyll-theme-modootoday `.github/dependabot.yml` and `dependabot-auto-merge.yml`. A pull request that edits workflow files is still merged by a person, which that repo's `RELEASING.md` already records as a limit.

### Refused

16. meari CI is `workflow_dispatch` only (comment in `.github/workflows/ci.yml`). svgif CI runs on pull requests and pushes to `main`.
17. humanymous detection-freeze, session board and Docker-only e2e completion authority are not product rules here. arks cites humanymous as a convention lab; svgif does not paste that ledger.
18. specfold's own `[forbid]` of `.spec` exists because that repository publishes code and keeps design records elsewhere (`spec.toml`). svgif commits `.spec/` because the design is the current source of truth.
19. If a fact came from a repository that is not public, it is not recorded here. The sensitive-content rule is [[sot:svgif/sensitive-content]].

## Why

Ecosystem layouts are what contributors and tools already expect. Sibling layouts are useful for license, release, and specfold, and harmful when they replace `src/`, Jekyll's directories, or specfold's `.spec/`.

## Verification

`spec check` must resolve every `[[id]]` in this document. `bash scripts/ci/check-lf.sh` must exit 0. A new adopted convention adds a source path in the same edit.
