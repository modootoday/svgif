/**
 * The WebP artifact starts with RIFF/WEBP and records the frame count and the duration.
 * Frames come from renderFrame at integer frames. Canvas pixels are not hashed.
 * [[sot:svgif/determinism]] [[adr:svgif/20261110121700]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatTransform } from "../../svgif/src/backend/css/print.ts";
import { sample } from "../../svgif/src/ir/sample.ts";
import type { IrValue, TimelineIr } from "../../svgif/src/ir/types.ts";
import { compile } from "../../svgif/src/lower/index.ts";
import { TEXT_FONT_FAMILY } from "../../svgif/src/lower/text.ts";
import { exportWebp, paintFrame, renderFrame, webpExporter, type FramePainter, type WebpExporter } from "../src/index.ts";
import type { SvgComposition, SvgNode } from "../src/svg.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { composition: SvgComposition };

const BANNED = [
  "WebSocket",
  "XMLHttpRequest",
  "fetch(",
  "node:http",
  "node:https",
  "node:net",
  "Date",
  "performance.now",
  "Math.random",
  "OffscreenCanvas",
  "createImageBitmap",
  "getImageData",
  "toDataURL",
  "VideoEncoder",
];

interface RiffChunk {
  tag: string;
  data: Uint8Array;
}

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

function u16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function u24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function chunksOf(bytes: Uint8Array, start: number): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  let offset = start;
  while (offset + 8 <= bytes.length) {
    const tag = text(bytes, offset, 4);
    const size = u32(bytes, offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    chunks.push({ tag, data });
    offset += 8 + size + (size % 2);
  }
  if (offset !== bytes.length) throw new Error("riff size does not match");
  return chunks;
}

function parseWebp(bytes: Uint8Array): {
  canvasWidth: number;
  canvasHeight: number;
  durations: number[];
  frames: number;
} {
  expect(text(bytes, 0, 4)).toBe("RIFF");
  expect(text(bytes, 8, 4)).toBe("WEBP");
  expect(u32(bytes, 4)).toBe(bytes.length - 8);
  const chunks = chunksOf(bytes, 12);
  const vp8x = chunks.find((chunk) => chunk.tag === "VP8X");
  const anim = chunks.find((chunk) => chunk.tag === "ANIM");
  const frames = chunks.filter((chunk) => chunk.tag === "ANMF");
  if (!vp8x || !anim) throw new Error("webp animation chunks missing");
  expect(vp8x.data[0] & 0x02).toBe(0x02);
  expect(u16(anim.data, 4)).toBe(0);
  const durations = frames.map((frame) => {
    const nested = chunksOf(frame.data, 16);
    expect(nested.some((chunk) => chunk.tag === "VP8L" && chunk.data[0] === 0x2f)).toBe(true);
    expect(u24(frame.data, 6) + 1).toBe(u24(vp8x.data, 4) + 1);
    expect(u24(frame.data, 9) + 1).toBe(u24(vp8x.data, 7) + 1);
    return u24(frame.data, 12);
  });
  return {
    canvasWidth: u24(vp8x.data, 4) + 1,
    canvasHeight: u24(vp8x.data, 7) + 1,
    durations,
    frames: frames.length,
  };
}

describe("exportWebp", () => {
  test("starts with RIFF/WEBP and records the frame count and the duration", async () => {
    const composition = cloneComposition();
    const before = JSON.stringify(composition);
    const blob = exportWebp(composition);
    expect(JSON.stringify(composition)).toBe(before);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("image/webp");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x52);
    expect(bytes[1]).toBe(0x49);
    expect(bytes[2]).toBe(0x46);
    expect(bytes[3]).toBe(0x46);
    expect(text(bytes, 8, 4)).toBe("WEBP");
    const parsed = parseWebp(bytes);
    expect(parsed.frames).toBe(composition.durationInFrames);
    expect(parsed.canvasWidth).toBe(composition.width);
    expect(parsed.canvasHeight).toBe(composition.height);
    expect(parsed.durations).toHaveLength(90);
    expect(parsed.durations.slice(0, 30).every((duration) => duration === 34)).toBe(true);
    expect(parsed.durations.slice(30).every((duration) => duration === 33)).toBe(true);
    expect(parsed.durations.reduce((sum, duration) => sum + duration, 0)).toBe(3000);
    expect(webpExporter.id).toBe("webp");
    expect(webpExporter.schema).toBe("svgif.exporter/1");
    const again = new Uint8Array(await webpExporter.export(composition).arrayBuffer());
    expect(again).toEqual(bytes);
  });

  test("uses the composition length when it is not the fixture", async () => {
    const composition = cloneComposition();
    composition.fps = 24;
    composition.durationInFrames = 2;
    composition.width = 31;
    composition.height = 17;
    const parsed = parseWebp(new Uint8Array(await exportWebp(composition).arrayBuffer()));
    expect(parsed.frames).toBe(2);
    expect(parsed.canvasWidth).toBe(31);
    expect(parsed.canvasHeight).toBe(17);
    expect(parsed.durations).toEqual([42, 41]);
  });

  test("gives every frame at least one millisecond when fps is above 1000", async () => {
    const composition = cloneComposition();
    composition.fps = 10000;
    composition.durationInFrames = 2;
    composition.width = 2;
    composition.height = 2;
    const parsed = parseWebp(new Uint8Array(await exportWebp(composition).arrayBuffer()));
    expect(parsed.frames).toBe(2);
    expect(parsed.durations).toEqual([1, 1]);
  });

  test("reads each integer frame from renderFrame", () => {
    const composition = cloneComposition();
    const start = renderFrame(composition, 0);
    const later = renderFrame(composition, 30);
    expect(start.includes('data-frame="0"')).toBe(true);
    expect(start.includes('width="1920"')).toBe(true);
    expect(start.includes('height="1080"')).toBe(true);
    expect(start.includes("<svg ")).toBe(true);
    expect(start.includes('transform.translateX="0"')).toBe(true);
    expect(later.includes('data-frame="30"')).toBe(true);
    expect(later.includes('transform.translateX="120"')).toBe(true);
    expect(start).not.toBe(later);
    const rich = cloneComposition();
    rich.durationInFrames = 1;
    rich.nodes = [
      { id: "plain", tracks: [] },
      {
        id: "mark",
        tracks: [
          { property: "attr.d", keys: [{ frame: 0, value: "M0 0" }] },
          { property: "label", keys: [{ frame: 0, value: "a<b&c>" }] },
          { property: "transform.matrix", keys: [{ frame: 0, value: [1, 0, 0, 1, 2, 3] }] },
        ],
      },
    ];
    const svg = renderFrame(rich, 0);
    expect(svg.includes('<g id="plain"/>')).toBe(true);
    expect(svg.includes('attr.d="M0 0"')).toBe(true);
    expect(svg.includes("a&lt;b&amp;c&gt;")).toBe(true);
    expect(svg.includes('transform.matrix="1 0 0 1 2 3"')).toBe(true);
    expect(() => renderFrame(composition, 1.5)).toThrow(/integer/);
    expect(() => renderFrame(composition, -1)).toThrow(/integer/);
    expect(() => renderFrame(composition, composition.durationInFrames)).toThrow(/integer/);
  });

  test("rejects a composition that cannot carry frames", () => {
    expect(() => exportWebp(null as unknown as SvgComposition)).toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    expect(() => exportWebp(width)).toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    expect(() => exportWebp(height)).toThrow(/composition\.height/);
    const wide = cloneComposition();
    wide.width = 16385;
    expect(() => exportWebp(wide)).toThrow(/at most 16384/);
    const tall = cloneComposition();
    tall.height = 16385;
    expect(() => exportWebp(tall)).toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    expect(() => exportWebp(missing)).toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    expect(() => exportWebp(extra)).toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    expect(() => exportWebp(nodes)).toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    expect(() => exportWebp(duration)).toThrow(/durationInFrames/);
  });

  test("accepts the largest lossless edge", async () => {
    const composition = cloneComposition();
    composition.width = 16384;
    composition.height = 1;
    composition.durationInFrames = 1;
    composition.fps = 1;
    const parsed = parseWebp(new Uint8Array(await exportWebp(composition).arrayBuffer()));
    expect(parsed.frames).toBe(1);
    expect(parsed.canvasWidth).toBe(16384);
    expect(parsed.durations).toEqual([1000]);
  });

  test("does not hash canvas pixels and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "mp4.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const source = readFileSync(resolve(srcDir, "webp.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("renderFrame(document, frame)")).toBe(true);
    expect(source.includes("RIFF")).toBe(true);
    expect(source.includes("WEBP")).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/determinism]]")).toBe(true);
    expect(source.includes("[[adr:svgif/20261110121700]]")).toBe(true);
    expect(source.includes("WebM or MP4")).toBe(true);
    expect(source.includes("fillText")).toBe(true);
    expect(source.includes("TEXT_FONT_FAMILY")).toBe(true);
    const exporter: WebpExporter = webpExporter;
    expect(exporter.id).toBe("webp");
  });
});

interface DrawCall {
  font: string;
  fillStyle: string;
  globalAlpha: number;
  textBaseline: string;
  textAlign: string;
  matrix: number[];
  text: string;
  x: number;
  y: number;
}

interface GlyphBox {
  width: number;
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

interface RasterSurface {
  width: number;
  height: number;
  paint(draw: (painter: FramePainter) => void): Uint8ClampedArray;
  measure(font: string, text: string): GlyphBox;
}

const PIVOT_X = 24;
const PIVOT_Y = -8;
const REST_X = 100;
const REST_Y = 80;

function recording(): { painter: FramePainter; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const painter: FramePainter & { matrix: number[] } = {
    font: "",
    fillStyle: "",
    globalAlpha: 1,
    textBaseline: "",
    textAlign: "",
    matrix: [1, 0, 0, 1, 0, 0],
    setTransform(a, b, c, d, e, f) {
      this.matrix = [a, b, c, d, e, f];
    },
    fillText(text, x, y) {
      calls.push({
        font: this.font,
        fillStyle: this.fillStyle,
        globalAlpha: this.globalAlpha,
        textBaseline: this.textBaseline,
        textAlign: this.textAlign,
        matrix: this.matrix.slice(),
        text,
        x,
        y,
      });
    },
  };
  return { painter, calls };
}

function expectClose(left: number[], right: number[]): void {
  expect(left.length).toBe(right.length);
  for (let index = 0; index < left.length; index += 1) {
    expect(left[index] ?? 0).toBeCloseTo(right[index] ?? 0, 5);
  }
}

function numbersIn(value: string): number[] {
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function multiply(left: number[], right: number[]): number[] {
  const a = left[0] ?? 0;
  const b = left[1] ?? 0;
  const c = left[2] ?? 0;
  const d = left[3] ?? 0;
  const e = left[4] ?? 0;
  const f = left[5] ?? 0;
  const ra = right[0] ?? 0;
  const rb = right[1] ?? 0;
  const rc = right[2] ?? 0;
  const rd = right[3] ?? 0;
  const re = right[4] ?? 0;
  const rf = right[5] ?? 0;
  return [a * ra + c * rb, b * ra + d * rb, a * rc + c * rd, b * rc + d * rd, a * re + c * rf + e, b * re + d * rf + f];
}

/** SVG transform list. The rightmost function applies to the point first. */
function matrixFromSvg(transform: string | undefined): number[] {
  let acc = [1, 0, 0, 1, 0, 0];
  if (!transform) return acc;
  const pattern = /(matrix|translate|rotate|scale)\(([^)]*)\)/g;
  let match = pattern.exec(transform);
  while (match) {
    const kind = match[1];
    const args = (match[2] ?? "")
      .trim()
      .split(/[\s,]+/)
      .filter((item) => item.length > 0)
      .map((item) => Number(item));
    let next = [1, 0, 0, 1, 0, 0];
    if (kind === "translate") next = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    else if (kind === "scale") {
      const sx = args[0] ?? 1;
      next = [sx, 0, 0, args[1] ?? sx, 0, 0];
    } else if (kind === "rotate") {
      const radians = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      next = [cos, sin, -sin, cos, 0, 0];
    } else next = [args[0] ?? 1, args[1] ?? 0, args[2] ?? 0, args[3] ?? 1, args[4] ?? 0, args[5] ?? 0];
    acc = multiply(acc, next);
    match = pattern.exec(transform);
  }
  return acc;
}

