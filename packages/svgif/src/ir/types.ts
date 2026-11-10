/** Timeline IR values. One document, absolute frames, no second clock. */

export type IrValue = number | string | number[];

export interface IrKey {
  frame: number;
  value: IrValue;
  easing?: string;
}

export interface IrTrack {
  property: string;
  keys: IrKey[];
}

export interface IrNode {
  id: string;
  tracks: IrTrack[];
}

export interface TimelineIr {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  /**
   * When true, CSS uses an infinite iteration count and SMIL sets
   * `repeatCount="indefinite"`. Absent or false plays once.
   * [[sot:svgif/animation-backends]] [[sot:svgif/determinism]]
   */
  loop?: boolean;
  nodes: IrNode[];
}

/** Node id to property path to a concrete value at one frame. */
export type NodeMap = Record<string, Record<string, IrValue>>;

export interface IrDiagnostic {
  code: "attr-d-mismatch";
  nodeId: string;
  property: string;
  fromFrame: number;
  toFrame: number;
}

export interface SampleReport {
  frame: number;
  nodes: NodeMap;
  diagnostics: IrDiagnostic[];
}
