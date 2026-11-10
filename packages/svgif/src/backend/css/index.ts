/**
 * CSS backends. css-external and css-embedded share printStylesheet.
 * [[sot:svgif/animation-backends]] [[adr:svgif/20261110120300]]
 */

export { compileCss, cssEmbedded, cssExternal } from "./compile.ts";
export { lowerForCss } from "./lower.ts";
export { printStylesheet, stableSelectorId } from "./print.ts";
export type {
  CssBackendId,
  CssCompileOptions,
  CssCompileResult,
  CssDiagnostic,
  CssDiagnosticCode,
} from "./types.ts";
