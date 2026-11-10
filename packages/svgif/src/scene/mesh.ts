/**
 * Sampled triangle meshes and Path3 polylines.
 * A box side is one quad. The stored faces split that quad so a three-corner
 * face list still satisfies the scene graph. The diagonal is not an edge of
 * the quad. Sphere, torus, extrude, lathe, and parametric samples stay
 * triangles. [[sot:svgif/scene-3d]] fixes the sphere at 16 by 12 and the torus
 * at 24 by 12. Extrude bevel steps are an explicit argument. Lathe and
 * parametric segment counts are explicit arguments. Positions stay in the
 * node's own space. This file does not build clip space or a fill.
 */

import type { Vec2, Vec3 } from "../math/index.ts";

/** Sphere columns around Y. Changing this changes goldens. [[sot:svgif/scene-3d]] */
export const SPHERE_WIDTH_SEGMENTS = 16;
/** Sphere rows from pole to pole. Changing this changes goldens. [[sot:svgif/scene-3d]] */
export const SPHERE_HEIGHT_SEGMENTS = 12;
/** Torus segments around the ring. The pair is 24 by 12. [[sot:svgif/scene-3d]] */
export const TORUS_RADIAL_SEGMENTS = 24;
/** Torus segments around the tube. The pair is 24 by 12. [[sot:svgif/scene-3d]] */
export const TORUS_TUBULAR_SEGMENTS = 12;

export type MeshPrimitive = "box" | "sphere" | "torus" | "extrude" | "lathe" | "parametric";

export interface MeshSegments {
  widthSegments?: number;
  heightSegments?: number;
  radialSegments?: number;
  tubularSegments?: number;
  bevelSteps?: number;
  segments?: number;
  segmentsU?: number;
  segmentsV?: number;
}

export interface TriangleMesh {
  primitive: MeshPrimitive;
  positions: Vec3[];
  /**
   * Triangle corners. Closed primitives wind so the geometric normal points outward.
   * A box stores two triangles per side. The side itself is the quad from `boxFaceRings`.
   */
  faces: Array<[number, number, number]>;
  segments: MeshSegments;
}

/** Four corner indexes of one box side. Winding is outward. The diagonal is absent. */
export type BoxSide = [number, number, number, number];

/**
 * Six box sides. Order is +Z, -Z, +Y, -Y, +X, -X.
 * Each quad splits into `[a, b, c]` and `[a, c, d]` for the triangle list.
 */
const BOX_SIDES: readonly BoxSide[] = [
  [4, 5, 6, 7],
  [1, 0, 3, 2],
  [3, 7, 6, 2],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [4, 7, 3, 0],
];

export interface Path3 {
  primitive: "path3";
  points: Vec3[];
  closed: boolean;
}

export interface ExtrudeOptions {
  depth: number;
  /** Required. There is no hidden bevel-step default. */
  bevelSteps: number;
  bevelSize?: number;
  bevelThickness?: number;
}

const EPS = 1e-9;

/**
 * Closed box centered on the origin. The default is the unit box, side length 1.
 * Six sides, one quad a side, eight corners. The face list is those quads
 * split once, so callers that store three-corner faces keep twelve triangles.
 */
export function boxGeometry(width = 1, height = 1, depth = 1): TriangleMesh {
  assertPositive(width, "width");
  assertPositive(height, "height");
  assertPositive(depth, "depth");
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const positions: Vec3[] = [
    { x: -x, y: -y, z: -z },
    { x, y: -y, z: -z },
    { x, y, z: -z },
    { x: -x, y, z: -z },
    { x: -x, y: -y, z },
    { x, y: -y, z },
    { x, y, z },
    { x: -x, y, z },
  ];
  const faces: Array<[number, number, number]> = [];
  for (const [a, b, c, d] of BOX_SIDES) faces.push([a, b, c], [a, c, d]);
  return mesh("box", positions, faces, {});
}

/**
 * One ring per box side. Four corners, outward winding, and no diagonal edge.
 * The ring is rebuilt from the stored triangle pair, so a copied mesh keeps it.
 * A sphere, torus, or other sampled mesh is not a box side.
 */
