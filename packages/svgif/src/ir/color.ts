/** 8-bit sRGB colors. Channels interpolate, then each channel is quantized. */

import { quantizeByte } from "./quantize.ts";

export function parseColor(value: string): number[] | null {
  const text = value.trim();
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text);
  if (!hex || !hex[1]) return null;
  const body = hex[1];
  if (body.length <= 4) {
    return [...body].map((digit) => Number.parseInt(digit + digit, 16));
  }
  const channels: number[] = [];
  for (let index = 0; index < body.length; index += 2) {
    channels.push(Number.parseInt(body.slice(index, index + 2), 16));
  }
  return channels;
}

export function formatColor(channels: number[]): string {
  const body = channels
    .map((channel) => quantizeByte(channel).toString(16).padStart(2, "0"))
    .join("");
  return `#${body}`;
}
