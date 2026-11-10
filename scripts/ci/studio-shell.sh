#!/usr/bin/env bash
# Studio shell fit.
# Until apps/studio has a shell page, the Studio UI record must name the four
# viewports and the no-page-scroll rule. When a shell page exists, each
# viewport must keep the document within the viewport. No package is added.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
record="$root/.spec/sot/studio-ui.sot.md"

if [[ ! -f "$record" ]]; then
  echo "missing .spec/sot/studio-ui.sot.md" >&2
  exit 1
fi

python3 - "$record" <<'PY'
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text()
required = (
    "1440×900",
    "1024×768",
    "390×844",
    "360×640",
    "no-page-scroll rule",
)
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit("studio-ui record is missing " + ", ".join(missing))
print("studio ui record names the shell viewports and the no-page-scroll rule")
PY

page=""
if [[ -f "$root/apps/studio/dist/index.html" ]]; then
  page="$root/apps/studio/dist/index.html"
elif [[ -f "$root/apps/studio/index.html" ]]; then
  page="$root/apps/studio/index.html"
fi

if [[ -z "$page" ]]; then
  echo "no studio shell page; record check only"
  exit 0
fi

browser="${SVGIF_SHELL_BROWSER:-}"
if [[ -z "$browser" ]]; then
  for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      browser="$(command -v "$candidate")"
      break
    fi
  done
fi
if [[ -z "$browser" || ! -x "$browser" ]]; then
  echo "studio shell page exists but no browser is on PATH" >&2
  exit 1
fi

node --input-type=module - "$page" "$browser" <<'JS'
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";

const pagePath = resolve(process.argv[2]);
const browserBin = process.argv[3];
const root = dirname(pagePath);
const sizes = [
  [1440, 900],
  [1024, 768],
  [390, 844],
  [360, 640],
];

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function inside(path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(".."));
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    path = path.replace(/^\/+/, "");
    const file = normalize(join(root, path));
    if (!inside(file)) {
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

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const pageName = relative(root, pagePath).split("\\").join("/");
const pageUrl = (width, height) =>
  `http://127.0.0.1:${port}/${pageName}?width=${width}&height=${height}`;

const profile = mkdtempSync(join(tmpdir(), "svgif-shell-"));
const chrome = spawn(
  browserBin,
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

let debugPort = 0;
let stderr = "";
const portWait = new Promise((resolvePort, rejectPort) => {
  const timer = setTimeout(() => rejectPort(new Error("browser did not open a debugging port")), 20000);
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) {
      debugPort = Number(match[1]);
      clearTimeout(timer);
      resolvePort();
    }
  });
  chrome.on("exit", (code) => {
    clearTimeout(timer);
    rejectPort(new Error(`browser exited ${code} before the debugging port opened`));
  });
});

function stop() {
  server.close();
  if (!chrome.killed) chrome.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
}

try {
  await portWait;
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json());
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    browser.addEventListener("open", resolveOpen, { once: true });
    browser.addEventListener("error", () => rejectOpen(new Error("browser socket failed")), { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const waiters = [];

  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolveSend, rejectSend) => {
      pending.set(id, { resolveSend, rejectSend });
      browser.send(JSON.stringify(message));
    });
  }

  browser.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveSend, rejectSend } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectSend(new Error(`${message.error.message ?? "browser command failed"}`));
      else resolveSend(message.result ?? {});
      return;
    }
    if (message.method) {
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        if (waiters[index](message)) waiters.splice(index, 1);
      }
    }
  });

  function waitFor(predicate, label) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timer = setTimeout(() => rejectEvent(new Error(label)), 15000);
      waiters.push((message) => {
        if (!predicate(message)) return false;
        clearTimeout(timer);
        resolveEvent(message);
        return true;
      });
    });
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);

  const expression = `(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight
    };
  })()`;

  for (const [width, height] of sizes) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    const loaded = waitFor(
      (message) => message.method === "Page.loadEventFired" && message.sessionId === sessionId,
      `load timed out at ${width}x${height}`,
    );
    await send("Page.navigate", { url: pageUrl(width, height) }, sessionId);
    await loaded;
    const evaluated = await send(
      "Runtime.evaluate",
      { expression, returnByValue: true },
      sessionId,
    );
    const value = evaluated.result?.value;
    if (!value || value.clientWidth <= 0 || value.clientHeight <= 0) {
      throw new Error(`document has no layout at ${width}x${height}`);
    }
    if (value.scrollWidth > value.clientWidth || value.scrollHeight > value.clientHeight) {
      throw new Error(
        `document scrolls at ${width}x${height}: scroll ${value.scrollWidth}x${value.scrollHeight}, client ${value.clientWidth}x${value.clientHeight}`,
      );
    }
    console.log(
      `shell fit ${width}x${height}: scroll ${value.scrollWidth}x${value.scrollHeight} within client ${value.clientWidth}x${value.clientHeight}`,
    );
  }

  browser.close();
  statSync(pagePath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  stop();
}
process.exit(process.exitCode ?? 0);
JS
