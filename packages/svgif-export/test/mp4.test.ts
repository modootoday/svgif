/**
 * The MP4 artifact contains an ftyp box and records the duration.
 * Frames come from renderFrame at integer frames. Canvas pixels are not hashed.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121700]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportMp4, mp4Exporter, renderFrame, type Mp4Exporter } from "../src/index.ts";
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
];

interface Box {
  type: string;
  start: number;
  end: number;
}

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function boxesOf(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    const size = u32(bytes, offset);
    if (size < 8 || offset + size > end) throw new Error("box size does not match");
    boxes.push({ type: text(bytes, offset + 4, 4), start: offset + 8, end: offset + size });
    offset += size;
  }
  if (offset !== end) throw new Error("box size does not match");
  return boxes;
}

function one(boxes: Box[], type: string): Box {
  const found = boxes.find((box) => box.type === type);
  if (!found) throw new Error(`missing ${type}`);
  return found;
}

function child(bytes: Uint8Array, parent: Box, type: string): Box {
  return one(boxesOf(bytes, parent.start, parent.end), type);
}

function parseMp4(bytes: Uint8Array): {
  brand: string;
  brands: string[];
  durationMs: number;
  timescale: number;
  width: number;
  height: number;
  times: number[];
  payload: number;
} {
  const top = boxesOf(bytes, 0, bytes.length);
  expect(top.map((box) => box.type)).toEqual(["ftyp", "moov", "mdat"]);
  const ftyp = top[0] ?? { type: "", start: 0, end: 0 };
  expect(text(bytes, ftyp.start, 4)).toBe("isom");
  expect(u32(bytes, ftyp.start + 4)).toBe(0);
  const brands: string[] = [];
  for (let offset = ftyp.start + 8; offset < ftyp.end; offset += 4) brands.push(text(bytes, offset, 4));
  const moov = top[1] ?? { type: "", start: 0, end: 0 };
  const mvhd = child(bytes, moov, "mvhd");
  const trak = child(bytes, moov, "trak");
  const tkhd = child(bytes, trak, "tkhd");
  const mdia = child(bytes, trak, "mdia");
  const mdhd = child(bytes, mdia, "mdhd");
  const minf = child(bytes, mdia, "minf");
  const stbl = child(bytes, minf, "stbl");
  const stts = child(bytes, stbl, "stts");
  const stsz = child(bytes, stbl, "stsz");
  const stco = child(bytes, stbl, "stco");
  const mdat = top[2] ?? { type: "", start: 0, end: 0 };
  const entryCount = u32(bytes, stts.start + 4);
  const times: number[] = [];
  let cursor = 0;
  for (let index = 0; index < entryCount; index += 1) {
    const count = u32(bytes, stts.start + 8 + index * 8);
    const delta = u32(bytes, stts.start + 12 + index * 8);
    for (let sample = 0; sample < count; sample += 1) {
      times.push(cursor);
      cursor += delta;
    }
  }
  const sampleSize = u32(bytes, stsz.start + 4);
  const sampleCount = u32(bytes, stsz.start + 8);
  const chunkOffset = u32(bytes, stco.start + 8);
  expect(chunkOffset).toBe(mdat.start);
  expect(sampleCount).toBe(times.length);
  const payload = bytes.subarray(chunkOffset, chunkOffset + sampleCount * sampleSize);
  expect(payload.length).toBe(mdat.end - mdat.start);
  expect(payload.every((byte) => byte === 0)).toBe(true);
  const movieDuration = u32(bytes, mvhd.start + 16);
  expect(u32(bytes, mdhd.start + 16)).toBe(movieDuration);
  expect(u32(bytes, tkhd.start + 20)).toBe(movieDuration);
  expect(cursor).toBe(movieDuration);
  return {
    brand: text(bytes, ftyp.start, 4),
    brands,
    durationMs: movieDuration,
    timescale: u32(bytes, mvhd.start + 12),
    width: u32(bytes, tkhd.end - 8) >> 16,
    height: u32(bytes, tkhd.end - 4) >> 16,
    times,
    payload: sampleSize,
  };
}

describe("exportMp4", () => {
  test("starts with an ftyp box and records the duration", async () => {
    const composition = cloneComposition();
    const before = JSON.stringify(composition);
    const blob = exportMp4(composition);
    expect(JSON.stringify(composition)).toBe(before);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("video/mp4");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(text(bytes, 4, 4)).toBe("ftyp");
    const parsed = parseMp4(bytes);
    expect(parsed.brand).toBe("isom");
    expect(parsed.brands).toEqual(["isom", "mp41"]);
    expect(parsed.timescale).toBe(1000);
    expect(parsed.durationMs).toBe(3000);
    expect(parsed.width).toBe(composition.width);
    expect(parsed.height).toBe(composition.height);
    expect(parsed.times).toHaveLength(90);
    expect(parsed.payload).toBe(4);
    const gaps = parsed.times.slice(1).map((time, index) => time - (parsed.times[index] ?? 0));
    expect(parsed.times[0]).toBe(0);
    expect(gaps.slice(0, 30).every((gap) => gap === 34)).toBe(true);
    expect(gaps.slice(30).every((gap) => gap === 33)).toBe(true);
    expect(mp4Exporter.id).toBe("mp4");
    expect(mp4Exporter.schema).toBe("svgif.exporter/1");
    const again = new Uint8Array(await mp4Exporter.export(composition).arrayBuffer());
    expect(again).toEqual(bytes);
  });

  test("uses the composition length when it is not the fixture", async () => {
    const composition = cloneComposition();
    composition.fps = 24;
    composition.durationInFrames = 2;
    composition.width = 31;
    composition.height = 17;
    const parsed = parseMp4(new Uint8Array(await exportMp4(composition).arrayBuffer()));
    expect(parsed.times).toEqual([0, 42]);
    expect(parsed.durationMs).toBe(83);
    expect(parsed.width).toBe(31);
    expect(parsed.height).toBe(17);
  });

  test("gives every frame at least one millisecond when fps is above 1000", async () => {
    const composition = cloneComposition();
    composition.fps = 10000;
    composition.durationInFrames = 2;
    composition.width = 2;
    composition.height = 2;
    const parsed = parseMp4(new Uint8Array(await exportMp4(composition).arrayBuffer()));
    expect(parsed.times).toEqual([0, 1]);
    expect(parsed.durationMs).toBe(2);
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
    expect(() => exportMp4(null as unknown as SvgComposition)).toThrow(/object/);
    expect(() => exportMp4([] as unknown as SvgComposition)).toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    expect(() => exportMp4(width)).toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    expect(() => exportMp4(height)).toThrow(/composition\.height/);
    const wide = cloneComposition();
    wide.width = 16385;
    expect(() => exportMp4(wide)).toThrow(/at most 16384/);
    const tall = cloneComposition();
    tall.height = 16385;
    expect(() => exportMp4(tall)).toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    expect(() => exportMp4(missing)).toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    expect(() => exportMp4(extra)).toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    expect(() => exportMp4(nodes)).toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    expect(() => exportMp4(duration)).toThrow(/durationInFrames/);
  });

  test("accepts the largest edge", async () => {
    const composition = cloneComposition();
    composition.width = 16384;
    composition.height = 1;
    composition.durationInFrames = 1;
    composition.fps = 1;
    const parsed = parseMp4(new Uint8Array(await exportMp4(composition).arrayBuffer()));
    expect(parsed.times).toEqual([0]);
    expect(parsed.width).toBe(16384);
    expect(parsed.height).toBe(1);
    expect(parsed.durationMs).toBe(1000);
    expect(parsed.payload).toBe(4);
  });

  test("does not hash canvas pixels and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "mp4.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const source = readFileSync(resolve(srcDir, "mp4.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("renderFrame(document, frame)")).toBe(true);
    expect(source.includes("ftyp")).toBe(true);
    expect(source.includes("duration")).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/studio-export]]")).toBe(true);
    expect(source.includes("[[adr:svgif/20261110121700]]")).toBe(true);
    expect(source.includes("Canvas pixels are not hashed")).toBe(true);
    const exporter: Mp4Exporter = mp4Exporter;
    expect(exporter.id).toBe("mp4");
  });
});
