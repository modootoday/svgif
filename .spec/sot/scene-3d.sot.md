---
id: sot:svgif/scene-3d
title: 3D math and SVG projection
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [3d, math]
rel:
  depends_on:
    - sot:svgif/architecture
    - adr:svgif/20261110120100
    - adr:svgif/20261110120400
    - adr:svgif/20261110120500
---

# 3D math and SVG projection

## Rule

3D is simulated with textbook linear algebra and then drawn as 2D SVG. The implementation does not call WebGL and does not depend on three.js. Names below are the C1 contract.

### Types

- `Vec3 { x, y, z }`, `Vec4 { x, y, z, w }`.
- `Quat { x, y, z, w }` unit quaternion. Euler order is intrinsic `XYZ` in radians when an author sets `rotation` as Euler. The stored orientation on a node is a quaternion.
- `Mat4` is column-major, 16 numbers, matching the usual graphics convention. `compose(position, quat, scale)`, `lookAt`, `multiply`, `invert`.
- `PerspectiveCamera { fovY, aspect, near, far }` and `OrthographicCamera { left, right, top, bottom, near, far }`. `aspect` defaults to `width / height` of the composition.
- Node transform: `position: Vec3`, `quaternion: Quat`, `scale: Vec3`. World matrix is parent world times local, evaluated depth-first.

### Projection

1. Model-view-projection: `clip = projection * view * world * position` with `position.w = 1`.
2. Clip against the near plane in clip space before the perspective divide (Sutherland–Hodgman on the triangle or polyline). Vertices behind the camera are not passed to the divider.
3. NDC is `clip.xyz / clip.w`. Viewport map: `x = (ndc.x * 0.5 + 0.5) * width`, `y = (ndc.y * -0.5 + 0.5) * height`. Y is flipped so SVG y grows downward. The root SVG `viewBox` is `0 0 width height`.
4. 3D curves (lathe, parametric, extrude profile) are sampled at a fixed segment count, then the polyline is projected and emitted as an SVG path. Segment counts are part of the geometry constructor and are stable: sphere default 16 by 12, torus 24 by 12, extrude bevel steps explicit. Changing a default is an ADR because goldens change.
5. Back-face culling drops a triangle whose clip-space geometric normal points away from the camera (non-negative dot with the view direction after transform). Painters' algorithm sorts surviving triangles by average clip-space z, far first. Ties break by the stable node id, then by face index. BSP is not in v1. [[adr:svgif/20261110120500]]
6. Flat shading uses the face normal and one directional light plus one ambient light. Lambert: `rgb = albedo * (ambient + diffuse * max(0, dot(n, l)))` computed in linear light and encoded to 8-bit sRGB for `fill`. A second directional light is allowed. No environment maps. Gradients are a per-face linear gradient along the light direction when the material says `shaded: "lambert-gradient"`; otherwise a solid fill. Specular is out of v1.
7. CSS `matrix3d` is not used to project meshes. SVG does not give those meshes a 3D rendering context, and `<img>` would not match the inline case. Animated 3D is baked to per-frame 2D path and fill keys, then the ordinary backends play those keys. [[adr:svgif/20261110120400]]
8. Primitives in v1: box, sphere, torus, extrude of a 2D path, lathe of a 2D profile, parametric surface `(u,v) -> Vec3`, and `Path3` polylines.

## Why

SVG has no depth buffer. Sorting and culling have to be explicit or faces paint in authoring order and intersect wrongly. Baking keeps the three backends free of camera math.

## Verification

`WP-MATH` tests a known perspective project of `(0,0,-1)` against hand-computed NDC within the C6 epsilon before quantization. `WP-PROJ` golden SVG for a unit box at a fixed camera matches a committed string. `WP-SHADE` checks cull of a back face and sort order when two faces share a z.
