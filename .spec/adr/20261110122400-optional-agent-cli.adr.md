---
id: adr:svgif/20261110122400
title: The CLI is an optional agent surface
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - adr:svgif/20261110121300
    - sot:svgif/client-runtime
---

# The CLI is an optional agent surface

## Context

[[adr:svgif/20261110121300]] forbids a product server and a CLI that humans must install. Agents need a non-interactive way to validate and export the same projects Studio edits. A second engine behind that interface would drift from Studio.

## Decision

1. This ADR amends [[adr:svgif/20261110121300]]. The no-server decision stands. The sentence that left a CLI outside every milestone is replaced.
2. Studio remains the human surface. A person can author, preview, and export in the browser with no CLI and no server.
3. The CLI and the MCP server are optional and additive. They are thin adapters over the packages Studio uses for schema validation, migration, compile, and export. They do not reimplement those steps.
4. Package names, both under the `@modootoday` scope: `@modootoday/svgif-cli` (bin `svgif`) and `@modootoday/svgif-mcp` (bin `svgif-mcp`). The bin is not added to the browser library package. A required bin on that package would make the CLI look mandatory.
5. npm workspaces place the adapters at `packages/svgif-cli` and `packages/svgif-mcp`. The engine stays in `packages/svgif` and `packages/svgif-export`.
6. Raster and video export stay browser encodings. The CLI may launch a local headless browser that calls the same export package. It must not send frames to a hosted product server. SVG and HTML export run in the CLI process.

## Consequences

Milestone M9 and `WP-AGENT` track the adapters. They do not block Studio. The release manifest does include their scenarios, so a tag still waits for parity. The rule text is [[sot:svgif/agent-surface]].
