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
 * A node `text` string is SVG `<text>` for that frame. The font stack, fill,
 * size, and opacity match the SVG export. The baseline is the local origin.
 * Translate, rotate, and scale, including a scale pivot carried on the
 * translate tracks, are the sampled values at that frame. An empty string
 * draws nothing. [[sot:svgif/animation-ir]] [[adr:svgif/20261114074819]]
 */

import { formatCssValue } from "../../svgif/src/backend/css/print.ts";
import { sample } from "../../svgif/src/ir/sample.ts";
import { formatUnit } from "../../svgif/src/ir/quantize.ts";
import type { IrValue } from "../../svgif/src/ir/types.ts";
import { escapeXmlText, TEXT_FONT_FAMILY } from "../../svgif/src/lower/text.ts";
import type { SvgComposition, SvgNode } from "./svg.ts";

/** SVG initial `medium` size, in user units. The compilers leave `font-size` here. */
const TEXT_FONT_SIZE = 16;

/**
 * A 2D context that can draw one string. The baseline is alphabetic, at the
 * local origin, and the current transform is the sampled node transform.
 */
export interface FramePainter {
  font: string;
  fillStyle: string;
  globalAlpha: number;
  textBaseline: string;
  textAlign: string;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillText(text: string, x: number, y: number): void;
}

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
  return value.map((item) => (typeof item === "number" ? formatUnit(item) : String(item))).join(" ");
}

function assertFrame(document: SvgComposition, frame: number): void {
  if (!Number.isInteger(frame) || frame < 0 || frame >= document.durationInFrames) {
    throw new TypeError("frame must be an integer inside the composition");
  }
}

function readNodeText(node: SvgNode): string | undefined {
  const value = (node as SvgNode & { text?: unknown }).text;
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: IrValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function affineMatrix(value: IrValue | undefined): [number, number, number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 6) return undefined;
  const numbers: number[] = [];
  for (const item of value) {
    if (typeof item !== "number") return undefined;
    numbers.push(item);
  }
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 0, numbers[4] ?? 0, numbers[5] ?? 0];
}

/**
 * Sampled 2D transform. A six-number matrix wins, as it does in the SVG export.
 * Otherwise the order is translate, then rotate, then scale, about the local
 * origin. A scale pivot is the translate written beside that scale.
 */
function transformOf(values: Record<string, IrValue>): {
  matrix: [number, number, number, number, number, number];
  attribute: string | undefined;
} {
  const matrix = affineMatrix(values["transform.matrix"]);
  if (matrix) {
    return {
      matrix,
      attribute: `matrix(${matrix.map((item) => formatUnit(item)).join(", ")})`,
    };
  }
  const tx = asNumber(values["transform.translateX"]);
  const ty = asNumber(values["transform.translateY"]);
  const rot = asNumber(values["transform.rotate"]);
  const sx = asNumber(values["transform.scaleX"]);
  const sy = asNumber(values["transform.scaleY"]);
  const translateX = tx ?? 0;
  const translateY = ty ?? 0;
  const degrees = rot ?? 0;
  const scaleX = sx ?? 1;
  const scaleY = sy ?? 1;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const parts: string[] = [];
  if (tx !== undefined || ty !== undefined) parts.push(`translate(${formatUnit(translateX)} ${formatUnit(translateY)})`);
  if (rot !== undefined) parts.push(`rotate(${formatUnit(degrees)})`);
  if (sx !== undefined || sy !== undefined) parts.push(`scale(${formatUnit(scaleX)} ${formatUnit(scaleY)})`);
  return {
    matrix: [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, translateX, translateY],
    attribute: parts.length > 0 ? parts.join(" ") : undefined,
  };
}

interface TextPlacement {
  fill: string;
  fillAttr: string | undefined;
  opacity: number;
  opacityAttr: string | undefined;
  transformAttr: string | undefined;
  matrix: [number, number, number, number, number, number];
  path: string | undefined;
}

