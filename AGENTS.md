# AGENTS.md

Router for agents working in the svgif.js repository. Keep this file short. Sources of truth live under `.spec/`. Human-facing marketing and usage live under `docs/` and `README.md`.

## Hard constraints

1. **English only.** Every authored document, docs-site page, workflow comment, code comment, commit subject and pull-request text in this repository is English. A Korean docs-site locale may be added later only as an i18n translation (`*.ko.md`), never as the source language. [[adr:svgif/20261110120900]] [[sot:svgif/conventions-adopted]]
2. **Browser only.** Runtime, player, Studio, and every export run as static files in the user's browser. No product server, no server-side encode, no required Node or CLI. [[sot:svgif/client-runtime]] [[adr:svgif/20261110121300]]
3. Render output is SVG. Do not make a WebGL canvas or a raster framebuffer the library's primary render target. A canvas is allowed only as a client-side raster step for WebP, WebM and GIF. [[adr:svgif/20261110120000]]
4. Do not depend on the `three` package. Math and the scene API are owned here. [[adr:svgif/20261110120100]]
5. Do not depend on, redistribute, or copy `remotion`. [[adr:svgif/20261110120200]]
6. Directories follow the ecosystem standard (npm workspaces, Jekyll, GitHub, JSON Schema, specfold), not a sibling repo's private layout. [[sot:svgif/conventions-adopted]]
7. **Do not release.** A merge does not tag or publish. `docs`, `chore`, `ci`, `test`, `refactor`, and `style` never cut a version. Do not run `git tag`, `npm publish`, `npm version`, or `gh release create`. Do not dispatch `.github/workflows/release.yml` unless this session is the release role and the release-readiness manifest for that exact SHA is complete. [[sot:svgif/release-gate]] [[adr:svgif/20261110122200]]
8. The npm package is `@modootoday/svgif`. Do not tell readers to install the unscoped name `svgif`. [[adr:svgif/20261110122100]]
9. Design records are specfold documents. Do not invent a parallel markdown policy tree. Before changing code, run `spec context <path>`. Create documents with `spec new`, change status with `spec set`.
10. Do not pretend the engine exists. Until the engine package has source, gate scripts only check that the design records exist. Once that tree exists, the same scripts must run that package's tests and fail if they are missing.
11. **Public surface.** Do not commit secrets or personal email addresses. Do not add a `Co-authored-by` trailer unless the address is `@users.noreply.github.com`. [[sot:svgif/sensitive-content]]
12. **Supply chain.** Pin a third-party action to a full commit SHA and a version comment. Do not add `pull_request_target`. Install project packages with `npm ci`. New dependencies follow [[sot:svgif/supply-chain]]. The `release` role owns that surface.
13. **Agent surface.** Studio is enough for a person. The CLI and MCP server are optional adapters over the same engine. Do not submit the repo to a plugin registry. Public skills stay in `skills/`. A governance skill must set `metadata.internal` so the skills CLI does not install it with the product. [[sot:svgif/agent-surface]] [[sot:svgif/agent-distribution]]

## Where to read next

| Working on | Read |
| --- | --- |
| What holds now | [[sot:svgif/roadmap]], [[sot:svgif/architecture]] |
| Serial and parallel implementation | [[plan:svgif/20261110122000]] |
| Audience split | [[sot:svgif/audiences]] |
| Conventions taken from sibling repos | [[sot:svgif/conventions-adopted]] |
| Decisions still open | [[sot:svgif/open-questions]] |
| Releases | [[sot:svgif/release-gate]], `.github/RELEASING.md` |
| Actions and packages | [[sot:svgif/supply-chain]] |
| CLI, MCP, skills | [[sot:svgif/agent-surface]], [[sot:svgif/agent-distribution]] |
| Roles | [[sot:svgif/org-chart]], [[sot:svgif/handoff]] |
| External embed | [[sot:svgif/external-embed]] |
| One-time owner setup | [[runbook:svgif/one-time-owner-setup]] |
| Public sentences | `docs/`, `README.md`. Do not paste SoT prose into the site. |

## Done means

| Scope | Gate |
| --- | --- |
| Design records | `spec check` |
| Docs site | In `docs/`: `bundle exec jekyll build`, then `bundle exec modootoday-check . _site --twins --strict` |
| After the engine exists | `typecheck`, `test`, `test:visual`, `test:export` from the root `package.json` |
| Final product | Tiers 1, 2, and 3 in [[plan:svgif/20261110122000]] pass on one commit, and the release workflow is what creates the tag. A live Studio page is part of that, not a substitute for the scenario manifest. |

## Commits

Subjects are English Conventional Commits. Use a `Changelog: none` footer only when a commit must stay out of the generated notes. [[adr:svgif/20261110120700]]
