/**
 * Error paths of `export --browser` that a real browser rarely takes.
 * A fake browser prints a DevTools URL for a scripted DevTools server, so each branch runs
 * without Chrome: a page exception, an export the page refuses, and a module load that fails
 * once or twice.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserExportFailed, BrowserUnavailable, exportInBrowser, servedFile } from "../src/browser.ts";

type Reply = Record<string, unknown>;

/** The replies to each export evaluation, in order. The page-ready check always answers true. */
let exportReplies: Reply[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
let dir = "";
let fakeBrowser = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request, bunServer) {
      if (bunServer.upgrade(request)) return undefined;
      return new Response("not a websocket", { status: 400 });
    },
    websocket: {
      message(socket, data) {
        const message = JSON.parse(String(data)) as { id: number; method: string; params?: { expression?: string } };
        let result: Reply = {};
        if (message.method === "Target.createTarget") result = { targetId: "target-1" };
        else if (message.method === "Target.attachToTarget") result = { sessionId: "session-1" };
        else if (message.method === "Runtime.evaluate") {
          const expression = message.params?.expression ?? "";
          result = expression.includes("location.origin") ? { result: { value: true } } : (exportReplies.shift() ?? {});
        }
        socket.send(JSON.stringify({ id: message.id, result }));
      },
    },
  });
  dir = mkdtempSync(join(tmpdir(), "svgif-cli-fake-browser-"));
  fakeBrowser = join(dir, "fake-browser");
  // It announces the scripted server as its DevTools port, then waits to be killed.
  writeFileSync(fakeBrowser, '#!/bin/sh\necho "DevTools listening on $SVGIF_FAKE_CDP" >&2\nexec sleep 60\n');
  chmodSync(fakeBrowser, 0o755);
  process.env.SVGIF_FAKE_CDP = `ws://127.0.0.1:${server.port}/devtools/browser/fake`;
});

afterAll(() => {
  server?.stop(true);
  delete process.env.SVGIF_FAKE_CDP;
  rmSync(dir, { recursive: true, force: true });
});

const env = () => ({ SVGIF_BROWSER: fakeBrowser });
const pageValue = (value: Reply): Reply => ({ result: { value } });
const loadFailed = (url: string): Reply => pageValue({ ok: false, message: `Failed to fetch dynamically imported module: ${url}` });

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("the export did not fail");
}

describe("export --browser error paths", () => {
  test("a path that cannot be decoded is not served", () => {
    expect(servedFile("/svgif-export/src/%E0%A4%A.ts")).toBeNull();
  });

  test("a browser that cannot start is no browser", async () => {
    const notExecutable = join(dir, "not-executable");
    writeFileSync(notExecutable, "plain text\n");
    chmodSync(notExecutable, 0o644);
    const error = await failure(exportInBrowser("webp", {}, { SVGIF_BROWSER: notExecutable }));
    expect(error).toBeInstanceOf(BrowserUnavailable);
    expect(error.message).toStartWith("the browser could not start");
  });

  test("a page exception is reported and not retried", async () => {
    exportReplies = [{ exceptionDetails: { exception: { description: "TypeError: boom" } } }, pageValue({ ok: true, data: "" })];
    const error = await failure(exportInBrowser("webm", {}, env()));
    expect(error).toBeInstanceOf(BrowserExportFailed);
    expect(error.message).toBe("TypeError: boom");
    expect(exportReplies).toHaveLength(1);
  }, 30_000);

  test("an export the page refuses carries its code", async () => {
    exportReplies = [pageValue({ ok: false, code: "codec-unsupported", message: "no H.264 encoder" })];
    const error = await failure(exportInBrowser("mp4", {}, env()));
    expect(error).toBeInstanceOf(BrowserExportFailed);
    expect(error.message).toBe("codec-unsupported: no H.264 encoder");
  }, 30_000);

  test("a module load that fails once is retried on a new page", async () => {
    exportReplies = [loadFailed("index.ts"), pageValue({ ok: true, data: Buffer.from("RIFF").toString("base64") })];
    const bytes = await exportInBrowser("webp", {}, env());
    expect(new TextDecoder().decode(bytes)).toBe("RIFF");
    expect(exportReplies).toHaveLength(0);
  }, 30_000);

  test("a module load that fails twice reports both attempts", async () => {
    exportReplies = [loadFailed("first.ts"), loadFailed("second.ts")];
    const error = await failure(exportInBrowser("webp", {}, env()));
    expect(error).toBeInstanceOf(BrowserExportFailed);
    expect(error.message).toStartWith("the export modules did not load twice.");
    expect(error.message).toContain("First: Failed to fetch dynamically imported module: first.ts");
    expect(error.message).toContain("Second: Failed to fetch dynamically imported module: second.ts");
  }, 30_000);
});
