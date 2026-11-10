---
id: sot:svgif/node-pivot
title: Node pivot and anchor
status: active
created: 2026-11-10T18:32:10Z
updated: 2026-11-10T18:33:57Z
rel:
  depends_on: [sot:svgif/scene-3d, sot:svgif/architecture, sot:svgif/determinism]
verify: [manual]
tags: [scene, pivot]
---

# Node pivot and anchor

## Rule

A node has a `pivot` and an `anchor`. Both are `Vec3` points in the node's own space, the same space as the node's untransformed geometry. They sit on the node beside `transform` in the C2 object `{ id, children, transform, kind }` from [[sot:svgif/architecture]]. The stored orientation and scale stay the quaternion and `Vec3` scale in [[sot:svgif/scene-3d]].

`pivot` is the center of rotation and scale. `anchor` is the own-space point that lies on the node `position` when the quaternion is the identity and the scale is `{ x: 1, y: 1, z: 1 }`. Omitted, each field is `{ x: 0, y: 0, z: 0 }`.

For a geometry point `p` in own space, with anchor `a`, pivot `r`, position `t`, quaternion `q`, and scale `s`:

`local(p) = t + (r - a) + rotate(q, scale(s, p - r))`

`scale` is component-wise. `rotate` applies `q`. The same map as a matrix is `translate(t + r - a) * rotate(q) * scale(s) * translate(-r)`.

When `p = r`, `local(r) = t + (r - a)`. That point does not depend on `q` or `s`. Rotation and scale leave the pivot where it is. When `q` is the identity and `s` is `{ x: 1, y: 1, z: 1 }`, `local(p) = t + (p - a)`. When `a` equals `r`, `local(p) = t + rotate(q, scale(s, p - r))`.

The field is the pivot. A group whose translation moves the origin is a different node, with its own `position`. This record stops at the local point. A parent matrix is `sot:svgif/node-hierarchy`, which H-046 writes. This record does not compose that matrix.

For a 2D node, own-space `+Y` points down, the same direction as the root `viewBox`. A positive angle about local `+Z` moves local `+X` toward local `+Y`. A 3D node uses this local point before the projection in [[sot:svgif/scene-3d]].

### Acceptance fixtures

Two fixtures. Each is one node, one shape, and no wrapper. `fps` is 24. `durationInFrames` is 24. Frame 0 is the start. Frame 12 is the half cycle. Scale stays `{ x: 1, y: 1, z: 1 }`. `position`, `pivot`, and `anchor` stay constant. The root SVG is `viewBox="0 0 200 200"` with `width` 200 and `height` 200. The shape is one filled `path`, fill `#111111`. Emitted coordinates follow the `1e-4` quantization in [[sot:svgif/determinism]]. These vertices are integers, so the path data below is the quantized data.

Clock hand, node id `clock-hand`. `position`, `pivot`, and `anchor` are `{ x: 100, y: 100, z: 0 }`. The own-space vertices are `(100, 100)`, `(96, 40)`, `(104, 40)`. The pivot is the first vertex.

| Frame | Angle about `+Z` | Quaternion `{ x, y, z, w }` | Path `d` |
| --- | --- | --- | --- |
| 0 | 0 | `{ x: 0, y: 0, z: 0, w: 1 }` | `M100 100L96 40L104 40Z` |
| 12 | `pi` | `{ x: 0, y: 0, z: 1, w: 0 }` | `M100 100L104 160L96 160Z` |

The pivot vertex stays at `(100, 100)`. The far edge moves from `y=40` to `y=160`.

Forearm, node id `forearm`. The pivot is the elbow. `position`, `pivot`, and `anchor` are `{ x: 70, y: 80, z: 0 }`. The own-space vertices are `(70, 80)`, `(150, 74)`, `(150, 86)`. The pivot is the first vertex.

| Frame | Angle about `+Z` | Quaternion `{ x, y, z, w }` | Path `d` |
| --- | --- | --- | --- |
| 0 | 0 | `{ x: 0, y: 0, z: 0, w: 1 }` | `M70 80L150 74L150 86Z` |
| 12 | `pi/2` | `{ x: 0, y: 0, z: sin(pi/4), w: cos(pi/4) }` | `M70 80L76 160L64 160Z` |

The elbow vertex stays at `(70, 80)`. The far edge moves from `x=150` to the segment `(76, 160)`–`(64, 160)`.

Golden files, one quantized SVG document each:

- `packages/svgif/test/golden/node-pivot/clock-hand-frame-0.svg`
- `packages/svgif/test/golden/node-pivot/clock-hand-frame-12.svg`
- `packages/svgif/test/golden/node-pivot/forearm-frame-0.svg`
- `packages/svgif/test/golden/node-pivot/forearm-frame-12.svg`

## Why

A rotating part has a center that is not the node's position. The center has to be data on the node, read with the quaternion and the scale, or a later sample cannot keep that point still.

## Verification

`WP-NODE-PIVOT` is this record. [[plan:svgif/20261110122000]] has no checkbox for that work package. Once the emitter exists, the check compares the four golden files to the quantized SVG strings, including the path `d` values above. The pivot vertex in each pair is the same user-space point.

A separate vision review session passes the renders of those four files. The session is the designated vision review model chosen by the launcher. The pass is the clock hand and the forearm turning about the named pivot, with that point unmoved. This record does not open that session. The fixture is not done until that session passes.
