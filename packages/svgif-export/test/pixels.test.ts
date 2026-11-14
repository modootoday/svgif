/**
 * Decode real WebP, WebM, and MP4 frames with tools outside this repository.
 * The page rasterizes `renderFrame` in the browser. The assertions read the
 * decoder's pixels, not a picture this package invented.
 * `dwebp` and ffmpeg's WebP decoder refuse this animation. `anim_dump` writes
 * the frames, and ffmpeg reads those pictures. WebM and MP4 use ffmpeg with
 * one picture per packet.
 */

import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));

function commandPath(name: string): string {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : "";
}

function browserBin(): string {
  const fromEnv = process.env.SVGIF_SHELL_BROWSER?.trim() ?? "";
  if (fromEnv) return fromEnv;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const path = commandPath(name);
    if (path) return path;
  }
  throw new Error("no browser is on PATH");
}

function requireTool(name: string): string {
  const path = commandPath(name);
  if (!path) throw new Error(`${name} is not available`);
  return path;
}

interface Box {
  frame: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

interface PageResult {
  boxes: Box[];
  webp: string;
  emptyWebp: string;
  webm: string;
  emptyWebm: string;
  mp4: string;
  emptyMp4: string;
  error?: string;
}

function bundle(dir: string): void {
  const entry = join(dir, "entry.ts");
  writeFileSync(
    entry,
    [
      `export { renderFrame, exportAnimatedWebp } from ${JSON.stringify(join(root, "webp.ts"))};`,
      `export { exportAnimatedWebm } from ${JSON.stringify(join(root, "webm.ts"))};`,
      `export { exportAnimatedMp4 } from ${JSON.stringify(join(root, "mp4.ts"))};`,
      "",
    ].join("\n"),
  );
  const built = spawnSync(
    process.execPath,
    ["build", entry, "--target=browser", "--format=esm", "--outfile", join(dir, "app.js")],
    { encoding: "utf8" },
  );
  if (built.status !== 0) throw new Error(built.stderr || "could not bundle the exporter");
  const source = readFileSync(join(dir, "app.js"), "utf8").replace(/export\s*\{[\s\S]*$/, "");
  writeFileSync(join(dir, "app-classic.js"), source);
}

function page(dir: string): void {
  writeFileSync(
    join(dir, "page.html"),
    `<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>
<script src="app-classic.js"></script>
<script>
const out = document.getElementById("out");
out.textContent = "started";
const bg = { id: "s-bg", tracks: [
  { property: "attr.d", keys: [{ frame: 0, value: "M0 0 H 160 V 90 H 0 Z" }] },
  { property: "attr.fill", keys: [{ frame: 0, value: "#ffffff" }] },
]};
function words(text) {
  return { fps: 10, width: 160, height: 90, durationInFrames: 2, nodes: [bg, {
    id: "s-sale", text, tracks: [
      { property: "attr.fill", keys: [{ frame: 0, value: "#112233" }] },
      { property: "transform.translateX", keys: [{ frame: 0, value: 12 }, { frame: 1, value: 88 }] },
      { property: "transform.translateY", keys: [{ frame: 0, value: 58 }, { frame: 1, value: 58 }] },
    ],
  }]};
}
function b64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
(async () => {
  try {
    const sale = words("Sale 50%");
    const boxes = [];
    for (const frame of [0, 1]) {
      const doc = new DOMParser().parseFromString(renderFrame(sale, frame), "image/svg+xml");
      const host = document.createElement("div");
      host.append(document.importNode(doc.documentElement, true));
      document.body.append(host);
      const text = host.querySelector("text");
      const root = host.querySelector("svg");
      const tb = text.getBoundingClientRect();
      const rb = root.getBoundingClientRect();
      boxes.push({ frame, x: tb.x - rb.x, y: tb.y - rb.y, w: tb.width, h: tb.height, text: text.textContent });
      host.remove();
    }
    const blank = words("");
    const webp = new Uint8Array(await (await exportAnimatedWebp(sale)).arrayBuffer());
    const emptyWebp = new Uint8Array(await (await exportAnimatedWebp(blank)).arrayBuffer());
    const webm = new Uint8Array(await (await exportAnimatedWebm(sale)).arrayBuffer());
    const emptyWebm = new Uint8Array(await (await exportAnimatedWebm(blank)).arrayBuffer());
    const mp4 = new Uint8Array(await (await exportAnimatedMp4(sale)).arrayBuffer());
    const emptyMp4 = new Uint8Array(await (await exportAnimatedMp4(blank)).arrayBuffer());
    out.textContent = JSON.stringify({
      boxes, webp: b64(webp), emptyWebp: b64(emptyWebp), webm: b64(webm), emptyWebm: b64(emptyWebm), mp4: b64(mp4), emptyMp4: b64(emptyMp4),
    });
  } catch (error) {
    out.textContent = JSON.stringify({ error: (error && error.code ? error.code + " " : "") + (error && error.message ? error.message : String(error)) });
  }
})();
</script>`,
  );
}

async function runPage(dir: string): Promise<PageResult> {
  const browser = browserBin();
  const profile = mkdtempSync(join(tmpdir(), "svgif-pixels-"));
  const chrome = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("browser did not open a debugging port")), 20000);
      chrome.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (match?.[1]) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
      chrome.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`browser exited ${code} before the debugging port opened`));
      });
    });
    const version = (await fetch(`http://127.0.0.1:${port}/json/version`).then((res) => res.json())) as {
      webSocketDebuggerUrl: string;
    };
    const list = (await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json())) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    const target = list.find((item) => item.type === "page");
    if (!target) throw new Error("browser has no page");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("browser socket failed")), { once: true });
    });
    let nextId = 0;
    const pending = new Map<number, (message: { result?: { result?: { value?: string } }; error?: { message?: string } }) => void>();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: { result?: { value?: string } };
        error?: { message?: string };
      };
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    });
    const send = (method: string, params: Record<string, unknown> = {}) => {
      const id = ++nextId;
      return new Promise<{ result?: { result?: { value?: string } }; error?: { message?: string } }>((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    };
    await send("Page.enable");
    await send("Runtime.enable");
    const navigated = await send("Page.navigate", { url: `file://${join(dir, "page.html")}` });
    if (navigated.error) throw new Error(navigated.error.message ?? "navigation failed");
    let text = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const value = await send("Runtime.evaluate", {
        expression: "document.getElementById('out')?.textContent || ''",
        returnByValue: true,
      });
      text = value.result?.result?.value ?? "";
      if (text.startsWith("{")) break;
    }
    if (!text.startsWith("{")) throw new Error(`browser did not finish the export: ${text || "empty"}`);
    return JSON.parse(text) as PageResult;
  } finally {
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

function writeBytes(dir: string, name: string, b64: string): string {
  const file = join(dir, name);
  writeFileSync(file, Buffer.from(b64, "base64"));
  return file;
}

function rawRgba(file: string): Uint8ClampedArray {
  const raw = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  if (raw.status !== 0) throw new Error(raw.stderr?.toString() || `ffmpeg could not decode ${file}`);
  return new Uint8ClampedArray(raw.stdout);
}

function webpFrames(file: string, folder: string): Uint8ClampedArray[] {
  mkdirSync(folder, { recursive: true });
  const dumped = spawnSync("anim_dump", ["-folder", folder, file], { encoding: "utf8" });
  if (dumped.error) throw new Error("anim_dump is not available");
  if (dumped.status !== 0) throw new Error(dumped.stderr || "anim_dump failed");
  const pngs = readdirSync(folder)
    .filter((name) => name.endsWith(".png"))
    .sort();
  return pngs.map((name) => rawRgba(join(folder, name)));
}

function probe(file: string): string {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_frames", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "ffprobe failed");
  return result.stdout.trim();
}

function ink(data: Uint8ClampedArray, width: number, box: Box, pad: number): { inside: number; outside: number; cx: number } {
  let inside = 0;
  let outside = 0;
  let sum = 0;
  const height = data.length / 4 / width;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index] ?? 255;
      const green = data[index + 1] ?? 255;
      const blue = data[index + 2] ?? 255;
      if (!(red < 170 && green < 170 && blue < 190)) continue;
      const inBox =
        x >= box.x - pad && x < box.x + box.w + pad && y >= box.y - pad && y < box.y + box.h + pad;
      if (inBox) {
        inside += 1;
        sum += x;
      } else outside += 1;
    }
  }
  return { inside, outside, cx: inside > 0 ? sum / inside : 0 };
}

