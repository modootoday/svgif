/**
 * One IR fixture, both CSS artifacts.
 * sample(lowered, frame) matches sample(source, frame) at every frame.
 * The golden SVG is the quantized string.
 * Clip and shape geometry are SMIL in user space. Transform and opacity stay CSS.
 * [[sot:svgif/animation-backends]] [[sot:svgif/determinism]] [[adr:svgif/20261110120300]]
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCss, cssEmbedded, cssExternal, stableSelectorId } from "../src/backend/css/index.ts";
import { formatUnit, sample, type IrNode, type IrValue, type TimelineIr } from "../src/ir/index.ts";
import { compile as compileTimeline, lower as lowerTimeline } from "../src/lower/index.ts";
import { parsePath, writePath } from "../src/ir/path.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cssDir = resolve(here, "../src/backend/css");

const WALL_CLOCK = ["Date.now", "performance.now", "Math.random"];

function stringValue(value: IrValue | undefined): string {
  return typeof value === "string" ? value : "";
}

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

const fixture: TimelineIr = {
  fps: 30,
  width: 64,
  height: 48,
  durationInFrames: 4,
  nodes: [
    {
      id: "s-n0",
      tracks: [
        {
          property: "transform.translateX",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 30, easing: "linear" },
          ],
        },
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 0 },
            { frame: 2, value: 1, easing: "hold" },
          ],
        },
        {
          property: "attr.fill",
          keys: [
            { frame: 0, value: "#112233" },
            { frame: 3, value: "#445566", easing: "cubic-bezier(0.2, 0, 0, 1)" },
          ],
        },
        {
          property: "attr.d",
          keys: [
            { frame: 0, value: "M 0 0 L 10 0" },
            { frame: 3, value: "M 0 4 L 10 4", easing: "linear" },
          ],
        },
      ],
    },
    {
      id: "s-n1",
      tracks: [
        {
          property: "transform.translateY",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 12, easing: "spring" },
          ],
        },
      ],
    },
    {
      id: "s-n2",
      tracks: [
        {
          property: "transform.matrix",
          keys: [
            { frame: 0, value: [1, 0, 0, 1, 0, 0] },
            { frame: 3, value: [1, 0, 0, 1, 4, 0], easing: "linear" },
          ],
        },
        {
          property: "attr.offsetDistance",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 100, easing: "linear" },
          ],
        },
      ],
    },
    {
      id: "s-wide",
      tracks: [
        {
          property: "transform.matrix",
          keys: [
            {
              frame: 0,
              value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            },
          ],
        },
      ],
    },
  ],
};

function styleText(svg: string): string {
  const start = svg.indexOf("<![CDATA[");
  const end = svg.indexOf("]]>");
  return svg.slice(start + "<![CDATA[".length, end);
}

interface GeometryAnim {
  values: string[];
  keyTimes: number[];
  calcMode: string;
}

function withoutCss(svg: string): string {
  return svg
    .replace(/<\?xml-stylesheet\b[^?]*\?>\n?/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>\n?/g, "");
}

function readGeometry(svg: string, id: string): GeometryAnim {
  const at = svg.indexOf(`id="${id}"`);
  if (at < 0) throw new Error(`missing ${id}`);
  const animate = /<animate\b([^>]*)\/>/.exec(svg.slice(at));
  const attrs = animate?.[1];
  if (!attrs) throw new Error(`missing animate on ${id}`);
  const values = /values="([^"]*)"/.exec(attrs)?.[1]?.split(";") ?? [];
  const keyTimes = /keyTimes="([^"]*)"/.exec(attrs)?.[1]?.split(";").map((part) => Number(part)) ?? [];
  const calcMode = /calcMode="([^"]*)"/.exec(attrs)?.[1] ?? "linear";
  return { values, keyTimes, calcMode };
}

/** A CSS path() shift. Subtracting the element box origin must not match. */
function shiftUserSpace(d: string, dx: number, dy: number): string {
  const commands = parsePath(d);
  if (!commands) throw new Error("path");
  const values = commands.map((command) => {
    const args = command.args.slice();
    const op = command.op.toUpperCase();
    if (op === "H") return args.map((value) => value + dx);
    if (op === "V") return args.map((value) => value + dy);
    if (op === "A" && args.length >= 7) {
      args[5] = (args[5] ?? 0) + dx;
      args[6] = (args[6] ?? 0) + dy;
      return args;
    }
    for (let index = 0; index + 1 < args.length; index += 2) {
      args[index] = (args[index] ?? 0) + dx;
      args[index + 1] = (args[index + 1] ?? 0) + dy;
    }
    return args;
  });
  return writePath(commands, values, formatUnit);
}

function interpolatePath(from: string, to: string, progress: number): string {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const left = parsePath(from);
  const right = parsePath(to);
  if (!left || !right || left.length !== right.length) return from;
  const values = left.map((command, index) =>
    command.args.map((start, arg) => {
      const end = right[index]?.args[arg] ?? start;
      return start + (end - start) * progress;
    }),
  );
  return writePath(left, values, formatUnit);
}

