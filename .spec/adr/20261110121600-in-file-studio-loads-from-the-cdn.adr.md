---
id: adr:svgif/20261110121600
title: In-file Studio loads from the CDN
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/schema-versioning
---

# In-file Studio loads from the CDN

## Context

A saved file should play, then edit, then save a new file. That relay is the product loop. Inlining Studio into every save is too large.

## Decision

Play uses the pinned runtime (`cdn` or `inline`). Edit and the hash `#edit` lazy-load `studio.js` and `studio.css` from `/svgif/<version>/` on the CDN with SRI. The default save does not inline Studio. Offline play works for an inline player. Offline edit works only when Studio was embedded. A newer schema than the pinned Studio shows `schema-too-new` and does not edit.

## Consequences

The Pages Studio and the CDN object are byte-identical for that version. Provenance appends a generation on each save.
