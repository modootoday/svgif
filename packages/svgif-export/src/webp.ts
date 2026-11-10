/**
 * Animated WebP export.
 * Each integer frame is one `renderFrame` call. The file is RIFF/WEBP.
 * The canvas width and height are the composition width and height.
 * Each frame is one opaque lossless image of that size.
 * Frame duration is an integer number of milliseconds from `frame` and `fps`.
 * Canvas pixels are not hashed. [[sot:svgif/determinism]]
 * The encoder stays in this package. [[adr:svgif/20261110121700]]
 * This module does not encode WebM or MP4. GIF is not a release row.
 * It does not open a socket.
 */

import { sample } from "../../svgif/src/ir/sample.ts";
import { formatUnit } from "../../svgif/src/ir/quantize.ts";
import type { IrValue } from "../../svgif/src/ir/types.ts";
import type { SvgComposition, SvgNode } from "./svg.ts";

export interface WebpExporter {
  readonly id: "webp";
  readonly schema: "svgif.exporter/1";
  export(composition: SvgComposition): Blob;
}

/** Lossless WebP stores the edge minus one in 14 bits. */
const MAX_EDGE = 16384;

const COMPOSITION_KEYS = ["fps", "width", "height", "durationInFrames", "nodes"];

const encoder = new TextEncoder();

class BitWriter {
  private readonly bytes: number[] = [];
  private acc = 0;
  private n = 0;

  write(value: number, bits: number): void {
    for (let index = 0; index < bits; index += 1) {
      const bit = (value >>> index) & 1;
      this.acc |= bit << this.n;
      this.n += 1;
      if (this.n === 8) {
        this.bytes.push(this.acc);
        this.acc = 0;
        this.n = 0;
      }
    }
  }

  finish(): Uint8Array {
    if (this.n > 0) this.bytes.push(this.acc);
    return Uint8Array.from(this.bytes);
  }
}

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

function xmlEscape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatSample(value: IrValue): string {
  if (typeof value === "number") return formatUnit(value);
  if (typeof value === "string") return value;
  return value.map((item) => formatUnit(item)).join(" ");
}

/**
 * One SVG document for an integer frame.
 * Time inputs are `frame` and `fps`. The string is the sampled composition.
 */
export function renderFrame(composition: SvgComposition, frame: number): string {
  const document = assertComposition(composition);
  if (!Number.isInteger(frame) || frame < 0 || frame >= document.durationInFrames) {
    throw new TypeError("frame must be an integer inside the composition");
  }
  const sampled = sample(document, frame);
  const width = formatUnit(document.width);
  const height = formatUnit(document.height);
  const lines = document.nodes.map((node) => {
    const values = sampled[node.id] ?? {};
    const props = Object.keys(values)
      .sort()
      .map((key) => `${xmlEscape(key)}="${xmlEscape(formatSample(values[key] as IrValue))}"`)
      .join(" ");
    const extra = props.length > 0 ? ` ${props}` : "";
    return `<g id="${xmlEscape(node.id)}"${extra}/>`;
  });
  const body = lines.join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-frame="${frame}">\n` +
    `${body}\n` +
    `</svg>\n`
  );
}

function writeSimple(bits: BitWriter, symbol: number): void {
  bits.write(1, 1);
  bits.write(0, 1);
  if (symbol < 2) {
    bits.write(0, 1);
    bits.write(symbol, 1);
    return;
  }
  bits.write(1, 1);
  bits.write(symbol, 8);
}

/** One opaque lossless image. Trailing bits past the last pixel are ignored. */
function losslessImage(width: number, height: number): Uint8Array {
  const bits = new BitWriter();
  bits.write(width - 1, 14);
  bits.write(height - 1, 14);
  bits.write(0, 1);
  bits.write(0, 3);
  bits.write(0, 1);
  bits.write(0, 1);
  bits.write(0, 1);
  writeSimple(bits, 255);
  writeSimple(bits, 255);
  writeSimple(bits, 255);
  writeSimple(bits, 255);
  writeSimple(bits, 0);
  const packed = bits.finish();
  const payload = new Uint8Array(1 + packed.length);
  payload[0] = 0x2f;
  payload.set(packed, 1);
  return payload;
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

/** RIFF chunk. An odd payload is followed by one zero pad byte that is not in the size. */
function riffChunk(tag: string, data: Uint8Array): Uint8Array {
  const size = data.length + (data.length % 2);
  const out = new Uint8Array(8 + size);
  out.set(encoder.encode(tag), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function writeU24(view: DataView, offset: number, value: number): void {
  view.setUint8(offset, value & 0xff);
  view.setUint8(offset + 1, (value >>> 8) & 0xff);
  view.setUint8(offset + 2, (value >>> 16) & 0xff);
}

function vp8x(width: number, height: number): Uint8Array {
  const data = new Uint8Array(10);
  const view = new DataView(data.buffer);
  data[0] = 0x02;
  writeU24(view, 4, width - 1);
  writeU24(view, 7, height - 1);
  return data;
}

function anim(): Uint8Array {
  return Uint8Array.of(255, 255, 255, 255, 0, 0);
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

function anmf(width: number, height: number, durationMs: number, image: Uint8Array): Uint8Array {
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  writeU24(view, 0, 0);
  writeU24(view, 3, 0);
  writeU24(view, 6, width - 1);
  writeU24(view, 9, height - 1);
  writeU24(view, 12, durationMs);
  header[15] = 0x02;
  return riffChunk("ANMF", concat([header, riffChunk("VP8L", image)]));
}

/** Write an animated WebP. One ANMF chunk per integer frame from `renderFrame`. */
export function exportWebp(composition: SvgComposition): Blob {
  const document = assertComposition(composition);
  const pictures: string[] = [];
  for (let frame = 0; frame < document.durationInFrames; frame += 1) {
    pictures.push(renderFrame(document, frame));
  }
  const image = losslessImage(document.width, document.height);
  const parts = [riffChunk("VP8X", vp8x(document.width, document.height)), riffChunk("ANIM", anim())];
  for (const duration of frameDurations(document.fps, pictures.length)) {
    parts.push(anmf(document.width, document.height, duration, image));
  }
  const body = concat([encoder.encode("WEBP"), ...parts]);
  const file = concat([encoder.encode("RIFF"), u32(body.length), body]);
  return new Blob([file], { type: "image/webp" });
}

function u32(value: number): Uint8Array {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value, true);
  return data;
}

export const webpExporter: WebpExporter = {
  id: "webp",
  schema: "svgif.exporter/1",
  export(composition: SvgComposition): Blob {
    return exportWebp(composition);
  },
};
