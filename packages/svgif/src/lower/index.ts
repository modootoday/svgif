/**
 * Rewrite channels before compile.
 * `compile(ir, backend)` is total: a capability cell of `lower` becomes
 * per-frame keys or `hold`, and the channel stays on the IR.
 * A cell of `emit` is left for that backend. When two rows name one property,
 * the row that can emit is the cell that applies. A path row emits only when
 * consecutive command lists match; otherwise the span is `hold`.
 * `matrix3d` is never emitted.
 * A true `loop` field is kept. `compile()` passes `{ loop: true }` to CSS.
 * Absent or false plays once. The count is not chosen from a document category.
 * [[sot:svgif/animation-backends]] [[sot:svgif/determinism]]
 */

import { compileCss } from "../backend/css/index.ts";
import { BACKENDS, FEATURE_MATRIX, type BackendId } from "../backend/capability.ts";
import { compile as compileSmil } from "../backend/smil/index.ts";
import { parsePath, sameCommandList } from "../ir/path.ts";
import { sample } from "../ir/sample.ts";
import type { IrKey, IrTrack, IrValue, TimelineIr } from "../ir/types.ts";

const PATH_PROPERTIES = new Set(["attr.d", "clip", "mask"]);

export type RewriteMethod = "per-frame" | "hold";

export interface LowerRewrite {
  nodeId: string;
  property: string;
  method: RewriteMethod;
}

export interface LowerResult {
  ir: TimelineIr;
  rewrites: LowerRewrite[];
}

export interface CompileResult {
  backend: BackendId;
  lowered: TimelineIr;
  rewrites: LowerRewrite[];
  svg: string;
  css?: string;
}

function assertTimeline(ir: TimelineIr): void {
  if (
    !ir ||
    !Number.isInteger(ir.fps) ||
    ir.fps < 1 ||
    !Number.isInteger(ir.durationInFrames) ||
    ir.durationInFrames < 1 ||
    !Number.isFinite(ir.width) ||
    !Number.isFinite(ir.height) ||
    !Array.isArray(ir.nodes)
  ) {
    throw new TypeError("compile expects a timeline IR document");
  }
}

function assertBackend(backend: string): asserts backend is BackendId {
  if (!(BACKENDS as readonly string[]).includes(backend)) {
    throw new TypeError("compile backend must be css-external, css-embedded, or smil");
  }
}

function withLoop(ir: TimelineIr, nodes: TimelineIr["nodes"]): TimelineIr {
  const next: TimelineIr = {
    fps: ir.fps,
    width: ir.width,
    height: ir.height,
    durationInFrames: ir.durationInFrames,
    nodes,
  };
  if (ir.loop === true) next.loop = true;
  else if (ir.loop === false) next.loop = false;
  return next;
}

function copyValue(value: IrValue): IrValue {
  return Array.isArray(value) ? value.slice() : value;
}

function copyKey(key: IrKey, easing?: string): IrKey {
  const next: IrKey = { frame: key.frame, value: copyValue(key.value) };
  const token = easing === undefined ? key.easing : easing;
  if (token !== undefined) next.easing = token;
  return next;
}

function orderedKeys(keys: IrKey[]): IrKey[] {
  return keys
    .map((key, index) => ({ key, index }))
    .sort((left, right) => left.key.frame - right.key.frame || left.index - right.index)
    .map((entry) => entry.key);
}

function isAffineMatrix(value: IrValue): boolean {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function pathsMatch(left: IrValue, right: IrValue): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const from = parsePath(left);
  const to = parsePath(right);
  if (!from || !to) return false;
  return sameCommandList(from, to);
}

function commandsMatch(keys: IrKey[]): boolean {
  const ordered = orderedKeys(keys);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const next = ordered[index];
    if (!previous || !next || previous.frame === next.frame) continue;
    if (!pathsMatch(previous.value, next.value)) return false;
  }
  return true;
}

type Decision = { kind: "keep" } | { kind: RewriteMethod };

