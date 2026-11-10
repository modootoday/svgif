/**
 * SMIL golden. One IR fixture, one SVG.
 * sample(lowered, frame) matches sample(source, frame) on every frame.
 * The SVG string is the quantized artifact.
 * [[sot:svgif/animation-backends]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backend, compile, id, lower, schema, type SmilCompileResult } from "../src/backend/smil/index.ts";
import { sample, type TimelineIr } from "../src/ir/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const smilEntry = resolve(here, "../src/backend/smil/index.ts");
const WALL_CLOCK = ["Date.now", "performance.now", "Math.random"];

function filesReachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  const importFrom = /from\s+["'](\.[^"']+)["']/g;
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    importFrom.lastIndex = 0;
    let match = importFrom.exec(text);
    while (match) {
      const spec = match[1];
      if (spec) {
        let next = resolve(dirname(file), spec);
        if (!next.endsWith(".ts")) next += ".ts";
        pending.push(next);
      }
      match = importFrom.exec(text);
    }
  }
  return [...seen];
}

function document(partial: Pick<TimelineIr, "nodes"> & Partial<TimelineIr>): TimelineIr {
  return {
    fps: 10,
    width: 320,
    height: 180,
    durationInFrames: 5,
    ...partial,
  };
}

const source: TimelineIr = document({
  nodes: [
    {
      id: "s-move",
      tracks: [
        {
          property: "transform.translateX",
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 40, easing: "cubic-bezier(0.2,0,0,1)" },
          ],
        },
        {
          property: "transform.translateY",
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 10, easing: "spring" },
          ],
        },
        {
          property: "transform.rotate",
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 90, easing: "linear" },
          ],
        },
        {
          property: "transform.scaleX",
          keys: [
            { frame: 0, value: 1 },
            { frame: 4, value: 2, easing: "linear" },
          ],
        },
        {
          property: "transform.scaleY",
          keys: [
            { frame: 0, value: 1 },
            { frame: 4, value: 0.5, easing: "linear" },
          ],
        },
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 1 },
            { frame: 4, value: 0.25, easing: "linear" },
          ],
        },
        {
          property: "attr.fill",
          keys: [
            { frame: 0, value: "#112233" },
            { frame: 4, value: "#445566", easing: "linear" },
          ],
        },
        {
          property: "attr.stroke",
          keys: [
            { frame: 0, value: "#000000" },
            { frame: 4, value: "#ffffff", easing: "linear" },
          ],
        },
        {
          property: "attr.d",
          keys: [
            { frame: 0, value: "M 0 0 L 10 0" },
            { frame: 4, value: "M 0 4 L 10 4", easing: "linear" },
          ],
        },
        {
          property: "attr.offsetDistance",
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 1, easing: "cubic-bezier(0.4,0,0.2,1)" },
          ],
        },
        {
          property: "filter.feGaussianBlur.stdDeviation",
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 2, easing: "linear" },
          ],
        },
        {
          property: "gradient.s0.offset",
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 1, easing: "linear" },
          ],
        },
        {
          property: "gradient.s0.stop-color",
          keys: [
            { frame: 0, value: "#000000" },
            { frame: 4, value: "#ff0000", easing: "linear" },
          ],
        },
        {
          property: "clip",
          keys: [
            { frame: 0, value: "M 0 0 L 8 0 L 8 8 Z" },
            { frame: 4, value: "M 0 0 L 8 0 L 8 4 Z", easing: "linear" },
          ],
        },
        {
          property: "mask",
          keys: [
            { frame: 0, value: "M 0 0 L 4 0 L 4 4 Z" },
            { frame: 4, value: "M 0 0 L 6 0 L 6 4 Z", easing: "linear" },
          ],
        },
      ],
    },
    {
      id: "s-hide",
      tracks: [
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 1 },
            { frame: 2, value: 0, easing: "hold" },
          ],
        },
      ],
    },
    {
      id: "s-hold",
      tracks: [
        {
          property: "attr.d",
          keys: [
            { frame: 0, value: "M 0 0 L 10 10" },
            { frame: 4, value: "M 0 0 L 10 10 L 20 20", easing: "linear" },
          ],
        },
        {
          property: "transform.matrix",
          keys: [
            { frame: 0, value: [1, 0, 0, 1, 0, 0] },
            { frame: 4, value: [1, 0, 0, 1, 12, 0], easing: "linear" },
          ],
        },
      ],
    },
  ],
});

const GOLDEN = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <path id="s-move-motion" d="M 0 0 L 100 0"/>
    <filter id="s-move-filter">
      <feGaussianBlur stdDeviation="0">
        <animate attributeName="stdDeviation" begin="0s" end="0.4s" calcMode="linear" values="0;2" keyTimes="0;1" fill="freeze"/>
      </feGaussianBlur>
    </filter>
    <linearGradient id="s-move-gradient">
      <stop id="s-move-s0" offset="0" stop-color="#000000">
        <animate attributeName="offset" begin="0s" end="0.4s" calcMode="linear" values="0;1" keyTimes="0;1" fill="freeze"/>
        <animate attributeName="stop-color" begin="0s" end="0.4s" calcMode="linear" values="#000000;#ff0000" keyTimes="0;1" fill="freeze"/>
      </stop>
    </linearGradient>
    <clipPath id="s-move-clip">
      <path d="M 0 0 L 8 0 L 8 8 Z">
        <animate attributeName="d" begin="0s" end="0.4s" calcMode="linear" values="M 0 0 L 8 0 L 8 8 Z;M 0 0 L 8 0 L 8 4 Z" keyTimes="0;1" fill="freeze"/>
      </path>
    </clipPath>
    <mask id="s-move-mask" maskUnits="userSpaceOnUse">
      <path d="M 0 0 L 4 0 L 4 4 Z">
        <animate attributeName="d" begin="0s" end="0.4s" calcMode="linear" values="M 0 0 L 4 0 L 4 4 Z;M 0 0 L 6 0 L 6 4 Z" keyTimes="0;1" fill="freeze"/>
      </path>
    </mask>
  </defs>
  <g id="s-move" opacity="1" fill="#112233" stroke="#000000" filter="url(#s-move-filter)" clip-path="url(#s-move-clip)" mask="url(#s-move-mask)">
    <animateTransform attributeName="transform" type="translate" begin="0s" end="0.4s" calcMode="spline" values="0 0;40 0" keyTimes="0;1" keySplines="0.2 0 0 1" additive="sum" fill="freeze"/>
    <animateTransform attributeName="transform" type="translate" begin="0s" end="0.4s" calcMode="linear" values="0 0;0 12;0 4.8;0 13.92;0 10" keyTimes="0;0.25;0.5;0.75;1" additive="sum" fill="freeze"/>
    <animateTransform attributeName="transform" type="rotate" begin="0s" end="0.4s" calcMode="linear" values="0;90" keyTimes="0;1" additive="sum" fill="freeze"/>
    <animateTransform attributeName="transform" type="scale" begin="0s" end="0.4s" calcMode="linear" values="1 1;2 1" keyTimes="0;1" additive="sum" fill="freeze"/>
    <animateTransform attributeName="transform" type="scale" begin="0s" end="0.4s" calcMode="linear" values="1 1;1 0.5" keyTimes="0;1" additive="sum" fill="freeze"/>
    <animate attributeName="opacity" begin="0s" end="0.4s" calcMode="linear" values="1;0.25" keyTimes="0;1" fill="freeze"/>
    <animate attributeName="fill" begin="0s" end="0.4s" calcMode="linear" values="#112233;#445566" keyTimes="0;1" fill="freeze"/>
    <animate attributeName="stroke" begin="0s" end="0.4s" calcMode="linear" values="#000000;#ffffff" keyTimes="0;1" fill="freeze"/>
    <animateMotion begin="0s" end="0.4s" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.4 0 0.2 1" fill="freeze">
      <mpath href="#s-move-motion"/>
    </animateMotion>
    <path id="s-move-shape" d="M 0 0 L 10 0">
      <animate attributeName="d" begin="0s" end="0.4s" calcMode="linear" values="M 0 0 L 10 0;M 0 4 L 10 4" keyTimes="0;1" fill="freeze"/>
    </path>
  </g>
  <g id="s-hide" opacity="1">
    <set attributeName="opacity" to="0" begin="0.2s" end="0.5s" fill="freeze"/>
  </g>
  <g id="s-hold">
    <animateTransform attributeName="transform" type="matrix" begin="0s" end="0.4s" calcMode="linear" values="1 0 0 1 0 0;1 0 0 1 12 0" keyTimes="0;1" additive="sum" fill="freeze"/>
    <path id="s-hold-shape" d="M 0 0 L 10 10">
      <animate attributeName="d" begin="0s" end="0.4s" calcMode="discrete" values="M 0 0 L 10 10;M 0 0 L 10 10 L 20 20" keyTimes="0;1" fill="freeze"/>
    </path>
  </g>
</svg>`;

function track(ir: TimelineIr, nodeId: string, property: string) {
  return ir.nodes.find((node) => node.id === nodeId)?.tracks.find((item) => item.property === property);
}

describe("smil", () => {
  test("the lowered fixture matches the source at every frame, and the SVG is the golden", () => {
    const lowered = lower(source);
    for (let frame = -1; frame <= source.durationInFrames; frame += 1) {
      expect(sample(lowered, frame)).toEqual(sample(source, frame));
    }

    const spring = track(lowered, "s-move", "transform.translateY");
    expect(spring?.keys.map((key) => key.frame)).toEqual([0, 1, 2, 3, 4]);
    expect(spring?.keys.some((key) => key.easing === "spring")).toBe(false);
    expect(track(source, "s-move", "transform.translateY")?.keys[1]?.easing).toBe("spring");

    const held = track(lowered, "s-hold", "attr.d");
    expect(held?.keys[1]?.easing).toBe("hold");
    expect(sample(lowered, 1)["s-hold"]?.["attr.d"]).toBe("M 0 0 L 10 10");
    expect(sample(lowered, 4)["s-hold"]?.["attr.d"]).toBe("M 0 0 L 10 10 L 20 20");

    const matrix = track(source, "s-hold", "transform.matrix")?.keys[0]?.value;
    const copied = track(lowered, "s-hold", "transform.matrix")?.keys[0]?.value;
    expect(Array.isArray(matrix)).toBe(true);
    expect(copied).not.toBe(matrix);
    expect(copied).toEqual(matrix);

    const result = compile(source);
    const again = compile(source);
    const expected: SmilCompileResult = {
      schemaVersion: 1,
      schemaRevision: 0,
      id: "smil",
      schema: "svgif.backend/1",
      svg: GOLDEN,
    };
    expect(result).toEqual(expected);
    expect(again.svg).toBe(result.svg);
    expect("css" in result).toBe(false);
    expect(result.svg).toContain("<animate ");
    expect(result.svg).toContain("<animateTransform ");
    expect(result.svg).toContain("<animateMotion ");
    expect(result.svg).toContain("<set ");
    expect(result.svg).toContain('keyTimes="');
    expect(result.svg).toContain('keySplines="0.2 0 0 1"');
    expect(result.svg).toContain('keySplines="0.4 0 0.2 1"');
    expect(result.svg).toContain('begin="');
    expect(result.svg).toContain('end="');
    expect(result.svg).toContain("<mpath ");
    expect(result.svg).not.toContain("matrix3d");
    expect(result.svg).not.toContain("<style");
    expect(id).toBe("smil");
    expect(schema).toBe("svgif.backend/1");
    expect(backend.id).toBe(id);
    expect(backend.schema).toBe(schema);
    expect(backend.compile).toBe(compile);
  });

  test("a cubic-bezier outside 0..1 is baked to per-frame keys", () => {
    const ir = document({
      nodes: [
        {
          id: "s-bend",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0 },
                { frame: 4, value: 40, easing: "cubic-bezier(1.5,0,0,1)" },
              ],
            },
          ],
        },
      ],
    });
    const lowered = lower(ir);
    expect(track(lowered, "s-bend", "transform.translateX")?.keys).toHaveLength(ir.durationInFrames);
    expect(track(lowered, "s-bend", "transform.translateX")?.keys.some((key) => key.easing?.startsWith("cubic-bezier"))).toBe(false);
    for (let frame = 0; frame < ir.durationInFrames; frame += 1) {
      expect(sample(lowered, frame)).toEqual(sample(ir, frame));
    }
    expect(compile(ir).svg).not.toContain("keySplines");
    expect(compile(ir).svg).toContain('type="translate"');
  });

  test("a non-affine matrix stays in the SVG and still samples equal", () => {
    const ir = document({
      durationInFrames: 2,
      nodes: [
        {
          id: "s-box",
          tracks: [
            {
              property: "transform.matrix",
              keys: [
                { frame: 0, value: [1, 0, 0, 1] },
                { frame: 1, value: [2, 0, 0, 1], easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const lowered = lower(ir);
    for (let frame = 0; frame < ir.durationInFrames; frame += 1) {
      expect(sample(lowered, frame)).toEqual(sample(ir, frame));
    }
    const svg = compile(ir).svg;
    expect(svg).toContain('attributeName="transform"');
    expect(svg).toContain('values="1 0 0 1;2 0 0 1"');
    expect(svg).not.toContain('type="matrix"');
    expect(svg).not.toContain("matrix3d");
  });

  test("a single key is a static attribute", () => {
    const ir = document({
      durationInFrames: 1,
      nodes: [
        {
          id: "s-still",
          tracks: [{ property: "attr.opacity", keys: [{ frame: 0, value: 0.5 }] }],
        },
      ],
    });
    expect(compile(ir).svg).toContain('<g id="s-still" opacity="0.5"/>');
    expect(sample(lower(ir), 0)).toEqual(sample(ir, 0));
  });

  test("the backend rejects another id and does not read a wall clock", () => {
    expect(() => compile(source, { backend: "css-embedded" })).toThrow(TypeError);
    const files = filesReachableFrom(smilEntry);
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of WALL_CLOCK) {
        expect(text.includes(token)).toBe(false);
      }
    }
  });
});
