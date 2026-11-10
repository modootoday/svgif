---
id: adr:svgif/20261110121300
title: No product server and no required CLI
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# No product server and no required CLI

## Context

The owner defined the runtime as static files. A required Node CLI would exclude the browser-only path.

## Decision

Authoring, preview, save and export run in the browser. GitHub Actions builds and uploads those files; that is not a product server. [[adr:svgif/20261110122400]] amends the CLI sentence: the CLI is an optional agent surface and is in the milestone plan. It is still not required for a person. The ban on a product server stands.

## Consequences

Tests may open the static files in a headless browser. They fail if the page calls a project encode API.
