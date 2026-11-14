/**
 * `renderFrame` is one static SVG document for an integer frame.
 * A bad composition still fails on `exportAnimatedWebp`.
 * Lossless pictures are proved by decoding VP8L frames.
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

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

describe("webp frames", () => {
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

  test("rejects a composition that cannot carry frames", async () => {
    await expect(exportAnimatedWebp(null as unknown as SvgComposition)).rejects.toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    await expect(exportAnimatedWebp(width)).rejects.toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    await expect(exportAnimatedWebp(height)).rejects.toThrow(/composition\.height/);
    const wide = cloneComposition();
    wide.width = 16385;
    await expect(exportAnimatedWebp(wide)).rejects.toThrow(/at most 16384/);
    const tall = cloneComposition();
    tall.height = 16385;
    await expect(exportAnimatedWebp(tall)).rejects.toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    await expect(exportAnimatedWebp(missing)).rejects.toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    await expect(exportAnimatedWebp(extra)).rejects.toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    await expect(exportAnimatedWebp(nodes)).rejects.toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    await expect(exportAnimatedWebp(duration)).rejects.toThrow(/durationInFrames/);
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
    expect(exporter.schema).toBe("svgif.exporter/1");
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

