/**
 * The HTML blob matches the project schema and the identity meta tags.
 * The package does not open a socket and does not encode another codec.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]] [[sot:svgif/html-project]]
 */

import { describe, expect, test } from "bun:test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContract } from "../../../scripts/ci/check-schema.mjs";
import { exportHtml, htmlExporter, type HtmlProject } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as HtmlProject;
const host = "cdn.example.invalid";

const BANNED = ["WebSocket", "XMLHttpRequest", "fetch(", "node:http", "node:https", "node:net", "Date", "performance.now", "Math.random"];

function cloneProject(): HtmlProject {
  return JSON.parse(JSON.stringify(fixture)) as HtmlProject;
}

function scripts(html: string): { attrs: string; body: string }[] {
  const found: { attrs: string; body: string }[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let match = pattern.exec(html);
  while (match) {
    found.push({ attrs: match[1] ?? "", body: match[2] ?? "" });
    match = pattern.exec(html);
  }
  return found;
}

function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return match?.[1];
}

function meta(html: string, name: string): string | undefined {
  const match = new RegExp(`<meta name="${name}" content="([^"]*)">`).exec(html);
  return match?.[1];
}

describe("exportHtml", () => {
  test("validates the project script and the identity meta tags", async () => {
    const project = cloneProject();
    const before = JSON.stringify(project);
    const blob = exportHtml(project, { cdnHost: host });
    expect(JSON.stringify(project)).toBe(before);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("text/html");
    const html = await blob.text();
    expect(meta(html, "svgif:schema")).toBe(String(project.schemaVersion));
    expect(meta(html, "svgif:revision")).toBe(String(project.schemaRevision));
    expect(meta(html, "svgif:generator")).toBe(project.generator);
    const blocks = scripts(html);
    const payload = blocks.filter((block) => attr(block.attrs, "id") === "svgif-project");
    expect(payload).toHaveLength(1);
    expect(attr(payload[0]?.attrs ?? "", "type")).toBe("application/vnd.svgif.project+json");
    const parsed = JSON.parse(payload[0]?.body ?? "") as HtmlProject;
    expect(parsed).toEqual(project);
    expect(validateContract("project", parsed)).toEqual([]);
    expect(html.includes('id="svgif-edit">Edit</button>')).toBe(true);
    expect(html.includes('location.hash === "#edit"')).toBe(true);
    const player = blocks.find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(player).toBeDefined();
    expect(attr(player?.attrs ?? "", "src")).toBe(`https://${host}/svgif/${project.runtime.version}/svgif.mjs`);
    expect(attr(player?.attrs ?? "", "integrity")).toBe(project.runtime.sri);
    expect(attr(player?.attrs ?? "", "crossorigin")).toBe("anonymous");
    expect(html.includes("https://thumly.io/studio/studio.js")).toBe(true);
    expect(html.includes("https://thumly.io/studio/studio.css")).toBe(true);
    expect(html.includes(`https://${host}/svgif/${project.runtime.version}/studio.js`)).toBe(false);
    expect(html.includes(`https://${host}/svgif/${project.runtime.version}/studio.css`)).toBe(false);
    expect(html.includes("/svgif/latest/")).toBe(false);
    expect(htmlExporter.id).toBe("html");
    expect(htmlExporter.schema).toBe("svgif.exporter/1");
    expect(await htmlExporter.export(project, { cdnHost: host }).text()).toBe(html);
  });

  test("keeps a script-closing string inside the project JSON", async () => {
    const project = cloneProject();
    const composition = project.composition as {
      nodes: { tracks: { keys: { value: unknown }[] }[] }[];
    };
    const marker = "</script><script>alert(1)</script>";
    const key = composition.nodes[0]?.tracks[0]?.keys[0];
    if (!key) throw new Error("fixture key missing");
    key.value = marker;
    const html = await exportHtml(project, { cdnHost: host }).text();
    expect(html.includes("</script><script>")).toBe(false);
    const payload = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-project");
    const parsed = JSON.parse(payload?.body ?? "") as HtmlProject;
    const parsedKey = (parsed.composition as typeof composition).nodes[0]?.tracks[0]?.keys[0];
    expect(parsedKey?.value).toBe(marker);
    expect(validateContract("project", parsed)).toEqual([]);
  });

  test("inlines the player and can inline Studio", async () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    const html = await exportHtml(project, {
      playerSource: "const player = 1;\n",
      embedStudio: true,
      studioSource: "const studio = 1;\n",
      studioCss: "button { color: canvastext; }\n",
    }).text();
    const player = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(attr(player?.attrs ?? "", "src")).toBeUndefined();
    expect(player?.body).toContain("const player = 1;");
    expect(html.includes("svgif.mjs")).toBe(false);
    expect(html.includes("studio.js")).toBe(false);
    expect(html.includes('id="svgif-studio-source"')).toBe(true);
    expect(html.includes("const studio = 1;")).toBe(true);
    expect(html.includes("button { color: canvastext; }")).toBe(true);
  });

  test("escapes an inline player that contains a script end tag", async () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    const html = await exportHtml(project, {
      cdnHost: host,
      playerSource: "const end = '</script>';\n",
    }).text();
    expect(html.includes("'<\\/script>'")).toBe(true);
    const player = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(player?.body).toContain("const end");
  });

  test("rejects a document that is not revision 0", () => {
    const project = cloneProject();
    (project as { schemaRevision: number }).schemaRevision = 1;
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/schemaRevision/);
  });

  test("rejects a floating runtime version and a missing host", () => {
    const project = cloneProject();
    project.runtime.version = "latest";
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/exact version/);
    const again = cloneProject();
    expect(() => exportHtml(again)).toThrow(/cdnHost/);
    expect(() => exportHtml(again, { cdnHost: "https://cdn.example.invalid/svgif" })).toThrow(/hostname/);
  });

  test("rejects inline playback without player bytes and embedded Studio without sources", () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/playerSource/);
    expect(() => exportHtml(project, { playerSource: "ok", embedStudio: true })).toThrow(/studioCss/);
  });

  test("rejects a generator that is not this package", () => {
    const project = cloneProject();
    project.generator = "other@1.0.0";
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/generator/);
  });

  test("rejects a project that cannot carry the meta tags", () => {
    expect(() => exportHtml(null as unknown as HtmlProject, { cdnHost: host })).toThrow(/object/);
    const extra = cloneProject() as HtmlProject & { extra?: boolean };
    extra.extra = true;
    expect(() => exportHtml(extra, { cdnHost: host })).toThrow(/not allowed/);
    const sri = cloneProject();
    sri.runtime.sri = "nope";
    expect(() => exportHtml(sri, { cdnHost: host })).toThrow(/integrity/);
    const mode = cloneProject();
    (mode.runtime as { mode: string }).mode = "file";
    expect(() => exportHtml(mode, { cdnHost: host })).toThrow(/mode/);
    const generations = cloneProject();
    (generations.provenance as { generations: unknown }).generations = {};
    expect(() => exportHtml(generations, { cdnHost: host })).toThrow(/generations/);
  });

  test("loads Studio from Pages and keeps the player on the CDN pin", async () => {
    const project = cloneProject();
    const cdnHost = "cdn.thumly.io";
    const html = await exportHtml(project, { cdnHost }).text();
    const player = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(attr(player?.attrs ?? "", "src")).toBe(`https://${cdnHost}/svgif/${project.runtime.version}/svgif.mjs`);
    expect(attr(player?.attrs ?? "", "integrity")).toBe(project.runtime.sri);
    expect(attr(player?.attrs ?? "", "crossorigin")).toBe("anonymous");
    const boot = scripts(html).find((block) => block.body.includes("loadStudio"));
    expect(html.includes('id="svgif-edit">Edit</button>')).toBe(true);
    expect(boot?.body).toContain('getElementById("svgif-edit")');
    expect(boot?.body).toContain('location.hash === "#edit"');
    expect(boot?.body).toContain(`link.href = ${JSON.stringify("https://thumly.io/studio/studio.css")}`);
    expect(boot?.body).toContain(`link.integrity = ${JSON.stringify(project.runtime.studioSri.css)}`);
    expect(boot?.body).toContain('link.crossOrigin = "anonymous"');
    expect(boot?.body).toContain(`script.src = ${JSON.stringify("https://thumly.io/studio/studio.js")}`);
    expect(boot?.body).toContain(`script.integrity = ${JSON.stringify(project.runtime.studioSri.js)}`);
    expect(boot?.body).toContain('script.crossOrigin = "anonymous"');
    expect(html.includes(`https://${cdnHost}/svgif/${project.runtime.version}/studio.js`)).toBe(false);
    expect(html.includes(`https://${cdnHost}/svgif/${project.runtime.version}/studio.css`)).toBe(false);
    const source = readFileSync(resolve(srcDir, "html.ts"), "utf8");
    expect(source.includes('cdnFile(host, version, "studio.js")')).toBe(false);
    expect(source.includes('cdnFile(host, version, "studio.css")')).toBe(false);
    expect(source.includes("https://thumly.io/studio/studio.js")).toBe(true);
    expect(source.includes("https://thumly.io/studio/studio.css")).toBe(true);
  });

  test("loads Pages Studio when the player is inline and no CDN host is set", async () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    const html = await exportHtml(project, { playerSource: "const player = 1;\n" }).text();
    expect(html.includes("svgif.mjs")).toBe(false);
    expect(html.includes("https://thumly.io/studio/studio.js")).toBe(true);
    expect(html.includes("https://thumly.io/studio/studio.css")).toBe(true);
    const boot = scripts(html).find((block) => block.body.includes("loadStudio"));
    expect(boot?.body).toContain(`script.integrity = ${JSON.stringify(project.runtime.studioSri.js)}`);
    expect(boot?.body).toContain(`link.integrity = ${JSON.stringify(project.runtime.studioSri.css)}`);
  });

  test("writes a preview fit rule and falls back when the ratio is not a CSS number", async () => {
    const project = cloneProject();
    project.composition.width = 640;
    project.composition.height = 360;
    const html = await exportHtml(project, { cdnHost: host }).text();
    expect(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">')).toBe(true);
    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(style).toContain("margin: 0");
    expect(style).toContain("overflow-x: hidden");
    expect(style).toContain("#svgif-preview { max-width: 100%; }");
    expect(style).toContain("#svgif-preview svg { display: block; max-width: 100%; height: auto; aspect-ratio: 640 / 360; }");
    const missing = cloneProject();
    delete missing.composition.width;
    const missingHtml = await exportHtml(missing, { cdnHost: host }).text();
    expect(missingHtml).toContain("aspect-ratio: auto");
    const huge = cloneProject();
    huge.composition.width = 1e21;
    huge.composition.height = 360;
    const hugeHtml = await exportHtml(huge, { cdnHost: host }).text();
    expect(hugeHtml).toContain("aspect-ratio: auto");
    const bad = cloneProject();
    bad.composition.width = Number.POSITIVE_INFINITY;
    bad.composition.height = 0;
    const badHtml = await exportHtml(bad, { cdnHost: host }).text();
    expect(badHtml).toContain("aspect-ratio: auto");
  });

  test("fits a 640px preview inside a phone viewport", async () => {
    const project = cloneProject();
    project.composition.width = 640;
    project.composition.height = 360;
    const html = await exportHtml(project, { cdnHost: host }).text();
    const measured = await measurePreview(html, 640, 360, [
      [390, 844],
      [360, 640],
      [1440, 900],
    ]);
    for (const box of measured) {
      expect(box.clientWidth).toBeGreaterThan(0);
      expect(Math.abs(box.clientWidth - box.viewportWidth)).toBeLessThanOrEqual(20);
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
      expect(box.svgWidth).toBeLessThanOrEqual(box.clientWidth + 0.5);
      expect(box.svgX).toBeGreaterThanOrEqual(-1);
      expect(box.svgX + box.svgWidth).toBeLessThanOrEqual(box.clientWidth + 1);
      const expected = Math.min(640, box.clientWidth);
      expect(Math.abs(box.svgWidth - expected)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.svgWidth / box.svgHeight - 640 / 360)).toBeLessThan(0.02);
      if (box.viewportWidth <= 390) expect(box.svgWidth).toBeLessThan(648);
    }
  }, 30000);

  test("does not add a raster codec and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts", "mp4.ts", "svg.ts", "webm.ts", "webp.ts"]);
    const htmlSource = readFileSync(resolve(srcDir, "html.ts"), "utf8");
    expect(htmlSource.includes("image/webp")).toBe(false);
    expect(htmlSource.includes("video/webm")).toBe(false);
    expect(htmlSource.includes("video/mp4")).toBe(false);
    const source = files.map((file) => readFileSync(resolve(srcDir, file), "utf8")).join("\n");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes('id: "html"')).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
  });
});

