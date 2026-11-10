---
id: adr:svgif/20261110122500
title: Agents install from the repository tag
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - adr:svgif/20261110122400
---

# Agents install from the repository tag

## Context

Several agent hosts can install a plugin from a public Git repository. Submitting the same plugin to each host's registry would fork the metadata and add accounts this project does not need. The release tag is already the pin consumers can name.

Docs read on 2026-11-10:

- Claude Code marketplace file and `claude plugin marketplace add`: <https://code.claude.com/docs/en/plugins/create-marketplace> and <https://code.claude.com/docs/en/plugins/manifest-reference>. The marketplace file is `.claude-plugin/marketplace.json`. A plugin in the same repository uses `source` `./`. Skills default to `skills/` at the plugin root, outside `.claude-plugin/`.
- Codex plugin packaging, including a root `plugin.json`, `skills/`, `mcp.json`, and `codex plugin marketplace add owner/repo`: <https://developers.openai.com/plugins/build/plugins>. A `.codex-plugin/plugin.json` remains a compatibility manifest. Codex also accepts a `.claude-plugin/marketplace.json` as a legacy marketplace path.
- Cursor loads a root Agent Plugins `plugin.json` and a `.cursor-plugin/plugin.json`: <https://cursor.com/docs/reference/plugins>. The MCP install link is `cursor://anysphere.cursor-deeplink/mcp/install` and `https://cursor.com/install-mcp`: <https://cursor.com/docs/mcp/install-links>.
- Agent Skills `SKILL.md` frontmatter: <https://agentskills.io/specification>.
- Vercel skills CLI, `npx skills add owner/repo`, discovers `skills/<name>/SKILL.md`: <https://vercel.com/docs/agent-resources/skills> and <https://github.com/vercel-labs/skills/blob/main/docs/creating-skills.md>.
- MCP stdio is the local transport: <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>. Streamable HTTP is specified there too. This project does not host that transport.
- `npx` runs a package from the npm registry: <https://docs.npmjs.com/cli/v11/commands/npx>. The npm publish is the existing gated release, not a separate plugin registry.

## Decision

1. Do not submit this repository to the MCP Registry, the Cursor Marketplace review queue, a Claude marketplace directory, or skills.sh as a separate account. There is no registry publisher step.
2. `modootoday/svgif` is the install source. Claude Code: `/plugin marketplace add modootoday/svgif`. Codex: `codex plugin marketplace add modootoday/svgif`. Skills: `npx skills add modootoday/svgif`. Cursor: the generated install link and `.cursor-plugin/plugin.json` in the same commit. The CLI and MCP server: `npx` of `@modootoday/svgif-cli` and `@modootoday/svgif-mcp` at the version in that commit.
3. One metadata file, `schema/agent-surface/source.v1.json`, plus skill bodies and `schema/agent-surface/version.txt`, generates every manifest. Hand-editing a generated file fails CI.
4. Consumers who want a release install the `v*` tag the release workflow created. A branch tip is not a release. The workflow does not rewrite the manifests in a later commit.
5. Public plugin paths are not internal governance. `.claude-plugin/` is allowed. `.claude/` is not. Skills are not copied under `.agents/`.

## Consequences

[[sot:svgif/agent-distribution]] is the layout and the install test. The role `agent` owns the source and the generated files. The role `release` still owns the workflow that tags the commit those files sit on.
