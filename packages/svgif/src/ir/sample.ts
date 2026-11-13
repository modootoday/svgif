/**
 * sample(ir, frame) -> node map of concrete values.
 * Frame is clamped to 0 .. durationInFrames-1.
 * A key's easing covers the span that ends on that key. The first key's easing is ignored.
 * Landing on a key returns that key. A mismatched attr.d span holds and records a diagnostic.
 * Two numeric-list strings of equal length blend as numbers.
 * Each number is quantized the same way a transform number is quantized.
 * A different length, or a string that is not a numeric list, keeps the start value.
 */

import { parseColor, formatColor } from "./color.ts";
import { easeProgress, parseEasing, type EasingKind } from "./easing.ts";
import { parsePath, sameCommandList, writePath, type PathCommand } from "./path.ts";
import { formatUnit, quantize1e4 } from "./quantize.ts";
import { springAtFrame } from "./spring.ts";
import type { IrDiagnostic, IrKey, IrValue, NodeMap, SampleReport, TimelineIr } from "./types.ts";

function clampFrame(frame: number, durationInFrames: number): number {
  const last = durationInFrames - 1;
  const index = Number.isFinite(frame) ? Math.trunc(frame) : 0;
  if (index < 0) return 0;
  if (index > last) return last;
  return index;
}

function orderedKeys(keys: IrKey[]): IrKey[] {
  return keys
    .map((key, index) => ({ key, index }))
    .sort((a, b) => a.key.frame - b.key.frame || a.index - b.index)
    .map((entry) => entry.key);
}

function isColorProperty(property: string): boolean {
  return property === "attr.fill" || property === "attr.stroke" || property.endsWith(".stop-color");
}

function isPathProperty(property: string): boolean {
  return property === "attr.d" || property === "clip" || property === "mask";
}

function quantizeNumber(property: string, kind: EasingKind, value: number): number {
  if (kind.kind === "spring" || property.startsWith("transform.") || property === "attr.d") {
    return quantize1e4(value);
  }
  return value;
}

/** A numeric list is finite numbers separated by whitespace. */
const NUMERIC_TOKEN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseNumericList(value: string): number[] | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!NUMERIC_TOKEN.test(part)) return null;
    const number = Number(part);
    if (!Number.isFinite(number)) return null;
    numbers.push(number);
  }
  return numbers;
}

function blendNumber(
  from: number,
  to: number,
  kind: EasingKind,
  progress: number,
  steps: number,
  fps: number,
): number {
  if (kind.kind === "hold") return from;
  if (kind.kind === "spring") return springAtFrame(from, to, steps, fps);
  const t = easeProgress(kind, progress);
  return from + (to - from) * t;
}

function blendPath(
  from: PathCommand[],
  to: PathCommand[],
  kind: EasingKind,
  progress: number,
  steps: number,
  fps: number,
): string {
  const values = from.map((command, index) => {
    const target = to[index];
    return command.args.map((start, arg) => {
      const end = target?.args[arg] ?? start;
      const next = blendNumber(start, end, kind, progress, steps, fps);
      return quantize1e4(next);
    });
  });
  return writePath(from, values, formatUnit);
}

function blendColor(
  from: number[],
  to: number[],
  kind: EasingKind,
  progress: number,
  steps: number,
  fps: number,
): string {
  const channels = from.map((start, index) => {
    const end = to[index] ?? start;
    return blendNumber(start, end, kind, progress, steps, fps);
  });
  return formatColor(channels);
}

function blendNumericList(
  from: number[],
  to: number[],
  property: string,
  kind: EasingKind,
  progress: number,
  steps: number,
  fps: number,
): string {
  return from
    .map((start, index) => {
      const end = to[index] ?? start;
      const next = blendNumber(start, end, kind, progress, steps, fps);
      return formatUnit(quantizeNumber(property, kind, next));
    })
    .join(" ");
}

interface Blended {
  value: IrValue;
  mismatch: boolean;
}

