/**
 * The `presentation` object of a revision 1 project, and the head lines written from it.
 * This module writes tag text. It does not encode a poster or a video and does not open a socket.
 * The tag list is the one `scripts/ci/render-external-embed.mjs` writes for a hosted work.
 * [[sot:svgif/external-embed]] [[sot:svgif/html-project]]
 */

/** The source of the card meta and the oEmbed files. Present only at `schemaRevision` 1. */
export interface HtmlPresentation {
  workId: string;
  title: string;
  description: string;
  canonicalBase?: string;
  card?: { video?: "none" | "mp4" | "webm" };
  posterFrame?: number;
  authorName?: string;
  authorUrl?: string;
  twitterPlayer?: boolean;
  oembedType?: "rich" | "video";
}

const PRESENTATION_KEYS = ["workId", "title", "description"];
const PRESENTATION_OPTIONAL = [
  "canonicalBase",
  "card",
  "posterFrame",
  "authorName",
  "authorUrl",
  "twitterPlayer",
  "oembedType",
];
const WORK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_BASE = /^https:\/\/[^/?#]+$/;

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string, optional: string[]): void {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key) && !optional.includes(key)) throw new TypeError(`${label}.${key} is not allowed`);
  }
}

function attribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function assertPresentation(value: unknown): HtmlPresentation {
  const label = "project.presentation";
  const source = assertObject(value, label);
  exactKeys(source, PRESENTATION_KEYS, label, PRESENTATION_OPTIONAL);
  if (typeof source.workId !== "string" || source.workId.length > 63 || !WORK_ID.test(source.workId)) {
    throw new TypeError(`${label}.workId must be lowercase letters, digits, and single hyphens`);
  }
  if (typeof source.title !== "string" || source.title.length === 0) throw new TypeError(`${label}.title must be a non-empty string`);
  if (typeof source.description !== "string") throw new TypeError(`${label}.description must be a string`);
  const presentation: HtmlPresentation = { workId: source.workId, title: source.title, description: source.description };
  if (source.canonicalBase !== undefined) {
    if (typeof source.canonicalBase !== "string" || !CANONICAL_BASE.test(source.canonicalBase)) {
      throw new TypeError(`${label}.canonicalBase must be an https origin`);
    }
    presentation.canonicalBase = source.canonicalBase;
  }
  let video: "none" | "mp4" | "webm" = "none";
  if (source.card !== undefined) {
    const card = assertObject(source.card, `${label}.card`);
    exactKeys(card, [], `${label}.card`, ["video"]);
    if (card.video !== undefined) {
      if (card.video !== "none" && card.video !== "mp4" && card.video !== "webm") {
        throw new TypeError(`${label}.card.video must be none, mp4, or webm`);
      }
      video = card.video;
      presentation.card = { video };
    } else {
      presentation.card = {};
    }
  }
  if (source.posterFrame !== undefined) {
    if (!Number.isInteger(source.posterFrame) || (source.posterFrame as number) < 0) {
      throw new TypeError(`${label}.posterFrame must be a frame number`);
    }
    presentation.posterFrame = source.posterFrame as number;
  }
  if (source.authorName !== undefined) {
    if (typeof source.authorName !== "string" || source.authorName.length === 0) throw new TypeError(`${label}.authorName must be a non-empty string`);
    presentation.authorName = source.authorName;
  }
  if (source.authorUrl !== undefined) {
    if (typeof source.authorUrl !== "string" || !source.authorUrl.startsWith("https://")) throw new TypeError(`${label}.authorUrl must be an https URL`);
    presentation.authorUrl = source.authorUrl;
  }
  if (source.twitterPlayer !== undefined) {
    if (typeof source.twitterPlayer !== "boolean") throw new TypeError(`${label}.twitterPlayer must be a boolean`);
    presentation.twitterPlayer = source.twitterPlayer;
  }
  if (source.oembedType !== undefined) {
    if (source.oembedType !== (video === "none" ? "rich" : "video")) {
      throw new TypeError(`${label}.oembedType must agree with card.video`);
    }
    presentation.oembedType = source.oembedType;
  }
  return presentation;
}

/**
 * Head lines for a project that has `presentation`.
 * The three `svgif:` tags are always written. The card tags and the oEmbed links are absolute,
 * so they are written only when `canonicalBase` is set.
 */
export function presentationHead(presentation: HtmlPresentation | undefined, composition: Record<string, unknown>): string[] {
  if (!presentation) return [];
  const meta = (kind: "name" | "property", key: string, content: string): string =>
    `<meta ${kind}="${attribute(key)}" content="${attribute(content)}">`;
  const lines = [
    meta("name", "svgif:title", presentation.title),
    meta("name", "svgif:description", presentation.description),
    meta("name", "svgif:work", presentation.workId),
  ];
  const base = presentation.canonicalBase;
  if (base === undefined) return lines;
  const work = `${base}/works/${presentation.workId}`;
  const video = presentation.card?.video ?? "none";
  const width = String(composition.width);
  const height = String(composition.height);
  lines.push(
    meta("property", "og:title", presentation.title),
    meta("property", "og:description", presentation.description),
    meta("property", "og:image", `${work}/card.webp`),
    meta("property", "og:image:type", "image/webp"),
    meta("property", "og:type", video === "none" ? "website" : "video.other"),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", presentation.title),
    meta("name", "twitter:description", presentation.description),
    meta("name", "twitter:image", `${work}/card.webp`),
  );
  if (video !== "none") {
    lines.push(
      meta("property", "og:video", `${work}/card.${video}`),
      meta("property", "og:video:type", video === "mp4" ? "video/mp4" : "video/webm"),
      meta("property", "og:video:width", width),
      meta("property", "og:video:height", height),
    );
  }
  if (presentation.twitterPlayer === true) {
    lines.push(
      meta("name", "twitter:player", `${base}/embed/${presentation.workId}/`),
      meta("name", "twitter:player:width", width),
      meta("name", "twitter:player:height", height),
    );
  }
  lines.push(
    `<link rel="alternate" type="application/json+oembed" href="${attribute(`${work}/oembed.json`)}" title="${attribute(presentation.title)}">`,
    `<link rel="alternate" type="text/xml+oembed" href="${attribute(`${work}/oembed.xml`)}" title="${attribute(presentation.title)}">`,
  );
  return lines;
}
