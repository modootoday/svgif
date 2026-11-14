/** Rest position and rest size for a direct artboard edit. Writes stay on frame 0. */

import { nodeById, setKeyframe, type EditorState, type SceneNode } from "./composition.ts";

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

/** Write the rest position. Other frames on the track stay as they are. */
export function writeRestPosition(state: EditorState, nodeId: string, x: number, y: number): void {
  if (!nodeById(state, nodeId)) return;
  setKeyframe(state, nodeId, "transform.translateX", 0, x);
  setKeyframe(state, nodeId, "transform.translateY", 0, y);
}

export function writeRestPath(state: EditorState, nodeId: string, d: string): void {
  if (!nodeById(state, nodeId) || d.length === 0) return;
  setKeyframe(state, nodeId, "attr.d", 0, d);
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

function flag(value: number): string {
  return Math.abs(value) >= 0.5 ? "1" : "0";
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

/** Scale path geometry around an anchor. The anchor point stays put. */
export function scalePath(d: string, anchorX: number, anchorY: number, sx: number, sy: number): string | null {
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return null;
  const segments = parsePath(d);
  if (segments.length === 0) return null;
  const mapX = (value: number) => anchorX + (value - anchorX) * sx;
  const mapY = (value: number) => anchorY + (value - anchorY) * sy;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const parts: string[] = [];
  for (const segment of segments) {
    const relative = segment.cmd === segment.cmd.toLowerCase();
    const kind = segment.cmd.toUpperCase();
    const abs = (index: number): { x: number; y: number } => {
      const px = segment.args[index] ?? 0;
      const py = segment.args[index + 1] ?? 0;
      return relative ? { x: x + px, y: y + py } : { x: px, y: py };
    };
    if (kind === "Z") {
      parts.push("Z");
      x = startX;
      y = startY;
      continue;
    }
    if (kind === "H") {
      x = relative ? x + (segment.args[0] ?? 0) : (segment.args[0] ?? 0);
      parts.push(`H ${formatCoord(mapX(x))}`);
      continue;
    }
    if (kind === "V") {
      y = relative ? y + (segment.args[0] ?? 0) : (segment.args[0] ?? 0);
      parts.push(`V ${formatCoord(mapY(y))}`);
      continue;
    }
    if (kind === "A") {
      const end = abs(5);
      const rx = Math.abs(segment.args[0] ?? 0) * sx;
      const ry = Math.abs(segment.args[1] ?? 0) * sy;
      const angle = segment.args[2] ?? 0;
      parts.push(
        `A ${formatCoord(rx)} ${formatCoord(ry)} ${formatCoord(angle)} ${flag(segment.args[3] ?? 0)} ${flag(segment.args[4] ?? 0)} ${formatCoord(mapX(end.x))} ${formatCoord(mapY(end.y))}`,
      );
      x = end.x;
      y = end.y;
      continue;
    }
    const pairs = kind === "C" ? [0, 2, 4] : kind === "S" || kind === "Q" ? [0, 2] : [0];
    const mapped = pairs.map((pair) => abs(pair));
    const end = mapped[mapped.length - 1] ?? { x, y };
    const coords = mapped.map((point) => `${formatCoord(mapX(point.x))} ${formatCoord(mapY(point.y))}`).join(" ");
    parts.push(`${kind} ${coords}`);
    x = end.x;
    y = end.y;
    if (kind === "M") {
      startX = x;
      startY = y;
    }
  }
  return parts.join(" ");
}

export function resizeRestPath(d: string, box: Box, corner: Corner, dx: number, dy: number): string | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const next = resizedBox(box, corner, dx, dy);
  const anchor = cornerPoint(box, oppositeCorner(corner));
  return scalePath(d, anchor.x, anchor.y, next.width / box.width, next.height / box.height);
}
