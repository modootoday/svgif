/**
 * Shared CSS printer. css-external and css-embedded both call this.
 * Selectors use stable ids. Each animated channel is an `animation` on that
 * id, and the values live in `@keyframes`. matrix3d is never written.
 * [[sot:svgif/animation-backends]] [[adr:svgif/20261110120300]]
 */

import { formatColor, parseColor } from "../../ir/color.ts";
import { parseEasing } from "../../ir/easing.ts";
import { sample } from "../../ir/sample.ts";
import { formatUnit } from "../../ir/quantize.ts";
import type { IrTrack, IrValue, TimelineIr } from "../../ir/types.ts";
import { isOmittedMatrix } from "./lower.ts";

const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const TRANSFORM = new Set([
  "transform.translateX",
  "transform.translateY",
  "transform.rotate",
  "transform.scaleX",
  "transform.scaleY",
  "transform.matrix",
]);

const PROPERTY_CSS: Record<string, string> = {
  "attr.opacity": "opacity",
  "attr.fill": "fill",
  "attr.stroke": "stroke",
  "attr.offsetPath": "offset-path",
  "attr.offsetDistance": "offset-distance",
  "attr.d": "d",
  clip: "clip-path",
  mask: "mask",
};

const PROPERTY_RANK: Record<string, number> = {
  "attr.opacity": 1,
  "attr.fill": 2,
  "attr.stroke": 3,
  "attr.offsetPath": 4,
  "attr.offsetDistance": 5,
  "attr.d": 6,
  clip: 7,
  mask: 8,
};

/** Author id, prefixed with `s-` when the document has not already done that. */
export function stableSelectorId(id: string): string {
  const prefixed = id.startsWith("s-") ? id : `s-${id}`;
  if (!ID_RE.test(prefixed)) throw new TypeError(`node id ${id} cannot form a stable selector`);
  return prefixed;
}

export function formatSeconds(frames: number, fps: number): string {
  return `${formatUnit(frames / fps)}s`;
}

function cssTiming(token: string | undefined): string {
  const kind = parseEasing(token);
  if (kind.kind === "hold" || kind.kind === "spring") return "steps(1,end)";
  if (kind.kind === "cubic") {
    return `cubic-bezier(${formatUnit(kind.x1)}, ${formatUnit(kind.y1)}, ${formatUnit(kind.x2)}, ${formatUnit(kind.y2)})`;
  }
  return "linear";
}

