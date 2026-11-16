#!/usr/bin/env node
// Browser rows of the release-readiness matrix, for one browser.
// Each scenario runs once. A scenario that cannot run is `blocked` with the reason.
// It is never written as `passed`.
//
//   node scripts/e2e/browser.mjs --browser chromium --out evidence [--target site]
//
// `--target local` (the default) serves apps/studio/dist on a loopback port and
// answers https://thumly.io/studio/ from that build. That is a rehearsal. The
// manifest accepts browser rows from `--target site` only.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validate } from "../../schema/validate.mjs";
import {
  CDN,
  SITE,
  contentType,
  loadCatalog,
  parseArgs,
  parseMp4,
  parseSvgRoot,
  parseWebm,
  parseWebp,
  projectOf,
  resolveUnder,
  root,
  runRow,
  serve,
  sha256,
  sha384Integrity,
  writeRow,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const catalog = loadCatalog();
const browserName = String(args.browser ?? "");
if (!catalog.browsers.includes(browserName)) {
  console.error(`--browser must be one of ${catalog.browsers.join(", ")}`);
  process.exit(2);
}
const target = args.target === "site" ? "site" : "local";
const outDir = String(args.out ?? "evidence");
const only = typeof args.only === "string" ? args.only.split(",") : catalog.scenarios;
const cdnBase = typeof args["cdn-base"] === "string" ? args["cdn-base"].replace(/\/$/, "") : "";
const workId = typeof args.work === "string" ? args.work : "";

function loadPlaywright() {
  for (const from of [join(root, "package.json"), import.meta.url]) {
    try {
      return createRequire(from)("playwright");
    } catch {
      // Try the next place.
    }
  }
  console.error("playwright is not installed. Run `npm ci` in the repository root.");
  process.exit(2);
}

const schemaFiles = ["project/v1.schema.json", "project/v1.1.schema.json", "ir/v1.schema.json", "ir/v1.1.schema.json"].map((name) =>
  JSON.parse(readFileSync(join(root, "schema", name), "utf8")),
);
const schemaById = new Map(schemaFiles.map((schema) => [schema.$id, schema]));

function projectIssues(project) {
  const schema = schemaFiles.find((file) => file.$id.includes("/project/") && file.properties?.schemaRevision?.const === project?.schemaRevision);
  if (!schema) return ["no project schema for this schemaRevision"];
  return validate(schema, project, schema, schemaById, "project");
}

const dist = join(root, "apps/studio/dist");
if (target === "local" && !existsSync(join(dist, "index.html"))) {
  console.error("apps/studio/dist/index.html is missing. Build Studio first.");
  process.exit(2);
}

/** Whether the deployed Studio is the build of this checkout. Evidence for a commit needs `match`. */
async function compareSiteBuild() {
  if (target !== "site") return "not-applicable";
  if (!existsSync(join(dist, "studio.js"))) return "not-built";
  try {
    const response = await fetch(`${SITE}/studio/studio.js`);
    if (!response.ok) return `unreachable (${response.status})`;
    const deployed = new Uint8Array(await response.arrayBuffer());
    return sha256(deployed) === sha256(readFileSync(join(dist, "studio.js"))) ? "match" : "differs";
  } catch {
    return "unreachable";
  }
}
const siteBuild = await compareSiteBuild();
if (target === "site") console.log(`deployed Studio against this checkout's build: ${siteBuild}`);

const work = mkdtempSync(join(tmpdir(), "svgif-e2e-"));
const browserOut = join(outDir, browserName);
mkdirSync(browserOut, { recursive: true });
const cli = join(root, "packages/svgif-cli/src/bin.ts");
const fixtureJson = join(root, "schema/fixtures/project/v1-valid.json");
const fixture = JSON.parse(readFileSync(fixtureJson, "utf8"));
const fixtureHtml = join(work, "fixture.html");
execFileSync(process.execPath, [cli, "export", "--in", fixtureJson, "--format", "html", "--out", fixtureHtml], { stdio: "ignore" });
const tooNewHtml = join(work, "too-new.html");
writeFileSync(tooNewHtml, readFileSync(fixtureHtml, "utf8").replace('"schemaVersion":1', '"schemaVersion":2'));
const { fps, width, height, durationInFrames } = fixture.composition;
const seconds = durationInFrames / fps;

const { server, origin } = await serve({ "/studio/": dist, "/work/": work });
const studioUrl = target === "site" ? `${SITE}/studio/` : `${origin}/studio/`;
const browser = await loadPlaywright()[browserName].launch();
const requestLog = [];
let current = "";

async function context(options = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...options });
  ctx.on("request", (request) => {
    const url = request.url();
    requestLog.push({
      scenario: current,
      method: request.method(),
      url: url.startsWith("blob:") || url.startsWith("data:") ? url.slice(0, 5) : url.split("?")[0],
      body: request.postData() !== null,
    });
  });
  if (target === "local" && options.offline !== true) {
    await ctx.route(`${SITE}/studio/**`, (route) => {
      const path = resolveUnder(dist, new URL(route.request().url()).pathname.slice("/studio/".length));
      if (!path) return route.fulfill({ status: 404 });
      return route.fulfill({ status: 200, contentType: contentType(path), headers: { "access-control-allow-origin": "*" }, body: readFileSync(path) });
    });
  }
  return ctx;
}

