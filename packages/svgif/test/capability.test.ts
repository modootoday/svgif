/**
 * One fixture per feature-matrix row.
 * A row that cannot emit records a lowering. A silent drop fails.
 * [[sot:svgif/animation-backends]]
 */

import { describe, expect, test } from "bun:test";
import { compileCss } from "../src/backend/css/index.ts";
import { compile as compileSmil, lower as lowerSmil } from "../src/backend/smil/index.ts";
import {
  assertRowAccounted,
  BACKENDS,
  cellOf,
  emitsMatrix3d,
  FEATURE_MATRIX,
  type BackendId,
  type FeatureRow,
  type LoweringRecord,
} from "../src/backend/capability.ts";
import { sample, type IrTrack, type TimelineIr } from "../src/ir/index.ts";

function document(nodes: TimelineIr["nodes"], durationInFrames = 4): TimelineIr {
  return {
    fps: 10,
    width: 32,
    height: 24,
    durationInFrames,
    nodes,
  };
}

function keys(property: string, from: IrTrack["keys"][number]["value"], to: IrTrack["keys"][number]["value"], easing = "linear"): IrTrack {
  return {
    property,
    keys: [
      { frame: 0, value: from },
      { frame: 3, value: to, easing },
    ],
  };
}

const FIXTURES: Record<string, { ir: TimelineIr; witnesses: Record<string, string> }> = {
  "transform-components": {
    ir: document([
      {
        id: "s-trs",
        tracks: [
          keys("transform.translateX", 0, 10),
          keys("transform.translateY", 0, 4),
          keys("transform.rotate", 0, 90),
          keys("transform.scaleX", 1, 2),
          keys("transform.scaleY", 1, 0.5),
        ],
      },
    ]),
    witnesses: {},
  },
  "matrix-affine": {
    ir: document([
      {
        id: "s-affine",
        tracks: [keys("transform.matrix", [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 8, 0])],
      },
    ]),
    witnesses: {},
  },
  matrix3d: {
    ir: document(
      [
        {
          id: "s-m3",
          tracks: [
            {
              property: "transform.matrix",
              keys: [{ frame: 0, value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1] }],
            },
          ],
        },
      ],
      2,
    ),
    witnesses: {
      "transform.matrix": "1 0 0 0 0 1 0 0 0 0 1 0 10 0 0 1",
    },
  },
  "attr-d": {
    ir: document([
      {
        id: "s-path",
        tracks: [keys("attr.d", "M 0 0 L 10 0", "M 0 4 L 10 4")],
      },
    ]),
    witnesses: { "attr.d": "M 0 0 L 10 0" },
  },
  paint: {
    ir: document([
      {
        id: "s-paint",
        tracks: [
          keys("attr.fill", "#112233", "#445566"),
          keys("attr.stroke", "#000000", "#ffffff"),
          keys("attr.opacity", 1, 0.25),
        ],
      },
    ]),
    witnesses: {},
  },
  "offset-path": {
    ir: document([
      {
        id: "s-off",
        tracks: [
          {
            property: "attr.offsetPath",
            keys: [{ frame: 0, value: "M 0 0 L 40 0" }],
          },
          keys("attr.offsetDistance", 0, 40),
        ],
      },
    ]),
    witnesses: {
      "attr.offsetPath": "M 0 0 L 40 0",
      "attr.offsetDistance": 'keyPoints="0;40"',
    },
  },
  "animate-motion": {
    ir: document([
      {
        id: "s-mot",
        tracks: [
          {
            property: "attr.offsetPath",
            keys: [{ frame: 0, value: "M 0 0 L 48 0" }],
          },
          keys("attr.offsetDistance", 0, 48),
        ],
      },
    ]),
    witnesses: {
      "attr.offsetPath": "offset-path:",
      "attr.offsetDistance": "offset-distance:",
    },
  },
  "filter-primitives": {
    ir: document([
      {
        id: "s-filt",
        tracks: [
          keys("filter.feGaussianBlur.stdDeviation", 0, 3.5),
          keys("filter.feDisplacementMap.scale", 0, 6.25),
          keys("filter.feTurbulence.baseFrequency", 0, 0.125),
          keys("filter.feTurbulence.seed", 1, 17),
          keys("filter.x", "-50%", "-12%"),
          keys("filter.y", "-40%", "-9%"),
          keys("filter.width", "200%", "186%"),
          keys("filter.height", "220%", "164%"),
        ],
      },
    ]),
    witnesses: {
      "filter.feGaussianBlur.stdDeviation": "3.5",
      "filter.feDisplacementMap.scale": "6.25",
      "filter.feTurbulence.baseFrequency": "0.125",
      "filter.feTurbulence.seed": "17",
      "filter.x": "-12%",
      "filter.y": "-9%",
      "filter.width": "186%",
      "filter.height": "164%",
    },
  },
  "gradient-stops": {
    ir: document([
      {
        id: "s-grad",
        tracks: [
          keys("gradient.s0.offset", 0, 0.375),
          keys("gradient.s0.stop-color", "#000000", "#ff0000"),
        ],
      },
    ]),
    witnesses: {
      "gradient.s0.offset": "0.375",
      "gradient.s0.stop-color": "#ff0000",
    },
  },
  "mask-clip": {
    ir: document([
      {
        id: "s-clip",
        tracks: [
          keys("clip", "M 0 0 L 8 0 L 8 8 Z", "M 0 0 L 8 0 L 8 4 Z"),
          keys("mask", "M 0 0 L 4 0 L 4 4 Z", "M 0 0 L 6 0 L 6 4 Z"),
        ],
      },
    ]),
    witnesses: {
      clip: "M 0 0 L 8 0 L 8 8 Z",
      mask: "M 0 0 L 4 0 L 4 4 Z",
    },
  },
  "show-hide": {
    ir: document([
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
    ]),
    witnesses: {},
  },
};

