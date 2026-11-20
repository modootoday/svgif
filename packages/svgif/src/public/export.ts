/// <reference lib="dom" />
/**
 * `exportInBrowser` and `UnsupportedError`.
 * The composition is baked to Timeline IR here. Encoding is the export
 * package's: SVG through `exportSvg`, WebP and WebM by rasterizing integer
 * frames in the page. GIF is not a release row, so it rejects.
 * A missing raster or codec path rejects with `UnsupportedError`.
 * Nothing here opens a socket. The export sources use DOM types, so this
 * file references the DOM library; the rest of the engine does not use it.
 * [[sot:svgif/public-api]] rule 7a. [[sot:svgif/studio-export]]
 */

import {
  ExportCapabilityError,
  exportAnimatedWebm,
  exportAnimatedWebp,
  exportSvg,
} from "../../../svgif-export/src/index.ts";
import type { Composition, ExportInBrowserOptions } from "../public-types.ts";
import { bakeComposition } from "./composition.ts";

/** The browser lacks the path for the requested codec. */
export class UnsupportedError extends Error {
  override readonly name = "UnsupportedError" as const;

  constructor(message = "This browser cannot export this codec.") {
    super(message);
  }
}

const CODECS = ["svg", "webp", "webm", "gif"] as const;

export async function exportInBrowser(composition: Composition, options: ExportInBrowserOptions): Promise<Blob> {
  if (options === null || typeof options !== "object") throw new TypeError("exportInBrowser expects options");
  const codec = options.codec;
  if (!(CODECS as readonly string[]).includes(codec)) throw new TypeError("codec must be svg, webp, webm, or gif");
  if (codec === "gif") throw new UnsupportedError("GIF export is not available.");
  const { ir } = bakeComposition(composition);
  try {
    if (codec === "svg") return exportSvg(ir);
    if (codec === "webp") return await exportAnimatedWebp(ir);
    return await exportAnimatedWebm(ir);
  } catch (error) {
    if (error instanceof ExportCapabilityError) throw new UnsupportedError(error.message);
    throw error;
  }
}
