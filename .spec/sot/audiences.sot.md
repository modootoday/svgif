---
id: sot:svgif/audiences
title: Audiences
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [docs, agents]
rel:
  depends_on:
    - sot:svgif/conventions-adopted
---

# Audiences

## Rule

Four lanes. Do not mix their prose in one path.

| Lane | Paths | Audience | Prose |
| --- | --- | --- | --- |
| Agent governance | `AGENTS.md`, `CLAUDE.md` (pointer only), `.agents/**`, `.spec/**` | Implementing agents and maintainers | Spec ids, work-package ids, DoD commands. This lane owns policy. |
| Human | `README.md`, `docs/**` except `docs/llms.txt`, `CONTRIBUTING.md`, `SECURITY.md` | Someone choosing or learning the library | What the product does and what is not built yet. Do not dump SoTs. English source. Studio is this lane's editor. |
| AI-readable public text | Theme-generated Markdown twins, `docs/llms.txt` | Models fetching the site | Pointers and the same facts as the human pages. `docs/llms.txt` is generated. Do not author a second policy file. |
| Agent product | `skills/**`, `.claude-plugin/**`, `.cursor-plugin/**`, `.codex-plugin/**`, `plugin.json`, `mcp.json`, `distribution/**`, `schema/agent-surface/**` | Agents using svgif | How to call the CLI and MCP server. Not spec ids. Not governance. |

`.claude-plugin/` is the public Claude Code marketplace manifest. It is not the hidden Claude governance directory, which this repository does not use. Codex and Cursor read the generated manifests in their own public directories. A governance skill under `.agents/skills/` must set `metadata.internal` so the skills CLI does not treat it as a product skill.

The public product lane is what `npx skills add modootoday/svgif` installs: `skills/<name>/SKILL.md` and the generated plugin manifests. The internal lane is `.agents/**` and `.spec/**`. The skills CLI does not install a skill whose frontmatter says `metadata.internal`. Claude Code uses `/plugin marketplace add modootoday/svgif`. Codex and Cursor install from this repository. None of those paths is a registry submission. The product contract is [[sot:svgif/agent-surface]]. The install paths and the one-source generator are [[sot:svgif/agent-distribution]].

1. Do not copy `.spec/` onto the public site. Site pages state the public API and the procedures a reader follows. Source of the split: arks `public-surface` items 4–6. meari ADR `20261031093000` says pages are written for readers, not pasted from decision records.
2. `AGENTS.md` is a router. Do not grow a milestone table there. The sources are [[sot:svgif/roadmap]] and [[plan:svgif/20261110122000]]. Pattern: humanymous `AGENTS.md` progressive disclosure, and the arks rule that `AGENTS.md` must not become a second ledger.
3. Vendor stubs (`CLAUDE.md`) are pointers. humanymous treats `.claude/` as generated and forbids hand edits. svgif has no sync script yet, so only `CLAUDE.md` exists. Do not add a `.claude/` tree.
4. The human source language is English. [[adr:svgif/20261110120900]]

## Why

Agents need stable ids. Readers need an honest usage page. One file does both badly, and the site would advertise unfinished internal plans.

## Verification

`spec check`. After a docs build, `modootoday-check --twins` proves the human page and the AI twin share bytes.
