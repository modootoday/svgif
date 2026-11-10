---
id: adr:svgif/20261110120800
title: Dual license MIT OR Apache-2.0
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# Dual license MIT OR Apache-2.0

## Context

The library is embedded from a CDN and from npm. A service-restricted license or a non-OSI license would block that. Elastic-2.0, used by some sibling packages, is not adopted.

## Decision

Source in this repository is MIT OR Apache-2.0. `LICENSE-MIT`, `LICENSE-APACHE` and `NOTICE` are the texts. Third-party code keeps its own notice and stays out of the player when its license is MPL.

## Consequences

GPL and LGPL encoders, including ffmpeg, are rejected.
