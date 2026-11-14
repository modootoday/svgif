/**
 * Browser export package.
 * HTML writes the project file. SVG compiles the composition to one document,
 * or to a zip of that document and its stylesheet for css-external.
 * A true loop option repeats that SVG. False or omitted plays once.
 * WebP walks integer frames from renderFrame and writes a RIFF/WEBP file.
 * WebM walks integer frames from renderFrame and writes an EBML file.
 * MP4 walks integer frames from renderFrame and writes an ftyp box and a duration.
 * GIF is not a release row.
 * Nothing here opens a socket.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]] [[adr:svgif/20261110121700]]
 */

export { exportHtml, htmlExporter } from "./html.ts";
export type { HtmlExportOptions, HtmlExporter, HtmlProject, HtmlRuntime, HtmlStudioSri } from "./html.ts";
export { exportSvg, svgExporter } from "./svg.ts";
export type { SvgBackend, SvgComposition, SvgExportOptions, SvgExporter, SvgKey, SvgNode, SvgTrack } from "./svg.ts";
export {
  encodeAnimatedWebp,
  encodeLosslessRgba,
  exportAnimatedWebp,
  exportWebp,
  rasterizeComposition,
  rasterizeSvg,
  renderFrame,
  webpExporter,
  ExportCapabilityError,
} from "./webp.ts";
export type { VideoSample, VideoTrack, WebpExporter } from "./webp.ts";
export { exportAnimatedWebm, exportWebm, webmExporter } from "./webm.ts";
export type { WebmExporter } from "./webm.ts";
export { exportAnimatedMp4, exportMp4, mp4Exporter } from "./mp4.ts";
export type { Mp4Exporter } from "./mp4.ts";
