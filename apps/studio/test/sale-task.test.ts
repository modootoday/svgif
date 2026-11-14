import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, relative } from "node:path";
import { createEditor, seedBlankShape, setLengthSeconds, setLoop, setText } from "../src/composition.ts";
import {
  ICON_CONTRAST_FLOOR,
  ICON_CONTRAST_MINIMUM,
  TEXT_CONTRAST_FLOOR,
  TEXT_CONTRAST_MINIMUM,
  contrastRatio,
  readableInk,
} from "../src/contrast.ts";
import { imageFile } from "../src/download-plain.ts";
import { canRedo, canUndo, createHistory, recordEdit, redoEdit, undoEdit } from "../src/history.ts";
import { applySimpleMotion, motionsFromDocuments, timingFromChoices } from "../src/motions.ts";
import { colorChoicesMarkup, shellMarkup, templateChoicesMarkup } from "../src/shell-markup.ts";
import { exportSupport } from "../src/export-support.ts";
import {
  MIN_WORD_FONT,
  SVG_INITIAL_FONT,
  TIGHT_WORD_HINT,
  applyTemplate,
  applyTemplateColor,
  fontScale,
  placeFittedWords,
  resolvedInk,
  templatesFromDocuments,
  wordFitBox,
  wordPlacement,
  type TemplateDef,
} from "../src/templates.ts";

const studio = join(import.meta.dir, "..");
const HEADLINE = "Sale 50%";
const LONG_HEADLINES = ["Black Friday 70% off", "Everything must go today"];
const DARK = "#141414";
const LIGHT = "#ffffff";
const WORD_MARGIN = 8;
const BANNED = [
  "timeline",
  "track",
  "json",
  "frame",
  "keyframe",
  "attr.d",
  "transform.",
  "codec",
  "backend",
  "capability",
  "smil",
  "offscreen",
  "preset",
  "css embedded",
  "offscreencanvas",
  "webp",
  "webm",
  "mp4",
  "gif",
];

function readTemplates(): TemplateDef[] {
  const dir = join(studio, "templates");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as unknown;
  const files: Record<string, unknown> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    files[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
  }
  return templatesFromDocuments(index, files);
}

function readMotions() {
  const dir = join(studio, "motions");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as unknown;
  const files: Record<string, unknown> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    files[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
  }
  return motionsFromDocuments(index, files);
}

function readTree(dir: string): string {
  const parts: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) parts.push(readTree(path));
    else parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}

function fillOf(tracks: { property: string; keys: { value: number | string | number[] }[] }[], property: string): string {
  const value = tracks.find((track) => track.property === property)?.keys[0]?.value;
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "";
}

