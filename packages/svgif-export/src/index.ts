/**
 * Browser export package.
 * HTML writes the project file. SVG compiles the composition to one document,
 * or to a zip of that document and its stylesheet for css-external.
 * A true loop option repeats that SVG. False or omitted plays once.
 * WebP rasterizes integer frames and writes a RIFF/WEBP file with one VP8L picture per frame.
 * WebM muxes encoded frames into an EBML file.
 * MP4 muxes encoded frames into a file that begins with an ftyp box.
 * GIF is not a release row.
 * Nothing here opens a socket.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]] [[adr:svgif/20261110121700]]
 * [[sot:svgif/animation-ir]] [[adr:svgif/20261114074819]]
 */

export { exportHtml, htmlExporter } from "./html.ts";
export type { HtmlExportOptions, HtmlExporter, HtmlProject, HtmlRuntime, HtmlStudioSri } from "./html.ts";
export { exportSvg, svgExporter } from "./svg.ts";
export type { SvgBackend, SvgComposition, SvgExportOptions, SvgExporter, SvgKey, SvgNode, SvgTrack } from "./svg.ts";
export {
  encodeAnimatedWebp,
  encodeLosslessRgba,
  exportAnimatedWebp,
  rasterizeComposition,
  rasterizeSvg,
  renderFrame,
  webpExporter,
  ExportCapabilityError,
} from "./webp.ts";
export type { VideoSample, VideoTrack, WebpExporter } from "./webp.ts";
export { exportAnimatedWebm, webmExporter } from "./webm.ts";
export type { WebmExporter } from "./webm.ts";
export { exportAnimatedMp4, mp4Exporter } from "./mp4.ts";
export type { Mp4Exporter } from "./mp4.ts";
