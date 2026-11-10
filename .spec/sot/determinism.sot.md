---
id: sot:svgif/determinism
title: Determinism, quantization, and budgets
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [test, determinism]
rel:
  depends_on:
    - sot:svgif/animation-ir
    - sot:svgif/scene-3d
---

# Determinism, quantization, and budgets

## Rule

1. A frame index and a composition value produce the same SVG string on every run in the same engine. Time inputs are the integers `frame` and `fps` only. APIs do not read `Date.now`, `performance.now` or `Math.random`.
2. The spring steps with semi-implicit Euler, `dt = 1 / fps`, from the sequence start. State is IEEE-754 `number`. At emit time, path coordinates and transform numbers are quantized to `1e-4` user units (four decimal digits, half away from zero). Colors are 8-bit sRGB channels.
3. Golden tests compare the quantized SVG string exactly. They run in the CI browser (the same major version pinned in the workflow), because that is also where Studio runs. A second engine is not required to match bitwise.
4. Canvas RGBA is not a golden string. Antialiasing and filter rasterization differ by browser. Raster tests check width, height, frame count, duration and magic bytes. They do not hash pixels across browsers.
5. Budgets, enforced as test fixtures rather than as a runtime claim about user hardware:
   - A golden 3D fixture stays at or below 200 triangles.
   - The player preview fixture of 1000 triangles at 30 fps must finish `renderFrame` in the CI browser without throwing. The budget number is recorded in the test, not tuned in the workflow.
   - Compilers warn (diagnostic, not a throw) above 5000 path elements or 2 MB of SVG text, and above 300 baked frames times animated nodes.

## Why

Exact SVG goldens are possible only after quantization. Pretending canvas pixels are stable would make the export DoD flake. The budgets stop a parallel agent from landing a fixture the CI browser cannot render.

## Verification

`WP-CLOCK` and `WP-PROJ` in [[plan:svgif/20261110122000]]. `scripts/ci/visual-gate.sh` runs the SVG string compare once fixtures exist.
