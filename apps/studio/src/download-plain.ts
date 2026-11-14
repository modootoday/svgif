/**
 * Simple-mode downloads.
 * Image uses svgFile, which is the SVG export that already honors length and loop.
 * Video uses the raster exporters Advanced already wires.
 * The panel does not name a codec or a backend.
 */

import { exportWebm } from "../../../packages/svgif-export/src/webm.ts";
import { exportWebp } from "../../../packages/svgif-export/src/webp.ts";
import { exportComposition, rasterComposition, type Composition, type EditorState } from "./composition.ts";
import { exportSupport, type ExportDecision } from "./export-support.ts";
import { svgFile } from "./svg-file.ts";

export const IMAGE_NAME = "animation.svg";
export const VIDEO_PROGRESS = "Making the video\u2026";
export const VIDEO_UNSUPPORTED = "This browser can't make a video. Try Download image.";
export const NOTHING_TO_EXPORT = "There is nothing to download yet.";

/** Studio's SVG preset. Advanced starts on this same backend. */
const IMAGE_BACKEND = "css-embedded" as const;

export function compositionWithWords(state: EditorState): Composition {
  const composition = exportComposition(state.composition);
  for (const node of composition.nodes) {
    if (!Object.hasOwn(state.texts, node.id)) continue;
    const text = state.texts[node.id];
    if (typeof text !== "string") continue;
    (node as Composition["nodes"][number] & { text?: string }).text = text;
  }
  return composition;
}

/** Animated SVG for the current length and Loop, with live words carried as text. */
export function imageFile(state: EditorState): Blob {
  return svgFile(compositionWithWords(state), IMAGE_BACKEND);
}

export function hasSomethingToExport(nodeCount: number): boolean {
  return nodeCount > 0;
}

export type VideoKind = "webm" | "webp" | "none";

/** WebM when this browser can make it, otherwise animated WebP. */
export function videoKind(decision: ExportDecision = exportSupport()): VideoKind {
  if (decision.webm.enabled) return "webm";
  if (decision.webp.enabled) return "webp";
  return "none";
}

export function videoFile(state: EditorState, kind: Exclude<VideoKind, "none">): { blob: Blob; name: string } {
  const composition = rasterComposition(state.composition);
  if (kind === "webm") return { blob: exportWebm(composition), name: "animation.webm" };
  return { blob: exportWebp(composition), name: "animation.webp" };
}
