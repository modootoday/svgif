/**
 * One IR fixture, three backends.
 * sample(lowered, frame) equals sample(source, frame) at every frame.
 * The sanitizer case removes documented tags from the artifact string.
 * It does not claim that a sanitizer was executed.
 * [[sot:svgif/animation-backends]]
 */

import { describe, expect, test } from "bun:test";
import { BACKENDS, type BackendId } from "../src/backend/capability.ts";
import { lowerForCss } from "../src/backend/css/index.ts";
import { lower as lowerSmil } from "../src/backend/smil/index.ts";
import { sample, type IrNode, type TimelineIr } from "../src/ir/index.ts";
import { compile, lower, type RewriteMethod } from "../src/lower/index.ts";

const SOURCE: TimelineIr = {
  fps: 10,
  width: 64,
  height: 48,
  durationInFrames: 4,
  nodes: [
    {
      id: "s-mark",
      tracks: [
        {
          property: "transform.translateX",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 12, easing: "linear" },
          ],
        },
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 1 },
            { frame: 2, value: 0, easing: "hold" },
          ],
        },
        {
          property: "attr.d",
          keys: [
            { frame: 0, value: "M 0 0 L 10 0" },
            { frame: 3, value: "M 0 4 L 10 4", easing: "linear" },
          ],
        },
        {
          property: "clip",
          keys: [
            { frame: 0, value: "M 0 0 L 8 0 L 8 8 Z" },
            { frame: 3, value: "M 0 0 L 8 0", easing: "linear" },
          ],
        },
        {
          property: "filter.feGaussianBlur.stdDeviation",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 2, easing: "linear" },
          ],
        },
        {
          property: "gradient.s0.offset",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 0.5, easing: "linear" },
          ],
        },
        {
          property: "gradient.s0.stop-color",
          keys: [
            { frame: 0, value: "#000000" },
            { frame: 3, value: "#ff0000", easing: "linear" },
          ],
        },
        {
          property: "transform.matrix",
          keys: [{ frame: 0, value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1] }],
        },
        {
          property: "attr.offsetPath",
          keys: [{ frame: 0, value: "M 0 0 L 40 0" }],
        },
        {
          property: "attr.offsetDistance",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 40, easing: "linear" },
          ],
        },
      ],
    },
  ],
};

const EXPECTED: Record<BackendId, Record<string, RewriteMethod | "keep">> = {
  "css-external": {
    "transform.translateX": "keep",
    "attr.opacity": "keep",
    "attr.d": "per-frame",
    clip: "per-frame",
    "filter.feGaussianBlur.stdDeviation": "per-frame",
    "gradient.s0.offset": "per-frame",
    "gradient.s0.stop-color": "per-frame",
    "transform.matrix": "per-frame",
    "attr.offsetPath": "keep",
    "attr.offsetDistance": "keep",
  },
  "css-embedded": {
    "transform.translateX": "keep",
    "attr.opacity": "keep",
    "attr.d": "per-frame",
    clip: "per-frame",
    "filter.feGaussianBlur.stdDeviation": "per-frame",
    "gradient.s0.offset": "per-frame",
    "gradient.s0.stop-color": "per-frame",
    "transform.matrix": "per-frame",
    "attr.offsetPath": "keep",
    "attr.offsetDistance": "keep",
  },
  smil: {
    "transform.translateX": "keep",
    "attr.opacity": "keep",
    "attr.d": "keep",
    clip: "hold",
    "filter.feGaussianBlur.stdDeviation": "keep",
    "gradient.s0.offset": "keep",
    "gradient.s0.stop-color": "keep",
    "transform.matrix": "per-frame",
    "attr.offsetPath": "keep",
    "attr.offsetDistance": "keep",
  },
};

/** Tags a sanitizer often removes. The list is the fixture, not a product run. */
const DOCUMENTED_TAGS: Record<BackendId, readonly string[]> = {
  "css-external": ["<?xml-stylesheet"],
  "css-embedded": ["<style"],
  smil: ["<animate", "<animateTransform", "<animateMotion", "<set", "<mpath"],
};

function methodOf(rewrites: { property: string; method: RewriteMethod }[], property: string): RewriteMethod | "keep" {
  return rewrites.find((rewrite) => rewrite.property === property)?.method ?? "keep";
}

function trackKeys(ir: TimelineIr, property: string) {
  const track = ir.nodes[0]?.tracks.find((item) => item.property === property);
  if (!track) throw new Error(`missing ${property}`);
  return track.keys;
}

function stripDocumentedTags(svg: string): string {
  return svg
    .replace(/<\?xml-stylesheet\b[^?]*\?>\n?/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>\n?/g, "")
    .replace(/<animateMotion\b[^>]*>[\s\S]*?<\/animateMotion>\n?/g, "")
    .replace(/<animateTransform\b[^>]*\/>\n?/g, "")
    .replace(/<animate\b[^>]*\/>\n?/g, "")
    .replace(/<set\b[^>]*\/>\n?/g, "")
    .replace(/<mpath\b[^>]*\/>\n?/g, "");
}

