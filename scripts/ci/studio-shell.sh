#!/usr/bin/env bash
# Studio shell fit.
# Until apps/studio has a shell page, the Studio UI record must name the four
# viewports and the no-page-scroll rule. When a shell page exists, each
# viewport must keep the document within the viewport. Every text fill must
# meet 4.5:1 on each opaque surface it sits on, including a partial overlap.
# No package is added.
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

node "$root/scripts/ci/render-preset-index.mjs" --contrast

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
    const metrics = () => ({
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight,
    });
    const closed = metrics();
    const rect = (node) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return null;
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return null;
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const hits = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const icon = document.querySelector('link[rel="icon"]');
    const iconHref = icon ? icon.getAttribute("href") || "" : "";
    const app = document.querySelector(".app");
    const topbar = document.querySelector(".topbar");
    const timeline = document.querySelector(".timeline");
    const sash = document.querySelector(".sash-timeline");
    const sashBox = rect(sash);
    const seam = timeline ? timeline.getBoundingClientRect().top : 0;
    const bar = topbar ? topbar.getBoundingClientRect() : null;
    const hint = document.querySelector(".hint");
    const status = document.querySelector(".status-bar");
    if (status) status.textContent = "Saved HTML.";
    const modes = [
      ["library", ".library"],
      ["inspect", ".inspector"],
      ["timeline", ".timeline"],
    ];
    const sheets = [];
    if (app && window.innerWidth < 768) {
      for (const [mode, selector] of modes) {
        app.dataset.mode = mode;
        app.dataset.sheet = "90";
        const sheet = rect(document.querySelector(selector));
        const hintBox = rect(hint);
        const statusBox = rect(status);
        const zoom = rect(document.querySelector(".zoom-bar"));
        sheets.push({
          mode,
          sheetTop: sheet ? sheet.top : null,
          sheetBottom: sheet ? sheet.bottom : null,
          topBarBottom: bar ? bar.bottom : null,
          hintOverlapsSheet: hits(hintBox, sheet),
          statusOverlapsSheet: hits(statusBox, sheet),
          hintOverlapsStatus: hits(hintBox, statusBox),
          zoomOverlapsSheet: hits(zoom, sheet),
          zoomTop: zoom ? zoom.top : null,
          zoomBottom: zoom ? zoom.bottom : null,
        });
      }
    }
    const openScroll = metrics();
    return {
      scrollWidth: closed.scrollWidth,
      clientWidth: closed.clientWidth,
      scrollHeight: closed.scrollHeight,
      clientHeight: closed.clientHeight,
      openScroll,
      iconHref,
      sash: sashBox,
      seam,
      cursor: sash ? getComputedStyle(sash).cursor : "",
      sheets,
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
    const open = value.openScroll;
    if (open && (open.scrollWidth > open.clientWidth || open.scrollHeight > open.clientHeight)) {
      throw new Error(
        `document scrolls with the sheet open at ${width}x${height}: scroll ${open.scrollWidth}x${open.scrollHeight}, client ${open.clientWidth}x${open.clientHeight}`,
      );
    }
    if (!String(value.iconHref).startsWith("data:")) {
      throw new Error("studio document is missing an icon");
    }
    if (width === 1440 && height === 900) {
      const sash = value.sash;
      if (!sash) throw new Error("timeline sash has no box at 1440x900");
      const mid = (sash.top + sash.bottom) / 2;
      if (Math.abs(mid - value.seam) > 4) {
        throw new Error(
          `timeline sash is off the seam at 1440x900: sash ${sash.top.toFixed(1)}-${sash.bottom.toFixed(1)}, seam ${value.seam.toFixed(1)}`,
        );
      }
      if (sash.top < -0.5 || sash.bottom > value.clientHeight + 0.5 || sash.left < -0.5 || sash.right > value.clientWidth + 0.5) {
        throw new Error(
          `timeline sash leaves the viewport at 1440x900: ${sash.left.toFixed(1)},${sash.top.toFixed(1)} ${sash.right.toFixed(1)},${sash.bottom.toFixed(1)}`,
        );
      }
      if (value.cursor !== "row-resize") {
        throw new Error(`timeline sash is not a row resize handle at 1440x900: ${value.cursor}`);
      }
      console.log(
        `sash on seam at 1440x900: ${sash.top.toFixed(1)}-${sash.bottom.toFixed(1)} around ${value.seam.toFixed(1)}`,
      );
    }
    if (width < 768) {
      if (!Array.isArray(value.sheets) || value.sheets.length !== 3) {
        throw new Error(`phone sheet was not measured at ${width}x${height}`);
      }
      for (const row of value.sheets) {
        if (row.sheetTop === null || row.topBarBottom === null) {
          throw new Error(`sheet ${row.mode} has no box at ${width}x${height}`);
        }
        if (row.sheetTop + 0.5 < row.topBarBottom) {
          throw new Error(
            `sheet ${row.mode} covers the top bar at ${width}x${height}: sheet top ${row.sheetTop.toFixed(1)}, top bar bottom ${row.topBarBottom.toFixed(1)}`,
          );
        }
        if (row.hintOverlapsSheet || row.statusOverlapsSheet || row.hintOverlapsStatus) {
          throw new Error(`hint or status overlaps the open ${row.mode} sheet at ${width}x${height}`);
        }
        if (row.zoomOverlapsSheet || row.zoomBottom === null || row.zoomBottom > row.sheetTop + 0.5) {
          throw new Error(
            `zoom is covered by the ${row.mode} sheet at ${width}x${height}: zoom bottom ${row.zoomBottom}, sheet top ${row.sheetTop}`,
          );
        }
        console.log(
          `sheet ${row.mode} at ${width}x${height}: top ${row.sheetTop.toFixed(1)} below top bar ${row.topBarBottom.toFixed(1)}`,
        );
      }
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
