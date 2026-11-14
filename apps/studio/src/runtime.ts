/** Pinned project identity. The CDN host is the public library origin. */

export const RUNTIME_VERSION = "0.0.0";
export const GENERATOR = "@modootoday/svgif@0.0.0";
export const CDN_HOST = "cdn.thumly.io";
export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_REVISION = 0;

/** Player source hashed into the pin when the file embeds the player. */
export const PLAYER_SOURCE = "/* @modootoday/svgif player pin 0.0.0 */\n";

export async function sha384Sri(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `sha384-${btoa(binary)}`;
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[+]/, 1)[0]?.split("-", 1)[0]?.split(".").map((part) => Number(part)) ?? [];
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  const aPre = left.includes("-");
  const bPre = right.includes("-");
  if (aPre !== bPre) return aPre ? -1 : 1;
  return 0;
}
