/**
 * Back-face cull, painter sort, and flat Lambert fills.
 * A triangle is dropped when its clip-space geometric normal points away
 * from the camera: the dot with the toward-camera direction is non-negative.
 * After this projection that direction is clip -Z, so the face is dropped
 * when the normal's z is not positive. Survivors sort by average clip-space z,
 * far first. Ties break by stable node id, then face index.
 * Lambert uses the face normal, one ambient light, and one or two directional
 * lights. The product is linear, then 8-bit sRGB. Specular is out of v1.
 * There is no BSP.
 * [[sot:svgif/scene-3d]] [[adr:svgif/20261110120500]]
 */

import { formatColor } from "../ir/color.ts";
import { quantize1e4, quantizeByte } from "../ir/quantize.ts";
import { viewportMap, type Vec2, type Vec3 } from "../math/index.ts";

const SINGULAR = 1e-12;
const SPAN = 1e-9;
const SRGB_BREAK = 0.0031308;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ClipCorner {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ShadeFace {
  nodeId: string;
  faceIndex: number;
  clip: readonly [ClipCorner, ClipCorner, ClipCorner];
  /** Face normal in the same linear space as the light directions. */
  normal: Vec3;
}

/** Direction from the face toward the light. `diffuse` is linear. */
export interface DirectionalLight {
  direction: Vec3;
  diffuse: Rgb;
}

export interface ShadeLights {
  /** Linear ambient color. One ambient light. */
  ambient: Rgb;
  /** One or two directional lights. A third is out of v1. */
  directional: readonly DirectionalLight[];
}

export interface ShadeMaterial {
  /** Linear albedo. */
  albedo: Rgb;
  /**
   * Solid Lambert fill, or the same color as a per-face linear gradient
   * along the first directional light. The default is a solid fill.
   */
  shaded?: "lambert" | "lambert-gradient";
}

export interface ShadeFrame {
  width: number;
  height: number;
}

export interface GradientStop {
  offset: 0 | 1;
  color: string;
}

export interface LinearGradientFill {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: readonly [GradientStop, GradientStop];
}

export interface ShadedTriangle {
  nodeId: string;
  faceIndex: number;
  /** Average clip-space z. Larger is farther. */
  depth: number;
  /** 8-bit sRGB Lambert color. */
  color: string;
  /** Solid color, or `url(#id)` when the material asks for a gradient. */
  fill: string;
  gradient?: LinearGradientFill;
}

interface RankedFace {
  face: ShadeFace;
  depth: number;
  inputIndex: number;
  normal: Vec3;
}

/** Clip-space geometric normal z. Positive z faces the camera for this projection. */
function clipNormalZ(clip: readonly [ClipCorner, ClipCorner, ClipCorner]): number {
  const ab = subtract(clip[1], clip[0]);
  const ac = subtract(clip[2], clip[0]);
  return ab.x * ac.y - ab.y * ac.x;
}

/** True when the clip-space geometric normal points away from the camera. */
export function facesAway(clip: readonly [ClipCorner, ClipCorner, ClipCorner]): boolean {
  return clipNormalZ(clip) <= 0;
}

/**
 * Cull, Lambert-shade, and painter-sort.
 * Draw order is far first. An equal z uses the stable node id, then the face index.
 */
export function shadeTriangles(
  faces: readonly ShadeFace[],
  material: ShadeMaterial,
  lights: ShadeLights,
  frame?: ShadeFrame,
): ShadedTriangle[] {
  const mode = shadedMode(material);
  const directional = directionalLights(lights);
  const albedo = rgb(material?.albedo, "albedo");
  const ambient = rgb(lights?.ambient, "ambient");
  if (mode === "lambert-gradient") {
    if (frame === undefined) throw new Error("viewport is required for a lambert gradient");
    assertSize(frame.width, "width");
    assertSize(frame.height, "height");
  }

  const ranked: RankedFace[] = [];
  faces.forEach((face, inputIndex) => {
    assertFace(face);
    if (facesAway(face.clip)) return;
    ranked.push({
      face,
      depth: averageZ(face.clip),
      inputIndex,
      normal: unit(face.normal, "face normal"),
    });
  });

  ranked.sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth;
    if (a.face.nodeId !== b.face.nodeId) return a.face.nodeId < b.face.nodeId ? -1 : 1;
    if (a.face.faceIndex !== b.face.faceIndex) return a.face.faceIndex - b.face.faceIndex;
    return a.inputIndex - b.inputIndex;
  });

  return ranked.map((entry, order) => {
    const color = lambertColor(entry.normal, albedo, ambient, directional);
    if (mode === "lambert") {
      return {
        nodeId: entry.face.nodeId,
        faceIndex: entry.face.faceIndex,
        depth: entry.depth,
        color,
        fill: color,
      };
    }
    const gradient = gradientFill(entry, order, color, directional[0], frame as ShadeFrame);
    return {
      nodeId: entry.face.nodeId,
      faceIndex: entry.face.faceIndex,
      depth: entry.depth,
      color,
      fill: `url(#${gradient.id})`,
      gradient,
    };
  });
}

