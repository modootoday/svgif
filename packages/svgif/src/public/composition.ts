/**
 * `composition`, `renderFrame` and `compile` over the engine.
 * A composition draws one scene through one camera. To sample a frame, the
 * authored transforms are saved, every sequence that covers the frame runs
 * its body inside the sampler context, the posed objects become scene nodes,
 * and the authored transforms are restored. Frames do not leak into each other.
 * `renderFrame` is the bake module's C8. `compile` bakes Timeline IR and
 * calls the lowering compile (C4), which is not a public name.
 * [[sot:svgif/public-api]] rules 1, 4 and 5. [[sot:svgif/architecture]]
 */

import { BACKENDS } from "../backend/capability.ts";
import { bake, renderFrame as bakeRenderFrame, type BakeMotion, type BakeResult, type BakeScene, type NodePose } from "../bake/index.ts";
import { parseColor } from "../ir/color.ts";
import { compile as compileIr } from "../lower/index.ts";
import type { Mat4, Vec3 } from "../math/index.ts";
import {
  evaluateWorld,
  groupNode,
  meshNode,
  orthographicCameraNode,
  path3Node,
  perspectiveCameraNode,
  type NodeOptions,
  type SceneNode,
} from "../scene/index.ts";
import type { Rgb, ShadeLights, ShadeMaterial } from "../shade/index.ts";
import type {
  CameraInstance,
  CompileArtifact,
  CompileOptions,
  Composition,
  CompositionOptions,
  SceneInstance,
  Sequence,
} from "../public-types.ts";
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  Node3,
  OrthographicCamera,
  Path3,
  PerspectiveCamera,
  Scene,
} from "./objects.ts";
import { withSampler } from "./sampler.ts";

const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Used when the scene has no light: ambient 0.2 and one light along +Z of 0.8.
 * A face that looks straight at +Z then shows its fill unchanged.
 */
const DEFAULT_LIGHTS: ShadeLights = {
  ambient: { r: 0.2, g: 0.2, b: 0.2 },
  directional: [{ direction: { x: 0, y: 0, z: 1 }, diffuse: { r: 0.8, g: 0.8, b: 0.8 } }],
};
const DEFAULT_FILL = "#ffffff";

interface SequenceEntry extends Sequence {
  readonly body: () => void;
}

class PublicComposition implements Composition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
  readonly scene: SceneInstance;
  readonly camera: CameraInstance;
  readonly #entries: SequenceEntry[] = [];

  constructor(options: CompositionOptions) {
    if (options === null || typeof options !== "object") throw new TypeError("composition expects options");
    if (typeof options.id !== "string" || options.id.length === 0) throw new TypeError("id must be a non-empty string");
    positive(options.width, "width");
    positive(options.height, "height");
    integerAtLeast(options.fps, 1, "fps");
    integerAtLeast(options.durationInFrames, 1, "durationInFrames");
    if (!(options.scene instanceof Scene)) throw new TypeError("scene must be an svgif.Scene");
    if (!(options.camera instanceof PerspectiveCamera) && !(options.camera instanceof OrthographicCamera)) {
      throw new TypeError("camera must be an svgif.PerspectiveCamera or svgif.OrthographicCamera");
    }
    this.id = options.id;
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps;
    this.durationInFrames = options.durationInFrames;
    this.scene = options.scene;
    this.camera = options.camera;
  }

  get sequences(): readonly Sequence[] {
    return this.#entries.map((entry) => Object.freeze({ fromFrame: entry.fromFrame, durationInFrames: entry.durationInFrames }));
  }

  sequence(fromFrame: number, durationInFrames: number, body: () => void): void {
    integerAtLeast(fromFrame, 0, "fromFrame");
    integerAtLeast(durationInFrames, 1, "durationInFrames");
    if (typeof body !== "function") throw new TypeError("sequence body must be a function");
    this.#entries.push({ fromFrame, durationInFrames, body });
  }

  /** Internal. Sequences with their bodies, in insertion order. */
  get entries(): readonly SequenceEntry[] {
    return this.#entries;
  }
}

export function composition(options: CompositionOptions): Composition {
  return new PublicComposition(options);
}

