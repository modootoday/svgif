/** Pinned project identity. The CDN host is the public library origin. */

import { PLAYER_BUNDLE } from "./player-bundle.ts";

export const RUNTIME_VERSION = "0.0.0";
export const GENERATOR = "@modootoday/svgif@0.0.0";
export const CDN_HOST = "cdn.thumly.io";
export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_REVISION = 0;

/** Player source hashed into the pin when the file embeds the player. Build replaces the bundle. */
export const PLAYER_SOURCE = PLAYER_BUNDLE;

export async function sha384Sri(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `sha384-${btoa(binary)}`;
}

/** Pages Studio directory. Preset documents and Studio assets resolve here. */
export const PAGES_STUDIO_BASE = "https://thumly.io/studio/";

/**
 * Asset root for the open document.
 * A saved file is not served from the Pages `/studio/` origin, so a relative
 * URL would follow that file. The absolute Pages directory is the root in
 * every case, including a document that is already on that origin.
 */
export function studioRoot(_href: string): string {
  return PAGES_STUDIO_BASE;
}

export function studioFileUrl(root: string, file: string): string {
  const clean = file.replace(/^\.\//, "").replace(/^\//, "");
  return `${root}${clean}`;
}

async function readAsset(fetcher: typeof fetch, url: string): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error("studio asset request failed");
  const text = await response.text();
  if (text.length === 0) throw new Error("studio asset was empty");
  return text;
}

/** Bytes and sha384 digests for the Studio script and stylesheet those URLs serve. */
export async function fetchPagesStudioAssets(
  href: string,
  fetcher: typeof fetch = fetch,
): Promise<{
  jsUrl: string;
  cssUrl: string;
  jsText: string;
  cssText: string;
  studioSri: { js: string; css: string };
}> {
  const root = studioRoot(href);
  const jsUrl = studioFileUrl(root, "studio.js");
  const cssUrl = studioFileUrl(root, "studio.css");
  const [jsText, cssText] = await Promise.all([readAsset(fetcher, jsUrl), readAsset(fetcher, cssUrl)]);
  return {
    jsUrl,
    cssUrl,
    jsText,
    cssText,
    studioSri: {
      js: await sha384Sri(jsText),
      css: await sha384Sri(cssText),
    },
  };
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
