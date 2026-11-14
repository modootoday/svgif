/** Direct artboard edits. A move shifts every position key. A resize scales every shape key. */

import { parsePath as parseCommands, writePath } from "../../../packages/svgif/src/ir/path.ts";
import { sample } from "../../../packages/svgif/src/ir/sample.ts";
import { nodeById, rasterComposition, setKeyframe, type EditorState, type SceneNode } from "./composition.ts";

export type Corner = "nw" | "ne" | "sw" | "se";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_SIZE = 8;

const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

interface Segment {
  cmd: string;
  args: number[];
}

function restKey(node: SceneNode, property: string): number | string | undefined {
  const track = node.tracks.find((item) => item.property === property);
  if (!track) return undefined;
  const key = track.keys.find((item) => item.frame === 0) ?? track.keys[0];
  return key?.value;
}

export function restNumber(node: SceneNode, property: string, fallback = 0): number {
  const value = restKey(node, property);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Scale at rest. A missing scale is 1, so a new shape is not flattened. */
export function restScale(node: SceneNode, property: string): number {
  const value = restKey(node, property);
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return 1;
  return value;
}

export function restPosition(node: SceneNode): { x: number; y: number } {
  return {
    x: restNumber(node, "transform.translateX"),
    y: restNumber(node, "transform.translateY"),
  };
}

export function restPath(node: SceneNode): string {
  const value = restKey(node, "attr.d");
  return typeof value === "string" ? value : "";
}

export interface NumberKey {
  frame: number;
  value: number;
}

/** Numeric keys on one track. Null when that track is missing. */
export function numberKeys(node: SceneNode, property: string): NumberKey[] | null {
  const track = node.tracks.find((item) => item.property === property);
  if (!track) return null;
  const keys = track.keys.flatMap((key) =>
    typeof key.value === "number" && Number.isFinite(key.value) ? [{ frame: key.frame, value: key.value }] : [],
  );
  return keys.length > 0 ? keys : null;
}

/**
 * Add one artboard delta to every position key.
 * A missing track gains a single key at frame 0. An existing track gains no key.
 */
export function moveBy(
  state: EditorState,
  nodeId: string,
  originX: NumberKey[] | null,
  originY: NumberKey[] | null,
  dx: number,
  dy: number,
): void {
  writeShift(state, nodeId, "transform.translateX", originX, dx);
  writeShift(state, nodeId, "transform.translateY", originY, dy);
}

function writeShift(
  state: EditorState,
  nodeId: string,
  property: string,
  origin: NumberKey[] | null,
  delta: number,
): void {
  const node = nodeById(state, nodeId);
  if (!node || !Number.isFinite(delta)) return;
  const track = node.tracks.find((item) => item.property === property);
  if (!track) {
    setKeyframe(state, nodeId, property, 0, delta);
    return;
  }
  if (!origin) {
    const created = track.keys.find((key) => key.frame === 0);
    if (created) created.value = delta;
    return;
  }
  for (const key of track.keys) {
    const from = origin.find((item) => item.frame === key.frame);
    if (typeof key.value === "number" && from) key.value = from.value + delta;
  }
}

export function isCorner(value: string | null | undefined): value is Corner {
  return value === "nw" || value === "ne" || value === "sw" || value === "se";
}

export function oppositeCorner(corner: Corner): Corner {
  if (corner === "nw") return "se";
  if (corner === "ne") return "sw";
  if (corner === "sw") return "ne";
  return "nw";
}

export function cornerPoint(box: Box, corner: Corner): { x: number; y: number } {
  const east = corner === "ne" || corner === "se";
  const south = corner === "sw" || corner === "se";
  return {
    x: east ? box.x + box.width : box.x,
    y: south ? box.y + box.height : box.y,
  };
}

export function resizedBox(box: Box, corner: Corner, dx: number, dy: number): Box {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  let width = box.width;
  let height = box.height;
  if (corner === "se" || corner === "ne") width = box.width + dx;
  if (corner === "sw" || corner === "nw") width = box.width - dx;
  if (corner === "se" || corner === "sw") height = box.height + dy;
  if (corner === "ne" || corner === "nw") height = box.height - dy;
  width = Math.max(MIN_SIZE, width);
  height = Math.max(MIN_SIZE, height);
  const x = corner === "sw" || corner === "nw" ? right - width : box.x;
  const y = corner === "ne" || corner === "nw" ? bottom - height : box.y;
  return { x, y, width, height };
}

function parsePath(d: string): Segment[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g);
  if (!tokens) return [];
  const segments: Segment[] = [];
  let command = "";
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(token)) {
      command = token;
      index += 1;
    } else if (command === "") {
      index += 1;
      continue;
    }
    const kind = command.toUpperCase();
    const count = ARITY[kind] ?? 0;
    if (count === 0) {
      segments.push({ cmd: command, args: [] });
      command = "";
      continue;
    }
    if (index + count > tokens.length) break;
    const args: number[] = [];
    for (let step = 0; step < count; step += 1) {
      args.push(Number(tokens[index + step]));
      if (!Number.isFinite(args[step])) return segments;
    }
    segments.push({ cmd: command, args });
    index += count;
    if (command === "M") command = "L";
    else if (command === "m") command = "l";
  }
  return segments;
}

