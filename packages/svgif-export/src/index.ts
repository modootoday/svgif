/**
 * Browser export package.
 * This entry is the HTML project file. SVG, WebP, WebM, and MP4 stay out
 * until a later package. GIF is not a release row. Nothing here opens a socket.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]]
 */

export { exportHtml, htmlExporter } from "./html.ts";
export type { HtmlExportOptions, HtmlExporter, HtmlProject, HtmlRuntime, HtmlStudioSri } from "./html.ts";
