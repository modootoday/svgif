/**
 * Public API shape of `@modootoday/svgif`. Type declarations only.
 * The keys of `SvgifPublicApi` are exactly the public names in
 * [[sot:svgif/public-api]]. `test/public-api.test.ts` fails when a key
 * appears that the record does not list, or when a listed name is missing.
 * Supporting types below are not keys of the public object.
 * Nothing in this file has a runtime value.
 */

import type { BackendId } from "./backend/capability.ts";
import type { Vec2, Vec3 } from "./math/index.ts";
import type { PlayerHandle, PlayerHost, PlayerMode } from "./player/index.ts";
import type { MeshPrimitive, Path3 as Path3Data, TriangleMesh } from "./scene/mesh.ts";

// ---------------------------------------------------------------------------
// Composition and sequences (rule 1)
// ---------------------------------------------------------------------------

export interface CompositionOptions {
  /** Author id of the composition. */
  id: string;
  width: number;
  height: number;
  /** Integer frames per second. Time is `frame / fps`. */
  fps: number;
  durationInFrames: number;
}

export interface Sequence {
  /** First frame of the sequence, inclusive. */
  readonly fromFrame: number;
  readonly durationInFrames: number;
}

export interface Composition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
  /** Sequences in the order they were added. */
  readonly sequences: readonly Sequence[];
  /**
   * Add a sequence that starts at `fromFrame` (inclusive) and lasts
   * `durationInFrames`. `body` runs inside the sampler context, where
   * `interpolate` and `spring` read the current frame.
   */
  sequence(fromFrame: number, durationInFrames: number, body: () => void): void;
}

// ---------------------------------------------------------------------------
// Frame-driven values (rules 2 and 3)
// ---------------------------------------------------------------------------

/** Easing token of the Timeline IR, for example `linear`, `hold` or `cubic-bezier(...)`. */
export type EasingToken = string;

export interface InterpolateOptions {
  easing?: EasingToken;
}

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  from?: number;
  to?: number;
}

// ---------------------------------------------------------------------------
// Compile (rule 5)
// ---------------------------------------------------------------------------

export type CompileBackend = BackendId;

export interface CompileOptions {
  backend: CompileBackend;
}

export interface CompileArtifact {
  /** SVG document. Self-contained except for backend `css-external`. */
  svg: string;
  /** Stylesheet beside the SVG. Set only for backend `css-external`. */
  css?: string;
}

// ---------------------------------------------------------------------------
// Player (rule 6)
// ---------------------------------------------------------------------------

export interface PublicPlayerMountOptions {
  mode: PlayerMode;
}

export interface PublicPlayer {
  mount(host: PlayerHost, composition: Composition, options: PublicPlayerMountOptions): PlayerHandle;
}

// ---------------------------------------------------------------------------
// Browser export (rule 7a)
// ---------------------------------------------------------------------------

export type ExportCodec = "svg" | "webp" | "webm" | "gif";

export interface ExportInBrowserOptions {
  codec: ExportCodec;
}

/** Rejection reason when the browser lacks the path for the requested codec. */
export interface UnsupportedErrorInstance extends Error {
  readonly name: "UnsupportedError";
}

export interface UnsupportedErrorConstructor {
  new (message?: string): UnsupportedErrorInstance;
  readonly prototype: UnsupportedErrorInstance;
}

// ---------------------------------------------------------------------------
// Scene classes (rule 7)
// ---------------------------------------------------------------------------

/** A `Vec3` that the author may also write in place. */
export interface MutableVec3 extends Vec3 {
  set(x: number, y: number, z: number): this;
}

/** Intrinsic XYZ Euler angles in radians. Stored as a quaternion by the scene. */
export interface MutableEuler extends Vec3 {
  set(x: number, y: number, z: number): this;
}

export interface SceneObject {
  id?: string;
  readonly position: MutableVec3;
  readonly rotation: MutableEuler;
  readonly scale: MutableVec3;
  readonly children: readonly SceneObject[];
  add(...children: SceneObject[]): this;
}

export interface SceneInstance extends SceneObject {}
export interface GroupInstance extends SceneObject {}

export interface MeshMaterial {
  /** CSS color of the surface. */
  fill?: string;
}

export interface GeometryInstance {
  readonly primitive: MeshPrimitive;
  /** Triangle list in the node's own space. */
  readonly mesh: TriangleMesh;
}

export interface MeshInstance extends SceneObject {
  readonly geometry: GeometryInstance;
  readonly material: MeshMaterial;
}

export interface Path3Instance extends SceneObject {
  readonly path: Path3Data;
}

/** 2D shape. Points are in the composition's 2D space. */
export interface ShapeInstance extends SceneObject {
  readonly points: readonly Vec2[];
  readonly closed: boolean;
}

export interface PerspectiveCameraInstance extends SceneObject {
  fovY: number;
  aspect: number;
  near: number;
  far: number;
}

export interface OrthographicCameraInstance extends SceneObject {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

export interface LightOptions {
  /** CSS color of the light. */
  color?: string;
  intensity?: number;
}

export interface AmbientLightInstance extends SceneObject {
  color: string;
  intensity: number;
}

export interface DirectionalLightInstance extends SceneObject {
  color: string;
  intensity: number;
}

export interface ExtrudeGeometryOptions {
  depth: number;
  bevelSteps: number;
  bevelSize?: number;
  bevelThickness?: number;
}

// ---------------------------------------------------------------------------
// The public object (rule 8: IIFE `globalThis.svgif`, ESM default and named)
// ---------------------------------------------------------------------------

export interface SvgifPublicApi {
  composition(options: CompositionOptions): Composition;
  interpolate(from: number, to: number, options?: InterpolateOptions): number;
  spring(options: SpringOptions): number;
  renderFrame(composition: Composition, frame: number): string;
  compile(composition: Composition, options: CompileOptions): CompileArtifact;
  player: PublicPlayer;
  exportInBrowser(composition: Composition, options: ExportInBrowserOptions): Promise<Blob>;
  UnsupportedError: UnsupportedErrorConstructor;

  Scene: new () => SceneInstance;
  Group: new () => GroupInstance;
  Mesh: new (geometry: GeometryInstance, material?: MeshMaterial) => MeshInstance;
  Path3: new (points: readonly Vec3[], closed?: boolean) => Path3Instance;
  Shape: new (points: readonly Vec2[], closed?: boolean) => ShapeInstance;
  PerspectiveCamera: new (fovY: number, aspect: number, near: number, far: number) => PerspectiveCameraInstance;
  OrthographicCamera: new (
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number,
  ) => OrthographicCameraInstance;
  AmbientLight: new (options?: LightOptions) => AmbientLightInstance;
  DirectionalLight: new (options?: LightOptions) => DirectionalLightInstance;

  BoxGeometry: new (width?: number, height?: number, depth?: number) => GeometryInstance;
  SphereGeometry: new (radius?: number, widthSegments?: number, heightSegments?: number) => GeometryInstance;
  TorusGeometry: new (
    radius?: number,
    tube?: number,
    radialSegments?: number,
    tubularSegments?: number,
  ) => GeometryInstance;
  ExtrudeGeometry: new (profile: readonly Vec2[], options: ExtrudeGeometryOptions) => GeometryInstance;
  LatheGeometry: new (profile: readonly Vec2[], segments: number) => GeometryInstance;
  ParametricGeometry: new (
    sample: (u: number, v: number) => Vec3,
    segmentsU: number,
    segmentsV: number,
  ) => GeometryInstance;
}
