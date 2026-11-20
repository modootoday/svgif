/**
 * Public entry of `@modootoday/svgif`.
 * `svgif` is the object of [[sot:svgif/public-api]]. Its keys are exactly
 * the keys of `SvgifPublicApi` in `public-types.ts`. The default export and
 * the named exports are the same values (rule 8). Internal contracts such as
 * C4 `compile(ir, backend)` are not keys of this object.
 * [[sot:svgif/public-api]] [[sot:svgif/architecture]]
 */

import { mount } from "./player/index.ts";
import type { Composition, PublicPlayer, PublicPlayerMountOptions, SvgifPublicApi } from "./public-types.ts";
import type { PlayerHandle, PlayerHost } from "./player/index.ts";
import {
  compile as compileComposition,
  composition as createComposition,
  renderFrame as renderCompositionFrame,
} from "./public/composition.ts";
import { exportInBrowser as exportCompositionInBrowser, UnsupportedError as UnsupportedErrorClass } from "./public/export.ts";
import * as objects from "./public/objects.ts";
import { interpolate as interpolateValue, spring as springValue } from "./public/sampler.ts";

/** `static` inserts the SMIL artifact. `scrub` seeks it, or calls `renderFrame` when SMIL cannot seek. */
const publicPlayer: PublicPlayer = {
  mount(host: PlayerHost, composition: Composition, options: PublicPlayerMountOptions): PlayerHandle {
    const artifact = compileComposition(composition, { backend: "smil" });
    return mount(
      host,
      {
        fps: composition.fps,
        durationInFrames: composition.durationInFrames,
        artifact: { backend: "smil", svg: artifact.svg },
        renderFrame: (frame: number) => renderCompositionFrame(composition, frame),
      },
      { mode: options?.mode },
    );
  },
};

const svgif: SvgifPublicApi = {
  composition: createComposition,
  interpolate: interpolateValue,
  spring: springValue,
  renderFrame: renderCompositionFrame,
  compile: compileComposition,
  player: publicPlayer,
  exportInBrowser: exportCompositionInBrowser,
  UnsupportedError: UnsupportedErrorClass,

  Scene: objects.Scene,
  Group: objects.Group,
  Mesh: objects.Mesh,
  Path3: objects.Path3,
  Shape: objects.Shape,
  PerspectiveCamera: objects.PerspectiveCamera,
  OrthographicCamera: objects.OrthographicCamera,
  AmbientLight: objects.AmbientLight,
  DirectionalLight: objects.DirectionalLight,

  BoxGeometry: objects.BoxGeometry,
  SphereGeometry: objects.SphereGeometry,
  TorusGeometry: objects.TorusGeometry,
  ExtrudeGeometry: objects.ExtrudeGeometry,
  LatheGeometry: objects.LatheGeometry,
  ParametricGeometry: objects.ParametricGeometry,
};

export default svgif;

export const {
  composition,
  interpolate,
  spring,
  renderFrame,
  compile,
  player,
  exportInBrowser,
  UnsupportedError,
  Scene,
  Group,
  Mesh,
  Path3,
  Shape,
  PerspectiveCamera,
  OrthographicCamera,
  AmbientLight,
  DirectionalLight,
  BoxGeometry,
  SphereGeometry,
  TorusGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  ParametricGeometry,
} = svgif;

export type * from "./public-types.ts";