async function waitStatus(page, pattern, timeout = 20_000) {
  await page.waitForFunction((source) => new RegExp(source).test(document.querySelector("#status")?.textContent ?? ""), pattern.source, { timeout });
}

async function openStudio(ctx, file = fixtureHtml) {
  const page = await ctx.newPage();
  await page.goto(`${studioUrl}?mode=advanced`);
  await page.waitForSelector("#save-html");
  if (file) {
    await page.setInputFiles("#open-file", file);
    await waitStatus(page, /Opened the composition/);
  }
  return page;
}

async function download(page, selector, name, options = {}) {
  if (selector !== "#save-html") {
    if (!(await page.isVisible(selector))) await page.click("#export-menu");
    await page.setChecked("#embed-player", options.embedPlayer === true);
    await page.setChecked("#embed-studio", options.embedStudio === true);
  }
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 240_000 }), page.click(selector)]);
  const path = join(work, name);
  await file.saveAs(path);
  return { path, bytes: readFileSync(path), url: `${origin}/work/${name}` };
}

/** True when the page shows the preview SVG and an animation clock advances. */
async function plays(page) {
  await page.waitForSelector("#svgif-preview svg", { timeout: 20_000 });
  const clock = () =>
    page.evaluate(() => {
      const times = document.getAnimations().map((animation) => Number(animation.currentTime ?? 0));
      const svg = document.querySelector("#svgif-preview svg");
      return { count: times.length, time: Math.max(0, ...times), smil: svg ? svg.getCurrentTime() : 0 };
    });
  const first = await clock();
  await page.waitForTimeout(400);
  const second = await clock();
  return { ok: (second.count > 0 && second.time !== first.time) || second.smil > first.smil, first, second };
}

