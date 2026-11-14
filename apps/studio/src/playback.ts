/** Live SVG playback. Static leaves the compiled animation running. Scrub seeks that artifact. */

import { compile } from "../../../packages/svgif/src/lower/index.ts";
import { mount, type PlayerHandle, type PlayerHost, type PlayerMode } from "../../../packages/svgif/src/player/index.ts";
import { renderFrame } from "../../../packages/svgif-export/src/webp.ts";
import { exportComposition, type Composition } from "./composition.ts";

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
    nodes: composition.nodes.map((node) => ({
      id: node.id,
      tracks: node.tracks.map((track) => ({
        property: track.property,
        keys: track.keys.map((key) => ({ ...key })),
      })),
    })),
    ...(composition.loop === true ? { loop: true } : {}),
  };
  const compiled = compile(ir, "css-embedded");
  const raster = exportComposition(composition);
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
