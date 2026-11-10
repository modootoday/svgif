/**
 * css-external writes file.svg plus file.css.
 * css-embedded writes one SVG whose defs holds one style element.
 * Both use the printer in print.ts.
 * [[sot:svgif/animation-backends]] [[adr:svgif/20261110120300]]
 */

import { sample } from "../../ir/sample.ts";
import { formatUnit } from "../../ir/quantize.ts";
import type { IrValue, TimelineIr } from "../../ir/types.ts";
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

function renderNode(ir: TimelineIr, id: string, sourceId: string): string {
  const values = sample(ir, 0)[sourceId] ?? {};
  const attrs = [`id="${xmlEscape(id)}"`];
  let path = false;
  for (const property of ["attr.d", "attr.fill", "attr.stroke", "attr.opacity"]) {
    const value = values[property];
    const name = PRESENTATION[property];
    if (value === undefined || !name) continue;
    if (property === "attr.d") path = true;
    attrs.push(`${name}="${xmlEscape(presentationValue(property, value))}"`);
  }
  const tag = path ? "path" : "g";
  return `<${tag} ${attrs.join(" ")}/>`;
}

function renderSvg(ir: TimelineIr, css: string, href: string | undefined): string {
  const width = formatUnit(ir.width);
  const height = formatUnit(ir.height);
  const link = href ? `<?xml-stylesheet href="${href}" type="text/css"?>\n` : "";
  const style =
    href || css.length === 0
      ? ""
      : `<defs>\n<style><![CDATA[${css}]]></style>\n</defs>\n`;
  const nodes = ir.nodes
    .map((node) => renderNode(ir, stableSelectorId(node.id), node.id))
    .join("\n");
  const body = `${style}${nodes}`;
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
  const css = printStylesheet(lowered.ir);
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