function mapPoint(matrix: number[], x: number, y: number): [number, number] {
  return [
    (matrix[0] ?? 0) * x + (matrix[2] ?? 0) * y + (matrix[4] ?? 0),
    (matrix[1] ?? 0) * x + (matrix[3] ?? 0) * y + (matrix[5] ?? 0),
  ];
}

function elementTransform(svg: string, id: string): string | undefined {
  const open = new RegExp(`<(?:g|text)\\b([^>]*\\bid="${id}"[^>]*)>`).exec(svg);
  if (!open) throw new Error(`missing ${id}`);
  const transform = /\btransform="([^"]*)"/.exec(open[1] ?? "");
  return transform?.[1];
}

function textBlocks(svg: string): { attrs: string; content: string }[] {
  return [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((match) => ({
    attrs: match[1] ?? "",
    content: match[2] ?? "",
  }));
}

function saleNode(): SvgNode {
  const node: SvgNode & { label?: string } = {
    id: "s-sale",
    text: "Sale 50%",
    label: "headline",
    tracks: [
      { property: "attr.fill", keys: [{ frame: 0, value: "#112233" }] },
      { property: "attr.opacity", keys: [{ frame: 0, value: 1 }] },
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: REST_X },
          { frame: 1, value: 40 },
          { frame: 2, value: REST_X + PIVOT_X * (1 - 2) },
        ],
      },
      {
        property: "transform.translateY",
        keys: [
          { frame: 0, value: REST_Y },
          { frame: 1, value: 90 },
          { frame: 2, value: REST_Y + PIVOT_Y * (1 - 2) },
        ],
      },
      {
        property: "transform.rotate",
        keys: [
          { frame: 0, value: 0 },
          { frame: 1, value: 90 },
          { frame: 2, value: 0 },
        ],
      },
      {
        property: "transform.scaleX",
        keys: [
          { frame: 0, value: 1 },
          { frame: 1, value: 1 },
          { frame: 2, value: 2 },
        ],
      },
      {
        property: "transform.scaleY",
        keys: [
          { frame: 0, value: 1 },
          { frame: 1, value: 1 },
          { frame: 2, value: 2 },
        ],
      },
    ],
  };
  return node;
}

