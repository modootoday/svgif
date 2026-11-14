/** Inline player. Reads the project script and mounts a static CSS document. */

import { compile } from "../../../packages/svgif/src/lower/index.ts";
import { mount } from "../../../packages/svgif/src/player/index.ts";

const script = document.getElementById("svgif-project");
const text = script?.textContent ?? "";
if (text.length > 0) {
  const project = JSON.parse(text) as { composition?: Record<string, unknown> };
  const composition = project.composition;
  if (composition && Array.isArray(composition.nodes)) {
    const ir = {
      fps: Number(composition.fps),
      width: Number(composition.width),
      height: Number(composition.height),
      durationInFrames: Number(composition.durationInFrames),
      nodes: composition.nodes as { id: string; tracks: { property: string; keys: { frame: number; value: number | string | number[]; easing?: string }[] }[] }[],
      ...(composition.loop === true ? { loop: true as const } : {}),
    };
    const compiled = compile(ir, "css-embedded");
    let host = document.getElementById("svgif-preview");
    if (!host) {
      host = document.createElement("div");
      host.id = "svgif-preview";
      document.body.append(host);
    }
    mount(
      host,
      {
        fps: ir.fps,
        durationInFrames: ir.durationInFrames,
        artifact: {
          backend: "css-embedded",
          svg: compiled.svg,
          ...(compiled.css !== undefined ? { css: compiled.css } : {}),
        },
      },
      { mode: "static" },
    );
  }
}
