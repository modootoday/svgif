/**
 * Rewrite channels the SMIL backend cannot host.
 * A spring span, a cubic-bezier whose x controls sit outside 0..1,
 * a non-affine matrix, or two keys on the same frame becomes one key per frame.
 * A path span whose command lists differ becomes hold.
 * [[sot:svgif/animation-backends]]
 */

import { parseEasing } from "../../ir/easing.ts";
import { parsePath, sameCommandList } from "../../ir/path.ts";
import { sample } from "../../ir/sample.ts";
import type { IrKey, IrTrack, IrValue, NodeMap, TimelineIr } from "../../ir/types.ts";

function cloneValue(value: IrValue): IrValue {
  return Array.isArray(value) ? value.slice() : value;
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

function isPathProperty(property: string): boolean {
  return property === "attr.d" || property === "clip" || property === "mask";
}

function pathsMatch(left: IrValue, right: IrValue): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const from = parsePath(left);
  const to = parsePath(right);
  if (!from || !to) return false;
  return sameCommandList(from, to);
}

function cubicOutOfRange(token: string | undefined): boolean {
  const kind = parseEasing(token);
  if (kind.kind !== "cubic") return false;
  return kind.x1 < 0 || kind.x1 > 1 || kind.x2 < 0 || kind.x2 > 1;
}

function duplicateFrame(keys: IrKey[]): boolean {
  const ordered = orderedKeys(keys);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]?.frame === ordered[index - 1]?.frame) return true;
  }
  return false;
}

function needsBake(property: string, keys: IrKey[]): boolean {
  if (duplicateFrame(keys)) return true;
  const ordered = orderedKeys(keys);
  for (let index = 0; index < ordered.length; index += 1) {
    const key = ordered[index];
    if (!key) continue;
    if (index > 0 && parseEasing(key.easing).kind === "spring") return true;
    if (index > 0 && cubicOutOfRange(key.easing)) return true;
    if (property === "transform.matrix" && !isAffineMatrix(key.value)) return true;
  }
  return false;
}

function copyKey(key: IrKey, easing?: string): IrKey {
  const next: IrKey = { frame: key.frame, value: cloneValue(key.value) };
  const token = easing === undefined ? key.easing : easing;
  if (token !== undefined) next.easing = token;
  return next;
}

function holdMismatchedPaths(property: string, keys: IrKey[]): IrKey[] {
  const ordered = orderedKeys(keys);
  return ordered.map((key, index) => {
    if (index === 0 || !isPathProperty(property)) return copyKey(key);
    const previous = ordered[index - 1];
    if (!previous || parseEasing(key.easing).kind === "hold") return copyKey(key);
    if (pathsMatch(previous.value, key.value)) return copyKey(key);
    return copyKey(key, "hold");
  });
}

function bakeTrack(
  ir: TimelineIr,
  nodeId: string,
  property: string,
  at: (frame: number) => NodeMap,
): IrTrack {
  const keys: IrKey[] = [];
  for (let frame = 0; frame < ir.durationInFrames; frame += 1) {
    const value = at(frame)[nodeId]?.[property];
    if (value === undefined) continue;
    const key: IrKey = { frame, value: cloneValue(value) };
    if (keys.length > 0) key.easing = "linear";
    keys.push(key);
  }
  return { property, keys };
}

/** IR whose samples match `ir` and whose spans the SMIL emitter can host. */
export function lower(ir: TimelineIr): TimelineIr {
  const cache = new Map<number, NodeMap>();
  const at = (frame: number): NodeMap => {
    const hit = cache.get(frame);
    if (hit) return hit;
    const nodes = sample(ir, frame);
    cache.set(frame, nodes);
    return nodes;
  };
  at(0);
  const next: TimelineIr = {
    fps: ir.fps,
    width: ir.width,
    height: ir.height,
    durationInFrames: ir.durationInFrames,
    nodes: ir.nodes.map((node) => ({
      id: node.id,
      tracks: node.tracks.map((track) => {
        if (needsBake(track.property, track.keys)) {
          return bakeTrack(ir, node.id, track.property, at);
        }
        return { property: track.property, keys: holdMismatchedPaths(track.property, track.keys) };
      }),
    })),
  };
  if (ir.loop === true) next.loop = true;
  else if (ir.loop === false) next.loop = false;
  return next;
}
