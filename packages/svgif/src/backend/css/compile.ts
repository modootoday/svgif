/**
 * css-external writes file.svg plus file.css.
 * css-embedded writes one SVG whose defs holds one style element.
 * Both use the printer in print.ts.
 * Transform and opacity stay in that stylesheet.
 * Path, clip, and mask geometry are SMIL on the element, in user space.
 * The frame-0 `d` and the animated values are the same coordinates.
 * [[sot:svgif/animation-backends]] [[sot:svgif/determinism]] [[adr:svgif/20261110120300]]
 */

import { sample } from "../../ir/sample.ts";
import { formatUnit } from "../../ir/quantize.ts";
import type { IrKey, IrTrack, IrValue, TimelineIr } from "../../ir/types.ts";
import { geometryAnimateMarkup } from "../smil/compile.ts";
import { assertTimeline, lowerForCss } from "./lower.ts";
import { formatCssValue, printStylesheet, stableSelectorId } from "./print.ts";
import type { CssBackendId, CssCompileOptions, CssCompileResult } from "./types.ts";

const FILE_BASE = /^[A-Za-z0-9_-]+$/;

const PRESENTATION: Record<string, string> = {
  "attr.d": "d",
  "attr.fill": "fill",
  "attr.stroke": "stroke",
  "attr.opacity": "opacity",
};

function fileBaseOf(opts: CssCompileOptions | undefined): string {
  const base = opts?.fileBase ?? "file";
  if (!FILE_BASE.test(base)) throw new TypeError("fileBase must be a stylesheet basename");
  return base;
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function presentationValue(property: string, value: IrValue): string {
  if (property === "attr.d" && typeof value === "string") return value;
  return formatCssValue(property, value);
}

function orderedKeys(keys: IrKey[]): IrKey[] {
  return keys
    .map((key, index) => ({ key, index }))
    .sort((left, right) => left.key.frame - right.key.frame || left.index - right.index)
    .map((entry) => entry.key);
}

function trackOf(tracks: IrTrack[], property: string): IrTrack | undefined {
  return tracks.find((track) => track.property === property);
}

function pathText(track: IrTrack | undefined): string {
  const first = track ? orderedKeys(track.keys)[0] : undefined;
  return first && typeof first.value === "string" ? first.value : "";
}

function geometryChanges(track: IrTrack | undefined): boolean {
  if (!track) return false;
  const values = new Set(track.keys.map((key) => (typeof key.value === "string" ? key.value : "")));
  return values.size > 1;
}

function geometryInner(property: string, track: IrTrack | undefined, fps: number): string {
  if (!track || !geometryChanges(track)) return "";
  return geometryAnimateMarkup(property, track.keys, fps);
}

function element(name: string, attrs: string[], inner: string): string {
  const open = `<${name}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}`;
  if (inner.length === 0) return `${open}/>`;
  return `${open}>${inner}</${name}>`;
}

interface DrawnNode {
  defs: string[];
  body: string;
}

function renderNode(ir: TimelineIr, id: string, sourceId: string, tracks: IrTrack[]): DrawnNode {
  const values = sample(ir, 0)[sourceId] ?? {};
  const attrs = [`id="${xmlEscape(id)}"`];
  const shape = trackOf(tracks, "attr.d");
  const clip = trackOf(tracks, "clip");
  const mask = trackOf(tracks, "mask");
  let path = false;
  for (const property of ["attr.d", "attr.fill", "attr.stroke", "attr.opacity"]) {
    const value = values[property];
    const name = PRESENTATION[property];
    if (value === undefined || !name) continue;
    if (property === "attr.d") path = true;
    const text =
      property === "attr.d" ? pathText(shape) || presentationValue(property, value) : presentationValue(property, value);
    attrs.push(`${name}="${xmlEscape(text)}"`);
  }
  const defs: string[] = [];
  if (clip) {
    const d = pathText(clip);
    const child = element("path", [`d="${xmlEscape(d)}"`], geometryInner("clip", clip, ir.fps));
    defs.push(`<clipPath id="${id}-frame0" clipPathUnits="userSpaceOnUse">${child}</clipPath>`);
    attrs.push(`clip-path="url(#${id}-frame0)"`);
  }
  if (mask) {
    const d = pathText(mask);
    const child = element("path", [`d="${xmlEscape(d)}"`], geometryInner("mask", mask, ir.fps));
    defs.push(`<mask id="${id}-mask" maskUnits="userSpaceOnUse">${child}</mask>`);
    attrs.push(`mask="url(#${id}-mask)"`);
  }
  const inner = path ? geometryInner("attr.d", shape, ir.fps) : "";
  return { defs, body: element(path ? "path" : "g", attrs, inner) };
}

function renderSvg(ir: TimelineIr, css: string, href: string | undefined): string {
  const width = formatUnit(ir.width);
  const height = formatUnit(ir.height);
  const link = href ? `<?xml-stylesheet href="${href}" type="text/css"?>\n` : "";
  const drawn = ir.nodes.map((node) => renderNode(ir, stableSelectorId(node.id), node.id, node.tracks));
  const style = href || css.length === 0 ? "" : `<style><![CDATA[${css}]]></style>`;
  const defs = [style, ...drawn.flatMap((node) => node.defs)].filter((item) => item.length > 0);
  const defsBlock = defs.length > 0 ? `<defs>\n${defs.join("\n")}\n</defs>\n` : "";
  const nodes = drawn.map((node) => node.body).join("\n");
  const body = `${defsBlock}${nodes}`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    link +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `${body}\n` +
    `</svg>\n`
  );
}

export function compileCss(
  ir: TimelineIr,
  backend: CssBackendId,
  opts?: CssCompileOptions,
): CssCompileResult {
  assertTimeline(ir);
  if (backend !== "css-external" && backend !== "css-embedded") {
    throw new TypeError("CSS compile backend must be css-external or css-embedded");
  }
  const lowered = lowerForCss(ir);
  const css = printStylesheet(lowered.ir, { loop: opts?.loop === true });
  if (css.includes("matrix3d")) throw new Error("CSS printer emitted matrix3d");
  if (css.includes("]]>")) throw new TypeError("stylesheet cannot close a style block");
  const base = fileBaseOf(opts);
  if (backend === "css-external") {
    const svg = renderSvg(lowered.ir, css, `${base}.css`);
    return {
      id: "css-external",
      schema: "svgif.backend/1",
      svg,
      css,
      lowered: lowered.ir,
      diagnostics: lowered.diagnostics,
    };
  }
  const svg = renderSvg(lowered.ir, css, undefined);
  return {
    id: "css-embedded",
    schema: "svgif.backend/1",
    svg,
    lowered: lowered.ir,
    diagnostics: lowered.diagnostics,
  };
}

export const cssExternal = {
  id: "css-external" as const,
  schema: "svgif.backend/1" as const,
  compile(ir: TimelineIr, opts?: CssCompileOptions): CssCompileResult {
    return compileCss(ir, "css-external", opts);
  },
};

export const cssEmbedded = {
  id: "css-embedded" as const,
  schema: "svgif.backend/1" as const,
  compile(ir: TimelineIr, opts?: CssCompileOptions): CssCompileResult {
    return compileCss(ir, "css-embedded", opts);
  },
};
