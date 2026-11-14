/**
 * SVG download.
 * Loop is true or false on the SVG export. The downloaded bytes are that export.
 * Raster exporters do not take this field.
 */

import { exportSvg, type SvgBackend, type SvgNode } from "../../../packages/svgif-export/src/svg.ts";
import { rasterComposition, type Composition, type SceneNode } from "./composition.ts";

function liveText(node: SceneNode): string | undefined {
  const value = (node as SceneNode & { text?: unknown }).text;
  return typeof value === "string" ? value : undefined;
}

/** One SVG document for the chosen backend. A true loop repeats. False plays once. */
export function svgFile(composition: Composition, backend: SvgBackend): Blob {
  const raster = rasterComposition(composition);
  const nodes: SvgNode[] = raster.nodes.map((node, index) => {
    const source = composition.nodes[index] ?? node;
    const text = liveText(source);
    if (text === undefined) return { id: node.id, tracks: node.tracks };
    return { id: node.id, tracks: node.tracks, text };
  });
  return exportSvg(
    {
      fps: raster.fps,
      width: raster.width,
      height: raster.height,
      durationInFrames: raster.durationInFrames,
      nodes,
    },
    { backend, loop: composition.loop === true },
  );
}
