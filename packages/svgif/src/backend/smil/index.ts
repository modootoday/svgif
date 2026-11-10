/**
 * SMIL backend.
 * The artifact is one SVG document.
 * Animation elements are animate, animateTransform, animateMotion, and set.
 * keyTimes, keySplines, begin, end, and dur carry the one timeline.
 * dur is the end time minus the begin time, so the simple duration is finite.
 * A channel this backend cannot host is rewritten to per-frame keys or hold before compile.
 * [[sot:svgif/animation-backends]]
 */

import { compile } from "./compile.ts";

export { compile } from "./compile.ts";
export type { SmilCompileResult } from "./compile.ts";
export { lower } from "./lower.ts";

export const id = "smil" as const;
export const schema = "svgif.backend/1" as const;

export const backend = {
  id,
  schema,
  compile,
} as const;
