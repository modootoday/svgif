/**
 * Discrete damped oscillator for the IR easing token `spring`.
 * The token carries no coefficients. This module uses stiffness 120,
 * damping 14, and mass 1, the coefficients named by the public API sketch.
 * Semi-implicit Euler: acceleration from the current position and velocity,
 * then velocity, then position. dt is 1/fps. One step per integer frame
 * after the span start. Callers quantize the emitted number.
 */

export const IR_SPRING = {
  stiffness: 120,
  damping: 14,
  mass: 1,
} as const;

export interface SpringState {
  position: number;
  velocity: number;
}

export function stepSpring(
  position: number,
  velocity: number,
  target: number,
  dt: number,
  coeff: { stiffness: number; damping: number; mass: number } = IR_SPRING,
): SpringState {
  const acceleration =
    (-coeff.stiffness * (position - target) - coeff.damping * velocity) / coeff.mass;
  const nextVelocity = velocity + acceleration * dt;
  const nextPosition = position + nextVelocity * dt;
  return { position: nextPosition, velocity: nextVelocity };
}

/** Integrate `steps` times from `from` toward `to`, starting at rest. */
export function springAtFrame(from: number, to: number, steps: number, fps: number): number {
  let position = from;
  let velocity = 0;
  const dt = 1 / fps;
  const count = steps < 0 ? 0 : steps;
  for (let i = 0; i < count; i += 1) {
    const next = stepSpring(position, velocity, to, dt);
    position = next.position;
    velocity = next.velocity;
  }
  return position;
}