function decide(property: string, keys: IrKey[], backend: BackendId): Decision {
  if (property === "transform.matrix") {
    return keys.every((key) => isAffineMatrix(key.value)) ? { kind: "keep" } : { kind: "per-frame" };
  }
  const rows = FEATURE_MATRIX.filter((row) => row.properties.includes(property));
  if (rows.length === 0) return { kind: "keep" };
  const emits = rows.some((row) => row.cells[backend] === "emit");
  const lowers = rows.some((row) => row.cells[backend] === "lower");
  if (PATH_PROPERTIES.has(property)) {
    if (emits && commandsMatch(keys)) return { kind: "keep" };
    if (emits) return { kind: "hold" };
    if (lowers) return { kind: "per-frame" };
    return { kind: "keep" };
  }
  if (emits) return { kind: "keep" };
  if (lowers) return { kind: "per-frame" };
  return { kind: "keep" };
}

function holdMismatched(keys: IrKey[]): IrKey[] {
  const ordered = orderedKeys(keys);
  return ordered.map((key, index) => {
    if (index === 0) return copyKey(key);
    const previous = ordered[index - 1];
    if (!previous || pathsMatch(previous.value, key.value)) return copyKey(key);
    return copyKey(key, "hold");
  });
}

function bakeProperty(ir: TimelineIr, nodeId: string, property: string): IrKey[] {
  const keys: IrKey[] = [];
  for (let frame = 0; frame < ir.durationInFrames; frame += 1) {
    const value = sample(ir, frame)[nodeId]?.[property];
    if (value === undefined) continue;
    keys.push({ frame, value: copyValue(value) });
  }
  return keys;
}

function channelId(nodeId: string, property: string): string {
  return `${nodeId}\0${property}`;
}

function channelsOf(ir: TimelineIr): string[] {
  const channels: string[] = [];
  for (const node of ir.nodes) {
    for (const track of node.tracks) channels.push(channelId(node.id, track.property));
  }
  return channels;
}

function rewriteTrack(ir: TimelineIr, nodeId: string, track: IrTrack, backend: BackendId): {
  track: IrTrack;
  rewrite?: LowerRewrite;
} {
  const decision = decide(track.property, track.keys, backend);
  if (decision.kind === "keep") {
    return { track: { property: track.property, keys: orderedKeys(track.keys).map((key) => copyKey(key)) } };
  }
  const keys = decision.kind === "hold" ? holdMismatched(track.keys) : bakeProperty(ir, nodeId, track.property);
  return {
    track: { property: track.property, keys },
    rewrite: { nodeId, property: track.property, method: decision.kind },
  };
}

/** IR whose samples match `ir`. Channels with a `lower` cell are per-frame keys or `hold`. */
export function lower(ir: TimelineIr, backend: BackendId): LowerResult {
  assertTimeline(ir);
  assertBackend(backend);
  const rewrites: LowerRewrite[] = [];
  const nodes = ir.nodes.map((node) => {
    const tracks = node.tracks.map((track) => {
      const rewritten = rewriteTrack(ir, node.id, track, backend);
      if (rewritten.rewrite) rewrites.push(rewritten.rewrite);
      return rewritten.track;
    });
    return { id: node.id, tracks };
  });
  const lowered = withLoop(ir, nodes);
  const before = channelsOf(ir);
  const after = channelsOf(lowered);
  if (before.length !== after.length || before.some((channel, index) => channel !== after[index])) {
    throw new Error("compile dropped a channel");
  }
  return { ir: lowered, rewrites };
}

function artifactText(svg: string, css: string | undefined): string {
  return css === undefined ? svg : `${svg}\n${css}`;
}

/** Lower, then compile. The backend compiler does not receive a dropped channel. */
export function compile(ir: TimelineIr, backend: BackendId): CompileResult {
  assertTimeline(ir);
  assertBackend(backend);
  const lowered = lower(ir, backend);
  if (backend === "smil") {
    const compiled = compileSmil(lowered.ir);
    if (compiled.svg.includes("matrix3d")) throw new Error("matrix3d is never emitted");
    return {
      backend,
      lowered: lowered.ir,
      rewrites: lowered.rewrites,
      svg: compiled.svg,
    };
  }
  const compiled = compileCss(lowered.ir, backend, { loop: lowered.ir.loop === true });
  const text = artifactText(compiled.svg, compiled.css);
  if (text.includes("matrix3d")) throw new Error("matrix3d is never emitted");
  return {
    backend,
    lowered: lowered.ir,
    rewrites: lowered.rewrites,
    svg: compiled.svg,
    ...(compiled.css !== undefined ? { css: compiled.css } : {}),
  };
}
