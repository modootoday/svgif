---
id: sot:svgif/licensing
title: License and code that is not imported
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [license]
rel:
  depends_on:
    - sot:svgif/product-intent
    - adr:svgif/20261110120200
    - adr:svgif/20261110120800
    - adr:svgif/20261110121100
---

# License and code that is not imported

## Rule

1. Copyrightable source in this repository is MIT OR Apache-2.0. The choice is `LICENSE-MIT`, `LICENSE-APACHE` and `NOTICE`.
2. Remotion is not OSI open source. Its public `LICENSE.md` is the Remotion License, and npm `remotion` says `SEE LICENSE IN LICENSE.md`. A Company License is required above the free-license headcount (checked 2026-11-10 against https://www.remotion.dev/docs/license and https://github.com/remotion-dev/remotion/blob/main/LICENSE.md). svgif does not copy Remotion source, does not depend on the `remotion` package, and does not redistribute Remotion copy, the Remotion Player or Remotion render APIs. Timeline ideas (integer frames, a composition, the existence of a spring) are implemented with formulas owned here.
3. three.js is MIT. It is still not a dependency and its source is not copied. The math is textbook homogeneous coordinates and matrices. Names live in the svgif namespace. [[adr:svgif/20261110120100]]
4. Raster and codecs run in the browser and sit outside the core package. Allowed licenses and the ban on a server-side ffmpeg are [[adr:svgif/20261110121100]] and the table in [[sot:svgif/studio-export]]. GPL ffmpeg is not a dependency, not a fallback, and not a CLI requirement.
5. A pull request that adds a dependency states the SPDX id and whether the dependency sits in the core, in `svgif-raster`, or in `svgif-encode-*`. Vendoring adds `THIRD_PARTY_NOTICES.md` in the same pull request. That file does not exist yet.
6. Elastic-2.0 (pmcp, envs) is not used. A library embedded from a CDN does not take a service-restricted license.

## Why

An embeddable animation library that is tied to a non-commercial license or a copyleft encoder cannot ship on npm and a CDN. "Inspired by Remotion" and "contains Remotion code" are different claims.

## Verification

Before a release, a person checks that `npm pack` output does not list `remotion` or `three`, and that `THIRD_PARTY_NOTICES.md` matches the real dependency set. Until the engine exists, the check is that the root `package.json` has neither dependency.
