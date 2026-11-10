/**
 * One IR fixture, both CSS artifacts.
 * sample(lowered, frame) matches sample(source, frame) at every frame.
 * The golden SVG is the quantized string.
 * [[sot:svgif/animation-backends]] [[adr:svgif/20261110120300]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCss, cssEmbedded, cssExternal, stableSelectorId } from "../src/backend/css/index.ts";
import { formatUnit, sample, type TimelineIr } from "../src/ir/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cssDir = resolve(here, "../src/backend/css");

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
<path id="s-n0" d="M 0 0 L 10 0" fill="#112233" opacity="0"/>
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
  75% {
    transform: translate(30px, 0px);
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
  75% {
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
  75% {
    fill: #445566;
  }
  100% {
    fill: #445566;
  }
}
@keyframes s-n0-d {
  0% {
    animation-timing-function: steps(1,end);
    d: path("M 0 0 L 10 0");
  }
  25% {
    animation-timing-function: steps(1,end);
    d: path("M 0 1.3333 L 10 1.3333");
  }
  50% {
    animation-timing-function: steps(1,end);
    d: path("M 0 2.6667 L 10 2.6667");
  }
  75% {
    d: path("M 0 4 L 10 4");
  }
  100% {
    d: path("M 0 4 L 10 4");
  }
}
#s-n0 {
  animation: s-n0-transform 0.1333s linear 0s 1 normal both, s-n0-opacity 0.1333s linear 0s 1 normal both, s-n0-fill 0.1333s linear 0s 1 normal both, s-n0-d 0.1333s linear 0s 1 normal both;
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
  75% {
    transform: translate(0px, 12px);
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
  75% {
    transform: matrix(1, 0, 0, 1, 4, 0);
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
  75% {
    offset-distance: 100;
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
  75% {
    transform: translate(30px, 0px);
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
  75% {
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
  75% {
    fill: #445566;
  }
  100% {
    fill: #445566;
  }
}
@keyframes s-n0-d {
  0% {
    animation-timing-function: steps(1,end);
    d: path("M 0 0 L 10 0");
  }
  25% {
    animation-timing-function: steps(1,end);
    d: path("M 0 1.3333 L 10 1.3333");
  }
  50% {
    animation-timing-function: steps(1,end);
    d: path("M 0 2.6667 L 10 2.6667");
  }
  75% {
    d: path("M 0 4 L 10 4");
  }
  100% {
    d: path("M 0 4 L 10 4");
  }
}
#s-n0 {
  animation: s-n0-transform 0.1333s linear 0s 1 normal both, s-n0-opacity 0.1333s linear 0s 1 normal both, s-n0-fill 0.1333s linear 0s 1 normal both, s-n0-d 0.1333s linear 0s 1 normal both;
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
  75% {
    transform: translate(0px, 12px);
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
  75% {
    transform: matrix(1, 0, 0, 1, 4, 0);
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
  75% {
    offset-distance: 100;
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
<path id="s-n0" d="M 0 0 L 10 0" fill="#112233" opacity="0"/>
<g id="s-n1"/>
<g id="s-n2"/>
<g id="s-wide"/>
</svg>
`;
