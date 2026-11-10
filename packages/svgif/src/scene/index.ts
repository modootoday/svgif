/**
 * Scene graph. A node stores `position`, a `quaternion`, and `scale`.
 * The world matrix is the parent world matrix times the local matrix,
 * visited depth-first so a parent is known before its children.
 * This module does not project triangles. Matrix numbers stay in IEEE-754.
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

export type SceneKind = "group" | "perspective-camera" | "orthographic-camera";

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

export type SceneNode = GroupNode | PerspectiveCameraNode | OrthographicCameraNode;

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

const SCENE_KINDS: readonly SceneKind[] = ["group", "perspective-camera", "orthographic-camera"];

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