function shadedMode(material: ShadeMaterial): "lambert" | "lambert-gradient" {
  if (!material || typeof material !== "object") throw new Error("material is missing");
  const shaded = material.shaded as string | undefined;
  if (shaded === undefined || shaded === "lambert") return "lambert";
  if (shaded === "lambert-gradient") return "lambert-gradient";
  if (shaded === "specular") throw new Error("specular is out of v1");
  throw new Error("shaded mode is not lambert");
}

function directionalLights(lights: ShadeLights): Array<{ direction: Vec3; diffuse: Rgb }> {
  if (!lights || !Array.isArray(lights.directional)) throw new Error("directional lights are missing");
  if (lights.directional.length < 1 || lights.directional.length > 2) {
    throw new Error("one or two directional lights");
  }
  return lights.directional.map((light, index) => {
    if (!light) throw new Error("directional light is missing");
    return {
      direction: unit(light.direction, `directional light ${index}`),
      diffuse: rgb(light.diffuse, `diffuse ${index}`),
    };
  });
}

function lambertColor(
  normal: Vec3,
  albedo: Rgb,
  ambient: Rgb,
  directional: readonly { direction: Vec3; diffuse: Rgb }[],
): string {
  const channels = (["r", "g", "b"] as const).map((channel) => {
    let sum = ambient[channel];
    for (const light of directional) {
      sum += light.diffuse[channel] * Math.max(0, dot(normal, light.direction));
    }
    return encodeSrgb(albedo[channel] * sum);
  });
  return formatColor(channels);
}

/** Linear light to an 8-bit sRGB channel. */
function encodeSrgb(linear: number): number {
  const channel = Math.min(1, Math.max(0, linear));
  const encoded =
    channel <= SRGB_BREAK ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return quantizeByte(encoded * 255);
}

function gradientFill(
  entry: RankedFace,
  order: number,
  color: string,
  light: { direction: Vec3 },
  frame: ShadeFrame,
): LinearGradientFill {
  const points = entry.face.clip.map((corner) => {
    if (!(corner.w > 0)) throw new Error("point is behind the camera");
    return viewportMap(
      { x: corner.x / corner.w, y: corner.y / corner.w, z: corner.z / corner.w },
      frame.width,
      frame.height,
    );
  });
  const axis = screenAxis(light.direction);
  const ends = gradientEnds(points, axis);
  return {
    id: `shade-${order}`,
    x1: quantize1e4(ends.from.x),
    y1: quantize1e4(ends.from.y),
    x2: quantize1e4(ends.to.x),
    y2: quantize1e4(ends.to.y),
    stops: [
      { offset: 0, color },
      { offset: 1, color },
    ],
  };
}

/** First light in the viewport. Y is flipped so SVG y grows downward. A light along Z uses +X. */
function screenAxis(direction: Vec3): Vec2 {
  const length = Math.hypot(direction.x, direction.y);
  if (length < SINGULAR) return { x: 1, y: 0 };
  return { x: direction.x / length, y: -direction.y / length };
}

function gradientEnds(points: readonly Vec2[], axis: Vec2): { from: Vec2; to: Vec2 } {
  const along = span(points, axis);
  if (along.span >= SPAN) return along;
  return span(points, { x: -axis.y, y: axis.x });
}

function span(points: readonly Vec2[], axis: Vec2): { from: Vec2; to: Vec2; span: number } {
  let min = Infinity;
  let max = -Infinity;
  let from = points[0];
  let to = points[0];
  for (const point of points) {
    const t = point.x * axis.x + point.y * axis.y;
    if (t < min) {
      min = t;
      from = point;
    }
    if (t > max) {
      max = t;
      to = point;
    }
  }
  return { from, to, span: max - min };
}

function averageZ(clip: readonly [ClipCorner, ClipCorner, ClipCorner]): number {
  return (clip[0].z + clip[1].z + clip[2].z) / 3;
}

function assertFace(face: ShadeFace): void {
  if (!face || typeof face.nodeId !== "string") throw new Error("node id is missing");
  if (!Number.isInteger(face.faceIndex) || face.faceIndex < 0) {
    throw new Error("face index is not a whole number");
  }
  if (!face.clip || face.clip.length !== 3) throw new Error("face is not a triangle");
  for (const corner of face.clip) {
    if (
      !corner ||
      !Number.isFinite(corner.x) ||
      !Number.isFinite(corner.y) ||
      !Number.isFinite(corner.z) ||
      !Number.isFinite(corner.w)
    ) {
      throw new Error("clip corner has a non-finite number");
    }
  }
}

function rgb(value: Rgb | undefined, label: string): Rgb {
  if (!value || !Number.isFinite(value.r) || !Number.isFinite(value.g) || !Number.isFinite(value.b)) {
    throw new Error(`${label} has a non-finite number`);
  }
  return { r: value.r, g: value.g, b: value.b };
}

function unit(value: Vec3 | undefined, label: string): Vec3 {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new Error(`${label} has a non-finite number`);
  }
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < SINGULAR) throw new Error(`${label} has zero length`);
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a: ClipCorner, b: ClipCorner): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function assertSize(value: number, label: string): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new Error(`${label} is not positive`);
}
