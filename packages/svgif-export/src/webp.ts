/**
 * Animated WebP export.
 * `renderFrame` is one static SVG document for an integer frame: the shapes,
 * paint, opacity, transform, and text the SVG export shows at that frame.
 * `exportAnimatedWebp` rasterizes those documents in the browser and writes
 * a real VP8L picture for each frame.
 * Frame duration is an integer number of milliseconds from `frame` and `fps`.
 * The encoder stays in this package. [[adr:svgif/20261110121700]]
 * WebM or MP4 containers stay in their own modules. This module encodes the picture track those containers mux. GIF is not a release row.
 * It does not open a socket. [[sot:svgif/determinism]]
 * [[sot:svgif/animation-ir]] [[sot:svgif/studio-export]] [[adr:svgif/20261114074819]]
 */

import { lowerForCss } from "../../svgif/src/backend/css/lower.ts";
import { formatCssValue, stableSelectorId } from "../../svgif/src/backend/css/print.ts";
import { sample } from "../../svgif/src/ir/sample.ts";
import { formatUnit } from "../../svgif/src/ir/quantize.ts";
import type { IrTrack, IrValue, TimelineIr } from "../../svgif/src/ir/types.ts";
import { escapeXmlText, readText, TEXT_FONT_FAMILY } from "../../svgif/src/lower/text.ts";
import type { SvgComposition, SvgNode } from "./svg.ts";

/** The browser cannot rasterize a frame, or it cannot encode the video. */
export class ExportCapabilityError extends Error {
  readonly code: "raster-unsupported" | "codec-unsupported";

  constructor(code: "raster-unsupported" | "codec-unsupported", message: string) {
    super(message);
    this.name = "ExportCapabilityError";
    this.code = code;
  }
}

const RASTER_UNSUPPORTED = "This browser cannot rasterize a frame. The video was not written.";
const CODEC_UNSUPPORTED = "This browser cannot encode this video. The video was not written.";

