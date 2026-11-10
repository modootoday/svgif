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
    - adr:svgif/20261110170052
    - adr:svgif/20261110120800
    - adr:svgif/20261110121100
---

# License and code that is not imported

## Rule

1. Copyrightable source in this repository is MIT OR Apache-2.0. The choice is `LICENSE-MIT`, `LICENSE-APACHE` and `NOTICE`.
2. Runtime dependencies must appear on the dependency allowlist. This repository does not import an external scene graph or an external timeline framework. The math, the scene API, and frame sampling are owned here. Integer frames, a composition, and a spring stepped at `dt = 1/fps` use formulas owned here. [[adr:svgif/20261110170052]]
3. Raster and codecs run in the browser and sit outside the core package. Allowed licenses and the ban on a server-side encoder are [[adr:svgif/20261110121100]] and the table in [[sot:svgif/studio-export]]. A GPL encoder is not a dependency, not a fallback, and not a CLI requirement.
4. A pull request that adds a dependency states the SPDX id and whether the dependency sits in the core, in `svgif-raster`, or in `svgif-encode-*`. Vendoring adds `THIRD_PARTY_NOTICES.md` in the same pull request. That file does not exist yet.
5. Elastic-2.0 (pmcp, envs) is not used. A library embedded from a CDN does not take a service-restricted license.

## Why

An embeddable animation library that is tied to a non-commercial license or a copyleft encoder cannot ship on npm and a CDN. Owning the math and the timeline formulas is separate from importing another project's source.

## Verification

The release check is the dependency allowlist owned by H-024. `scripts/ci/check-dependency-allowlist.sh` reads `scripts/ci/dependency-allowlist.txt`. A runtime dependency must appear on that list. `THIRD_PARTY_NOTICES.md` matches the adopted set when a release vendors code.
