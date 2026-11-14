/**
 * Optional scene-node text.
 * The lower step carries `text` and drops `label`.
 * Compilers draw `text` as SVG text and never emit `label`.
 * The font is a generic family stack the browser already has.
 * [[adr:svgif/20261114074819]] [[sot:svgif/animation-ir]]
 */

import type { IrNode, IrTrack } from "../ir/types.ts";

/** Generic families already available. No font package is loaded. */
export const TEXT_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";

export function readText(node: IrNode): string | undefined {
  const value = (node as IrNode & { text?: unknown }).text;
  return typeof value === "string" ? value : undefined;
}

/** Keep `id`, `tracks`, and a string `text`. `label` is not copied. */
export function withCarriedText(node: IrNode, tracks: IrTrack[]): IrNode {
  const next: IrNode = { id: node.id, tracks };
  const text = readText(node);
  if (text !== undefined) (next as IrNode & { text: string }).text = text;
  return next;
}

/** XML text content. Ampersands, brackets, and quotes stay characters. */
export function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
