/**
 * `export --browser`: run the shared export package in a local headless browser.
 *
 * The CLI serves the export package's own sources from a loopback HTTP server, with TypeScript
 * types stripped on the way out, opens them in a headless Chrome or Chromium through the DevTools
 * protocol, and reads the encoded file back. Nothing is installed and nothing leaves the machine:
 * the server listens on 127.0.0.1 only, serves only the engine and export sources, and stops with
 * the browser. [[sot:svgif/agent-surface]]
 *
 * The browser is `SVGIF_BROWSER` when set, else the first of the usual Chrome and Chromium names on
 * `PATH`. No browser is the `needs-browser` exit, the same as a missing `--browser`.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The raster formats this path writes, and the export function each one calls. */
export const BROWSER_EXPORTS = {
  webp: "exportAnimatedWebp",
  webm: "exportAnimatedWebm",
  mp4: "exportAnimatedMp4",
} as const;

export type BrowserFormat = keyof typeof BROWSER_EXPORTS;

export class BrowserUnavailable extends Error {}

export class BrowserExportFailed extends Error {}

const BROWSER_NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const START_TIMEOUT_MS = 30_000;
const MODULE_LOAD_FAILED = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/;
const EXPORT_TIMEOUT_MS = 300_000;

/** `packages/`: the server root. Only the two source trees below it are served. */
const PACKAGES = normalize(join(fileURLToPath(new URL(".", import.meta.url)), "..", ".."));
const SERVED = [`svgif${sep}src${sep}`, `svgif-export${sep}src${sep}`];

export function findBrowser(env: Record<string, string | undefined> = process.env): string | null {
  const chosen = env.SVGIF_BROWSER;
  if (chosen) return existsSync(chosen) ? chosen : null;
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const name of BROWSER_NAMES) {
      const candidate = join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  for (const candidate of MAC_BROWSERS) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Strip TypeScript types so the browser can load a source module as JavaScript. */
export async function toJavaScript(source: string): Promise<string> {
  const bun = (globalThis as { Bun?: { Transpiler: new (options: { loader: string }) => { transformSync(code: string): string } } }).Bun;
  if (bun) return new bun.Transpiler({ loader: "ts" }).transformSync(source);
  const module = (await import("node:module")) as { stripTypeScriptTypes?: (code: string, options: { mode: string }) => string };
  if (typeof module.stripTypeScriptTypes !== "function") {
    throw new BrowserExportFailed("this runtime cannot strip TypeScript types; use Node 22.13 or later, or Bun");
  }
  return module.stripTypeScriptTypes(source, { mode: "strip" });
}

/** The file a request path names, or null when it is outside the served trees. */
export function servedFile(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0] ?? "");
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.includes("\0")) return null;
  const relative = normalize(decoded.slice(1));
  if (relative.startsWith("..") || !relative.endsWith(".ts")) return null;
  if (!SERVED.some((prefix) => relative.startsWith(prefix))) return null;
  const file = join(PACKAGES, relative);
  if (!file.startsWith(PACKAGES)) return null;
  return isFile(file) ? file : null;
}

/**
 * Every response closes its connection. A kept-alive loopback socket that the server side closes
 * while the browser reuses it fails one module fetch, and the whole import with it.
 * Every 200 response states its length. Without it the body is chunked and ends when the socket
 * closes, so a close that lands before the last chunk fails the module fetch.
 * `problems` collects each request that was not served, for the error report.
 */
