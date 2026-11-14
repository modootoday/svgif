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
    "?mode=simple",
    "?mode=advanced",
    "segmented switch",
    "aria-pressed",
    "44",
    "Length in seconds",
    "Loop applies to SVG and HTML only",
    "2 actions",
    "clamps to that end",
    "Undo",
    "Redo",
    "Headline",
    "Download image",
    "Download video",
    "Making the video",
    "There is nothing to download yet",
    "This browser can't make a video",
    "Sale 50%",
    "animation.svg",
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
const pageUrl = (width, height, mode) => {
  const query = new URLSearchParams({
    width: String(width),
    height: String(height),
  });
  if (mode) query.set("mode", mode);
  return `http://127.0.0.1:${port}/${pageName}?${query.toString()}`;
};

const shellKey = "svgif-studio-shell";
const simpleExpr = `(() => {
  const doc = document.documentElement;
  const shown = (node) => {
    if (!node) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const trackNames = [...document.querySelectorAll(".key-name, .group-label")].some((node) => {
    if (!shown(node)) return false;
    const text = (node.textContent || "").trim();
    return node.classList.contains("key-name") || text === "Tracks";
  });
  const frameField = [...document.querySelectorAll("input, label")].some((node) => {
    if (!shown(node)) return false;
    if (node.getAttribute("aria-label") === "Frame") return true;
    if (node.getAttribute("data-edit") === "frame") return true;
    const text = (node.textContent || "").trim();
    return text === "Frame" || text.startsWith("Frame ");
  });
  const panel = document.querySelector("#simple-panel");
  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    scrollHeight: doc.scrollHeight,
    clientHeight: doc.clientHeight,
    shell: document.querySelector("#app")?.dataset.shell || "",
    timeline: shown(document.querySelector(".timeline")),
    trackNames,
    jsonDump: [...document.querySelectorAll(".json-dump, pre")].some((node) => shown(node)),
    frameField,
    panel: shown(panel),
    panelText: panel && shown(panel) ? panel.innerText : "",
    phoneTabs: shown(document.querySelector(".phone-tabs")),
    library: shown(document.querySelector(".library")),
    inspector: shown(document.querySelector(".inspector")),
    simpleName: (document.querySelector("#mode-simple")?.textContent || "").trim(),
    advancedName: (document.querySelector("#mode-advanced")?.textContent || "").trim(),
    simpleShown: shown(document.querySelector("#mode-simple")),
    advancedShown: shown(document.querySelector("#mode-advanced")),
    simplePressed: document.querySelector("#mode-simple")?.getAttribute("aria-pressed") === "true",
    advancedPressed: document.querySelector("#mode-advanced")?.getAttribute("aria-pressed") === "true",
    simpleBox: boxOf(document.querySelector("#mode-simple")),
    advancedBox: boxOf(document.querySelector("#mode-advanced")),
    memory: localStorage.getItem(${JSON.stringify(shellKey)}),
  };
  function boxOf(node) {
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  }
})()`;

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

  async function evalValue(expressionText, awaitPromise = false) {
    const evaluated = await send(
      "Runtime.evaluate",
      { expression: expressionText, returnByValue: true, awaitPromise },
      sessionId,
    );
    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.text || "page expression failed");
    }
    return evaluated.result?.value;
  }

  async function openAt(width, height, mode) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    const loaded = waitFor(
      (message) => message.method === "Page.loadEventFired" && message.sessionId === sessionId,
      `load timed out at ${width}x${height}`,
    );
    await send("Page.navigate", { url: pageUrl(width, height, mode) }, sessionId);
    await loaded;
  }

  function assertSwitchInside(facts, width, height) {
    for (const [name, box] of [
      ["Simple", facts.simpleBox],
      ["Advanced", facts.advancedBox],
    ]) {
      if (!box || box.width < 40 || box.height < 24) {
        throw new Error(`${name} is not visible at ${width}x${height}`);
      }
      if (box.left < -0.5 || box.top < -0.5 || box.right > facts.clientWidth + 0.5 || box.bottom > facts.clientHeight + 0.5) {
        throw new Error(
          `${name} is clipped at ${width}x${height}: ${box.left.toFixed(1)},${box.top.toFixed(1)} ${box.right.toFixed(1)},${box.bottom.toFixed(1)} in ${facts.clientWidth}x${facts.clientHeight}`,
        );
      }
    }
  }

  function assertNoScroll(value, width, height, label) {
    if (!value || value.clientWidth <= 0 || value.clientHeight <= 0) {
      throw new Error(`document has no layout at ${width}x${height} ${label}`);
    }
    if (value.scrollWidth > value.clientWidth || value.scrollHeight > value.clientHeight) {
      throw new Error(
        `document scrolls at ${width}x${height} ${label}: scroll ${value.scrollWidth}x${value.scrollHeight}, client ${value.clientWidth}x${value.clientHeight}`,
      );
    }
  }

  const banned = [
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
    await send("Page.navigate", { url: pageUrl(width, height, "advanced") }, sessionId);
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
    const memory = await evalValue(`localStorage.getItem(${JSON.stringify(shellKey)})`);
    if (memory !== null) {
      throw new Error(`?mode=advanced wrote the remembered choice at ${width}x${height}`);
    }
    console.log(
      `shell fit ${width}x${height}: scroll ${value.scrollWidth}x${value.scrollHeight} within client ${value.clientWidth}x${value.clientHeight}`,
    );
  }

  for (const [width, height] of sizes) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    const facts = await evalValue(simpleExpr);
    assertNoScroll(facts, width, height, "simple");
    if (facts.shell !== "simple") throw new Error(`default load was ${facts.shell} at ${width}x${height}`);
    if (facts.memory !== null) throw new Error(`default load wrote the remembered choice at ${width}x${height}`);
    if (facts.timeline) throw new Error(`.timeline is visible in simple mode at ${width}x${height}`);
    if (facts.trackNames) throw new Error(`track names are visible in simple mode at ${width}x${height}`);
    if (facts.jsonDump) throw new Error(`JSON dump is visible in simple mode at ${width}x${height}`);
    if (facts.frameField) throw new Error(`Frame field is visible in simple mode at ${width}x${height}`);
    if (facts.library || facts.inspector || facts.phoneTabs) {
      throw new Error(`advanced chrome is visible in simple mode at ${width}x${height}`);
    }
    if (!facts.simpleShown || !facts.advancedShown || facts.simpleName !== "Simple" || facts.advancedName !== "Advanced") {
      throw new Error(`segmented switch is missing in simple mode at ${width}x${height}`);
    }
    if (!facts.simplePressed || facts.advancedPressed) {
      throw new Error(`simple option is not pressed at ${width}x${height}`);
    }
    assertSwitchInside(facts, width, height);
    if (!facts.panel) throw new Error(`simple panel is missing at ${width}x${height}`);
    const panelText = String(facts.panelText || "").toLowerCase();
    for (const word of banned) {
      if (panelText.includes(word)) throw new Error(`simple panel shows ${word} at ${width}x${height}`);
    }
    await evalValue(`document.getElementById("mode-advanced").click()`);
    const advanced = await evalValue(simpleExpr);
    assertNoScroll(advanced, width, height, "after toggle");
    if (advanced.shell !== "advanced" || advanced.panel || !advanced.advancedPressed || advanced.simplePressed) {
      throw new Error(`switch did not select Advanced at ${width}x${height}`);
    }
    if (advanced.simpleName !== "Simple" || advanced.advancedName !== "Advanced") {
      throw new Error(`switch hid a name at ${width}x${height}`);
    }
    assertSwitchInside(advanced, width, height);
    if (advanced.memory !== "advanced") {
      throw new Error(`toggle did not remember Advanced at ${width}x${height}`);
    }
    if (width >= 768 && !advanced.timeline) {
      throw new Error(`Advanced timeline is not visible at ${width}x${height}`);
    }
    if (width < 768 && !advanced.phoneTabs) {
      throw new Error(`Advanced phone tabs are not visible at ${width}x${height}`);
    }
    console.log(`simple shell ${width}x${height}: toggle switches to Advanced`);
  }

  await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
  await openAt(1440, 900);
  let facts = await evalValue(simpleExpr);
  if (facts.shell !== "simple" || facts.memory !== null) {
    throw new Error("first visit was not simple");
  }
  await evalValue(`document.getElementById("mode-advanced").click()`);
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "advanced" || facts.memory !== "advanced" || !facts.advancedPressed || facts.simplePressed) {
    throw new Error("switch did not remember advanced");
  }
  await openAt(1440, 900);
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "advanced" || facts.memory !== "advanced") {
    throw new Error("remembered choice did not reopen advanced");
  }
  await openAt(1440, 900, "simple");
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "simple" || facts.memory !== "advanced" || !facts.simplePressed || facts.advancedPressed) {
    throw new Error("?mode=simple overwrote the remembered choice");
  }
  await openAt(1440, 900);
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "advanced" || facts.memory !== "advanced") {
    throw new Error("leaving ?mode=simple changed the remembered choice");
  }
  await openAt(1440, 900, "advanced");
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "advanced" || facts.memory !== "advanced") {
    throw new Error("?mode=advanced did not win over the remembered choice");
  }
  await evalValue(`document.getElementById("mode-simple").click()`);
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "simple" || facts.memory !== "simple" || !facts.simplePressed || facts.advancedPressed) {
    throw new Error("switch did not remember simple");
  }
  await openAt(1440, 900, "advanced");
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "advanced" || facts.memory !== "simple") {
    throw new Error("?mode=advanced overwrote the remembered choice");
  }
  await openAt(1440, 900);
  facts = await evalValue(simpleExpr);
  if (facts.shell !== "simple" || facts.memory !== "simple") {
    throw new Error("remembered simple did not win after ?mode=advanced");
  }
  console.log("simple shell memory: the url wins and does not overwrite; the switch remembers");

  const canvasExpr = `(() => {
    const shown = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const shape = document.querySelector("#player-host path[id], #player-host [id^='s-']");
    const svg = document.querySelector("#player-host svg");
    const direct = document.querySelector("#direct");
    const outline = document.querySelector("#direct-box");
    const handles = [...document.querySelectorAll(".direct-handle")].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        handle: node.getAttribute("data-handle") || "",
        width: box.width,
        height: box.height,
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
    });
    const shapeBox = shape ? shape.getBoundingClientRect() : null;
    const svgBox = svg ? svg.getBoundingClientRect() : null;
    const viewWidth = svg && svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
    const scale = svgBox && viewWidth > 0 ? svgBox.width / viewWidth : 0;
    const styleText = [...document.querySelectorAll("#player-host style")].map((node) => node.textContent || "").join("\\n");
    const translate = /translate\\(\\s*([-0-9.]+)px\\s*,\\s*([-0-9.]+)px\\s*\\)/.exec(styleText);
    const local = shape && typeof shape.getBBox === "function" ? shape.getBBox() : null;
    const outlineStyle = outline ? getComputedStyle(outline) : null;
    return {
      shell: document.querySelector("#app")?.dataset.shell || "",
      directShown: shown(direct),
      outlineShown: shown(outline),
      outlineWidth: outlineStyle ? parseFloat(outlineStyle.outlineWidth) || 0 : 0,
      outlineStyle: outlineStyle ? outlineStyle.outlineStyle : "",
      shape: shapeBox
        ? { left: shapeBox.left, top: shapeBox.top, width: shapeBox.width, height: shapeBox.height, right: shapeBox.right, bottom: shapeBox.bottom }
        : null,
      local: local ? { width: local.width, height: local.height } : null,
      d: shape && shape.getAttribute ? shape.getAttribute("d") || "" : "",
      scale,
      restX: translate ? Number(translate[1]) : 0,
      restY: translate ? Number(translate[2]) : 0,
      handles,
    };
  })()`;

  async function settle() {
    await evalValue("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))", true);
  }

  async function pointer(kind, x, y, pressed) {
    if (kind === "touch") {
      const type = pressed === "start" ? "touchStart" : pressed === "move" ? "touchMove" : "touchEnd";
      await send(
        "Input.dispatchTouchEvent",
        { type, touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 0 }] },
        sessionId,
      );
      return;
    }
    const type = pressed === "start" ? "mousePressed" : pressed === "move" ? "mouseMoved" : "mouseReleased";
    await send(
      "Input.dispatchMouseEvent",
      { type, x, y, button: "left", buttons: pressed === "end" ? 0 : 1, clickCount: 1 },
      sessionId,
    );
  }

  async function gesture(kind, x0, y0, x1, y1) {
    await pointer(kind, x0, y0, "start");
    const steps = 6;
    for (let step = 1; step <= steps; step += 1) {
      const x = x0 + ((x1 - x0) * step) / steps;
      const y = y0 + ((y1 - y0) * step) / steps;
      await pointer(kind, x, y, "move");
    }
    await pointer(kind, x1, y1, "end");
    await settle();
  }

  function hitAt(x, y) {
    return `(() => {
      const node = document.elementFromPoint(${x}, ${y});
      const handle = node && node.closest ? node.closest("[data-handle]") : null;
      return handle ? handle.getAttribute("data-handle") || "" : "";
    })()`;
  }

  async function assertCanvas(width, height, kind) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    if (kind === "touch") {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }, sessionId);
    }
    await settle();
    let facts = await evalValue(canvasExpr);
    if (facts.shell !== "simple") throw new Error(`canvas load was ${facts.shell} at ${width}x${height}`);
    if (!facts.shape || facts.shape.width < 8 || facts.shape.height < 8) {
      throw new Error(`blank shape is missing at ${width}x${height}`);
    }
    if (facts.directShown || facts.outlineShown) {
      throw new Error(`selection is showing before a click at ${width}x${height}`);
    }
    const cx = facts.shape.left + facts.shape.width / 2;
    const cy = facts.shape.top + facts.shape.height / 2;
    await gesture(kind, cx, cy, cx, cy);
    facts = await evalValue(canvasExpr);
    if (!facts.outlineShown || facts.outlineWidth < 1 || facts.outlineStyle === "none") {
      throw new Error(`selection outline is missing at ${width}x${height}`);
    }
    if (!Array.isArray(facts.handles) || facts.handles.length < 4) {
      throw new Error(`selection handles are missing at ${width}x${height}`);
    }
    for (const handle of facts.handles) {
      if (handle.width < 44 || handle.height < 44) {
        throw new Error(
          `handle ${handle.handle} is ${handle.width.toFixed(1)}x${handle.height.toFixed(1)} at ${width}x${height}`,
        );
      }
    }
    const southeast = facts.handles.find((handle) => handle.handle === "se");
    if (!southeast) throw new Error(`bottom right handle is missing at ${width}x${height}`);
    const hitX = southeast.left + southeast.width / 2 + 8;
    const hitY = southeast.top + southeast.height / 2 + 8;
    const hit = await evalValue(hitAt(hitX, hitY));
    if (hit !== "se") throw new Error(`bottom right handle is not the hit target at ${width}x${height}: ${hit}`);
    const before = facts;
    const drag = 48;
    await gesture(kind, cx, cy, cx + drag, cy + 30);
    facts = await evalValue(canvasExpr);
    if (!facts.shape || !before.shape || facts.scale <= 0) {
      throw new Error(`shape was lost after the move at ${width}x${height}`);
    }
    const expectedX = drag / before.scale;
    const expectedY = 30 / before.scale;
    if (Math.abs(facts.restX - before.restX - expectedX) > 1 || Math.abs(facts.restY - before.restY - expectedY) > 1) {
      throw new Error(
        `rest position at ${width}x${height} changed by ${(facts.restX - before.restX).toFixed(2)},${(facts.restY - before.restY).toFixed(2)}; drag in artboard units is ${expectedX.toFixed(2)},${expectedY.toFixed(2)}`,
      );
    }
    if (facts.d !== before.d) throw new Error(`move rewrote the shape size at ${width}x${height}`);
    const movedX = facts.shape.left - before.shape.left;
    const movedY = facts.shape.top - before.shape.top;
    if (movedX < drag * 0.5 || movedY < 15) {
      throw new Error(`shape did not follow the drag at ${width}x${height}: ${movedX.toFixed(1)},${movedY.toFixed(1)}`);
    }
    const grown = facts;
    const handleNow = grown.handles.find((handle) => handle.handle === "se");
    if (!handleNow || !grown.local) throw new Error(`handle was lost before resize at ${width}x${height}`);
    const hx = handleNow.left + handleNow.width / 2;
    const hy = handleNow.top + handleNow.height / 2;
    const grow = 36;
    await gesture(kind, hx, hy, hx + grow, hy + 24);
    facts = await evalValue(canvasExpr);
    if (!facts.local || !grown.local) throw new Error(`local size was lost at ${width}x${height}`);
    const sizeX = grow / grown.scale;
    const sizeY = 24 / grown.scale;
    if (facts.local.width < grown.local.width + sizeX - 1.5 || facts.local.height < grown.local.height + sizeY - 1.5) {
      throw new Error(
        `resize at ${width}x${height} went from ${grown.local.width.toFixed(2)}x${grown.local.height.toFixed(2)} to ${facts.local.width.toFixed(2)}x${facts.local.height.toFixed(2)}; expected about ${sizeX.toFixed(2)} by ${sizeY.toFixed(2)}`,
      );
    }
    if (facts.d === grown.d) throw new Error(`resize left the shape path unchanged at ${width}x${height}`);
    console.log(
      `canvas ${kind} ${width}x${height}: rest ${(facts.restX).toFixed(1)},${(facts.restY).toFixed(1)}; size ${facts.local.width.toFixed(1)}x${facts.local.height.toFixed(1)}`,
    );
  }

  await assertCanvas(1440, 900, "mouse");
  await assertCanvas(390, 844, "touch");

  const poseExpr = `(() => {
    const shape = document.querySelector("#player-host path[id], #player-host [id^='s-']");
    if (!shape) return null;
    const box = shape.getBoundingClientRect();
    const opacity = Number.parseFloat(getComputedStyle(shape).opacity);
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      opacity: Number.isFinite(opacity) ? opacity : 1,
    };
  })()`;

  function revealExpr(selector) {
    return `(() => {
      const panel = document.querySelector("#simple-panel");
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!panel || !node) return null;
      const panelBox = panel.getBoundingClientRect();
      let box = node.getBoundingClientRect();
      if (box.width <= 0 || box.top < panelBox.top + 2 || box.bottom > panelBox.bottom - 2) {
        panel.scrollTop += box.top - panelBox.top - 12;
        box = node.getBoundingClientRect();
      }
      return { left: box.left, top: box.top, width: box.width, height: box.height, text: (node.textContent || "").trim() };
    })()`;
  }

  async function tapBox(kind, box) {
    if (!box || box.width < 8 || box.height < 8) throw new Error("control has no box");
    const x = box.left + box.width / 2;
    const y = box.top + Math.min(box.height / 2, 22);
    await gesture(kind, x, y, x, y);
  }

  async function seekPose(fraction) {
    return evalValue(
      `(async () => {
        const animations = document.getAnimations();
        for (const animation of animations) {
          const timing = animation.effect && animation.effect.getComputedTiming();
          const duration = timing && typeof timing.duration === "number" ? timing.duration : 0;
          animation.pause();
          if (duration > 0) animation.currentTime = duration * ${fraction};
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const shape = document.querySelector("#player-host path[id], #player-host [id^='s-']");
        if (!shape) return { count: animations.length, pose: null };
        const box = shape.getBoundingClientRect();
        const style = getComputedStyle(shape);
        const opacity = Number.parseFloat(style.opacity);
        return {
          count: animations.length,
          playing: document.querySelector("#play")?.getAttribute("aria-pressed") === "true",
          seek: document.querySelector('[data-svgif-player="seek"]') !== null,
          pose: {
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            opacity: Number.isFinite(opacity) ? opacity : 1,
          },
        };
      })()`,
      true,
    );
  }

  async function assertMotions(width, height, kind) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    await send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: kind === "touch", maxTouchPoints: 1 },
      sessionId,
    );
    if (kind === "touch") {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
    }
    await settle();
    const ready = await evalValue(
      `(async () => {
        const start = Date.now();
        while (document.querySelectorAll(".motion-choice").length < 5 && Date.now() - start < 4000) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return document.querySelectorAll(".motion-choice").length;
      })()`,
      true,
    );
    if (ready < 5) throw new Error(`motion list did not load at ${width}x${height}`);
    let pose = await evalValue(poseExpr);
    if (!pose || pose.width < 8) throw new Error(`shape is missing before motion at ${width}x${height}`);
    await gesture(kind, pose.left + pose.width / 2, pose.top + pose.height / 2, pose.left + pose.width / 2, pose.top + pose.height / 2);
    const rest = await evalValue(poseExpr);
    const menu = await evalValue(revealExpr("#motion-menu"));
    await tapBox(kind, menu);
    const open = await evalValue(`(() => {
      const list = document.querySelector("#motion-choices");
      const button = document.querySelector("#motion-menu");
      const choices = [...document.querySelectorAll(".motion-choice")].map((node) => ({
        text: (node.textContent || "").trim(),
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      }));
      const words = (select) => [...(select ? select.options : [])].map((option) => (option.textContent || "").trim());
      const panel = document.querySelector("#simple-panel");
      const doc = document.documentElement;
      return {
        expanded: button?.getAttribute("aria-expanded") === "true",
        hidden: list ? list.hidden : true,
        choices,
        speed: words(document.querySelector("#motion-speed")),
        delay: words(document.querySelector("#motion-delay")),
        panelText: panel ? panel.innerText : "",
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
      };
    })()`);
    if (!open.expanded || open.hidden) throw new Error(`motion menu did not open at ${width}x${height}`);
    const labels = open.choices.map((choice) => choice.text);
    for (const label of ["Fade in", "Slide up", "Pop", "Bounce", "Pulse"]) {
      if (!labels.includes(label)) throw new Error(`motion menu is missing ${label} at ${width}x${height}`);
    }
    if (open.speed.join(",") !== "Slower,Normal,Faster") {
      throw new Error(`speed words at ${width}x${height}: ${open.speed.join(",")}`);
    }
    if (open.delay.join(",") !== "None,Short,Long") {
      throw new Error(`delay words at ${width}x${height}: ${open.delay.join(",")}`);
    }
    const panelText = String(open.panelText || "").toLowerCase();
    for (const word of banned) {
      if (panelText.includes(word)) throw new Error(`motion menu shows ${word} at ${width}x${height}`);
    }
    assertNoScroll(open, width, height, "motion menu");
    if (kind === "touch") {
      for (const choice of open.choices) {
        if (choice.width < 44 || choice.height < 44) {
          throw new Error(`${choice.text} is ${choice.width.toFixed(1)}x${choice.height.toFixed(1)} at ${width}x${height}`);
        }
      }
    }
    const slide = await evalValue(revealExpr('.motion-choice'));
    const slideBox = await evalValue(`(() => {
      const node = [...document.querySelectorAll(".motion-choice")].find((item) => (item.textContent || "").trim() === "Slide up");
      if (!node) return null;
      const panel = document.querySelector("#simple-panel");
      if (panel) {
        const panelBox = panel.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        if (box.top < panelBox.top + 2 || box.bottom > panelBox.bottom - 2) {
          panel.scrollTop += box.top - panelBox.top - 12;
        }
      }
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    })()`);
    if (!slide) throw new Error(`motion choices have no box at ${width}x${height}`);
    await tapBox(kind, slideBox);
    const play = await evalValue(`(() => {
      const node = document.querySelector("#play");
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height, pressed: node.getAttribute("aria-pressed") };
    })()`);
    if (!play || play.pressed === "true") throw new Error(`play was already on at ${width}x${height}`);
    await tapBox(kind, play);
    const started = await evalValue(`document.querySelector("#play")?.getAttribute("aria-pressed")`);
    if (started !== "true") throw new Error(`play did not start at ${width}x${height}`);
    const early = await seekPose(0.08);
    const late = await seekPose(0.8);
    if (!early.pose || !late.pose || early.count < 1) {
      throw new Error(`play did not expose the entrance at ${width}x${height}`);
    }
    if (early.seek || late.seek) throw new Error(`play left the page held at ${width}x${height}`);
    const moved = Math.abs(early.pose.top - late.pose.top);
    const faded = Math.abs(early.pose.opacity - late.pose.opacity);
    const scaled = Math.abs(early.pose.width - late.pose.width);
    if (moved < 8 && faded < 0.15 && scaled < 8) {
      throw new Error(
        `entrance did not change the pose at ${width}x${height}: top ${moved.toFixed(1)}, opacity ${faded.toFixed(2)}, width ${scaled.toFixed(1)}`,
      );
    }
    if (late.pose.opacity < 0.9 || late.pose.width < 8 || late.pose.height < 8) {
      throw new Error(`shape is not visible after the entrance at ${width}x${height}`);
    }
    if (!rest || Math.abs(late.pose.left - rest.left) > 3 || Math.abs(late.pose.top - rest.top) > 3) {
      throw new Error(
        `rest pose moved at ${width}x${height}: ${(late.pose.left - (rest ? rest.left : 0)).toFixed(1)},${(late.pose.top - (rest ? rest.top : 0)).toFixed(1)}`,
      );
    }
    console.log(
      `motion ${kind} ${width}x${height}: menu ${labels.length}; entrance moved ${moved.toFixed(1)}px; rest opacity ${late.pose.opacity.toFixed(2)}`,
    );
  }

  await assertMotions(1440, 900, "mouse");
  await assertMotions(390, 844, "touch");

  async function setLength(seconds) {
    return evalValue(`(() => {
      const input = document.querySelector("#length-seconds");
      if (!input) return null;
      input.value = ${JSON.stringify(String(seconds))};
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input.value;
    })()`);
  }

  async function loopBox() {
    return evalValue(`(() => {
      const node = document.querySelector("#loop-switch");
      const panel = document.querySelector("#simple-panel");
      if (!node || !panel) return null;
      const panelBox = panel.getBoundingClientRect();
      let box = node.getBoundingClientRect();
      if (box.width <= 0 || box.top < panelBox.top + 2 || box.bottom > panelBox.bottom - 2) {
        panel.scrollTop += box.top - panelBox.top - 12;
        box = node.getBoundingClientRect();
      }
      return {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        checked: node.checked === true,
        pressed: node.getAttribute("aria-checked"),
      };
    })()`);
  }

  async function lengthBox() {
    return evalValue(revealExpr("#length-seconds"));
  }

  async function exportedSvg() {
    const count = await evalValue(`(() => {
      const blobs = [];
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (blob) {
        blobs.push(blob);
        return orig(blob);
      };
      const button = document.querySelector("#export-svg");
      if (!button) return 0;
      button.click();
      window.__svgifExportBlobs = blobs;
      return blobs.length;
    })()`);
    if (count < 1) throw new Error("SVG export did not build a file");
    return evalValue(`window.__svgifExportBlobs[0].text()`, true);
  }

  function samePose(left, right) {
    if (!left || !right) return false;
    return (
      Math.abs(left.left - right.left) <= 1 &&
      Math.abs(left.top - right.top) <= 1 &&
      Math.abs(left.width - right.width) <= 1 &&
      Math.abs(left.height - right.height) <= 1 &&
      Math.abs(left.opacity - right.opacity) <= 0.02
    );
  }

  async function assertStillWrap(width, height, kind) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    await send("Emulation.setTouchEmulationEnabled", { enabled: kind === "touch", maxTouchPoints: 1 }, sessionId);
    if (kind === "touch") {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
    }
    await settle();
    const placed = await evalValue(poseExpr);
    if (!placed || placed.width < 8) throw new Error(`still shape is missing at ${width}x${height}`);
    const length = await lengthBox();
    if (!length || length.width < 44 || length.height < 44) {
      throw new Error(`length control is too small at ${width}x${height}`);
    }
    const seconds = await setLength(1);
    if (seconds !== "1") throw new Error(`length did not become 1 second at ${width}x${height}: ${seconds}`);
    const loop = await loopBox();
    if (!loop || loop.width < 44 || loop.height < 44) {
      throw new Error(`loop switch is too small at ${width}x${height}`);
    }
    await tapBox(kind, loop);
    const on = await loopBox();
    if (!on || !on.checked || on.pressed !== "true") throw new Error(`loop did not turn on at ${width}x${height}`);
    const play = await evalValue(`(() => {
      const node = document.querySelector("#play");
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    })()`);
    const stillPose = `(() => {
      const shape = document.querySelector("#player-host path[id], #player-host [id^='s-']");
      const svg = document.querySelector("#player-host svg");
      if (!shape || !svg) return null;
      const box = shape.getBoundingClientRect();
      const root = svg.getBoundingClientRect();
      const opacity = Number.parseFloat(getComputedStyle(shape).opacity);
      return {
        left: box.left - root.left,
        top: box.top - root.top,
        width: box.width,
        height: box.height,
        opacity: Number.isFinite(opacity) ? opacity : 1,
      };
    })()`;
    await tapBox(kind, play);
    await settle();
    const started = await evalValue(stillPose);
    await evalValue("new Promise((resolve) => setTimeout(resolve, 200))", true);
    const mid = await evalValue(stillPose);
    await evalValue("new Promise((resolve) => setTimeout(resolve, 1100))", true);
    const wrapped = await evalValue(stillPose);
    if (!samePose(started, mid) || !samePose(started, wrapped)) {
      throw new Error(
        `still element jumped at ${width}x${height}: start ${(started ? started.top : 0).toFixed(1)}, mid ${(mid ? mid.top : 0).toFixed(1)}, wrap ${(wrapped ? wrapped.top : 0).toFixed(1)}`,
      );
    }
    console.log(`still loop ${kind} ${width}x${height}: pose held across the wrap`);
  }

  async function assertTiming(width, height, kind) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    await send("Emulation.setTouchEmulationEnabled", { enabled: kind === "touch", maxTouchPoints: 1 }, sessionId);
    if (kind === "touch") {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
    }
    await settle();
    const ready = await evalValue(
      `(async () => {
        const start = Date.now();
        while (document.querySelectorAll(".motion-choice").length < 5 && Date.now() - start < 4000) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return document.querySelectorAll(".motion-choice").length;
      })()`,
      true,
    );
    if (ready < 5) throw new Error(`motion list did not load for timing at ${width}x${height}`);
    let pose = await evalValue(poseExpr);
    if (!pose || pose.width < 8) throw new Error(`shape is missing before timing at ${width}x${height}`);
    const rest = pose;
    await gesture(kind, pose.left + pose.width / 2, pose.top + pose.height / 2, pose.left + pose.width / 2, pose.top + pose.height / 2);
    const menu = await evalValue(revealExpr("#motion-menu"));
    await tapBox(kind, menu);
    const slideBox = await evalValue(`(() => {
      const node = [...document.querySelectorAll(".motion-choice")].find((item) => (item.textContent || "").trim() === "Slide up");
      if (!node) return null;
      const panel = document.querySelector("#simple-panel");
      if (panel) {
        const panelBox = panel.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        if (box.top < panelBox.top + 2 || box.bottom > panelBox.bottom - 2) {
          panel.scrollTop += box.top - panelBox.top - 12;
        }
      }
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    })()`);
    await tapBox(kind, slideBox);
    const length = await lengthBox();
    const loop = await loopBox();
    if (!length || length.width < 8 || length.height < 8) throw new Error(`length control is missing at ${width}x${height}`);
    if (!loop || loop.width < 8 || loop.height < 8) throw new Error(`loop switch is missing at ${width}x${height}`);
    if (kind === "touch" && (length.width < 44 || length.height < 44 || loop.width < 44 || loop.height < 44)) {
      throw new Error(`timing controls are below 44px at ${width}x${height}`);
    }
    const facts = await evalValue(simpleExpr);
    if (facts.frameField) throw new Error(`Frame field is visible during timing at ${width}x${height}`);
    const panelText = String(facts.panelText || "").toLowerCase();
    for (const word of banned) {
      if (panelText.includes(word)) throw new Error(`timing panel shows ${word} at ${width}x${height}`);
    }
    if (!panelText.includes("loop applies to svg and html only")) {
      throw new Error(`loop switch does not name SVG and HTML at ${width}x${height}`);
    }
    let actions = 0;
    const seconds = await setLength(4);
    actions += 1;
    if (seconds !== "4") throw new Error(`length action did not set 4 seconds at ${width}x${height}: ${seconds}`);
    const loopTarget = await loopBox();
    await tapBox(kind, loopTarget);
    actions += 1;
    if (actions !== 2) throw new Error(`length and loop took ${actions} actions at ${width}x${height}`);
    const turned = await loopBox();
    if (!turned || !turned.checked) throw new Error(`loop action did not turn the switch on at ${width}x${height}`);
    const svg = String(await exportedSvg());
    if (!svg.includes("4s linear 0s infinite")) {
      throw new Error(`exported SVG did not use 4 seconds and a repeat at ${width}x${height}`);
    }
    const play = await evalValue(`(() => {
      const node = document.querySelector("#play");
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    })()`);
    await tapBox(kind, play);
    const early = await seekPose(0);
    const late = await seekPose(0.55);
    if (!early.pose || !late.pose) throw new Error(`length change hid the entrance at ${width}x${height}`);
    const moved = Math.abs(early.pose.top - late.pose.top);
    if (moved < 8) throw new Error(`entrance was cut off or stretched at ${width}x${height}: ${moved.toFixed(1)}px`);
    if (!rest || Math.abs(late.pose.left - rest.left) > 3 || Math.abs(late.pose.top - rest.top) > 3) {
      throw new Error(`rest pose moved after the longer length at ${width}x${height}`);
    }
    const clamped = await setLength(0.2);
    const clampedNumber = Number(clamped);
    if (!Number.isFinite(clampedNumber) || clampedNumber <= 0.2) {
      throw new Error(`short length was not clamped at ${width}x${height}: ${clamped}`);
    }
    const clampedSvg = String(await exportedSvg());
    if (!clampedSvg.includes("1.2333s linear 0s infinite")) {
      throw new Error(`clamped export was not the entrance end at ${width}x${height}`);
    }
    if (clampedSvg.includes("0.2s linear")) throw new Error(`export kept the too-short length at ${width}x${height}`);
    await tapBox(kind, play);
    const held = await seekPose(0.9);
    if (!held.pose || Math.abs(held.pose.top - rest.top) > 3 || held.pose.opacity < 0.9) {
      throw new Error(`clamped length cut the entrance at ${width}x${height}`);
    }
    console.log(
      `timing ${kind} ${width}x${height}: 2 actions; export 4s infinite; clamp ${clamped}s; entrance moved ${moved.toFixed(1)}px`,
    );
  }

  await assertStillWrap(1440, 900, "mouse");
  await assertStillWrap(390, 844, "touch");
  await assertTiming(1440, 900, "mouse");
  await assertTiming(390, 844, "touch");

  async function historyState() {
    return evalValue(`(() => {
      const read = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        return {
          disabled: node.disabled === true,
          aria: node.getAttribute("aria-disabled"),
        };
      };
      return {
        undo: read("#undo"),
        redo: read("#redo"),
        headline: document.querySelector("#headline") ? document.querySelector("#headline").value : null,
      };
    })()`);
  }

  function expectStack(state, undoReady, redoReady, width, height, label) {
    if (!state?.undo || !state?.redo) throw new Error(`undo buttons are missing at ${width}x${height} ${label}`);
    const undoDisabled = !undoReady;
    const redoDisabled = !redoReady;
    if (state.undo.disabled !== undoDisabled || state.undo.aria !== (undoDisabled ? "true" : "false")) {
      throw new Error(`Undo was ${state.undo.disabled ? "disabled" : "enabled"} at ${width}x${height} ${label}`);
    }
    if (state.redo.disabled !== redoDisabled || state.redo.aria !== (redoDisabled ? "true" : "false")) {
      throw new Error(`Redo was ${state.redo.disabled ? "disabled" : "enabled"} at ${width}x${height} ${label}`);
    }
  }

  async function centerBox(selector) {
    return evalValue(`(() => {
      const panel = document.querySelector("#simple-panel");
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!panel || !node) return null;
      const panelBox = panel.getBoundingClientRect();
      const current = node.getBoundingClientRect();
      panel.scrollTop += current.top - (panelBox.top + (panelBox.height - current.height) / 2);
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height, text: (node.textContent || "").trim() };
    })()`);
  }

  async function setHeadline(text) {
    return evalValue(`(() => {
      const input = document.querySelector("#headline");
      if (!input) return null;
      input.focus();
      input.value = ${JSON.stringify(text)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
      return input.value;
    })()`);
  }

  async function assertUndo(width, height, kind) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    await send("Emulation.setTouchEmulationEnabled", { enabled: kind === "touch", maxTouchPoints: 1 }, sessionId);
    if (kind === "touch") {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
    }
    await settle();
    expectStack(await historyState(), false, false, width, height, "before an edit");
    let pose = await evalValue(canvasExpr);
    if (!pose?.shape || pose.shape.width < 8) throw new Error(`shape is missing before undo at ${width}x${height}`);
    const cx = pose.shape.left + pose.shape.width / 2;
    const cy = pose.shape.top + pose.shape.height / 2;
    await gesture(kind, cx, cy, cx, cy);
    expectStack(await historyState(), false, false, width, height, "after selecting");
    const headlineBox = await evalValue(revealExpr("#headline"));
    const undoBox = await evalValue(revealExpr("#undo"));
    const redoBox = await evalValue(revealExpr("#redo"));
    if (!headlineBox || !undoBox || !redoBox) throw new Error(`undo controls are missing at ${width}x${height}`);
    if (kind === "touch") {
      for (const [name, box] of [
        ["headline", headlineBox],
        ["undo", undoBox],
        ["redo", redoBox],
      ]) {
        if (box.width < 44 || box.height < 44) {
          throw new Error(`${name} is ${box.width.toFixed(1)}x${box.height.toFixed(1)} at ${width}x${height}`);
        }
      }
    }
    const facts = await evalValue(simpleExpr);
    if (facts.frameField) throw new Error(`Frame field is visible during undo at ${width}x${height}`);
    const panelText = String(facts.panelText || "").toLowerCase();
    for (const word of banned) {
      if (panelText.includes(word)) throw new Error(`undo panel shows ${word} at ${width}x${height}`);
    }
    pose = await evalValue(canvasExpr);
    const before = pose;
    await gesture(kind, cx, cy, cx + 48, cy + 30);
    pose = await evalValue(canvasExpr);
    if (!pose || !before || Math.abs(pose.restX - before.restX) < 1) {
      throw new Error(`move did not change the place at ${width}x${height}`);
    }
    expectStack(await historyState(), true, false, width, height, "after the drag");
    await tapBox(kind, await centerBox("#undo"));
    pose = await evalValue(canvasExpr);
    if (!pose || !before || Math.abs(pose.restX - before.restX) > 1 || Math.abs(pose.restY - before.restY) > 1) {
      throw new Error(`one undo did not restore the place from before the whole drag at ${width}x${height}`);
    }
    if (pose.d !== before.d) throw new Error(`move undo changed the shape at ${width}x${height}`);
    expectStack(await historyState(), false, true, width, height, "after undoing the drag");
    const selected = await historyState();
    if (selected.headline !== "Shape") {
      throw new Error(`headline was ${selected.headline} after selecting at ${width}x${height}`);
    }
    const typed = await setHeadline("Sale");
    if (typed !== "Sale") throw new Error(`headline did not become Sale at ${width}x${height}: ${typed}`);
    const sale = await evalValue(canvasExpr);
    if (!sale || sale.d === before.d) throw new Error(`headline edit left the picture unchanged at ${width}x${height}`);
    expectStack(await historyState(), true, false, width, height, "after the headline");
    await tapBox(kind, await centerBox("#undo"));
    const restored = await historyState();
    if (restored.headline !== "Shape") {
      throw new Error(`Undo did not restore the previous headline at ${width}x${height}: ${restored.headline}`);
    }
    const back = await evalValue(canvasExpr);
    if (!back || back.d !== before.d) throw new Error(`Undo did not restore the picture at ${width}x${height}`);
    expectStack(restored, false, true, width, height, "after undoing the headline");
    await tapBox(kind, await centerBox("#redo"));
    const redone = await historyState();
    if (redone.headline !== "Sale") {
      throw new Error(`Redo did not put the headline back at ${width}x${height}: ${redone.headline}`);
    }
    const again = await evalValue(canvasExpr);
    if (!again || again.d !== sale.d) throw new Error(`Redo did not put the picture back at ${width}x${height}`);
    expectStack(redone, true, false, width, height, "after redo");
    const replaced = await setHeadline("Hello");
    if (replaced !== "Hello") throw new Error(`new headline did not stick at ${width}x${height}: ${replaced}`);
    expectStack(await historyState(), true, false, width, height, "after a new edit cleared redo");
    console.log(`undo ${kind} ${width}x${height}: headline Sale restored, drag undone in one step`);
  }

  await assertUndo(1440, 900, "mouse");
  await assertUndo(390, 844, "touch");

  const unsupportedVideo = "This browser can't make a video. Try Download image.";
  const videoProgress = "Making the video\u2026";

  async function installDownloadHook() {
    await evalValue(`(() => {
      if (window.__svgifDownloadHook) return true;
      window.__svgifDownloadHook = true;
      window.__svgifFiles = [];
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (blob) {
        const url = orig(blob);
        window.__svgifFiles.push({ blob, name: "" });
        return url;
      };
      const proto = HTMLAnchorElement.prototype;
      const click = proto.click;
      proto.click = function () {
        const pending = window.__svgifFiles.filter((file) => !file.name);
        const last = pending[pending.length - 1];
        if (last && this.download) last.name = this.download;
        return click.call(this);
      };
      return true;
    })()`);
  }

  async function namedFiles(name) {
    return evalValue(`(() => {
      return (window.__svgifFiles || [])
        .filter((file) => file.name === ${JSON.stringify(name)})
        .map((file) => ({ name: file.name, size: file.blob.size, type: file.blob.type }));
    })()`);
  }

  async function fileText(name) {
    return evalValue(
      `(() => {
        const files = (window.__svgifFiles || []).filter((file) => file.name === ${JSON.stringify(name)});
        const last = files[files.length - 1];
        return last ? last.blob.text() : "";
      })()`,
      true,
    );
  }

  async function assertDownload(width, height, kind) {
    await evalValue(`localStorage.removeItem(${JSON.stringify(shellKey)})`);
    await openAt(width, height);
    await send("Emulation.setTouchEmulationEnabled", { enabled: kind === "touch", maxTouchPoints: 1 }, sessionId);
    if (kind === "touch") {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
    }
    await settle();
    await installDownloadHook();
    let pose = await evalValue(canvasExpr);
    if (!pose?.shape || pose.shape.width < 8) throw new Error(`shape is missing before download at ${width}x${height}`);
    const cx = pose.shape.left + pose.shape.width / 2;
    const cy = pose.shape.top + pose.shape.height / 2;
    await gesture(kind, cx, cy, cx, cy);
    const typed = await setHeadline("Sale 50%");
    if (typed !== "Sale 50%") throw new Error(`headline did not become Sale 50% at ${width}x${height}: ${typed}`);
    const facts = await evalValue(simpleExpr);
    assertNoScroll(facts, width, height, "download");
    if (facts.frameField) throw new Error(`Frame field is visible during download at ${width}x${height}`);
    const panelText = String(facts.panelText || "").toLowerCase();
    for (const word of banned) {
      if (panelText.includes(word)) throw new Error(`download panel shows ${word} at ${width}x${height}`);
    }
    const imageBox = await evalValue(revealExpr("#download-image"));
    const videoBox = await evalValue(revealExpr("#download-video"));
    if (!imageBox || imageBox.text !== "Download image") {
      throw new Error(`Download image is missing at ${width}x${height}: ${imageBox ? imageBox.text : "none"}`);
    }
    if (!videoBox) throw new Error(`Download video is missing at ${width}x${height}`);
    const videoLabel = videoBox.text;
    if (videoLabel !== "Download video" && videoLabel !== unsupportedVideo) {
      throw new Error(`Download video said ${videoLabel} at ${width}x${height}`);
    }
    for (const [name, box] of [
      ["Download image", imageBox],
      ["Download video", videoBox],
    ]) {
      if (box.width < 44 || box.height < 44) {
        throw new Error(`${name} is ${box.width.toFixed(1)}x${box.height.toFixed(1)} at ${width}x${height}`);
      }
    }
    await tapBox(kind, imageBox);
    await settle();
    const images = await namedFiles("animation.svg");
    if (!Array.isArray(images) || images.length < 1 || images[0].size < 1) {
      throw new Error(`Download image did not save a file at ${width}x${height}`);
    }
    const svg = String(await fileText("animation.svg"));
    if (!svg.includes("Sale 50%")) throw new Error(`downloaded SVG lacks the headline at ${width}x${height}`);
    if (!/<text[\s>]/.test(svg)) throw new Error(`downloaded SVG lacks live text at ${width}x${height}`);
    const shortened = await setLength(1);
    if (!shortened) throw new Error(`length could not be set before video at ${width}x${height}`);
    const beforeVideo = await evalValue(`(window.__svgifFiles || []).length`);
    await tapBox(kind, await evalValue(revealExpr("#download-video")));
    const started = Date.now();
    let outcome = null;
    while (Date.now() - started < 25000) {
      outcome = await evalValue(`(() => {
        const button = document.querySelector("#download-video");
        const files = (window.__svgifFiles || []).slice(${Number(beforeVideo)});
        const video = files.filter((file) => file.name === "animation.webm" || file.name === "animation.webp");
        const last = video[video.length - 1];
        return {
          label: button ? (button.textContent || "").trim() : "",
          size: last ? last.blob.size : 0,
          name: last ? last.name : "",
        };
      })()`);
      if (outcome && (outcome.size > 0 || outcome.label === unsupportedVideo)) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (!outcome || (outcome.size < 1 && outcome.label !== unsupportedVideo)) {
      throw new Error(
        `Download video neither saved a file nor explained itself at ${width}x${height}: ${outcome ? outcome.label : "missing"}`,
      );
    }
    if (outcome.size > 0 && outcome.name !== "animation.webm" && outcome.name !== "animation.webp") {
      throw new Error(`video file name was ${outcome.name} at ${width}x${height}`);
    }
    const after = await evalValue(simpleExpr);
    const afterText = String(after.panelText || "").toLowerCase();
    for (const word of banned) {
      if (afterText.includes(word)) throw new Error(`download panel shows ${word} after video at ${width}x${height}`);
    }
    if (afterText.includes(videoProgress.toLowerCase()) && outcome.size < 1 && outcome.label !== unsupportedVideo) {
      throw new Error(`video progress stayed up at ${width}x${height}`);
    }
    console.log(
      `download ${kind} ${width}x${height}: image ${images[0].size} bytes with Sale 50%; video ${
        outcome.size > 0 ? `${outcome.name} ${outcome.size} bytes` : "unsupported"
      }`,
    );
  }

  await assertDownload(1440, 900, "mouse");
  await assertDownload(390, 844, "touch");

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