describe("decoded frames", () => {
  test("Sale 50% is in the picture and an empty string is not", async () => {
    requireTool("ffmpeg");
    requireTool("ffprobe");
    requireTool("anim_dump");
    const dir = mkdtempSync(join(tmpdir(), "svgif-decoded-"));
    bundle(dir);
    page(dir);
    const result = await runPage(dir);
    if (result.error) throw new Error(result.error);
    expect(result.boxes.map((box) => box.text)).toEqual(["Sale 50%", "Sale 50%"]);
    expect(result.boxes[0]?.w ?? 0).toBeGreaterThan(8);
    expect(result.boxes[1]?.w ?? 0).toBeGreaterThan(8);
    const webp = writeBytes(dir, "sale.webp", result.webp);
    const emptyWebp = writeBytes(dir, "empty.webp", result.emptyWebp);
    const webm = writeBytes(dir, "sale.webm", result.webm);
    const emptyWebm = writeBytes(dir, "empty.webm", result.emptyWebm);
    const mp4 = writeBytes(dir, "sale.mp4", result.mp4);
    const emptyMp4 = writeBytes(dir, "empty.mp4", result.emptyMp4);
    const webpInfo = probe(webp);
    const webmInfo = probe(webm);
    const mp4Info = probe(mp4);
    console.log(`ffprobe ${webp}\n${webpInfo}`);
    console.log(`ffprobe ${webm}\n${webmInfo}`);
    console.log(`ffprobe ${mp4}\n${mp4Info}`);
    const webpFramesOut = webpFrames(webp, join(dir, "webp-frames"));
    const emptyFrames = webpFrames(emptyWebp, join(dir, "empty-frames"));
    const webmFrames = splitFrames(rawRgba(webm), 160, 90);
    const emptyWebmFrames = splitFrames(rawRgba(emptyWebm), 160, 90);
    const mp4Frames = splitFrames(rawRgba(mp4), 160, 90);
    const emptyMp4Frames = splitFrames(rawRgba(emptyMp4), 160, 90);
    expect(webpFramesOut).toHaveLength(2);
    expect(emptyFrames).toHaveLength(2);
    expect(webmFrames).toHaveLength(2);
    expect(emptyWebmFrames).toHaveLength(2);
    expect(mp4Frames).toHaveLength(2);
    expect(emptyMp4Frames).toHaveLength(2);
    const mux = spawnSync("webpmux", ["-info", webp], { encoding: "utf8" });
    if (mux.status === 0) console.log(`webpmux -info ${webp}\n${mux.stdout.trim()}`);
    const first = result.boxes[0];
    const second = result.boxes[1];
    if (!first || !second) throw new Error("missing text box");
    console.log(`svg text box 0 ${JSON.stringify(first)} box 1 ${JSON.stringify(second)}`);
    const saleWebp = ink(webpFramesOut[0] ?? new Uint8ClampedArray(), 160, first, 3);
    const movedWebp = ink(webpFramesOut[1] ?? new Uint8ClampedArray(), 160, second, 3);
    const blankWebp = ink(emptyFrames[0] ?? new Uint8ClampedArray(), 160, first, 3);
    console.log(`webp ink ${saleWebp.inside} outside ${saleWebp.outside} moved ${movedWebp.inside} blank ${blankWebp.inside} dx ${Math.abs(saleWebp.cx - movedWebp.cx).toFixed(1)}`);
    expect(saleWebp.inside).toBeGreaterThan(10);
    expect(saleWebp.outside).toBe(0);
    expect(movedWebp.inside).toBeGreaterThan(10);
    expect(Math.abs(saleWebp.cx - movedWebp.cx)).toBeGreaterThan(8);
    expect(blankWebp.inside).toBe(0);
    const blankWebm = ink(emptyWebmFrames[0] ?? new Uint8ClampedArray(), 160, first, 8);
    const blankMp4 = ink(emptyMp4Frames[0] ?? new Uint8ClampedArray(), 160, first, 8);
    expect(blankWebm.inside).toBe(0);
    expect(blankMp4.inside).toBe(0);
    for (const [name, frames] of [
      ["webm", webmFrames],
      ["mp4", mp4Frames],
    ] as const) {
      const start = ink(frames[0] ?? new Uint8ClampedArray(), 160, first, 8);
      const later = ink(frames[1] ?? new Uint8ClampedArray(), 160, second, 8);
      console.log(`${name} ink ${start.inside} outside ${start.outside} moved ${later.inside} outside ${later.outside} dx ${Math.abs(start.cx - later.cx).toFixed(1)}`);
      expect(start.inside).toBeGreaterThan(5);
      expect(later.inside).toBeGreaterThan(5);
      expect(start.outside).toBe(0);
      expect(later.outside).toBe(0);
      expect(Math.abs(start.cx - later.cx)).toBeGreaterThan(8);
    }
    expect(webpInfo).toContain("webp");
    expect(webmInfo).toMatch(/vp8|vp9/);
    expect(mp4Info).toContain("h264");
  }, 60000);
});

function splitFrames(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray[] {
  const size = width * height * 4;
  const frames: Uint8ClampedArray[] = [];
  for (let offset = 0; offset + size <= data.length; offset += size) frames.push(data.subarray(offset, offset + size));
  return frames;
}
