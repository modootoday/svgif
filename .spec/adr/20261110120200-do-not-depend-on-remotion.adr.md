---
id: adr:svgif/20261110120200
title: Do not depend on Remotion
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# Do not depend on Remotion

## Context

Integer frames, compositions, sequences and springs are the timeline model. Remotion is source-available and not an OSI license. Checked 2026-11-10: the npm package points at its own LICENSE.md, and a Company License applies above the free-license headcount.

## Decision

Do not depend on, copy, or redistribute `remotion` or the Remotion Player. Timeline behavior is reimplemented. The spring is a semi-implicit Euler step at `dt = 1/fps` owned by this repository.

## Consequences

The license of the CDN bundle stays MIT OR Apache-2.0 plus the notices of adopted libraries.