function own(value: Composition): PublicComposition {
  if (!(value instanceof PublicComposition)) throw new TypeError("expected a composition from svgif.composition");
  return value;
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

interface Snapshot {
  node: Node3;
  values: number[];
}

/** The scene and the camera subtree when the camera is not in the scene. */
function roots(target: PublicComposition): Node3[] {
  const scene = target.scene as Scene;
  const camera = target.camera as unknown as Node3;
  return contains(scene, camera) ? [scene] : [scene, camera];
}

function contains(root: Node3, target: Node3): boolean {
  if (root === target) return true;
  return root.childNodes.some((child) => contains(child, target));
}

function walk(node: Node3, visit: (node: Node3) => void): void {
  visit(node);
  for (const child of node.childNodes) walk(child, visit);
}

function snapshot(nodes: readonly Node3[]): Snapshot[] {
  const out: Snapshot[] = [];
  for (const root of nodes) {
    walk(root, (node) => {
      const { position: p, rotation: r, scale: s } = node;
      out.push({ node, values: [p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z] });
    });
  }
  return out;
}

function restore(saved: readonly Snapshot[]): void {
  for (const { node, values } of saved) {
    node.position.set(values[0], values[1], values[2]);
    node.rotation.set(values[3], values[4], values[5]);
    node.scale.set(values[6], values[7], values[8]);
  }
}

/** Pose every object for `frame`, call `read`, then put the authored transforms back. */
function atFrame<T>(target: PublicComposition, frame: number, read: () => T): T {
  const saved = snapshot(roots(target));
  try {
    for (const entry of target.entries) {
      if (frame < entry.fromFrame || frame >= entry.fromFrame + entry.durationInFrames) continue;
      withSampler(
        { frame, fps: target.fps, fromFrame: entry.fromFrame, durationInFrames: entry.durationInFrames },
        entry.body,
      );
    }
    return read();
  } finally {
    restore(saved);
  }
}

// ---------------------------------------------------------------------------
// Scene nodes
// ---------------------------------------------------------------------------

interface Built {
  root: SceneNode;
  ids: Map<Node3, string>;
  cameraId: string;
}

/** Author id when set, otherwise `n` plus the child-index path from the drawn root. */
function assignIds(target: PublicComposition): Map<Node3, string> {
  const ids = new Map<Node3, string>();
  const used = new Set<string>();
  const visit = (node: Node3, path: readonly number[]): void => {
    const author = node.id;
    let id: string;
    if (author !== undefined && author.length > 0) {
      if (typeof author !== "string" || !ID_RE.test(author)) throw new Error(`object id "${String(author)}" cannot form a stable selector`);
      id = author;
    } else {
      id = `n${path.join("-")}`;
    }
    if (used.has(id)) throw new Error(`object id "${id}" is duplicated`);
    used.add(id);
    ids.set(node, id);
    node.childNodes.forEach((child, index) => visit(child, path.concat(index)));
  };
  roots(target).forEach((root, index) => visit(root, [index]));
  return ids;
}

function nodeOptions(node: Node3, id: string, children: SceneNode[]): NodeOptions {
  return {
    id,
    transform: {
      position: { x: node.position.x, y: node.position.y, z: node.position.z },
      eulerXYZ: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
      scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
    },
    children,
  };
}

function toSceneNode(node: Node3, ids: ReadonlyMap<Node3, string>): SceneNode {
  const id = ids.get(node);
  if (id === undefined) throw new Error("object was added while sampling");
  const options = nodeOptions(
    node,
    id,
    node.childNodes.map((child) => toSceneNode(child, ids)),
  );
  if (node instanceof Mesh) return meshNode(node.geometry.mesh, options);
  if (node instanceof Path3) return path3Node(node.path, options);
  if (node instanceof PerspectiveCamera) {
    return perspectiveCameraNode(
      { fovY: (node.fovY * Math.PI) / 180, aspect: node.aspect, near: node.near, far: node.far },
      options,
    );
  }
  if (node instanceof OrthographicCamera) {
    return orthographicCameraNode(
      { left: node.left, right: node.right, top: node.top, bottom: node.bottom, near: node.near, far: node.far },
      options,
    );
  }
  // Scene, Group, Shape and lights carry a transform and children only.
  return groupNode(options);
}

function build(target: PublicComposition, ids: ReadonlyMap<Node3, string>): Built {
  const cameraId = ids.get(target.camera as unknown as Node3);
  if (cameraId === undefined) throw new Error("camera is missing");
  return {
    root: groupNode({ children: roots(target).map((root) => toSceneNode(root, ids)) }),
    ids: new Map(ids),
    cameraId,
  };
}

// ---------------------------------------------------------------------------
// Material and lights
// ---------------------------------------------------------------------------

function linearColor(color: string, label: string): Rgb {
  const channels = parseColor(color);
  if (channels === null || (channels.length !== 3 && channels.length !== 4)) {
    throw new Error(`${label} must be a hex color such as #e8ff47`);
  }
  const decode = (byte: number): number => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return { r: decode(channels[0]), g: decode(channels[1]), b: decode(channels[2]) };
}

function material(target: PublicComposition): ShadeMaterial {
  const fills = new Set<string>();
  walk(target.scene as Scene, (node) => {
    if (node instanceof Mesh) fills.add((node.material.fill ?? DEFAULT_FILL).toLowerCase());
  });
  if (fills.size > 1) throw new Error("meshes with different fills in one composition are not supported yet");
  const fill = fills.values().next().value ?? DEFAULT_FILL;
  return { albedo: linearColor(fill, "fill") };
}

function translation(world: Mat4): Vec3 {
  return { x: world[12], y: world[13], z: world[14] };
}

/** Lights from the authored scene. A directional light shines from its world position toward the origin. */
function lights(target: PublicComposition, built: Built): ShadeLights {
  const worlds = new Map(evaluateWorld(built.root).map((entry) => [entry.stableId, entry.world]));
  const ambient: Rgb = { r: 0, g: 0, b: 0 };
  const directional: ShadeLights["directional"][number][] = [];
  let found = false;
  walk(target.scene as Scene, (node) => {
    if (node instanceof AmbientLight) {
      found = true;
      const color = linearColor(node.color, "light color");
      ambient.r += color.r * node.intensity;
      ambient.g += color.g * node.intensity;
      ambient.b += color.b * node.intensity;
    } else if (node instanceof DirectionalLight) {
      found = true;
      const color = linearColor(node.color, "light color");
      const world = worlds.get(built.ids.get(node) ?? "");
      if (world === undefined) throw new Error("light is missing");
      directional.push({
        direction: translation(world),
        diffuse: { r: color.r * node.intensity, g: color.g * node.intensity, b: color.b * node.intensity },
      });
    }
  });
  if (!found) return DEFAULT_LIGHTS;
  if (directional.length > 2) throw new Error("one composition takes at most two directional lights");
  // Shading needs one directional light. A black one adds nothing.
  if (directional.length === 0) directional.push({ direction: { x: 0, y: 0, z: 1 }, diffuse: { r: 0, g: 0, b: 0 } });
  return { ambient, directional };
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

function bakeScene(target: PublicComposition, root: SceneNode, built: Built): BakeScene {
  return {
    fps: target.fps,
    width: target.width,
    height: target.height,
    durationInFrames: target.durationInFrames,
    root,
    cameraId: built.cameraId,
    material: material(target),
    lights: lights(target, built),
  };
}

/** One SVG document for an integer frame. Frames outside the composition clamp to its ends. */
export function renderFrame(value: Composition, frame: number): string {
  const target = own(value);
  if (typeof frame !== "number" || !Number.isInteger(frame)) throw new TypeError("frame must be an integer");
  const index = Math.min(Math.max(frame, 0), target.durationInFrames - 1);
  const ids = assignIds(target);
  const authored = build(target, ids);
  const posed = atFrame(target, index, () => build(target, ids).root);
  return bakeRenderFrame(bakeScene(target, posed, authored), index);
}

function local(node: Node3): NodePose {
  return {
    position: { x: node.position.x, y: node.position.y, z: node.position.z },
    eulerXYZ: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
    scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
  };
}

/** Bake every frame of the composition into Timeline IR. */
export function bakeComposition(value: Composition): BakeResult {
  const target = own(value);
  const ids = assignIds(target);
  const authored = build(target, ids);
  let cachedFrame = -1;
  let cached = new Map<string, NodePose>();
  const posesAt = (frame: number): Map<string, NodePose> => {
    if (frame !== cachedFrame) {
      cached = atFrame(target, frame, () => {
        const poses = new Map<string, NodePose>();
        for (const [node, id] of ids) poses.set(id, local(node));
        return poses;
      });
      cachedFrame = frame;
    }
    return cached;
  };
  const motions: BakeMotion[] = [...ids.values()].map((nodeId) => ({
    nodeId,
    at(frame: number): NodePose {
      const pose = posesAt(frame).get(nodeId);
      if (pose === undefined) throw new Error("posed object is missing");
      return pose;
    },
  }));
  return bake({ ...bakeScene(target, authored.root, authored), motions });
}

/** Bake the composition to Timeline IR, then lower and compile it for one backend. */
export function compile(value: Composition, options: CompileOptions): CompileArtifact {
  if (options === null || typeof options !== "object") throw new TypeError("compile expects options");
  if (!(BACKENDS as readonly string[]).includes(options.backend)) {
    throw new TypeError("compile backend must be css-external, css-embedded, or smil");
  }
  const { ir } = bakeComposition(value);
  const compiled = compileIr(ir, options.backend);
  return compiled.css === undefined ? { svg: compiled.svg } : { svg: compiled.svg, css: compiled.css };
}

function integerAtLeast(value: number, min: number, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new TypeError(`${label} must be an integer of ${min} or greater`);
  }
}

function positive(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) {
    throw new TypeError(`${label} must be a positive number`);
  }
}
