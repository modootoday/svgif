/**
 * Bake 3D motion to per-frame 2D path and fill keys.
 * Each integer frame poses the scene, projects, culls, and shades.
 * A dolly sets camera depth. An orbit sets camera azimuth.
 * Both run before the same projection. The shade pass culls and sorts.
 * There is no second projector and no BSP.
 * The IR stores `attr.d`, `attr.fill`, and `attr.opacity`.
 * It has no camera and it does not write `matrix3d`.
 * `renderFrame` returns one SVG document for that frame.
 * A budget overage is a diagnostic. It does not throw.
 * [[adr:svgif/20261110120400]] [[sot:svgif/determinism]] [[sot:svgif/scene-3d]]
 */

import { formatUnit } from "../ir/quantize.ts";
import type { IrKey, TimelineIr } from "../ir/types.ts";
import {
  multiply,
  orthographic,
  perspective,
  transformPoint,
  type Mat4,
  type Quat,
  type Vec3,
  type Vec4,
} from "../math/index.ts";
import {
  evaluateWorld,
  groupNode,
  isMeshNode,
  isOrthographicCameraNode,
  isPath3Node,
  isPerspectiveCameraNode,
  meshNode,
  orthographicCameraNode,
  path3Node,
  perspectiveCameraNode,
  poseCamera,
  type CameraFrame,
  type EvaluatedNode,
  type NodeOptions,
  type NodeTransform,
  type SceneNode,
  type TransformInput,
} from "../scene/index.ts";
import { facesAway, shadeTriangles, type ClipCorner, type ShadeFace, type ShadeLights, type ShadeMaterial } from "../shade/index.ts";

/** Path elements in one SVG document. Above this, bake records a diagnostic. */
const PATH_ELEMENT_BUDGET = 5000;
/** UTF-8 bytes of one SVG document. Above this, bake records a diagnostic. */
const SVG_BYTE_BUDGET = 2 * 1024 * 1024;
/** `durationInFrames` times baked face nodes. Above this, bake records a diagnostic. */
const BAKED_FRAME_NODE_BUDGET = 300;

const SELECTOR_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export interface NodePose {
  position?: Vec3;
  quaternion?: Quat;
  eulerXYZ?: Vec3;
  scale?: Vec3;
}

/** Local pose of one node at an integer frame. The scene graph stays put. */
export interface BakeMotion {
  nodeId: string;
  at(frame: number, fps: number): NodePose;
}

/** Per-frame camera depth and azimuth. Numbers may be constant or a function of the frame. */
export interface CameraMove {
  /** World point the camera looks at. The default is the origin. */
  target?: Vec3;
  /** Depth from `target`. */
  distance?: number | ((frame: number, fps: number) => number);
  /** Azimuth in radians around world +Y. 0 is +Z. Positive turns toward +X. */
  azimuth?: number | ((frame: number, fps: number) => number);
}

export interface BakeScene {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  root: SceneNode;
  cameraId?: string;
  material: ShadeMaterial;
  lights: ShadeLights;
  motions?: readonly BakeMotion[];
  /** Dolly and orbit. Applied to the selected camera after node poses, then the frame is projected again. */
  cameraMove?: CameraMove;
}

export interface BakeDiagnostic {
  code: "path-elements" | "svg-bytes" | "baked-frames";
  detail: string;
}

export interface BakeResult {
  ir: TimelineIr;
  /** Triangle count of the meshes that were baked. */
  triangles: number;
  diagnostics: BakeDiagnostic[];
}

interface MeshSlot {
  stableId: string;
  irPrefix: string;
  positions: readonly Vec3[];
  faces: ReadonlyArray<readonly [number, number, number]>;
}

interface FaceDraw {
  irId: string;
  selector: string;
  d: string;
  fill: string;
  opacity: 0 | 1;
}

interface FrameDraw {
  /** Painter order, far first. Culled faces are absent. */
  visible: FaceDraw[];
  /** Every mesh face, in node-id then face-index order. */
  faces: FaceDraw[];
}

interface ClipPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function renderFrame(scene: BakeScene, frame: number): string {
  const slots = assertScene(scene);
  const index = clampFrame(frame, scene.durationInFrames);
  return renderSvg(scene, drawFrame(scene, index, slots));
}

export function bake(scene: BakeScene): BakeResult {
  const slots = assertScene(scene);
  const frames: FrameDraw[] = [];
  const diagnostics: BakeDiagnostic[] = [];
  let triangles = 0;
  for (const slot of slots) triangles += slot.faces.length;
  for (let frame = 0; frame < scene.durationInFrames; frame += 1) {
    const drawn = drawFrame(scene, frame, slots);
    frames.push(drawn);
    noteSize(diagnostics, renderSvg(scene, drawn));
  }
  const faceNodes = frames[0]?.faces.length ?? 0;
  if (scene.durationInFrames * faceNodes > BAKED_FRAME_NODE_BUDGET) {
    note(diagnostics, "baked-frames", "baked frames times face nodes is above 300");
  }
  return { ir: timeline(scene, frames), triangles, diagnostics };
}

