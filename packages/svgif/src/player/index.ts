/**
 * Player mount.
 * `static` inserts the CSS or SMIL artifact and leaves that animation running.
 * `scrub` seeks the same artifact. CSS is paused, and its delay is the negative
 * of `frame / fps`. SMIL uses `setCurrentTime` when the host exposes it.
 * When SMIL cannot seek, scrub replaces the SVG by calling `renderFrame`.
 * A seek stores the integer frame. It does not add elapsed wall-clock time.
 * Raster export is not this module. It calls `renderFrame` at integer frames
 * and does not play CSS or SMIL. This file does not encode.
 * [[sot:svgif/animation-backends]]
 */

import { formatUnit } from "../ir/quantize.ts";

export type PlayerMode = "scrub" | "static";

export type PlayerBackend = "css-external" | "css-embedded" | "smil";

export interface PlayerArtifact {
  backend: PlayerBackend;
  svg: string;
  /** Stylesheet beside the SVG. Required for `css-external`. */
  css?: string;
}

export interface PlayerComposition {
  fps: number;
  durationInFrames: number;
  artifact: PlayerArtifact;
  /**
   * One SVG document for an integer frame.
   * Scrub calls this only when SMIL cannot seek.
   */
  renderFrame?: (frame: number) => string;
}

export interface PlayerMountOptions {
  mode: PlayerMode;
  /** First scrub frame. `static` does not seek, so this value is ignored. */
  frame?: number;
}

/** SVG root the host can return after the artifact is inserted. */
export interface SmilTimed {
  setCurrentTime?(seconds: number): void;
}

/** HTML mount point. `innerHTML` receives the artifact. */
export interface PlayerHost {
  innerHTML: string;
  querySelector?(selectors: string): SmilTimed | null;
}

export interface PlayerHandle {
  readonly mode: PlayerMode;
  readonly frame: number;
  seek(frame: number): void;
  unmount(): void;
}

function integerAtLeast(value: number, min: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new TypeError(`${label} must be an integer of ${min} or greater`);
  }
  return value;
}

/** Clamp to `0 .. durationInFrames - 1`. A non-integer is rejected. */
function clampFrame(frame: number, duration: number): number {
  if (typeof frame !== "number" || !Number.isInteger(frame)) {
    throw new TypeError("frame must be an integer");
  }
  if (frame < 0) return 0;
  if (frame >= duration) return duration - 1;
  return frame;
}

function assertHost(host: PlayerHost): void {
  if (host === null || typeof host !== "object") throw new TypeError("host must be an object");
}

function assertArtifact(artifact: PlayerArtifact): void {
  if (artifact === null || typeof artifact !== "object") throw new TypeError("artifact must be an object");
  if (typeof artifact.svg !== "string" || !artifact.svg.includes("<svg")) {
    throw new TypeError("artifact svg must be an SVG document");
  }
  if (artifact.backend === "css-external") {
    if (typeof artifact.css !== "string") throw new TypeError("css-external artifact is missing css");
    return;
  }
  if (artifact.backend === "css-embedded" || artifact.backend === "smil") {
    if (artifact.css !== undefined && typeof artifact.css !== "string") {
      throw new TypeError("artifact css must be a string");
    }
    return;
  }
  throw new TypeError("artifact backend must be css-external, css-embedded, or smil");
}

function artifactMarkup(artifact: PlayerArtifact): string {
  if (artifact.backend === "css-external") {
    return `<style data-svgif-player="artifact">${artifact.css}</style>\n${artifact.svg}`;
  }
  return artifact.svg;
}

/** Negative delay equal to the frame time, except frame 0 which is `0s`. */
function animationDelay(frame: number, fps: number): string {
  if (frame === 0) return "0s";
  return `-${formatUnit(frame / fps)}s`;
}

function seekStyle(delay: string): string {
  return [
    `<style data-svgif-player="seek">`,
    `[data-svgif-player="root"] * {`,
    `  animation-play-state: paused !important;`,
    `  animation-delay: ${delay} !important;`,
    `}`,
    `</style>`,
  ].join("\n");
}

function cssScrubMarkup(artifact: PlayerArtifact, frame: number, fps: number): string {
  const body = artifactMarkup(artifact);
  const delay = animationDelay(frame, fps);
  return `<div data-svgif-player="root">\n${body}\n${seekStyle(delay)}\n</div>`;
}

function svgDocument(svg: string): string {
  if (typeof svg !== "string" || !svg.includes("<svg")) {
    throw new TypeError("renderFrame must return an SVG document");
  }
  return svg;
}

/**
 * Insert `composition.artifact` into `host`.
 * `static` leaves CSS or SMIL running and does not schedule a frame loop.
 * `scrub` seeks to `options.frame` (default 0). Later `seek` calls replace that
 * frame. They do not add time between calls.
 */
export function mount(
  host: PlayerHost,
  composition: PlayerComposition,
  options: PlayerMountOptions,
): PlayerHandle {
  assertHost(host);
  if (composition === null || typeof composition !== "object") {
    throw new TypeError("composition must be an object");
  }
  if (options === null || typeof options !== "object") throw new TypeError("options must be an object");
  if (options.mode !== "scrub" && options.mode !== "static") {
    throw new TypeError('mode must be "scrub" or "static"');
  }
  const fps = integerAtLeast(composition.fps, 1, "fps");
  const duration = integerAtLeast(composition.durationInFrames, 1, "durationInFrames");
  assertArtifact(composition.artifact);

  const mode = options.mode;
  let current = mode === "scrub" ? clampFrame(options.frame ?? 0, duration) : 0;
  let mounted = true;

  const paint = (frame: number): void => {
    const artifact = composition.artifact;
    if (mode === "static") {
      host.innerHTML = artifactMarkup(artifact);
      return;
    }
    if (artifact.backend === "smil") {
      host.innerHTML = artifact.svg;
      const root = host.querySelector?.("svg") ?? null;
      if (typeof root?.setCurrentTime === "function") {
        root.setCurrentTime(frame / fps);
        return;
      }
      host.innerHTML = "";
      const renderFrame = composition.renderFrame;
      if (typeof renderFrame !== "function") {
        throw new TypeError("SMIL cannot seek and renderFrame is missing");
      }
      host.innerHTML = svgDocument(renderFrame(frame));
      return;
    }
    host.innerHTML = cssScrubMarkup(artifact, frame, fps);
  };

  paint(current);

  return {
    mode,
    get frame() {
      return current;
    },
    seek(frame: number) {
      if (mode === "static") throw new TypeError("static mode does not seek");
      if (!mounted) throw new TypeError("player is unmounted");
      current = clampFrame(frame, duration);
      paint(current);
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      host.innerHTML = "";
    },
  };
}

export const player = { mount } as const;
