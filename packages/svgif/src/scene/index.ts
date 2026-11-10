/**
 * Scene graph. A node stores `position`, a `quaternion`, and `scale`.
 * The world matrix is the parent world matrix times the local matrix,
 * visited depth-first so a parent is known before its children.
 * Mesh positions stay in the node's own space. `project.ts` writes the SVG
 * paths. This file does not build a fill. Matrix numbers stay in IEEE-754.
 * [[sot:svgif/scene-3d]]
 */

import {
  compose,
  identity,
  invert,
  multiply,
  quaternionFromEulerXYZ,
  type Mat4,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Quat,
  type Vec3,
} from "../math/index.ts";
import type { Path3, TriangleMesh } from "./mesh.ts";

export {
  boxGeometry,
  extrudeGeometry,
  latheGeometry,
  parametricGeometry,
  path3,
  sphereGeometry,
  torusGeometry,
  SPHERE_HEIGHT_SEGMENTS,
  SPHERE_WIDTH_SEGMENTS,
  TORUS_RADIAL_SEGMENTS,
  TORUS_TUBULAR_SEGMENTS,
} from "./mesh.ts";
export type { ExtrudeOptions, MeshPrimitive, MeshSegments, Path3, TriangleMesh } from "./mesh.ts";
export { poseCamera } from "./camera.ts";
export type { CameraFrame } from "./camera.ts";
export { mapClipToViewport, projectScene } from "./project.ts";
export type { ProjectionOptions } from "./project.ts";

export interface NodeTransform {
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
}

/** Author input. Euler is intrinsic XYZ radians and is stored as a quaternion. */
export interface TransformInput {
  position?: Vec3;
  quaternion?: Quat;
  eulerXYZ?: Vec3;
  scale?: Vec3;
}

export type SceneKind = "group" | "perspective-camera" | "orthographic-camera" | "mesh" | "path3";

interface SceneNodeBase {
  id?: string;
  children?: SceneNode[];
  transform: NodeTransform;
  kind: SceneKind;
}

export interface GroupNode extends SceneNodeBase {
  kind: "group";
}

export interface PerspectiveCameraNode extends SceneNodeBase {
  kind: "perspective-camera";
  camera: PerspectiveCamera;
}

export interface OrthographicCameraNode extends SceneNodeBase {
  kind: "orthographic-camera";
  camera: OrthographicCamera;
}

export interface MeshNode extends SceneNodeBase {
  kind: "mesh";
  geometry: TriangleMesh;
}

export interface Path3Node extends SceneNodeBase {
  kind: "path3";
  path: Path3;
}

export type SceneNode =
  | GroupNode
  | PerspectiveCameraNode
  | OrthographicCameraNode
  | MeshNode
  | Path3Node;

export interface EvaluatedNode {
  node: SceneNode;
  /** Author id, or `n0/n2` child indexes from this evaluation root. */
  stableId: string;
  /** `s-` plus `stableId` when that id is non-empty. */
  selectorId?: string;
  local: Mat4;
  world: Mat4;
  /** Inverse of `world` for a camera. The camera looks down local -Z. */
  view?: Mat4;
}

export interface NodeOptions {
  id?: string;
  transform?: TransformInput;
  children?: SceneNode[];
}

const SCENE_KINDS: readonly SceneKind[] = [
  "group",
  "perspective-camera",
  "orthographic-camera",
  "mesh",
  "path3",
];

const MESH_PRIMITIVES: readonly string[] = ["box", "sphere", "torus", "extrude", "lathe", "parametric"];

export function nodeTransform(input: TransformInput = {}): NodeTransform {
  if (input.quaternion !== undefined && input.eulerXYZ !== undefined) {
    throw new Error("stored orientation is a quaternion");
  }
  if (input.eulerXYZ !== undefined) {
    assertVec3(input.eulerXYZ, "Euler");
  }
  const quaternion = input.quaternion
    ? copyQuat(input.quaternion)
    : input.eulerXYZ
      ? quaternionFromEulerXYZ(input.eulerXYZ)
      : { x: 0, y: 0, z: 0, w: 1 };
  const transform: NodeTransform = {
    position: copyVec3(input.position, { x: 0, y: 0, z: 0 }),
    quaternion,
    scale: copyVec3(input.scale, { x: 1, y: 1, z: 1 }),
  };
  assertTransform(transform);
  return transform;
}

