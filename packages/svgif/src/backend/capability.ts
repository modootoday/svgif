/**
 * Feature matrix for css-external, css-embedded, and smil.
 * Each cell is `emit` or `lower`. `matrix3d` is never emitted.
 * This module records the matrix. It does not rewrite tracks.
 * [[sot:svgif/animation-backends]]
 */

export const BACKENDS = ["css-external", "css-embedded", "smil"] as const;

export type BackendId = (typeof BACKENDS)[number];

export type Cell = "emit" | "lower";

export interface FeatureRow {
  id: string;
  /** Channel row from the feature matrix. */
  channel: string;
  properties: readonly string[];
  cells: Record<BackendId, Cell>;
  /**
   * Substrings that show a native construct.
   * Empty when that backend's cell is `lower`.
   */
  native: Record<BackendId, readonly string[]>;
  /**
   * Substrings that must not appear when that backend's cell is `lower`.
   * `matrix3d` is rejected for every row.
   */
  absent: Record<BackendId, readonly string[]>;
}

const css = (cell: Cell, native: readonly string[] = [], absent: readonly string[] = []): {
  cells: Record<"css-external" | "css-embedded", Cell>;
  native: Record<"css-external" | "css-embedded", readonly string[]>;
  absent: Record<"css-external" | "css-embedded", readonly string[]>;
} => ({
  cells: { "css-external": cell, "css-embedded": cell },
  native: { "css-external": native, "css-embedded": native },
  absent: { "css-external": absent, "css-embedded": absent },
});

function row(
  id: string,
  channel: string,
  properties: readonly string[],
  shared: ReturnType<typeof css>,
  smilCell: Cell,
  smilNative: readonly string[] = [],
  smilAbsent: readonly string[] = [],
): FeatureRow {
  return {
    id,
    channel,
    properties,
    cells: { ...shared.cells, smil: smilCell },
    native: { ...shared.native, smil: smilNative },
    absent: { ...shared.absent, smil: smilAbsent },
  };
}

const TRS = ["translate(", "rotate(", "scale("] as const;
const MOTION = ["<animateMotion", "<mpath"] as const;

/** One entry per channel row. css-external and css-embedded share a cell. */
export const FEATURE_MATRIX: readonly FeatureRow[] = [
  row(
    "transform-components",
    "translate / rotate / scale",
    [
      "transform.translateX",
      "transform.translateY",
      "transform.rotate",
      "transform.scaleX",
      "transform.scaleY",
    ],
    css("emit", ["@keyframes", "animation:", ...TRS]),
    "emit",
    ['type="translate"', 'type="rotate"', 'type="scale"'],
  ),
  row(
    "matrix-affine",
    "2D affine matrix",
    ["transform.matrix"],
    css("emit", ["matrix("]),
    "emit",
    ['type="matrix"'],
  ),
  row(
    "matrix3d",
    "matrix3d",
    ["transform.matrix"],
    css("lower"),
    "lower",
  ),
  row(
    "attr-d",
    "attr.d path",
    ["attr.d"],
    css("lower"),
    "emit",
    ["<animate", 'attributeName="d"'],
  ),
  row(
    "paint",
    "fill, stroke, opacity",
    ["attr.fill", "attr.stroke", "attr.opacity"],
    css("emit", ["@keyframes", "fill:", "stroke:", "opacity:"]),
    "emit",
    ['attributeName="fill"', 'attributeName="stroke"', 'attributeName="opacity"'],
  ),
  row(
    "offset-path",
    "offset-path + offset-distance",
    ["attr.offsetPath", "attr.offsetDistance"],
    css("emit", ["offset-path:", "offset-distance:"]),
    "lower",
  ),
  row(
    "animate-motion",
    "animateMotion / mpath",
    ["attr.offsetPath", "attr.offsetDistance"],
    css("lower", [], ["<animateMotion", "<mpath"]),
    "emit",
    MOTION,
  ),
  row(
    "filter-primitives",
    "feGaussianBlur stdDeviation, feDisplacementMap scale, feTurbulence baseFrequency / seed",
    [
      "filter.feGaussianBlur.stdDeviation",
      "filter.feDisplacementMap.scale",
      "filter.feTurbulence.baseFrequency",
      "filter.feTurbulence.seed",
    ],
    css("lower"),
    "emit",
    [
      "<feGaussianBlur",
      "<feDisplacementMap",
      "<feTurbulence",
      'attributeName="stdDeviation"',
      'attributeName="scale"',
      'attributeName="baseFrequency"',
      'attributeName="seed"',
    ],
  ),
  row(
    "gradient-stops",
    "gradient stop offset and color",
    ["gradient.s0.offset", "gradient.s0.stop-color"],
    css("lower"),
    "emit",
    ["<stop", 'attributeName="offset"', 'attributeName="stop-color"'],
  ),
  row(
    "mask-clip",
    "mask / clipPath geometry",
    ["clip", "mask"],
    css("lower"),
    "emit",
    ["<clipPath", "<mask", 'attributeName="d"'],
  ),
  row(
    "show-hide",
    "discrete show/hide",
    ["attr.opacity"],
    css("emit", ["steps(1,end)", "opacity:"]),
    "emit",
    ["<set", 'attributeName="opacity"'],
  ),
];

