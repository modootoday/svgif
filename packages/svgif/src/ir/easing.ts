/** Easing on the key that ends a span. The first key's token is ignored by the sampler. */

export type EasingKind =
  | { kind: "linear" }
  | { kind: "hold" }
  | { kind: "spring" }
  | { kind: "cubic"; x1: number; y1: number; x2: number; y2: number };

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const CUBIC = new RegExp(
  String.raw`^cubic-bezier\(\s*(${NUMBER})\s*,\s*(${NUMBER})\s*,\s*(${NUMBER})\s*,\s*(${NUMBER})\s*\)$`,
);

export function parseEasing(token: string | undefined): EasingKind {
  if (token === undefined || token === "linear") return { kind: "linear" };
  if (token === "hold") return { kind: "hold" };
  if (token === "spring") return { kind: "spring" };
  const match = CUBIC.exec(token);
  if (!match) return { kind: "linear" };
  return {
    kind: "cubic",
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function sampleCurve(t: number, c1: number, c2: number): number {
  const c = 3 * c1;
  const b = 3 * (c2 - c1) - c;
  const a = 1 - c - b;
  return ((a * t + b) * t + c) * t;
}

/** Unit cubic-bezier. x is solved by bisection so the same input yields the same y. */
export function unitBezier(x1: number, y1: number, x2: number, y2: number, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let t = progress;
  for (let i = 0; i < 24; i += 1) {
    t = (lo + hi) / 2;
    const x = sampleCurve(t, x1, x2);
    if (x < progress) lo = t;
    else hi = t;
  }
  return sampleCurve(t, y1, y2);
}

export function easeProgress(kind: EasingKind, progress: number): number {
  if (kind.kind === "hold") return 0;
  if (kind.kind === "linear" || kind.kind === "spring") return progress;
  return unitBezier(kind.x1, kind.y1, kind.x2, kind.y2, progress);
}
