#!/usr/bin/env node
// Project presentation in, static oEmbed and card meta out.
// No "?url=" endpoint and no second copy of the title or the size.
import { createHash } from "node:crypto";

const WORK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXACT_VERSION = /^\/svgif\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\/[^/?#]+$/;
const ALIAS_PATH = /^\/svgif\/(?:latest|(?:0|[1-9]\d*))\/[^/?#]+$/;
const SHA384 = /^sha384-[A-Za-z0-9+/]{64}$/;
const SECONDARY_HOST = /(^|\.)(?:jsdelivr\.net|unpkg\.com)$/i;

// Documentation URLs only. They are not the origin for cdn.thumly.io.
// SVGIF_CDN_BASE stays unset. This module does not read it.
export const secondaryDocUrls = [
  "https://cdn.jsdelivr.net/npm/@modootoday/svgif",
  "https://unpkg.com/@modootoday/svgif",
];

function fail(message) {
  throw new Error(message);
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function requirePresentation(project) {
  const presentation = project?.presentation;
  if (!presentation || typeof presentation !== "object") fail("missing presentation");
  if (!WORK_ID.test(presentation.workId ?? "")) fail("workId");
  if (typeof presentation.title !== "string" || presentation.title.length === 0) fail("title");
  if (typeof presentation.description !== "string") fail("description");
  const width = project?.composition?.width;
  const height = project?.composition?.height;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    fail("composition size");
  }
  return { presentation, width, height };
}

function videoKind(presentation) {
  const video = presentation.card?.video ?? "none";
  if (video !== "none" && video !== "mp4" && video !== "webm") fail("card.video");
  const derived = video === "none" ? "rich" : "video";
  if (presentation.oembedType && presentation.oembedType !== derived) fail("oembedType disagrees with card.video");
  return { video, type: derived };
}

export function urlsFor(project) {
  const { presentation } = requirePresentation(project);
  const base = String(presentation.canonicalBase ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) fail("canonicalBase");
  const id = presentation.workId;
  return {
    work: `${base}/works/${id}/`,
    embed: `${base}/embed/${id}/`,
    oembed: `${base}/works/${id}/oembed.json`,
    oembedXml: `${base}/works/${id}/oembed.xml`,
    image: `${base}/works/${id}/card.webp`,
    video: presentation.card?.video && presentation.card.video !== "none"
      ? `${base}/works/${id}/card.${presentation.card.video}`
      : "",
  };
}

export function oembedDocument(project) {
  const { presentation, width, height } = requirePresentation(project);
  const { type } = videoKind(presentation);
  const urls = urlsFor(project);
  const html = `<iframe src="${escapeText(urls.embed)}" width="${width}" height="${height}" style="width:100%;aspect-ratio:${width}/${height};border:0" title="${escapeText(presentation.title)}"></iframe>`;
  if (html.includes("?url=") || urls.oembed.includes("?url=")) fail("query endpoint");
  const doc = {
    version: "1.0",
    type,
    title: presentation.title,
    provider_name: "Thumly",
    provider_url: String(presentation.canonicalBase).replace(/\/$/, "") + "/",
    width,
    height,
    html,
    thumbnail_url: urls.image,
    thumbnail_width: width,
    thumbnail_height: height,
  };
  if (presentation.authorName) doc.author_name = presentation.authorName;
  if (presentation.authorUrl) doc.author_url = presentation.authorUrl;
  return doc;
}

export function metaTags(project) {
  const { presentation, width, height } = requirePresentation(project);
  const { video } = videoKind(presentation);
  const urls = urlsFor(project);
  const tags = [
    ["name", "svgif:title", presentation.title],
    ["name", "svgif:description", presentation.description],
    ["name", "svgif:work", presentation.workId],
    ["property", "og:title", presentation.title],
    ["property", "og:description", presentation.description],
    ["property", "og:image", urls.image],
    ["property", "og:image:type", "image/webp"],
    ["property", "og:type", video === "none" ? "website" : "video.other"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", presentation.title],
    ["name", "twitter:description", presentation.description],
    ["name", "twitter:image", urls.image],
  ];
  if (video !== "none") {
    const mime = video === "mp4" ? "video/mp4" : "video/webm";
    tags.push(
      ["property", "og:video", urls.video],
      ["property", "og:video:type", mime],
      ["property", "og:video:width", String(width)],
      ["property", "og:video:height", String(height)],
    );
  }
  if (presentation.twitterPlayer === true) {
    tags.push(
      ["name", "twitter:player", urls.embed],
      ["name", "twitter:player:width", String(width)],
      ["name", "twitter:player:height", String(height)],
    );
  }
  return tags;
}

function sha384Integrity(bytes) {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

function snippetFields(html) {
  const src = String(html).match(/\ssrc="([^"]*)"/);
  const integrity = String(html).match(/\sintegrity="([^"]*)"/);
  const crossorigin = String(html).match(/\scrossorigin="([^"]*)"/);
  if (!src) fail("snippet src");
  return {
    src: src[1],
    integrity: integrity ? integrity[1] : "",
    crossorigin: crossorigin ? crossorigin[1] : "",
  };
}

export function assertCdnSnippet(html) {
  const fields = snippetFields(html);
  let url;
  try {
    url = new URL(fields.src);
  } catch {
    fail("snippet url");
  }
  if (url.protocol !== "https:") fail("snippet https");
  if (SECONDARY_HOST.test(url.hostname)) fail("secondary origin");
  if (EXACT_VERSION.test(url.pathname)) {
    if (!SHA384.test(fields.integrity)) fail("exact-version integrity");
    if (fields.crossorigin !== "anonymous") fail("crossorigin");
    return fields;
  }
  if (ALIAS_PATH.test(url.pathname)) {
    if (fields.integrity) fail("alias integrity");
    return fields;
  }
  fail("snippet path");
}

export function embedSnippet({ src, integrity } = {}) {
  if (typeof src !== "string" || src.length === 0) fail("snippet src");
  const attrs = [`src="${escapeText(src)}"`];
  if (integrity) {
    attrs.push(`integrity="${escapeText(integrity)}"`, 'crossorigin="anonymous"');
  }
  const html = `<script type="module" ${attrs.join(" ")}></script>`;
  assertCdnSnippet(html);
  return html;
}

export function embedPage(project) {
  const { presentation, width, height } = requirePresentation(project);
  const title = escapeText(presentation.title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'self'">
<title>${title}</title>
</head>
<body>
<main data-svgif-embed="player" style="aspect-ratio:${width}/${height};width:min(100%,${width}px)">
<button type="button" data-svgif-edit="off">Edit</button>
</main>
</body>
</html>
`;
}

function selfTest() {
  const project = {
    composition: { width: 320, height: 180 },
    presentation: {
      workId: "box-spin",
      title: "Box spin",
      description: "A short SVG animation.",
      canonicalBase: "https://thumly.io/svgif",
      card: { video: "none" },
      twitterPlayer: false,
    },
  };
  const doc = oembedDocument(project);
  if (doc.provider_name !== "Thumly") fail("provider_name");
  if (doc.type !== "rich" || doc.version !== "1.0") fail("rich type");
  if (!doc.html.startsWith("<iframe ") || doc.html.includes("studio.js") || doc.html.includes("?url=")) {
    fail("iframe");
  }
  if (!doc.html.includes("https://thumly.io/svgif/embed/box-spin/")) fail("embed url");
  if (doc.width !== 320 || doc.thumbnail_url !== "https://thumly.io/svgif/works/box-spin/card.webp") {
    fail("thumbnail");
  }
  const names = metaTags(project).map((tag) => tag[1]);
  for (const required of ["og:title", "og:description", "og:image", "twitter:card"]) {
    if (!names.includes(required)) fail(`missing ${required}`);
  }
  if (names.includes("twitter:player") || names.includes("og:video")) fail("optional player was emitted");
  const page = embedPage(project);
  if (!page.includes('data-svgif-embed="player"') || page.includes("studio.js") || page.includes("frame-ancestors")) {
    fail("embed page");
  }
  project.presentation.card = { video: "mp4" };
  project.presentation.twitterPlayer = true;
  const videoDoc = oembedDocument(project);
  if (videoDoc.provider_name !== "Thumly") fail("provider_name");
  if (videoDoc.type !== "video") fail("video type");
  const videoNames = metaTags(project).map((tag) => tag[1]);
  if (!videoNames.includes("og:video") || !videoNames.includes("twitter:player")) fail("opt-in player");

  const pinnedBytes = Buffer.from("svgif-exact-version-bytes");
  const integrity = sha384Integrity(pinnedBytes);
  if (!SHA384.test(integrity)) fail("sha384");
  const pinnedSrc = "https://cdn.example.invalid/svgif/1.2.3/svgif.mjs";
  const pinned = embedSnippet({ src: pinnedSrc, integrity });
  const pinnedFields = assertCdnSnippet(pinned);
  if (pinnedFields.src !== pinnedSrc || pinnedFields.integrity !== integrity) fail("exact-version integrity");
  if (pinnedFields.crossorigin !== "anonymous" || !pinned.includes('crossorigin="anonymous"')) fail("crossorigin");
  if (pinned.includes("cdn.thumly.io") || pinned.includes("uploaded")) fail("cdn claim");

  const savedBase = process.env.SVGIF_CDN_BASE;
  process.env.SVGIF_CDN_BASE = "https://cdn.thumly.io/svgif";
  try {
    const ignored = embedSnippet({ src: pinnedSrc, integrity });
    if (ignored.includes("cdn.thumly.io")) fail("cdn claim");
  } finally {
    if (savedBase === undefined) delete process.env.SVGIF_CDN_BASE;
    else process.env.SVGIF_CDN_BASE = savedBase;
  }

  expectFail("exact-version integrity", () => embedSnippet({ src: pinnedSrc }));
  expectFail("exact-version integrity", () => assertCdnSnippet(
    `<script type="module" src="${pinnedSrc}"></script>`,
  ));
  expectFail("crossorigin", () => assertCdnSnippet(
    `<script type="module" src="${pinnedSrc}" integrity="${integrity}"></script>`,
  ));
  expectFail("alias integrity", () => embedSnippet({
    src: "https://cdn.example.invalid/svgif/latest/svgif.mjs",
    integrity,
  }));
  expectFail("alias integrity", () => embedSnippet({
    src: "https://cdn.example.invalid/svgif/1/svgif.mjs",
    integrity,
  }));
  const latest = embedSnippet({ src: "https://cdn.example.invalid/svgif/latest/svgif.mjs" });
  if (latest.includes("integrity=") || latest.includes("cdn.thumly.io")) fail("alias integrity");

  if (secondaryDocUrls.length !== 2) fail("secondary origin");
  for (const docUrl of secondaryDocUrls) {
    const host = new URL(docUrl).hostname;
    if (host === "cdn.thumly.io" || !SECONDARY_HOST.test(host)) fail("secondary origin");
    expectFail("secondary origin", () => embedSnippet({
      src: `${docUrl}@1.2.3/svgif.mjs`,
      integrity,
    }));
  }

  console.log("external-embed self-test ok");
}

function expectFail(label, fn) {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error && error.message === label) return;
  }
  fail(label);
}

if (process.argv.includes("--self-test")) {
  selfTest();
}
