/**
 * Column-major 3D math. A `Mat4` stores 16 numbers, index `column * 4 + row`.
 * Clip space is `projection * view * world * position` with `position.w = 1`.
 * NDC is `clip.xyz / clip.w` and is not quantized here.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Unit quaternion. Stored orientation is a quaternion, not an Euler triple. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface PerspectiveCamera {
  fovY: number;
  aspect: number;
  near: number;
  far: number;
}

export interface OrthographicCamera {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

const SINGULAR = 1e-12;

export function identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = identity();
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[column * 4 + k];
      }
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function invert(matrix: Mat4): Mat4 {
  const rows: number[][] = [];
  for (let row = 0; row < 4; row++) {
    const next = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let column = 0; column < 4; column++) {
      next[column] = matrix[column * 4 + row];
    }
    next[4 + row] = 1;
    rows.push(next);
  }

  for (let column = 0; column < 4; column++) {
    let pivot = column;
    let max = Math.abs(rows[column][column]);
    for (let row = column + 1; row < 4; row++) {
      const value = Math.abs(rows[row][column]);
      if (value > max) {
        max = value;
        pivot = row;
      }
    }
    if (max < SINGULAR) {
      throw new Error("singular matrix");
    }
    if (pivot !== column) {
      const swap = rows[column];
      rows[column] = rows[pivot];
      rows[pivot] = swap;
    }
    const scale = rows[column][column];
    for (let entry = column; entry < 8; entry++) {
      rows[column][entry] /= scale;
    }
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let entry = column; entry < 8; entry++) {
        rows[row][entry] -= factor * rows[column][entry];
      }
    }
  }

  const out = identity();
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      out[column * 4 + row] = rows[row][4 + column];
    }
  }
  return out;
}

/** `T * R * S`. `quaternion` is a unit quaternion. Euler order is not stored. */
export function compose(position: Vec3, quaternion: Quat, scale: Vec3): Mat4 {
  const { x, y, z, w } = quaternion;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = scale.x;
  const sy = scale.y;
  const sz = scale.z;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    position.x, position.y, position.z, 1,
  ];
}

/**
 * View matrix. Maps `eye` to the origin and `target` onto the negative Z axis.
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const forward = normalize({
    x: target.x - eye.x,
    y: target.y - eye.y,
    z: target.z - eye.z,
  });
  const side = normalize(cross(forward, up));
  const cameraUp = cross(side, forward);
  return [
    side.x, cameraUp.x, -forward.x, 0,
    side.y, cameraUp.y, -forward.y, 0,
    side.z, cameraUp.z, -forward.z, 0,
    -dot(side, eye), -dot(cameraUp, eye), dot(forward, eye), 1,
  ];
}

/** Intrinsic XYZ Euler angles in radians to a unit quaternion. */
export function quaternionFromEulerXYZ(euler: Vec3): Quat {
  const halfX = euler.x * 0.5;
  const halfY = euler.y * 0.5;
  const halfZ = euler.z * 0.5;
  const cx = Math.cos(halfX);
  const sx = Math.sin(halfX);
  const cy = Math.cos(halfY);
  const sy = Math.sin(halfY);
  const cz = Math.cos(halfZ);
  const sz = Math.sin(halfZ);
  // q = qz * qy * qx, so X is applied first in the rotating frame.
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

/** Intrinsic XYZ Euler angles in radians from a unit quaternion. */
export function eulerXYZFromQuaternion(quaternion: Quat): Vec3 {
  const { x, y, z, w } = quaternion;
  const sinY = Math.min(1, Math.max(-1, 2 * (w * y - z * x)));
  return {
    x: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    y: Math.asin(sinY),
    z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  };
}

/**
 * `aspect` may be a number. When it is a size, aspect is `width / height`,
 * the composition default.
 */
export function perspectiveCamera(
  fovY: number,
  near: number,
  far: number,
  aspect: number | { width: number; height: number },
): PerspectiveCamera {
  if (typeof aspect === "number") {
    return { fovY, aspect, near, far };
  }
  if (aspect.height === 0) {
    throw new Error("height is zero");
  }
  return { fovY, aspect: aspect.width / aspect.height, near, far };
}

export function perspective(camera: PerspectiveCamera): Mat4 {
  if (!(camera.fovY > 0 && camera.fovY < Math.PI)) {
    throw new Error("fovY must be between 0 and π");
  }
  if (!(camera.aspect > 0) || !(camera.far > camera.near)) {
    throw new Error("perspective bounds are degenerate");
  }
  const focal = 1 / Math.tan(camera.fovY / 2);
  const depth = camera.near - camera.far;
  return [
    focal / camera.aspect, 0, 0, 0,
    0, focal, 0, 0,
    0, 0, (camera.far + camera.near) / depth, -1,
    0, 0, (2 * camera.far * camera.near) / depth, 0,
  ];
}

export function orthographic(camera: OrthographicCamera): Mat4 {
  const width = camera.right - camera.left;
  const height = camera.top - camera.bottom;
  const depth = camera.near - camera.far;
  if (!(width > 0) || !(height > 0) || !(camera.far > camera.near)) {
    throw new Error("orthographic bounds are degenerate");
  }
  return [
    2 / width, 0, 0, 0,
    0, 2 / height, 0, 0,
    0, 0, 2 / depth, 0,
    -(camera.right + camera.left) / width,
    -(camera.top + camera.bottom) / height,
    (camera.far + camera.near) / depth,
    1,
  ];
}

/** Applies `matrix` to `(position.x, position.y, position.z, 1)`. */
export function transformPoint(matrix: Mat4, position: Vec3): Vec4 {
  const { x, y, z } = position;
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  };
}

/**
 * Perspective or orthographic NDC. Points with `clip.w <= 0` are behind the
 * camera and are not divided. The result is not quantized.
 */
export function projectToNdc(
  camera: PerspectiveCamera | OrthographicCamera,
  view: Mat4,
  world: Mat4,
  position: Vec3,
): Vec3 {
  const projection = "fovY" in camera ? perspective(camera) : orthographic(camera);
  const clip = transformPoint(multiply(projection, multiply(view, world)), position);
  if (clip.w <= 0) {
    throw new Error("point is behind the camera");
  }
  return {
    x: clip.x / clip.w,
    y: clip.y / clip.w,
    z: clip.z / clip.w,
  };
}

/** SVG viewport. Y grows downward. Does not build an SVG string. */
export function viewportMap(ndc: Vec3, width: number, height: number): Vec2 {
  return {
    x: (ndc.x * 0.5 + 0.5) * width,
    y: (ndc.y * -0.5 + 0.5) * height,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < SINGULAR) {
    throw new Error("zero length vector");
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}