export function groupNode(options: NodeOptions = {}): GroupNode {
  return {
    kind: "group",
    id: options.id,
    transform: nodeTransform(options.transform),
    children: copyChildren(options.children),
  };
}

export function perspectiveCameraNode(
  camera: PerspectiveCamera,
  options: NodeOptions = {},
): PerspectiveCameraNode {
  assertPerspective(camera);
  return {
    kind: "perspective-camera",
    id: options.id,
    transform: nodeTransform(options.transform),
    camera: {
      fovY: camera.fovY,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
    },
    children: copyChildren(options.children),
  };
}

export function orthographicCameraNode(
  camera: OrthographicCamera,
  options: NodeOptions = {},
): OrthographicCameraNode {
  assertOrthographic(camera);
  return {
    kind: "orthographic-camera",
    id: options.id,
    transform: nodeTransform(options.transform),
    camera: {
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      near: camera.near,
      far: camera.far,
    },
    children: copyChildren(options.children),
  };
}

export function isPerspectiveCameraNode(node: SceneNode): node is PerspectiveCameraNode {
  return node.kind === "perspective-camera";
}

export function isOrthographicCameraNode(node: SceneNode): node is OrthographicCameraNode {
  return node.kind === "orthographic-camera";
}

export function isMeshNode(node: SceneNode): node is MeshNode {
  return node.kind === "mesh";
}

export function isPath3Node(node: SceneNode): node is Path3Node {
  return node.kind === "path3";
}

export function meshNode(geometry: TriangleMesh, options: NodeOptions = {}): MeshNode {
  return {
    kind: "mesh",
    id: options.id,
    transform: nodeTransform(options.transform),
    geometry: copyTriangleMesh(geometry),
    children: copyChildren(options.children),
  };
}

export function path3Node(path: Path3, options: NodeOptions = {}): Path3Node {
  return {
    kind: "path3",
    id: options.id,
    transform: nodeTransform(options.transform),
    path: copyPath3(path),
    children: copyChildren(options.children),
  };
}

/** `T * R * S`. The stored orientation is `transform.quaternion`. */
export function localMatrix(transform: NodeTransform): Mat4 {
  assertTransform(transform);
  return compose(transform.position, transform.quaternion, transform.scale);
}

/**
 * Stable id. An author id wins. Otherwise the id is the child-index path
 * from the evaluation root, `n0/n2/n1`. The root path is empty.
 */
export function stableId(authorId: string | undefined, indexPath: readonly number[]): string {
  if (authorId !== undefined && authorId.length > 0) return authorId;
  if (indexPath.length === 0) return "";
  return indexPath.map((index) => `n${index}`).join("/");
}

/** CSS and SMIL id. The prefix is `s-` plus the stable id. */
export function selectorId(id: string): string {
  if (id.length === 0) throw new Error("stable id is empty");
  return `s-${id}`;
}

/**
 * Depth-first world matrices. `world = parentWorld * local`.
 * `parentWorld` defaults to the identity. Numbers are not quantized.
 */
export function evaluateWorld(root: SceneNode, parentWorld: Mat4 = identity()): EvaluatedNode[] {
  const out: EvaluatedNode[] = [];
  visit(root, parentWorld, [], out);
  return out;
}

function visit(
  node: SceneNode,
  parentWorld: Mat4,
  indexPath: number[],
  out: EvaluatedNode[],
): void {
  assertNode(node);
  const local = localMatrix(node.transform);
  const world = multiply(parentWorld, local);
  const id = stableId(node.id, indexPath);
  const evaluated: EvaluatedNode = {
    node,
    stableId: id,
    local,
    world,
  };
  if (id.length > 0) evaluated.selectorId = selectorId(id);
  if (isPerspectiveCameraNode(node) || isOrthographicCameraNode(node)) {
    evaluated.view = invert(world);
  }
  out.push(evaluated);
  const children = childrenOf(node);
  for (let index = 0; index < children.length; index++) {
    visit(children[index], world, indexPath.concat(index), out);
  }
}