function quoteCss(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function customProperty(property: string): string {
  const body = property.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `--svgif-${body || "channel"}`;
}

function cssName(property: string): string {
  return PROPERTY_CSS[property] ?? customProperty(property);
}

export function formatCssValue(property: string, value: IrValue): string {
  if (
    typeof value === "string" &&
    (property === "attr.fill" || property === "attr.stroke" || property.endsWith("stop-color"))
  ) {
    const parsed = parseColor(value);
    return parsed ? formatColor(parsed) : quoteCss(value);
  }
  if (
    typeof value === "string" &&
    (property === "attr.d" || property === "attr.offsetPath" || property === "clip" || property === "mask")
  ) {
    return `path(${quoteCss(value)})`;
  }
  if (typeof value === "number") return formatUnit(value);
  if (Array.isArray(value)) return value.map((item) => formatUnit(item)).join(" ");
  return quoteCss(String(value));
}

function asNumber(value: IrValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 2D transform only. A longer matrix is not written. */
export function formatTransform(values: Record<string, IrValue> | undefined): string | undefined {
  if (!values) return undefined;
  const matrix = values["transform.matrix"];
  if (Array.isArray(matrix) && matrix.length === 6 && matrix.every((item) => typeof item === "number")) {
    return `matrix(${matrix.map((item) => formatUnit(item)).join(", ")})`;
  }
  const tx = asNumber(values["transform.translateX"]);
  const ty = asNumber(values["transform.translateY"]);
  const rot = asNumber(values["transform.rotate"]);
  const sx = asNumber(values["transform.scaleX"]);
  const sy = asNumber(values["transform.scaleY"]);
  const parts: string[] = [];
  if (tx !== undefined || ty !== undefined) {
    parts.push(`translate(${formatUnit(tx ?? 0)}px, ${formatUnit(ty ?? 0)}px)`);
  }
  if (rot !== undefined) parts.push(`rotate(${formatUnit(rot)}deg)`);
  if (sx !== undefined || sy !== undefined) {
    parts.push(`scale(${formatUnit(sx ?? 1)}, ${formatUnit(sy ?? 1)})`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function ordered(keys: StopKey[]): StopKey[] {
  return keys
    .map((key, index) => ({ key, index }))
    .sort((a, b) => a.key.frame - b.key.frame || a.index - b.index)
    .map((entry) => entry.key);
}

function isPerFrame(keys: StopKey[], duration: number): boolean {
  if (keys.length !== duration) return false;
  const frames = new Set(keys.map((key) => key.frame));
  for (let frame = 0; frame < duration; frame += 1) {
    if (!frames.has(frame)) return false;
  }
  return keys.every((key) => key.easing === undefined || parseEasing(key.easing).kind === "linear");
}

function stopFrames(keys: StopKey[], duration: number): number[] {
  const frames = new Set<number>([0, duration - 1]);
  for (const key of keys) {
    if (key.frame >= 0 && key.frame < duration) frames.add(key.frame);
  }
  return [...frames].sort((left, right) => left - right);
}

function timingInto(keys: StopKey[], nextFrame: number, discrete: boolean): string {
  if (discrete) return "steps(1,end)";
  const end = ordered(keys).find((key) => key.frame >= nextFrame);
  if (!end) return "steps(1,end)";
  return cssTiming(end.easing);
}

function percent(frame: number, duration: number): string {
  return `${formatUnit((frame / duration) * 100)}%`;
}

interface StopKey {
  frame: number;
  easing?: string;
}

interface Channel {
  suffix: string;
  cssProp: string;
  keys: StopKey[];
  discrete: boolean;
  valueAt: (frame: number) => string | undefined;
}

function keyframesBlock(name: string, channel: Channel, duration: number): string {
  const stops = stopFrames(channel.keys, duration);
  const lines = [`@keyframes ${name} {`];
  const seen = new Set<string>();
  const push = (pct: string, frame: number, withTiming: boolean, nextFrame?: number): void => {
    if (seen.has(pct)) return;
    const value = channel.valueAt(frame);
    if (value === undefined) return;
    seen.add(pct);
    const decls: string[] = [];
    if (withTiming && nextFrame !== undefined) {
      decls.push(`animation-timing-function: ${timingInto(channel.keys, nextFrame, channel.discrete)}`);
    }
    decls.push(`${channel.cssProp}: ${value}`);
    lines.push(`  ${pct} {`);
    for (const decl of decls) lines.push(`    ${decl};`);
    lines.push("  }");
  };
  for (let index = 0; index < stops.length; index += 1) {
    const frame = stops[index];
    const next = stops[index + 1];
    if (frame === undefined) continue;
    push(percent(frame, duration), frame, next !== undefined, next);
  }
  const last = duration - 1;
  push("100%", last, false);
  lines.push("}");
  return lines.join("\n");
}

function channelsFor(ir: TimelineIr, nodeId: string, tracks: IrTrack[]): Channel[] {
  const duration = ir.durationInFrames;
  const channels: Channel[] = [];
  const transformTracks = tracks.filter((track) => TRANSFORM.has(track.property) && !isOmittedMatrix(track));
  if (transformTracks.length > 0) {
    const sole = transformTracks.length === 1 ? transformTracks[0] : undefined;
    const discrete = sole === undefined || isPerFrame(sole.keys, duration);
    const keys: StopKey[] =
      discrete || sole === undefined
        ? Array.from({ length: duration }, (_, frame) => ({ frame }))
        : sole.keys;
    channels.push({
      suffix: "transform",
      cssProp: "transform",
      keys,
      discrete,
      valueAt: (frame) => formatTransform(sample(ir, frame)[nodeId]),
    });
  }

  const rest = tracks
    .filter((track) => !TRANSFORM.has(track.property))
    .slice()
    .sort((left, right) => {
      const rank = (PROPERTY_RANK[left.property] ?? 100) - (PROPERTY_RANK[right.property] ?? 100);
      if (rank !== 0) return rank;
      return left.property < right.property ? -1 : left.property > right.property ? 1 : 0;
    });

  for (const track of rest) {
    const cssProp = cssName(track.property);
    const suffix = cssProp.startsWith("--svgif-") ? cssProp.slice("--svgif-".length) : cssProp;
    channels.push({
      suffix,
      cssProp,
      keys: track.keys,
      discrete: isPerFrame(track.keys, duration),
      valueAt: (frame) => {
        const value = sample(ir, frame)[nodeId]?.[track.property];
        return value === undefined ? undefined : formatCssValue(track.property, value);
      },
    });
  }
  return channels;
}

/** One stylesheet. Callers choose the file beside the SVG or the style element. */
export function printStylesheet(ir: TimelineIr): string {
  const seconds = formatSeconds(ir.durationInFrames, ir.fps);
  const blocks: string[] = [];
  const seenIds = new Set<string>();
  for (const node of ir.nodes) {
    const id = stableSelectorId(node.id);
    if (seenIds.has(id)) throw new TypeError(`stable id ${id} is used by more than one node`);
    seenIds.add(id);
    const names: string[] = [];
    for (const channel of channelsFor(ir, node.id, node.tracks)) {
      const name = `${id}-${channel.suffix}`;
      const block = keyframesBlock(name, channel, ir.durationInFrames);
      if (!block.includes("%")) continue;
      names.push(name);
      blocks.push(block);
    }
    if (names.length > 0) {
      const list = names.map((name) => `${name} ${seconds} linear 0s 1 normal both`).join(", ");
      blocks.push(`#${id} {\n  animation: ${list};\n}`);
    }
  }
  return blocks.length > 0 ? `${blocks.join("\n")}\n` : "";
}
