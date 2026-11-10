---
id: sot:svgif/client-runtime
title: Pure client runtime
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [runtime, browser, studio]
rel:
  depends_on:
    - sot:svgif/product-intent
---

# Pure client runtime

## Rule

This is a top-level product rule. `AGENTS.md` repeats it. [[adr:svgif/20261110121300]] records why.

1. The runtime, the player, Studio, and every export (SVG, animated WebP, WebM, GIF) run in the user's browser. The files that implement them are static. GitHub Pages serves the docs and Studio. A CDN serves the versioned library JS and CSS for other sites. Nothing in the product listens as a server.
2. There is no product backend, no server-side render, and no server-side encode. A GitHub Actions job that builds and uploads those static files is not a runtime server.
3. Node, Bun, and a CLI are not required for a person to author, preview, or export. Studio stays sufficient. The CLI and the MCP server are an optional agent surface over the same engine. [[adr:svgif/20261110122400]] [[sot:svgif/agent-surface]] Core tests and Studio must not require the CLI.
4. Encoders are browser APIs or libraries that execute in the page or in a Worker: canvas rasterization of SVG frames, WebCodecs or MediaRecorder for WebM, WASM or pure JS for GIF and animated WebP. See [[sot:svgif/studio-export]] for the matrix and the fallbacks.
5. `SharedArrayBuffer` and threaded WASM are not required. GitHub Pages cannot send COOP/COEP. [[adr:svgif/20261110121400]]
6. CI may open the same static files in a headless browser to run the client code. That runner is a test harness, not a product encode service. The test fails if the page requests a project encode API.

## Why

A server encoder would split the preview from the file the user downloads and would force an operator to host it. The owner defined the end state as a static Studio on Pages.

## Verification

`WP-EXPORT` and M8 in [[plan:svgif/20261110122000]]. Until `apps/studio` exists, `spec check` is the gate. The export gate script fails if Studio source appears and references `SharedArrayBuffer` or a non-relative script URL.
