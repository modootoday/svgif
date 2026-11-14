---
id: adr:svgif/20261110122600
title: Static oEmbed files, no query endpoint
status: active
created: 2026-11-10
updated: 2026-11-14T07:48:19Z
rel:
  depends_on:
    - adr:svgif/20261110120600
    - adr:svgif/20261110121300
    - sot:svgif/html-project
---

# Static oEmbed files, no query endpoint

## Context

oEmbed discovery is a `<link rel="alternate">` whose `href` returns a JSON document. The spec also describes an HTTP endpoint `?url=&maxwidth=&maxheight=`. GitHub Pages serves files. It does not run that endpoint. Some consumers ignore discovery and read only a provider registry.

The card tags and the oEmbed fields would drift if they were typed again beside the project JSON.

## Decision

1. Each published work has a pre-generated `oembed.json` and an `oembed.xml` with the same fields. The work page links both. Type is `rich` or `video`. `html` is an iframe to `/embed/<workId>/`. Width and height are the composition size.
2. The `?url=` form is not implemented. A static host cannot answer it. `maxwidth` and `maxheight` are not applied. The embed page scales with CSS.
3. Registry-only consumers need a separate provider registration. This project does not submit that registration and does not operate a registry. Discovery-capable consumers work from the link tag alone.
4. `presentation` in the project schema is the only source. Open Graph, `twitter:card` `summary_large_image`, and oEmbed are projections. `twitter:player` is written only when the project opts in, and playback on X is not guaranteed because that player requires X's approval.
5. `/embed/<workId>/` does not load Studio until the viewer chooses Edit. Pages cannot set HTTP headers. `frame-ancestors` is not claimed.

## Consequences

The rule text is [[sot:svgif/external-embed]]. Milestone M11 is off the Studio critical path. The release manifest still requires the three embed rows. No product server is added. [[adr:svgif/20261110121300]]