describe("lower", () => {
  test("samples match the source at every frame of the fixture", () => {
    for (const backend of BACKENDS) {
      const compiled = compile(SOURCE, backend);
      expect(compiled.backend).toBe(backend);
      expect(compiled.svg.includes("matrix3d")).toBe(false);
      expect(compiled.css?.includes("matrix3d") ?? false).toBe(false);
      const properties = compiled.lowered.nodes[0]?.tracks.map((track) => track.property);
      expect(properties).toEqual(SOURCE.nodes[0]?.tracks.map((track) => track.property));
      for (const [property, method] of Object.entries(EXPECTED[backend])) {
        expect(methodOf(compiled.rewrites, property)).toBe(method);
      }
      for (let frame = 0; frame < SOURCE.durationInFrames; frame += 1) {
        expect(sample(compiled.lowered, frame)).toEqual(sample(SOURCE, frame));
      }
      expect(compile(SOURCE, backend).svg).toBe(compiled.svg);
    }
  });

  test("a lower cell is per-frame keys or hold, and an emit cell keeps its span", () => {
    const css = compile(SOURCE, "css-embedded");
    const smil = compile(SOURCE, "smil");
    expect(trackKeys(css.lowered, "attr.d")).toHaveLength(SOURCE.durationInFrames);
    expect(trackKeys(smil.lowered, "attr.d")).toHaveLength(2);
    expect(trackKeys(smil.lowered, "clip")[1]?.easing).toBe("hold");
    expect(trackKeys(css.lowered, "transform.matrix")).toHaveLength(SOURCE.durationInFrames);
    expect(trackKeys(smil.lowered, "transform.matrix")).toHaveLength(SOURCE.durationInFrames);
    expect(trackKeys(css.lowered, "transform.translateX")).toHaveLength(2);
    expect(trackKeys(SOURCE, "attr.d")).toHaveLength(2);
  });

  test("a string removal documents tags an HTML sanitizer often strips", () => {
    for (const backend of BACKENDS) {
      const svg = compile(SOURCE, backend).svg;
      const tags = DOCUMENTED_TAGS[backend];
      for (const tag of tags) expect(svg).toContain(tag);
      const stripped = stripDocumentedTags(svg);
      for (const tag of tags) expect(stripped).not.toContain(tag);
      expect(stripped).toContain("<svg");
    }
  });

  test("an unknown backend is rejected", () => {
    expect(() => compile(SOURCE, "unknown" as BackendId)).toThrow(TypeError);
  });
});

const FONT = "ui-sans-serif, system-ui, sans-serif";
const LABEL = "author-note";

function paint(): IrNode["tracks"] {
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

function scene(nodes: IrNode[]): TimelineIr {
  return { fps: 10, width: 32, height: 32, durationInFrames: 2, nodes };
}

function authored(id: string, fields: { text?: string; label?: string }, tracks: IrNode["tracks"] = paint()): IrNode {
  return Object.assign({ id, tracks }, fields);
}

function carried(node: IrNode | undefined): { text?: string; label?: string } {
  return (node ?? {}) as { text?: string; label?: string };
}

describe("live text", () => {
  test("lower carries text and drops label", () => {
    const ir = scene([authored("s-sale", { text: "Sale 50%", label: LABEL })]);
    const top = lower(ir, "css-embedded").ir;
    const css = lowerForCss(ir).ir;
    const smil = lowerSmil(ir);
    for (const lowered of [top, css, smil]) {
      expect(carried(lowered.nodes[0]).text).toBe("Sale 50%");
      expect(carried(lowered.nodes[0]).label).toBeUndefined();
      expect("label" in (lowered.nodes[0] ?? {})).toBe(false);
      expect(JSON.stringify(lowered)).not.toContain(LABEL);
      expect(lowered.nodes[0]?.tracks.map((track) => track.property)).toEqual(["attr.fill", "attr.opacity"]);
    }
  });

  test("Sale 50% is drawn by both backends and a label is absent", () => {
    const ir = scene([authored("s-sale", { text: "Sale 50%", label: LABEL })]);
    for (const backend of BACKENDS) {
      const compiled = compile(ir, backend);
      expect(compiled.svg).toContain("<text ");
      expect(compiled.svg).toContain("Sale 50%");
      expect(compiled.svg).toContain(`font-family="${FONT}"`);
      expect(compiled.svg).toContain('fill="#112233"');
      expect(compiled.svg).toContain('opacity="1"');
      expect(compiled.svg).not.toContain(LABEL);
      expect(compiled.css ?? "").not.toContain(LABEL);
      const painted = `${compiled.svg}\n${compiled.css ?? ""}`;
      if (backend === "smil") {
        expect(compiled.svg).toContain('attributeName="fill"');
        expect(compiled.svg).toContain('attributeName="opacity"');
      } else {
        expect(painted).toContain("fill:");
        expect(painted).toContain("opacity:");
      }
    }
  });

  test("a node without text is unchanged when a label is the only extra field", () => {
    const plain = scene([{ id: "s-sale", tracks: paint() }]);
    const labeled = scene([authored("s-sale", { label: LABEL })]);
    for (const backend of BACKENDS) {
      const without = compile(plain, backend);
      const withLabel = compile(labeled, backend);
      expect(withLabel.svg).toBe(without.svg);
      expect(withLabel.css).toBe(without.css);
      expect(without.svg).not.toContain("<text");
      expect("text" in (without.lowered.nodes[0] ?? {})).toBe(false);
    }
  });
});
