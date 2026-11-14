/** Inline player. Reads the project script and mounts a static CSS document. */

import { compile } from "../../../packages/svgif/src/lower/index.ts";
import { mount } from "../../../packages/svgif/src/player/index.ts";
import { STUDIO_MOUNT_FLAG } from "./studio-flag.ts";

export interface PlayerDocument {
  getElementById(id: string): { textContent?: string | null } | null;
  documentElement?: { dataset?: { svgifStudio?: string }; getAttribute?(name: string): string | null };
  body?: { append(node: unknown): void };
  createElement?(tag: string): { id: string };
}

/** False once Studio owns the page, either by root or by the mount flag. */
export function playerShouldStart(doc: PlayerDocument): boolean {
  if (doc.getElementById("studio-root")) return false;
  const flag = doc.documentElement?.dataset?.svgifStudio ?? doc.documentElement?.getAttribute?.("data-svgif-studio") ?? "";
  return flag !== STUDIO_MOUNT_FLAG;
}

/** Mount the static player unless Studio is already on the page. */
export function mountInlinePlayer(doc: PlayerDocument = document): boolean {
  if (!playerShouldStart(doc)) return false;
  const script = doc.getElementById("svgif-project");
  const text = script?.textContent ?? "";
  if (text.length === 0 || !doc.createElement || !doc.body) return false;
  const project = JSON.parse(text) as { composition?: Record<string, unknown> };
  const composition = project.composition;
  if (!composition || !Array.isArray(composition.nodes)) return false;
  const ir = {
    fps: Number(composition.fps),
    width: Number(composition.width),
    height: Number(composition.height),
    durationInFrames: Number(composition.durationInFrames),
    nodes: composition.nodes as { id: string; tracks: { property: string; keys: { frame: number; value: number | string | number[]; easing?: string }[] }[] }[],
    ...(composition.loop === true ? { loop: true as const } : {}),
  };
  const compiled = compile(ir, "css-embedded");
  let host = doc.getElementById("svgif-preview");
  if (!host) {
    const created = doc.createElement("div");
    created.id = "svgif-preview";
    doc.body.append(created);
    host = created;
  }
  mount(
    host as { innerHTML: string },
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
  return true;
}

if (typeof document !== "undefined" && typeof document.getElementById === "function") {
  mountInlinePlayer(document);
}
