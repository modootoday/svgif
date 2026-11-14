/**
 * A bad composition still fails on `exportAnimatedMp4`.
 * `renderFrame` stays the integer-frame document. Canvas pixels are not hashed.
 * Picture bytes are proved in pixels.test.ts.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121700]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportAnimatedMp4, renderFrame, mp4Exporter, type Mp4Exporter } from "../src/index.ts";
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

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

describe("mp4 frames", () => {
  test("reads each integer frame from renderFrame", () => {
    const composition = cloneComposition();
    const start = renderFrame(composition, 0);
    const later = renderFrame(composition, 30);
    expect(start.includes('data-frame="0"')).toBe(true);
    expect(later.includes('data-frame="30"')).toBe(true);
    expect(start).not.toBe(later);
    expect(() => renderFrame(composition, 1.5)).toThrow(/integer/);
  });

  test("rejects a composition that cannot carry frames", async () => {
    await expect(exportAnimatedMp4(null as unknown as SvgComposition)).rejects.toThrow(/object/);
    await expect(exportAnimatedMp4([] as unknown as SvgComposition)).rejects.toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    await expect(exportAnimatedMp4(width)).rejects.toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    await expect(exportAnimatedMp4(height)).rejects.toThrow(/composition\.height/);
    const wide = cloneComposition();
    wide.width = 16385;
    await expect(exportAnimatedMp4(wide)).rejects.toThrow(/at most 16384/);
    const tall = cloneComposition();
    tall.height = 16385;
    await expect(exportAnimatedMp4(tall)).rejects.toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    await expect(exportAnimatedMp4(missing)).rejects.toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    await expect(exportAnimatedMp4(extra)).rejects.toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    await expect(exportAnimatedMp4(nodes)).rejects.toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    await expect(exportAnimatedMp4(duration)).rejects.toThrow(/durationInFrames/);
  });

  test("does not hash canvas pixels and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "mp4.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const source = readFileSync(resolve(srcDir, "mp4.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("ftyp")).toBe(true);
    expect(source.includes("duration")).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/studio-export]]")).toBe(true);
    expect(source.includes("[[adr:svgif/20261110121700]]")).toBe(true);
    expect(source.includes("Canvas pixels are not hashed")).toBe(true);
    expect(source.includes("exportAnimatedMp4")).toBe(true);
    const exporter: Mp4Exporter = mp4Exporter;
    expect(exporter.id).toBe("mp4");
    expect(exporter.schema).toBe("svgif.exporter/1");
  });
});
