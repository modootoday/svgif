/**
 * MP4 export.
 * Each integer frame is one `renderFrame` call. The file begins with an ftyp box.
 * The movie header records the duration in milliseconds, and the timescale is one thousand.
 * The track width and height are the composition width and height.
 * The synchronous `exportMp4` records the duration and does not store a picture.
 * `exportAnimatedMp4` muxes H.264 frames from the browser video encoder.
 * Canvas pixels are not hashed.
 * The encoder stays in this package. [[adr:svgif/20261110121700]]
 * GIF is not a release row. It does not open a socket.
 * This is the MP4 exporter on the critical path into Studio.
 * [[sot:svgif/studio-export]]
 */

import { encodeVideoTrack, ExportCapabilityError, renderFrame } from "./webp.ts";
import type { VideoTrack } from "./webp.ts";
import type { SvgComposition, SvgNode } from "./svg.ts";

export interface Mp4Exporter {
  readonly id: "mp4";
  readonly schema: "svgif.exporter/1";
  export(composition: SvgComposition): Blob;
}

/** The same edge cap as the lossless image writer in this package. */
const MAX_EDGE = 16384;
const TIMESCALE = 1000;
/**
 * Placeholder sample for the synchronous writer Studio still calls.
 * It is not a picture. `exportAnimatedMp4` writes encoded frames instead.
 */
const PLACEHOLDER = Uint8Array.of(0x00, 0x00, 0x00, 0x00);

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
  return fullBox("stsz", 0, 0, concat([u32(PLACEHOLDER.length), u32(sampleCount)]));
}

function stszSizes(sizes: number[]): Uint8Array {
  return fullBox("stsz", 0, 0, concat([u32(0), u32(sizes.length), ...sizes.map((size) => u32(size))]));
}

function stss(samples: number[]): Uint8Array {
  return fullBox("stss", 0, 0, concat([u32(samples.length), ...samples.map((sample) => u32(sample))]));
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
  return box("mdat", new Uint8Array(sampleCount * PLACEHOLDER.length));
}

function avccSample(data: Uint8Array): Uint8Array {
  const annex = data.length >= 3 && data[0] === 0 && data[1] === 0 && (data[2] === 1 || (data[2] === 0 && data[3] === 1));
  if (!annex) return data;
  const parts: Uint8Array[] = [];
  let index = 0;
  while (index < data.length) {
    let start = -1;
    for (let cursor = index; cursor < data.length - 2; cursor += 1) {
      if (data[cursor] === 0 && data[cursor + 1] === 0 && (data[cursor + 2] === 1 || (data[cursor + 2] === 0 && data[cursor + 3] === 1))) {
        start = cursor;
        break;
      }
    }
    if (start < 0) break;
    const prefix = data[start + 2] === 1 ? 3 : 4;
    const next = (() => {
      for (let cursor = start + prefix; cursor < data.length - 2; cursor += 1) {
        if (data[cursor] === 0 && data[cursor + 1] === 0 && (data[cursor + 2] === 1 || (data[cursor + 2] === 0 && data[cursor + 3] === 1))) {
          return cursor;
        }
      }
      return data.length;
    })();
    const nal = data.subarray(start + prefix, next);
    const sized = new Uint8Array(4 + nal.length);
    new DataView(sized.buffer).setUint32(0, nal.length, false);
    sized.set(nal, 4);
    parts.push(sized);
    index = next;
  }
  return parts.length > 0 ? concat(parts) : data;
}

function visualAvc(width: number, height: number, description: Uint8Array): Uint8Array {
  const name = new Uint8Array(32);
  const label = encoder.encode("svgif");
  name[0] = label.length;
  name.set(label, 1);
  return box(
    "avc1",
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
      box("avcC", description),
    ]),
  );
}

function moovAvc(width: number, height: number, samples: Uint8Array[], durations: number[], duration: number, chunkOffset: number, description: Uint8Array): Uint8Array {
  const keys = samples.map((_, index) => index + 1);
  const table = box(
    "stbl",
    concat([
      fullBox("stsd", 0, 0, concat([u32(1), visualAvc(width, height, description)])),
      stts(durations),
      stsc(samples.length),
      stszSizes(samples.map((sample) => sample.length)),
      stss(keys),
      stco(chunkOffset),
    ]),
  );
  const media = box("minf", concat([vmhd(), box("dinf", dref()), table]));
  const track = box("trak", concat([tkhd(duration, width, height), box("mdia", concat([mdhd(duration), hdlr(), media]))]));
  return box("moov", concat([mvhd(duration), track]));
}

/**
 * Synchronous container Studio still calls.
 * The file begins with an ftyp box and records the duration.
 * It does not store a picture. Call `exportAnimatedMp4`.
 */
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

/** Rasterize each frame and mux an H.264 picture. An unsupported codec throws. */
export async function exportAnimatedMp4(composition: SvgComposition): Promise<Blob> {
  const document = assertComposition(composition);
  const track: VideoTrack = await encodeVideoTrack(document, ["avc1.640028", "avc1.4d001f", "avc1.42001f"]);
  if (track.codec !== "avc" || !track.description || track.description.length < 1) {
    throw new ExportCapabilityError("codec-unsupported", "This browser cannot encode this video. The video was not written.");
  }
  const samples = track.samples.map((sample) => avccSample(sample.data));
  const durations = track.samples.map((sample) => sample.durationMs);
  const duration = durations.reduce((sum, item) => sum + item, 0);
  const header = ftyp();
  const payload = concat(samples);
  const probe = moovAvc(document.width, document.height, samples, durations, duration, 0, track.description);
  const chunkOffset = header.length + probe.length + 8;
  const file = concat([
    header,
    moovAvc(document.width, document.height, samples, durations, duration, chunkOffset, track.description),
    box("mdat", payload),
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
