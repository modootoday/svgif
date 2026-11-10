/**
 * Camera depth and azimuth.
 * The camera looks down local -Z. `distance` is its depth from `target`.
 * `azimuth` is radians around world +Y: 0 sits on +Z and positive turns toward +X.
 * A dolly changes that depth. An orbit changes that azimuth.
 * The view looks at `target` with world +Y up, so the picture is not rolled.
 * Projected size is left to the existing projector.
 * [[sot:svgif/scene-3d]] [[sot:svgif/determinism]]
 */

import type { Quat, Vec3 } from "../math/index.ts";

interface CameraPose {
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
}

const SINGULAR = 1e-12;
/** Parallel to world +Y. The up axis then switches to world +Z. */
const POLE = 1 - 1e-8;

export interface CameraFrame {
  /** World point the camera looks at. The default is the origin. */
  target?: Vec3;
  /** Depth from `target`. Omit to keep the authored depth. */
  distance?: number;
  /** Azimuth in radians. Omit to keep the authored azimuth. */
  azimuth?: number;
}

/**
 * Place the camera for one dolly and one orbit.
 * Authored elevation is kept. Scale is kept. The result is a new transform.
 */
export function poseCamera(authored: CameraPose, frame: CameraFrame = {}): CameraPose {
  if (!authored?.position || !authored.scale) throw new Error("camera pose is missing");
  assertVec3(authored.position, "position");
  assertVec3(authored.scale, "scale");
  const target = frame.target ?? { x: 0, y: 0, z: 0 };
  assertVec3(target, "target");
  const offset = {
    x: authored.position.x - target.x,
    y: authored.position.y - target.y,
    z: authored.position.z - target.z,
  };
  const radius = Math.hypot(offset.x, offset.y, offset.z);
  if (!(radius > SINGULAR) && frame.distance === undefined) {
    throw new Error("camera is on the target");
  }
  const distance = frame.distance ?? radius;
  if (!Number.isFinite(distance) || !(distance > SINGULAR)) {
    throw new Error("distance is not positive");
  }
  const elevation = radius > SINGULAR ? Math.asin(clamp(offset.y / radius, -1, 1)) : 0;
  const azimuth = frame.azimuth ?? (radius > SINGULAR ? Math.atan2(offset.x, offset.z) : 0);
  if (!Number.isFinite(azimuth)) throw new Error("azimuth is not finite");
  const horizontal = distance * Math.cos(elevation);
  const bearing = sinCos(azimuth);
  const position = {
    x: target.x + horizontal * bearing.sin,
    y: target.y + distance * Math.sin(elevation),
    z: target.z + horizontal * bearing.cos,
  };
  return {
    position,
    quaternion: lookQuaternion(position, target),
    scale: { x: authored.scale.x, y: authored.scale.y, z: authored.scale.z },
  };
}

/** Unit quaternion whose local +Z is `eye - target` and whose local +Y follows up. */
function lookQuaternion(eye: Vec3, target: Vec3): Quat {
  const outward = normalize(subtract(eye, target), "camera is on the target");
  const up = Math.abs(outward.y) > POLE ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const xAxis = normalize(cross(up, outward), "camera up is parallel to the view");
  const yAxis = cross(outward, xAxis);
  return quaternionFromAxes(xAxis, yAxis, outward);
}

/**
 * Rotation whose columns are the three axes.
 * `q` and `-q` are the same rotation. `w` is kept non-negative.
 */
function quaternionFromAxes(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Quat {
  const m00 = xAxis.x;
  const m01 = yAxis.x;
  const m02 = zAxis.x;
  const m10 = xAxis.y;
  const m11 = yAxis.y;
  const m12 = zAxis.y;
  const m20 = xAxis.z;
  const m21 = yAxis.z;
  const m22 = zAxis.z;
  const trace = m00 + m11 + m22;
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  return normalizeQuat({ x, y, z, w });
}

function normalizeQuat(quaternion: Quat): Quat {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (!(length > SINGULAR)) throw new Error("camera orientation is degenerate");
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(vector: Vec3, message: string): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!(length > SINGULAR)) throw new Error(message);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function assertVec3(value: Vec3, label: string): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new Error(`${label} has a non-finite number`);
  }
}

/** Right angles stay exact. `cos(π/2)` is otherwise a tiny leftover that leaks an edge-on face. */
function sinCos(angle: number): { sin: number; cos: number } {
  const turns = angle / (Math.PI / 2);
  const nearest = Math.round(turns);
  if (Math.abs(angle) > SINGULAR && Math.abs(turns - nearest) < 1e-9) {
    const quadrant = ((nearest % 4) + 4) % 4;
    if (quadrant === 0) return { sin: 0, cos: 1 };
    if (quadrant === 1) return { sin: 1, cos: 0 };
    if (quadrant === 2) return { sin: 0, cos: -1 };
    return { sin: -1, cos: 0 };
  }
  return { sin: Math.sin(angle), cos: Math.cos(angle) };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