function assertNode(node: SceneNode): void {
  if (!node || typeof node !== "object") throw new Error("node is missing");
  if (!SCENE_KINDS.includes(node.kind)) throw new Error("node kind is not a scene kind");
  if (!node.transform) throw new Error("node is missing a transform");
  assertTransform(node.transform);
  if (node.kind === "perspective-camera") assertPerspective(node.camera);
  if (node.kind === "orthographic-camera") assertOrthographic(node.camera);
  if (node.kind === "mesh") assertTriangleMesh(node.geometry);
  if (node.kind === "path3") assertPath3(node.path);
  childrenOf(node);
}

function assertTransform(transform: NodeTransform): void {
  assertVec3(transform.position, "position");
  assertQuat(transform.quaternion);
  assertVec3(transform.scale, "scale");
}

function assertPerspective(camera: PerspectiveCamera | undefined): void {
  if (!camera) throw new Error("perspective camera is missing its fields");
  const values = [camera.fovY, camera.aspect, camera.near, camera.far];
  if (!values.every((value) => Number.isFinite(value))) {
    throw new Error("perspective camera has a non-finite number");
  }
}

function assertOrthographic(camera: OrthographicCamera | undefined): void {
  if (!camera) throw new Error("orthographic camera is missing its fields");
  const values = [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far];
  if (!values.every((value) => Number.isFinite(value))) {
    throw new Error("orthographic camera has a non-finite number");
  }
}

function assertTriangleMesh(geometry: TriangleMesh | undefined): asserts geometry is TriangleMesh {
  if (!geometry || !MESH_PRIMITIVES.includes(geometry.primitive)) {
    throw new Error("mesh primitive is not a v1 primitive");
  }
  if (!Array.isArray(geometry.positions) || geometry.positions.length === 0) {
    throw new Error("mesh is missing its positions");
  }
  for (const position of geometry.positions) assertVec3(position, "mesh position");
  if (!Array.isArray(geometry.faces) || geometry.faces.length === 0) {
    throw new Error("mesh is missing its faces");
  }
  for (const face of geometry.faces) {
    if (!face || face.length !== 3) throw new Error("face is not a triangle");
    for (const index of face) {
      if (!Number.isInteger(index) || index < 0 || index >= geometry.positions.length) {
        throw new Error("face index is out of range");
      }
    }
  }
}

function assertPath3(path: Path3 | undefined): asserts path is Path3 {
  if (!path || path.primitive !== "path3") throw new Error("path3 primitive is missing");
  if (!Array.isArray(path.points) || path.points.length < 2) {
    throw new Error("path3 is missing its points");
  }
  if (typeof path.closed !== "boolean") throw new Error("path3 closed is not a boolean");
  for (const point of path.points) assertVec3(point, "path3 point");
}

function copyTriangleMesh(geometry: TriangleMesh): TriangleMesh {
  assertTriangleMesh(geometry);
  return {
    primitive: geometry.primitive,
    positions: geometry.positions.map((position) => ({ x: position.x, y: position.y, z: position.z })),
    faces: geometry.faces.map((face) => [face[0], face[1], face[2]]),
    segments: { ...geometry.segments },
  };
}

function copyPath3(path: Path3): Path3 {
  assertPath3(path);
  return {
    primitive: "path3",
    points: path.points.map((point) => ({ x: point.x, y: point.y, z: point.z })),
    closed: path.closed,
  };
}

function childrenOf(node: SceneNode): SceneNode[] {
  if (node.children === undefined) return [];
  if (!Array.isArray(node.children)) throw new Error("children is not a list");
  return node.children;
}

function copyChildren(children: SceneNode[] | undefined): SceneNode[] {
  if (children === undefined) return [];
  if (!Array.isArray(children)) throw new Error("children is not a list");
  return children.slice();
}

function copyVec3(value: Vec3 | undefined, fallback: Vec3): Vec3 {
  const source = value ?? fallback;
  return { x: source.x, y: source.y, z: source.z };
}

function copyQuat(value: Quat): Quat {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function assertVec3(value: Vec3 | undefined, label: string): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new Error(`${label} has a non-finite number`);
  }
}

function assertQuat(value: Quat | undefined): void {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z) ||
    !Number.isFinite(value.w)
  ) {
    throw new Error("quaternion has a non-finite number");
  }
}