export interface LoweringRecord {
  code: string;
  property: string;
}

const RECORDED = new Set(["lowered", "matrix3d-omitted"]);

export function rowById(id: string): FeatureRow {
  const row = FEATURE_MATRIX.find((item) => item.id === id);
  if (!row) throw new Error(`unknown feature row ${id}`);
  return row;
}

export function cellOf(id: string, backend: BackendId): Cell {
  return rowById(id).cells[backend];
}

/** `matrix3d` has no native construct on any backend. */
export function emitsMatrix3d(backend: BackendId): false {
  if (cellOf("matrix3d", backend) !== "lower") {
    throw new Error("matrix3d is never emitted");
  }
  return false;
}

function recorded(records: readonly LoweringRecord[], property: string, code: string): boolean {
  return records.some((record) => record.property === property && record.code === code);
}

/**
 * A cell of `emit` must show every native marker and must not carry a lowering record.
 * A cell of `lower` is the record that the backend cannot emit the channel.
 * The channel is a silent drop when that record is missing and the artifact
 * keeps neither a compiler record nor the property's witness.
 */
export function assertRowAccounted(input: {
  row: FeatureRow;
  backend: BackendId;
  artifact: string;
  records: readonly LoweringRecord[];
  witnesses: Readonly<Record<string, string>>;
}): Cell {
  const cell = input.row.cells[input.backend];
  if (cell !== "emit" && cell !== "lower") {
    throw new Error(`${input.row.id} on ${input.backend} has no emit or lower cell`);
  }
  if (input.artifact.includes("matrix3d")) {
    throw new Error("matrix3d is never emitted");
  }
  if (input.row.id === "matrix3d" && cell !== "lower") {
    throw new Error("matrix3d is never emitted");
  }
  const native = input.row.native[input.backend];
  const absent = input.row.absent[input.backend];
  if (cell === "emit") {
    if (native.length === 0) {
      throw new Error(`${input.row.id} on ${input.backend} emits without a native construct`);
    }
    for (const property of input.row.properties) {
      if (input.records.some((record) => record.property === property && RECORDED.has(record.code))) {
        throw new Error(`${input.row.id} on ${input.backend} lowered ${property} but the matrix says emit`);
      }
    }
    for (const marker of native) {
      if (!input.artifact.includes(marker)) {
        throw new Error(`silent drop: ${input.row.id} on ${input.backend} missing ${marker}`);
      }
    }
    return "emit";
  }
  for (const token of absent) {
    if (input.artifact.includes(token)) {
      throw new Error(`${input.row.id} on ${input.backend} emitted ${token}`);
    }
  }
  for (const property of input.row.properties) {
    if (recorded(input.records, property, "matrix3d-omitted")) continue;
    const witness = input.witnesses[property] ?? "";
    const seen = witness.length > 0 && input.artifact.includes(witness);
    if (recorded(input.records, property, "lowered")) {
      if (!seen) throw new Error(`silent drop: ${input.row.id} on ${input.backend} dropped ${property}`);
      continue;
    }
    if (seen) continue;
    throw new Error(`silent drop: ${input.row.id} on ${input.backend} dropped ${property}`);
  }
  return "lower";
}