export function boxFaceRings(mesh: Pick<TriangleMesh, "primitive" | "faces">): BoxSide[] {
  if (mesh.primitive !== "box") throw new Error("box face is not a quad");
  if (mesh.faces.length === 0 || mesh.faces.length % 2 !== 0) throw new Error("box face is not a quad");
  const rings: BoxSide[] = [];
  for (let index = 0; index < mesh.faces.length; index += 2) {
    rings.push(ringFromPair(mesh.faces[index], mesh.faces[index + 1]));
  }
  return rings;
}

/**
 * UV sphere. `widthSegments` goes around Y and `heightSegments` goes from the
 * positive pole to the negative pole. Defaults are 16 and 12.
 */
export function sphereGeometry(
  radius = 1,
  widthSegments = SPHERE_WIDTH_SEGMENTS,
  heightSegments = SPHERE_HEIGHT_SEGMENTS,
): TriangleMesh {
  assertPositive(radius, "radius");
  const width = assertWhole(widthSegments, 3, "width segments");
  const height = assertWhole(heightSegments, 2, "height segments");
  const positions: Vec3[] = [{ x: 0, y: radius, z: 0 }];
  for (let iy = 1; iy < height; iy++) {
    const phi = (iy / height) * Math.PI;
    const y = Math.cos(phi) * radius;
    const ring = Math.sin(phi) * radius;
    for (let ix = 0; ix < width; ix++) {
      const theta = (ix / width) * Math.PI * 2;
      positions.push({
        x: ring * Math.cos(theta),
        y,
        z: ring * Math.sin(theta),
      });
    }
  }
  positions.push({ x: 0, y: -radius, z: 0 });

  const faces: Array<[number, number, number]> = [];
  const at = (iy: number, ix: number): number => {
    if (iy === 0) return 0;
    if (iy === height) return 1 + (height - 1) * width;
    return 1 + (iy - 1) * width + (ix % width);
  };
  for (let iy = 0; iy < height; iy++) {
    for (let ix = 0; ix < width; ix++) {
      const next = ix + 1;
      if (iy === 0) {
        faces.push([at(0, ix), at(1, next), at(1, ix)]);
      } else if (iy === height - 1) {
        faces.push([at(iy, ix), at(iy, next), at(height, ix)]);
      } else {
        const a = at(iy, ix);
        const b = at(iy, next);
        const c = at(iy + 1, next);
        const d = at(iy + 1, ix);
        faces.push([a, b, d], [b, c, d]);
      }
    }
  }
  return mesh("sphere", positions, faces, { widthSegments: width, heightSegments: height });
}

/**
 * Torus about Y. `radialSegments` divides the ring and `tubularSegments`
 * divides the tube. Defaults are 24 and 12. Default radius is 1 and default
 * tube radius is 0.25.
 */
export function torusGeometry(
  radius = 1,
  tube = 0.25,
  radialSegments = TORUS_RADIAL_SEGMENTS,
  tubularSegments = TORUS_TUBULAR_SEGMENTS,
): TriangleMesh {
  assertPositive(radius, "radius");
  assertPositive(tube, "tube");
  const radial = assertWhole(radialSegments, 3, "radial segments");
  const tubular = assertWhole(tubularSegments, 3, "tubular segments");
  const positions: Vec3[] = [];
  for (let i = 0; i < radial; i++) {
    const theta = (i / radial) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    for (let j = 0; j < tubular; j++) {
      const phi = (j / tubular) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const ring = radius + tube * cosPhi;
      positions.push({
        x: ring * cosTheta,
        y: tube * sinPhi,
        z: ring * sinTheta,
      });
    }
  }
  const faces: Array<[number, number, number]> = [];
  for (let i = 0; i < radial; i++) {
    const i1 = (i + 1) % radial;
    for (let j = 0; j < tubular; j++) {
      const j1 = (j + 1) % tubular;
      const a = i * tubular + j;
      const b = i1 * tubular + j;
      const c = i1 * tubular + j1;
      const d = i * tubular + j1;
      faces.push([a, d, b], [b, d, c]);
    }
  }
  return mesh("torus", positions, faces, { radialSegments: radial, tubularSegments: tubular });
}

/**
 * Extrude a closed 2D profile along +Z from 0 to `depth`.
 * `bevelSteps` is required. Zero is a prism. A positive count samples a
 * quarter-ellipse bevel; `bevelSize` and `bevelThickness` are then required.
 * The profile is made counter-clockwise. Caps use that winding.
 */
