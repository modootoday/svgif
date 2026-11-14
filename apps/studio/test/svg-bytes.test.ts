/**
 * SVG bytes captured from svgFile before it called exportSvg with loop.
 * The capture is the sale text node and a shape that also carries words.
 * Loop on and loop off are stored for every backend.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addElement, createEditor, setText, type Composition } from "../src/composition.ts";
import { ExportCapabilityError, mp4Download, videoFile, webmDownload, webpDownload } from "../src/download-plain.ts";
import { svgFile } from "../src/svg-file.ts";
import type { SvgBackend } from "../../../packages/svgif-export/src/svg.ts";

const fixtureDir = join(import.meta.dir, "fixtures/svg-before");
const backends: SvgBackend[] = ["css-embedded", "smil", "css-external"];

function withText(composition: Composition, text: string): Composition {
  const node = composition.nodes[0];
  if (!node) throw new Error("fixture composition has no node");
  (node as Composition["nodes"][number] & { text?: string }).text = text;
  return composition;
}

function saleComposition(loop: boolean): Composition {
  const composition: Composition = {
    fps: 30,
    width: 640,
    height: 360,
    durationInFrames: 30,
    nodes: [
      {
        id: "s-sale",
        tracks: [
          {
            property: "transform.translateX",
            keys: [
              { frame: 0, value: 0 },
              { frame: 20, value: 120, easing: "cubic-bezier(0.2,0,0,1)" },
            ],
          },
          {
            property: "attr.fill",
            keys: [
              { frame: 0, value: "#112233" },
              { frame: 20, value: "#445566", easing: "linear" },
            ],
          },
          {
            property: "attr.opacity",
            keys: [
              { frame: 0, value: 1 },
              { frame: 20, value: 0.4, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  if (loop) composition.loop = true;
  return withText(composition, "Sale 50%");
}

function shapeComposition(loop: boolean): Composition {
  const composition: Composition = {
    fps: 30,
    width: 640,
    height: 360,
    durationInFrames: 12,
    nodes: [
      {
        id: "s-n-1",
        tracks: [
          { property: "attr.d", keys: [{ frame: 0, value: "M 180 90 H 460 V 250 H 180 Z" }] },
          { property: "attr.fill", keys: [{ frame: 0, value: "#c4552a" }] },
          {
            property: "transform.translateY",
            keys: [
              { frame: 0, value: 24 },
              { frame: 8, value: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            ],
          },
        ],
      },
    ],
  };
  if (loop) composition.loop = true;
  return withText(composition, "Sale 50%");
}

function captured(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtureDir, name)));
}

describe("svg bytes stay the bytes captured before the export switch", () => {
  test("looped and play-once files match for every backend", async () => {
    const cases: Array<[string, (loop: boolean) => Composition]> = [
      ["sale", saleComposition],
      ["shape", shapeComposition],
    ];
    for (const [name, build] of cases) {
      for (const backend of backends) {
        const ext = backend === "css-external" ? "zip" : "svg";
        const once = new Uint8Array(await svgFile(build(false), backend).arrayBuffer());
        const explicit = new Uint8Array(await svgFile({ ...build(false), loop: false }, backend).arrayBuffer());
        const looped = new Uint8Array(await svgFile(build(true), backend).arrayBuffer());
        expect(once).toEqual(captured(`${name}-off-${backend}.${ext}`));
        expect(explicit).toEqual(captured(`${name}-off-${backend}.${ext}`));
        expect(looped).toEqual(captured(`${name}-on-${backend}.${ext}`));
      }
    }
  });

  test("studio no longer compiles the zip or calls the synchronous raster exporters", () => {
    const svgSource = readFileSync(join(import.meta.dir, "../src/svg-file.ts"), "utf8");
    const plainSource = readFileSync(join(import.meta.dir, "../src/download-plain.ts"), "utf8");
    const mainSource = readFileSync(join(import.meta.dir, "../src/main.ts"), "utf8");
    expect(svgSource.includes("zipStored")).toBe(false);
    expect(svgSource.includes("compile(")).toBe(false);
    expect(svgSource.includes("loop: composition.loop === true")).toBe(true);
    for (const name of ["exportWebp", "exportWebm", "exportMp4"]) {
      expect(plainSource.includes(name)).toBe(false);
      expect(mainSource.includes(name)).toBe(false);
    }
    expect(plainSource.includes("exportAnimatedWebp")).toBe(true);
    expect(plainSource.includes("exportAnimatedWebm")).toBe(true);
    expect(plainSource.includes("exportAnimatedMp4")).toBe(true);
    expect(mainSource.includes("await videoFile")).toBe(true);
    expect(mainSource.includes("Making the video")).toBe(false);
    expect(mainSource.includes("VIDEO_PROGRESS")).toBe(true);
  });

  test("a browser that cannot rasterize writes no video file", async () => {
    const state = createEditor();
    const node = addElement(state, "rectangle");
    setText(state, node.id, "Sale 50%");
    const attempts = [webpDownload(state), webmDownload(state), mp4Download(state), videoFile(state, "webm")];
    for (const attempt of attempts) {
      let wrote = false;
      try {
        await attempt;
        wrote = true;
      } catch (error) {
        expect(error).toBeInstanceOf(ExportCapabilityError);
        if (error instanceof ExportCapabilityError) {
          expect(error.code === "raster-unsupported" || error.code === "codec-unsupported").toBe(true);
        }
      }
      expect(wrote).toBe(false);
    }
  });
});
