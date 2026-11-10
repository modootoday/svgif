/**
 * Emit quantization. Four decimal places, half away from zero.
 * Path coordinates and transform numbers use this at emit time.
 * The spring integrator keeps IEEE-754 state and quantizes only the number it returns.
 */

const SCALE = 1e4;

export function quantize1e4(n: number): number {
  if (!Number.isFinite(n)) return n;
  const negative = n < 0;
  const rounded = Math.floor(Math.abs(n) * SCALE + 0.5);
  const out = rounded / SCALE;
  if (out === 0) return 0;
  return negative ? -out : out;
}

/** 8-bit sRGB channel, half away from zero, clamped to 0..255. */
export function quantizeByte(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 255) return 255;
  return Math.floor(n + 0.5);
}

export function formatUnit(n: number): string {
  const q = quantize1e4(n);
  const text = q.toFixed(4).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}
