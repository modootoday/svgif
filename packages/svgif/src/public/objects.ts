/**
 * Public scene, camera, light and geometry classes.
 * They are thin author-facing wrappers. Geometry calls the mesh builders in
 * `scene/mesh.ts`. `public/composition.ts` turns these objects into the scene
 * nodes of `scene/index.ts` at each sampled frame.
 * [[sot:svgif/public-api]] rule 7. [[sot:svgif/scene-3d]]
 */

import type { Vec2, Vec3 } from "../math/index.ts";
import {
  boxGeometry,
  extrudeGeometry,
  latheGeometry,
  parametricGeometry,
  path3,
  sphereGeometry,
  torusGeometry,
  type MeshPrimitive,
  type Path3 as Path3Data,
  type TriangleMesh,
} from "../scene/mesh.ts";
import type {
  AmbientLightInstance,
  DirectionalLightInstance,
  ExtrudeGeometryOptions,
  GeometryInstance,
  GroupInstance,
  LightOptions,
  MeshInstance,
  MeshMaterial,
  MutableEuler,
  MutableVec3,
  OrthographicCameraInstance,
  Path3Instance,
  PerspectiveCameraInstance,
  SceneInstance,
  SceneObject,
  ShapeInstance,
} from "../public-types.ts";

class Triple implements MutableVec3, MutableEuler {
  x: number;
  y: number;
  z: number;

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}

/** Common base of every public scene object. Not a public name. */
export class Node3 implements SceneObject {
  id?: string;
  readonly position: Triple = new Triple(0, 0, 0);
  /** Intrinsic XYZ Euler angles in radians. */
  readonly rotation: Triple = new Triple(0, 0, 0);
  readonly scale: Triple = new Triple(1, 1, 1);
  #children: Node3[] = [];
  #parent: Node3 | undefined;

  get children(): readonly SceneObject[] {
    return this.#children.slice();
  }

  /** Parent object, or `undefined` for a root. */
  get parent(): Node3 | undefined {
    return this.#parent;
  }

  add(...children: SceneObject[]): this {
    for (const child of children) {
      if (!(child instanceof Node3)) throw new TypeError("add expects an svgif scene object");
      if (child === this) throw new Error("an object cannot be its own child");
      for (let up: Node3 | undefined = this; up !== undefined; up = up.#parent) {
        if (up === child) throw new Error("an object cannot be added below itself");
      }
      const previous = child.#parent;
      if (previous !== undefined) previous.#children = previous.#children.filter((item) => item !== child);
      child.#parent = this;
      this.#children.push(child);
    }
    return this;
  }

  /** Child objects in insertion order. Internal view of `children`. */
  get childNodes(): readonly Node3[] {
    return this.#children;
  }
}

export class Scene extends Node3 implements SceneInstance {}

export class Group extends Node3 implements GroupInstance {}

export class Mesh extends Node3 implements MeshInstance {
  readonly geometry: GeometryInstance;
  readonly material: MeshMaterial;

  constructor(geometry: GeometryInstance, material: MeshMaterial = {}) {
    super();
    if (!geometry || typeof geometry !== "object" || !geometry.mesh) throw new TypeError("Mesh expects a geometry");
    if (material === null || typeof material !== "object") throw new TypeError("material must be an object");
    if (material.fill !== undefined && typeof material.fill !== "string") throw new TypeError("fill must be a string");
    this.geometry = geometry;
    this.material = { ...material };
  }
}

export class Path3 extends Node3 implements Path3Instance {
  readonly path: Path3Data;

  constructor(points: readonly Vec3[], closed = false) {
    super();
    this.path = path3(points, closed);
  }
}

/** 2D shape. Points are in the composition's 2D space. */
export class Shape extends Node3 implements ShapeInstance {
  readonly points: readonly Vec2[];
  readonly closed: boolean;

  constructor(points: readonly Vec2[], closed = false) {
    super();
    if (!Array.isArray(points) || points.length < 2) throw new Error("shape needs two points");
    if (typeof closed !== "boolean") throw new TypeError("shape closed is not a boolean");
    this.points = points.map((point, index) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error(`shape point ${index} has a non-finite number`);
      }
      return { x: point.x, y: point.y };
    });
    this.closed = closed;
  }
}

/** `fovY` is the vertical field of view in degrees. */
export class PerspectiveCamera extends Node3 implements PerspectiveCameraInstance {
  fovY: number;
  aspect: number;
  near: number;
  far: number;

  constructor(fovY: number, aspect: number, near: number, far: number) {
    super();
    this.fovY = fovY;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }
}

export class OrthographicCamera extends Node3 implements OrthographicCameraInstance {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;

  constructor(left: number, right: number, top: number, bottom: number, near: number, far: number) {
    super();
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
    this.near = near;
    this.far = far;
  }
}

function lightColor(options: LightOptions | undefined): { color: string; intensity: number } {
  if (options !== undefined && (options === null || typeof options !== "object")) {
    throw new TypeError("light options must be an object");
  }
  const color = options?.color ?? "#ffffff";
  const intensity = options?.intensity ?? 1;
  if (typeof color !== "string") throw new TypeError("light color must be a string");
  if (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity < 0) {
    throw new RangeError("light intensity must be a finite number of 0 or more");
  }
  return { color, intensity };
}

export class AmbientLight extends Node3 implements AmbientLightInstance {
  color: string;
  intensity: number;

  constructor(options?: LightOptions) {
    super();
    const light = lightColor(options);
    this.color = light.color;
    this.intensity = light.intensity;
  }
}

/** Shines from its world position toward the origin. The default position is `(0, 0, 1)`. */
export class DirectionalLight extends Node3 implements DirectionalLightInstance {
  color: string;
  intensity: number;

  constructor(options?: LightOptions) {
    super();
    const light = lightColor(options);
    this.color = light.color;
    this.intensity = light.intensity;
    this.position.set(0, 0, 1);
  }
}

class Geometry implements GeometryInstance {
  readonly primitive: MeshPrimitive;
  readonly mesh: TriangleMesh;

  protected constructor(mesh: TriangleMesh) {
    this.primitive = mesh.primitive;
    this.mesh = mesh;
  }
}

export class BoxGeometry extends Geometry {
  constructor(width?: number, height?: number, depth?: number) {
    super(boxGeometry(width, height, depth));
  }
}

export class SphereGeometry extends Geometry {
  constructor(radius?: number, widthSegments?: number, heightSegments?: number) {
    super(sphereGeometry(radius, widthSegments, heightSegments));
  }
}

export class TorusGeometry extends Geometry {
  constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number) {
    super(torusGeometry(radius, tube, radialSegments, tubularSegments));
  }
}

export class ExtrudeGeometry extends Geometry {
  constructor(profile: readonly Vec2[], options: ExtrudeGeometryOptions) {
    super(extrudeGeometry(profile, options));
  }
}

export class LatheGeometry extends Geometry {
  constructor(profile: readonly Vec2[], segments: number) {
    super(latheGeometry(profile, segments));
  }
}

export class ParametricGeometry extends Geometry {
  constructor(sample: (u: number, v: number) => Vec3, segmentsU: number, segmentsV: number) {
    super(parametricGeometry(sample, segmentsU, segmentsV));
  }
}