function formatCoord(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10000) / 10000;
  const text = rounded.toFixed(4).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

export function pathBounds(d: string): Box | null {
  const segments = parsePath(d);
  if (segments.length === 0) return null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  const mark = (px: number, py: number) => {
    any = true;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  for (const segment of segments) {
    const relative = segment.cmd === segment.cmd.toLowerCase();
    const kind = segment.cmd.toUpperCase();
    const abs = (index: number): { x: number; y: number } => {
      const px = segment.args[index] ?? 0;
      const py = segment.args[index + 1] ?? 0;
      return relative ? { x: x + px, y: y + py } : { x: px, y: py };
    };
    if (kind === "Z") {
      x = startX;
      y = startY;
      continue;
    }
    if (kind === "H") {
      x = relative ? x + (segment.args[0] ?? 0) : (segment.args[0] ?? 0);
      mark(x, y);
      continue;
    }
    if (kind === "V") {
      y = relative ? y + (segment.args[0] ?? 0) : (segment.args[0] ?? 0);
      mark(x, y);
      continue;
    }
    if (kind === "A") {
      const end = abs(5);
      mark(end.x, end.y);
      x = end.x;
      y = end.y;
      continue;
    }
    const pairs = kind === "C" ? [0, 2, 4] : kind === "S" || kind === "Q" ? [0, 2] : [0];
    let end = { x, y };
    for (const pair of pairs) {
      end = abs(pair);
      mark(end.x, end.y);
    }
    x = end.x;
    y = end.y;
    if (kind === "M") {
      startX = x;
      startY = y;
    }
  }
  if (!any || !Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface PlacedPath {
  frame: number;
  d: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface PoseCapture {
  box: Box;
  paths: PlacedPath[];
}

/** Command letters in path order. An unreadable path is an empty string. */
export function commandOps(d: string): string {
  const commands = parseCommands(d);
  return commands ? commands.map((command) => command.op).join("") : "";
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function axisScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return 1;
  return value;
}

/** Local geometry placed by translation and scale. The box is in artboard space. */
export function artboardBounds(local: Box, x: number, y: number, scaleX: number, scaleY: number): Box {
  const x0 = x + local.x * scaleX;
  const x1 = x + (local.x + local.width) * scaleX;
  const y0 = y + local.y * scaleY;
  const y1 = y + (local.y + local.height) * scaleY;
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/** Local bounds of the shape sampled at one frame. */
export function sampledGeometry(state: EditorState, nodeId: string, frame: number): Box | null {
  const sampled = sample(rasterComposition(state.composition), frame)[nodeId];
  const d = sampled?.["attr.d"];
  return typeof d === "string" ? pathBounds(d) : null;
}

/** The pose at `frame`, plus every shape key placed at its own frame. */
export function capturePose(state: EditorState, nodeId: string, frame: number): PoseCapture | null {
  const node = nodeById(state, nodeId);
  if (!node) return null;
  const sampled = sample(rasterComposition(state.composition), frame)[nodeId];
  const d = sampled?.["attr.d"];
  if (typeof d !== "string") return null;
  const local = pathBounds(d);
  if (!local) return null;
  const box = artboardBounds(
    local,
    finiteNumber(sampled?.["transform.translateX"], 0),
    finiteNumber(sampled?.["transform.translateY"], 0),
    axisScale(sampled?.["transform.scaleX"]),
    axisScale(sampled?.["transform.scaleY"]),
  );
  const track = node.tracks.find((item) => item.property === "attr.d");
  if (!track) return null;
  const paths: PlacedPath[] = [];
  for (const key of track.keys) {
    if (typeof key.value !== "string") continue;
    const at = sample(rasterComposition(state.composition), key.frame)[nodeId];
    paths.push({
      frame: key.frame,
      d: key.value,
      x: finiteNumber(at?.["transform.translateX"], 0),
      y: finiteNumber(at?.["transform.translateY"], 0),
      scaleX: axisScale(at?.["transform.scaleX"]),
      scaleY: axisScale(at?.["transform.scaleY"]),
    });
  }
  return paths.length > 0 ? { box, paths } : null;
}

/**
 * Scale one path about an artboard anchor.
 * Absolute points move in artboard space. Relative offsets scale. Command letters stay.
 */
export function scalePlacedPath(path: PlacedPath, anchorX: number, anchorY: number, sx: number, sy: number): string | null {
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return null;
  const commands = parseCommands(path.d);
  if (!commands) return null;
  const scaleX = path.scaleX === 0 ? 1 : path.scaleX;
  const scaleY = path.scaleY === 0 ? 1 : path.scaleY;
  const mapX = (px: number) => {
    const artboard = path.x + px * scaleX;
    return (anchorX + (artboard - anchorX) * sx - path.x) / scaleX;
  };
  const mapY = (py: number) => {
    const artboard = path.y + py * scaleY;
    return (anchorY + (artboard - anchorY) * sy - path.y) / scaleY;
  };
  let ix = 0;
  let iy = 0;
  let ox = 0;
  let oy = 0;
  let isx = 0;
  let isy = 0;
  let osx = 0;
  let osy = 0;
  const values: number[][] = [];
  for (const command of commands) {
    const relative = command.op === command.op.toLowerCase();
    const kind = command.op.toUpperCase();
    const args = command.args;
    if (kind === "Z") {
      ix = isx;
      iy = isy;
      ox = osx;
      oy = osy;
      values.push([]);
      continue;
    }
    if (kind === "H") {
      const local = relative ? ix + (args[0] ?? 0) : (args[0] ?? 0);
      const next = mapX(local);
      values.push([relative ? next - ox : next]);
      ix = local;
      ox = next;
      continue;
    }
    if (kind === "V") {
      const local = relative ? iy + (args[0] ?? 0) : (args[0] ?? 0);
      const next = mapY(local);
      values.push([relative ? next - oy : next]);
      iy = local;
      oy = next;
      continue;
    }
    if (kind === "A") {
      const end = relative
        ? { x: ix + (args[5] ?? 0), y: iy + (args[6] ?? 0) }
        : { x: args[5] ?? 0, y: args[6] ?? 0 };
      const nextX = mapX(end.x);
      const nextY = mapY(end.y);
      values.push([
        Math.abs(args[0] ?? 0) * sx,
        Math.abs(args[1] ?? 0) * sy,
        args[2] ?? 0,
        args[3] ?? 0,
        args[4] ?? 0,
        relative ? nextX - ox : nextX,
        relative ? nextY - oy : nextY,
      ]);
      ix = end.x;
      iy = end.y;
      ox = nextX;
      oy = nextY;
      continue;
    }
    const pairs = kind === "C" ? 3 : kind === "S" || kind === "Q" ? 2 : 1;
    const startIn = { x: ix, y: iy };
    const startOut = { x: ox, y: oy };
    const mapped: number[] = [];
    let endIn = startIn;
    let endOut = startOut;
    for (let pair = 0; pair < pairs; pair += 1) {
      const rawX = args[pair * 2] ?? 0;
      const rawY = args[pair * 2 + 1] ?? 0;
      const local = relative ? { x: startIn.x + rawX, y: startIn.y + rawY } : { x: rawX, y: rawY };
      const nextX = mapX(local.x);
      const nextY = mapY(local.y);
      mapped.push(relative ? nextX - startOut.x : nextX, relative ? nextY - startOut.y : nextY);
      endIn = local;
      endOut = { x: nextX, y: nextY };
    }
    values.push(mapped);
    ix = endIn.x;
    iy = endIn.y;
    ox = endOut.x;
    oy = endOut.y;
    if (kind === "M") {
      isx = ix;
      isy = iy;
      osx = ox;
      osy = oy;
    }
  }
  return writePath(commands, values, formatCoord);
}

/** Scale every captured shape key about one artboard anchor. The command list of each key stays. */
export function resizeCaptured(
  state: EditorState,
  nodeId: string,
  pose: PoseCapture,
  corner: Corner,
  dx: number,
  dy: number,
): void {
  const node = nodeById(state, nodeId);
  const track = node?.tracks.find((item) => item.property === "attr.d");
  if (!node || !track || pose.box.width <= 0 || pose.box.height <= 0) return;
  const next = resizedBox(pose.box, corner, dx, dy);
  const anchor = cornerPoint(pose.box, oppositeCorner(corner));
  const sx = next.width / pose.box.width;
  const sy = next.height / pose.box.height;
  for (const path of pose.paths) {
    const key = track.keys.find((item) => item.frame === path.frame);
    if (!key) continue;
    const scaled = scalePlacedPath(path, anchor.x, anchor.y, sx, sy);
    if (scaled) key.value = scaled;
  }
  reseatScalePivot(state, nodeId);
}

/** Local center of the rest path. Scale about this point stays on the element. */
export function restCenter(node: SceneNode): { x: number; y: number } | null {
  const local = pathBounds(restPath(node));
  if (!local) return null;
  return { x: local.x + local.width / 2, y: local.y + local.height / 2 };
}

/** Scale at `frame`, holding the first key before it and the last key after it. */
export function heldNumber(node: SceneNode, property: string, frame: number, fallback: number): number {
  const track = node.tracks.find((item) => item.property === property);
  if (!track || track.keys.length === 0) return fallback;
  const keys = [...track.keys].sort((left, right) => left.frame - right.frame);
  const first = keys.find((key) => typeof key.value === "number");
  if (!first || typeof first.value !== "number") return fallback;
  if (frame <= first.frame) return first.value;
  let current = first.value;
  for (const key of keys) {
    if (key.frame > frame) break;
    if (typeof key.value === "number") current = key.value;
  }
  return current;
}

/**
 * After a resize, write the scale pivot again from the new rest center.
 * The frame that was resized keeps its place. The other scale frames share its center.
 */
export function reseatScalePivot(state: EditorState, nodeId: string): void {
  const node = nodeById(state, nodeId);
  const mark = state.simpleMotions[nodeId];
  if (!node || !mark) return;
  const scaleX = mark.frames["transform.scaleX"];
  const scaleY = mark.frames["transform.scaleY"];
  if (!scaleX && !scaleY) return;
  const center = restCenter(node);
  if (!center) return;
  const frames = [...new Set([...(scaleX ?? []), ...(scaleY ?? []), ...(mark.frames["transform.translateX"] ?? []), ...(mark.frames["transform.translateY"] ?? [])])].sort(
    (left, right) => left - right,
  );
  const ref = frames[0];
  if (ref === undefined) return;
  const sx = heldNumber(node, "transform.scaleX", ref, 1);
  const sy = heldNumber(node, "transform.scaleY", ref, 1);
  const tx = heldNumber(node, "transform.translateX", ref, 0);
  const ty = heldNumber(node, "transform.translateY", ref, 0);
  const artX = tx + center.x * sx;
  const artY = ty + center.y * sy;
  for (const axis of ["X", "Y"] as const) {
    const property = `transform.translate${axis}`;
    const scaleProperty = `transform.scale${axis}`;
    const art = axis === "X" ? artX : artY;
    const local = axis === "X" ? center.x : center.y;
    const track = node.tracks.find((item) => item.property === property) ?? { property, keys: [] };
    if (!node.tracks.includes(track)) node.tracks.push(track);
    for (const frame of frames) {
      const scale = heldNumber(node, scaleProperty, frame, 1);
      const easing = node.tracks.find((item) => item.property === scaleProperty)?.keys.find((key) => key.frame === frame)?.easing;
      const value = art - local * scale;
      const existing = track.keys.find((key) => key.frame === frame);
      if (existing) {
        existing.value = value;
        if (easing !== undefined) existing.easing = easing;
      } else {
        track.keys.push(easing !== undefined ? { frame, value, easing } : { frame, value });
      }
    }
    track.keys.sort((left, right) => left.frame - right.frame);
  }
  mark.frames["transform.translateX"] = frames;
  mark.frames["transform.translateY"] = frames;
  if (!state.texts[nodeId]) state.origins[nodeId] = center;
}

export function resizeRestPath(d: string, box: Box, corner: Corner, dx: number, dy: number): string | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const next = resizedBox(box, corner, dx, dy);
  const anchor = cornerPoint(box, oppositeCorner(corner));
  return scalePlacedPath(
    { frame: 0, d, x: 0, y: 0, scaleX: 1, scaleY: 1 },
    anchor.x,
    anchor.y,
    next.width / box.width,
    next.height / box.height,
  );
}
