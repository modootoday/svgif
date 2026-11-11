/**
 * SMIL golden. One IR fixture, one SVG.
 * sample(lowered, frame) matches sample(source, frame) on every frame.
 * The SVG string is the quantized artifact.
 * Finite dur is sampled at frame 0 and a mid frame.
 * Clip and shape geometry match at a mid frame and the last frame.
 * [[sot:svgif/animation-backends]] [[sot:svgif/determinism]]
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backend, compile, id, lower, schema, type SmilCompileResult } from "../src/backend/smil/index.ts";
import { compile as compileTimeline, lower as lowerTimeline } from "../src/lower/index.ts";
import { unitBezier } from "../src/ir/easing.ts";
import { formatUnit, sample, type TimelineIr } from "../src/ir/index.ts";
import { parsePath, writePath } from "../src/ir/path.ts";
import { quantizeByte } from "../src/ir/quantize.ts";

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
        <animate attributeName="stdDeviation" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="0;2" keyTimes="0;1" fill="freeze"/>
      </feGaussianBlur>
    </filter>
    <linearGradient id="s-move-gradient">
      <stop id="s-move-s0" offset="0" stop-color="#000000">
        <animate attributeName="offset" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="0;1" keyTimes="0;1" fill="freeze"/>
        <animate attributeName="stop-color" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="#000000;#ff0000" keyTimes="0;1" fill="freeze"/>
      </stop>
    </linearGradient>
    <clipPath id="s-move-clip" clipPathUnits="userSpaceOnUse">
      <path d="M 0 0 L 8 0 L 8 8 Z">
        <animate attributeName="d" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="M 0 0 L 8 0 L 8 8 Z;M 0 0 L 8 0 L 8 4 Z" keyTimes="0;1" fill="freeze"/>
      </path>
    </clipPath>
    <mask id="s-move-mask" maskUnits="userSpaceOnUse">
      <path d="M 0 0 L 4 0 L 4 4 Z">
        <animate attributeName="d" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="M 0 0 L 4 0 L 4 4 Z;M 0 0 L 6 0 L 6 4 Z" keyTimes="0;1" fill="freeze"/>
      </path>
    </mask>
  </defs>
  <g id="s-move" opacity="1" fill="#112233" stroke="#000000" transform="translate(0 0) rotate(0) scale(1 1)" filter="url(#s-move-filter)" clip-path="url(#s-move-clip)" mask="url(#s-move-mask)">
    <animateTransform attributeName="transform" type="translate" begin="0s" end="0.4s" dur="0.4s" calcMode="spline" values="0 0;40 0" keyTimes="0;1" keySplines="0.2 0 0 1" fill="freeze"/>
    <animateTransform attributeName="transform" type="translate" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="0 0;0 12;0 4.8;0 13.92;0 10" keyTimes="0;0.25;0.5;0.75;1" fill="freeze"/>
    <animateTransform attributeName="transform" type="rotate" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="0;90" keyTimes="0;1" fill="freeze"/>
    <animateTransform attributeName="transform" type="scale" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="1 1;2 1" keyTimes="0;1" fill="freeze"/>
    <animateTransform attributeName="transform" type="scale" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="1 1;1 0.5" keyTimes="0;1" fill="freeze"/>
    <animate attributeName="opacity" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="1;0.25" keyTimes="0;1" fill="freeze"/>
    <animate attributeName="fill" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="#112233;#445566" keyTimes="0;1" fill="freeze"/>
    <animate attributeName="stroke" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="#000000;#ffffff" keyTimes="0;1" fill="freeze"/>
    <animateMotion begin="0s" end="0.4s" dur="0.4s" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.4 0 0.2 1" fill="freeze">
      <mpath href="#s-move-motion"/>
    </animateMotion>
    <path id="s-move-shape" d="M 0 0 L 10 0">
      <animate attributeName="d" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="M 0 0 L 10 0;M 0 4 L 10 4" keyTimes="0;1" fill="freeze"/>
    </path>
  </g>
  <g id="s-hide" opacity="1">
    <set attributeName="opacity" to="0" begin="0.2s" end="0.5s" fill="freeze"/>
  </g>
  <g id="s-hold" transform="matrix(1,0,0,1,0,0)">
    <animateTransform attributeName="transform" type="matrix" begin="0s" end="0.4s" dur="0.4s" calcMode="linear" values="1 0 0 1 0 0;1 0 0 1 12 0" keyTimes="0;1" fill="freeze"/>
    <path id="s-hold-shape" d="M 0 0 L 10 10">
      <animate attributeName="d" begin="0s" end="0.4s" dur="0.4s" calcMode="discrete" values="M 0 0 L 10 10;M 0 0 L 10 10 L 20 20" keyTimes="0;1" fill="freeze"/>
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

  test("an animated translate keeps the frame-0 value without additive sum", () => {
    const ir = document({
      nodes: [
        {
          id: "s-slide",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: -40 },
                { frame: 4, value: 0, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const svg = compile(ir).svg;
    expect(svg).toContain("<animateTransform ");
    expect(svg).toContain('type="translate"');
    expect(svg).toContain('values="-40 0;0 0"');
    expect(svg).not.toContain("additive=");
    const stripped = svg.replace(/<animateTransform\b[^>]*\/>/g, "");
    expect(stripped).not.toContain("<animateTransform");
    expect(stripped).toContain('transform="translate(-40 0)"');
  });

  test("a constant stroke width is the stroke-width attribute", () => {
    const ir = document({
      durationInFrames: 1,
      nodes: [
        {
          id: "s-ink",
          tracks: [{ property: "attr.strokeWidth", keys: [{ frame: 0, value: 1.5 }] }],
        },
      ],
    });
    const svg = compile(ir).svg;
    expect(svg).toContain('stroke-width="1.5"');
    expect(svg).not.toContain("strokeWidth");
    expect(svg).not.toContain("<animate");
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

  test("filter element keys land on filter and primitive keys stay on the primitive", () => {
    const ir = document({
      fps: 10,
      durationInFrames: 4,
      nodes: [
        {
          id: "s-glow",
          tracks: [
            { property: "filter.x", keys: [{ frame: 0, value: "-80%" }] },
            { property: "filter.y", keys: [{ frame: 0, value: "-40%" }] },
            {
              property: "filter.width",
              keys: [
                { frame: 0, value: "200%" },
                { frame: 3, value: "260%", easing: "linear" },
              ],
            },
            {
              property: "filter.height",
              keys: [
                { frame: 0, value: "220%" },
                { frame: 3, value: "280%", easing: "linear" },
              ],
            },
            { property: "filter.feDropShadow.x", keys: [{ frame: 0, value: "-10%" }] },
            {
              property: "filter.feDropShadow.stdDeviation",
              keys: [
                { frame: 0, value: 2 },
                { frame: 3, value: 8, easing: "linear" },
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
    const again = compile(ir).svg;
    expect(again).toBe(svg);
    const filterAt = svg.indexOf("<filter ");
    const filterEnd = svg.indexOf("</filter>", filterAt);
    const filterBlock = svg.slice(filterAt, filterEnd);
    const primitiveAt = filterBlock.indexOf("<feDropShadow");
    expect(filterAt).toBeGreaterThanOrEqual(0);
    expect(primitiveAt).toBeGreaterThan(0);
    const filterOwn = filterBlock.slice(0, primitiveAt);
    const primitive = filterBlock.slice(primitiveAt);
    const filterOpen = filterOwn.slice(0, filterOwn.indexOf(">") + 1);
    const primitiveOpen = primitive.slice(0, primitive.indexOf(">") + 1);
    expect(filterOpen).toBe(
      '<filter id="s-glow-filter" x="-80%" y="-40%" width="200%" height="220%">',
    );
    expect(filterOwn).toContain('attributeName="width"');
    expect(filterOwn).toContain('values="200%;260%"');
    expect(filterOwn).toContain('attributeName="height"');
    expect(filterOwn).toContain('values="220%;280%"');
    expect(filterOwn).not.toContain("<fe");
    expect(filterOwn).not.toContain('attributeName="stdDeviation"');
    expect(primitiveOpen).toBe('<feDropShadow x="-10%" stdDeviation="2">');
    expect(primitive).toContain('attributeName="stdDeviation"');
    expect(primitive).toContain('values="2;8"');
    expect(primitive).not.toContain('attributeName="width"');
    expect(primitive).not.toContain('attributeName="height"');
    expect(primitive).not.toContain('attributeName="x"');
    expect(primitive).not.toContain("-80%");
    expect(svg).not.toContain("<x ");
    expect(svg).not.toContain("<width");
    expect(svg).not.toContain("<height");
    expect(svg).toContain('filter="url(#s-glow-filter)"');
  });

  test("clip and shape geometry match at a mid frame and the last frame", () => {
    const originX = 32;
    const originY = 16;
    const shapeFrom = "M 32 16 L 96 16 L 96 80 L 32 80 Z";
    const shapeTo = "M 32 16 L 120 16 L 120 80 L 32 80 Z";
    const clipFrom = "M 32 16 L 40 16 L 40 80 L 32 80 Z";
    const clipTo = "M 32 16 L 96 16 L 96 80 L 32 80 Z";
    const ir = document({
      fps: 10,
      width: 200,
      height: 120,
      durationInFrames: 5,
      nodes: [
        {
          id: "s-card",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0 },
                { frame: 4, value: 24, easing: "linear" },
              ],
            },
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 1 },
                { frame: 4, value: 0.5, easing: "linear" },
              ],
            },
            {
              property: "attr.d",
              keys: [
                { frame: 0, value: shapeFrom },
                { frame: 4, value: shapeTo, easing: "linear" },
              ],
            },
            {
              property: "clip",
              keys: [
                { frame: 0, value: clipFrom },
                { frame: 4, value: clipTo, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const svg = compile(ir).svg;
    expect(svg).toContain('clipPathUnits="userSpaceOnUse"');
    expect(svg).toContain(`d="${clipFrom}"`);
    expect(svg).toContain(`d="${shapeFrom}"`);
    expect(svg).toContain("<animateTransform");
    expect(svg).toContain('attributeName="opacity"');
    expect(svg).not.toContain("path(");
    const motions = parseMotion(svg);
    const clip = motions.find((item) => item.attribute === "d" && item.values[0] === clipFrom);
    const shape = motions.find((item) => item.attribute === "d" && item.values[0] === shapeFrom);
    expect(clip).toBeDefined();
    expect(shape).toBeDefined();
    const shift = (d: string) => {
      const commands = parsePath(d);
      if (!commands) throw new Error("path");
      const values = commands.map((command) => {
        const args = command.args.slice();
        for (let index = 0; index + 1 < args.length; index += 2) {
          args[index] = (args[index] ?? 0) - originX;
          args[index + 1] = (args[index + 1] ?? 0) - originY;
        }
        return args;
      });
      return writePath(commands, values, formatUnit);
    };
    for (const frame of [2, ir.durationInFrames - 1]) {
      const time = frame / ir.fps;
      const expectedClip = sample(ir, frame)["s-card"]?.clip;
      const expectedShape = sample(ir, frame)["s-card"]?.["attr.d"];
      expect(typeof expectedClip).toBe("string");
      expect(typeof expectedShape).toBe("string");
      const clipValue = valueAt(clip as MotionElement, time);
      const shapeValue = valueAt(shape as MotionElement, time);
      expect(clipValue).toBe(expectedClip);
      expect(shapeValue).toBe(expectedShape);
      expect(shift(String(expectedClip))).not.toBe(expectedClip);
      expect(clipValue).not.toBe(shift(String(expectedClip)));
      expect(shapeValue).not.toBe(shift(String(expectedShape)));
    }
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

  test("timeline loop sets repeatCount only when the field is true", () => {
    const absent = compile(source);
    const off = compile({ ...source, loop: false });
    const on = compile({ ...source, loop: true });
    expect(lower(source).loop).toBeUndefined();
    expect(lower({ ...source, loop: false }).loop).toBe(false);
    expect(lower({ ...source, loop: true }).loop).toBe(true);
    expect(absent.svg.includes("repeatCount")).toBe(false);
    expect(off.svg.includes("repeatCount")).toBe(false);
    expect(off.svg).toBe(absent.svg);
    const tags = on.svg.match(/<(?:animate|animateTransform|animateMotion|set)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag.includes('repeatCount="indefinite"')).toBe(true);
    const fromTimeline = compileTimeline({ ...source, loop: true }, "smil");
    const fromAbsent = compileTimeline(source, "smil");
    const fromOff = compileTimeline({ ...source, loop: false }, "smil");
    expect(lowerTimeline({ ...source, loop: true }, "smil").ir.loop).toBe(true);
    expect(lowerTimeline(source, "smil").ir.loop).toBeUndefined();
    expect(lowerTimeline({ ...source, loop: false }, "css-external").ir.loop).toBe(false);
    expect(fromTimeline.lowered.loop).toBe(true);
    expect(fromTimeline.svg.includes('repeatCount="indefinite"')).toBe(true);
    expect(fromAbsent.lowered.loop).toBeUndefined();
    expect(fromAbsent.svg.includes("repeatCount")).toBe(false);
    expect(fromOff.lowered.loop).toBe(false);
    expect(fromOff.svg.includes("repeatCount")).toBe(false);
    expect(fromOff.svg).toBe(fromAbsent.svg);
  });

  test("a looping timeline repeats for durationInFrames / fps and omits end", () => {
    const ir = document({
      fps: 30,
      durationInFrames: 24,
      loop: true,
      nodes: [
        {
          id: "s-cycle",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 0 },
                { frame: 23, value: 1, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const tags = compile(ir).svg.match(/<(?:animate|animateTransform|animateMotion|set)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag.includes('repeatCount="indefinite"')).toBe(true);
      expect(tag.includes("end=")).toBe(false);
      expect(tag.includes('dur="0.8s"')).toBe(true);
      expect(tag.includes('dur="0.7667s"')).toBe(false);
    }

    const boundary = document({
      fps: 30,
      durationInFrames: 24,
      loop: true,
      nodes: [
        {
          id: "s-boundary",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 0 },
                { frame: 24, value: 1, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const boundaryTags = compile(boundary).svg.match(/<animate\b[^>]*>/g) ?? [];
    expect(boundaryTags.length).toBeGreaterThan(0);
    for (const tag of boundaryTags) {
      expect(tag.includes('repeatCount="indefinite"')).toBe(true);
      expect(tag.includes("end=")).toBe(false);
      expect(tag.includes('dur="0.8s"')).toBe(true);
      expect(tag.includes('dur="0.8333s"')).toBe(false);
    }

    const held = document({
      fps: 30,
      durationInFrames: 24,
      loop: true,
      nodes: [
        {
          id: "s-held",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 1 },
                { frame: 12, value: 0, easing: "hold" },
              ],
            },
          ],
        },
      ],
    });
    const heldTags = compile(held).svg.match(/<(?:animate|set)\b[^>]*>/g) ?? [];
    expect(heldTags.length).toBeGreaterThan(0);
    for (const tag of heldTags) {
      expect(tag.includes("end=")).toBe(false);
      expect(tag.includes('dur="0.8s"')).toBe(true);
      expect(tag.includes('repeatCount="indefinite"')).toBe(true);
    }
  });

  test("a timeline that does not loop still emits end", () => {
    const ir = document({
      fps: 30,
      durationInFrames: 24,
      nodes: [
        {
          id: "s-once",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 0 },
                { frame: 23, value: 1, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const once = compile(ir).svg;
    const off = compile({ ...ir, loop: false }).svg;
    expect(once).toContain('begin="0s" end="0.7667s" dur="0.7667s"');
    expect(once.includes("repeatCount")).toBe(false);
    expect(off).toBe(once);
    expect(off).toContain('end="0.7667s"');
  });

  test("a looping timeline keeps repeatCount and does not set fill freeze", () => {
    const ir = document({
      fps: 30,
      durationInFrames: 24,
      loop: true,
      nodes: [
        {
          id: "s-loop",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 0 },
                { frame: 12, value: 1, easing: "hold" },
                { frame: 24, value: 0, easing: "linear" },
              ],
            },
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0 },
                { frame: 24, value: 40, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const looping = compile(ir).svg;
    const tags = looping.match(/<(?:animate|animateTransform|animateMotion|set)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(1);
    for (const tag of tags) {
      expect(tag.includes('repeatCount="indefinite"')).toBe(true);
      expect(tag.includes('fill="freeze"')).toBe(false);
    }
    expect(looping.includes('fill="freeze"')).toBe(false);

    const once = compile({ ...ir, loop: false }).svg;
    const onceTags = once.match(/<(?:animate|animateTransform|animateMotion|set)\b[^>]*>/g) ?? [];
    expect(once.includes("repeatCount")).toBe(false);
    expect(onceTags.some((tag) => tag.includes('fill="freeze"'))).toBe(true);
    expect(onceTags.some((tag) => tag.includes('fill="remove"'))).toBe(true);
  });

  test("a radial kind marker compiles to radialGradient and another value stays linear", () => {
    const stops = [
      {
        property: "gradient.s0.offset",
        keys: [{ frame: 0, value: 0 }],
      },
      {
        property: "gradient.s0.stop-color",
        keys: [{ frame: 0, value: "#ffffff" }],
      },
      {
        property: "gradient.s1.offset",
        keys: [{ frame: 0, value: 1 }],
      },
      {
        property: "gradient.s1.stop-color",
        keys: [{ frame: 0, value: "#000000" }],
      },
    ];
    const radial = document({
      nodes: [
        {
          id: "s-radial",
          tracks: [
            {
              property: "gradient.kind.stop-color",
              keys: [{ frame: 0, value: "radial" }],
            },
            ...stops,
          ],
        },
      ],
    });
    const radialSvg = compile(radial).svg;
    expect(radialSvg).toContain("<radialGradient");
    expect(radialSvg.includes("linearGradient")).toBe(false);
    expect(radialSvg.includes("s-radial-kind")).toBe(false);
    expect(radialSvg).toContain('id="s-radial-s0"');
    expect(radialSvg).toContain('id="s-radial-s1"');
    expect(radialSvg.includes('stop-color="radial"')).toBe(false);

    const other = document({
      nodes: [
        {
          id: "s-other",
          tracks: [
            {
              property: "gradient.kind.stop-color",
              keys: [{ frame: 0, value: "linear" }],
            },
            ...stops,
          ],
        },
      ],
    });
    const otherSvg = compile(other).svg;
    expect(otherSvg).toContain("<linearGradient");
    expect(otherSvg.includes("radialGradient")).toBe(false);
    expect(otherSvg.includes("s-other-kind")).toBe(false);
    expect(otherSvg).toContain('id="s-other-s0"');
    expect(otherSvg).toContain('id="s-other-s1"');
    expect(otherSvg.includes('stop-color="linear"')).toBe(false);

    const absent = document({
      nodes: [
        {
          id: "s-plain",
          tracks: stops,
        },
      ],
    });
    const absentSvg = compile(absent).svg;
    expect(absentSvg).toContain("<linearGradient");
    expect(absentSvg.includes("radialGradient")).toBe(false);
    expect(absentSvg).toContain('id="s-plain-s0"');
    expect(absentSvg).toContain('id="s-plain-s1"');
  });
});

const RENDERED_BEFORE_FIX = "rendered before this fix";
const NUMBER_TOKEN = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const repoRoot = resolve(here, "../../..");

interface MotionElement {
  tag: string;
  attribute: string;
  begin: number;
  end: number | null;
  dur: number | null;
  fill: string;
  calcMode: string;
  values: string[];
  keyTimes: number[];
  keySplines: string[];
}

interface SampledMotion {
  attribute: string;
  frame0: string | null;
  mid: string | null;
}

type MotionVerdict =
  | { kind: "static" }
  | { kind: "skip"; reason: string }
  | { kind: "checked"; moves: boolean };

function parseClock(value: string | undefined): number | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (text === "" || text === "indefinite") return null;
  const millis = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)ms$/i.exec(text);
  if (millis?.[1]) return Number(millis[1]) / 1000;
  const seconds = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)s$/i.exec(text);
  if (seconds?.[1]) return Number(seconds[1]);
  const bare = Number(text);
  return Number.isFinite(bare) ? bare : null;
}

function attributeMap(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match = pattern.exec(source);
  while (match) {
    const name = match[1];
    if (name) attributes[name] = match[2] ?? "";
    match = pattern.exec(source);
  }
  return attributes;
}

function listed(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(";").map((part) => part.trim());
}

function fractions(raw: string | undefined, count: number): number[] {
  if (raw) {
    return raw.split(";").map((part) => {
      const value = Number(part.trim());
      return Number.isFinite(value) ? value : 0;
    });
  }
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) => index / (count - 1));
}

function motionValues(tag: string, attributes: Record<string, string>): string[] {
  if (tag === "animateMotion") {
    const points = listed(attributes.keyPoints);
    if (points.length > 0) return points;
  }
  const values = listed(attributes.values);
  if (values.length > 0) return values;
  if (attributes.from !== undefined && attributes.to !== undefined) return [attributes.from, attributes.to];
  if (attributes.to !== undefined) return [attributes.to];
  return [];
}

function parseMotion(svg: string): MotionElement[] {
  const elements: MotionElement[] = [];
  const pattern = /<(animate|animateTransform|animateMotion)\b([^>]*?)>/g;
  let match = pattern.exec(svg);
  while (match) {
    const tag = match[1] ?? "animate";
    const attributes = attributeMap(match[2] ?? "");
    const values = motionValues(tag, attributes);
    elements.push({
      tag,
      attribute: tag === "animateMotion" ? "keyPoints" : attributes.attributeName ?? tag,
      begin: parseClock(attributes.begin) ?? 0,
      end: parseClock(attributes.end),
      dur: parseClock(attributes.dur),
      fill: attributes.fill ?? "remove",
      calcMode: attributes.calcMode ?? "linear",
      values,
      keyTimes: fractions(attributes.keyTimes, values.length),
      keySplines: listed(attributes.keySplines),
    });
    match = pattern.exec(svg);
  }
  return elements;
}

function hexColor(value: string): [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  const hex = match?.[1];
  if (!hex) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function interpolateColor(from: string, to: string, progress: number): string | null {
  const left = hexColor(from);
  const right = hexColor(to);
  if (!left || !right) return null;
  const channels = left.map((channel, index) => {
    const target = right[index] ?? channel;
    return quantizeByte(channel + (target - channel) * progress);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function interpolateNumbers(from: string, to: string, progress: number): string | null {
  const left = from.match(NUMBER_TOKEN);
  const right = to.match(NUMBER_TOKEN);
  if (!left || !right || left.length === 0 || left.length !== right.length) return null;
  if (from.replace(NUMBER_TOKEN, "#") !== to.replace(NUMBER_TOKEN, "#")) return null;
  let index = 0;
  return from.replace(NUMBER_TOKEN, () => {
    const start = Number(left[index]);
    const end = Number(right[index]);
    index += 1;
    return formatUnit(start + (end - start) * progress);
  });
}

function interpolateToken(from: string, to: string, progress: number): string {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  if (from === to) return from;
  return interpolateColor(from, to, progress) ?? interpolateNumbers(from, to, progress) ?? from;
}

function progressValue(element: MotionElement, progress: number): string {
  const values = element.values;
  const times = element.keyTimes;
  if (values.length === 0) return "";
  const last = Math.max(0, Math.min(times.length, values.length) - 1);
  if (element.calcMode === "discrete") {
    let index = 0;
    for (let cursor = 0; cursor < times.length; cursor += 1) {
      if ((times[cursor] ?? 0) <= progress + 1e-12) index = cursor;
    }
    return values[Math.min(index, values.length - 1)] ?? "";
  }
  let right = 1;
  while (right < times.length && (times[right] ?? 0) < progress - 1e-12) right += 1;
  if (right >= times.length) return values[last] ?? "";
  const left = Math.max(0, right - 1);
  const span = (times[right] ?? 1) - (times[left] ?? 0);
  let local = span === 0 ? 0 : (progress - (times[left] ?? 0)) / span;
  if (local <= 0) return values[left] ?? "";
  if (local >= 1) return values[Math.min(right, values.length - 1)] ?? "";
  if (element.calcMode === "spline") {
    const parts = (element.keySplines[left] ?? "0 0 1 1").trim().split(/\s+/).map(Number);
    if (parts.length >= 4 && parts.slice(0, 4).every((item) => Number.isFinite(item))) {
      local = unitBezier(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 1, parts[3] ?? 1, local);
    }
  }
  return interpolateToken(values[left] ?? "", values[Math.min(right, values.length - 1)] ?? "", local);
}

function activeEnd(element: MotionElement): number {
  if (element.dur === null) return element.end ?? element.begin;
  const simple = element.begin + element.dur;
  return element.end === null ? simple : Math.min(simple, element.end);
}

function valueAt(element: MotionElement, time: number): string | null {
  if (time < element.begin) return null;
  if (element.dur === null) {
    if (element.end !== null && time >= element.end) {
      return element.fill === "remove" ? null : element.values[0] ?? "";
    }
    return element.values[0] ?? "";
  }
  const end = activeEnd(element);
  if (time >= end) return element.fill === "remove" ? null : progressValue(element, 1);
  const span = element.dur === 0 ? 0 : (time - element.begin) / element.dur;
  return progressValue(element, Math.min(Math.max(span, 0), 1));
}

function sampleTimes(elements: MotionElement[]): { frame0: number; mid: number } {
  let end = 0;
  for (const element of elements) {
    if (element.dur === null) continue;
    end = Math.max(end, activeEnd(element));
  }
  return { frame0: 0, mid: end / 2 };
}

function sampleRows(svg: string): SampledMotion[] {
  const elements = parseMotion(svg).filter((element) => element.dur !== null);
  const times = sampleTimes(elements);
  return elements.map((element) => ({
    attribute: element.attribute,
    frame0: valueAt(element, times.frame0),
    mid: valueAt(element, times.mid),
  }));
}

function motionMoves(elements: MotionElement[]): boolean {
  const finite = elements.filter((element) => element.dur !== null);
  const times = sampleTimes(finite);
  if (times.mid === times.frame0) return false;
  return finite.some((element) => valueAt(element, times.frame0) !== valueAt(element, times.mid));
}

function hasMotionMarkup(svg: string): boolean {
  return /<(?:animate|animateTransform|animateMotion|set)\b/.test(svg) || /@keyframes\b/.test(svg);
}

function classifyMotion(svg: string, source: "fixture" | "golden"): MotionVerdict {
  if (!hasMotionMarkup(svg)) return { kind: "static" };
  const finite = parseMotion(svg).some((element) => element.dur !== null);
  if (!finite) {
    if (source === "golden") return { kind: "skip", reason: RENDERED_BEFORE_FIX };
    return { kind: "checked", moves: false };
  }
  return { kind: "checked", moves: motionMoves(parseMotion(svg)) };
}

function goldenProblem(svg: string): string | null {
  const verdict = classifyMotion(svg, "golden");
  if (verdict.kind === "skip" && !verdict.reason.includes(RENDERED_BEFORE_FIX)) {
    return "skip reason does not say it was rendered before this fix";
  }
  if (verdict.kind === "checked" && !verdict.moves) {
    return "dur is present and the sampled value does not move between frame 0 and a mid frame";
  }
  return null;
}

function presetGoldens(): string[] {
  const root = resolve(repoRoot, "presets");
  const files: string[] = [];
  for (const category of readdirSync(root, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const directory = join(root, category.name);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".golden.svg")) files.push(join(directory, entry.name));
    }
  }
  files.sort();
  return files;
}

describe("smil duration", () => {
  test("the compiled fixture has dur and moves between frame 0 and a mid frame", () => {
    const svg = compile(source).svg;
    const elements = parseMotion(svg);
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.dur).not.toBeNull();
      expect(element.end).not.toBeNull();
      expect(element.dur).toBeCloseTo((element.end ?? 0) - element.begin, 6);
    }
    const verdict = classifyMotion(svg, "fixture");
    expect(verdict.kind).toBe("checked");
    expect(verdict).not.toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
    if (verdict.kind === "checked") expect(verdict.moves).toBe(true);

    const opacity = sampleRows(svg).find((row) => row.attribute === "opacity");
    expect(opacity).toEqual({ attribute: "opacity", frame0: "1", mid: "0.625" });
    const paths = sampleRows(svg).filter((row) => row.attribute === "d");
    expect(paths.some((row) => row.frame0 !== row.mid)).toBe(true);

    const setTags = svg.match(/<set\b[^>]*>/g) ?? [];
    expect(setTags.length).toBeGreaterThan(0);
    for (const tag of setTags) {
      expect(tag).toContain('begin="');
      expect(tag).toContain('end="');
      expect(tag).not.toContain("dur=");
    }
  });

  test("dur is the end time minus the begin time when the span does not start at frame 0", () => {
    const ir = document({
      fps: 10,
      durationInFrames: 8,
      nodes: [
        {
          id: "s-late",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 2, value: 0 },
                { frame: 6, value: 1, easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    const svg = compile(ir).svg;
    expect(svg).toContain('begin="0.2s" end="0.6s" dur="0.4s"');
    const element = parseMotion(svg)[0];
    expect(element?.dur).toBeCloseTo((element?.end ?? 0) - (element?.begin ?? 0), 6);
    expect(classifyMotion(svg, "fixture").kind).toBe("checked");
    expect(goldenProblem(svg)).toBeNull();
  });

  test("a document without dur stays on the first value and a golden is skipped", () => {
    const withoutDur = `<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="opacity" begin="0s" end="1s" calcMode="linear" values="0;1" keyTimes="0;1" fill="freeze"/></svg>`;
    const withDur = withoutDur.replace('end="1s"', 'end="1s" dur="1s"');
    const still = `<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="opacity" begin="0s" end="1s" dur="1s" calcMode="linear" values="1;1" keyTimes="0;1" fill="freeze"/></svg>`;
    const plain = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>`;
    const css = `<svg xmlns="http://www.w3.org/2000/svg"><style>@keyframes fade { 0% { opacity: 0 } 100% { opacity: 1 } }</style></svg>`;

    expect(classifyMotion(withoutDur, "fixture")).toEqual({ kind: "checked", moves: false });
    expect(classifyMotion(withoutDur, "golden")).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
    expect(goldenProblem(withoutDur)).toBeNull();
    expect(sampleRows(withDur).find((row) => row.attribute === "opacity")).toEqual({
      attribute: "opacity",
      frame0: "0",
      mid: "0.5",
    });
    expect(goldenProblem(withDur)).toBeNull();
    expect(goldenProblem(still)).toBe(
      "dur is present and the sampled value does not move between frame 0 and a mid frame",
    );
    expect(classifyMotion(plain, "golden").kind).toBe("static");
    expect(goldenProblem(plain)).toBeNull();
    expect(classifyMotion(css, "golden")).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
  });

  test("a current preset golden moves once it carries dur", () => {
    const mask = readFileSync(resolve(repoRoot, "presets/pathfx/mask-rect.golden.svg"), "utf8");
    const glow = readFileSync(resolve(repoRoot, "presets/pathfx/filter-glow.golden.svg"), "utf8");
    const phone = readFileSync(resolve(repoRoot, "presets/mockups/mock-phone.golden.svg"), "utf8");
    const camera = readFileSync(resolve(repoRoot, "presets/camera/camera-pan.golden.svg"), "utf8");
    const fade = readFileSync(resolve(repoRoot, "presets/transitions/trans-fade.golden.svg"), "utf8");
    const timed = (svg: string, end: string) => svg.replaceAll(`end="${end}"`, `end="${end}" dur="${end}"`);
    const maskHasDur = parseMotion(mask).some((element) => element.dur !== null);
    const maskTimed = maskHasDur ? mask : timed(mask, "0.8s");

    if (maskHasDur) {
      expect(classifyMotion(mask, "golden")).toEqual({ kind: "checked", moves: true });
    } else {
      expect(classifyMotion(mask, "golden")).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
    }
    expect(classifyMotion(maskTimed, "golden")).toEqual({ kind: "checked", moves: true });
    expect(classifyMotion(timed(glow, "0.8s"), "golden")).toEqual({ kind: "checked", moves: true });
    const phoneHasDur = parseMotion(phone).some((element) => element.dur !== null);
    if (phoneHasDur) {
      expect(classifyMotion(phone, "golden")).toEqual({ kind: "checked", moves: true });
    } else if (phone.includes('end="0.4583s"')) {
      expect(classifyMotion(phone, "golden")).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
      expect(classifyMotion(timed(phone, "0.4583s"), "golden")).toEqual({ kind: "checked", moves: true });
    } else {
      const phoneVerdict = classifyMotion(phone, "golden");
      if (phoneVerdict.kind === "checked") {
        expect(phoneVerdict).toEqual({ kind: "checked", moves: true });
      } else {
        expect(phoneVerdict).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
      }
    }
    expect(goldenProblem(maskTimed.replace(/values="[^"]*"/, 'values="M 0 0;M 0 0"'))).toBe(
      "dur is present and the sampled value does not move between frame 0 and a mid frame",
    );
    const cameraVerdict = classifyMotion(camera, "golden");
    if (cameraVerdict.kind === "checked") {
      expect(cameraVerdict).toEqual({ kind: "checked", moves: true });
    } else {
      expect(cameraVerdict.kind).toBe("static");
    }
    const fadeVerdict = classifyMotion(fade, "golden");
    if (fadeVerdict.kind === "checked") {
      expect(fadeVerdict).toEqual({ kind: "checked", moves: true });
    } else {
      expect(fadeVerdict).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
    }
  });

  test("preset goldens without dur are skipped and a dur that does not move fails", () => {
    const files = presetGoldens();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const svg = readFileSync(file, "utf8");
      const label = relative(repoRoot, file);
      const verdict = classifyMotion(svg, "golden");
      if (!hasMotionMarkup(svg)) {
        expect(verdict.kind, label).toBe("static");
      } else if (!parseMotion(svg).some((element) => element.dur !== null)) {
        expect(verdict, label).toEqual({ kind: "skip", reason: RENDERED_BEFORE_FIX });
      } else {
        expect(verdict.kind, label).toBe("checked");
        expect(verdict.kind === "checked" && verdict.moves, label).toBe(true);
      }
      expect(goldenProblem(svg), label).toBeNull();
    }
  });
});