function saleComposition(): SvgComposition {
  return { fps: 30, width: 360, height: 240, durationInFrames: 3, nodes: [saleNode()] };
}

interface CanvasContext extends FramePainter {
  measureText(text: string): {
    width: number;
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
    actualBoundingBoxLeft?: number;
    actualBoundingBoxRight?: number;
  };
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  clearRect(x: number, y: number, w: number, h: number): void;
}

function canvasContext(width: number, height: number): CanvasContext | undefined {
  const root = globalThis as {
    OffscreenCanvas?: new (w: number, h: number) => { getContext(kind: "2d"): CanvasContext | null; width: number; height: number };
    document?: { createElement(name: "canvas"): { getContext(kind: "2d"): CanvasContext | null; width: number; height: number } };
  };
  if (typeof root.OffscreenCanvas === "function") {
    const canvas = new root.OffscreenCanvas(width, height);
    return canvas.getContext("2d") ?? undefined;
  }
  if (root.document && typeof root.document.createElement === "function") {
    const canvas = root.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d") ?? undefined;
  }
  return undefined;
}

function openRaster(width: number, height: number): RasterSurface | undefined {
  const ctx = canvasContext(width, height);
  if (!ctx || typeof ctx.fillText !== "function" || typeof ctx.getImageData !== "function" || typeof ctx.measureText !== "function") {
    return undefined;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `16px ${TEXT_FONT_FAMILY}`;
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "start";
  ctx.fillText("Sale 50%", 2, 28);
  const probe = ctx.measureText("Sale 50%");
  if (!(probe.width > 0) || !(probe.actualBoundingBoxAscent && probe.actualBoundingBoxAscent > 0)) return undefined;
  const sample = ctx.getImageData(0, 0, width, height).data;
  let ink = 0;
  for (let index = 3; index < sample.length; index += 4) if ((sample[index] ?? 0) > 20) ink += 1;
  if (ink === 0) return undefined;
  return {
    width,
    height,
    paint(draw) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      draw(ctx);
      return ctx.getImageData(0, 0, width, height).data;
    },
    measure(font, text) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = font;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "start";
      const metrics = ctx.measureText(text);
      const right = metrics.actualBoundingBoxRight ?? 0;
      return {
        width: metrics.width,
        left: metrics.actualBoundingBoxLeft ?? 0,
        right: right > 0 ? right : metrics.width,
        ascent: metrics.actualBoundingBoxAscent ?? 0,
        descent: metrics.actualBoundingBoxDescent ?? 0,
      };
    },
  };
}