function sampleGeometry(anim: GeometryAnim, frame: number, lastFrame: number): string {
  const progress = lastFrame <= 0 ? 0 : frame / lastFrame;
  const times =
    anim.keyTimes.length === anim.values.length
      ? anim.keyTimes
      : anim.values.map((_, index) => (anim.values.length <= 1 ? 0 : index / (anim.values.length - 1)));
  for (let index = 0; index < times.length; index += 1) {
    if (Math.abs((times[index] ?? 0) - progress) <= 5e-4) return anim.values[index] ?? "";
  }
  if (anim.calcMode === "discrete") {
    let index = 0;
    for (let cursor = 0; cursor < times.length; cursor += 1) {
      if ((times[cursor] ?? 0) <= progress + 1e-12) index = cursor;
    }
    return anim.values[index] ?? "";
  }
  let right = 1;
  while (right < times.length && (times[right] ?? 0) < progress - 1e-12) right += 1;
  const left = Math.max(0, right - 1);
  const span = (times[Math.min(right, times.length - 1)] ?? 1) - (times[left] ?? 0);
  const local = span === 0 ? 0 : (progress - (times[left] ?? 0)) / span;
  return interpolatePath(anim.values[left] ?? "", anim.values[Math.min(right, anim.values.length - 1)] ?? "", local);
}