function pathBounds(d: string): { x: number; y: number; width: number; height: number } | null {
  const tokens = d.match(/[MLHVZ]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;
  let x = 0;
  let y = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let index = 0;
  const num = (): number => Number(tokens[index++]);
  while (index < tokens.length) {
    const op = tokens[index++];
    if (!op) return null;
    if (op === "M" || op === "L") {
      x = num();
      y = num();
    } else if (op === "H") x = num();
    else if (op === "V") y = num();
    else if (op === "Z" || op === "z") continue;
    else return null;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function boxInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
  margin: number,
): boolean {
  return (
    inner.x >= outer.x + margin &&
    inner.y >= outer.y + margin &&
    inner.x + inner.width <= outer.x + outer.width - margin &&
    inner.y + inner.height <= outer.y + outer.height - margin
  );
}

function assertFrameMark(fill: string): void {
  for (const ground of [DARK, LIGHT]) {
    const ratio = contrastRatio(fill, ground);
    expect(ratio).toBeGreaterThanOrEqual(ICON_CONTRAST_MINIMUM);
    expect(ratio).toBeGreaterThanOrEqual(ICON_CONTRAST_FLOOR);
    expect(ratio - ICON_CONTRAST_MINIMUM).toBeGreaterThanOrEqual(0.5);
  }
}

describe("starting designs", () => {
  test("designs come from the list, and the source does not name a file", () => {
    const designs = readTemplates();
    expect(designs.length).toBeGreaterThan(0);
    const index = JSON.parse(readFileSync(join(studio, "templates/index.json"), "utf8")) as { files: string[] };
    expect(designs.map((item) => item.file)).toEqual(index.files);
    const source = readTree(join(studio, "src"));
    for (const file of index.files) {
      expect(source.includes(file)).toBe(false);
      expect(source.includes(file.replace(/\.json$/i, ""))).toBe(false);
    }
    const html = shellMarkup(exportSupport());
    const panelStart = html.indexOf('id="simple-panel"');
    const panel = html.slice(panelStart, html.indexOf("</aside>", panelStart));
    const shown = `${panel}\n${templateChoicesMarkup(designs, "")}\n${colorChoicesMarkup(designs[0]?.colors ?? [], 0)}`;
    for (const word of BANNED) expect(shown.toLowerCase()).not.toContain(word);
    for (const file of index.files) expect(shown.includes(file)).toBe(false);
  });

  test("every palette color keeps the words readable, and an essential mark clears both grounds", () => {
    const design = readTemplates()[0];
    if (!design) throw new Error("missing design");
    expect(design.label).toBe("Sale");
    for (const color of design.colors) {
      const ink = resolvedInk(color);
      const ratio = contrastRatio(ink, color.backdrop);
      expect(ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_MINIMUM);
      expect(ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
      expect(ratio - TEXT_CONTRAST_MINIMUM).toBeGreaterThanOrEqual(1);
      expect(ink).toBe(color.ink);
    }
    const weak = readableInk("#ffffff", "#f7f7f7", TEXT_CONTRAST_FLOOR);
    expect(contrastRatio(weak, "#ffffff")).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
    expect(weak).not.toBe("#f7f7f7");
    const backdrop = design.nodes.find((node) => node.paint === "backdrop");
    const badge = pathBounds(fillOf(backdrop?.tracks ?? [], "attr.d"));
    if (!badge) throw new Error("missing backdrop");
    const marks = design.nodes.filter((node) => node.essential === true);
    expect(marks.length).toBeGreaterThan(0);
    const state = createEditor();
    applyTemplate(state, design);
    for (const mark of marks) {
      const bounds = pathBounds(fillOf(mark.tracks, "attr.d"));
      if (!bounds) throw new Error("missing mark");
      const touchesFrame = !boxInside(bounds, badge, WORD_MARGIN);
      if (touchesFrame) {
        const fill = fillOf(mark.tracks, "attr.fill");
        assertFrameMark(fill);
        continue;
      }
      for (const color of design.colors) {
        const ink = resolvedInk(color);
        const ratio = contrastRatio(ink, color.backdrop);
        expect(ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
        expect(ratio - TEXT_CONTRAST_MINIMUM).toBeGreaterThanOrEqual(1);
      }
      const painted = state.composition.nodes.find((node) => state.marks[node.id] === true);
      expect(fillOf(painted?.tracks ?? [], "attr.fill")).toBe(resolvedInk(design.colors[0]!));
    }
    assertFrameMark("#7a7a7a");
  });

  test("a text node is placed with a translate and a font size, and each edit is one step", () => {
    const design = readTemplates()[0];
    if (!design) throw new Error("missing design");
    const words = design.nodes.find((node) => node.text !== undefined);
    if (!words || words.fontSize === undefined) throw new Error("missing words");
    const state = createEditor();
    seedBlankShape(state);
    const history = createHistory();
    expect(recordEdit(history, state, () => applyTemplate(state, design))).toBe(true);
    expect(history.undo).toHaveLength(1);
    const node = state.composition.nodes.find((item) => item.id === state.selection[0]);
    expect(node).toBeDefined();
    if (!node) return;
    expect(node.tracks.some((track) => track.property === "attr.d")).toBe(false);
    expect(state.texts[node.id]).toBe(words.text);
    expect(fillOf(node.tracks, "transform.translateX")).not.toBe("");
    expect(fillOf(node.tracks, "transform.translateY")).not.toBe("");
    const scale = fontScale(words.fontSize);
    expect(scale).toBe(words.fontSize / SVG_INITIAL_FONT);
    expect(fillOf(node.tracks, "transform.scaleX")).toBe(String(scale));
    expect(fillOf(node.tracks, "transform.scaleY")).toBe(String(scale));
    expect(recordEdit(history, state, () => setText(state, node.id, HEADLINE))).toBe(true);
    expect(state.texts[node.id]).toBe(HEADLINE);
    expect(node.tracks.some((track) => track.property === "attr.d")).toBe(false);
    expect(recordEdit(history, state, () => setText(state, node.id, HEADLINE))).toBe(false);
    expect(recordEdit(history, state, () => applyTemplateColor(state, design, 1))).toBe(true);
    expect(fillOf(node.tracks, "attr.fill")).toBe(resolvedInk(design.colors[1]!));
    const backdrop = state.composition.nodes.find((item) => state.paints[item.id] === "backdrop");
    expect(fillOf(backdrop?.tracks ?? [], "attr.fill")).toBe(design.colors[1]?.backdrop);
    expect(undoEdit(history, state)).toBe(true);
    expect(fillOf(node.tracks, "attr.fill")).toBe(resolvedInk(design.colors[0]!));
    expect(undoEdit(history, state)).toBe(true);
    expect(state.texts[node.id]).toBe(words.text);
    expect(undoEdit(history, state)).toBe(true);
    expect(state.startFile).toBe("");
    expect(state.composition.nodes).toHaveLength(1);
    expect(canUndo(history)).toBe(false);
    expect(redoEdit(history, state)).toBe(true);
    expect(state.startFile).toBe(design.file);
    expect(canRedo(history)).toBe(true);
  });

  test("motions, length, and loop still apply, and the download is live text", async () => {
    const design = readTemplates()[0];
    if (!design) throw new Error("missing design");
    const state = createEditor();
    const history = createHistory();
    recordEdit(history, state, () => applyTemplate(state, design));
    const node = state.composition.nodes.find((item) => item.id === state.selection[0]);
    if (!node) throw new Error("missing words");
    recordEdit(history, state, () => setText(state, node.id, HEADLINE));
    const slide = readMotions().find((motion) => motion.label === "Slide up");
    if (!slide) throw new Error("missing motion");
    const before = node.tracks.find((track) => track.property === "transform.translateY")?.keys.map((key) => key.frame);
    expect(recordEdit(history, state, () => applySimpleMotion(state, node.id, slide, timingFromChoices("normal", "none", state.composition.fps)))).toBe(true);
    const after = node.tracks.find((track) => track.property === "transform.translateY")?.keys.map((key) => key.frame);
    expect(after).not.toEqual(before);
    expect(state.texts[node.id]).toBe(HEADLINE);
    expect(recordEdit(history, state, () => setLengthSeconds(state, 4))).toBe(true);
    expect(recordEdit(history, state, () => setLoop(state, true))).toBe(true);
    expect(history.undo).toHaveLength(5);
    const svg = await imageFile(state).text();
    expect(svg).toContain(HEADLINE);
    expect(svg).toContain("<text ");
    expect(svg).toContain("%");
    expect(svg).toContain("infinite");
    expect(undoEdit(history, state)).toBe(true);
    expect(undoEdit(history, state)).toBe(true);
    expect(undoEdit(history, state)).toBe(true);
    const restored = state.composition.nodes.find((item) => item.id === node.id);
    expect(restored?.tracks.find((track) => track.property === "transform.translateY")?.keys.map((key) => key.frame)).toEqual(before);
    expect(svg).not.toContain(design.file);
    const wide = { x: 0, y: -12, width: 400, height: 22 };
    const badge = wordFitBox({ x: 60, y: 70, width: 520, height: 220 }, [{ x: 76, y: 162, width: 48, height: 48 }]);
    if (!badge) throw new Error("missing fit box");
    const placed = wordPlacement(wide, badge, fontScale(72), "center");
    if (!placed) throw new Error("missing placement");
    expect(placed.scale).toBeLessThan(fontScale(72));
    expect(placed.scale * wide.width).toBeLessThanOrEqual(badge.width + 0.01);
    expect(placed.scale * SVG_INITIAL_FONT).toBeLessThan(MIN_WORD_FONT);
    expect(placed.tight).toBe(true);
    const opening = design.nodes.find((item) => item.text !== undefined)?.text ?? "";
    const fitHistory = createHistory();
    const fitted = createEditor();
    recordEdit(fitHistory, fitted, () => applyTemplate(fitted, design));
    const fittedNode = fitted.composition.nodes.find((item) => item.id === fitted.selection[0]);
    if (!fittedNode) throw new Error("missing words");
    const beforeScale = fillOf(fittedNode.tracks, "transform.scaleX");
    expect(recordEdit(fitHistory, fitted, () => {
      setText(fitted, fittedNode.id, LONG_HEADLINES[0] ?? HEADLINE);
      expect(placeFittedWords(fitted, fittedNode.id, wide, badge)).toBe(true);
    })).toBe(true);
    expect(fillOf(fittedNode.tracks, "transform.scaleX")).not.toBe(beforeScale);
    expect(fitted.texts[fittedNode.id]).toBe(LONG_HEADLINES[0]);
    expect(fitted.tightWords[fittedNode.id]).toBe(true);
    expect(undoEdit(fitHistory, fitted)).toBe(true);
    const restoredFit = fitted.composition.nodes.find((item) => fitted.texts[item.id] !== undefined);
    expect(restoredFit).toBeDefined();
    expect(fitted.texts[restoredFit?.id ?? ""]).toBe(opening);
    expect(fillOf(restoredFit?.tracks ?? [], "transform.scaleX")).toBe(beforeScale);
    expect(fitted.tightWords[restoredFit?.id ?? ""]).toBeUndefined();
    const text = svg.slice(svg.indexOf("<text "), svg.indexOf("</text>"));
    expect(text).toContain(HEADLINE);
    expect(text).not.toContain("<path");
  });
});

function browserBin(): string {
  const candidates = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const name of candidates) {
    const path = Bun.which(name);
    if (path) return path;
  }
  return "";
}

interface RenderReport {
  text: string;
  inFrame: boolean;
  inBackdrop: boolean;
  margin: number;
  visibleInk: boolean;
  hit: string;
  markInside: boolean;
  markInk: boolean;
}

async function withBrowser<T>(run: (session: BrowserSession) => Promise<T>): Promise<T> {
  const bin = browserBin();
  if (!bin) throw new Error("no browser on PATH");
  const profile = mkdtempSync(join(tmpdir(), "svgif-sale-"));
  const chrome = spawn(
    bin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
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
    const debugPort = await new Promise<number>((resolvePort, rejectPort) => {
      const timer = setTimeout(() => rejectPort(new Error("browser did not open a debugging port")), 20000);
      chrome.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (match?.[1]) {
          clearTimeout(timer);
          resolvePort(Number(match[1]));
        }
      });
      chrome.on("exit", (code) => {
        clearTimeout(timer);
        rejectPort(new Error(`browser exited ${code}`));
      });
    });
    const version = (await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json())) as {
      webSocketDebuggerUrl: string;
    };
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", () => resolveOpen(), { once: true });
      socket.addEventListener("error", () => rejectOpen(new Error("browser socket failed")), { once: true });
    });
    const session = new BrowserSession(socket);
    try {
      return await run(session);
    } finally {
      socket.close();
    }
  } finally {
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

class BrowserSession {
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private sessionId = "";

  constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; error?: { message?: string }; result?: unknown };
      if (!message.id || !this.pending.has(message.id)) return;
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (!waiter) return;
      if (message.error) waiter.reject(new Error(message.error.message ?? "browser command failed"));
      else waiter.resolve(message.result);
    });
  }

  private send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    const id = ++this.nextId;
    const message: { id: number; method: string; params: Record<string, unknown>; sessionId?: string } = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify(message));
    });
  }

  async open(): Promise<void> {
    const created = (await this.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
    const attached = (await this.send("Target.attachToTarget", { targetId: created.targetId, flatten: true })) as {
      sessionId: string;
    };
    this.sessionId = attached.sessionId;
    await this.send("Runtime.enable", {}, this.sessionId);
    await this.send("Page.enable", {}, this.sessionId);
  }

  async setViewport(width: number, height: number, mobile: boolean): Promise<void> {
    await this.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile },
      this.sessionId,
    );
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 1 }, this.sessionId);
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url }, this.sessionId);
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const ready = await this.eval<string>(`document.readyState`);
      if (ready === "complete") return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
    }
    throw new Error(`page did not load ${url}`);
  }

  async setHtml(html: string): Promise<void> {
    const tree = (await this.send("Page.getFrameTree", {}, this.sessionId)) as { frameTree: { frame: { id: string } } };
    await this.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html }, this.sessionId);
  }

  async eval<T>(expression: string): Promise<T> {
    const result = (await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      this.sessionId,
    )) as { exceptionDetails?: { text?: string; exception?: { description?: string } }; result?: { value?: T } };
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "page error");
    }
    return result.result?.value as T;
  }
}