interface PreviewBox {
  viewportWidth: number;
  viewportHeight: number;
  scrollWidth: number;
  clientWidth: number;
  svgWidth: number;
  svgHeight: number;
  svgX: number;
}

function browserBinary(): string {
  const fromEnv = process.env.SVGIF_SHELL_BROWSER ?? "";
  if (fromEnv.length > 0) return fromEnv;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      const found = execFileSync("which", [name], { encoding: "utf8" }).trim();
      if (found.length > 0) return found;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("no browser is on PATH");
}

/** The player mounts this preview. The measurement document uses that same markup. */
function measurementPage(html: string, width: number, height: number): string {
  const withoutPlayer = html.replace(/<script type="module" id="svgif-player"[\s\S]*?<\/script>\n?/, "");
  const preview = `<div id="svgif-preview"><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg></div>`;
  return withoutPlayer.replace("</body>", `${preview}\n</body>`);
}

function measurePreview(
  html: string,
  width: number,
  height: number,
  sizes: [number, number][],
): Promise<PreviewBox[]> {
  const directory = mkdtempSync(join(tmpdir(), "svgif-html-preview-"));
  const pagePath = join(directory, "index.html");
  writeFileSync(pagePath, measurementPage(html, width, height));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(pagePath));
  });
  const profile = mkdtempSync(join(tmpdir(), "svgif-html-chrome-"));
  let chrome: ChildProcess | undefined;
  const stop = () => {
    server.close();
    if (chrome && !chrome.killed) chrome.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  };
  return new Promise((resolveListen, rejectListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
    server.on("error", rejectListen);
  }).then(async () => {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("preview server has no port");
    const pageUrl = `http://127.0.0.1:${address.port}/`;
    chrome = spawn(
      browserBinary(),
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
    const debugPort = await new Promise<number>((resolvePort, rejectPort) => {
      const timer = setTimeout(() => rejectPort(new Error("browser did not open a debugging port")), 20000);
      chrome?.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (!match?.[1]) return;
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      });
      chrome?.on("exit", (code) => {
        clearTimeout(timer);
        rejectPort(new Error(`browser exited ${code} before the debugging port opened`));
      });
    });
    try {
      const version = (await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json())) as {
        webSocketDebuggerUrl: string;
      };
      const browser = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise<void>((resolveOpen, rejectOpen) => {
        browser.addEventListener("open", () => resolveOpen(), { once: true });
        browser.addEventListener("error", () => rejectOpen(new Error("browser socket failed")), { once: true });
      });
      let nextId = 0;
      const pending = new Map<number, { resolveSend: (value: unknown) => void; rejectSend: (error: Error) => void }>();
      const waiters: ((message: { method?: string; sessionId?: string }) => boolean)[] = [];
      const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
        const id = ++nextId;
        const message: { id: number; method: string; params: Record<string, unknown>; sessionId?: string } = { id, method, params };
        if (sessionId) message.sessionId = sessionId;
        return new Promise((resolveSend, rejectSend) => {
          pending.set(id, { resolveSend, rejectSend });
          browser.send(JSON.stringify(message));
        });
      };
      browser.addEventListener("message", (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as {
          id?: number;
          method?: string;
          sessionId?: string;
          error?: { message?: string };
          result?: unknown;
        };
        if (message.id && pending.has(message.id)) {
          const waiter = pending.get(message.id);
          pending.delete(message.id);
          if (!waiter) return;
          if (message.error) waiter.rejectSend(new Error(message.error.message ?? "browser command failed"));
          else waiter.resolveSend(message.result ?? {});
          return;
        }
        if (message.method) {
          for (let index = waiters.length - 1; index >= 0; index -= 1) {
            const waiter = waiters[index];
            if (waiter && waiter(message)) waiters.splice(index, 1);
          }
        }
      });
      const waitFor = (predicate: (message: { method?: string; sessionId?: string }) => boolean, label: string) =>
        new Promise<void>((resolveEvent, rejectEvent) => {
          const timer = setTimeout(() => rejectEvent(new Error(label)), 15000);
          waiters.push((message) => {
            if (!predicate(message)) return false;
            clearTimeout(timer);
            resolveEvent();
            return true;
          });
        });
      const created = (await send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
      const attached = (await send("Target.attachToTarget", { targetId: created.targetId, flatten: true })) as {
        sessionId: string;
      };
      const sessionId = attached.sessionId;
      await send("Page.enable", {}, sessionId);
      await send("Runtime.enable", {}, sessionId);
      const expression = `(() => {
        const svg = document.querySelector("#svgif-preview svg");
        const box = svg ? svg.getBoundingClientRect() : { x: 0, width: 0, height: 0 };
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          svgWidth: box.width,
          svgHeight: box.height,
          svgX: box.x
        };
      })()`;
      const boxes: PreviewBox[] = [];
      for (const [viewportWidth, viewportHeight] of sizes) {
        await send(
          "Emulation.setDeviceMetricsOverride",
          { width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: true },
          sessionId,
        );
        const loaded = waitFor(
          (message) => message.method === "Page.loadEventFired" && message.sessionId === sessionId,
          `load timed out at ${viewportWidth}x${viewportHeight}`,
        );
        await send("Page.navigate", { url: pageUrl }, sessionId);
        await loaded;
        const evaluated = (await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId)) as {
          result?: { value?: Omit<PreviewBox, "viewportWidth" | "viewportHeight"> };
        };
        const value = evaluated.result?.value;
        if (!value || value.clientWidth <= 0 || value.svgWidth <= 0) {
          throw new Error(`preview has no layout at ${viewportWidth}x${viewportHeight}`);
        }
        boxes.push({ viewportWidth, viewportHeight, ...value });
      }
      browser.close();
      return boxes;
    } finally {
      stop();
    }
  }).catch((error: unknown) => {
    stop();
    throw error;
  });
}
