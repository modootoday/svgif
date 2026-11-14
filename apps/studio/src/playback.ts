/** Live SVG playback. Static leaves the compiled animation running. Scrub seeks that artifact. */

import { compile } from "../../../packages/svgif/src/lower/index.ts";
import { mount, type PlayerHandle, type PlayerHost, type PlayerMode } from "../../../packages/svgif/src/player/index.ts";
import { renderFrame } from "../../../packages/svgif-export/src/webp.ts";
import { exportComposition, rasterComposition, type Composition, type EditorState } from "./composition.ts";

/** The picture the artboard draws. Live words travel with nodes that have no shape path. */
export function previewComposition(state: EditorState): Composition {
  const composition = exportComposition(state.composition);
  for (const node of composition.nodes) {
    if (!Object.hasOwn(state.texts, node.id)) continue;
    if (node.tracks.some((track) => track.property === "attr.d")) continue;
    const text = state.texts[node.id];
    if (typeof text !== "string") continue;
    (node as Composition["nodes"][number] & { text?: string }).text = text;
  }
  return composition;
}

export function paintComposition(
  host: PlayerHost,
  composition: Composition,
  mode: PlayerMode,
  frame = 0,
): PlayerHandle {
  const ir = {
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    durationInFrames: composition.durationInFrames,
    nodes: composition.nodes.map((node) => {
      const next: { id: string; tracks: Composition["nodes"][number]["tracks"]; text?: string } = {
        id: node.id,
        tracks: node.tracks.map((track) => ({
          property: track.property,
          keys: track.keys.map((key) => ({ ...key })),
        })),
      };
      const text = (node as { text?: unknown }).text;
      if (typeof text === "string") next.text = text;
      return next;
    }),
    ...(composition.loop === true ? { loop: true } : {}),
  };
  const compiled = compile(ir, "css-embedded");
  const raster = rasterComposition(composition);
  return mount(
    host,
    {
      fps: ir.fps,
      durationInFrames: ir.durationInFrames,
      artifact: {
        backend: "css-embedded",
        svg: compiled.svg,
        ...(compiled.css !== undefined ? { css: compiled.css } : {}),
      },
      renderFrame: (next) => renderFrame(raster, next),
    },
    { mode, frame },
  );
}
