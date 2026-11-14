/**
 * WebM export.
 * Each integer frame is one `renderFrame` call. The file is EBML.
 * The DocType is webm. Segment Info Duration is the composition length
 * in milliseconds, and TimestampScale is one million.
 * The track width and height are the composition width and height.
 * The synchronous `exportWebm` records the duration and does not store a picture.
 * `exportAnimatedWebm` muxes frames from the browser video encoder.
 * Canvas pixels are not hashed.
 * This module does not encode MP4. GIF is not a release row.
 * It does not open a socket.
 * [[sot:svgif/studio-export]]
 */

import { encodeVideoTrack, renderFrame } from "./webp.ts";
import type { SvgComposition, SvgNode } from "./svg.ts";

export interface WebmExporter {
  readonly id: "webm";
  readonly schema: "svgif.exporter/1";
  export(composition: SvgComposition): Blob;
}

/** The same edge cap as the lossless image writer in this package. */
const MAX_EDGE = 16384;
const TIMESTAMP_SCALE = 1000000;
const MAX_BLOCK_TIME = 32767;
const APP = "@modootoday/svgif-export";

const COMPOSITION_KEYS = ["fps", "width", "height", "durationInFrames", "nodes"];

const ID = {
  ebml: [0x1a, 0x45, 0xdf, 0xa3],
  ebmlVersion: [0x42, 0x86],
  ebmlReadVersion: [0x42, 0xf7],
  ebmlMaxIdLength: [0x42, 0xf2],
  ebmlMaxSizeLength: [0x42, 0xf3],
  docType: [0x42, 0x82],
  docTypeVersion: [0x42, 0x87],
  docTypeReadVersion: [0x42, 0x85],
  segment: [0x18, 0x53, 0x80, 0x67],
  info: [0x15, 0x49, 0xa9, 0x66],
  timestampScale: [0x2a, 0xd7, 0xb1],
  duration: [0x44, 0x89],
  muxingApp: [0x4d, 0x80],
  writingApp: [0x57, 0x41],
  tracks: [0x16, 0x54, 0xae, 0x6b],
  trackEntry: [0xae],
  trackNumber: [0xd7],
  trackUid: [0x73, 0xc5],
  trackType: [0x83],
  codecId: [0x86],
  codecPrivate: [0x63, 0xa2],
  video: [0xe0],
  pixelWidth: [0xb0],
  pixelHeight: [0xba],
  cluster: [0x1f, 0x43, 0xb6, 0x75],
  timestamp: [0xe7],
  simpleBlock: [0xa3],
} as const;

const encoder = new TextEncoder();

/**
 * Placeholder block payload for the synchronous writer Studio still calls.
 * It is not a picture. `exportAnimatedWebm` writes encoded frames instead.
 */
const PLACEHOLDER = Uint8Array.of(0x00, 0x00, 0x00);

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const present = Object.keys(value);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
  for (const key of present) {
    if (!keys.includes(key)) throw new TypeError(`${label}.${key} is not allowed`);
  }
}

function assertPositiveInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function assertEdge(value: number, label: string): number {
  if (value > MAX_EDGE) throw new TypeError(`${label} must be at most ${MAX_EDGE}`);
  return value;
}

