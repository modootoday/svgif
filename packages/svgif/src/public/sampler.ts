/**
 * Sampler context for `interpolate` and `spring`.
 * A sequence body runs inside one frame of one sequence. These functions
 * read that frame from the innermost context and throw outside it.
 * Time is the integer frame and `fps`. Nothing here reads `Date`.
 * [[sot:svgif/public-api]] rules 2 and 3. [[sot:svgif/determinism]]
 */

import { sampleClock } from "../clock/index.ts";
import { IR_SPRING, stepSpring } from "../ir/spring.ts";
import type { InterpolateOptions, SpringOptions } from "../public-types.ts";

export interface SamplerFrame {
  /** Composition frame being drawn. */
  readonly frame: number;
  readonly fps: number;
  /** First frame of the running sequence, inclusive. */
  readonly fromFrame: number;
  readonly durationInFrames: number;
}

const stack: SamplerFrame[] = [];

/** Run `body` with `context` as the current sampler frame. */
export function withSampler<T>(context: SamplerFrame, body: () => T): T {
  stack.push(context);
  try {
    return body();
  } finally {
    stack.pop();
  }
}

function current(name: string): SamplerFrame {
  const context = stack[stack.length - 1];
  if (context === undefined) throw new Error(`${name} is called outside a sequence`);
  return context;
}

function finite(value: number | undefined, fallback: number, label: string): number {
  const number = value ?? fallback;
  if (typeof number !== "number" || !Number.isFinite(number)) throw new TypeError(`${label} must be a finite number`);
  return number;
}

/**
 * Value from `from` to `to` across the running sequence.
 * Progress is `(frame - fromFrame) / durationInFrames`, so the sequence's
 * first frame is `from` and `to` is reached one frame after its last frame.
 */
export function interpolate(from: number, to: number, options: InterpolateOptions = {}): number {
  const context = current("interpolate");
  const easing = options?.easing;
  if (easing !== undefined && typeof easing !== "string") throw new TypeError("easing must be a string");
  return sampleClock({
    frame: context.frame,
    fps: context.fps,
    spanStart: context.fromFrame,
    spanFrames: context.durationInFrames,
    easing,
    from: finite(from, 0, "from"),
    to: finite(to, 1, "to"),
  }).eased;
}

/**
 * Discrete damped oscillator. It starts at rest at `from` on the sequence's
 * frame 0 and takes one semi-implicit Euler step of `dt = 1 / fps` per frame.
 * Defaults: stiffness 120, damping 14, mass 1, from 0, to 1.
 */
export function spring(options: SpringOptions = {}): number {
  const context = current("spring");
  const coeff = {
    stiffness: finite(options?.stiffness, IR_SPRING.stiffness, "stiffness"),
    damping: finite(options?.damping, IR_SPRING.damping, "damping"),
    mass: finite(options?.mass, IR_SPRING.mass, "mass"),
  };
  if (!(coeff.mass > 0)) throw new RangeError("mass must be positive");
  const from = finite(options?.from, 0, "from");
  const to = finite(options?.to, 1, "to");
  const dt = 1 / context.fps;
  const steps = context.frame - context.fromFrame;
  let position = from;
  let velocity = 0;
  for (let step = 0; step < steps; step += 1) {
    const next = stepSpring(position, velocity, to, dt, coeff);
    position = next.position;
    velocity = next.velocity;
  }
  return position;
}
