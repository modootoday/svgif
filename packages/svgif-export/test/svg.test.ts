/**
 * The SVG artifact has a root svg element and the composition width and height.
 * css-external is a zip of that document and its stylesheet.
 * The package does not rasterize and does not open a socket.
 * [[sot:svgif/studio-export]]
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { exportSvg, svgExporter, type SvgComposition } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { composition: SvgComposition };

const BANNED = ["WebSocket", "XMLHttpRequest", "fetch(", "node:http", "node:https", "node:net", "Date", "performance.now", "Math.random", "OffscreenCanvas", "createImageBitmap", "VideoEncoder"];

interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

function cloneComposition(): SvgComposition {
  return JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
}

function decodeAttr(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

/** Parse one XML document into its element tree. Processing instructions are skipped. */
function parseDocument(source: string): XmlElement {
  let index = 0;

  function skipSpace(): void {
    while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  }

  function skipProlog(): void {
    skipSpace();
    while (source.startsWith("<?", index) || source.startsWith("<!--", index)) {
      const end = source.startsWith("<?", index) ? source.indexOf("?>", index) : source.indexOf("-->", index);
      if (end < 0) throw new Error("unclosed prolog");
      index = end + (source.startsWith("<?", index) ? 2 : 3);
      skipSpace();
    }
  }

  function parseElement(): XmlElement {
    if (source[index] !== "<") throw new Error("element expected");
    index += 1;
    const name = /^([A-Za-z_][\w:.-]*)/.exec(source.slice(index));
    if (!name?.[1]) throw new Error("tag name expected");
    const tag = name[1];
    index += tag.length;
    const attrs: Record<string, string> = {};
    while (index < source.length) {
      skipSpace();
      if (source.startsWith("/>", index)) {
        index += 2;
        return { tag, attrs, children: [] };
      }
      if (source[index] === ">") {
        index += 1;
        break;
      }
      const attr = /^([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/.exec(source.slice(index));
      if (!attr?.[1] || attr[2] === undefined) throw new Error("attribute expected");
      attrs[attr[1]] = decodeAttr(attr[2]);
      index += attr[0].length;
    }
    const children: XmlElement[] = [];
    while (index < source.length) {
      if (source.startsWith(`</${tag}>`, index) || source.startsWith(`</${tag} `, index)) {
        const close = source.indexOf(">", index);
        if (close < 0) throw new Error("unclosed element");
        index = close + 1;
        return { tag, attrs, children };
      }
      if (source.startsWith("<![CDATA[", index)) {
        const end = source.indexOf("]]>", index);
        if (end < 0) throw new Error("unclosed cdata");
        index = end + 3;
        continue;
      }
      if (source.startsWith("<!--", index)) {
        const end = source.indexOf("-->", index);
        if (end < 0) throw new Error("unclosed comment");
        index = end + 3;
        continue;
      }
      if (source[index] === "<") {
        children.push(parseElement());
        continue;
      }
      const next = source.indexOf("<", index);
      index = next < 0 ? source.length : next;
    }
    throw new Error("unclosed element");
  }

  skipProlog();
  return parseElement();
}

function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error("zip local header missing");
    const method = view.getUint16(offset + 8, true);
    if (method !== 0) throw new Error("zip method must be store");
    const stored = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extra;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const data = bytes.subarray(dataStart, dataStart + size);
    if ((crc32(data) >>> 0) !== stored) throw new Error(`zip crc mismatch for ${name}`);
    files.set(name, new TextDecoder().decode(data));
    offset = dataStart + size;
  }
  if (view.getUint32(bytes.length - 22, true) !== 0x06054b50) throw new Error("zip end missing");
  return files;
}

function expectRoot(svg: string, composition: SvgComposition): XmlElement {
  const root = parseDocument(svg);
  expect(root.tag).toBe("svg");
  expect(root.attrs.width).toBe(String(composition.width));
  expect(root.attrs.height).toBe(String(composition.height));
  expect(root.attrs.viewBox).toBe(`0 0 ${composition.width} ${composition.height}`);
  expect(root.attrs.xmlns).toBe("http://www.w3.org/2000/svg");
  return root;
}

