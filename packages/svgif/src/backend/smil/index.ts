/**
 * SMIL backend.
 * The artifact is one SVG document.
 * Animation elements are animate, animateTransform, animateMotion, and set.
 * keyTimes, keySplines, begin, end, and dur carry the one timeline.
 * A play that does not loop uses dur as the end time minus the begin time.
 * A loop whose last key repeats the key at frame 0 uses dur as lastKey / fps.
 * Any other loop uses durationInFrames / fps. The simple duration stays finite.
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
