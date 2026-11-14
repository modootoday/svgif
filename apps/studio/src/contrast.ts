/** Relative luminance and contrast. Text stays well above 4.5:1. Icons stay well above 3:1. */

const TEXT_FLOOR = 7;
const ICON_FLOOR = 4;

export const TEXT_CONTRAST_FLOOR = TEXT_FLOOR;
export const ICON_CONTRAST_FLOOR = ICON_FLOOR;
export const TEXT_CONTRAST_MINIMUM = 4.5;
export const ICON_CONTRAST_MINIMUM = 3;

export function normalizeHex(value: string): string {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text.slice(1).split("").map((item) => item + item).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  return "";
}

function linearChannel(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(value: string): number | null {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const channels = [1, 3, 5].map((offset) => linearChannel(Number.parseInt(hex.slice(offset, offset + 2), 16)));
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function contrastRatio(left: string, right: string): number {
  const lighter = relativeLuminance(left);
  const darker = relativeLuminance(right);
  if (lighter === null || darker === null) return 0;
  const hi = Math.max(lighter, darker);
  const lo = Math.min(lighter, darker);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Keep the preferred ink when it already clears the floor.
 * Otherwise walk it toward white or black until every backdrop clears that floor.
 */
export function readableInk(backdrop: string, preferred: string, floor = TEXT_FLOOR): string {
  const origin = normalizeHex(preferred);
  const target = normalizeHex(backdrop);
  if (!origin || !target) return origin;
  if (contrastRatio(origin, target) >= floor) return origin;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(origin.slice(offset, offset + 2), 16));
  const originLum = relativeLuminance(origin) ?? 0;
  const lighten = originLum > (relativeLuminance(target) ?? 0);
  for (let step = 1; step <= 255; step += 1) {
    const scale = step / 255;
    const next = channels.map((channel) => {
      const value = lighten ? channel + (255 - channel) * scale : channel * (1 - scale);
      return Math.round(value);
    });
    const candidate = `#${next.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    if (contrastRatio(candidate, target) >= floor) return candidate;
  }
  return lighten ? "#ffffff" : "#000000";
}