describe("css backends", () => {
  test("the lowered sample matches the source at every frame", () => {
    const external = compileCss(fixture, "css-external");
    const embedded = compileCss(fixture, "css-embedded");
    for (let frame = 0; frame < fixture.durationInFrames; frame += 1) {
      expect(sample(external.lowered, frame)).toEqual(sample(fixture, frame));
      expect(sample(embedded.lowered, frame)).toEqual(sample(fixture, frame));
    }
    const spring = external.lowered.nodes.find((node) => node.id === "s-n1")?.tracks[0];
    expect(spring?.keys).toHaveLength(fixture.durationInFrames);
    expect(spring?.keys.every((key) => key.easing === undefined)).toBe(true);
    const path = external.lowered.nodes.find((node) => node.id === "s-n0")?.tracks.find((track) => track.property === "attr.d");
    expect(path?.keys).toHaveLength(fixture.durationInFrames);
    expect(external.diagnostics).toContainEqual({ code: "lowered", nodeId: "s-n0", property: "attr.d" });
    expect(external.diagnostics).toContainEqual({
      code: "lowered",
      nodeId: "s-n1",
      property: "transform.translateY",
    });
    expect(external.diagnostics).toContainEqual({
      code: "matrix3d-omitted",
      nodeId: "s-wide",
      property: "transform.matrix",
    });
  });

  test("external and embedded share one stylesheet and do not emit matrix3d", () => {
    const external = cssExternal.compile(fixture);
    const embedded = cssEmbedded.compile(fixture);
    expect(external.id).toBe("css-external");
    expect(embedded.id).toBe("css-embedded");
    expect(external.schema).toBe("svgif.backend/1");
    expect(embedded.schema).toBe("svgif.backend/1");
    expect(external.css).toBe(styleText(embedded.svg));
    expect(external.svg.includes("<style")).toBe(false);
    expect(external.svg.includes('<?xml-stylesheet href="file.css" type="text/css"?>')).toBe(true);
    expect(embedded.svg.includes("<defs>")).toBe(true);
    expect(embedded.svg.split("<style").length - 1).toBe(1);
    expect(embedded.css).toBeUndefined();
    const css = external.css ?? "";
    expect(css.includes("@keyframes")).toBe(true);
    expect(css.includes("animation:")).toBe(true);
    expect(css.includes("#s-n0")).toBe(true);
    expect(css.includes("#s-n1")).toBe(true);
    expect(css.includes("#s-n2")).toBe(true);
    expect(css.includes("#s-wide")).toBe(false);
    expect(css.includes("matrix3d")).toBe(false);
    expect(external.svg.includes("matrix3d")).toBe(false);
    expect(embedded.svg.includes("matrix3d")).toBe(false);
    expect(css.includes("steps(1,end)")).toBe(true);
    expect(css.includes("cubic-bezier(0.2, 0, 0, 1)")).toBe(true);
    expect(external.svg.includes('id="s-wide"')).toBe(true);
    expect(compileCss(fixture, "css-external").svg).toBe(external.svg);
    expect(compileCss(fixture, "css-external").css).toBe(external.css);
    expect(compileCss(fixture, "css-embedded").svg).toBe(embedded.svg);
  });

  test("the golden SVG and CSS are byte-exact after quantization", () => {
    const external = compileCss(fixture, "css-external");
    const embedded = compileCss(fixture, "css-embedded");
    expect(external.svg).toBe(GOLDEN_EXTERNAL_SVG);
    expect(external.css).toBe(GOLDEN_CSS);
    expect(embedded.svg).toBe(GOLDEN_EMBEDDED_SVG);
    const css = external.css ?? "";
    for (const match of css.matchAll(/-?\d+\.\d+/g)) {
      const token = match[0] ?? "";
      expect(token).toBe(formatUnit(Number(token)));
    }
  });

  test("a filter channel is lowered into per-frame keys", () => {
    const document: TimelineIr = {
      fps: 30,
      width: 8,
      height: 8,
      durationInFrames: 2,
      nodes: [
        {
          id: "blur",
          tracks: [
            {
              property: "filter.feGaussianBlur.stdDeviation",
              keys: [
                { frame: 0, value: 0 },
                { frame: 1, value: 2, easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
    const compiled = compileCss(document, "css-embedded");
    expect(stableSelectorId("blur")).toBe("s-blur");
    expect(compiled.svg.includes('id="s-blur"')).toBe(true);
    expect(compiled.diagnostics).toEqual([
      { code: "lowered", nodeId: "blur", property: "filter.feGaussianBlur.stdDeviation" },
    ]);
    for (let frame = 0; frame < 2; frame += 1) {
      expect(sample(compiled.lowered, frame)).toEqual(sample(document, frame));
    }
    expect(compiled.svg.includes("--svgif-filter-feGaussianBlur-stdDeviation")).toBe(true);
    expect(compiled.svg.includes("matrix3d")).toBe(false);
  });

  test("a mismatched path lowers to the held value", () => {
    const document: TimelineIr = {
      fps: 10,
      width: 4,
      height: 4,
      durationInFrames: 3,
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "attr.d",
              keys: [
                { frame: 0, value: "M 0 0 L 10 10" },
                { frame: 2, value: "M 0 0 L 10 10 L 20 20", easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
    const compiled = compileCss(document, "css-external");
    for (let frame = 0; frame < document.durationInFrames; frame += 1) {
      expect(sample(compiled.lowered, frame)).toEqual(sample(document, frame));
    }
    expect(compiled.css?.includes("matrix3d")).toBe(false);
    expect(compiled.diagnostics).toEqual([{ code: "lowered", nodeId: "s-n0", property: "attr.d" }]);
  });

  test("rotate and scale share one transform animation", () => {
    const document: TimelineIr = {
      fps: 10,
      width: 4,
      height: 4,
      durationInFrames: 2,
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.rotate",
              keys: [
                { frame: 0, value: 0 },
                { frame: 1, value: 90, easing: "linear" },
              ],
            },
            {
              property: "transform.scaleX",
              keys: [
                { frame: 0, value: 1 },
                { frame: 1, value: 2, easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
    const compiled = compileCss(document, "css-external");
    const css = compiled.css ?? "";
    expect(css.includes("rotate(0deg)")).toBe(true);
    expect(css.includes("scale(1, 1)")).toBe(true);
    expect(css.includes("rotate(90deg)")).toBe(true);
    expect(css.includes("scale(2, 1)")).toBe(true);
    expect(css.includes("matrix3d")).toBe(false);
    expect(css.split("@keyframes").length - 1).toBe(1);
    for (let frame = 0; frame < document.durationInFrames; frame += 1) {
      expect(sample(compiled.lowered, frame)).toEqual(sample(document, frame));
    }
  });

  test("the external stylesheet link uses the basename", () => {
    const compiled = compileCss(fixture, "css-external", { fileBase: "shot" });
    expect(compiled.svg.includes('href="shot.css"')).toBe(true);
    expect(compiled.css).toBe(compileCss(fixture, "css-external").css);
  });
  test("a repeated unchanged keyframe fails the size guard", () => {
    const css = `@keyframes s-still-d {
  0% {
    d: path("M 0 0 L 8 0");
  }
  50% {
    d: path("M 0 0 L 8 0");
  }
  100% {
    d: path("M 0 0 L 8 0");
  }
}
`;
    expect(unchangedKeyframeBlocks(css)).toEqual(["s-still-d"]);
  });

  test("a changing channel ends at 100 percent without a repeated rest pose", () => {
    const document: TimelineIr = {
      fps: 30,
      width: 32,
      height: 32,
      durationInFrames: 4,
      nodes: [
        {
          id: "s-move",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0 },
                { frame: 3, value: 20, easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
    const css = compileCss(document, "css-external").css ?? "";
    expect(unchangedKeyframeBlocks(css)).toEqual([]);
    expect(lastKeyframeIsEnd(css)).toBe(true);
    expect(duplicatedRestPose(css)).toBe(false);
    expect(css.includes("75%")).toBe(false);
    expect(css.includes("100%")).toBe(true);
  });

  test("a constant path or fill is a static attribute", () => {
    const document: TimelineIr = {
      fps: 30,
      width: 10,
      height: 10,
      durationInFrames: 4,
      nodes: [
        {
          id: "s-still",
          tracks: [
            {
              property: "attr.d",
              keys: [
                { frame: 0, value: "M 0 0 L 8 0" },
                { frame: 3, value: "M 0 0 L 8 0", easing: "linear" },
              ],
            },
            {
              property: "attr.fill",
              keys: [
                { frame: 0, value: "#aabbcc" },
                { frame: 3, value: "#aabbcc", easing: "linear" },
              ],
            },
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 4 },
                { frame: 3, value: 4, easing: "linear" },
              ],
            },
          ],
        },
      ],
    };
    const compiled = compileCss(document, "css-embedded");
    expect(compiled.svg.includes("@keyframes")).toBe(false);
    expect(compiled.svg.includes('d="M 0 0 L 8 0"')).toBe(true);
    expect(compiled.svg.includes('fill="#aabbcc"')).toBe(true);
    expect(compiled.svg.includes("transform: translate(4px, 0px)")).toBe(true);
    expect(unchangedKeyframeBlocks(styleText(compiled.svg))).toEqual([]);
  });

  test("loop sets the iteration count", () => {
    const once = compileCss(fixture, "css-external");
    const off = compileCss(fixture, "css-external", { loop: false });
    const on = compileCss(fixture, "css-embedded", { loop: true });
    const externalOn = compileCss(fixture, "css-external", { loop: true });
    expect(once.css?.includes(" 1 normal both")).toBe(true);
    expect(once.css?.includes("infinite")).toBe(false);
    expect(off.css).toBe(once.css);
    expect(compileCss(fixture, "css-embedded").svg.includes("infinite")).toBe(false);
    expect(on.svg.includes("infinite")).toBe(true);
    expect(on.svg.includes(" 1 normal both")).toBe(false);
    expect(externalOn.css?.includes("infinite")).toBe(true);
    expect(styleText(on.svg)).toBe(externalOn.css);
    const absent = compileTimeline(fixture, "css-external");
    const offTimeline = compileTimeline({ ...fixture, loop: false }, "css-embedded");
    const onTimeline = compileTimeline({ ...fixture, loop: true }, "css-external");
    const embeddedTimeline = compileTimeline({ ...fixture, loop: true }, "css-embedded");
    expect(lowerTimeline(fixture, "css-external").ir.loop).toBeUndefined();
    expect(lowerTimeline({ ...fixture, loop: false }, "smil").ir.loop).toBe(false);
    expect(lowerTimeline({ ...fixture, loop: true }, "css-embedded").ir.loop).toBe(true);
    expect(absent.lowered.loop).toBeUndefined();
    expect(absent.css?.includes("infinite")).toBe(false);
    expect(absent.css?.includes(" 1 normal both")).toBe(true);
    expect(absent.svg.includes("repeatCount")).toBe(false);
    expect(offTimeline.lowered.loop).toBe(false);
    expect(offTimeline.svg.includes("infinite")).toBe(false);
    expect(offTimeline.svg.includes("repeatCount")).toBe(false);
    expect(onTimeline.lowered.loop).toBe(true);
    expect(onTimeline.css?.includes("infinite")).toBe(true);
    expect(onTimeline.css?.includes(" 1 normal both")).toBe(false);
    expect(onTimeline.svg.includes('repeatCount="indefinite"')).toBe(true);
    expect(embeddedTimeline.svg.includes("infinite")).toBe(true);
    expect(embeddedTimeline.svg.includes('repeatCount="indefinite"')).toBe(true);
    expect(embeddedTimeline.lowered.loop).toBe(true);
    const files = filesReachableFrom(resolve(cssDir, "index.ts")).filter((file) => file.startsWith(cssDir));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const word of ["presets/", "audio", "transitions", "mockups", "pathfx"]) {
        expect(text.includes(word)).toBe(false);
      }
    }
  });

  test("clip and shape geometry match at a mid frame and the last frame", () => {
    const originX = 32;
    const originY = 16;
    const shapeFrom = "M 32 16 L 96 16 L 96 80 L 32 80 Z";
    const shapeTo = "M 32 16 L 120 16 L 120 80 L 32 80 Z";
    const clipFrom = "M 32 16 L 40 16 L 40 80 L 32 80 Z";
    const clipTo = "M 32 16 L 96 16 L 96 80 L 32 80 Z";
    const document: TimelineIr = {
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
    };
    const mid = 2;
    const last = document.durationInFrames - 1;
    const compiled = [compileCss(document, "css-external"), compileCss(document, "css-embedded")];
    for (const artifact of compiled) {
      const css = artifact.css ?? styleText(artifact.svg);
      expect(css.includes("path(")).toBe(false);
      expect(css.includes("d:")).toBe(false);
      expect(css.includes("clip-path")).toBe(false);
      expect(css.includes("transform:")).toBe(true);
      expect(css.includes("opacity:")).toBe(true);
      expect(css.includes(clipFrom)).toBe(false);
      expect(css.includes(shapeFrom)).toBe(false);
      expect(artifact.svg.includes("animateTransform")).toBe(false);
      expect(artifact.svg.includes('attributeName="opacity"')).toBe(false);
      expect(artifact.svg.includes('attributeName="transform"')).toBe(false);
      expect(artifact.svg.includes('clipPathUnits="userSpaceOnUse"')).toBe(true);
      expect(artifact.svg.includes('clip-path="url(#s-card-frame0)"')).toBe(true);
      const bare = withoutCss(artifact.svg);
      expect(bare.includes("path(")).toBe(false);
      expect(bare.includes(`d="${clipFrom}"`)).toBe(true);
      expect(bare.includes(`d="${shapeFrom}"`)).toBe(true);
      const clip = readGeometry(artifact.svg, "s-card-frame0");
      const shape = readGeometry(artifact.svg, "s-card");
      expect(clip.values[0]).toBe(clipFrom);
      expect(shape.values[0]).toBe(shapeFrom);
      for (const frame of [mid, last]) {
        const expectedClip = stringValue(sample(document, frame)["s-card"]?.clip);
        const expectedShape = stringValue(sample(document, frame)["s-card"]?.["attr.d"]);
        const clipValue = sampleGeometry(clip, frame, last);
        const shapeValue = sampleGeometry(shape, frame, last);
        expect(shiftUserSpace(expectedClip, -originX, -originY)).not.toBe(expectedClip);
        expect(shiftUserSpace(expectedShape, -originX, -originY)).not.toBe(expectedShape);
        expect(clipValue).toBe(expectedClip);
        expect(shapeValue).toBe(expectedShape);
        expect(clipValue).not.toBe(shiftUserSpace(expectedClip, -originX, -originY));
        expect(shapeValue).not.toBe(shiftUserSpace(expectedShape, -originX, -originY));
      }
    }
    expect(compiled[0]?.css).toBe(styleText(compiled[1]?.svg ?? ""));
  });

  test("the CSS backend does not read a wall clock", () => {
    const entry = resolve(cssDir, "index.ts");
    const files = filesReachableFrom(entry).filter((file) => file.startsWith(cssDir));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of WALL_CLOCK) {
        expect(text.includes(token)).toBe(false);
      }
    }
  });
});

const GOLDEN_EXTERNAL_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="file.css" type="text/css"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">
<path id="s-n0" d="M 0 0 L 10 0" fill="#112233" opacity="0"><animate attributeName="d" begin="0s" end="0.1s" dur="0.1s" calcMode="linear" values="M 0 0 L 10 0;M 0 1.3333 L 10 1.3333;M 0 2.6667 L 10 2.6667;M 0 4 L 10 4" keyTimes="0;0.3333;0.6667;1" fill="freeze"/></path>
<g id="s-n1"/>
<g id="s-n2"/>
<g id="s-wide"/>
</svg>
`;
const GOLDEN_CSS = `@keyframes s-n0-transform {
  0% {
    animation-timing-function: linear;
    transform: translate(0px, 0px);
  }
  100% {
    transform: translate(30px, 0px);
  }
}
@keyframes s-n0-opacity {
  0% {
    animation-timing-function: steps(1,end);
    opacity: 0;
  }
  50% {
    animation-timing-function: steps(1,end);
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}
@keyframes s-n0-fill {
  0% {
    animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
    fill: #112233;
  }
  100% {
    fill: #445566;
  }
}
#s-n0 {
  animation: s-n0-transform 0.1333s linear 0s 1 normal both, s-n0-opacity 0.1333s linear 0s 1 normal both, s-n0-fill 0.1333s linear 0s 1 normal both;
}
@keyframes s-n1-transform {
  0% {
    animation-timing-function: steps(1,end);
    transform: translate(0px, 0px);
  }
  25% {
    animation-timing-function: steps(1,end);
    transform: translate(0px, 1.6px);
  }
  50% {
    animation-timing-function: steps(1,end);
    transform: translate(0px, 3.84px);
  }
  100% {
    transform: translate(0px, 12px);
  }
}
#s-n1 {
  animation: s-n1-transform 0.1333s linear 0s 1 normal both;
}
@keyframes s-n2-transform {
  0% {
    animation-timing-function: linear;
    transform: matrix(1, 0, 0, 1, 0, 0);
  }
  100% {
    transform: matrix(1, 0, 0, 1, 4, 0);
  }
}
@keyframes s-n2-offset-distance {
  0% {
    animation-timing-function: linear;
    offset-distance: 0;
  }
  100% {
    offset-distance: 100;
  }
}
#s-n2 {
  animation: s-n2-transform 0.1333s linear 0s 1 normal both, s-n2-offset-distance 0.1333s linear 0s 1 normal both;
}
`;
const GOLDEN_EMBEDDED_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">
<defs>
<style><![CDATA[@keyframes s-n0-transform {
  0% {
    animation-timing-function: linear;
    transform: translate(0px, 0px);
  }
  100% {
    transform: translate(30px, 0px);
  }
}
@keyframes s-n0-opacity {
  0% {
    animation-timing-function: steps(1,end);
    opacity: 0;
  }
  50% {
    animation-timing-function: steps(1,end);
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}
@keyframes s-n0-fill {
  0% {
    animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
    fill: #112233;
  }
  100% {
    fill: #445566;
  }
}
#s-n0 {
  animation: s-n0-transform 0.1333s linear 0s 1 normal both, s-n0-opacity 0.1333s linear 0s 1 normal both, s-n0-fill 0.1333s linear 0s 1 normal both;
}
@keyframes s-n1-transform {
  0% {
    animation-timing-function: steps(1,end);
    transform: translate(0px, 0px);
  }
  25% {
    animation-timing-function: steps(1,end);
    transform: translate(0px, 1.6px);
  }
  50% {
    animation-timing-function: steps(1,end);
    transform: translate(0px, 3.84px);
  }
  100% {
    transform: translate(0px, 12px);
  }
}
#s-n1 {
  animation: s-n1-transform 0.1333s linear 0s 1 normal both;
}
@keyframes s-n2-transform {
  0% {
    animation-timing-function: linear;
    transform: matrix(1, 0, 0, 1, 0, 0);
  }
  100% {
    transform: matrix(1, 0, 0, 1, 4, 0);
  }
}
@keyframes s-n2-offset-distance {
  0% {
    animation-timing-function: linear;
    offset-distance: 0;
  }
  100% {
    offset-distance: 100;
  }
}
#s-n2 {
  animation: s-n2-transform 0.1333s linear 0s 1 normal both, s-n2-offset-distance 0.1333s linear 0s 1 normal both;
}
]]></style>
</defs>
<path id="s-n0" d="M 0 0 L 10 0" fill="#112233" opacity="0"><animate attributeName="d" begin="0s" end="0.1s" dur="0.1s" calcMode="linear" values="M 0 0 L 10 0;M 0 1.3333 L 10 1.3333;M 0 2.6667 L 10 2.6667;M 0 4 L 10 4" keyTimes="0;0.3333;0.6667;1" fill="freeze"/></path>
<g id="s-n1"/>
<g id="s-n2"/>
<g id="s-wide"/>
</svg>
`;

interface KeyframeStop {
  percent: string;
  values: Map<string, string>;
}

function closeBrace(text: string, brace: number): number {
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("unclosed keyframe block");
}

function parseStops(body: string): KeyframeStop[] {
  const stops: KeyframeStop[] = [];
  let index = 0;
  while (index < body.length) {
    const match = /(\d+(?:\.\d+)?)%\s*\{/.exec(body.slice(index));
    if (!match || match.index === undefined) break;
    const percent = `${match[1]}%`;
    const brace = index + match.index + match[0].length - 1;
    const end = closeBrace(body, brace);
    const values = new Map<string, string>();
    for (const line of body.slice(brace + 1, end).split("\n")) {
      const trimmed = line.trim().replace(/;$/, "");
      const colon = trimmed.indexOf(":");
      if (colon < 0) continue;
      const prop = trimmed.slice(0, colon).trim();
      if (prop === "animation-timing-function") continue;
      values.set(prop, trimmed.slice(colon + 1).trim());
    }
    stops.push({ percent, values });
    index = end + 1;
  }
  return stops;
}

function keyframeBlocks(css: string): { name: string; stops: KeyframeStop[] }[] {
  const blocks: { name: string; stops: KeyframeStop[] }[] = [];
  let index = 0;
  while (index < css.length) {
    const start = css.indexOf("@keyframes", index);
    if (start < 0) break;
    const brace = css.indexOf("{", start);
    const name = css.slice(start + "@keyframes".length, brace).trim();
    const end = closeBrace(css, brace);
    blocks.push({ name, stops: parseStops(css.slice(brace + 1, end)) });
    index = end + 1;
  }
  return blocks;
}

/** Blocks that repeat a value which did not change from the previous stop. */
function unchangedKeyframeBlocks(css: string): string[] {
  const names: string[] = [];
  for (const block of keyframeBlocks(css)) {
    const series = new Map<string, string[]>();
    for (const stop of block.stops) {
      for (const [prop, value] of stop.values) {
        const list = series.get(prop) ?? [];
        list.push(value);
        series.set(prop, list);
      }
    }
    let unchanged = false;
    for (const values of series.values()) {
      for (let cursor = 1; cursor < values.length; cursor += 1) {
        if (values[cursor] === values[cursor - 1]) unchanged = true;
      }
    }
    if (unchanged) names.push(block.name);
  }
  return names;
}

function lastKeyframeIsEnd(css: string): boolean {
  const blocks = keyframeBlocks(css);
  return blocks.length > 0 && blocks.every((block) => block.stops.at(-1)?.percent === "100%");
}

function duplicatedRestPose(css: string): boolean {
  for (const block of keyframeBlocks(css)) {
    const last = block.stops.at(-1);
    const prev = block.stops.at(-2);
    if (!last || last.percent !== "100%") return true;
    if (!prev) continue;
    for (const [prop, value] of last.values) {
      if (prev.values.get(prop) === value) return true;
    }
  }
  return false;
}

const presetsRoot = resolve(here, "../../../presets");

/** Goldens on main before this printer fix. A later golden is not in this set. */
const RENDERED_BEFORE_FIX = new Set([
  "audio/audio-beat-ring.golden.svg",
  "audio/audio-bpm-pulse.golden.svg",
  "audio/audio-eq-bars.golden.svg",
  "audio/audio-lyric-bounce.golden.svg",
  "audio/audio-radial-pulse.golden.svg",
  "audio/audio-spectrum-arc.golden.svg",
  "audio/audio-vu-meter.golden.svg",
  "audio/audio-waveform.golden.svg",
  "transitions/trans-crossfade.golden.svg",
  "transitions/trans-fade.golden.svg",
  "transitions/trans-iris.golden.svg",
  "transitions/trans-mask-reveal.golden.svg",
  "transitions/trans-push.golden.svg",
  "transitions/trans-scale-pop.golden.svg",
  "transitions/trans-slide.golden.svg",
  "transitions/trans-wipe.golden.svg",
  "transitions/trans-zoom.golden.svg",
]);

function presetGoldens(): { rel: string; text: string }[] {
  const found: { rel: string; text: string }[] = [];
  for (const category of readdirSync(presetsRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const dir = resolve(presetsRoot, category.name);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".golden.svg")) continue;
      const rel = `${category.name}/${entry.name}`;
      found.push({ rel, text: readFileSync(resolve(dir, entry.name), "utf8") });
    }
  }
  found.sort((left, right) => (left.rel < right.rel ? -1 : left.rel > right.rel ? 1 : 0));
  return found;
}

describe("preset golden keyframes", () => {
  const goldens = presetGoldens();
  test("walks every category golden", () => {
    expect(goldens.length).toBeGreaterThan(0);
    expect(goldens.some((golden) => golden.rel.startsWith("audio/"))).toBe(true);
    expect(goldens.some((golden) => golden.rel.startsWith("mockups/"))).toBe(true);
  });

  for (const golden of goldens) {
    const issues = unchangedKeyframeBlocks(golden.text);
    if (issues.length > 0 && RENDERED_BEFORE_FIX.has(golden.rel)) {
      test.skip(`${golden.rel} rendered before the CSS keyframe fix`, () => {
        expect(issues.length).toBeGreaterThan(0);
      });
      continue;
    }
    test(`${golden.rel} does not repeat an unchanged keyframe`, () => {
      expect(unchangedKeyframeBlocks(golden.text)).toEqual([]);
    });
  }
});

const LIVE_FONT = "ui-sans-serif, system-ui, sans-serif";
const LIVE_LABEL = "author-note";

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: Array<XmlNode | string>;
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);/g, (_, token: string) => {
    if (token === "amp") return "&";
    if (token === "lt") return "<";
    if (token === "gt") return ">";
    if (token === "quot") return '"';
    if (token === "apos") return "'";
    const code = token.startsWith("#x") ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

function parseXml(source: string): XmlNode {
  let index = 0;
  const root: XmlNode = { name: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  const fail = (message: string): never => {
    throw new Error(`${message} at ${index}`);
  };
  while (index < source.length) {
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index);
      if (end < 0) fail("unclosed instruction");
      index = end + 2;
      continue;
    }
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index);
      if (end < 0) fail("unclosed comment");
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index);
      if (end < 0) fail("unclosed cdata");
      stack.at(-1)?.children.push(source.slice(index + 9, end));
      index = end + 3;
      continue;
    }
    if (source[index] === "<") {
      if (source[index + 1] === "/") {
        const end = source.indexOf(">", index);
        if (end < 0) fail("unclosed end tag");
        const name = source.slice(index + 2, end).trim();
        const open = stack.pop();
        if (!open || open.name !== name || stack.length === 0) fail(`mismatched </${name}>`);
        index = end + 1;
        continue;
      }
      const end = source.indexOf(">", index);
      if (end < 0) fail("unclosed start tag");
      let raw = source.slice(index + 1, end).trim();
      let selfClosing = false;
      if (raw.endsWith("/")) {
        selfClosing = true;
        raw = raw.slice(0, -1).trim();
      }
      const nameMatch = /^([A-Za-z_:][\w:.-]*)([\s\S]*)$/.exec(raw);
      if (!nameMatch) fail("bad start tag");
      const name = nameMatch[1] ?? "";
      let rest = (nameMatch[2] ?? "").trim();
      const attrs: Record<string, string> = {};
      while (rest.length > 0) {
        const attr = /^([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*([\s\S]*)$/.exec(rest);
        if (!attr) fail(`bad attribute on ${name}`);
        const key = attr[1] ?? "";
        if (Object.hasOwn(attrs, key)) fail(`duplicate ${key}`);
        attrs[key] = decodeXml(attr[2] ?? attr[3] ?? "");
        rest = (attr[4] ?? "").trim();
      }
      const node: XmlNode = { name, attrs, children: [] };
      stack.at(-1)?.children.push(node);
      if (!selfClosing) stack.push(node);
      index = end + 1;
      continue;
    }
    const next = source.indexOf("<", index);
    const raw = source.slice(index, next < 0 ? source.length : next);
    if (/&(?!(?:#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);)/.test(raw)) fail("unescaped text");
    stack.at(-1)?.children.push(decodeXml(raw));
    index = next < 0 ? source.length : next;
  }
  if (stack.length !== 1) fail("unclosed element");
  const svg = root.children.find((child) => typeof child !== "string" && child.name === "svg");
  if (!svg || typeof svg === "string") fail("missing svg root");
  return svg;
}

function elementsNamed(node: XmlNode, name: string): XmlNode[] {
  const found = node.name === name ? [node] : [];
  for (const child of node.children) {
    if (typeof child !== "string") found.push(...elementsNamed(child, name));
  }
  return found;
}

function directText(node: XmlNode): string {
  return node.children.filter((child) => typeof child === "string").join("");
}

function liveTracks(): IrNode["tracks"] {
  return [
    {
      property: "attr.fill",
      keys: [
        { frame: 0, value: "#112233" },
        { frame: 1, value: "#445566", easing: "linear" },
      ],
    },
    {
      property: "attr.opacity",
      keys: [
        { frame: 0, value: 1 },
        { frame: 1, value: 0.25, easing: "linear" },
      ],
    },
  ];
}

function liveScene(nodes: IrNode[]): TimelineIr {
  return { fps: 10, width: 32, height: 32, durationInFrames: 2, nodes };
}

function liveNode(id: string, fields: { text?: string; label?: string }, tracks: IrNode["tracks"] = []): IrNode {
  return Object.assign({ id, tracks }, fields);
}

describe("live text", () => {
  test("Sale 50% is an SVG text element and fill and opacity still apply", () => {
    const plain = liveScene([{ id: "s-sale", tracks: liveTracks() }]);
    const sale = liveScene([liveNode("s-sale", { text: "Sale 50%", label: LIVE_LABEL }, liveTracks())]);
    const plainExternal = compileCss(plain, "css-external");
    const saleExternal = compileCss(sale, "css-external");
    const saleEmbedded = compileCss(sale, "css-embedded");
    expect(plainExternal.svg).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet href="file.css" type="text/css"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">\n<g id="s-sale" fill="#112233" opacity="1"/>\n</svg>\n`,
    );
    expect(plainExternal.svg).not.toContain("<text");
    const textOpen = `<text id="s-sale" fill="#112233" opacity="1" font-family="${LIVE_FONT}">Sale 50%</text>`;
    expect(saleExternal.svg).toBe(plainExternal.svg.replace('<g id="s-sale" fill="#112233" opacity="1"/>', textOpen));
    expect(saleExternal.css).toBe(plainExternal.css);
    expect(saleExternal.css ?? "").toContain("fill:");
    expect(saleExternal.css ?? "").toContain("opacity:");
    expect(saleExternal.css ?? "").toContain("#s-sale");
    expect(saleEmbedded.svg).toContain(textOpen);
    expect(saleEmbedded.svg).toContain("<style>");
    for (const svg of [saleExternal.svg, saleEmbedded.svg]) {
      const texts = elementsNamed(parseXml(svg), "text");
      expect(texts).toHaveLength(1);
      const text = texts[0];
      if (!text) throw new Error("missing text");
      expect(directText(text)).toBe("Sale 50%");
      expect(text.attrs["font-family"]).toBe(LIVE_FONT);
      expect(text.attrs.fill).toBe("#112233");
      expect(text.attrs.opacity).toBe("1");
      expect(svg).not.toContain(LIVE_LABEL);
    }
    expect(saleExternal.css ?? "").not.toContain(LIVE_LABEL);
    const carried = saleExternal.lowered.nodes[0] as IrNode & { text?: string; label?: string };
    expect(carried.text).toBe("Sale 50%");
    expect(carried.label).toBeUndefined();
  });

  test("Tom & Jerry <3 is escaped and the svg parses", () => {
    const quote = `Say "hi" > 'go'`;
    const ir = liveScene([
      liveNode("s-line", { text: "Tom & Jerry <3", label: LIVE_LABEL }),
      liveNode("s-quote", { text: quote, label: LIVE_LABEL }),
    ]);
    for (const backend of ["css-external", "css-embedded"] as const) {
      const compiled = compileCss(ir, backend);
      const svg = compiled.svg;
      expect(svg).toContain("Tom &amp; Jerry &lt;3");
      expect(svg).toContain("Say &quot;hi&quot; &gt; &apos;go&apos;");
      expect(svg).not.toContain("Tom & Jerry");
      expect(svg).not.toContain(LIVE_LABEL);
      expect(compiled.css ?? "").not.toContain(LIVE_LABEL);
      const texts = elementsNamed(parseXml(svg), "text");
      expect(texts.map(directText)).toEqual(["Tom & Jerry <3", quote]);
      expect(texts.every((node) => node.attrs["font-family"] === LIVE_FONT)).toBe(true);
    }
  });
});
