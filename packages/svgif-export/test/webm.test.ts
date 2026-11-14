/**
 * A bad composition still fails on `exportAnimatedWebm`.
 * `renderFrame` stays the integer-frame document. Canvas pixels are not hashed.
 * Picture bytes are proved in pixels.test.ts.
 * [[sot:svgif/studio-export]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportAnimatedWebm, renderFrame, webmExporter, type WebmExporter } from "../src/index.ts";
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

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

describe("webm frames", () => {
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
    await expect(exportAnimatedWebm(null as unknown as SvgComposition)).rejects.toThrow(/object/);
    await expect(exportAnimatedWebm([] as unknown as SvgComposition)).rejects.toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    await expect(exportAnimatedWebm(width)).rejects.toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    await expect(exportAnimatedWebm(height)).rejects.toThrow(/composition\.height/);
    const wide = cloneComposition();
    wide.width = 16385;
    await expect(exportAnimatedWebm(wide)).rejects.toThrow(/at most 16384/);
    const tall = cloneComposition();
    tall.height = 16385;
    await expect(exportAnimatedWebm(tall)).rejects.toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    await expect(exportAnimatedWebm(missing)).rejects.toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    await expect(exportAnimatedWebm(extra)).rejects.toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    await expect(exportAnimatedWebm(nodes)).rejects.toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    await expect(exportAnimatedWebm(duration)).rejects.toThrow(/durationInFrames/);
  });

  test("does not hash canvas pixels and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "mp4.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const source = readFileSync(resolve(srcDir, "webm.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("EBML")).toBe(true);
    expect(source.includes("webm")).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/studio-export]]")).toBe(true);
    expect(source.includes("does not encode MP4")).toBe(true);
    expect(source.includes("Canvas pixels are not hashed")).toBe(true);
    expect(source.includes("exportAnimatedWebm")).toBe(true);
    const exporter: WebmExporter = webmExporter;
    expect(exporter.id).toBe("webm");
    expect(exporter.schema).toBe("svgif.exporter/1");
  });
});
