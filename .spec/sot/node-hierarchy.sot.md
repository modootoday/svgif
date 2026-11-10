---
id: sot:svgif/node-hierarchy
title: Node hierarchy
status: active
created: 2026-11-10T18:32:54Z
updated: 2026-11-10T18:34:31Z
rel:
  depends_on: [sot:svgif/architecture, sot:svgif/scene-3d, adr:svgif/20261110181452, adr:svgif/20261110170052]
verify: [manual]
tags: [scene, transforms]
---

# Node hierarchy

## Rule

A scene node may list children. The world matrix is the parent world matrix times the local matrix, evaluated depth-first, so a parent is known before its children. [[sot:svgif/scene-3d]] The scene JSON shape is contract C2 in [[sot:svgif/architecture]]: `{ id, children, transform, kind }`. Local fields stay `position: Vec3`, `quaternion: Quat`, and `scale: Vec3`. The stored orientation is a quaternion. An author may set that orientation as intrinsic XYZ Euler radians. [[sot:svgif/scene-3d]]

1. A child inherits its parent's transform. The child's world matrix is `parentWorld * local`.
2. A parent translation moves the child. The child's local transform is unchanged, and every descendant's world translation includes the parent's translation.
3. A child rotation leaves the parent where it is. The parent's world matrix does not read the child's local rotation. Descendants of the rotating child inherit that rotation.

A cutout rig plays back by nesting groups. The v1 method is that cutout rig. [[adr:svgif/20261110181452]] This record adds no bone weight and no IK solve. Skeletal IK is out of scope for the engine. The pivot attribute belongs to its own record. This fixture places the forearm with a child translation, so the rotation origin is the child's local origin after that translation.

SVG emit writes one `<g>` per group. The parent transform is the outer group. The child transform is the inner group. In a `transform` attribute the rightmost operation applies first, matching `compose` as `T * R * S`. [[sot:svgif/scene-3d]] This fixture is 2D user space with x to the right and y downward. It does not use the perspective viewport map, so the Y flip in that map does not apply here.

### Acceptance fixture

The fixture is a two-bone cutout of two nodes: torso parent, forearm child. Both golden files share the composition size, the torso transform, and the shape geometry. Coordinates are SVG user units. Fills are 8-bit sRGB. Integer inputs stay integers under the C6 quantization in [[sot:svgif/determinism]].

Composition: `width` 160, `height` 120, `viewBox` `0 0 160 120`.

Torso group, `id` `torso`:

- rectangle `width` 36, `height` 72, `fill` `#243044`, drawn from the group's local origin
- `position` `{ x: 30, y: 12, z: 0 }`
- quaternion identity `{ x: 0, y: 0, z: 0, w: 1 }`
- `scale` `{ x: 1, y: 1, z: 1 }`

Forearm group, `id` `forearm`, child of `torso`:

- rectangle `width` 52, `height` 14, `fill` `#d06a3a`, drawn from the group's local origin
- `position` `{ x: 36, y: 16, z: 0 }`
- `scale` `{ x: 1, y: 1, z: 1 }`

Because the torso quaternion is identity and both scales are 1, the forearm world origin is the torso position plus the forearm position: `(66, 28)`. The torso world origin is `(30, 12)`.

Inherited move. File `packages/svgif/test/goldens/node-hierarchy/torso-forearm-inherited-move.svg`. The forearm Euler Z is `0`. Both rectangles sit 30 user units to the right and 12 user units down from the drawing they would have with a torso position of `(0, 0, 0)`.

Local rotation. File `packages/svgif/test/goldens/node-hierarchy/torso-forearm-local-rotation.svg`. The forearm Euler Z is `35 * pi / 180` radians, stored as the quaternion from that intrinsic XYZ Euler. SVG emit writes `rotate(35)`, which is clockwise in this y-down user space. The torso world origin stays `(30, 12)`. The forearm world origin stays `(66, 28)`. The torso rectangle occupies the same corners as in the inherited-move file. The forearm rectangle turns about `(66, 28)`.

Stable SVG ids are `s-torso` and `s-forearm`. [[sot:svgif/architecture]]

Each golden file is UTF-8, uses LF newlines, and ends with one LF after `</svg>`. The inherited-move file is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">
  <g id="s-torso" transform="translate(30 12)">
    <rect width="36" height="72" fill="#243044"/>
    <g id="s-forearm" transform="translate(36 16)">
      <rect width="52" height="14" fill="#d06a3a"/>
    </g>
  </g>
</svg>
```

The local-rotation file is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">
  <g id="s-torso" transform="translate(30 12)">
    <rect width="36" height="72" fill="#243044"/>
    <g id="s-forearm" transform="translate(36 16) rotate(35)">
      <rect width="52" height="14" fill="#d06a3a"/>
    </g>
  </g>
</svg>
```

A separate vision review session passes those renders. The session uses the designated vision review model chosen by the launcher. This record does not name a model and does not name a vendor. This package does not open that session.

## Why

Nested groups let one torso drawing and one forearm drawing travel together when the parent moves. The child has to be evaluated after the parent, or the limb stays behind. The child's rotation has to stay on the child, or the torso turns with the forearm.

## Verification

`WP-NODE-HIERARCHY` is this record. `spec check` resolves `sot:svgif/node-hierarchy`. When the scene evaluator exists, it writes the two named files and a test compares those strings exactly after C6 quantization. Until that evaluator exists, the two documents in this record are the acceptance pair. A separate vision review session passes the renders. The session uses the designated vision review model chosen by the launcher.

[[plan:svgif/20261110122000]] has no checkbox row for `WP-NODE-HIERARCHY`. This record does not edit the plan.
