/**
 * The WebP artifact starts with RIFF/WEBP and records the frame count and the duration.
 * Frames come from renderFrame at integer frames. Canvas pixels are not hashed.
 * [[sot:svgif/determinism]] [[adr:svgif/20261110121700]]
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimelineIr } from "../../svgif/src/ir/types.ts";
import { compile } from "../../svgif/src/lower/index.ts";
import { TEXT_FONT_FAMILY } from "../../svgif/src/lower/text.ts";
import {
  encodeAnimatedWebp,
  exportAnimatedWebp,
  exportWebp,
  renderFrame,
  webpExporter,
  ExportCapabilityError,
  type WebpExporter,
} from "../src/index.ts";
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
    expect(start.includes("<g ")).toBe(true);
    expect(later.includes('data-frame="30"')).toBe(true);
    expect(start).not.toBe(later);
    const startCss = compilerTransform(compile(composition as TimelineIr, "css-embedded").svg, "s-n0");
    const laterCss = compilerTransform(compile(composition as TimelineIr, "css-embedded").svg, "s-n0");
    expect(numbersIn(elementTransform(start, "s-n0") ?? "")).toEqual(numbersIn(stopValue(startCss, 0, composition.durationInFrames) ?? ""));
    expect(numbersIn(elementTransform(later, "s-n0") ?? "")).toEqual(numbersIn(stopValue(laterCss, 30, composition.durationInFrames) ?? ""));
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
    expect(svg.includes('<g id="s-plain"/>')).toBe(true);
    expect(svg.includes('<path id="s-mark" d="M0 0"')).toBe(true);
    expect(svg.includes("a<b&c>")).toBe(false);
    expect(svg.includes("label")).toBe(false);
    expect(elementTransform(svg, "s-mark")).toBe("matrix(1, 0, 0, 1, 2, 3)");
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
    expect(source.includes("encodeLosslessRgba")).toBe(true);
    expect(source.includes("createImageBitmap")).toBe(true);
    expect(source.includes("TEXT_FONT_FAMILY")).toBe(true);
    expect(source.includes("exportAnimatedWebp")).toBe(true);
    const exporter: WebpExporter = webpExporter;
    expect(exporter.id).toBe("webp");
  });
});

function numbersIn(value: string): number[] {
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function elementTransform(svg: string, id: string): string | undefined {
  const match = new RegExp(`<(?:g|path|text)\\b[^>]*\\bid="${id}"[^>]*>`).exec(svg);
  if (!match) return undefined;
  return /\btransform="([^"]*)"/.exec(match[0])?.[1];
}

function styleText(svg: string): string {
  return /<style><!\[CDATA\[([\s\S]*?)\]\]><\/style>/.exec(svg)?.[1] ?? "";
}

function compilerTransform(svg: string, id: string): string {
  const css = styleText(svg);
  const animated = new RegExp(`@keyframes ${id}-transform \\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (animated?.[1]) return animated[1];
  const rule = new RegExp(`#${id} \\{([\\s\\S]*?)\\n\\}`).exec(css);
  return (rule?.[1] ? /transform:\s*([^;]+);/.exec(rule[1])?.[1] : undefined) ?? "";
}

function stopValue(block: string, frame: number, duration: number): string | undefined {
  if (!block.includes("%")) return block.trim();
  const target = frame === duration - 1 ? 100 : (frame / duration) * 100;
  let best: { dist: number; value: string } | undefined;
  for (const stop of block.matchAll(/([\d.]+)%\s*\{([\s\S]*?)\}/g)) {
    const value = /transform:\s*([^;]+);/.exec(stop[2] ?? "")?.[1];
    if (!value) continue;
    const dist = Math.abs(Number(stop[1]) - target);
    if (!best || dist < best.dist) best = { dist, value };
  }
  return best?.value;
}

function pathDs(svg: string): string[] {
  return [...svg.matchAll(/\bd="([^"]*)"/g)].map((match) => match[1] ?? "");
}

function textInners(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => match[1] ?? "");
}

function decodeAnimation(bytes: Uint8Array): Uint8ClampedArray[] {
  const dir = mkdtempSync(join(tmpdir(), "svgif-webp-"));
  const file = join(dir, "frames.webp");
  writeFileSync(file, bytes);
  const dumped = spawnSync("anim_dump", ["-folder", dir, file], { encoding: "utf8" });
  if (dumped.error) throw new Error("anim_dump is not available");
  if (dumped.status !== 0) throw new Error(dumped.stderr || "anim_dump failed");
  const pngs = readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort();
  return pngs.map((name) => {
    const raw = spawnSync("ffmpeg", ["-v", "error", "-i", join(dir, name), "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], {
      encoding: "buffer",
    });
    if (raw.status !== 0) throw new Error("ffmpeg could not read the decoded frame");
    return new Uint8ClampedArray(raw.stdout);
  });
}

describe("frame geometry", () => {
  test("a static frame matches the compiler at that frame", () => {
    const composition: SvgComposition = {
      fps: 10,
      width: 200,
      height: 80,
      durationInFrames: 3,
      nodes: [
        {
          id: "s-sale",
          text: "Sale 50%",
          tracks: [
            { property: "attr.d", keys: [{ frame: 0, value: "M0 0 H 8" }] },
            { property: "attr.fill", keys: [{ frame: 0, value: "#112233" }] },
            { property: "attr.opacity", keys: [{ frame: 0, value: 0.5 }] },
            { property: "label", keys: [{ frame: 0, value: "headline" }] },
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 100 },
                { frame: 1, value: 40 },
                { frame: 2, value: 76 },
              ],
            },
            {
              property: "transform.translateY",
              keys: [
                { frame: 0, value: 80 },
                { frame: 1, value: 90 },
                { frame: 2, value: 88 },
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
        },
        { id: "s-quote", text: "Tom & Jerry <3", tracks: [] },
        { id: "s-empty", text: "", tracks: [{ property: "attr.fill", keys: [{ frame: 0, value: "#112233" }] }] },
      ],
    };
    const compiled = compile(composition as TimelineIr, "css-embedded");
    const css = styleText(compiled.svg);
    expect(css).toContain("s-sale-transform");
    for (const frame of [0, 1, 2]) {
      const svg = renderFrame(composition, frame);
      expect(textInners(svg)).toEqual(textInners(compiled.svg));
      expect(textInners(svg).join("")).toContain("Sale 50%");
      expect(svg).toContain("%");
      expect(svg).toContain(`font-family="${TEXT_FONT_FAMILY}"`);
      expect(svg).not.toContain("headline");
      if (frame === 0) expect(pathDs(svg)).toEqual(pathDs(compiled.svg));
      expect(svg).toContain('fill="#112233"');
      expect(svg).toContain('opacity="0.5"');
      const fromCompiler = stopValue(compilerTransform(compiled.svg, "s-sale"), frame, composition.durationInFrames);
      expect(fromCompiler).toBeTruthy();
      expect(numbersIn(elementTransform(svg, "s-sale") ?? "")).toEqual(numbersIn(fromCompiler ?? ""));
    }
    const empty = renderFrame(composition, 0);
    expect(empty).toContain("<text");
    expect(textInners(empty)[2]).toBe("");
  });
});

describe("lossless pictures", () => {
  test("decoded frames match the RGBA that was encoded", () => {
    const first = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128]);
    const second = new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 0, 255, 0, 0, 0, 255, 1, 2, 3, 4]);
    const blob = encodeAnimatedWebp(2, 2, [first, second], [40, 60]);
    return blob.arrayBuffer().then((buffer) => {
      const frames = decodeAnimation(new Uint8Array(buffer));
      expect(frames).toHaveLength(2);
      expect(frames[0]).toEqual(first);
      expect(frames[1]).toEqual(second);
      expect(frames[0]).not.toEqual(frames[1]);
    });
  });

  test("a runtime without a canvas throws and does not invent a picture", async () => {
    const composition = cloneComposition();
    composition.durationInFrames = 1;
    composition.width = 8;
    composition.height = 8;
    try {
      const blob = await exportAnimatedWebp(composition);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(text(bytes, 0, 4)).toBe("RIFF");
      expect(bytes.length).toBeGreaterThan(32);
    } catch (error) {
      expect(error).toBeInstanceOf(ExportCapabilityError);
      expect((error as ExportCapabilityError).code).toBe("raster-unsupported");
    }
  });
});

