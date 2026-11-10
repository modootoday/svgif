---
id: adr:svgif/20261110183030
title: Docs pages share one three-panel layout
status: active
created: 2026-11-10T18:30:30Z
updated: 2026-11-10T18:32:04Z
rel:
  depends_on: [sot:svgif/docs-site]
---

# Docs pages share one three-panel layout

## Context

[[sot:svgif/docs-site]] already says the theme supplies the layouts this site does not override, and that a missing theme feature is an upstream request. Pages under `https://thumly.io/docs/` still need one shared layout. This decision records that layout. It does not edit `docs/`, [[sot:svgif/docs-site]], or `scripts/ci/docs-ia.sh`.

## Decision

1. Every page under `https://thumly.io/docs/` uses the theme layout `doc` from `modootoday/jekyll-theme-modootoday@v1.6.0`. No docs page sets another layout. This repository does not copy that layout.
2. The left panel is the theme sidebar. The center panel is the page. The right panel is the theme table of contents. On a narrow viewport the theme's own disclosure pattern is the stand-in for a drawer and for the `On this page` dropdown.
3. The nav is one data file, `docs/_data/nav/main.yml`. A new docs page is added there.
4. The theme does not mark the heading in view. That scroll-spy gap, the 80rem start of the right column, and the disclosure in place of a drawer are a theme request. They are not a reason to add `docs/_layouts/doc.html`.

## Consequences

The org chart gives this file to `govern`. The docs role applies `layout: doc` on the docs pages, keeps the single nav file, and records the theme request on [[sot:svgif/docs-site]]. [[plan:svgif/20261110122000]] is unchanged.
