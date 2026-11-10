---
id: adr:svgif/20261110120500
title: Painters sort, not BSP
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/scene-3d
---

# Painters sort, not BSP

## Context

Overlapping triangles need an order. A BSP tree is more code than v1 needs and is unstable when triangles intersect.

## Decision

Back-face culling drops faces whose clip-space normal points away from the camera. Survivors sort by average clip-space z, far first. Ties break by node id, then face index. BSP is out of v1.

## Consequences

Intersecting triangles can paint in the wrong order. That is an accepted v1 limit, stated in the scene SoT.
