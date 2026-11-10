/**
 * Browser export package.
 * HTML writes the project file. SVG compiles the composition to one document,
 * or to a zip of that document and its stylesheet for css-external.
 * WebP walks integer frames from renderFrame and writes a RIFF/WEBP file.
 * WebM walks integer frames from renderFrame and writes an EBML file.
 * MP4 stays out until a later package. GIF is not a release row.
 * Nothing here opens a socket.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]]
 */

export { exportHtml, htmlExporter } from "./html.ts";
export type { HtmlExportOptions, HtmlExporter, HtmlProject, HtmlRuntime, HtmlStudioSri } from "./html.ts";
export { exportSvg, svgExporter } from "./svg.ts";
export type { SvgBackend, SvgComposition, SvgExportOptions, SvgExporter, SvgKey, SvgNode, SvgTrack } from "./svg.ts";
export { exportWebp, renderFrame, webpExporter } from "./webp.ts";
export type { WebpExporter } from "./webp.ts";
export { exportWebm, webmExporter } from "./webm.ts";
export type { WebmExporter } from "./webm.ts";
