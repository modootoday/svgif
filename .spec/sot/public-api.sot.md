---
id: sot:svgif/public-api
title: Public API sketch
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [api]
rel:
  depends_on:
    - sot:svgif/architecture
---

# Public API sketch

## Rule

The public surface of `@modootoday/svgif` is the following shape. Names are normative. Bodies are not implemented in this snapshot. The docs site may show this sketch and must label it as not yet shipped.

```ts
const composition = svgif.composition({
  id: "shot",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 90,
});

const scene = new svgif.Scene();
const camera = new svgif.PerspectiveCamera(35, 1920 / 1080, 0.1, 100);
camera.position.set(0, 0, 8);
const cube = new svgif.Mesh(new svgif.BoxGeometry(1, 1, 1), { fill: "#e8ff47" });
scene.add(cube);

composition.sequence(0, 90, () => {
  cube.rotation.y = svgif.interpolate(0, Math.PI * 2);
  cube.position.y = svgif.spring({ stiffness: 120, damping: 14, mass: 1 });
});

const svg = svgif.renderFrame(composition, 12);
const file = svgif.compile(composition, { backend: "smil" });
// file.svg is self-contained; file.css is set only for backend "css-external"
```

1. `composition` holds `fps`, `width`, `height`, `durationInFrames` and an ordered list of sequences. A sequence has `fromFrame` inclusive and `durationInFrames`.
2. `interpolate(from, to, { easing })` reads the current frame from a sampler context. Outside a sequence it throws. It does not read `Date`.
3. `spring({ stiffness, damping, mass, from, to })` is a discrete damped oscillator stepped at `dt = 1 / fps` from frame 0 of the sequence. Same inputs, same frame, same number. Formula is owned here, not imported.
4. `renderFrame` returns one SVG document string for that integer frame. Studio, golden SVG tests and the in-browser exporters call it. No Node process is required.
5. `compile` returns `{ svg: string, css?: string }` for `css-external`, `css-embedded` or `smil`.
6. `player.mount(host, composition, { mode: "scrub" | "static" })`. `scrub` sets `frame` from the UI and calls `renderFrame` (or sets CSS variables / SMIL time). `static` injects the compiled artifact and does not run a requestAnimationFrame loop.
7. Public scene classes: `Scene`, `Group`, `Mesh`, `Path3`, `Shape` (2D), `PerspectiveCamera`, `OrthographicCamera`, `AmbientLight`, `DirectionalLight`. Geometry: `BoxGeometry`, `SphereGeometry`, `TorusGeometry`, `ExtrudeGeometry`, `LatheGeometry`, `ParametricGeometry`.
7a. `svgif.exportInBrowser(composition, { codec: "svg" | "webp" | "webm" | "gif" })` returns a `Blob` produced in the page (and in a Worker when the browser allows it). It rejects with a named `UnsupportedError` when that browser lacks the codec path. It does not call a server.
8. The IIFE build assigns this object to `globalThis.svgif`. The ESM build is the same object as the default export and as named exports.
9. Nothing in this sketch is a compatibility promise with three.js or Remotion method names beyond the words listed here.

## Why

Parallel work packages need one import surface. Leaving names to each package produces two players.

## Verification

`WP-TYPES` adds `packages/svgif/src/public-types.ts` that matches this sketch, and a test that fails if an exported name appears that this SoT does not list. Until that file exists, `spec check` is the gate.
