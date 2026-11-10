---
id: adr:svgif/20261110121400
title: Studio lives at /studio on Pages
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/client-runtime
---

# Studio lives at /studio on Pages

## Context

The end state is a Studio people can open on the docs host. Pages serves files; it does not rewrite unknown paths and it cannot send COOP/COEP.

## Decision

Studio is a static build copied onto `_site/studio` after the Jekyll build. The router is a hash router. Asset URLs are relative (`base: './'`). The Pages app does not use `SharedArrayBuffer`. `docs/studio` and the CDN `studio.js` for a version are the same bytes. The in-file editor loads that CDN file with SRI; the Pages app does not boot from the CDN.

## Consequences

M8 is done only when the live `/studio/` URL serves `data-svgif-studio="app"` and the tier-3 browser checks pass.