export function extrudeGeometry(profile: readonly Vec2[], options: ExtrudeOptions): TriangleMesh {
  if (options === undefined || options.bevelSteps === undefined) {
    throw new Error("bevel steps are explicit");
  }
  assertPositive(options.depth, "depth");
  const bevelSteps = assertWhole(options.bevelSteps, 0, "bevel steps");
  const clean = cleanProfile(profile);
  const depth = options.depth;
  let bevelSize = 0;
  let bevelThickness = 0;
  if (bevelSteps > 0) {
    if (options.bevelSize === undefined) throw new Error("bevel size is explicit");
    if (options.bevelThickness === undefined) throw new Error("bevel thickness is explicit");
    assertPositive(options.bevelSize, "bevel size");
    assertPositive(options.bevelThickness, "bevel thickness");
    if (!(2 * options.bevelThickness < depth)) {
      throw new Error("bevel thickness leaves no side wall");
    }
    bevelSize = options.bevelSize;
    bevelThickness = options.bevelThickness;
  }

  const ringPoints: Vec2[][] = [];
  const ringZ: number[] = [];
  const pushRing = (points: readonly Vec2[], z: number): void => {
    if (signedArea(points) <= EPS) throw new Error("profile bevel crosses itself");
    ringPoints.push(points.map((point) => ({ x: point.x, y: point.y })));
    ringZ.push(z);
  };
  if (bevelSteps === 0) {
    pushRing(clean, 0);
    pushRing(clean, depth);
  } else {
    for (let step = 0; step <= bevelSteps; step++) {
      const angle = (step / bevelSteps) * (Math.PI / 2);
      let inset = bevelSize * Math.cos(angle);
      let z = bevelThickness * Math.sin(angle);
      if (Math.abs(inset) <= EPS) inset = 0;
      if (Math.abs(z) <= EPS) z = 0;
      pushRing(inset === 0 ? clean : insetProfile(clean, inset), z);
    }
    for (let step = bevelSteps; step >= 0; step--) {
      pushRing(ringPoints[step], depth - ringZ[step]);
    }
  }

  const positions: Vec3[] = [];
  const count = clean.length;
  for (let ring = 0; ring < ringPoints.length; ring++) {
    for (const point of ringPoints[ring]) {
      positions.push({ x: point.x, y: point.y, z: ringZ[ring] });
    }
  }
  const faces: Array<[number, number, number]> = [];
  for (let ring = 0; ring < ringPoints.length - 1; ring++) {
    const lower = ring * count;
    const upper = (ring + 1) * count;
    for (let i = 0; i < count; i++) {
      const i1 = (i + 1) % count;
      faces.push(
        [lower + i, lower + i1, upper + i1],
        [lower + i, upper + i1, upper + i],
      );
    }
  }
  const cap = triangulate(ringPoints[0]);
  const top = (ringPoints.length - 1) * count;
  for (const [a, b, c] of cap) {
    faces.push([a, c, b], [top + a, top + b, top + c]);
  }
  return mesh("extrude", positions, faces, { bevelSteps });
}

/**
 * Lathe a profile of `{ x: radius, y }` around Y. `segments` is required and
 * is at least 3. A zero radius collapses that row to one vertex.
 */
export function latheGeometry(profile: readonly Vec2[], segments: number): TriangleMesh {
  const count = assertWhole(segments, 3, "lathe segments");
  const points = cleanOpenProfile(profile);
  const positions: Vec3[] = [];
  const rings: number[][] = [];
  for (const point of points) {
    if (point.x <= EPS) {
      const index = positions.length;
      positions.push({ x: 0, y: point.y, z: 0 });
      rings.push(Array.from({ length: count }, () => index));
    } else {
      const indexes: number[] = [];
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        indexes.push(positions.length);
        positions.push({
          x: point.x * Math.cos(theta),
          y: point.y,
          z: point.x * Math.sin(theta),
        });
      }
      rings.push(indexes);
    }
  }
  const faces: Array<[number, number, number]> = [];
  for (let row = 0; row < rings.length - 1; row++) {
    const bottom = rings[row];
    const top = rings[row + 1];
    for (let i = 0; i < count; i++) {
      const i1 = (i + 1) % count;
      const a = bottom[i];
      const b = bottom[i1];
      const d = top[i];
      const c = top[i1];
      if (a === b && d === c) continue;
      if (a === b) {
        faces.push([a, d, c]);
      } else if (d === c) {
        faces.push([a, d, b]);
      } else {
        faces.push([a, d, b], [d, c, b]);
      }
    }
  }
  if (faces.length === 0) throw new Error("lathe profile has no faces");
  return mesh("lathe", positions, faces, { segments: count });
}

