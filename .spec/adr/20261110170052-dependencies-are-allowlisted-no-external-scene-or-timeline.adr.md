---
id: adr:svgif/20261110170052
title: Dependencies are allowlisted; no external scene or timeline framework
status: active
created: 2026-11-10T17:00:52Z
updated: 2026-11-10T17:01:24Z
rel:
  depends_on: [sot:svgif/product-intent]
---

# Dependencies are allowlisted; no external scene or timeline framework

## Context

The library owns its math, its scene API, and the way it samples a frame. Runtime dependencies are a release concern: each one has to be named on an allowlist before it is imported. An external scene graph or an external timeline framework would put another project's API on that path. This repository does not take that path.

## Decision

Runtime dependencies must appear on the dependency allowlist. This repository does not import an external scene graph or an external timeline framework. The math, the scene API, and frame sampling are owned here.

The allowlist file is `scripts/ci/dependency-allowlist.txt`. The check is `scripts/ci/check-dependency-allowlist.sh`. Both belong to `release`. An empty allowlist means no runtime dependency is allowed.

Public names live in the svgif namespace. Math is textbook homogeneous coordinates and matrices. A spring is a discrete step at `dt = 1/fps` owned by this repository. Source from an external scene graph or an external timeline framework is not copied into this tree.

## Consequences

A pull request that adds a runtime dependency fails the allowlist check until that name is listed in the same change. Importing an external scene graph or an external timeline framework fails review. The license of the CDN bundle stays MIT OR Apache-2.0 plus the notices of adopted libraries.

[[sot:svgif/licensing]] states the same allowlist check. [[sot:svgif/scene-3d]] and [[sot:svgif/public-api]] keep the names this repository owns.
