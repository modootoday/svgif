/**
 * Browser export package.
 * HTML writes the project file. SVG compiles the composition to one document,
 * or to a zip of that document and its stylesheet for css-external.
 * WebP, WebM, and MP4 stay out until a later package. GIF is not a release row.
 * Nothing here opens a socket.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]]
 */

export { exportHtml, htmlExporter } from "./html.ts";
export type { HtmlExportOptions, HtmlExporter, HtmlProject, HtmlRuntime, HtmlStudioSri } from "./html.ts";
export { exportSvg, svgExporter } from "./svg.ts";
export type { SvgBackend, SvgComposition, SvgExportOptions, SvgExporter, SvgKey, SvgNode, SvgTrack } from "./svg.ts";