/**
 * Parametric surface. `sample(u, v)` is called on a uniform grid with `u` and
 * `v` in `[0, 1]`. `segmentsU` and `segmentsV` count quads and are required.
 * Winding follows ∂u × ∂v.
 */
export function parametricGeometry(
  sample: (u: number, v: number) => Vec3,
  segmentsU: number,
  segmentsV: number,
): TriangleMesh {
  if (typeof sample !== "function") throw new Error("parametric sample is missing");
  const columns = assertWhole(segmentsU, 1, "parametric segmentsU");
  const rows = assertWhole(segmentsV, 1, "parametric segmentsV");
  const positions: Vec3[] = [];
  for (let iu = 0; iu <= columns; iu++) {
    const u = iu / columns;
    for (let iv = 0; iv <= rows; iv++) {
      const v = iv / rows;
      const point = sample(u, v);
      assertVec3(point, "parametric point");
      positions.push({ x: point.x, y: point.y, z: point.z });
    }
  }
  const stride = rows + 1;
  const faces: Array<[number, number, number]> = [];
  for (let iu = 0; iu < columns; iu++) {
    for (let iv = 0; iv < rows; iv++) {
      const a = iu * stride + iv;
      const b = (iu + 1) * stride + iv;
      const c = (iu + 1) * stride + iv + 1;
      const d = iu * stride + iv + 1;
      faces.push([a, b, d], [b, c, d]);
    }
  }
  return mesh("parametric", positions, faces, { segmentsU: columns, segmentsV: rows });
}

/** Polyline in the node's own space. `closed` joins the last point to the first. */
export function path3(points: readonly Vec3[], closed = false): Path3 {
  if (!Array.isArray(points) || points.length < 2) throw new Error("path3 needs two points");
  if (typeof closed !== "boolean") throw new Error("path3 closed is not a boolean");
  return {
    primitive: "path3",
    points: points.map((point, index) => {
      assertVec3(point, `path3 point ${index}`);
      return { x: point.x, y: point.y, z: point.z };
    }),
    closed,
  };
}

function mesh(
  primitive: MeshPrimitive,
  positions: Vec3[],
  faces: Array<[number, number, number]>,
  segments: MeshSegments,
): TriangleMesh {
  return { primitive, positions, faces, segments };
}

function ringFromPair(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): BoxSide {
  const shared = first.filter((corner) => second.includes(corner));
  if (shared.length !== 2) throw new Error("box face is not a quad");
  const sharedSet = new Set(shared);
  const chain = (tri: readonly [number, number, number]): [number, number, number] => {
    for (let index = 0; index < 3; index += 1) {
      const start = tri[index];
      const mid = tri[(index + 1) % 3];
      const end = tri[(index + 2) % 3];
      if (sharedSet.has(start) && sharedSet.has(end) && !sharedSet.has(mid)) return [start, mid, end];
    }
    throw new Error("box face is not a quad");
  };
  const left = chain(first);
  let right = chain(second);
  if (right[0] !== left[2]) right = [right[2], right[1], right[0]];
  if (right[0] !== left[2] || right[2] !== left[0]) throw new Error("box face is not a quad");
  const ring: BoxSide = [left[0], left[1], left[2], right[1]];
  if (new Set(ring).size !== 4) throw new Error("box face is not a quad");
  return ring;
}

function assertPositive(value: number, label: string): void {
  if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) {
    throw new Error(`${label} is not positive`);
  }
}

