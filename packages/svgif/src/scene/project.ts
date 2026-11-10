/**
 * Project meshes and path3 polylines to SVG paths.
 * Clip space is `projection * view * world * position` with `position.w = 1`.
 * The near plane is `clip.z + clip.w >= 0`. A polygon or polyline is clipped
 * there before the perspective divide. NDC is `clip.xyz / clip.w`. The viewport
 * flips Y so SVG y grows downward. The root `viewBox` is `0 0 width height`.
 * Path coordinates are quantized at emit time. Faces stay in authoring order.
 * This file does not cull faces and does not sort them.
 * [[sot:svgif/scene-3d]] [[sot:svgif/determinism]]
 */

import { formatUnit } from "../ir/quantize.ts";
import {
  multiply,
  orthographic,
  perspective,
  transformPoint,
  viewportMap,
  type Mat4,
  type Vec2,
  type Vec3,
  type Vec4,
} from "../math/index.ts";
import {
  evaluateWorld,
  isMeshNode,
  isOrthographicCameraNode,
  isPath3Node,
  isPerspectiveCameraNode,
  selectorId,
  type EvaluatedNode,
  type SceneNode,
} from "./index.ts";

export interface ProjectionOptions {
  width: number;
  height: number;
  /** Author id, or the child-index id, of the camera. Required when several cameras exist. */
  cameraId?: string;
}

interface ClipPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}

const ID_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Perspective divide and the SVG viewport.
 * A point with `w <= 0` is behind the camera and is not divided.
 */
export function mapClipToViewport(clip: Vec4, width: number, height: number): Vec2 {
  if (!(clip.w > 0)) throw new Error("point is behind the camera");
  return viewportMap(
    { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w },
    width,
    height,
  );
}

/**
 * SVG document for every mesh and path3 under `root`.
 * The camera view is the inverse of that camera's world matrix.
 * Drawable nodes keep depth-first order. A mesh keeps face-index order.
 */
export function projectScene(root: SceneNode, options: ProjectionOptions): string {
  assertSize(options.width, "width");
  assertSize(options.height, "height");
  const evaluated = evaluateWorld(root);
  const camera = selectCamera(evaluated, options.cameraId);
  const projection = projectionMatrix(camera);
  const view = camera.view as Mat4;
  const body = evaluated
    .map((entry) => projectEntry(entry, projection, view, options.width, options.height))
    .join("");
  return renderDocument(options.width, options.height, body);
}

function projectEntry(
  entry: EvaluatedNode,
  projection: Mat4,
  view: Mat4,
  width: number,
  height: number,
): string {
  const mvp = multiply(projection, multiply(view, entry.world));
  if (isMeshNode(entry.node)) {
    return renderGroup(entry.stableId, projectMesh(entry.node.geometry.positions, entry.node.geometry.faces, mvp, width, height));
  }
  if (isPath3Node(entry.node)) {
    return renderGroup(entry.stableId, projectPolyline(entry.node.path.points, entry.node.path.closed, mvp, width, height));
  }
  return "";
}

function projectMesh(
  positions: readonly Vec3[],
  faces: ReadonlyArray<readonly [number, number, number]>,
  mvp: Mat4,
  width: number,
  height: number,
): string[] {
  const paths: string[] = [];
  for (const face of faces) {
    const polygon = clipNearPolygon(face.map((index) => transformPoint(mvp, positions[index])));
    if (polygon.length < 3) continue;
    paths.push(pathData(polygon.map((clip) => mapClipToViewport(clip, width, height)), true));
  }
  return paths;
}

function projectPolyline(
  points: readonly Vec3[],
  closed: boolean,
  mvp: Mat4,
  width: number,
  height: number,
): string[] {
  const clips = points.map((point) => transformPoint(mvp, point));
  const ring = closed ? clips.concat(clips[0]) : clips;
  const runs = clipNearPolyline(ring);
  const close = closed && clips.every(insideNear) && runs.length === 1;
  const paths: string[] = [];
  for (const run of runs) {
    const clipped =
      close && run.length > 2 && sameClip(run[0], run[run.length - 1]) ? run.slice(0, -1) : run;
    if (clipped.length < 2) continue;
    paths.push(pathData(clipped.map((clip) => mapClipToViewport(clip, width, height)), close));
  }
  return paths;
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

function clipNearPolyline(points: readonly ClipPoint[]): ClipPoint[][] {
  const runs: ClipPoint[][] = [];
  let run: ClipPoint[] = [];
  const finish = (): void => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  const add = (point: ClipPoint): void => {
    const last = run[run.length - 1];
    if (last !== undefined && sameClip(last, point)) return;
    run.push(point);
  };
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const startIn = insideNear(start);
    const endIn = insideNear(end);
    if (startIn && endIn) {
      if (run.length === 0) add(start);
      add(end);
    } else if (startIn && !endIn) {
      if (run.length === 0) add(start);
      add(intersectNear(start, end));
      finish();
    } else if (!startIn && endIn) {
      finish();
      add(intersectNear(start, end));
      add(end);
    } else {
      finish();
    }
  }
  finish();
  return runs;
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

function sameClip(a: ClipPoint, b: ClipPoint): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
}

function pathData(points: readonly Vec2[], closed: boolean): string {
  let data = `M ${formatUnit(points[0].x)} ${formatUnit(points[0].y)}`;
  for (let index = 1; index < points.length; index++) {
    data += ` L ${formatUnit(points[index].x)} ${formatUnit(points[index].y)}`;
  }
  if (closed) data += " Z";
  return data;
}

function renderGroup(stable: string, paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const open = stable.length > 0 ? `<g ${nodeAttribute(stable)}>` : "<g>";
  return `${open}\n${paths.map((data) => `<path d="${data}"/>`).join("\n")}\n</g>\n`;
}

function nodeAttribute(stable: string): string {
  const token = selectorId(stable);
  const escaped = escapeXml(token);
  if (ID_RE.test(token)) return `id="${escaped}"`;
  return `data-node="${escaped}"`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderDocument(width: number, height: number, body: string): string {
  const w = formatUnit(width);
  const h = formatUnit(height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}</svg>\n`;
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

function assertSize(value: number, label: string): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new Error(`${label} is not positive`);
}