function serve(root: string): Promise<{ url: string; close: () => void }> {
  const types = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
  ]);
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      path = path.replace(/^\/+/, "");
      const file = normalize(join(root, path));
      const rel = relative(root, file);
      if (rel.startsWith("..")) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": types.get(extname(file)) ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveListen({
        url: `http://127.0.0.1:${port}/index.html`,
        close: () => server.close(),
      });
    });
  });
}

describe("rendered sale badge", () => {
  test("Sale 50% is inside the frame and visible for every palette color", async () => {
    const design = readTemplates()[0];
    if (!design) throw new Error("missing design");
    const pages: string[] = [];
    for (let index = 0; index < design.colors.length; index += 1) {
      const state = createEditor();
      applyTemplate(state, design);
      const nodeId = state.selection[0];
      if (!nodeId) throw new Error("missing words");
      setText(state, nodeId, HEADLINE);
      if (index > 0) applyTemplateColor(state, design, index);
      pages.push(await imageFile(state).text());
    }
    const html = `<!DOCTYPE html><body style="margin:0">${pages.map((svg, index) => `<div id="p${index}" style="width:${design.width}px;height:${design.height}px">${svg}</div>`).join("")}</body>`;
    const reports = await withBrowser(async (session) => {
      await session.open();
      await session.setViewport(design.width, Math.max(design.height, design.height * pages.length), false);
      await session.setHtml(html);
      return session.eval<RenderReport[]>(`(async () => {
        await document.fonts.ready;
        const inkOf = (value) => {
          const match = String(value).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
          if (!match) return null;
          return [Number(match[1]), Number(match[2]), Number(match[3])];
        };
        const distance = (left, right) => Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
        const svgs = [...document.querySelectorAll("svg")];
        return Promise.all(svgs.map((svg) => {
          const text = svg.querySelector("text");
          const paths = [...svg.querySelectorAll("path")];
          const backdrop = paths[0];
          const mark = paths[1];
          const range = document.createRange();
          range.selectNodeContents(text);
          const box = range.getBoundingClientRect();
          const frame = svg.getBoundingClientRect();
          const back = backdrop.getBoundingClientRect();
          const local = (inner, outer) => ({
            left: inner.left - outer.left,
            top: inner.top - outer.top,
            right: inner.right - outer.left,
            bottom: inner.bottom - outer.top,
          });
          const words = local(box, frame);
          const badge = local(back, frame);
          const margin = Math.min(words.left, words.top, frame.width - words.right, frame.height - words.bottom);
          const inside = (inner, outer) => inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
          const canvas = document.createElement("canvas");
          const xml = new XMLSerializer().serializeToString(svg);
          const image = new Image();
          const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
          return new Promise((resolve, reject) => {
            image.onload = () => {
              canvas.width = Math.round(frame.width);
              canvas.height = Math.round(frame.height);
              const context = canvas.getContext("2d");
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              const ink = inkOf(getComputedStyle(text).fill);
              const ground = inkOf(getComputedStyle(backdrop).fill);
              let visibleInk = false;
              if (ink && ground) {
                for (let step = 1; step < 8; step += 1) {
                  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(words.left + ((words.right - words.left) * step) / 8)));
                  const y = Math.min(canvas.height - 1, Math.max(0, Math.round((words.top + words.bottom) / 2)));
                  const pixel = context.getImageData(x, y, 1, 1).data;
                  const sample = [pixel[0], pixel[1], pixel[2]];
                  if (distance(sample, ink) + 40 < distance(sample, ground)) visibleInk = true;
                }
              }
              const mid = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
              const markBox = local(mark.getBoundingClientRect(), frame);
              URL.revokeObjectURL(url);
              resolve({
                text: text.textContent,
                inFrame: inside(words, { left: 0, top: 0, right: frame.width, bottom: frame.height }) && margin >= 8,
                inBackdrop: inside(words, badge) && Math.min(words.left - badge.left, words.top - badge.top, badge.right - words.right, badge.bottom - words.bottom) >= 8,
                margin,
                visibleInk,
                hit: mid ? mid.tagName.toLowerCase() : "",
                markInside: inside(markBox, badge) && Math.min(markBox.left - badge.left, markBox.top - badge.top, badge.right - markBox.right, badge.bottom - markBox.bottom) >= 8,
                markInk: getComputedStyle(mark).fill === getComputedStyle(text).fill,
              });
            };
            image.onerror = () => reject(new Error("svg did not paint"));
            image.src = url;
          });
        }));
      })()`);
    });
    expect(reports).toHaveLength(design.colors.length);
    for (const report of reports) {
      expect(report.text).toBe(HEADLINE);
      expect(report.text).toContain("%");
      expect(report.inFrame).toBe(true);
      expect(report.inBackdrop).toBe(true);
      expect(report.visibleInk).toBe(true);
      expect(report.hit).toBe("text");
      expect(report.margin).toBeGreaterThanOrEqual(8);
      expect(report.markInside).toBe(true);
      expect(report.markInk).toBe(true);
    }
  }, 60000);

  test("the sale task is 5 actions at 1440x900 and at 390x844", async () => {
    const page = join(studio, "dist/index.html");
    expect(exists(page)).toBe(true);
    const design = readTemplates()[0];
    if (!design) throw new Error("missing design");
    const color = design.colors[1];
    if (!color) throw new Error("missing color");
    const served = await serve(dirname(page));
    try {
      const counts = await withBrowser(async (session) => {
        await session.open();
        const viewports = [
          { width: 1440, height: 900, touch: false },
          { width: 390, height: 844, touch: true },
        ];
        const rows = [];
        for (const viewport of viewports) {
          await session.setViewport(viewport.width, viewport.height, viewport.touch);
          await session.navigate(`${served.url}?mode=simple`);
          const ready = await waitFor(session, `(() => {
            const button = [...document.querySelectorAll("#template-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(design.label)});
            return button ? "yes" : "";
          })()`);
          expect(ready).toBe("yes");
          await session.eval(`(() => {
            if (window.__svgifDownloadHook) return;
            window.__svgifDownloadHook = true;
            window.__svgifFiles = [];
            const orig = URL.createObjectURL.bind(URL);
            URL.createObjectURL = function (blob) {
              const url = orig(blob);
              window.__svgifFiles.push({ blob, name: "" });
              return url;
            };
            const click = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {
              const pending = window.__svgifFiles.filter((file) => !file.name);
              const last = pending[pending.length - 1];
              if (last && this.download) last.name = this.download;
              return click.call(this);
            };
          })()`);
          const task = await session.eval<{
            actions: number;
            svg: string;
            sizes: number[];
            panel: string;
            pageScroll: boolean;
          }>(`(() => {
            const touch = ${viewport.touch ? "true" : "false"};
            let actions = 0;
            const panel = document.querySelector("#simple-panel");
            const press = (node) => {
              const box = node.getBoundingClientRect();
              const view = panel.getBoundingClientRect();
              const x = box.left + box.width / 2;
              const y = box.top + box.height / 2;
              const seen = box.height >= 44 && box.width >= 44 && box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5 && y >= 0 && y <= window.innerHeight;
              const target = document.elementFromPoint(x, y);
              if (!seen || !target || (target !== node && !node.contains(target))) {
                throw new Error("control is not on screen " + JSON.stringify({
                  label: (node.id || node.textContent || "").trim(),
                  box: { top: box.top, bottom: box.bottom, left: box.left, width: box.width, height: box.height },
                  view: { top: view.top, bottom: view.bottom, height: view.height, scroll: panel.scrollHeight },
                  inner: window.innerHeight,
                  hit: target ? (target.id || target.tagName) : "",
                }));
              }
              if (touch) {
                node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1, clientX: x, clientY: y }));
                node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 1, clientX: x, clientY: y }));
                if (node.matches("input, textarea")) node.focus();
              } else {
                node.click();
              }
              actions += 1;
            };
            const start = [...document.querySelectorAll("#template-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(design.label)});
            press(start);
            const headline = document.querySelector("#headline");
            press(headline);
            headline.value = ${JSON.stringify(HEADLINE)};
            headline.dispatchEvent(new Event("change", { bubbles: true }));
            actions += 1;
            const swatch = [...document.querySelectorAll("#color-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(color.label)});
            press(swatch);
            const download = document.querySelector("#download-image");
            press(download);
            const file = (window.__svgifFiles || []).filter((item) => item.name === "animation.svg").pop();
            if (!file) throw new Error("download did not produce an svg");
            const sized = [
              [...document.querySelectorAll("#template-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(design.label)}),
              document.querySelector("#headline"),
              [...document.querySelectorAll("#color-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(color.label)}),
              document.querySelector("#download-image"),
            ];
            const sizes = sized.map((node) => {
              const box = node.getBoundingClientRect();
              return Math.min(box.width, box.height);
            });
            const root = document.documentElement;
            return file.blob.text().then((svg) => ({
              actions,
              svg,
              sizes,
              panel: panel.innerText,
              pageScroll: root.scrollHeight > root.clientHeight + 1,
            }));
          })()`);
          rows.push({ ...viewport, ...task });
        }
        return rows;
      });
      for (const row of counts) {
        expect(row.actions).toBe(5);
        expect(row.svg).toContain(HEADLINE);
        expect(row.svg).toContain("<text ");
        expect(row.svg).toContain("%");
        expect(row.sizes.every((size) => size >= 44)).toBe(true);
        const panel = row.panel.toLowerCase();
        for (const word of BANNED) expect(panel).not.toContain(word);
        expect(row.pageScroll).toBe(false);
      }
      expect(counts.map((row) => row.actions)).toEqual([5, 5]);
    } finally {
      served.close();
    }
  }, 60000);

  test("long headlines stay inside the badge at 1440x900 and at 390x844", async () => {
    const page = join(studio, "dist/index.html");
    expect(exists(page)).toBe(true);
    const design = readTemplates()[0];
    if (!design) throw new Error("missing design");
    const colors = design.colors.map((color) => color.label);
    const served = await serve(dirname(page));
    try {
      const rows = await withBrowser(async (session) => {
        await session.open();
        const viewports = [
          { width: 1440, height: 900, touch: false },
          { width: 390, height: 844, touch: true },
        ];
        const collected = [];
        for (const viewport of viewports) {
          await session.setViewport(viewport.width, viewport.height, viewport.touch);
          await session.navigate(`${served.url}?mode=simple`);
          const ready = await waitFor(session, `(() => {
            const button = [...document.querySelectorAll("#template-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(design.label)});
            return button ? "yes" : "";
          })()`);
          expect(ready).toBe("yes");
          await session.eval(`(() => {
            const button = [...document.querySelectorAll("#template-choices button")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(design.label)});
            button.click();
          })()`);
          for (const headline of LONG_HEADLINES) {
            const row = await session.eval<{
              undone: string;
              redone: string;
              taller: boolean;
              hint: string;
              samples: Array<{ label: string; text: string; inBadge: boolean; inFrame: boolean }>;
            }>(`(() => {
              const touch = ${viewport.touch ? "true" : "false"};
              const activate = (node) => {
                const panel = document.querySelector("#simple-panel");
                const box = node.getBoundingClientRect();
                const view = panel.getBoundingClientRect();
                if (box.top < view.top || box.bottom > view.bottom) panel.scrollTop += box.top - view.top;
                const next = node.getBoundingClientRect();
                const x = next.left + next.width / 2;
                const y = next.top + Math.min(next.height / 2, 20);
                if (touch) {
                  node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1, clientX: x, clientY: y }));
                  node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 1, clientX: x, clientY: y }));
                } else {
                  node.click();
                }
              };
              const readBox = () => {
                const svg = document.querySelector("#player-host svg");
                const text = svg ? svg.querySelector("text") : null;
                const badge = svg ? svg.querySelector("path") : null;
                if (!svg || !text || !badge) throw new Error("preview has no words");
                const ctm = svg.getScreenCTM().inverse();
                const rect = text.getBoundingClientRect();
                const map = (px, py) => {
                  const point = svg.createSVGPoint();
                  point.x = px;
                  point.y = py;
                  return point.matrixTransform(ctm);
                };
                const corners = [map(rect.left, rect.top), map(rect.right, rect.top), map(rect.right, rect.bottom), map(rect.left, rect.bottom)];
                const left = Math.min(...corners.map((point) => point.x));
                const right = Math.max(...corners.map((point) => point.x));
                const top = Math.min(...corners.map((point) => point.y));
                const bottom = Math.max(...corners.map((point) => point.y));
                const back = badge.getBBox();
                const frame = svg.viewBox.baseVal;
                const inside = (box, pad) => left >= box.x + pad && top >= box.y + pad && right <= box.x + box.width - pad && bottom <= box.y + box.height - pad;
                return {
                  text: text.textContent,
                  height: bottom - top,
                  inBadge: inside(back, 8),
                  inFrame: inside({ x: 0, y: 0, width: frame.width, height: frame.height }, 8),
                };
              };
              const field = document.querySelector("#headline");
              const opening = field.value;
              field.focus();
              field.value = ${JSON.stringify(headline)};
              field.dispatchEvent(new Event("change", { bubbles: true }));
              field.blur();
              const fitted = readBox();
              activate(document.querySelector("#undo"));
              const undoneBox = readBox();
              const undone = field.value;
              activate(document.querySelector("#redo"));
              const redone = field.value;
              const hint = document.querySelector("#headline-hint");
              const samples = ${JSON.stringify(colors)}.map((label) => {
                const swatch = [...document.querySelectorAll("#color-choices button")].find((node) => (node.textContent || "").trim() === label);
                activate(swatch);
                const box = readBox();
                return { label, text: box.text, inBadge: box.inBadge, inFrame: box.inFrame };
              });
              return {
                undone,
                redone,
                taller: undoneBox.height > fitted.height + 1 && undoneBox.text === opening,
                hint: hint.hidden ? "" : (hint.textContent || "").trim(),
                samples,
              };
            })()`);
            collected.push({ viewport: viewport.width, headline, ...row });
          }
          const tight = await session.eval<{ hint: string; inBadge: boolean; inFrame: boolean; before: string; undone: string }>(`(() => {
            const touch = ${viewport.touch ? "true" : "false"};
            const field = document.querySelector("#headline");
            const before = field.value;
            field.focus();
            field.value = ${JSON.stringify(`${LONG_HEADLINES[0]} `.repeat(24).trim())};
            field.dispatchEvent(new Event("change", { bubbles: true }));
            field.blur();
            const hint = document.querySelector("#headline-hint");
            const shown = hint.hidden ? "" : (hint.textContent || "").trim();
            const svg = document.querySelector("#player-host svg");
            const text = svg.querySelector("text");
            const badge = svg.querySelector("path");
            const ctm = svg.getScreenCTM().inverse();
            const rect = text.getBoundingClientRect();
            const map = (px, py) => {
              const point = svg.createSVGPoint();
              point.x = px;
              point.y = py;
              return point.matrixTransform(ctm);
            };
            const corners = [map(rect.left, rect.top), map(rect.right, rect.top), map(rect.right, rect.bottom), map(rect.left, rect.bottom)];
            const left = Math.min(...corners.map((point) => point.x));
            const right = Math.max(...corners.map((point) => point.x));
            const top = Math.min(...corners.map((point) => point.y));
            const bottom = Math.max(...corners.map((point) => point.y));
            const back = badge.getBBox();
            const frame = svg.viewBox.baseVal;
            const inside = (box, pad) => left >= box.x + pad && top >= box.y + pad && right <= box.x + box.width - pad && bottom <= box.y + box.height - pad;
            const undo = document.querySelector("#undo");
            if (touch) {
              const box = undo.getBoundingClientRect();
              undo.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 1, clientX: box.left + 4, clientY: box.top + 4 }));
            } else {
              undo.click();
            }
            const undoneText = document.querySelector("#player-host svg text");
            return {
              hint: shown,
              inBadge: inside(back, 8),
              inFrame: inside({ x: 0, y: 0, width: frame.width, height: frame.height }, 8),
              before,
              undone: undoneText ? undoneText.textContent : "",
            };
          })()`);
          collected.push({ viewport: viewport.width, headline: "tight", tight });
        }
        return collected;
      });
      for (const row of rows) {
        if (row.headline === "tight") {
          expect(row.tight?.hint).toBe(TIGHT_WORD_HINT);
          expect(row.tight?.inBadge).toBe(true);
          expect(row.tight?.inFrame).toBe(true);
          expect(row.tight?.undone).toBe(row.tight?.before);
          continue;
        }
        expect(row.undone).not.toBe(row.headline);
        expect(row.redone).toBe(row.headline);
        expect(row.taller).toBe(true);
        expect(row.hint).toBe("");
        expect(row.samples).toHaveLength(colors.length);
        for (const sample of row.samples ?? []) {
          expect(sample.text).toBe(row.headline);
          expect(sample.inBadge).toBe(true);
          expect(sample.inFrame).toBe(true);
        }
      }
    } finally {
      served.close();
    }
  }, 90000);
});

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

async function waitFor(session: BrowserSession, expression: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const value = await session.eval<string>(expression);
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  return "";
}
