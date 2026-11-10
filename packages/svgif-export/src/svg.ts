/**
 * SVG export.
 * The Studio preset compiles the composition to one css-embedded document.
 * smil is the same document when the caller picks that backend.
 * css-external is a zip of the document and its stylesheet, still built here.
 * This module does not rasterize. It does not encode WebP, WebM, or MP4.
 * GIF is not a release row. The function returns a Blob and does not open a socket.
 * [[sot:svgif/studio-export]]
 */

import { compile } from "../../svgif/src/lower/index.ts";

export type SvgBackend = "css-embedded" | "smil" | "css-external";

export interface SvgKey {
  frame: number;
  value: number | string | number[];
  easing?: string;
}

export interface SvgTrack {
  property: string;
  keys: SvgKey[];
}

export interface SvgNode {
  id: string;
  tracks: SvgTrack[];
}

export interface SvgComposition {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  nodes: SvgNode[];
}

export interface SvgExportOptions {
  /** Studio preset is css-embedded. smil and css-external are explicit. */
  backend?: SvgBackend;
}

export interface SvgExporter {
  readonly id: "svg";
  readonly schema: "svgif.exporter/1";
  export(composition: SvgComposition, options?: SvgExportOptions): Blob;
}

const COMPOSITION_KEYS = ["fps", "width", "height", "durationInFrames", "nodes"];
const ZIP_SVG = "file.svg";
const ZIP_CSS = "file.css";

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const present = Object.keys(value);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
  for (const key of present) {
    if (!keys.includes(key)) throw new TypeError(`${label}.${key} is not allowed`);
  }
}

function assertPositiveInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function assertComposition(value: unknown): SvgComposition {
  const composition = assertObject(value, "composition");
  exactKeys(composition, COMPOSITION_KEYS, "composition");
  if (!Array.isArray(composition.nodes)) throw new TypeError("composition.nodes must be an array");
  return {
    fps: assertPositiveInt(composition.fps, "composition.fps"),
    width: assertPositiveInt(composition.width, "composition.width"),
    height: assertPositiveInt(composition.height, "composition.height"),
    durationInFrames: assertPositiveInt(composition.durationInFrames, "composition.durationInFrames"),
    nodes: composition.nodes as SvgNode[],
  };
}

function assertBackend(value: unknown): SvgBackend {
  if (value === undefined) return "css-embedded";
  if (value === "css-embedded" || value === "smil" || value === "css-external") return value;
  throw new TypeError("backend must be css-embedded, smil, or css-external");
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    const localView = new DataView(local.buffer);
    u32(localView, 0, 0x04034b50);
    u16(localView, 4, 20);
    u16(localView, 6, 0);
    u16(localView, 8, 0);
    u16(localView, 10, 0);
    u16(localView, 12, 0);
    u32(localView, 14, crc);
    u32(localView, 18, file.data.length);
    u32(localView, 22, file.data.length);
    u16(localView, 26, name.length);
    u16(localView, 28, 0);
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 8, 0);
    u16(centralView, 10, 0);
    u16(centralView, 12, 0);
    u16(centralView, 14, 0);
    u32(centralView, 16, crc);
    u32(centralView, 20, file.data.length);
    u32(centralView, 24, file.data.length);
    u16(centralView, 28, name.length);
    u16(centralView, 30, 0);
    u16(centralView, 32, 0);
    u16(centralView, 34, 0);
    u16(centralView, 36, 0);
    u32(centralView, 38, 0);
    u32(centralView, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  let centralSize = 0;
  for (const part of centrals) centralSize += part.length;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 4, 0);
  u16(endView, 6, 0);
  u16(endView, 8, files.length);
  u16(endView, 10, files.length);
  u32(endView, 12, centralSize);
  u32(endView, 16, offset);
  u16(endView, 20, 0);
  const out = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of locals) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centrals) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(end, cursor);
  return out;
}

function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml" });
}

/** Compile the composition to an SVG document, or to a zip when the backend is css-external. */
export function exportSvg(composition: SvgComposition, options: SvgExportOptions = {}): Blob {
  const document = assertComposition(composition);
  const backend = assertBackend(options.backend);
  const compiled = compile(document, backend);
  if (backend === "css-external") {
    const css = compiled.css ?? "";
    const bytes = zipStore([
      { name: ZIP_SVG, data: new TextEncoder().encode(compiled.svg) },
      { name: ZIP_CSS, data: new TextEncoder().encode(css) },
    ]);
    return new Blob([bytes], { type: "application/zip" });
  }
  return svgBlob(compiled.svg);
}

export const svgExporter: SvgExporter = {
  id: "svg",
  schema: "svgif.exporter/1",
  export(composition: SvgComposition, options?: SvgExportOptions): Blob {
    return exportSvg(composition, options);
  },
};