function textPlacement(values: Record<string, IrValue>): TextPlacement {
  const fillValue = values["attr.fill"];
  const opacityValue = asNumber(values["attr.opacity"]);
  let fill = "#000000";
  let fillAttr: string | undefined;
  if (typeof fillValue === "string") {
    fill = formatCssValue("attr.fill", fillValue);
    fillAttr = `fill="${xmlEscape(fill)}"`;
  }
  const opacityAttr =
    opacityValue === undefined ? undefined : `opacity="${xmlEscape(formatCssValue("attr.opacity", opacityValue))}"`;
  const transform = transformOf(values);
  const pathValue = values["attr.d"];
  return {
    fill,
    fillAttr,
    opacity: opacityValue ?? 1,
    opacityAttr,
    transformAttr: transform.attribute,
    matrix: transform.matrix,
    path: typeof pathValue === "string" ? pathValue : undefined,
  };
}

function sampledAttributes(values: Record<string, IrValue>): string {
  return Object.keys(values)
    .sort()
    .map((key) => `${xmlEscape(key)}="${xmlEscape(formatSample(values[key] as IrValue))}"`)
    .join(" ");
}

const TEXT_FONT = `font-family="${xmlEscape(TEXT_FONT_FAMILY)}" font-size="${formatUnit(TEXT_FONT_SIZE)}"`;

function nodeMarkup(node: SvgNode, values: Record<string, IrValue>): string {
  const props = sampledAttributes(values);
  const extra = props.length > 0 ? ` ${props}` : "";
  const text = readNodeText(node);
  if (text === undefined) return `<g id="${xmlEscape(node.id)}"${extra}/>`;
  const placed = textPlacement(values);
  const paint = [placed.fillAttr, placed.opacityAttr].filter((item): item is string => item !== undefined).join(" ");
  const paintPart = paint.length > 0 ? ` ${paint}` : "";
  const transformPart = placed.transformAttr === undefined ? "" : ` transform="${placed.transformAttr}"`;
  const content = escapeXmlText(text);
  if (placed.path === undefined) {
    return `<text id="${xmlEscape(node.id)}"${extra}${paintPart} ${TEXT_FONT}${transformPart}>${content}</text>`;
  }
  const path = `<path d="${xmlEscape(placed.path)}"/>`;
  return `<g id="${xmlEscape(node.id)}"${extra}${paintPart}${transformPart}>${path}<text ${TEXT_FONT}>${content}</text></g>`;
}

/**
 * One SVG document for an integer frame.
 * Time inputs are `frame` and `fps`. The string is the sampled composition.
 * A node `text` string is an SVG `<text>` element with the same font stack,
 * fill, size, and opacity the SVG export uses. The baseline is the local
 * origin. Transform tracks are evaluated at this frame.
 */
export function renderFrame(composition: SvgComposition, frame: number): string {
  const document = assertComposition(composition);
  assertFrame(document, frame);
  const sampled = sample(document, frame);
  const width = formatUnit(document.width);
  const height = formatUnit(document.height);
  const lines = document.nodes.map((node) => nodeMarkup(node, sampled[node.id] ?? {}));
  const body = lines.join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-frame="${frame}">\n` +
    `${body}\n` +
    `</svg>\n`
  );
}

/**
 * Draw node text for one integer frame.
 * The calls match the `<text>` elements in `renderFrame`: same font, fill,
 * opacity, and transform, with the baseline at the local origin. An empty
 * or missing string draws nothing.
 */
export function paintFrame(composition: SvgComposition, frame: number, painter: FramePainter): void {
  const document = assertComposition(composition);
  assertFrame(document, frame);
  const sampled = sample(document, frame);
  for (const node of document.nodes) {
    const text = readNodeText(node);
    if (text === undefined || text.length === 0) continue;
    const placed = textPlacement(sampled[node.id] ?? {});
    painter.font = `${formatUnit(TEXT_FONT_SIZE)}px ${TEXT_FONT_FAMILY}`;
    painter.fillStyle = placed.fill;
    painter.globalAlpha = placed.opacity;
    painter.textBaseline = "alphabetic";
    painter.textAlign = "start";
    const [a, b, c, d, e, f] = placed.matrix;
    painter.setTransform(a, b, c, d, e, f);
    painter.fillText(text, 0, 0);
  }
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