function assertScene(scene: BakeScene): MeshSlot[] {
  if (!scene || !Number.isInteger(scene.fps) || scene.fps < 1) throw new Error("fps is not a positive integer");
  if (!Number.isInteger(scene.durationInFrames) || scene.durationInFrames < 1) {
    throw new Error("duration is not a positive integer");
  }
  assertSize(scene.width, "width");
  assertSize(scene.height, "height");
  if (!scene.root) throw new Error("scene root is missing");
  const motions = scene.motions ?? [];
  const seen = new Set<string>();
  for (const motion of motions) {
    if (!motion || motion.nodeId.length === 0) throw new Error("motion node is missing");
    if (seen.has(motion.nodeId)) throw new Error("motion node is duplicated");
    seen.add(motion.nodeId);
  }
  const ids = new Set<string>();
  collectIds(scene.root, ids);
  for (const motion of motions) {
    if (!ids.has(motion.nodeId)) throw new Error("motion node is missing");
  }
  return meshSlots(scene.root);
}

function collectIds(node: SceneNode, into: Set<string>): void {
  if (node.id !== undefined && node.id.length > 0) into.add(node.id);
  for (const child of node.children ?? []) collectIds(child, into);
}

function meshSlots(root: SceneNode): MeshSlot[] {
  const slots: MeshSlot[] = [];
  for (const entry of evaluateWorld(root)) {
    if (!isMeshNode(entry.node)) continue;
    if (entry.stableId.length === 0) throw new Error("stable id is empty");
    const irPrefix = entry.stableId.replaceAll("/", "-");
    if (!SELECTOR_RE.test(irPrefix)) throw new Error("node id cannot form a stable selector");
    slots.push({
      stableId: entry.stableId,
      irPrefix,
      positions: entry.node.geometry.positions,
      faces: entry.node.geometry.faces,
    });
  }
  return slots;
}

function drawFrame(scene: BakeScene, frame: number, slots: readonly MeshSlot[]): FrameDraw {
  const posed = poseTree(scene.root, motionMap(scene), frame, scene.fps);
  const rigged = moveCamera(posed, scene, frame);
  const evaluated = evaluateWorld(rigged);
  const camera = selectCamera(evaluated, scene.cameraId);
  const projection = projectionMatrix(camera);
  const view = camera.view as Mat4;
  const byId = new Map(evaluated.map((entry) => [entry.stableId, entry]));
  const shadeFaces: ShadeFace[] = [];
  const projected = new Map<string, { d: string; drawable: boolean }>();

  for (const slot of slots) {
    const entry = byId.get(slot.stableId);
    if (entry === undefined) throw new Error("mesh is missing");
    const mvp = multiply(projection, multiply(view, entry.world));
    slot.faces.forEach((face, faceIndex) => {
      const irId = `${slot.irPrefix}-f${faceIndex}`;
      const clip = face.map((index) => transformPoint(mvp, slot.positions[index])) as [
        ClipPoint,
        ClipPoint,
        ClipPoint,
      ];
      const polygon = clipNearPolygon(clip);
      const drawable = polygon.length >= 3 && polygon.every((point) => point.w > 0);
      projected.set(irId, {
        d: drawable ? pathData(polygon, scene.width, scene.height) : "M 0 0 L 0 0 L 0 0 Z",
        drawable,
      });
      shadeFaces.push({
        nodeId: irId,
        faceIndex,
        clip,
        normal: faceNormal(entry.world, slot.positions, face),
      });
    });
  }

  const colored = shadeTriangles(shadeFaces.map(facingCopy), scene.material, scene.lights, {
    width: scene.width,
    height: scene.height,
  });
  const fillById = new Map(colored.map((face) => [face.nodeId, face.color]));
  const ordered = shadeTriangles(
    shadeFaces.filter((face) => {
      const path = projected.get(face.nodeId);
      return path?.drawable === true && !facesAway(face.clip);
    }),
    scene.material,
    scene.lights,
    { width: scene.width, height: scene.height },
  );

  const faces: FaceDraw[] = shadeFaces.map((face) => {
    const path = projected.get(face.nodeId);
    const visible = ordered.some((item) => item.nodeId === face.nodeId);
    return {
      irId: face.nodeId,
      selector: `s-${face.nodeId}`,
      d: path?.d ?? "M 0 0 L 0 0 L 0 0 Z",
      fill: fillById.get(face.nodeId) ?? "#000000",
      opacity: visible ? 1 : 0,
    };
  });
  const visible = ordered.map((item) => {
    const face = faces.find((entry) => entry.irId === item.nodeId);
    if (face === undefined) throw new Error("shaded face is missing");
    return { ...face, fill: item.color, opacity: 1 as const };
  });
  return { visible, faces };
}