function artifactOf(backend: BackendId, ir: TimelineIr): { artifact: string; records: LoweringRecord[] } {
  if (backend === "smil") {
    return { artifact: compileSmil(ir).svg, records: [] };
  }
  const compiled = compileCss(ir, backend);
  const css = compiled.css ?? "";
  return {
    artifact: backend === "css-external" ? `${compiled.svg}\n${css}` : compiled.svg,
    records: compiled.diagnostics,
  };
}

function witnessesFor(row: FeatureRow, backend: BackendId, witnesses: Record<string, string>): Record<string, string> {
  if (row.cells[backend] === "emit") return {};
  return witnesses;
}

describe("feature matrix", () => {
  test("lists every channel row and never emits matrix3d", () => {
    expect(FEATURE_MATRIX.map((row) => row.id)).toEqual([
      "transform-components",
      "matrix-affine",
      "matrix3d",
      "attr-d",
      "paint",
      "offset-path",
      "animate-motion",
      "filter-primitives",
      "gradient-stops",
      "mask-clip",
      "show-hide",
    ]);
    const ids = new Set(FEATURE_MATRIX.map((row) => row.id));
    expect(ids.size).toBe(FEATURE_MATRIX.length);
    for (const row of FEATURE_MATRIX) {
      expect(row.cells["css-external"]).toBe(row.cells["css-embedded"]);
      for (const backend of BACKENDS) {
        const cell = row.cells[backend];
        expect(cell === "emit" || cell === "lower").toBe(true);
        expect(cellOf(row.id, backend)).toBe(cell);
        if (cell === "emit") expect(row.native[backend].length).toBeGreaterThan(0);
        else expect(row.native[backend]).toEqual([]);
      }
    }
    for (const backend of BACKENDS) {
      expect(emitsMatrix3d(backend)).toBe(false);
      expect(cellOf("matrix3d", backend)).toBe("lower");
    }
  });

  test("an empty lower artifact is a silent drop", () => {
    const row = FEATURE_MATRIX.find((item) => item.id === "matrix3d");
    expect(row).toBeDefined();
    expect(() =>
      assertRowAccounted({
        row: row as FeatureRow,
        backend: "smil",
        artifact: "<svg></svg>",
        records: [],
        witnesses: {},
      }),
    ).toThrow(/silent drop/);
  });

  test("an emit row with no native construct is a silent drop", () => {
    const row = FEATURE_MATRIX.find((item) => item.id === "show-hide");
    expect(row).toBeDefined();
    expect(() =>
      assertRowAccounted({
        row: row as FeatureRow,
        backend: "css-embedded",
        artifact: "<svg></svg>",
        records: [],
        witnesses: {},
      }),
    ).toThrow(/silent drop/);
  });

  for (const feature of FEATURE_MATRIX) {
    test(`${feature.id} either emits or records a lowering`, () => {
      const fixture = FIXTURES[feature.id];
      expect(fixture, feature.id).toBeDefined();
      const properties = fixture.ir.nodes.flatMap((node) => node.tracks.map((track) => track.property));
      expect(properties.slice().sort()).toEqual(feature.properties.slice().sort());

      const smilLowered = lowerSmil(fixture.ir);
      for (let frame = 0; frame < fixture.ir.durationInFrames; frame += 1) {
        expect(sample(smilLowered, frame)).toEqual(sample(fixture.ir, frame));
      }

      for (const backend of BACKENDS) {
        const { artifact, records } = artifactOf(backend, fixture.ir);
        expect(artifact.includes("matrix3d")).toBe(false);
        const cell = assertRowAccounted({
          row: feature,
          backend,
          artifact,
          records,
          witnesses: witnessesFor(feature, backend, fixture.witnesses),
        });
        expect(cell).toBe(feature.cells[backend]);
        if (backend !== "smil") {
          const compiled = compileCss(fixture.ir, backend);
          for (let frame = 0; frame < fixture.ir.durationInFrames; frame += 1) {
            expect(sample(compiled.lowered, frame)).toEqual(sample(fixture.ir, frame));
          }
        }
      }
    });
  }
});
