---
id: sot:svgif/agent-surface
title: Agent surface
status: active
created: 2026-11-10
updated: 2026-11-10
verify: node scripts/ci/render-agent-manifests.mjs
rel:
  depends_on:
    - adr:svgif/20261110122400
    - sot:svgif/schema-versioning
---

# Agent surface

## Rule

Studio is the human surface. The CLI and the MCP server are the agent surface. Both call the same validation, migration, compile, and export code Studio calls. [[adr:svgif/20261110122400]]

### Packages

| Package | Path | Role |
| --- | --- | --- |
| `@modootoday/svgif` | `packages/svgif` | Engine, schema runtime, IR, backends, player |
| `@modootoday/svgif-export` | `packages/svgif-export` | The browser export package Studio already uses |
| `@modootoday/svgif-cli` | `packages/svgif-cli` | CLI adapter. Bin `svgif` |
| `@modootoday/svgif-mcp` | `packages/svgif-mcp` | MCP adapter. Bin `svgif-mcp`. It invokes the CLI library, not a second exporter |

The design snapshot does not contain those package directories yet. Adding an adapter that implements validate, migrate, compile, or export locally fails review.

### CLI

The CLI is non-interactive. `--json` is the default. Stdout is one JSON document. Stderr is diagnostics. `--human` is optional and is not the agent path.

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 1 | The document failed validation |
| 2 | The invocation was wrong |
| 3 | `schema-too-new` |
| 4 | The format needs a browser and `--browser` was not set |
| 70 | Internal failure |

Commands: `validate`, `migrate`, `describe`, `compile`, `export`, `new`, `embed`.

`compile` takes `--backend css-external`, `css-embedded`, or `smil`. `export` takes `--format svg` or `html` in-process. `webp`, `webm`, `mp4`, and `gif` exit 4 unless `--browser` runs the shared export package in a local headless browser. `embed` takes `--mode cdn` or `--mode inline`. `describe` prints the schema version the binary implements.

Help text names the command, the required flags, and the exit codes. It does not paste governance documents.

### JSON contract

Stdout is one JSON object. It is not a stream of logs. The object is schema version 1 of the CLI result. A later incompatible result shape uses a new `schemaVersion` on this object together with the project rule in [[sot:svgif/schema-versioning]].

Success:

```json
{"ok": true, "schemaVersion": 1, "schemaRevision": 0, "command": "validate", "result": {}}
```

Failure sets `ok` to false and replaces `result` with `error`. `error.code` is `validation`, `usage`, `schema-too-new`, `needs-browser`, or `internal`. Those codes are exits 1, 2, 3, 4, and 70. Exit 0 is the only success.

| Command | `result` |
| --- | --- |
| `validate` | `{ "valid": true }` or `error.issues` listing schema failures |
| `migrate` | The migrated project document |
| `describe` | `implementedSchemaVersion`, `implementedSchemaRevision`, and the command names |
| `compile` | `{ "backend", "svg", "css"? }` |
| `export` | `{ "format", "out" }` after `--out`. SVG and HTML run in-process |
| `new` | A minimal valid project document |
| `embed` | `{ "mode", "html" }` for `cdn` or `inline`. This is the copy-source fragment, not the Pages oEmbed bundle |

Input is a project document that validates against the project schema at the revision the file declares. The CLI does not invent a second project schema.

### MCP

The server speaks stdio. That is the install path. `--http` may bind only `127.0.0.1`. It refuses `0.0.0.0` and any non-loopback address. There is no hosted MCP endpoint.

Tools match the commands and carry the schema generation: `svgif_validate_v1`, `svgif_migrate_v1`, `svgif_describe_v1`, `svgif_compile_v1`, `svgif_export_v1`, `svgif_new_v1`, `svgif_embed_v1`. Each tool's input is the project document plus that command's flags. The tool result is the same JSON object the CLI writes. `isError` is set when `ok` is false. When `schemaVersion` moves from 1 to 2, the new tools use `_v2` and the `_v1` tools stay until the deprecation rule in [[sot:svgif/schema-versioning]] removes them. Tool input schemas are the versioned project schema, not a hand-written copy.

| Resource | Body |
| --- | --- |
| `svgif://schema/project/v1` | The project schema at the revision this binary implements |
| `svgif://docs` | The public docs URL |

Prompts are omitted until a later revision asks for them.

The protocol revision this contract follows is the 2025-06-18 MCP transports page cited in [[adr:svgif/20261110122500]].

### Skills

Public skills live only in `skills/<name>/SKILL.md`. The frontmatter `name` and `description` come from `schema/agent-surface/source.v1.json`. The body comes from `schema/agent-surface/bodies/<name>.md`. The Agent Skills constraints apply: lowercase hyphenated name, name equals the directory, description length 1 to 1024. These files are the fourth audience lane in [[sot:svgif/audiences]]. A skill under the governance tree is not a product skill. It must set `metadata.internal` so `npx skills add` does not install it by default.

### Conformance

When the packages exist, `packages/svgif-cli/test/contract.test.ts` covers every exit code, asserts stdout is one JSON value of this shape, and asserts `schemaVersion` is the version the binary implements. `packages/svgif-mcp/test/tools.test.ts` asserts the tool list is those seven names, each tool matches the CLI on one fixture, and a non-loopback bind fails. Until the packages exist, those tests are not green. The render check and the install check below are what CI runs now. The release rows stay unsatisfied until the package tests exist.

## Why

An agent that shells out to a second encoder will not match the file Studio saves. One implementation keeps the parity test meaningful.

## Verification

`node scripts/ci/render-agent-manifests.mjs --self-test` and `node scripts/ci/install-from-repo.mjs`. Unit tests for the CLI and MCP packages are `WP-AGENT` (Milestone M10 in [[sot:svgif/roadmap]]) and are not green until those packages exist. The release rows are `cli-contract`, `mcp-tools`, `skill-install`, `cli-studio-parity`, and `repo-install`.