function blend(
  property: string,
  from: IrValue,
  to: IrValue,
  kind: EasingKind,
  progress: number,
  steps: number,
  fps: number,
): Blended {
  if (kind.kind === "hold") return { value: from, mismatch: false };

  if (isPathProperty(property) && typeof from === "string" && typeof to === "string") {
    const left = parsePath(from);
    const right = parsePath(to);
    if (!left || !right || !sameCommandList(left, right)) {
      return { value: from, mismatch: property === "attr.d" };
    }
    return { value: blendPath(left, right, kind, progress, steps, fps), mismatch: false };
  }

  if (isColorProperty(property) && typeof from === "string" && typeof to === "string") {
    const left = parseColor(from);
    const right = parseColor(to);
    if (!left || !right || left.length !== right.length) return { value: from, mismatch: false };
    return { value: blendColor(left, right, kind, progress, steps, fps), mismatch: false };
  }

  if (typeof from === "string" && typeof to === "string") {
    const left = parseNumericList(from);
    const right = parseNumericList(to);
    if (left && right && left.length === right.length) {
      return { value: blendNumericList(left, right, property, kind, progress, steps, fps), mismatch: false };
    }
  }

  if (typeof from === "number" && typeof to === "number") {
    const next = blendNumber(from, to, kind, progress, steps, fps);
    return { value: quantizeNumber(property, kind, next), mismatch: false };
  }

  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    const next = from.map((start, index) => {
      const end = to[index] ?? start;
      return quantizeNumber(property, kind, blendNumber(start, end, kind, progress, steps, fps));
    });
    return { value: next, mismatch: false };
  }

  return { value: from, mismatch: property === "attr.d" };
}

function sampleTrack(
  property: string,
  keys: IrKey[],
  frame: number,
  fps: number,
  nodeId: string,
  diagnostics: IrDiagnostic[],
): IrValue | undefined {
  if (keys.length === 0) return undefined;
  const ordered = orderedKeys(keys);
  const first = ordered[0];
  if (!first) return undefined;
  if (frame <= first.frame) return first.value;

  let index = 0;
  while (index + 1 < ordered.length && (ordered[index + 1]?.frame ?? 0) <= frame) index += 1;
  const start = ordered[index];
  const end = ordered[index + 1];
  if (!start) return undefined;
  if (!end || start.frame === frame) return start.value;

  const span = end.frame - start.frame;
  if (span <= 0) return end.value;
  const progress = (frame - start.frame) / span;
  const steps = frame - start.frame;
  const kind = parseEasing(end.easing);
  const blended = blend(property, start.value, end.value, kind, progress, steps, fps);
  if (blended.mismatch) {
    diagnostics.push({
      code: "attr-d-mismatch",
      nodeId,
      property,
      fromFrame: start.frame,
      toFrame: end.frame,
    });
  }
  return blended.value;
}

export function sampleReport(ir: TimelineIr, frame: number): SampleReport {
  if (
    !ir ||
    !Number.isInteger(ir.fps) ||
    ir.fps < 1 ||
    !Number.isInteger(ir.durationInFrames) ||
    ir.durationInFrames < 1 ||
    !Array.isArray(ir.nodes)
  ) {
    throw new TypeError("sample expects a timeline IR document");
  }
  const clamped = clampFrame(frame, ir.durationInFrames);
  const nodes: NodeMap = {};
  const diagnostics: IrDiagnostic[] = [];
  for (const node of ir.nodes) {
    const values: Record<string, IrValue> = {};
    for (const track of node.tracks) {
      const value = sampleTrack(track.property, track.keys, clamped, ir.fps, node.id, diagnostics);
      if (value !== undefined) values[track.property] = value;
    }
    nodes[node.id] = values;
  }
  return { frame: clamped, nodes, diagnostics };
}

/** Node map of concrete values at one integer frame. */
export function sample(ir: TimelineIr, frame: number): NodeMap {
  return sampleReport(ir, frame).nodes;
}