function serve(): Promise<{ server: Server; origin: string; problems: string[] }> {
  const problems: string[] = [];
  const close = { connection: "close" };
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      problems.push(`405 ${request.method} ${request.url}`);
      response.writeHead(405, close).end();
      return;
    }
    if (request.url === "/" || request.url === "/index.html") {
      const page = "<!doctype html><title>svgif export</title>";
      response.writeHead(200, { ...close, "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(page) }).end(page);
      return;
    }
    const file = servedFile(request.url ?? "");
    if (!file) {
      if (request.url !== "/favicon.ico") problems.push(`404 ${request.url}`);
      response.writeHead(404, close).end();
      return;
    }
    toJavaScript(readFileSync(file, "utf8")).then(
      (code) =>
        response
          .writeHead(200, { ...close, "content-type": "text/javascript; charset=utf-8", "content-length": Buffer.byteLength(code) })
          .end(code),
      (error: unknown) => {
        problems.push(`500 ${request.url}: ${error instanceof Error ? error.message : String(error)}`);
        response.writeHead(500, close).end();
      },
    );
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new BrowserExportFailed("the loopback server has no port"));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}`, problems });
    });
  });
}

interface Cdp {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
  close(): void;
}

function connect(url: string): Promise<Cdp> {
  const Socket = (globalThis as { WebSocket?: new (url: string) => WebSocket }).WebSocket;
  if (!Socket) throw new BrowserExportFailed("this runtime has no WebSocket client; use Node 22 or later, or Bun");
  const socket = new Socket(url);
  let next = 1;
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String((event as MessageEvent).data)) as {
      id?: number;
      result?: Record<string, unknown>;
      error?: { message?: string };
    };
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new BrowserExportFailed(message.error.message ?? "DevTools error"));
    else waiter.resolve(message.result ?? {});
  });
  const failAll = () => {
    for (const waiter of pending.values()) waiter.reject(new BrowserExportFailed("the browser closed the DevTools socket"));
    pending.clear();
  };
  socket.addEventListener("close", failAll);
  socket.addEventListener("error", failAll);
  return new Promise((resolve, reject) => {
    socket.addEventListener("error", () => reject(new BrowserExportFailed("the DevTools socket did not open")), { once: true });
    socket.addEventListener(
      "open",
      () =>
        resolve({
          send(method, params = {}, sessionId) {
            const id = next++;
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
            return new Promise((done, failed) => pending.set(id, { resolve: done, reject: failed }));
          },
          close() {
            socket.close();
          },
        }),
      { once: true },
    );
  });
}

function startBrowser(binary: string, profile: string): Promise<{ stop: () => Promise<void>; url: string }> {
  const child = spawn(
    binary,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--user-data-dir=${profile}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const exited = new Promise<void>((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", () => resolve());
  });
  /** Kill the browser and wait until it has exited, so its profile can be removed. */
  const stop = async () => {
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  };
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      void stop();
      reject(new BrowserExportFailed("the browser did not open a DevTools port"));
    }, START_TIMEOUT_MS);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve({ stop, url: match[1] });
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new BrowserUnavailable(`the browser could not start: ${error.message}`));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new BrowserExportFailed(`the browser exited ${code} before its DevTools port opened`));
    });
  });
}

/** The page-side script. It imports the export package and returns the file as base64. */
function exportScript(origin: string, name: string, composition: unknown): string {
  return `(async () => {
  const exporter = await import(${JSON.stringify(`${origin}/svgif-export/src/index.ts`)});
  try {
    const blob = await exporter[${JSON.stringify(name)}](${JSON.stringify(composition)});
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (let start = 0; start < bytes.length; start += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    }
    return { ok: true, data: btoa(text) };
  } catch (error) {
    return { ok: false, name: error && error.name, code: error && error.code, message: String(error && error.message || error) };
  }
})()`;
}

/**
 * Encode one raster format in a headless browser. Throws `BrowserUnavailable` when no browser is
 * found or it cannot start, and `BrowserExportFailed` when the page cannot encode the file.
 */
export async function exportInBrowser(
  format: BrowserFormat,
  composition: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<Uint8Array> {
  const binary = findBrowser(env);
  if (!binary) {
    throw new BrowserUnavailable("no Chrome or Chromium was found. Set SVGIF_BROWSER to the browser binary.");
  }
  const profile = mkdtempSync(join(tmpdir(), "svgif-cli-browser-"));
  const { server, origin, problems } = await serve();
  let browser: { stop: () => Promise<void>; url: string } | undefined;
  let cdp: Cdp | undefined;
  try {
    browser = await startBrowser(binary, profile);
    cdp = await connect(browser.url);
    const client = cdp;
    const attempt = async (): Promise<Uint8Array> => {
      // A new page each attempt: a page keeps a failed module fetch in its module map.
      const target = await client.send("Target.createTarget", { url: `${origin}/index.html` });
      const attached = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      const session = String(attached.sessionId);
      await client.send("Runtime.enable", {}, session);
      await waitForPage(client, session);
      const evaluation = client.send(
        "Runtime.evaluate",
        { expression: exportScript(origin, BROWSER_EXPORTS[format], composition), awaitPromise: true, returnByValue: true },
        session,
      );
      const outcome = (await withTimeout(evaluation, EXPORT_TIMEOUT_MS, `${format} export did not finish`)) as {
        result?: { value?: { ok: boolean; data?: string; code?: string; message?: string } };
        exceptionDetails?: { exception?: { description?: string }; text?: string };
      };
      if (outcome.exceptionDetails) {
        throw new BrowserExportFailed(outcome.exceptionDetails.exception?.description ?? outcome.exceptionDetails.text ?? "the page threw");
      }
      const value = outcome.result?.value;
      if (!value?.ok || typeof value.data !== "string") {
        const code = value?.code ? `${value.code}: ` : "";
        throw new BrowserExportFailed(`${code}${value?.message ?? "the page returned no file"}`);
      }
      return new Uint8Array(Buffer.from(value.data, "base64"));
    };
    try {
      return await attempt();
    } catch (error) {
      // Only a failed module load is retried. An encode the browser cannot do fails the same way twice.
      if (!(error instanceof BrowserExportFailed) || !MODULE_LOAD_FAILED.test(error.message)) throw error;
      const first = `${error.message}${problems.length > 0 ? ` Server: ${problems.join("; ")}.` : ""}`;
      problems.length = 0;
      try {
        return await attempt();
      } catch (retry) {
        const second = retry instanceof Error ? retry.message : String(retry);
        const served = problems.length > 0 ? ` Server: ${problems.join("; ")}.` : "";
        throw new BrowserExportFailed(`the export modules did not load twice. First: ${first} Second: ${second}${served}`);
      }
    }
  } finally {
    cdp?.close();
    await browser?.stop();
    server.close();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A profile left in the temp directory does not change the exported file.
    }
  }
}

async function waitForPage(cdp: Cdp, session: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = (await cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, session)) as {
      result?: { value?: string };
    };
    if (state.result?.value === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new BrowserExportFailed("the export page did not load");
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new BrowserExportFailed(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
