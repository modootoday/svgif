/**
 * Frame clock.
 * The only time inputs are the integers `frame` and `fps`.
 * `t` is `frame / fps`. `dt` is `1 / fps`.
 * Easing uses that frame. The discrete spring steps with `dt`.
 * The integrator the IR sampler already calls stays in that sampler.
 * [[sot:svgif/determinism]]
 */

import { easeProgress, parseEasing } from "../ir/easing.ts";
import { stepSpring } from "../ir/spring.ts";

export interface ClockSampleInput {
  frame: number;
  fps: number;
  spanStart?: number;
  spanFrames?: number;
  easing?: string;
  from?: number;
  to?: number;
}

export interface ClockSample {
  frame: number;
  fps: number;
  t: number;
  dt: number;
  eased: number;
  spring: number;
}

function integerAtLeast(value: number, min: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new TypeError(`${label} must be an integer of ${min} or greater`);
  }
  return value;
}

function finiteNumber(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

/** Seconds from frame 0. `t = frame / fps`. */
export function frameSeconds(frame: number, fps: number): number {
  return integerAtLeast(frame, 0, "frame") / integerAtLeast(fps, 1, "fps");
}

/** One frame step. `dt = 1 / fps`. */
export function frameDelta(fps: number): number {
  return 1 / integerAtLeast(fps, 1, "fps");
}

function springFromRest(from: number, to: number, steps: number, fps: number): number {
  let position = from;
  let velocity = 0;
  const dt = frameDelta(fps);
  const count = steps < 0 ? 0 : steps;
  for (let i = 0; i < count; i += 1) {
    const next = stepSpring(position, velocity, to, dt);
    position = next.position;
    velocity = next.velocity;
  }
  return position;
}

/**
 * Sample one integer frame.
 * `eased` follows the span. `spring` steps from `spanStart` with `dt = 1 / fps`.
 * The same inputs return the same numbers on every call.
 */
export function sampleClock(input: ClockSampleInput): ClockSample {
  const frame = integerAtLeast(input.frame, 0, "frame");
  const fps = integerAtLeast(input.fps, 1, "fps");
  const spanStart = integerAtLeast(input.spanStart ?? 0, 0, "spanStart");
  const spanFrames = integerAtLeast(input.spanFrames ?? fps, 1, "spanFrames");
  const from = finiteNumber(input.from ?? 0, "from");
  const to = finiteNumber(input.to ?? 1, "to");
  if (input.easing !== undefined && typeof input.easing !== "string") {
    throw new TypeError("easing must be a string");
  }

  const dt = frameDelta(fps);
  const t = frameSeconds(frame, fps);
  const local = frame - spanStart;
  const steps = local > 0 ? local : 0;
  let progress = 0;
  if (local > 0) progress = local >= spanFrames ? 1 : local / spanFrames;

  const kind = parseEasing(input.easing);
  let eased = from;
  if (progress >= 1) eased = to;
  else if (progress > 0 && kind.kind !== "hold") {
    eased = from + (to - from) * easeProgress(kind, progress);
  }

  return {
    frame,
    fps,
    t,
    dt,
    eased,
    spring: springFromRest(from, to, steps, fps),
  };
}