/** A back face or an edge-on face is flipped so Lambert still has a color. */
function facingCopy(face: ShadeFace): ShadeFace {
  if (!facesAway(face.clip)) return face;
  return {
    nodeId: face.nodeId,
    faceIndex: face.faceIndex,
    normal: face.normal,
    clip: [face.clip[0], face.clip[2], face.clip[1]],
  };
}

function faceNormal(
  world: Mat4,
  positions: readonly Vec3[],
  face: readonly [number, number, number],
): Vec3 {
  const a = transformPoint(world, positions[face[0]]);
  const b = transformPoint(world, positions[face[1]]);
  const c = transformPoint(world, positions[face[2]]);
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  return {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
}

function timeline(scene: BakeScene, frames: readonly FrameDraw[]): TimelineIr {
  const sample = frames[0];
  const nodes = (sample?.faces ?? []).map((face) => ({
    id: face.irId,
    tracks: [
      { property: "attr.d", keys: keys(frames, face.irId, (item) => item.d) },
      { property: "attr.fill", keys: keys(frames, face.irId, (item) => item.fill) },
      { property: "attr.opacity", keys: keys(frames, face.irId, (item) => item.opacity) },
    ],
  }));
  return {
    fps: scene.fps,
    width: scene.width,
    height: scene.height,
    durationInFrames: scene.durationInFrames,
    nodes,
  };
}

function keys(frames: readonly FrameDraw[], irId: string, value: (face: FaceDraw) => IrKey["value"]): IrKey[] {
  return frames.map((frame, index) => {
    const face = frame.faces.find((item) => item.irId === irId);
    if (face === undefined) throw new Error("baked face is missing");
    return { frame: index, value: value(face) };
  });
}

function renderSvg(scene: BakeScene, drawn: FrameDraw): string {
  const w = formatUnit(scene.width);
  const h = formatUnit(scene.height);
  const body = drawn.visible
    .map(
      (face) =>
        `<path id="${escapeXml(face.selector)}" d="${escapeXml(face.d)}" fill="${escapeXml(face.fill)}"/>`,
    )
    .join("\n");
  const inner = body.length > 0 ? `${body}\n` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${inner}</svg>\n`;
}

function noteSize(diagnostics: BakeDiagnostic[], svg: string): void {
  const paths = svg.split("<path").length - 1;
  if (paths > PATH_ELEMENT_BUDGET) {
    note(diagnostics, "path-elements", "SVG path elements are above 5000");
  }
  if (utf8Bytes(svg) > SVG_BYTE_BUDGET) {
    note(diagnostics, "svg-bytes", "SVG text is above 2 MB");
  }
}

function note(diagnostics: BakeDiagnostic[], code: BakeDiagnostic["code"], detail: string): void {
  if (diagnostics.some((item) => item.code === code)) return;
  diagnostics.push({ code, detail });
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function motionMap(scene: BakeScene): ReadonlyMap<string, BakeMotion> {
  return new Map((scene.motions ?? []).map((motion) => [motion.nodeId, motion]));
}

function moveCamera(root: SceneNode, scene: BakeScene, frame: number): SceneNode {
  const move = scene.cameraMove;
  if (move === undefined) return root;
  if (move.distance === undefined && move.azimuth === undefined && move.target === undefined) return root;
  const evaluated = evaluateWorld(root);
  const camera = selectCamera(evaluated, scene.cameraId);
  const framePose: CameraFrame = { target: move.target };
  const distance = readMove(move.distance, frame, scene.fps);
  const azimuth = readMove(move.azimuth, frame, scene.fps);
  if (distance !== undefined) framePose.distance = distance;
  if (azimuth !== undefined) framePose.azimuth = azimuth;
  const pose = poseCamera(camera.node.transform, framePose);
  return replaceCamera(root, camera.node, pose);
}

function readMove(
  value: number | ((frame: number, fps: number) => number) | undefined,
  frame: number,
  fps: number,
): number | undefined {
  if (value === undefined) return undefined;
  const next = typeof value === "function" ? value(frame, fps) : value;
  if (typeof next !== "number") throw new Error("camera move is not a number");
  return next;
}

function replaceCamera(node: SceneNode, target: SceneNode, pose: NodeTransform): SceneNode {
  const transform = node === target ? pose : node.transform;
  const options: NodeOptions = {
    id: node.id,
    transform: {
      position: transform.position,
      quaternion: transform.quaternion,
      scale: transform.scale,
    },
    children: (node.children ?? []).map((child) => replaceCamera(child, target, pose)),
  };
  if (isMeshNode(node)) return meshNode(node.geometry, options);
  if (isPath3Node(node)) return path3Node(node.path, options);
  if (isPerspectiveCameraNode(node)) return perspectiveCameraNode(node.camera, options);
  if (isOrthographicCameraNode(node)) return orthographicCameraNode(node.camera, options);
  return groupNode(options);
}

function poseTree(node: SceneNode, motions: ReadonlyMap<string, BakeMotion>, frame: number, fps: number): SceneNode {
  const pose = node.id !== undefined && node.id.length > 0 ? motions.get(node.id)?.at(frame, fps) : undefined;
  const options: NodeOptions = {
    id: node.id,
    transform: poseInput(node, pose),
    children: (node.children ?? []).map((child) => poseTree(child, motions, frame, fps)),
  };
  if (isMeshNode(node)) return meshNode(node.geometry, options);
  if (isPath3Node(node)) return path3Node(node.path, options);
  if (isPerspectiveCameraNode(node)) return perspectiveCameraNode(node.camera, options);
  if (isOrthographicCameraNode(node)) return orthographicCameraNode(node.camera, options);
  return groupNode(options);
}

function poseInput(node: SceneNode, pose: NodePose | undefined): TransformInput {
  if (pose === undefined) {
    return {
      position: node.transform.position,
      quaternion: node.transform.quaternion,
      scale: node.transform.scale,
    };
  }
  if (pose.quaternion !== undefined && pose.eulerXYZ !== undefined) {
    throw new Error("stored orientation is a quaternion");
  }
  const input: TransformInput = {
    position: pose.position ?? node.transform.position,
    scale: pose.scale ?? node.transform.scale,
  };
  if (pose.quaternion !== undefined) input.quaternion = pose.quaternion;
  else if (pose.eulerXYZ !== undefined) input.eulerXYZ = pose.eulerXYZ;
  else input.quaternion = node.transform.quaternion;
  return input;
}

function projectionMatrix(entry: EvaluatedNode): Mat4 {
  if (isPerspectiveCameraNode(entry.node)) return perspective(entry.node.camera);
  if (isOrthographicCameraNode(entry.node)) return orthographic(entry.node.camera);
  throw new Error("camera is missing");
}

function selectCamera(evaluated: readonly EvaluatedNode[], cameraId: string | undefined): EvaluatedNode {
  const cameras = evaluated.filter(
    (entry) => isPerspectiveCameraNode(entry.node) || isOrthographicCameraNode(entry.node),
  );
  if (cameraId !== undefined) {
    const match = cameras.find((entry) => entry.stableId === cameraId);
    if (match === undefined || match.view === undefined) throw new Error("camera is missing");
    return match;
  }
  if (cameras.length === 1 && cameras[0].view !== undefined) return cameras[0];
  if (cameras.length === 0) throw new Error("camera is missing");
  throw new Error("camera id is required");
}

function clipNearPolygon(input: readonly ClipPoint[]): ClipPoint[] {
  const output: ClipPoint[] = [];
  if (input.length === 0) return output;
  let previous = input[input.length - 1];
  for (const current of input) {
    const previousIn = insideNear(previous);
    const currentIn = insideNear(current);
    if (currentIn) {
      if (!previousIn) output.push(intersectNear(previous, current));
      output.push(current);
    } else if (previousIn) {
      output.push(intersectNear(previous, current));
    }
    previous = current;
  }
  return output;
}

function insideNear(clip: ClipPoint): boolean {
  return clip.z + clip.w >= 0;
}

function intersectNear(start: ClipPoint, end: ClipPoint): ClipPoint {
  const startSide = start.z + start.w;
  const endSide = end.z + end.w;
  const t = startSide / (startSide - endSide);
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
    w: start.w + (end.w - start.w) * t,
  };
}

function pathData(points: readonly Vec4[], width: number, height: number): string {
  const mapped = points.map((clip) => {
    const ndc = { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w };
    return {
      x: (ndc.x * 0.5 + 0.5) * width,
      y: (ndc.y * -0.5 + 0.5) * height,
    };
  });
  let data = `M ${formatUnit(mapped[0].x)} ${formatUnit(mapped[0].y)}`;
  for (let index = 1; index < mapped.length; index += 1) {
    data += ` L ${formatUnit(mapped[index].x)} ${formatUnit(mapped[index].y)}`;
  }
  return `${data} Z`;
}

function clampFrame(frame: number, durationInFrames: number): number {
  const last = durationInFrames - 1;
  const index = Number.isFinite(frame) ? Math.trunc(frame) : 0;
  if (index < 0) return 0;
  if (index > last) return last;
  return index;
}

function assertSize(value: number, label: string): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new Error(`${label} is not positive`);
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
