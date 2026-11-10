/**
 * Rewrite channels the CSS backends cannot express.
 * Spring is sampled into numeric keys. Path, filter, gradient, clip, and mask
 * geometry become one key per frame. A matrix that is not 2D affine stays on
 * the track and is not emitted as matrix3d.
 * [[sot:svgif/animation-backends]] [[adr:svgif/20261110120300]]
 */

import { parseEasing } from "../../ir/easing.ts";
import { sample } from "../../ir/sample.ts";
import type { IrKey, IrTrack, IrValue, TimelineIr } from "../../ir/types.ts";
import type { CssDiagnostic } from "./types.ts";

const NATIVE = new Set([
  "transform.translateX",
  "transform.translateY",
  "transform.rotate",
  "transform.scaleX",
  "transform.scaleY",
  "transform.matrix",
  "attr.fill",
  "attr.stroke",
  "attr.opacity",
  "attr.offsetDistance",
  "attr.offsetPath",
]);

export interface LowerResult {
  ir: TimelineIr;
  diagnostics: CssDiagnostic[];
}

function copyValue(value: IrValue): IrValue {
  return Array.isArray(value) ? value.slice() : value;
}

function copyKeys(keys: IrKey[]): IrKey[] {
  return keys.map((key) => ({
    frame: key.frame,
    value: copyValue(key.value),
    ...(key.easing !== undefined ? { easing: key.easing } : {}),
  }));
}

export function isOmittedMatrix(track: IrTrack): boolean {
  if (track.property !== "transform.matrix" || track.keys.length === 0) return false;
  return track.keys.some((key) => {
    if (!Array.isArray(key.value) || key.value.length !== 6) return true;
    return key.value.some((item) => typeof item !== "number");
  });
}

function needsBake(track: IrTrack): boolean {
  if (isOmittedMatrix(track)) return false;
  const spring = track.keys.some((key, index) => index > 0 && parseEasing(key.easing).kind === "spring");
  if (spring) return true;
  if (track.property === "attr.offsetPath") {
    const strings = track.keys.filter((key) => typeof key.value === "string").map((key) => key.value);
    const distinct = new Set(strings);
    const holds = track.keys.every((key, index) => index === 0 || parseEasing(key.easing).kind === "hold");
    return distinct.size > 1 && !holds;
  }
  return !NATIVE.has(track.property);
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

export function assertTimeline(ir: TimelineIr): void {
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

/** Lower a document for either CSS backend. Sampling the result matches the source. */
export function lowerForCss(ir: TimelineIr): LowerResult {
  assertTimeline(ir);
  const diagnostics: CssDiagnostic[] = [];
  const nodes = ir.nodes.map((node) => {
    const tracks = node.tracks.map((track) => {
      if (isOmittedMatrix(track)) {
        diagnostics.push({
          code: "matrix3d-omitted",
          nodeId: node.id,
          property: track.property,
        });
        return { property: track.property, keys: copyKeys(track.keys) };
      }
      if (needsBake(track)) {
        diagnostics.push({ code: "lowered", nodeId: node.id, property: track.property });
        return { property: track.property, keys: bakeProperty(ir, node.id, track.property) };
      }
      return { property: track.property, keys: copyKeys(track.keys) };
    });
    return { id: node.id, tracks };
  });
  const next: TimelineIr = {
    fps: ir.fps,
    width: ir.width,
    height: ir.height,
    durationInFrames: ir.durationInFrames,
    nodes,
  };
  if (ir.loop === true) next.loop = true;
  else if (ir.loop === false) next.loop = false;
  return { ir: next, diagnostics };
}