function assertComposition(value: unknown): SvgComposition {
  const composition = assertObject(value, "composition");
  exactKeys(composition, COMPOSITION_KEYS, "composition");
  if (!Array.isArray(composition.nodes)) throw new TypeError("composition.nodes must be an array");
  return {
    fps: assertPositiveInt(composition.fps, "composition.fps"),
    width: assertEdge(assertPositiveInt(composition.width, "composition.width"), "composition.width"),
    height: assertEdge(assertPositiveInt(composition.height, "composition.height"), "composition.height"),
    durationInFrames: assertPositiveInt(composition.durationInFrames, "composition.durationInFrames"),
    nodes: composition.nodes as SvgNode[],
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** EBML element size. The leading marker bit selects the width. */
function encodeVint(value: number): Uint8Array {
  let width = 1;
  let limit = 0x80;
  while (value >= limit) {
    width += 1;
    limit *= 0x80;
  }
  const out = new Uint8Array(width);
  let rest = value;
  for (let index = width - 1; index >= 0; index -= 1) {
    out[index] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  out[0] |= 1 << (8 - width);
  return out;
}

function element(id: readonly number[], data: Uint8Array): Uint8Array {
  const size = encodeVint(data.length);
  const out = new Uint8Array(id.length + size.length + data.length);
  out.set(id, 0);
  out.set(size, id.length);
  out.set(data, id.length + size.length);
  return out;
}

function master(id: readonly number[], children: Uint8Array[]): Uint8Array {
  return element(id, concat(children));
}

function uintBytes(value: number): Uint8Array {
  if (value === 0) return Uint8Array.of(0);
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0) {
    bytes.push(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  bytes.reverse();
  return Uint8Array.from(bytes);
}

function uintEl(id: readonly number[], value: number): Uint8Array {
  return element(id, uintBytes(value));
}

function floatEl(id: readonly number[], value: number): Uint8Array {
  const data = new Uint8Array(8);
  new DataView(data.buffer).setFloat64(0, value, false);
  return element(id, data);
}

function stringEl(id: readonly number[], value: string): Uint8Array {
  return element(id, encoder.encode(value));
}

/**
 * Milliseconds for each integer frame.
 * The total is `round(frameCount * 1000 / fps)`, and at least one millisecond per frame.
 */
function frameDurations(fps: number, frameCount: number): number[] {
  const rounded = Math.round((frameCount * 1000) / fps);
  const total = rounded < frameCount ? frameCount : rounded;
  const base = Math.floor(total / frameCount);
  const extra = total % frameCount;
  const durations: number[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    durations.push(base + (index < extra ? 1 : 0));
  }
  return durations;
}

function simpleBlock(relative: number, payload: Uint8Array, key: boolean): Uint8Array {
  const body = new Uint8Array(4 + payload.length);
  body[0] = 0x81;
  new DataView(body.buffer).setInt16(1, relative, false);
  body[3] = key ? 0x80 : 0x00;
  body.set(payload, 4);
  return element(ID.simpleBlock, body);
}

function cluster(origin: number, blocks: Uint8Array[]): Uint8Array {
  return master(ID.cluster, [uintEl(ID.timestamp, origin), ...blocks]);
}

/** One cluster per span that fits in a signed 16-bit block time. */
function clusters(durations: number[], payloads: Uint8Array[], keys: boolean[]): Uint8Array[] {
  const groups: Uint8Array[] = [];
  let blocks: Uint8Array[] = [];
  let origin = 0;
  let cursor = 0;
  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index] ?? 0;
    if (blocks.length > 0 && cursor - origin > MAX_BLOCK_TIME) {
      groups.push(cluster(origin, blocks));
      blocks = [];
      origin = cursor;
    }
    blocks.push(simpleBlock(cursor - origin, payloads[index] ?? PLACEHOLDER, keys[index] !== false));
    cursor += duration;
  }
  if (blocks.length > 0) groups.push(cluster(origin, blocks));
  return groups;
}

function header(): Uint8Array {
  return master(ID.ebml, [
    uintEl(ID.ebmlVersion, 1),
    uintEl(ID.ebmlReadVersion, 1),
    uintEl(ID.ebmlMaxIdLength, 4),
    uintEl(ID.ebmlMaxSizeLength, 8),
    stringEl(ID.docType, "webm"),
    uintEl(ID.docTypeVersion, 4),
    uintEl(ID.docTypeReadVersion, 2),
  ]);
}

function info(durationMs: number): Uint8Array {
  return master(ID.info, [
    uintEl(ID.timestampScale, TIMESTAMP_SCALE),
    floatEl(ID.duration, durationMs),
    stringEl(ID.muxingApp, APP),
    stringEl(ID.writingApp, APP),
  ]);
}

function tracks(width: number, height: number, codec: string, codecPrivate?: Uint8Array): Uint8Array {
  const entry = [
    uintEl(ID.trackNumber, 1),
    uintEl(ID.trackUid, 1),
    uintEl(ID.trackType, 1),
    stringEl(ID.codecId, codec),
  ];
  if (codecPrivate && codecPrivate.length > 0) entry.push(element(ID.codecPrivate, codecPrivate));
  entry.push(master(ID.video, [uintEl(ID.pixelWidth, width), uintEl(ID.pixelHeight, height)]));
  return master(ID.tracks, [master(ID.trackEntry, entry)]);
}

function webmFile(
  document: SvgComposition,
  durations: number[],
  payloads: Uint8Array[],
  keys: boolean[],
  codec: string,
  codecPrivate?: Uint8Array,
): Blob {
  const durationMs = durations.reduce((sum, duration) => sum + duration, 0);
  const body = concat([
    info(durationMs),
    tracks(document.width, document.height, codec, codecPrivate),
    ...clusters(durations, payloads, keys),
  ]);
  return new Blob([concat([header(), element(ID.segment, body)])], { type: "video/webm" });
}

/**
 * Synchronous container Studio still calls.
 * The file is EBML and records the duration. It does not store a picture.
 * Call `exportAnimatedWebm`.
 */
export function exportWebm(composition: SvgComposition): Blob {
  const document = assertComposition(composition);
  const pictures: string[] = [];
  for (let frame = 0; frame < document.durationInFrames; frame += 1) {
    pictures.push(renderFrame(document, frame));
  }
  const durations = frameDurations(document.fps, pictures.length);
  const payloads = durations.map(() => PLACEHOLDER);
  const keys = durations.map(() => true);
  return webmFile(document, durations, payloads, keys, "V_VP8");
}

/** Rasterize each frame and mux a VP8 or VP9 picture. Unsupported codecs throw. */
export async function exportAnimatedWebm(composition: SvgComposition): Promise<Blob> {
  const document = assertComposition(composition);
  const track = await encodeVideoTrack(document, ["vp8", "vp09.00.10.08"]);
  const codec = track.codec === "vp9" ? "V_VP9" : "V_VP8";
  return webmFile(
    document,
    track.samples.map((sample) => sample.durationMs),
    track.samples.map((sample) => sample.data),
    track.samples.map((sample) => sample.key),
    codec,
    track.description,
  );
}

export const webmExporter: WebmExporter = {
  id: "webm",
  schema: "svgif.exporter/1",
  export(composition: SvgComposition): Blob {
    return exportWebm(composition);
  },
};
