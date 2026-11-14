/**
 * Browser export package.
 * HTML writes the project file. SVG compiles the composition to one document,
 * or to a zip of that document and its stylesheet for css-external.
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
export { exportWebp, paintFrame, renderFrame, webpExporter } from "./webp.ts";
export type { FramePainter, WebpExporter } from "./webp.ts";
export { exportWebm, webmExporter } from "./webm.ts";
export type { WebmExporter } from "./webm.ts";
export { exportMp4, mp4Exporter } from "./mp4.ts";
export type { Mp4Exporter } from "./mp4.ts";