function inkOf(data: Uint8ClampedArray, width: number, height: number): { count: number; minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number } {
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= 20) continue;
      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { count, minX, minY, maxX, maxY, cx: count > 0 ? sumX / count : 0, cy: count > 0 ? sumY / count : 0 };
}

function predictedBox(matrix: number[], glyph: GlyphBox, pad: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const corners = [
    [-glyph.left, -glyph.ascent],
    [glyph.right, -glyph.ascent],
    [glyph.right, glyph.descent],
    [-glyph.left, glyph.descent],
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of corners) {
    const point = mapPoint(matrix, x ?? 0, y ?? 0);
    if (point[0] < minX) minX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] > maxY) maxY = point[1];
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

describe("raster text", () => {
  test("Sale 50% sits on the SVG baseline, including a compensated scale", () => {
    const composition = saleComposition();
    const compiled = compile(composition as TimelineIr, "css-embedded");
    expect(compiled.svg).toContain("Sale 50%");
    expect(compiled.svg).toContain("%");
    expect(compiled.svg).toContain(`font-family="${TEXT_FONT_FAMILY}"`);
    expect(compiled.svg).not.toContain("headline");
    const raster = openRaster(composition.width, composition.height);
    console.log(
      `raster-text evidence: draw calls checked; pixels ${raster ? "ran" : "unavailable, no text-capable canvas"}`,
    );
    const ink: { cx: number; cy: number }[] = [];
    for (const frame of [0, 1, 2]) {
      const svg = renderFrame(composition, frame);
      const blocks = textBlocks(svg);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.content).toBe("Sale 50%");
      expect(blocks[0]?.attrs).toContain(`font-family="${TEXT_FONT_FAMILY}"`);
      expect(blocks[0]?.attrs).toContain('font-size="16"');
      expect(blocks[0]?.attrs).toContain('fill="#112233"');
      expect(blocks[0]?.attrs).toContain('opacity="1"');
      expect(svg).not.toContain("headline");
      const attribute = elementTransform(svg, "s-sale");
      const sampled = sample(composition as TimelineIr, frame)["s-sale"] ?? {};
      const css = formatTransform(sampled);
      expect(css).toBeDefined();
      expect(numbersIn(attribute ?? "")).toEqual(numbersIn(css ?? ""));
      const drawn = recording();
      paintFrame(composition, frame, drawn.painter);
      expect(drawn.calls).toHaveLength(1);
      const call = drawn.calls[0];
      if (!call) throw new Error("missing draw");
      expect(call.text).toBe("Sale 50%");
      expect(call.x).toBe(0);
      expect(call.y).toBe(0);
      expect(call.font).toBe(`16px ${TEXT_FONT_FAMILY}`);
      expect(call.fillStyle).toBe("#112233");
      expect(call.globalAlpha).toBe(1);
      expect(call.textBaseline).toBe("alphabetic");
      expect(call.textAlign).toBe("start");
      expectClose(call.matrix, matrixFromSvg(attribute));
      if (raster) {
        const data = raster.paint((painter) => paintFrame(composition, frame, painter));
        const glyph = raster.measure(call.font, call.text);
        expect(glyph.ascent).toBeGreaterThan(0);
        const box = predictedBox(call.matrix, glyph, 4);
        const pixels = inkOf(data, raster.width, raster.height);
        expect(pixels.count).toBeGreaterThan(0);
        expect(pixels.minX).toBeGreaterThanOrEqual(Math.floor(box.minX));
        expect(pixels.minY).toBeGreaterThanOrEqual(Math.floor(box.minY));
        expect(pixels.maxX).toBeLessThanOrEqual(Math.ceil(box.maxX));
        expect(pixels.maxY).toBeLessThanOrEqual(Math.ceil(box.maxY));
        expect(data[3] ?? 0).toBeLessThanOrEqual(20);
        ink.push(pixels);
      }
    }
    const start = recording();
    paintFrame(composition, 0, start.painter);
    const later = recording();
    paintFrame(composition, 2, later.painter);
    const pivotStart = mapPoint(start.calls[0]?.matrix ?? [], PIVOT_X, PIVOT_Y);
    const pivotLater = mapPoint(later.calls[0]?.matrix ?? [], PIVOT_X, PIVOT_Y);
    expect(pivotStart[0]).toBeCloseTo(pivotLater[0], 4);
    expect(pivotStart[1]).toBeCloseTo(pivotLater[1], 4);
    const bare = matrixFromSvg(`translate(${REST_X} ${REST_Y}) rotate(0) scale(2 2)`);
    const shifted = mapPoint(bare, PIVOT_X, PIVOT_Y);
    expect(Math.hypot(pivotLater[0] - shifted[0], pivotLater[1] - shifted[1])).toBeGreaterThan(1);
    const turned = mapPoint(matrixFromSvg(elementTransform(renderFrame(composition, 1), "s-sale")), 10, 0);
    expect(turned[0]).toBeCloseTo(40, 4);
    expect(turned[1]).toBeCloseTo(100, 4);
    if (ink.length === 3) {
      const first = ink[0];
      const rotated = ink[1];
      const scaled = ink[2];
      if (!first || !rotated || !scaled) throw new Error("missing ink");
      expect(Math.hypot(first.cx - rotated.cx, first.cy - rotated.cy)).toBeGreaterThan(8);
      expect(Math.hypot(first.cx - scaled.cx, first.cy - scaled.cy)).toBeGreaterThan(8);
    }
    expect(() => paintFrame(composition, 1.5, recording().painter)).toThrow(/integer/);
    expect(() => paintFrame(null as unknown as SvgComposition, 0, recording().painter)).toThrow(/object/);
  });

  test("empty and missing text draw nothing", () => {
    const composition: SvgComposition = {
      fps: 30,
      width: 64,
      height: 32,
      durationInFrames: 1,
      nodes: [
        {
          id: "s-empty",
          text: "",
          tracks: [{ property: "attr.fill", keys: [{ frame: 0, value: "#112233" }] }],
        },
        { id: "s-none", tracks: [] },
        Object.assign({ id: "s-num", tracks: [] }, { text: 4 }) as SvgNode,
      ],
    };
    const svg = renderFrame(composition, 0);
    const blocks = textBlocks(svg);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe("");
    expect(blocks[0]?.attrs).toContain(`font-family="${TEXT_FONT_FAMILY}"`);
    expect(svg).toContain('<g id="s-none"/>');
    expect(svg).not.toContain('id="s-num"></text>');
    expect(svg).not.toMatch(/<text\b[^>]*id="s-num"/);
    const drawn = recording();
    paintFrame(composition, 0, drawn.painter);
    expect(drawn.calls).toHaveLength(0);
    const raster = openRaster(composition.width, composition.height);
    if (raster) {
      const data = raster.paint((painter) => paintFrame(composition, 0, painter));
      expect(inkOf(data, raster.width, raster.height).count).toBe(0);
    }
  });

  test("matrix, path, and escaped words use the same font and fill", () => {
    const composition: SvgComposition = {
      fps: 12,
      width: 200,
      height: 80,
      durationInFrames: 1,
      nodes: [
        { id: "s-plain", text: "X", tracks: [] },
        {
          id: "s-matrix",
          text: "Sale 50%",
          tracks: [
            { property: "transform.matrix", keys: [{ frame: 0, value: [1, 0, 0, 1, 12, 18] }] },
            { property: "transform.translateX", keys: [{ frame: 0, value: 9 }] },
            { property: "attr.fill", keys: [{ frame: 0, value: "#445566" }] },
          ],
        },
        {
          id: "s-short",
          text: "Go",
          tracks: [
            { property: "transform.matrix", keys: [{ frame: 0, value: [1, 0, 0] }] },
            { property: "transform.scaleX", keys: [{ frame: 0, value: 2 }] },
          ],
        },
        {
          id: "s-mixed",
          text: "No",
          tracks: [
            { property: "transform.matrix", keys: [{ frame: 0, value: [1, 0, 0, 1, 5, "no"] as unknown as number[] }] },
            { property: "transform.translateX", keys: [{ frame: 0, value: 3 }] },
            { property: "transform.translateY", keys: [{ frame: 0, value: 4 }] },
          ],
        },
        {
          id: "s-both",
          text: "Sale 50%",
          tracks: [
            { property: "attr.d", keys: [{ frame: 0, value: "M0 0 H 4" }] },
            { property: "attr.fill", keys: [{ frame: 0, value: "#445566" }] },
            { property: "attr.opacity", keys: [{ frame: 0, value: 0.5 }] },
            { property: "transform.translateX", keys: [{ frame: 0, value: 6 }] },
          ],
        },
        { id: "s-quote", text: 'Tom & Jerry <3', tracks: [] },
      ],
    };
    const svg = renderFrame(composition, 0);
    expect(svg).toContain('id="s-plain"');
    expect(svg).not.toMatch(/id="s-plain"[^>]*fill=/);
    expect(svg).not.toMatch(/id="s-plain"[^>]*transform=/);
    const sampled = sample(composition as TimelineIr, 0);
    expect(elementTransform(svg, "s-matrix")).toBe(formatTransform(sampled["s-matrix"]));
    expect(elementTransform(svg, "s-matrix")).toBe("matrix(1, 0, 0, 1, 12, 18)");
    expect(numbersIn(elementTransform(svg, "s-short") ?? "")).toEqual(numbersIn(formatTransform(sampled["s-short"]) ?? ""));
    expect(elementTransform(svg, "s-short")).toBe("scale(2 1)");
    expect(elementTransform(svg, "s-mixed")).toBe("translate(3 4)");
    expect(svg).toContain("1 0 0 1 5 no");
    expect(svg).toContain('<path d="M0 0 H 4"/>');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain("Tom &amp; Jerry &lt;3");
    expect(svg).not.toContain("Tom & Jerry");
    const blocks = textBlocks(svg);
    expect(blocks.map((block) => block.content)).toEqual(["X", "Sale 50%", "Go", "No", "Sale 50%", "Tom &amp; Jerry &lt;3"]);
    expect(blocks.every((block) => block.attrs.includes(`font-family="${TEXT_FONT_FAMILY}"`))).toBe(true);
    const compiled = compile(composition as TimelineIr, "css-embedded");
    expect(compiled.svg).toContain("Tom &amp; Jerry &lt;3");
    expect(compiled.svg).toContain(`font-family="${TEXT_FONT_FAMILY}"`);
    const drawn = recording();
    paintFrame(composition, 0, drawn.painter);
    expect(drawn.calls.map((call) => call.text)).toEqual(["X", "Sale 50%", "Go", "No", "Sale 50%", "Tom & Jerry <3"]);
    expect(drawn.calls[0]?.fillStyle).toBe("#000000");
    expect(drawn.calls[0]?.globalAlpha).toBe(1);
    expectClose(drawn.calls[0]?.matrix ?? [], [1, 0, 0, 1, 0, 0]);
    expect(drawn.calls[1]?.fillStyle).toBe("#445566");
    expectClose(drawn.calls[1]?.matrix ?? [], [1, 0, 0, 1, 12, 18]);
    expect(drawn.calls[2]?.matrix[0]).toBeCloseTo(2, 5);
    expect(drawn.calls[3]?.matrix[4]).toBeCloseTo(3, 5);
    expect(drawn.calls[3]?.matrix[5]).toBeCloseTo(4, 5);
    expect(drawn.calls[4]?.globalAlpha).toBe(0.5);
    expect(drawn.calls[4]?.fillStyle).toBe("#445566");
    expect(drawn.calls[4]?.matrix[4]).toBeCloseTo(6, 5);
  });
});
