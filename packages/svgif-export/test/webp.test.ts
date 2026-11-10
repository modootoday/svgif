/**
 * The WebP artifact starts with RIFF/WEBP and records the frame count and the duration.
 * Frames come from renderFrame at integer frames. Canvas pixels are not hashed.
 * [[sot:svgif/determinism]] [[adr:svgif/20261110121700]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportWebp, renderFrame, webpExporter, type WebpExporter } from "../src/index.ts";
import type { SvgComposition } from "../src/svg.ts";

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
    expect(files).toEqual(["html.ts", "index.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const source = readFileSync(resolve(srcDir, "webp.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("renderFrame(document, frame)")).toBe(true);
    expect(source.includes("RIFF")).toBe(true);
    expect(source.includes("WEBP")).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/determinism]]")).toBe(true);
    expect(source.includes("[[adr:svgif/20261110121700]]")).toBe(true);
    expect(source.includes("WebM or MP4")).toBe(true);
    const exporter: WebpExporter = webpExporter;
    expect(exporter.id).toBe("webp");
  });
});
