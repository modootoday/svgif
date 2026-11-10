/** CSS backend results. One printer, two destinations. */

import type { TimelineIr } from "../../ir/types.ts";

export type CssBackendId = "css-external" | "css-embedded";

export type CssDiagnosticCode = "lowered" | "matrix3d-omitted";

export interface CssDiagnostic {
  code: CssDiagnosticCode;
  nodeId: string;
  property: string;
}

export interface CssCompileOptions {
  /** Basename of the external pair. The SVG links `<fileBase>.css`. Default `file`. */
  fileBase?: string;
  /**
   * When true, `animation-iteration-count` is `infinite`.
   * When absent or false, the count is 1.
   * Callers pass this. The compiler does not choose it from a document category.
   */
  loop?: boolean;
}

export interface CssCompileResult {
  id: CssBackendId;
  schema: "svgif.backend/1";
  svg: string;
  css?: string;
  lowered: TimelineIr;
  diagnostics: CssDiagnostic[];
}
