/**
 * The WebM artifact is EBML and records the duration.
 * Frames come from renderFrame at integer frames. Canvas pixels are not hashed.
 * [[sot:svgif/studio-export]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportWebm, renderFrame, webmExporter, type WebmExporter } from "../src/index.ts";
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
  "MediaRecorder",
  "video/mp4",
];

const EBML = "1a45dfa3";
const SEGMENT = "18538067";
const INFO = "1549a966";
const TIMESTAMP_SCALE = "2ad7b1";
const DURATION = "4489";
const DOC_TYPE = "4282";
const TRACKS = "1654ae6b";
const PIXEL_WIDTH = "b0";
const PIXEL_HEIGHT = "ba";
const CLUSTER = "1f43b675";
const TIMESTAMP = "e7";
const SIMPLE_BLOCK = "a3";

interface EbmlNode {
  id: string;
  data: Uint8Array;
}

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

function idWidth(first: number): number {
  let mask = 0x80;
  let width = 1;
  while ((first & mask) === 0) {
    mask >>= 1;
    width += 1;
    if (width > 8) throw new Error("ebml id width");
  }
  return width;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readSize(bytes: Uint8Array, offset: number): { size: number; next: number } {
  const width = idWidth(bytes[offset] ?? 0);
  const mask = (1 << (8 - width)) - 1;
  let size = (bytes[offset] ?? 0) & mask;
  for (let index = 1; index < width; index += 1) size = size * 256 + (bytes[offset + index] ?? 0);
  return { size, next: offset + width };
}

function childrenOf(bytes: Uint8Array): EbmlNode[] {
  const nodes: EbmlNode[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const width = idWidth(bytes[offset] ?? 0);
    const id = hex(bytes.subarray(offset, offset + width));
    const size = readSize(bytes, offset + width);
    const start = size.next;
    const end = start + size.size;
    if (end > bytes.length) throw new Error("ebml size does not match");
    nodes.push({ id, data: bytes.subarray(start, end) });
    offset = end;
  }
  if (offset !== bytes.length) throw new Error("ebml size does not match");
  return nodes;
}

function one(nodes: EbmlNode[], id: string): EbmlNode {
  const found = nodes.find((node) => node.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function uintOf(data: Uint8Array): number {
  let value = 0;
  for (const byte of data) value = value * 256 + byte;
  return value;
}

function textOf(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function parseWebm(bytes: Uint8Array): {
  docType: string;
  durationMs: number;
  scale: number;
  width: number;
  height: number;
  times: number[];
  payload: number;
  clusters: number;
} {
  expect(hex(bytes.subarray(0, 4))).toBe(EBML);
  const top = childrenOf(bytes);
  expect(top[0]?.id).toBe(EBML);
  expect(top[1]?.id).toBe(SEGMENT);
  expect(top).toHaveLength(2);
  const header = childrenOf(top[0]?.data ?? new Uint8Array());
  const segment = childrenOf(top[1]?.data ?? new Uint8Array());
  const info = childrenOf(one(segment, INFO).data);
  const tracks = childrenOf(one(segment, TRACKS).data);
  const entry = childrenOf(tracks[0]?.data ?? new Uint8Array());
  const video = childrenOf(entry.find((node) => node.id === "e0")?.data ?? new Uint8Array());
  const times: number[] = [];
  let payload = -1;
  const clusters = segment.filter((node) => node.id === CLUSTER);
  for (const cluster of clusters) {
    const body = childrenOf(cluster.data);
    const origin = uintOf(one(body, TIMESTAMP).data);
    for (const block of body.filter((node) => node.id === SIMPLE_BLOCK)) {
      expect(block.data[0]).toBe(0x81);
      expect(block.data[3]).toBe(0x80);
      const relative = new DataView(block.data.buffer, block.data.byteOffset, block.data.byteLength).getInt16(1, false);
      const frame = block.data.subarray(4);
      if (payload < 0) payload = frame.length;
      expect(frame.length).toBe(payload);
      expect(frame.every((byte) => byte === 0)).toBe(true);
      times.push(origin + relative);
    }
  }
  return {
    docType: textOf(one(header, DOC_TYPE).data),
    durationMs: new DataView(
      one(info, DURATION).data.buffer,
      one(info, DURATION).data.byteOffset,
      one(info, DURATION).data.byteLength,
    ).getFloat64(0, false),
    scale: uintOf(one(info, TIMESTAMP_SCALE).data),
    width: uintOf(one(video, PIXEL_WIDTH).data),
    height: uintOf(one(video, PIXEL_HEIGHT).data),
    times,
    payload,
    clusters: clusters.length,
  };
}

describe("exportWebm", () => {
  test("starts with the EBML header and records the duration", async () => {
    const composition = cloneComposition();
    const before = JSON.stringify(composition);
    const blob = exportWebm(composition);
    expect(JSON.stringify(composition)).toBe(before);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("video/webm");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x1a);
    expect(bytes[1]).toBe(0x45);
    expect(bytes[2]).toBe(0xdf);
    expect(bytes[3]).toBe(0xa3);
    const parsed = parseWebm(bytes);
    expect(parsed.docType).toBe("webm");
    expect(parsed.scale).toBe(1000000);
    expect(parsed.durationMs).toBe(3000);
    expect(parsed.width).toBe(composition.width);
    expect(parsed.height).toBe(composition.height);
    expect(parsed.times).toHaveLength(90);
    expect(parsed.clusters).toBe(1);
    expect(parsed.payload).toBe(3);
    const gaps = parsed.times.slice(1).map((time, index) => time - (parsed.times[index] ?? 0));
    expect(parsed.times[0]).toBe(0);
    expect(gaps.slice(0, 30).every((gap) => gap === 34)).toBe(true);
    expect(gaps.slice(30).every((gap) => gap === 33)).toBe(true);
    expect(webmExporter.id).toBe("webm");
    expect(webmExporter.schema).toBe("svgif.exporter/1");
    const again = new Uint8Array(await webmExporter.export(composition).arrayBuffer());
    expect(again).toEqual(bytes);
  });

  test("uses the composition length when it is not the fixture", async () => {
    const composition = cloneComposition();
    composition.fps = 24;
    composition.durationInFrames = 2;
    composition.width = 31;
    composition.height = 17;
    const parsed = parseWebm(new Uint8Array(await exportWebm(composition).arrayBuffer()));
    expect(parsed.times).toEqual([0, 42]);
    expect(parsed.durationMs).toBe(83);
    expect(parsed.width).toBe(31);
    expect(parsed.height).toBe(17);
    expect(parsed.clusters).toBe(1);
  });

  test("gives every frame at least one millisecond when fps is above 1000", async () => {
    const composition = cloneComposition();
    composition.fps = 10000;
    composition.durationInFrames = 2;
    composition.width = 2;
    composition.height = 2;
    const parsed = parseWebm(new Uint8Array(await exportWebm(composition).arrayBuffer()));
    expect(parsed.times).toEqual([0, 1]);
    expect(parsed.durationMs).toBe(2);
  });

  test("opens another cluster when a block time no longer fits", async () => {
    const composition = cloneComposition();
    composition.fps = 1;
    composition.durationInFrames = 34;
    composition.width = 8;
    composition.height = 8;
    const parsed = parseWebm(new Uint8Array(await exportWebm(composition).arrayBuffer()));
    expect(parsed.clusters).toBe(2);
    expect(parsed.times).toHaveLength(34);
    expect(parsed.times[0]).toBe(0);
    expect(parsed.times[32]).toBe(32000);
    expect(parsed.times[33]).toBe(33000);
    expect(parsed.durationMs).toBe(34000);
  });

  test("reads each integer frame from renderFrame", () => {
    const composition = cloneComposition();
    const start = renderFrame(composition, 0);
    const later = renderFrame(composition, 30);
    expect(start.includes('data-frame="0"')).toBe(true);
    expect(later.includes('data-frame="30"')).toBe(true);
    expect(start).not.toBe(later);
    expect(() => renderFrame(composition, 1.5)).toThrow(/integer/);
  });

  test("rejects a composition that cannot carry frames", () => {
    expect(() => exportWebm(null as unknown as SvgComposition)).toThrow(/object/);
    expect(() => exportWebm([] as unknown as SvgComposition)).toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    expect(() => exportWebm(width)).toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    expect(() => exportWebm(height)).toThrow(/composition\.height/);
    const wide = cloneComposition();
    wide.width = 16385;
    expect(() => exportWebm(wide)).toThrow(/at most 16384/);
    const tall = cloneComposition();
    tall.height = 16385;
    expect(() => exportWebm(tall)).toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    expect(() => exportWebm(missing)).toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    expect(() => exportWebm(extra)).toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    expect(() => exportWebm(nodes)).toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    expect(() => exportWebm(duration)).toThrow(/durationInFrames/);
  });

  test("accepts the largest edge", async () => {
    const composition = cloneComposition();
    composition.width = 16384;
    composition.height = 1;
    composition.durationInFrames = 1;
    composition.fps = 1;
    const parsed = parseWebm(new Uint8Array(await exportWebm(composition).arrayBuffer()));
    expect(parsed.times).toEqual([0]);
    expect(parsed.width).toBe(16384);
    expect(parsed.durationMs).toBe(1000);
    expect(parsed.payload).toBe(3);
  });

  test("does not hash canvas pixels and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const source = readFileSync(resolve(srcDir, "webm.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("renderFrame(document, frame)")).toBe(true);
    expect(source.includes("EBML")).toBe(true);
    expect(source.includes("webm")).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/studio-export]]")).toBe(true);
    expect(source.includes("does not encode MP4")).toBe(true);
    expect(source.includes("Canvas pixels are not hashed")).toBe(true);
    const exporter: WebmExporter = webmExporter;
    expect(exporter.id).toBe("webm");
  });
});
