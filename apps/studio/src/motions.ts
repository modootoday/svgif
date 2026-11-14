/** Simple-mode motions. Names and tracks come from the JSON list. */

import { nodeById, sanitizeTrack, type EditorState, type Keyframe, type SceneNode, type Track } from "./composition.ts";
import { heldNumber, restCenter } from "./direct.ts";

export interface MotionDef {
  file: string;
  label: string;
  tracks: Track[];
}

export interface MotionTiming {
  applyFrame: number;
  factor: number;
}

export interface MotionWrite {
  lastFrame: number;
}

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

export const SPEED_CHOICES = [
  { id: "slower", label: "Slower", factor: 2 },
  { id: "normal", label: "Normal", factor: 1 },
  { id: "faster", label: "Faster", factor: 0.5 },
] as const;

export const DELAY_CHOICES = [
  { id: "none", label: "None", seconds: 0 },
  { id: "short", label: "Short", seconds: 0.4 },
  { id: "long", label: "Long", seconds: 0.8 },
] as const;

let loaded: MotionDef[] = [];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numericTrack(value: unknown): Track | null {
  const clean = sanitizeTrack(value);
  if (!clean) return null;
  if (!clean.keys.every((key) => typeof key.value === "number" && Number.isFinite(key.value))) return null;
  return clean;
}

function motionFrom(file: string, value: unknown): MotionDef | null {
  const record = asRecord(value);
  if (!record || typeof record.label !== "string" || record.label.trim().length === 0) return null;
  if (!Array.isArray(record.tracks)) return null;
  const tracks = record.tracks.flatMap((item) => {
    const track = numericTrack(item);
    return track ? [track] : [];
  });
  if (tracks.length === 0) return null;
  return { file, label: record.label.trim(), tracks };
}

/** Motions in list order. Labels and tracks come from the documents, not from code. */
export function motionsFromDocuments(index: unknown, files: Record<string, unknown>): MotionDef[] {
  const record = asRecord(index);
  const listed = Array.isArray(record?.files) ? record.files : [];
  const motions: MotionDef[] = [];
  for (const item of listed) {
    if (typeof item !== "string" || !FILE_NAME.test(item)) continue;
    const motion = motionFrom(item, files[item]);
    if (motion) motions.push(motion);
  }
  return motions;
}

/** URL of one motion file beside the open Studio page. */
export function motionDocumentUrl(href: string, file: string): string {
  const url = new URL(href);
  const dir = url.pathname.endsWith("/") ? url.pathname : url.pathname.replace(/[^/]*$/, "");
  const clean = FILE_NAME.test(file) ? file : "";
  return `${url.origin}${dir}motions/${clean}`;
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error("motion request failed");
  return response.json();
}

/** Load the motion list that ships with this page. */
export async function loadMotions(href: string, fetcher: typeof fetch = fetch): Promise<MotionDef[]> {
  const index = await fetchJson(motionDocumentUrl(href, "index.json"), fetcher);
  const record = asRecord(index);
  const names = Array.isArray(record?.files) ? record.files.filter((item): item is string => typeof item === "string") : [];
  const files: Record<string, unknown> = {};
  await Promise.all(
    names.map(async (name) => {
      if (!FILE_NAME.test(name) || name === "index.json") return;
      files[name] = await fetchJson(motionDocumentUrl(href, name), fetcher);
    }),
  );
  loaded = motionsFromDocuments(index, files);
  return loaded;
}

export function motionByFile(file: string): MotionDef | undefined {
  return loaded.find((motion) => motion.file === file);
}

/** Delay becomes the apply frame. Speed becomes the stretch of the relative frames. */
export function timingFromChoices(speedId: string, delayId: string, fps: number): MotionTiming {
  const speed = SPEED_CHOICES.find((choice) => choice.id === speedId) ?? SPEED_CHOICES[1];
  const delay = DELAY_CHOICES.find((choice) => choice.id === delayId) ?? DELAY_CHOICES[0];
  const rate = Number.isInteger(fps) && fps > 0 ? fps : 30;
  return {
    applyFrame: Math.round(delay.seconds * rate),
    factor: speed.factor,
  };
}

function identity(property: string): number {
  return property === "attr.opacity" || property.startsWith("transform.scale") ? 1 : 0;
}

function stackValue(property: string, rest: number, relative: number): number {
  return identity(property) === 1 ? rest * relative : rest + relative;
}

function settledNumber(node: SceneNode, property: string, owned: number[]): number {
  const track = node.tracks.find((item) => item.property === property);
  const fallback = identity(property);
  if (!track) return fallback;
  const ownedFrames = new Set(owned);
  const kept = track.keys.filter((key) => !ownedFrames.has(key.frame) && typeof key.value === "number");
  if (kept.length > 0) {
    const atZero = kept.find((key) => key.frame === 0);
    const pick = atZero ?? kept[0];
    return typeof pick?.value === "number" ? pick.value : fallback;
  }
  let last: Keyframe | undefined;
  for (const key of track.keys) {
    if (typeof key.value !== "number") continue;
    if (!last || key.frame >= last.frame) last = key;
  }
  return typeof last?.value === "number" ? last.value : fallback;
}

function stripOwned(node: SceneNode, frames: Record<string, number[]>): void {
  for (const [property, list] of Object.entries(frames)) {
    const track = node.tracks.find((item) => item.property === property);
    if (!track) continue;
    const owned = new Set(list);
    track.keys = track.keys.filter((key) => !owned.has(key.frame));
    if (track.keys.length === 0) node.tracks = node.tracks.filter((item) => item !== track);
  }
}

