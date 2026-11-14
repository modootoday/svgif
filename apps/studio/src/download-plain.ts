/**
 * Simple-mode downloads.
 * Image uses the SVG export, which honors length and loop.
 * Video uses the animated raster exporters. Words stay on the nodes.
 * The panel does not name a codec or a backend.
 */

import { exportAnimatedMp4 } from "../../../packages/svgif-export/src/mp4.ts";
import { type SvgBackend } from "../../../packages/svgif-export/src/svg.ts";
import { exportAnimatedWebm } from "../../../packages/svgif-export/src/webm.ts";
import { ExportCapabilityError, exportAnimatedWebp } from "../../../packages/svgif-export/src/webp.ts";
import { exportComposition, rasterComposition, type Composition, type EditorState } from "./composition.ts";
import { exportSupport, type ExportDecision } from "./export-support.ts";
import { svgFile } from "./svg-file.ts";

export { ExportCapabilityError };

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

/** One SVG document for Simple and Advanced. Words, length, and Loop stay on it. */
export function svgDownload(state: EditorState, backend: SvgBackend = IMAGE_BACKEND): Blob {
  return svgFile(compositionWithWords(state), backend);
}

/** Animated SVG for the current length and Loop, with live words carried as text. */
export function imageFile(state: EditorState): Blob {
  return svgDownload(state, IMAGE_BACKEND);
}

/**
 * The timeline the raster exporters accept.
 * Loop stays off this object. Live words stay on the nodes.
 */
export function rasterWithWords(state: EditorState): Composition {
  const withWords = compositionWithWords(state);
  const raster = rasterComposition(withWords);
  for (let index = 0; index < raster.nodes.length; index += 1) {
    const text = (withWords.nodes[index] as { text?: unknown } | undefined)?.text;
    const node = raster.nodes[index];
    if (!node || typeof text !== "string") continue;
    (node as { text?: string }).text = text;
  }
  return raster;
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

export function webpDownload(state: EditorState): Promise<Blob> {
  return exportAnimatedWebp(rasterWithWords(state));
}

export function webmDownload(state: EditorState): Promise<Blob> {
  return exportAnimatedWebm(rasterWithWords(state));
}

export function mp4Download(state: EditorState): Promise<Blob> {
  return exportAnimatedMp4(rasterWithWords(state));
}

export async function videoFile(
  state: EditorState,
  kind: Exclude<VideoKind, "none">,
): Promise<{ blob: Blob; name: string }> {
  if (kind === "webm") return { blob: await webmDownload(state), name: "animation.webm" };
  return { blob: await webpDownload(state), name: "animation.webp" };
}