export interface WebpExporter {
  readonly id: "webp";
  readonly schema: "svgif.exporter/1";
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
  return text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function assertFrame(document: SvgComposition, frame: number): void {
  if (!Number.isInteger(frame) || frame < 0 || frame >= document.durationInFrames) {
    throw new TypeError("frame must be an integer inside the composition");
  }
}

function asNumber(value: IrValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function orderedKeys(track: IrTrack | undefined): IrTrack["keys"] {
  if (!track) return [];
  return track.keys
    .map((key, index) => ({ key, index }))
    .sort((left, right) => left.key.frame - right.key.frame || left.index - right.index)
    .map((entry) => entry.key);
}

function pathText(track: IrTrack | undefined): string {
  const first = orderedKeys(track)[0];
  return first && typeof first.value === "string" ? first.value : "";
}

function trackOf(tracks: IrTrack[], property: string): IrTrack | undefined {
  return tracks.find((track) => track.property === property);
}

/** SVG transform attribute. The component order matches the SVG export. */
function svgTransform(values: Record<string, IrValue>): string | undefined {
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
  if (tx !== undefined || ty !== undefined) parts.push(`translate(${formatUnit(tx ?? 0)} ${formatUnit(ty ?? 0)})`);
  if (rot !== undefined) parts.push(`rotate(${formatUnit(rot)})`);
  if (sx !== undefined || sy !== undefined) parts.push(`scale(${formatUnit(sx ?? 1)} ${formatUnit(sy ?? 1)})`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function geometryAt(track: IrTrack | undefined, sampled: IrValue | undefined, frame: number): string {
  const first = pathText(track);
  if (frame === 0 && first.length > 0) return first;
  return typeof sampled === "string" ? sampled : first;
}

function paintAttr(name: string, property: string, value: IrValue | undefined): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return `${name}="${xmlEscape(formatCssValue(property, value))}"`;
}

function element(name: string, attrs: string[], inner: string, paired = false): string {
  const open = `<${name}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}`;
  if (!paired && inner.length === 0) return `${open}/>`;
  return `${open}>${inner}</${name}>`;
}

interface DrawnNode {
  defs: string[];
  body: string;
}

function renderStaticNode(ir: TimelineIr, nodeId: string, frame: number): DrawnNode {
  const source = ir.nodes.find((node) => node.id === nodeId);
  const tracks = source?.tracks ?? [];
  const values = sample(ir, frame)[nodeId] ?? {};
  const id = stableSelectorId(nodeId);
  const attrs = [`id="${xmlEscape(id)}"`];
  const shape = trackOf(tracks, "attr.d");
  const clip = trackOf(tracks, "clip");
  const mask = trackOf(tracks, "mask");
  const path = geometryAt(shape, values["attr.d"], frame);
  const hasPath = path.length > 0;
  if (hasPath) attrs.push(`d="${xmlEscape(path)}"`);
  for (const property of ["attr.fill", "attr.stroke", "attr.opacity"] as const) {
    const name = property === "attr.fill" ? "fill" : property === "attr.stroke" ? "stroke" : "opacity";
    const attr = paintAttr(name, property, values[property]);
    if (attr) attrs.push(attr);
  }
  const transform = svgTransform(values);
  if (transform) attrs.push(`transform="${transform}"`);
  const defs: string[] = [];
  if (clip) {
    const d = geometryAt(clip, values.clip, frame);
    defs.push(
      `<clipPath id="${xmlEscape(id)}-frame0" clipPathUnits="userSpaceOnUse"><path d="${xmlEscape(d)}"/></clipPath>`,
    );
    attrs.push(`clip-path="url(#${xmlEscape(id)}-frame0)"`);
  }
  if (mask) {
    const d = geometryAt(mask, values.mask, frame);
    defs.push(`<mask id="${xmlEscape(id)}-mask" maskUnits="userSpaceOnUse"><path d="${xmlEscape(d)}"/></mask>`);
    attrs.push(`mask="url(#${xmlEscape(id)}-mask)"`);
  }
  const text = source ? readText(source) : undefined;
  if (text === undefined) return { defs, body: element(hasPath ? "path" : "g", attrs, "") };
  const fontAttr = `font-family="${xmlEscape(TEXT_FONT_FAMILY)}"`;
  const textMarkup = element("text", [fontAttr], escapeXmlText(text), true);
  if (!hasPath) {
    attrs.push(fontAttr);
    return { defs, body: element("text", attrs, escapeXmlText(text), true) };
  }
  const pathAttrs = attrs.filter((attr) => attr.startsWith("d=") || attr.startsWith("transform="));
  const groupAttrs = attrs.filter((attr) => !attr.startsWith("d="));
  const pathMarkup = element("path", pathAttrs.filter((attr) => attr.startsWith("d=")), "");
  return { defs, body: element("g", groupAttrs, `${pathMarkup}${textMarkup}`) };
}

/**
 * One self-contained SVG document for an integer frame.
 * Shapes, paint, opacity, and text match the SVG export. The transform is the
 * sampled translate, rotate, and scale at this frame, including a scale pivot
 * already stored on the translate tracks. An empty string is an empty text
 * element. A missing string draws no text.
 */
export function renderFrame(composition: SvgComposition, frame: number): string {
  const document = assertComposition(composition);
  assertFrame(document, frame);
  const lowered = lowerForCss(document as TimelineIr).ir;
  const width = formatUnit(document.width);
  const height = formatUnit(document.height);
  const drawn = lowered.nodes.map((node) => renderStaticNode(lowered, node.id, frame));
  const defs = drawn.flatMap((node) => node.defs);
  const defsBlock = defs.length > 0 ? `<defs>\n${defs.join("\n")}\n</defs>\n` : "";
  const body = `${defsBlock}${drawn.map((node) => node.body).join("\n")}`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-frame="${frame}">\n` +
    `${body}\n` +
    `</svg>\n`
  );
}

interface Drawable extends CanvasImageSource {
  close?: () => void;
}

interface PlaneContext {
  drawImage(source: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  putImageData(data: ImageData, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  clearRect(x: number, y: number, w: number, h: number): void;
}

interface Plane {
  getContext(kind: "2d"): PlaneContext | null;
  width: number;
  height: number;
}

function drawingPlane(width: number, height: number): { canvas: Plane; ctx: PlaneContext } {
  const root = globalThis as {
    OffscreenCanvas?: new (w: number, h: number) => Plane;
    document?: { createElement(name: "canvas"): Plane };
  };
  if (typeof root.OffscreenCanvas === "function") {
    const canvas = new root.OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx && typeof ctx.getImageData === "function") return { canvas, ctx };
  }
  const creator = root.document;
  if (creator && typeof creator.createElement === "function") {
    const canvas = creator.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx && typeof ctx.getImageData === "function") return { canvas, ctx };
  }
  throw new ExportCapabilityError("raster-unsupported", RASTER_UNSUPPORTED);
}

async function svgImage(svg: string, width: number, height: number): Promise<{ source: Drawable; release: () => void }> {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const bitmap = globalThis.createImageBitmap;
  if (typeof bitmap === "function") {
    try {
      const source = await bitmap(blob, { resizeWidth: width, resizeHeight: height });
      return { source, release: () => source.close() };
    } catch {
      try {
        const source = await bitmap(blob);
        return { source, release: () => source.close() };
      } catch {
        // The image element is the other in-browser decode.
      }
    }
  }
  const ImageCtor = globalThis.Image;
  const urlApi = globalThis.URL;
  if (typeof ImageCtor !== "function" || typeof urlApi?.createObjectURL !== "function") {
    throw new ExportCapabilityError("raster-unsupported", RASTER_UNSUPPORTED);
  }
  const url = urlApi.createObjectURL(blob);
  const image = new ImageCtor();
  image.width = width;
  image.height = height;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ExportCapabilityError("raster-unsupported", RASTER_UNSUPPORTED));
      image.src = url;
    });
  } catch (error) {
    urlApi.revokeObjectURL(url);
    throw error;
  }
  return { source: image, release: () => urlApi.revokeObjectURL(url) };
}

/** Rasterize one frame SVG. Throws when the browser cannot paint it. */
export async function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8ClampedArray> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError("frame size must be a positive integer");
  }
  const { ctx } = drawingPlane(width, height);
  const loaded = await svgImage(svg, width, height);
  try {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(loaded.source, 0, 0, width, height);
  } finally {
    loaded.release();
  }
  const data = ctx.getImageData(0, 0, width, height).data;
  if (data.length !== width * height * 4) throw new ExportCapabilityError("raster-unsupported", RASTER_UNSUPPORTED);
  return new Uint8ClampedArray(data);
}

/** Rasterize every integer frame. The first failure throws and writes nothing. */
export async function rasterizeComposition(composition: SvgComposition): Promise<Uint8ClampedArray[]> {
  const document = assertComposition(composition);
  const frames: Uint8ClampedArray[] = [];
  for (let frame = 0; frame < document.durationInFrames; frame += 1) {
    frames.push(await rasterizeSvg(renderFrame(document, frame), document.width, document.height));
  }
  return frames;
}

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function writeHuffman(bits: BitWriter, code: number, length: number): void {
  for (let index = length - 1; index >= 0; index -= 1) bits.write((code >>> index) & 1, 1);
}

function canonical(lengths: number[]): { code: number; bits: number }[] {
  const symbols: number[] = [];
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    if ((lengths[symbol] ?? 0) > 0) symbols.push(symbol);
  }
  symbols.sort((left, right) => (lengths[left] ?? 0) - (lengths[right] ?? 0) || left - right);
  const codes: { code: number; bits: number }[] = [];
  let code = 0;
  let previous = 0;
  for (const symbol of symbols) {
    const length = lengths[symbol] ?? 0;
    code <<= length - previous;
    codes[symbol] = { code, bits: length };
    code += 1;
    previous = length;
  }
  return codes;
}

function writeCodeLengths(bits: BitWriter, lengths: number[]): { code: number; bits: number }[] {
  let count = 4;
  for (let index = 0; index < CODE_LENGTH_ORDER.length; index += 1) {
    const symbol = CODE_LENGTH_ORDER[index] ?? 0;
    if ((lengths[symbol] ?? 0) > 0) count = Math.max(count, index + 1);
  }
  bits.write(0, 1);
  bits.write(count - 4, 4);
  for (let index = 0; index < count; index += 1) {
    const symbol = CODE_LENGTH_ORDER[index] ?? 0;
    bits.write(lengths[symbol] ?? 0, 3);
  }
  bits.write(0, 1);
  return canonical(lengths);
}

function writeRepeated(bits: BitWriter, repeat: { code: number; bits: number }, times: number): void {
  let left = times;
  while (left > 0) {
    const run = left >= 6 ? 6 : 3;
    writeHuffman(bits, repeat.code, repeat.bits);
    bits.write(run - 3, 2);
    left -= run;
  }
}

/** Red, blue, or alpha. Every symbol 0 through 255 has an 8-bit code. */
function writeFlatChannel(bits: BitWriter): void {
  const lengths = new Array<number>(19).fill(0);
  lengths[8] = 1;
  lengths[16] = 1;
  const codes = writeCodeLengths(bits, lengths);
  const eight = codes[8];
  const repeat = codes[16];
  if (!eight || !repeat) throw new Error("prefix code is incomplete");
  writeHuffman(bits, eight.code, eight.bits);
  writeRepeated(bits, repeat, 255);
}

/** Green, plus the unused length symbols so the group alphabet is complete. */
function writeGreenChannel(bits: BitWriter): void {
  const lengths = new Array<number>(19).fill(0);
  lengths[8] = 1;
  lengths[16] = 2;
  lengths[18] = 2;
  const codes = writeCodeLengths(bits, lengths);
  const eight = codes[8];
  const repeat = codes[16];
  const zeros = codes[18];
  if (!eight || !repeat || !zeros) throw new Error("prefix code is incomplete");
  writeHuffman(bits, eight.code, eight.bits);
  writeRepeated(bits, repeat, 255);
  writeHuffman(bits, zeros.code, zeros.bits);
  bits.write(13, 7);
}

function writeDistance(bits: BitWriter): void {
  bits.write(1, 1);
  bits.write(0, 1);
  bits.write(0, 1);
  bits.write(0, 1);
}

/** One VP8L image from straight RGBA. No transform, no color cache, literals only. */
export function encodeLosslessRgba(width: number, height: number, pixels: Uint8ClampedArray): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) {
    throw new TypeError("frame size must be a positive integer");
  }
  if (pixels.length !== width * height * 4) throw new TypeError("pixels must cover the frame");
  let alphaUsed = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 255) !== 255) {
      alphaUsed = 1;
      break;
    }
  }
  const bits = new BitWriter();
  bits.write(width - 1, 14);
  bits.write(height - 1, 14);
  bits.write(alphaUsed, 1);
  bits.write(0, 3);
  bits.write(0, 1);
  bits.write(0, 1);
  bits.write(0, 1);
  writeGreenChannel(bits);
  writeFlatChannel(bits);
  writeFlatChannel(bits);
  writeFlatChannel(bits);
  writeDistance(bits);
  for (let index = 0; index < pixels.length; index += 4) {
    writeHuffman(bits, pixels[index + 1] ?? 0, 8);
    writeHuffman(bits, pixels[index] ?? 0, 8);
    writeHuffman(bits, pixels[index + 2] ?? 0, 8);
    writeHuffman(bits, pixels[index + 3] ?? 0, 8);
  }
  const packed = bits.finish();
  const payload = new Uint8Array(1 + packed.length);
  payload[0] = 0x2f;
  payload.set(packed, 1);
  return payload;
}

function webpFile(parts: Uint8Array[]): Blob {
  const body = concat([encoder.encode("WEBP"), ...parts]);
  return new Blob([concat([encoder.encode("RIFF"), u32(body.length), body])], { type: "image/webp" });
}

/** Animated WebP from straight RGBA frames. Each frame is one VP8L picture. */
export function encodeAnimatedWebp(
  width: number,
  height: number,
  frames: Uint8ClampedArray[],
  durationsMs: number[],
): Blob {
  if (frames.length < 1 || frames.length !== durationsMs.length) {
    throw new TypeError("frames must have one duration each");
  }
  let alpha = false;
  const images = frames.map((frame) => {
    for (let index = 3; index < frame.length; index += 4) {
      if ((frame[index] ?? 255) !== 255) alpha = true;
    }
    return encodeLosslessRgba(width, height, frame);
  });
  const flags = vp8x(width, height);
  if (alpha) flags[0] = 0x12;
  const parts = [riffChunk("VP8X", flags), riffChunk("ANIM", anim())];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const duration = durationsMs[index];
    if (!image || !Number.isInteger(duration) || duration < 1) throw new TypeError("frame duration must be a positive integer");
    parts.push(anmf(width, height, duration, image));
  }
  return webpFile(parts);
}

/** Rasterize the composition and write one real VP8L picture per frame. */
export async function exportAnimatedWebp(composition: SvgComposition): Promise<Blob> {
  const document = assertComposition(composition);
  const frames = await rasterizeComposition(document);
  return encodeAnimatedWebp(document.width, document.height, frames, frameDurations(document.fps, frames.length));
}

export interface VideoSample {
  data: Uint8Array;
  durationMs: number;
  key: boolean;
}

export interface VideoTrack {
  codec: "vp8" | "vp9" | "avc";
  description?: Uint8Array;
  samples: VideoSample[];
  width: number;
  height: number;
}

const VIDEO_KIND: Record<string, VideoTrack["codec"]> = {
  vp8: "vp8",
  "vp09.00.10.08": "vp9",
  "avc1.42001f": "avc",
  "avc1.4d001f": "avc",
  "avc1.640028": "avc",
};

function copyBytes(source: ArrayBuffer | ArrayBufferView | undefined): Uint8Array | undefined {
  if (!source) return undefined;
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
}

interface EncodedChunk {
  type: string;
  byteLength: number;
  copyTo(target: Uint8Array): void;
}

interface EncoderMeta {
  decoderConfig?: { description?: ArrayBuffer | ArrayBufferView };
}

/**
 * Encode rasterized frames with the browser video encoder.
 * The first supported codec in `codecs` is the one written. None supported
 * throws `codec-unsupported` and writes no file.
 */
export async function encodeVideoTrack(composition: SvgComposition, codecs: readonly string[]): Promise<VideoTrack> {
  const document = assertComposition(composition);
  const pictures = await rasterizeComposition(document);
  const root = globalThis as {
    VideoEncoder?: {
      new (init: {
        output: (chunk: EncodedChunk, meta: EncoderMeta) => void;
        error: (reason: Error) => void;
      }): {
        configure(config: Record<string, unknown>): void;
        encode(frame: { close(): void }, options?: { keyFrame?: boolean }): void;
        flush(): Promise<void>;
        close(): void;
      };
      isConfigSupported(config: Record<string, unknown>): Promise<{ supported?: boolean }>;
    };
    VideoFrame?: new (source: Plane, init: { timestamp: number; duration: number }) => { close(): void };
    ImageData?: new (data: Uint8ClampedArray, width: number, height: number) => ImageData;
  };
  if (typeof root.VideoEncoder !== "function" || typeof root.VideoFrame !== "function" || typeof root.ImageData !== "function") {
    throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
  }
  const Encoder = root.VideoEncoder;
  const Frame = root.VideoFrame;
  const Pixels = root.ImageData;
  let chosen: string | undefined;
  for (const codec of codecs) {
    if (!VIDEO_KIND[codec]) continue;
    const config: Record<string, unknown> = {
      codec,
      width: document.width,
      height: document.height,
      bitrate: Math.max(1_000_000, document.width * document.height * 4),
      framerate: document.fps,
    };
    if (codec.startsWith("avc")) config.avc = { format: "avc" };
    const supported = await Encoder.isConfigSupported(config);
    if (supported.supported) {
      chosen = codec;
      break;
    }
  }
  if (!chosen) throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
  const kind = VIDEO_KIND[chosen];
  if (!kind) throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
  const durations = frameDurations(document.fps, pictures.length);
  const plane = drawingPlane(document.width, document.height);
  const samples: VideoSample[] = [];
  let description: Uint8Array | undefined;
  let failed: ExportCapabilityError | undefined;
  const encoder = new Encoder({
    output(chunk, meta) {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      if (bytes.length < 1) {
        failed = new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
        return;
      }
      const copied = copyBytes(meta.decoderConfig?.description);
      if (copied && copied.length > 0) description = copied;
      const durationMs = durations[samples.length] ?? 1;
      samples.push({ data: bytes, durationMs, key: chunk.type === "key" });
    },
    error() {
      failed = new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
    },
  });
  try {
    const config: Record<string, unknown> = {
      codec: chosen,
      width: document.width,
      height: document.height,
      bitrate: Math.max(1_000_000, document.width * document.height * 4),
      framerate: document.fps,
    };
    if (chosen.startsWith("avc")) config.avc = { format: "avc" };
    encoder.configure(config);
    let timestamp = 0;
    for (let index = 0; index < pictures.length; index += 1) {
      const pixels = pictures[index];
      const durationMs = durations[index] ?? 1;
      if (!pixels) throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
      plane.ctx.putImageData(new Pixels(pixels, document.width, document.height), 0, 0);
      const frame = new Frame(plane.canvas, { timestamp: timestamp * 1000, duration: durationMs * 1000 });
      encoder.encode(frame, { keyFrame: true });
      frame.close();
      timestamp += durationMs;
    }
    await encoder.flush();
  } catch (error) {
    if (error instanceof ExportCapabilityError) throw error;
    throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
  } finally {
    encoder.close();
  }
  if (failed) throw failed;
  if (samples.length !== pictures.length) throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
  if (kind === "avc" && (!description || description.length < 1)) {
    throw new ExportCapabilityError("codec-unsupported", CODEC_UNSUPPORTED);
  }
  return {
    codec: kind,
    ...(description ? { description } : {}),
    samples,
    width: document.width,
    height: document.height,
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

function u32(value: number): Uint8Array {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value, true);
  return data;
}

export const webpExporter: WebpExporter = {
  id: "webp",
  schema: "svgif.exporter/1",
};
