---
id: sot:svgif/agent-distribution
title: Agent distribution
status: active
created: 2026-11-10
updated: 2026-11-10
verify: node scripts/ci/install-from-repo.mjs
rel:
  depends_on:
    - adr:svgif/20261110122500
    - sot:svgif/agent-surface
    - sot:svgif/release-gate
---

# Agent distribution

## Rule

The public GitHub repository is the distribution source. Nobody submits this project to a plugin registry or an MCP registry. [[adr:svgif/20261110122500]]

### One source

`schema/agent-surface/source.v1.json` holds names, descriptions, packages, and tool ids. `schema/agent-surface/version.txt` holds the semver those manifests advertise. Skill bodies live beside the source, without frontmatter. `node scripts/ci/render-agent-manifests.mjs` writes:

| Output | What a client reads |
| --- | --- |
| `.claude-plugin/marketplace.json` | `claude plugin marketplace add modootoday/svgif` |
| `.claude-plugin/plugin.json` | Claude plugin metadata, skills path, stdio MCP config |
| `plugin.json` | Portable Agent Plugins manifest for Codex and Cursor |
| `.codex-plugin/plugin.json` | Codex compatibility manifest |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest |
| `mcp.json` | stdio server, `npx -y @modootoday/svgif-mcp@<version>` |
| `skills/<name>/SKILL.md` | Agent Skills and `npx skills add modootoday/svgif` |
| `distribution/cursor-install.txt` | Cursor install URL and deeplink |
| `docs/llms.txt` | Pointers for the AI-readable lane |

A pull request that edits a generated file without the source fails `node scripts/ci/render-agent-manifests.mjs`. The version string in every generated manifest is the version file. The release workflow does not commit a different version afterwards. The commit that is tagged already contains the version consumers will install.

### Install commands

Pin the tag the release workflow created. Replace `vX.Y.Z` with that tag.

- `npx skills add modootoday/svgif --ref vX.Y.Z`
- Claude Code: `/plugin marketplace add modootoday/svgif` at that ref
- `codex plugin marketplace add modootoday/svgif --ref vX.Y.Z`
- Cursor: open the install link generated in that tag, or install the repository plugin at that ref
- `npx @modootoday/svgif-cli@X.Y.Z`
- `npx -y @modootoday/svgif-mcp@X.Y.Z`

npm packages exist only after the gated publish. Until `packages/svgif-cli` exists, the manifests still name those packages at `0.0.0`, and the CLI round-trip is not claimed.

### Tests

`node scripts/ci/install-from-repo.mjs` reads the checkout a client would clone. `node scripts/ci/install-from-repo.mjs --pin <sha>` extracts `git archive` of that commit and lists skills and tools from that tree. The release job runs it with the release SHA. It does not contact a plugin registry. When the CLI package is present, the same command must run validate and export; until then it says the round-trip is waiting and the release scenario `repo-install` stays unsatisfied.

## Why

One generated tree can satisfy Claude, Codex, Cursor, the skills CLI, and `npx` without a second copy of the description or the version.

## Verification

The render check and the install check run in CI. The release gate runs the pin check on the release SHA. [[sot:svgif/release-gate]]