describe("exportSvg", () => {
  test("parses a css-embedded document with the composition width and height", async () => {
    const composition = cloneComposition();
    const before = JSON.stringify(composition);
    const blob = exportSvg(composition);
    expect(JSON.stringify(composition)).toBe(before);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("image/svg+xml");
    const svg = await blob.text();
    const root = expectRoot(svg, composition);
    expect(root.children.some((child) => child.tag === "defs")).toBe(true);
    expect(svg.includes('id="s-n0"')).toBe(true);
    expect(svg.includes("xml-stylesheet")).toBe(false);
    expect(svgExporter.id).toBe("svg");
    expect(svgExporter.schema).toBe("svgif.exporter/1");
    expect(await svgExporter.export(composition).text()).toBe(svg);
  });

  test("uses the composition size when it is not the fixture size", async () => {
    const composition = cloneComposition();
    composition.width = 160;
    composition.height = 80;
    const svg = await exportSvg(composition, { backend: "css-embedded" }).text();
    expectRoot(svg, composition);
  });

  test("parses a smil document with the same root and dimensions", async () => {
    const composition = cloneComposition();
    const svg = await exportSvg(composition, { backend: "smil" }).text();
    const root = expectRoot(svg, composition);
    const group = root.children.find((child) => child.tag === "g");
    expect(group?.attrs.id).toBe("s-n0");
    expect(group?.children.some((child) => child.tag === "animateTransform")).toBe(true);
  });

  test("packs css-external as a zip of the document and its stylesheet", async () => {
    const composition = cloneComposition();
    const blob = exportSvg(composition, { backend: "css-external" });
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("application/zip");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const files = readZip(bytes);
    expect([...files.keys()].sort()).toEqual(["file.css", "file.svg"]);
    const svg = files.get("file.svg") ?? "";
    expectRoot(svg, composition);
    expect(svg.includes('<?xml-stylesheet href="file.css" type="text/css"?>')).toBe(true);
    expect(files.get("file.css") ?? "").toContain("#s-n0");
  });

  test("rejects a composition that cannot carry width and height", () => {
    expect(() => exportSvg(null as unknown as SvgComposition)).toThrow(/object/);
    const width = cloneComposition();
    width.width = 0;
    expect(() => exportSvg(width)).toThrow(/composition\.width/);
    const height = cloneComposition();
    height.height = 1.5;
    expect(() => exportSvg(height)).toThrow(/composition\.height/);
    const missing = cloneComposition();
    delete (missing as { fps?: number }).fps;
    expect(() => exportSvg(missing)).toThrow(/composition\.fps is required/);
    const extra = cloneComposition() as SvgComposition & { extra?: boolean };
    extra.extra = true;
    expect(() => exportSvg(extra)).toThrow(/not allowed/);
    const nodes = cloneComposition();
    (nodes as { nodes: unknown }).nodes = {};
    expect(() => exportSvg(nodes)).toThrow(/nodes/);
    const duration = cloneComposition();
    duration.durationInFrames = -1;
    expect(() => exportSvg(duration)).toThrow(/durationInFrames/);
  });

  test("rejects a backend that is not an SVG compile target", () => {
    const composition = cloneComposition();
    expect(() => exportSvg(composition, { backend: "gif" as "smil" })).toThrow(/backend/);
    expect(() => exportSvg(composition, { backend: "webp" as "smil" })).toThrow(/backend/);
  });

  test("does not rasterize and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "svg.ts"]);
    const source = readFileSync(resolve(srcDir, "svg.ts"), "utf8");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes("GIF is not a release row")).toBe(true);
    expect(source.includes("[[sot:svgif/studio-export]]")).toBe(true);
  });
});