function absorbHold(node: SceneNode, property: string): number | undefined {
  const track = node.tracks.find((item) => item.property === property);
  if (!track || track.keys.length !== 1) return undefined;
  const value = track.keys[0]?.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  node.tracks = node.tracks.filter((item) => item !== track);
  return value;
}

function placeFrames(keys: Keyframe[], applyFrame: number, factor: number): Keyframe[] {
  const origin = Number.isInteger(applyFrame) && applyFrame > 0 ? applyFrame : 0;
  const stretch = Number.isFinite(factor) && factor > 0 ? factor : 1;
  let previous = -1;
  return keys.map((key) => {
    let frame = origin + Math.round(key.frame * stretch);
    if (!Number.isFinite(frame) || frame < 0) frame = origin;
    if (frame <= previous) frame = previous + 1;
    previous = frame;
    const next: Keyframe = { frame, value: key.value };
    if (key.easing !== undefined) next.easing = key.easing;
    return next;
  });
}

function putKeys(node: SceneNode, property: string, keys: Keyframe[]): void {
  const frames = new Set(keys.map((key) => key.frame));
  const existing = node.tracks.find((item) => item.property === property);
  const kept = existing ? existing.keys.filter((key) => !frames.has(key.frame)) : [];
  const next = [...kept, ...keys].sort((left, right) => left.frame - right.frame);
  if (existing) existing.keys = next;
  else node.tracks.push({ property, keys: next });
}

/**
 * Scale turns about the element's rest center, not the artboard origin.
 * Translate keys carry the compensation, with the same frames and easing as the scale.
 */
function writeScalePivot(
  state: EditorState,
  node: SceneNode,
  rests: Map<string, number>,
  written: Record<string, number[]>,
): void {
  if (!written["transform.scaleX"] && !written["transform.scaleY"]) return;
  const center = restCenter(node);
  if (!center) return;
  const frames = [...new Set([...(written["transform.scaleX"] ?? []), ...(written["transform.scaleY"] ?? [])])].sort(
    (left, right) => left - right,
  );
  const first = frames[0];
  if (first === undefined) return;
  if (first > 0) frames.unshift(0);
  for (const axis of ["X", "Y"] as const) {
    const scaleProperty = `transform.scale${axis}`;
    const translateProperty = `transform.translate${axis}`;
    const local = axis === "X" ? center.x : center.y;
    const restScale = rests.get(scaleProperty) ?? 1;
    const restTranslate = rests.get(translateProperty) ?? 0;
    const owned = new Set(written[translateProperty] ?? []);
    const authored = new Map<number, number>();
    for (const key of node.tracks.find((item) => item.property === translateProperty)?.keys ?? []) {
      if (owned.has(key.frame) && typeof key.value === "number") authored.set(key.frame, key.value);
    }
    const keys: Keyframe[] = frames.map((frame) => {
      const scale = heldNumber(node, scaleProperty, frame, restScale);
      const easing = node.tracks.find((item) => item.property === scaleProperty)?.keys.find((key) => key.frame === frame)?.easing;
      const value = (authored.get(frame) ?? restTranslate) + local * (restScale - scale);
      return easing !== undefined ? { frame, value, easing } : { frame, value };
    });
    putKeys(node, translateProperty, keys);
    written[translateProperty] = keys.map((key) => key.frame);
  }
  if (!state.texts[node.id]) state.origins[node.id] = { x: center.x, y: center.y };
}

/**
 * Write one motion onto a node, relative to the apply frame, stacked on the rest pose.
 * A previous Simple-mode motion on that node is replaced. Other tracks stay.
 */
export function applySimpleMotion(
  state: EditorState,
  nodeId: string,
  motion: MotionDef,
  timing: MotionTiming,
): MotionWrite | null {
  const node = nodeById(state, nodeId);
  if (!node || motion.tracks.length === 0) return null;
  const previous = state.simpleMotions[nodeId];
  const owned = previous?.frames ?? {};
  const properties = new Set<string>([
    ...Object.keys(owned),
    ...motion.tracks.map((track) => track.property),
    "transform.translateX",
    "transform.translateY",
    "transform.scaleX",
    "transform.scaleY",
  ]);
  const rests = new Map<string, number>();
  for (const property of properties) rests.set(property, settledNumber(node, property, owned[property] ?? []));
  if (previous) stripOwned(node, previous.frames);
  for (const track of motion.tracks) {
    const held = absorbHold(node, track.property);
    if (held !== undefined) rests.set(track.property, held);
  }
  const written: Record<string, number[]> = {};
  let lastFrame = 0;
  for (const track of motion.tracks) {
    const rest = rests.get(track.property) ?? identity(track.property);
    const keys = placeFrames(track.keys, timing.applyFrame, timing.factor).map((key) => ({
      frame: key.frame,
      value: stackValue(track.property, rest, typeof key.value === "number" ? key.value : 0),
      ...(key.easing !== undefined ? { easing: key.easing } : {}),
    }));
    putKeys(node, track.property, keys);
    written[track.property] = keys.map((key) => key.frame);
    for (const key of keys) lastFrame = Math.max(lastFrame, key.frame);
  }
  if (previous) {
    for (const property of Object.keys(previous.frames)) {
      if (written[property]) continue;
      const track = node.tracks.find((item) => item.property === property);
      if (track && track.keys.length > 0) continue;
      putKeys(node, property, [{ frame: 0, value: rests.get(property) ?? identity(property) }]);
    }
  }
  writeScalePivot(state, node, rests, written);
  state.simpleMotions[nodeId] = { file: motion.file, frames: written };
  if (lastFrame + 1 > state.composition.durationInFrames) {
    state.composition.durationInFrames = lastFrame + 1;
  }
  return { lastFrame };
}
