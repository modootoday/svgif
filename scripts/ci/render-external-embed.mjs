#!/usr/bin/env node
// Project presentation in, static oEmbed and card meta out.
// No "?url=" endpoint and no second copy of the title or the size.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { validateContract } from "./check-schema.mjs";

const WORK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXACT_VERSION = /^\/svgif\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\/[^/?#]+$/;
const ALIAS_PATH = /^\/svgif\/(?:latest|(?:0|[1-9]\d*))\/[^/?#]+$/;
const SHA384 = /^sha384-[A-Za-z0-9+/]{64}$/;
const SECONDARY_HOST = /(^|\.)(?:jsdelivr\.net|unpkg\.com)$/i;
const RETIRED_PATH = /^\/svgif\/(?:works|embed)(?:\/|$)/;

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
    gallery: `${base}/works/`,
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

export function assertSiteRoutes(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const raw of text.match(/https:\/\/[^\s"'<>\\]+/g) ?? []) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      fail("retired section");
    }
    if (url.origin === "https://thumly.io" && RETIRED_PATH.test(url.pathname)) fail("retired section");
  }
  return text;
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

/**
 * The player markup the embed page carries: the project's css-embedded SVG, the same bytes Studio
 * downloads. It plays with CSS alone, so the page needs no script to play. Loaded on demand so the
 * rest of this module runs without the engine sources.
 */
export async function embedSvg(project) {
  const { svgFile } = await import("../../apps/studio/src/svg-file.ts");
  const text = await svgFile(project.composition, "css-embedded").text();
  return assertPlayerSvg(text.replace(/^<\?xml[^>]*\?>\s*/, ""));
}

/** An inline SVG for the embed page: one root, no script, no event attribute, no external fetch. */
export function assertPlayerSvg(svg) {
  if (typeof svg !== "string" || !svg.startsWith("<svg ") || !svg.trimEnd().endsWith("</svg>")) fail("player svg root");
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:/i.test(svg)) fail("player svg runs script");
  if (/(?:href|src)\s*=\s*"(?!#|data:)/i.test(svg) || /url\(\s*['"]?(?!#|data:)/i.test(svg)) fail("player svg fetches");
  return svg;
}

export function embedPage(project, svg) {
  const { presentation, width, height } = requirePresentation(project);
  const title = escapeText(presentation.title);
  const player = assertPlayerSvg(svg);
  // Edit opens the work page, which carries the saved file's lazy Studio loader. The embed page
  // itself keeps its script-free policy. target=_top leaves the consumer's iframe.
  const edit = escapeText(`${urlsFor(project).work}#edit`);
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
<style>main[data-svgif-embed]>svg{display:block;width:100%;height:auto}</style>
${player}
<a data-svgif-edit href="${edit}" target="_top" rel="noopener">Edit</a>
</main>
</body>
</html>
`;
}

/** The oEmbed XML twin: the same fields as the JSON document, one element each. */
export function oembedXml(doc) {
  const fields = Object.entries(doc)
    .map(([key, value]) => `  <${key}>${escapeText(String(value))}</${key}>`)
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<oembed>\n${fields}\n</oembed>\n`;
}

function sriOf(text) {
  return `sha384-${createHash("sha384").update(text).digest("base64")}`;
}

/**
 * Write every published work onto a built site.
 * A work is a directory `<works>/<workId>/` holding `project.json` and `card.webp`. The work page is the
 * saved project file, written now with the Studio build this site serves, so its Edit pins the same
 * studio.js and studio.css. The player is inline, so the page plays before any CDN object exists.
 */
export async function publishWorks(worksDir, siteDir, studioDir) {
  const { exportHtml } = await import("../../packages/svgif-export/src/html.ts");
  const { PLAYER_SOURCE, RUNTIME_VERSION } = await import("../../apps/studio/src/runtime.ts");
  const studioJs = readFileSync(join(studioDir, "studio.js"), "utf8");
  const studioCss = readFileSync(join(studioDir, "studio.css"), "utf8");
  const published = [];
  const ids = existsSync(worksDir)
    ? readdirSync(worksDir).filter((name) => statSync(join(worksDir, name)).isDirectory()).sort()
    : [];
  for (const id of ids) {
    const source = join(worksDir, id);
    if (!existsSync(join(source, "project.json"))) continue;
    const project = JSON.parse(readFileSync(join(source, "project.json"), "utf8"));
    const { presentation } = requirePresentation(project);
    if (presentation.workId !== id) fail(`work ${id}: workId is ${presentation.workId}`);
    if (!existsSync(join(source, "card.webp"))) fail(`work ${id}: card.webp is missing`);
    const live = {
      ...project,
      runtime: {
        mode: "inline",
        version: RUNTIME_VERSION,
        sri: sriOf(PLAYER_SOURCE),
        studioSri: { js: sriOf(studioJs), css: sriOf(studioCss) },
      },
    };
    const doc = oembedDocument(live);
    const errors = validateContract("embed", doc);
    if (errors.length > 0) fail(`work ${id}: oembed schema: ${errors.join("; ")}`);
    const html = await exportHtml(live, { playerSource: PLAYER_SOURCE }).text();
    assertSiteRoutes(html);
    const page = embedPage(live, await embedSvg(live));
    const workOut = join(siteDir, "works", id);
    const embedOut = join(siteDir, "embed", id);
    mkdirSync(workOut, { recursive: true });
    mkdirSync(embedOut, { recursive: true });
    writeFileSync(join(workOut, "index.html"), html);
    writeFileSync(join(workOut, "oembed.json"), `${JSON.stringify(doc, null, 2)}\n`);
    writeFileSync(join(workOut, "oembed.xml"), oembedXml(doc));
    copyFileSync(join(source, "card.webp"), join(workOut, "card.webp"));
    writeFileSync(join(embedOut, "index.html"), page);
    published.push(id);
  }
  return published;
}

async function selfTest() {
  const project = {
    composition: { width: 320, height: 180 },
    presentation: {
      workId: "box-spin",
      title: "Box spin",
      description: "A short SVG animation.",
      canonicalBase: "https://thumly.io",
      card: { video: "none" },
      twitterPlayer: false,
    },
  };
  const urls = urlsFor(project);
  assertSiteRoutes(urls);
  if (urls.gallery !== "https://thumly.io/works/") fail("gallery");
  if (urls.work !== "https://thumly.io/works/box-spin/") fail("work url");
  if (urls.embed !== "https://thumly.io/embed/box-spin/") fail("embed url");
  if (urls.oembed !== "https://thumly.io/works/box-spin/oembed.json" || urls.oembed.includes("?url=")) {
    fail("oembed");
  }
  const doc = oembedDocument(project);
  assertSiteRoutes(doc);
  if (doc.provider_name !== "Thumly") fail("provider_name");
  if (doc.provider_url !== "https://thumly.io/") fail("provider_url");
  if (doc.type !== "rich" || doc.version !== "1.0") fail("rich type");
  const richErrors = validateContract("embed", doc);
  if (richErrors.length > 0) fail(`oembed schema: ${richErrors.join("; ")}`);
  if (validateContract("embed", { ...doc, html: doc.html.replace("/embed/box-spin/", "/oembed?url=x") }).length === 0) {
    fail("oembed schema accepted a query endpoint");
  }
  if (!doc.html.startsWith("<iframe ") || doc.html.includes("studio.js") || doc.html.includes("?url=")) {
    fail("iframe");
  }
  const srcMatch = doc.html.match(/\ssrc="([^"]+)"/);
  if (!srcMatch) fail("embed url");
  const embedUrl = new URL(srcMatch[1]);
  if (embedUrl.origin !== "https://thumly.io" || embedUrl.pathname !== "/embed/box-spin/" || embedUrl.search !== "") {
    fail("embed url");
  }
  if (doc.width !== 320 || doc.thumbnail_url !== "https://thumly.io/works/box-spin/card.webp") {
    fail("thumbnail");
  }
  const tags = metaTags(project);
  assertSiteRoutes(tags);
  const names = tags.map((tag) => tag[1]);
  for (const required of ["og:title", "og:description", "og:image", "twitter:card"]) {
    if (!names.includes(required)) fail(`missing ${required}`);
  }
  if (names.includes("twitter:player") || names.includes("og:video")) fail("optional player was emitted");
  const fixture = JSON.parse(readFileSync(new URL("../../schema/fixtures/project/v1-valid.json", import.meta.url), "utf8"));
  const svg = await embedSvg(fixture);
  const page = embedPage(project, svg);
  assertSiteRoutes(page);
  if (!page.includes('data-svgif-embed="player"') || page.includes("studio.js") || page.includes("frame-ancestors")) {
    fail("embed page");
  }
  if (!page.includes(svg) || !/@keyframes/.test(svg) || /<script\b/i.test(page)) fail("embed page player");
  if (!page.includes(`<a data-svgif-edit href="${urls.work}#edit" target="_top" rel="noopener">Edit</a>`)) fail("embed page edit link");
  for (const bad of [
    "<div></div>",
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>a{fill:url(https://example.com/a)}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject></foreignObject></svg>',
  ]) {
    let accepted = true;
    try {
      assertPlayerSvg(bad);
    } catch {
      accepted = false;
    }
    if (accepted) fail("player svg guard accepted unsafe markup");
  }
  expectFail("player svg root", () => embedPage(project, ""));
  project.presentation.card = { video: "mp4" };
  project.presentation.twitterPlayer = true;
  const videoDoc = oembedDocument(project);
  assertSiteRoutes(videoDoc);
  if (videoDoc.provider_name !== "Thumly") fail("provider_name");
  if (videoDoc.provider_url !== "https://thumly.io/") fail("provider_url");
  if (videoDoc.type !== "video") fail("video type");
  const videoErrors = validateContract("embed", videoDoc);
  if (videoErrors.length > 0) fail(`oembed schema: ${videoErrors.join("; ")}`);
  const videoTags = metaTags(project);
  assertSiteRoutes(videoTags);
  const videoNames = videoTags.map((tag) => tag[1]);
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

  expectFail("retired section", () => assertSiteRoutes("https://thumly.io/svgif/works/box-spin/"));
  expectFail("retired section", () => assertSiteRoutes("https://thumly.io/svgif/embed/box-spin/"));
  assertSiteRoutes("https://cdn.example.invalid/svgif/1.2.3/svgif.mjs");

  if (secondaryDocUrls.length !== 2) fail("secondary origin");
  for (const docUrl of secondaryDocUrls) {
    const host = new URL(docUrl).hostname;
    if (host === "cdn.thumly.io" || !SECONDARY_HOST.test(host)) fail("secondary origin");
    expectFail("secondary origin", () => embedSnippet({
      src: `${docUrl}@1.2.3/svgif.mjs`,
      integrity,
    }));
  }

  // Publish: one work in, the work page, both oEmbed documents, the card, and the player page out.
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const scratch = mkdtempSync(join(tmpdir(), "svgif-publish-"));
  try {
    const works = join(scratch, "works");
    const site = join(scratch, "site");
    const studio = join(scratch, "studio");
    mkdirSync(join(works, "box-spin"), { recursive: true });
    mkdirSync(studio, { recursive: true });
    writeFileSync(join(studio, "studio.js"), "export {};\n");
    writeFileSync(join(studio, "studio.css"), "body{}\n");
    const published = {
      ...fixture,
      schemaRevision: 1,
      presentation: { workId: "box-spin", title: "Box & spin", description: "A short SVG animation.", canonicalBase: "https://thumly.io" },
    };
    writeFileSync(join(works, "box-spin", "project.json"), JSON.stringify(published));
    writeFileSync(join(works, "box-spin", "card.webp"), "RIFF");
    const ids = await publishWorks(works, site, studio);
    if (ids.join(",") !== "box-spin") fail("publish listed the wrong works");
    const workPage = readFileSync(join(site, "works", "box-spin", "index.html"), "utf8");
    if (!workPage.includes('type="application/json+oembed" href="https://thumly.io/works/box-spin/oembed.json"')) fail("work page discovery");
    if (!workPage.includes(`integrity="${sriOf("export {};\n")}"`) && !workPage.includes(sriOf("export {};\n"))) fail("work page studio pin");
    const xml = readFileSync(join(site, "works", "box-spin", "oembed.xml"), "utf8");
    if (!xml.includes("<title>Box &amp; spin</title>") || !xml.startsWith("<?xml")) fail("oembed xml");
    const json = JSON.parse(readFileSync(join(site, "works", "box-spin", "oembed.json"), "utf8"));
    if (validateContract("embed", json).length > 0) fail("published oembed schema");
    if (!existsSync(join(site, "works", "box-spin", "card.webp"))) fail("published card");
    if (!readFileSync(join(site, "embed", "box-spin", "index.html"), "utf8").includes('data-svgif-embed="player"')) fail("published player");
    writeFileSync(join(works, "box-spin", "project.json"), JSON.stringify({ ...published, presentation: { ...published.presentation, workId: "other" } }));
    await publishWorks(works, site, studio).then(
      () => fail("a work id that differs from its directory was published"),
      (error) => {
        if (!(error instanceof Error) || !error.message.includes("workId")) throw error;
      },
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
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
  await selfTest();
} else if (process.argv[2] === "--publish") {
  const [worksDir, siteDir, studioDir] = process.argv.slice(3);
  if (!worksDir || !siteDir || !studioDir) {
    console.error("usage: render-external-embed.mjs --publish <works-dir> <site-dir> <studio-dist-dir>");
    process.exit(2);
  }
  const published = await publishWorks(worksDir, siteDir, studioDir);
  console.log(published.length > 0 ? `published ${published.join(", ")}` : `no works under ${basename(worksDir)}`);
}