function assertWhole(value: number, min: number, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} is not a whole number`);
  if (value < min) throw new Error(`${label} is below ${min}`);
  return value;
}

function assertVec2(value: Vec2 | undefined, label: string): Vec2 {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error(`${label} has a non-finite number`);
  }
  return value;
}

function assertVec3(value: Vec3 | undefined, label: string): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new Error(`${label} has a non-finite number`);
  }
}

function cleanProfile(points: readonly Vec2[]): Vec2[] {
  if (!Array.isArray(points)) throw new Error("profile needs three points");
  const copy = points.map((point, index) => {
    const checked = assertVec2(point, `profile point ${index}`);
    return { x: checked.x, y: checked.y };
  });
  if (copy.length >= 2 && same2(copy[0], copy[copy.length - 1])) copy.pop();
  const deduped: Vec2[] = [];
  for (const point of copy) {
    if (deduped.length === 0 || !same2(deduped[deduped.length - 1], point)) deduped.push(point);
  }
  let guard = deduped.length + 1;
  let index = 0;
  while (index < deduped.length && guard-- > 0) {
    if (deduped.length < 3) break;
    const prev = deduped[(index - 1 + deduped.length) % deduped.length];
    const curr = deduped[index];
    const next = deduped[(index + 1) % deduped.length];
    if (Math.abs(cross2(sub2(curr, prev), sub2(next, curr))) <= EPS) {
      deduped.splice(index, 1);
      continue;
    }
    index += 1;
  }
  if (deduped.length < 3) throw new Error("profile needs three points");
  const area = signedArea(deduped);
  if (Math.abs(area) <= EPS) throw new Error("profile area is zero");
  if (area < 0) deduped.reverse();
  return deduped;
}

function cleanOpenProfile(points: readonly Vec2[]): Vec2[] {
  if (!Array.isArray(points)) throw new Error("lathe profile needs two points");
  const deduped: Vec2[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = assertVec2(points[index], `lathe point ${index}`);
    if (point.x < -EPS) throw new Error("lathe radius is negative");
    const next = { x: point.x, y: point.y };
    if (deduped.length === 0 || !same2(deduped[deduped.length - 1], next)) deduped.push(next);
  }
  if (deduped.length < 2) throw new Error("lathe profile needs two points");
  return deduped;
}

function insetProfile(points: readonly Vec2[], distance: number): Vec2[] {
  const out: Vec2[] = [];
  const count = points.length;
  for (let index = 0; index < count; index++) {
    const prev = points[(index - 1 + count) % count];
    const curr = points[index];
    const next = points[(index + 1) % count];
    const e0 = unit2(sub2(curr, prev), "profile edge");
    const e1 = unit2(sub2(next, curr), "profile edge");
    const n0 = { x: -e0.y, y: e0.x };
    const n1 = { x: -e1.y, y: e1.x };
    const bis = unit2(add2(n0, n1), "profile bevel is degenerate");
    const denom = dot2(bis, n0);
    if (denom <= EPS) throw new Error("profile bevel is degenerate");
    out.push(add2(curr, mul2(bis, distance / denom)));
  }
  return out;
}

function triangulate(points: readonly Vec2[]): Array<[number, number, number]> {
  const remaining = points.map((_, index) => index);
  const faces: Array<[number, number, number]> = [];
  let guard = points.length * points.length;
  while (remaining.length > 3) {
    if (guard-- <= 0) throw new Error("profile is not a simple polygon");
    let clipped = false;
    for (let index = 0; index < remaining.length; index++) {
      const i0 = remaining[(index - 1 + remaining.length) % remaining.length];
      const i1 = remaining[index];
      const i2 = remaining[(index + 1) % remaining.length];
      const a = points[i0];
      const b = points[i1];
      const c = points[i2];
      if (cross2(sub2(b, a), sub2(c, a)) <= EPS) continue;
      let blocked = false;
      for (const other of remaining) {
        if (other === i0 || other === i1 || other === i2) continue;
        if (pointInTriangle(points[other], a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      faces.push([i0, i1, i2]);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error("profile is not a simple polygon");
  }
  faces.push([remaining[0], remaining[1], remaining[2]]);
  return faces;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const area = cross2(sub2(b, a), sub2(c, a));
  if (area <= EPS) return false;
  const w0 = cross2(sub2(b, a), sub2(p, a));
  const w1 = cross2(sub2(c, b), sub2(p, b));
  const w2 = cross2(sub2(a, c), sub2(p, c));
  return w0 > EPS && w1 > EPS && w2 > EPS;
}

function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    sum += points[index].x * next.y - next.x * points[index].y;
  }
  return sum / 2;
}

function same2(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
}

function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function mul2(a: Vec2, scale: number): Vec2 {
  return { x: a.x * scale, y: a.y * scale };
}

function dot2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function unit2(value: Vec2, label: string): Vec2 {
  const length = Math.hypot(value.x, value.y);
  if (length <= EPS) throw new Error(label);
  return { x: value.x / length, y: value.y / length };
}