async function mediaInBrowser(ctx, url, kind) {
  const page = await ctx.newPage();
  await page.goto(`${origin}/work/blank.html`);
  const result = await page.evaluate(
    ({ url, kind }) =>
      new Promise((resolve) => {
        const done = (value) => resolve(value);
        setTimeout(() => done({ ok: false, error: "no event in 120 s" }), 120_000);
        if (kind === "image") {
          const image = new Image();
          image.onload = () => done({ ok: true, width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => done({ ok: false, error: "the image did not load" });
          image.src = url;
        } else {
          const video = document.createElement("video");
          video.muted = true;
          video.onloadedmetadata = () => done({ ok: true, width: video.videoWidth, height: video.videoHeight, duration: video.duration });
          video.onerror = () => done({ ok: false, error: `media error ${video.error?.code ?? ""}` });
          video.src = url;
        }
      }),
    { url, kind },
  );
  await page.close();
  return result;
}

function keep(name, bytes) {
  writeFileSync(join(browserOut, name), bytes);
  return `${browserName}/${name}`;
}

async function copiedSource(page, inline) {
  await page.evaluate(() => {
    window.__copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => void (window.__copied = text) } });
  });
  if (!(await page.isVisible("#copy-source"))) await page.click("#export-menu");
  await page.setChecked("#embed-player", inline);
  await page.setChecked("#embed-studio", false);
  await page.click("#copy-source");
  await waitStatus(page, /Copied source/);
  return page.evaluate(() => window.__copied);
}

async function reachable(ctx, url) {
  try {
    const response = await ctx.request.get(url, { timeout: 15_000 });
    return response.status();
  } catch {
    return 0;
  }
}

writeFileSync(join(work, "blank.html"), "<!DOCTYPE html><title>blank</title>\n");

async function raster(t, format, check) {
  const ctx = await context();
  try {
    const page = await openStudio(ctx);
    const reason = await page.evaluate((id) => document.querySelector(id)?.textContent ?? "", `#${format}-reason`).catch(() => "");
    const file = await download(page, `#export-${format}`, `export.${format}`);
    t.note("file", { bytes: file.bytes.length, sha256: sha256(file.bytes) });
    if (reason) t.note("studioNote", reason.slice(0, 200));
    const said = await waitStatus(page, /Nothing was uploaded/).then(
      () => true,
      () => false,
    );
    t.check("the status says nothing was uploaded", said, await page.textContent("#status"));
    await check(file, ctx);
  } finally {
    await ctx.close();
  }
}

const near = (value, expected, tolerance) => typeof value === "number" && Math.abs(value - expected) <= tolerance;

