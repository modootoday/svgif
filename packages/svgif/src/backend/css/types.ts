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
}

export interface CssCompileResult {
  id: CssBackendId;
  schema: "svgif.backend/1";
  svg: string;
  css?: string;
  lowered: TimelineIr;
  diagnostics: CssDiagnostic[];
}
