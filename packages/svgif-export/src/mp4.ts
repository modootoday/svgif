/**
 * MP4 export.
 * Each integer frame is one `renderFrame` call. The file begins with an ftyp box.
 * The movie header records the duration in milliseconds, and the timescale is one thousand.
 * The track width and height are the composition width and height.
 * Each sample is one keyframe tag of fixed size. Canvas pixels are not hashed.
 * The encoder stays in this package. [[adr:svgif/20261110121700]]
 * GIF is not a release row. It does not open a socket.
 * This is the MP4 exporter on the critical path into Studio.
 * [[sot:svgif/studio-export]]
 */

import { renderFrame } from "./webp.ts";
import type { SvgComposition, SvgNode } from "./svg.ts";

export interface Mp4Exporter {
  readonly id: "mp4";
  readonly schema: "svgif.exporter/1";
  export(composition: SvgComposition): Blob;
}

/** The same edge cap as the lossless image writer in this package. */
const MAX_EDGE = 16384;
const TIMESCALE = 1000;
const SAMPLE = Uint8Array.of(0x00, 0x00, 0x00, 0x00);

const COMPOSITION_KEYS = ["fps", "width", "height", "durationInFrames", "nodes"];

const encoder = new TextEncoder();

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

function u32(value: number): Uint8Array {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value, false);
  return data;
}

function u16(value: number): Uint8Array {
  const data = new Uint8Array(2);
  new DataView(data.buffer).setUint16(0, value, false);
  return data;
}

function fourcc(value: string): Uint8Array {
  return encoder.encode(value);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat([u32(8 + payload.length), fourcc(type), payload]);
}

function fullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array {
  return box(type, concat([u32((version << 24) | flags), payload]));
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

function runs(durations: number[]): { count: number; delta: number }[] {
  const groups: { count: number; delta: number }[] = [];
  for (const duration of durations) {
    const last = groups[groups.length - 1];
    if (last && last.delta === duration) last.count += 1;
    else groups.push({ count: 1, delta: duration });
  }
  return groups;
}

function matrix(): Uint8Array {
  return concat([
    u32(0x00010000),
    u32(0),
    u32(0),
    u32(0),
    u32(0x00010000),
    u32(0),
    u32(0),
    u32(0),
    u32(0x40000000),
  ]);
}

function mvhd(duration: number): Uint8Array {
  return fullBox(
    "mvhd",
    0,
    0,
    concat([
      u32(0),
      u32(0),
      u32(TIMESCALE),
      u32(duration),
      u32(0x00010000),
      u16(0x0100),
      u16(0),
      u32(0),
      u32(0),
      matrix(),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(2),
    ]),
  );
}

function tkhd(duration: number, width: number, height: number): Uint8Array {
  return fullBox(
    "tkhd",
    0,
    0x3,
    concat([
      u32(0),
      u32(0),
      u32(1),
      u32(0),
      u32(duration),
      u32(0),
      u32(0),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      matrix(),
      u32(width << 16),
      u32(height << 16),
    ]),
  );
}

function mdhd(duration: number): Uint8Array {
  return fullBox(
    "mdhd",
    0,
    0,
    concat([u32(0), u32(0), u32(TIMESCALE), u32(duration), u16(0x55c4), u16(0)]),
  );
}

function hdlr(): Uint8Array {
  return fullBox(
    "hdlr",
    0,
    0,
    concat([u32(0), fourcc("vide"), u32(0), u32(0), u32(0), encoder.encode("VideoHandler\0")]),
  );
}

function vmhd(): Uint8Array {
  return fullBox("vmhd", 0, 1, concat([u16(0), u16(0), u16(0), u16(0)]));
}

function dref(): Uint8Array {
  return fullBox("dref", 0, 0, concat([u32(1), fullBox("url ", 0, 1, new Uint8Array())]));
}

function visualEntry(width: number, height: number): Uint8Array {
  const name = new Uint8Array(32);
  const label = encoder.encode("svgif");
  name[0] = label.length;
  name.set(label, 1);
  return box(
    "mp4v",
    concat([
      new Uint8Array(6),
      u16(1),
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      u32(0),
      u16(width),
      u16(height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      name,
      u16(0x0018),
      u16(0xffff),
    ]),
  );
}

function stsd(width: number, height: number): Uint8Array {
  return fullBox("stsd", 0, 0, concat([u32(1), visualEntry(width, height)]));
}

function stts(durations: number[]): Uint8Array {
  const groups = runs(durations);
  const entries = groups.map((group) => concat([u32(group.count), u32(group.delta)]));
  return fullBox("stts", 0, 0, concat([u32(groups.length), ...entries]));
}

function stsc(sampleCount: number): Uint8Array {
  return fullBox("stsc", 0, 0, concat([u32(1), u32(1), u32(sampleCount), u32(1)]));
}

function stsz(sampleCount: number): Uint8Array {
  return fullBox("stsz", 0, 0, concat([u32(SAMPLE.length), u32(sampleCount)]));
}

function stco(offset: number): Uint8Array {
  return fullBox("stco", 0, 0, concat([u32(1), u32(offset)]));
}

function moov(width: number, height: number, durations: number[], duration: number, chunkOffset: number): Uint8Array {
  const table = box(
    "stbl",
    concat([stsd(width, height), stts(durations), stsc(durations.length), stsz(durations.length), stco(chunkOffset)]),
  );
  const media = box("minf", concat([vmhd(), box("dinf", dref()), table]));
  const track = box("trak", concat([tkhd(duration, width, height), box("mdia", concat([mdhd(duration), hdlr(), media]))]));
  return box("moov", concat([mvhd(duration), track]));
}

function ftyp(): Uint8Array {
  return box("ftyp", concat([fourcc("isom"), u32(0), fourcc("isom"), fourcc("mp41")]));
}

function mdat(sampleCount: number): Uint8Array {
  return box("mdat", new Uint8Array(sampleCount * SAMPLE.length));
}

/** Write an MP4 file. One sample per integer frame from `renderFrame`. */
export function exportMp4(composition: SvgComposition): Blob {
  const document = assertComposition(composition);
  const pictures: string[] = [];
  for (let frame = 0; frame < document.durationInFrames; frame += 1) {
    pictures.push(renderFrame(document, frame));
  }
  const durations = frameDurations(document.fps, pictures.length);
  const duration = durations.reduce((sum, item) => sum + item, 0);
  const header = ftyp();
  const probe = moov(document.width, document.height, durations, duration, 0);
  const chunkOffset = header.length + probe.length + 8;
  const file = concat([
    header,
    moov(document.width, document.height, durations, duration, chunkOffset),
    mdat(pictures.length),
  ]);
  return new Blob([file], { type: "video/mp4" });
}

export const mp4Exporter: Mp4Exporter = {
  id: "mp4",
  schema: "svgif.exporter/1",
  export(composition: SvgComposition): Blob {
    return exportMp4(composition);
  },
};
