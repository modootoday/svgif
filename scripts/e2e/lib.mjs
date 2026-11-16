// Shared parts of the end-to-end runners: arguments, a loopback file server,
// container parsers, and the row file each scenario writes.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
export const SITE = "https://thumly.io";
export const CDN = "https://cdn.thumly.io";
export const STATUSES = ["passed", "failed", "blocked"];

export function loadCatalog() {
  return JSON.parse(readFileSync(join(root, "schema/release-readiness/scenarios.v1.json"), "utf8"));
}

/** `--name value` pairs and bare `--switch` flags. */
export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[arg.slice(2)] = true;
    else {
      args[arg.slice(2)] = next;
      index += 1;
    }
  }
  return args;
}

export class Blocked extends Error {}

/**
 * Run one scenario once. There is no retry.
 * A scenario passes when it returns, every check is true, and at least one check ran.
 */
export async function runRow(id, lane, target, body, timeoutMs = 300_000) {
  const checks = [];
  const row = { id, browser: lane, target, status: "failed", attempts: 1, checks, startedAt: new Date().toISOString() };
  const tools = {
    check(name, ok, detail) {
      checks.push({ name, ok: ok === true, ...(detail === undefined ? {} : { detail: String(detail).slice(0, 400) }) });
      return ok === true;
    },
    block(reason) {
      throw new Blocked(reason);
    },
    note(key, value) {
      row[key] = value;
    },
  };
  let timer;
  try {
    await Promise.race([
      body(tools),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`the scenario did not finish in ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    row.status = checks.length > 0 && checks.every((check) => check.ok) ? "passed" : "failed";
    if (checks.length === 0) row.reason = "the scenario recorded no check";
  } catch (error) {
    if (error instanceof Blocked) {
      row.status = "blocked";
      row.reason = error.message;
    } else {
      row.status = "failed";
      row.reason = String(error?.message ?? error).split("\n")[0].slice(0, 400);
    }
  } finally {
    clearTimeout(timer);
  }
  row.finishedAt = new Date().toISOString();
  return row;
}

export function writeRow(outDir, row) {
  const dir = join(outDir, row.browser);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${row.id}.json`);
  writeFileSync(path, `${JSON.stringify({ ...row, evidence: `${row.browser}/${row.id}.json` }, null, 2)}\n`);
  return path;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha384Integrity(bytes) {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".png": "image/png",
};

export function contentType(path) {
  return TYPES[extname(path)] ?? "application/octet-stream";
}

/** Resolve a URL path under a directory. Returns undefined when it leaves the directory or is not a file. */
export function resolveUnder(dir, urlPath) {
  const base = normalize(dir);
  let path = normalize(join(base, decodeURIComponent(urlPath)));
  if (path !== base && !path.startsWith(base + sep)) return undefined;
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  return existsSync(path) && statSync(path).isFile() ? path : undefined;
}

/** Serve `{ "/prefix/": directory }` on a loopback port. GET and HEAD only. */
export function serve(mounts) {
  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      return response.end();
    }
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    for (const [prefix, dir] of Object.entries(mounts)) {
      if (!pathname.startsWith(prefix)) continue;
      const path = resolveUnder(dir, pathname.slice(prefix.length));
      if (!path) break;
      const bytes = readFileSync(path);
      response.writeHead(200, { "content-type": contentType(path), "content-length": bytes.length, "cache-control": "no-store" });
      return response.end(request.method === "HEAD" ? undefined : bytes);
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** The project document inside a saved HTML file, or undefined. */
export function projectOf(html) {
  const match = /<script id="svgif-project"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** Animated WebP: signature, frame count, and total duration in milliseconds. */
export function parseWebp(bytes) {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return { ok: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frames = 0;
  let durationMs = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (fourcc === "ANMF" && offset + 8 + 16 <= bytes.length) {
      frames += 1;
      const at = offset + 8 + 12;
      durationMs += bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    }
    offset += 8 + size + (size % 2);
  }
  return { ok: true, frames, durationMs };
}

/** MP4: `ftyp` at offset 4 and the movie duration in seconds from `mvhd`. */
export function parseMp4(bytes) {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return { ok: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const find = (start, end, type) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      let header = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header) return undefined;
      if (ascii(bytes, offset + 4, 4) === type) return { start: offset + header, end: offset + size };
      offset += size;
    }
    return undefined;
  };
  const moov = find(0, bytes.length, "moov");
  const mvhd = moov && find(moov.start, moov.end, "mvhd");
  if (!mvhd) return { ok: true, durationSeconds: undefined };
  const version = bytes[mvhd.start];
  const timescale = version === 1 ? view.getUint32(mvhd.start + 20) : view.getUint32(mvhd.start + 12);
  const duration = version === 1 ? Number(view.getBigUint64(mvhd.start + 24)) : view.getUint32(mvhd.start + 16);
  return { ok: true, durationSeconds: timescale > 0 ? duration / timescale : undefined };
}

/** WebM: the EBML signature and the Segment Info duration in seconds, when the file states one. */
export function parseWebm(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return { ok: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const limit = Math.min(bytes.length - 12, 4096);
  let scale = 1_000_000;
  let ticks;
  for (let offset = 4; offset < limit; offset += 1) {
    if (bytes[offset] === 0x2a && bytes[offset + 1] === 0xd7 && bytes[offset + 2] === 0xb1 && bytes[offset + 3] === 0x83) {
      scale = (bytes[offset + 4] << 16) | (bytes[offset + 5] << 8) | bytes[offset + 6];
    }
    if (bytes[offset] === 0x44 && bytes[offset + 1] === 0x89) {
      if (bytes[offset + 2] === 0x84) ticks = view.getFloat32(offset + 3);
      else if (bytes[offset + 2] === 0x88) ticks = view.getFloat64(offset + 3);
    }
  }
  return { ok: true, durationSeconds: ticks === undefined ? undefined : (ticks * scale) / 1e9 };
}

/** Root element, width, height, and viewBox of an SVG document. */
export function parseSvgRoot(text) {
  const match = /<svg\b([^>]*)>/.exec(text);
  if (!match) return { ok: false };
  const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(match[1])?.[1];
  return { ok: true, xmlns: attr("xmlns"), width: attr("width"), height: attr("height"), viewBox: attr("viewBox") };
}

export function selfTest() {
  const fail = (message) => {
    throw new Error(`e2e lib self-test: ${message}`);
  };
  const u32le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const u32be = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const text = (s) => [...s].map((c) => c.charCodeAt(0));
  const anmf = (ms) => [...text("ANMF"), ...u32le(16), ...new Array(12).fill(0), ms & 255, (ms >> 8) & 255, 0, 0];
  const webpBody = [...text("WEBP"), ...text("ANIM"), ...u32le(6), 0, 0, 0, 0, 0, 0, ...anmf(33), ...anmf(34), ...anmf(33)];
  const webp = parseWebp(new Uint8Array([...text("RIFF"), ...u32le(webpBody.length), ...webpBody]));
  if (!webp.ok || webp.frames !== 3 || webp.durationMs !== 100) fail("webp");
  if (parseWebp(new Uint8Array(text("RIFFxxxxWAVE"))).ok) fail("webp accepted a wave file");
  const mvhd = [...u32be(28), ...text("mvhd"), 0, 0, 0, 0, ...u32be(0), ...u32be(0), ...u32be(1000), ...u32be(3000)];
  const mp4 = parseMp4(new Uint8Array([...u32be(16), ...text("ftypisom"), ...u32be(0), ...u32be(8 + mvhd.length), ...text("moov"), ...mvhd]));
  if (!mp4.ok || mp4.durationSeconds !== 3) fail("mp4");
  if (parseMp4(new Uint8Array(text("RIFFxxxxWEBPVP8X"))).ok) fail("mp4 accepted a webp file");
  const webmBytes = new Uint8Array(40);
  webmBytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  webmBytes.set([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40], 8);
  webmBytes.set([0x44, 0x89, 0x84], 16);
  new DataView(webmBytes.buffer).setFloat32(19, 3000);
  const webm = parseWebm(webmBytes);
  if (!webm.ok || webm.durationSeconds !== 3) fail("webm");
  if (parseWebm(new Uint8Array(8)).ok) fail("webm accepted zeros");
  const svg = parseSvgRoot('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2"></svg>');
  if (!svg.ok || svg.width !== "4" || svg.viewBox !== "0 0 4 2") fail("svg");
  if (projectOf('<script id="svgif-project" type="x">{"a":1}</script>')?.a !== 1) fail("project");
  if (projectOf("<p></p>") !== undefined) fail("project accepted a page with no project");
  if (resolveUnder(join(root, "schema"), "../package.json") !== undefined) fail("path left the mount");
  const args = parseArgs(["--browser", "chromium", "--keep"]);
  if (args.browser !== "chromium" || args.keep !== true) fail("args");
}