const scenarios = {
  async "export-html"(t) {
    const ctx = await context();
    try {
      const page = await openStudio(ctx);
      const saved = await download(page, "#save-html", "saved.html");
      const project = projectOf(saved.bytes.toString("utf8"));
      t.note("file", keep("export-html.html", saved.bytes));
      t.check("the saved file holds a project document", project !== undefined);
      const issues = project ? projectIssues(project) : ["no project"];
      t.check("the project validates against the project schema", issues.length === 0, issues.join("; "));
      t.check("the composition is the opened one", JSON.stringify(project?.composition) === JSON.stringify(fixture.composition));
      const inline = await download(page, "#export-html", "inline.html", { embedPlayer: true });
      const player = await ctx.newPage();
      await player.goto(inline.url);
      const playing = await plays(player);
      t.check("the saved file plays", playing.ok, JSON.stringify(playing));
    } finally {
      await ctx.close();
    }
  },

  async "export-svg"(t) {
    const ctx = await context();
    try {
      const page = await openStudio(ctx);
      const file = await download(page, "#export-svg", "export.svg");
      t.note("file", keep("export-svg.svg", file.bytes));
      const svg = parseSvgRoot(file.bytes.toString("utf8"));
      t.check("the root element is svg in the SVG namespace", svg.ok && svg.xmlns === "http://www.w3.org/2000/svg", svg.xmlns);
      t.check("width and height are the composition size", svg.width === String(width) && svg.height === String(height), `${svg.width}x${svg.height}`);
      t.check("viewBox is the composition box", svg.viewBox === `0 0 ${width} ${height}`, svg.viewBox);
      const image = await mediaInBrowser(ctx, file.url, "image");
      t.check("the browser decodes the file as an image", image.ok && image.width === width && image.height === height, JSON.stringify(image));
    } finally {
      await ctx.close();
    }
  },

  "export-webp": (t) =>
    raster(t, "webp", async (file, ctx) => {
      const webp = parseWebp(file.bytes);
      t.check("RIFF and WEBP signature", webp.ok);
      t.check(`frame count is ${durationInFrames}`, webp.frames === durationInFrames, webp.frames);
      t.check(`duration is ${seconds} s`, near(webp.durationMs, seconds * 1000, 1000 / fps), webp.durationMs);
      const image = await mediaInBrowser(ctx, file.url, "image");
      t.check("the browser decodes the file", image.ok && image.width === width && image.height === height, JSON.stringify(image));
    }),

  "export-webm": (t) =>
    raster(t, "webm", async (file, ctx) => {
      const webm = parseWebm(file.bytes);
      t.check("EBML signature", webm.ok);
      t.check(`the file states a duration of ${seconds} s`, near(webm.durationSeconds, seconds, 1 / fps + 0.01), webm.durationSeconds);
      const video = await mediaInBrowser(ctx, file.url, "video");
      t.check("the browser loads the file as video", video.ok && video.width === width && video.height === height, JSON.stringify(video));
    }),

  "export-mp4": (t) =>
    raster(t, "mp4", async (file, ctx) => {
      const mp4 = parseMp4(file.bytes);
      t.check("ftyp signature", mp4.ok);
      t.check(`mvhd duration is ${seconds} s`, near(mp4.durationSeconds, seconds, 1 / fps + 0.01), mp4.durationSeconds);
      const video = await mediaInBrowser(ctx, file.url, "video");
      t.check("the browser loads the file as video", video.ok && video.width === width && video.height === height, JSON.stringify(video));
    }),

  async "relay-round-trip"(t) {
    const ctx = await context();
    try {
      const page = await openStudio(ctx);
      const first = await download(page, "#save-html", "relay-1.html");
      const before = projectOf(first.bytes.toString("utf8"));
      t.check("the first save is a valid project", before !== undefined && projectIssues(before).length === 0);
      t.check("the first save loads Studio from the site, not from the file", !first.bytes.includes("svgif-studio-inline") && first.bytes.includes(`${SITE}/studio/studio.js`));
      const reopened = await ctx.newPage();
      const studioRequests = [];
      reopened.on("request", (request) => {
        if (request.url().startsWith(`${SITE}/studio/studio.js`)) studioRequests.push(request.url());
      });
      await reopened.goto(first.url);
      await reopened.waitForSelector("#svgif-edit");
      t.check("Studio is not requested before Edit", studioRequests.length === 0);
      await reopened.click("#svgif-edit");
      await reopened.waitForSelector("#save-html", { timeout: 30_000 });
      t.check("Edit loads Studio from the site", studioRequests.length >= 1, studioRequests.join(" "));
      await reopened.click("#mode-advanced");
      const edited = durationInFrames + fps;
      await reopened.fill("#field-duration", String(edited));
      await reopened.press("#field-duration", "Enter");
      const second = await download(reopened, "#save-html", "relay-2.html");
      const after = projectOf(second.bytes.toString("utf8"));
      t.note("file", keep("relay-round-trip.html", second.bytes));
      const issues = after ? projectIssues(after) : ["no project"];
      t.check("the second save is a valid project", issues.length === 0, issues.join("; "));
      t.check("the edit is in the second save", after?.composition?.durationInFrames === edited, after?.composition?.durationInFrames);
      const generations = after?.provenance?.generations ?? [];
      const previous = before?.provenance?.generations ?? [];
      t.check("the second save adds one generation", generations.length === previous.length + 1, `${previous.length} -> ${generations.length}`);
      t.check("the new generation names the first save as its parent", generations.at(-1)?.parentId === previous.at(-1)?.id);
    } finally {
      await ctx.close();
    }
  },

  async "schema-migration"(t) {
    const ctx = await context();
    try {
      const page = await openStudio(ctx, null);
      await page.setInputFiles("#open-file", fixtureHtml);
      await waitStatus(page, /Opened the composition/);
      t.check("a schemaVersion 1 file opens", (await page.inputValue("#field-duration")) === String(durationInFrames));
      await page.fill("#field-duration", String(durationInFrames + 1));
      await page.press("#field-duration", "Enter");
      await page.setInputFiles("#open-file", tooNewHtml);
      await waitStatus(page, /schema-too-new/);
      t.check("a schemaVersion 2 file is refused as schema-too-new", true);
      t.check("the refused file does not replace the open composition", (await page.inputValue("#field-duration")) === String(durationInFrames + 1));
      const saved = await download(page, "#save-html", "migration.html");
      const project = projectOf(saved.bytes.toString("utf8"));
      t.check("the next save still writes schemaVersion 1", project?.schemaVersion === 1 && projectIssues(project).length === 0);
    } finally {
      await ctx.close();
    }
  },

  async "embed-cdn"(t) {
    const ctx = await context();
    try {
      const page = await openStudio(ctx);
      const snippet = await copiedSource(page, false);
      const src = /<script[^>]*id="svgif-player"[^>]*\ssrc="([^"]+)"[^>]*\sintegrity="([^"]+)"/.exec(snippet);
      t.check("the copied snippet names a player URL with integrity", src !== null, snippet.slice(0, 200));
      if (!src) return;
      t.check("the player URL is an exact version on the CDN", src[1].startsWith(`${CDN}/svgif/`) && /^\d+\.\d+\.\d+\//.test(src[1].slice(`${CDN}/svgif/`.length)), src[1]);
      const status = await reachable(ctx, src[1]);
      if (status !== 200) t.block(`${src[1]} answered ${status}. The CDN has no object for this version until the release workflow uploads one.`);
      const response = await ctx.request.get(src[1]);
      t.check("the CDN bytes match the integrity value", sha384Integrity(await response.body()) === src[2]);
      writeFileSync(join(work, "embed-cdn.html"), `<!DOCTYPE html><meta charset="utf-8"><title>embed</title>\n${snippet}\n`);
      const host = await ctx.newPage();
      await host.goto(`${origin}/work/embed-cdn.html`);
      const playing = await plays(host);
      t.check("the pasted snippet plays", playing.ok, JSON.stringify(playing));
    } finally {
      await ctx.close();
    }
  },

  async "embed-inline"(t) {
    const ctx = await context();
    let snippet = "";
    try {
      const page = await openStudio(ctx);
      snippet = await copiedSource(page, true);
    } finally {
      await ctx.close();
    }
    t.check("the copied snippet names no player URL", !/\ssrc="https?:/.test(snippet), snippet.slice(0, 120));
    writeFileSync(join(work, "embed-inline.html"), `<!DOCTYPE html><meta charset="utf-8"><title>embed</title>\n${snippet}\n`);
    const offline = await context({ offline: true });
    try {
      const host = await offline.newPage();
      const seen = [];
      host.on("request", (request) => seen.push(request.url()));
      await host.goto(pathToFileURL(join(work, "embed-inline.html")).href);
      const playing = await plays(host);
      t.check("the pasted snippet plays with the network off", playing.ok, JSON.stringify(playing));
      const remote = seen.filter((url) => /^https?:/.test(url));
      t.check("the page asks for nothing over the network", remote.length === 0, remote.join(" "));
    } finally {
      await offline.close();
    }
  },

  async "offline-playback"(t) {
    const ctx = await context();
    let file;
    try {
      const page = await openStudio(ctx);
      file = await download(page, "#export-html", "offline.html", { embedPlayer: true });
    } finally {
      await ctx.close();
    }
    const offline = await context({ offline: true });
    try {
      const page = await offline.newPage();
      const seen = [];
      page.on("request", (request) => seen.push(request.url()));
      await page.goto(pathToFileURL(file.path).href);
      const playing = await plays(page);
      t.check("the inline player plays with the network off", playing.ok, JSON.stringify(playing));
      const remote = seen.filter((url) => /^https?:/.test(url));
      t.check("the file asks for nothing over the network", remote.length === 0, remote.join(" "));
    } finally {
      await offline.close();
    }
  },

  async "no-server-calls"(t) {
    const exported = ["export-html", "export-svg", "export-webp", "export-webm", "export-mp4"];
    const ran = new Set(requestLog.map((entry) => entry.scenario));
    const missing = exported.filter((id) => !ran.has(id));
    if (missing.length > 0) t.block(`the request log has no entries for ${missing.join(", ")}. Run this scenario with the export scenarios.`);
    const allowed = new Set([new URL(origin).host, new URL(SITE).host, new URL(CDN).host]);
    const hostOf = (url) => (/^https?:/.test(url) ? new URL(url).host : "");
    const foreign = requestLog.filter((entry) => hostOf(entry.url) !== "" && !allowed.has(hostOf(entry.url)));
    const writes = requestLog.filter((entry) => /^https?:/.test(entry.url) && (entry.method !== "GET" || entry.body));
    writeFileSync(join(browserOut, "no-server-calls.requests.json"), `${JSON.stringify(requestLog, null, 2)}\n`);
    t.note("requests", requestLog.length);
    t.note("hosts", [...new Set(requestLog.map((entry) => hostOf(entry.url)).filter(Boolean))]);
    t.check("every request goes to the page, the site, or the CDN", foreign.length === 0, foreign.map((entry) => entry.url).slice(0, 5).join(" "));
    t.check("every request is a GET with no body", writes.length === 0, writes.map((entry) => `${entry.method} ${entry.url}`).slice(0, 5).join(" "));
  },

  async "oembed-json"(t) {
    if (target !== "site" || !workId) t.block("no published work is named. This row needs --target site and --work <workId>.");
    const ctx = await context();
    try {
      const response = await ctx.request.get(`${SITE}/works/${workId}/oembed.json`);
      t.check("the oEmbed file answers 200", response.status() === 200, response.status());
      const doc = await response.json();
      const schema = JSON.parse(readFileSync(join(root, "schema/embed/v1.schema.json"), "utf8"));
      const issues = validate(schema, doc, schema, new Map([[schema.$id, schema]]), "embed");
      t.check("the document validates against the embed schema", issues.length === 0, issues.join("; "));
      t.check("type is rich or video", doc.type === "rich" || doc.type === "video", doc.type);
      t.check("html is an iframe to /embed/ with no ?url=", String(doc.html).includes(`<iframe src="${SITE}/embed/${workId}/"`) && !String(doc.html).includes("?url="));
    } finally {
      await ctx.close();
    }
  },

  async "social-card"(t) {
    if (target !== "site" || !workId) t.block("no published work is named. This row needs --target site and --work <workId>.");
    const ctx = await context();
    try {
      const page = await ctx.newPage();
      await page.goto(`${SITE}/works/${workId}/`);
      const meta = await page.evaluate(() =>
        Object.fromEntries([...document.querySelectorAll("meta[property],meta[name]")].map((node) => [node.getAttribute("property") ?? node.getAttribute("name"), node.getAttribute("content")])),
      );
      t.check("og:title is the svgif:title value", Boolean(meta["og:title"]) && meta["og:title"] === meta["svgif:title"], meta["og:title"]);
      t.check("og:description is the svgif:description value", meta["og:description"] !== undefined && meta["og:description"] === meta["svgif:description"]);
      t.check("og:image is under the work", String(meta["og:image"]).startsWith(`${SITE}/works/${workId}/`), meta["og:image"]);
      t.check("twitter:card is summary_large_image", meta["twitter:card"] === "summary_large_image", meta["twitter:card"]);
    } finally {
      await ctx.close();
    }
  },

  async "embed-player"(t) {
    if (target !== "site" || !workId) t.block("no published work is named. This row needs --target site and --work <workId>.");
    const ctx = await context();
    try {
      const page = await ctx.newPage();
      const studio = [];
      page.on("request", (request) => {
        if (/\/studio\/studio\.js/.test(request.url())) studio.push(request.url());
      });
      await page.goto(`${SITE}/embed/${workId}/`);
      const playing = await page
        .waitForSelector("svg", { timeout: 15_000 })
        .then(async () => {
          const before = await page.evaluate(() => Math.max(0, ...document.getAnimations().map((animation) => Number(animation.currentTime ?? 0))));
          await page.waitForTimeout(400);
          const after = await page.evaluate(() => Math.max(0, ...document.getAnimations().map((animation) => Number(animation.currentTime ?? 0))));
          return after !== before;
        })
        .catch(() => false);
      t.check("the embed page plays", playing);
      t.check("studio.js is not requested before Edit", studio.length === 0, studio.join(" "));
      await page.click("[data-svgif-edit]");
      await page.waitForTimeout(1500);
      t.check("Edit requests studio.js", studio.length === 1, studio.join(" "));
    } finally {
      await ctx.close();
    }
  },

  async "cdn-exact-version"(t) {
    if (!cdnBase) t.block("SVGIF_CDN_BASE is not set. No library object is on the CDN until the release workflow uploads one. Pass --cdn-base after that.");
    const ctx = await context();
    try {
      const page = await openStudio(ctx);
      const project = projectOf((await download(page, "#save-html", "cdn.html")).bytes.toString("utf8"));
      const url = `${cdnBase}/svgif/${project.runtime.version}/svgif.mjs`;
      const response = await ctx.request.get(url);
      const headers = response.headers();
      t.check("the exact-version URL answers 200", response.status() === 200, `${url} ${response.status()}`);
      t.check("Cache-Control is immutable", /immutable/.test(headers["cache-control"] ?? ""), headers["cache-control"]);
      t.check("the content type is JavaScript", /javascript/.test(headers["content-type"] ?? ""), headers["content-type"]);
      t.check("sha384 is the value the saved file pins", sha384Integrity(await response.body()) === project.runtime.sri);
    } finally {
      await ctx.close();
    }
  },

  async "cdn-alias"(t) {
    if (!cdnBase) t.block("SVGIF_CDN_BASE is not set. No alias object is on the CDN until the release workflow uploads one. Pass --cdn-base after that.");
    const ctx = await context();
    try {
      const response = await ctx.request.get(`${cdnBase}/svgif/latest/svgif.mjs`);
      const cache = response.headers()["cache-control"] ?? "";
      t.check("the alias URL answers 200", response.status() === 200, response.status());
      t.check("Cache-Control is max-age=300", /max-age=300\b/.test(cache) && !/immutable/.test(cache), cache);
      const readme = readFileSync(join(root, "README.md"), "utf8");
      t.check("the README tells the reader not to set integrity on an alias", /Do not set `integrity` on `\/svgif\/latest\/`/.test(readme));
    } finally {
      await ctx.close();
    }
  },
};

const rows = [];
try {
  for (const id of catalog.scenarios) {
    if (!only.includes(id)) continue;
    const body = scenarios[id];
    current = id;
    const row = await runRow(id, browserName, target, body ?? ((t) => t.block("no runner exists for this scenario")));
    row.siteBuild = siteBuild;
    rows.push(row);
    writeRow(outDir, row);
    console.log(`${row.status.padEnd(7)} ${id}@${browserName}${row.reason ? ` :: ${row.reason}` : ""}`);
    for (const check of row.checks.filter((entry) => !entry.ok)) console.log(`          not true: ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  }
} finally {
  await browser.close();
  server.close();
  rmSync(work, { recursive: true, force: true });
}
const count = (status) => rows.filter((row) => row.status === status).length;
console.log(`${browserName}: ${count("passed")} passed, ${count("failed")} failed, ${count("blocked")} blocked (target ${target})`);
process.exit(count("failed") > 0 ? 1 : 0);
