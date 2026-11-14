/** SVG download. Loop is compiled here. Raster exporters do not take that field. */

import { compile } from "../../../packages/svgif/src/lower/index.ts";
import { exportSvg, type SvgBackend } from "../../../packages/svgif-export/src/svg.ts";
import { rasterComposition, type Composition } from "./composition.ts";

export function svgFile(composition: Composition, backend: SvgBackend): Blob {
  if (composition.loop !== true) return exportSvg(rasterComposition(composition), { backend });
  const compiled = compile(
    {
      fps: composition.fps,
      width: composition.width,
      height: composition.height,
      durationInFrames: composition.durationInFrames,
      loop: true,
      nodes: composition.nodes.map((node) => ({
        id: node.id,
        tracks: node.tracks.map((track) => ({
          property: track.property,
          keys: track.keys.map((key) => ({ ...key })),
        })),
      })),
    },
    backend,
  );
  if (backend === "css-external") {
    return zipStored([
      ["file.svg", compiled.svg],
      ["file.css", compiled.css ?? ""],
    ]);
  }
  return new Blob([compiled.svg], { type: "image/svg+xml" });
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Two stored files. The stylesheet text stays readable in the zip. */
function zipStored(files: Array<[string, string]>): Blob {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);
    const central = new Uint8Array(46 + nameBytes.length);
    const directory = new DataView(central.buffer);
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint32(16, crc, true);
    directory.setUint32(20, data.length, true);
    directory.setUint32(24, data.length, true);
    directory.setUint16(28, nameBytes.length, true);
    directory.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, 0x06054b50, true);
  tail.setUint16(8, files.length, true);
  tail.setUint16(10, files.length, true);
  tail.setUint32(12, centralSize, true);
  tail.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}
