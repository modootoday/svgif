/**
 * Scrub and static mounts.
 * The player module must not read the wall clock.
 * Raster export is not playback of CSS or SMIL.
 * [[sot:svgif/animation-backends]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCss } from "../src/backend/css/index.ts";
import { compile as compileSmil } from "../src/backend/smil/index.ts";
import { formatUnit, type TimelineIr } from "../src/ir/index.ts";
import {
  mount,
  player,
  type PlayerArtifact,
  type PlayerComposition,
  type PlayerHost,
  type PlayerMode,
  type SmilTimed,
} from "../src/player/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const playerEntry = resolve(here, "../src/player/index.ts");

const WALL_CLOCK = ["Date", "performance.now", "performance", "Math.random", "requestAnimationFrame"];

function filesReachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  const importFrom = /from\s+["'](\.[^"']+)["']/g;
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    importFrom.lastIndex = 0;
    let match = importFrom.exec(text);
    while (match) {
      const spec = match[1];
      if (spec) {
        let next = resolve(dirname(file), spec);
        if (!next.endsWith(".ts")) next += ".ts";
        pending.push(next);
      }
      match = importFrom.exec(text);
    }
  }
  return [...seen];
}

class Host implements PlayerHost {
  innerHTML = "";
  timed: SmilTimed | null = null;
  queries: string[] = [];
  querySelector(selectors: string): SmilTimed | null {
    this.queries.push(selectors);
    if (selectors !== "svg" || !this.innerHTML.includes("<svg")) return null;
    return this.timed;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><g id="s-box"></g></svg>`;
const css = `#s-box {\n  animation: s-box-opacity 0.1333s linear 0s 1 normal both;\n}\n`;

function artifact(backend: PlayerArtifact["backend"], withCss = true): PlayerArtifact {
  if (backend === "css-external") return { backend, svg, css: withCss ? css : undefined };
  return { backend, svg, css: withCss ? css : undefined };
}

function composition(backend: PlayerArtifact["backend"], renderFrame?: (frame: number) => string): PlayerComposition {
  return {
    fps: 30,
    durationInFrames: 4,
    artifact: artifact(backend),
    renderFrame,
  };
}

function delayOf(frame: number, fps = 30): string {
  if (frame === 0) return "0s";
  return `-${formatUnit(frame / fps)}s`;
}

const ir: TimelineIr = {
  fps: 30,
  width: 32,
  height: 32,
  durationInFrames: 4,
  nodes: [
    {
      id: "s-box",
      tracks: [
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 0 },
            { frame: 3, value: 1, easing: "linear" },
          ],
        },
      ],
    },
  ],
};

describe("player mount", () => {
  test("static inserts the artifact and leaves CSS and SMIL running", () => {
    const calls: number[] = [];
    const host = new Host();
    host.timed = {
      setCurrentTime(seconds) {
        calls.push(seconds);
      },
    };
    const rendered: number[] = [];
    const handle = player.mount(host, composition("css-external", (frame) => {
      rendered.push(frame);
      return svg;
    }), { mode: "static", frame: 2 });

    expect(handle.mode).toBe("static");
    expect(handle.frame).toBe(0);
    expect(host.innerHTML).toContain(css);
    expect(host.innerHTML).toContain(svg);
    expect(host.innerHTML).not.toContain("animation-play-state");
    expect(host.innerHTML).not.toContain('data-svgif-player="seek"');
    expect(host.queries).toEqual([]);
    expect(calls).toEqual([]);
    expect(rendered).toEqual([]);
    expect(() => handle.seek(1)).toThrow("static mode does not seek");
    expect(host.innerHTML).toContain(svg);

    const embedded = new Host();
    const embeddedHandle = mount(embedded, composition("css-embedded"), { mode: "static" });
    expect(embedded.innerHTML).toBe(svg);
    expect(embedded.innerHTML).not.toContain("<style");
    embeddedHandle.unmount();
    expect(embedded.innerHTML).toBe("");
    embeddedHandle.unmount();
    expect(() => embeddedHandle.seek(0)).toThrow("static mode does not seek");

    const smil = new Host();
    smil.timed = host.timed;
    const smilHandle = mount(smil, composition("smil", (frame) => {
      rendered.push(frame);
      return `<svg id="frame-${frame}"></svg>`;
    }), { mode: "static" });
    expect(smil.innerHTML).toBe(svg);
    expect(smil.queries).toEqual([]);
    expect(calls).toEqual([]);
    expect(rendered).toEqual([]);
    smilHandle.unmount();
  });

  test("scrub pauses CSS at a negative delay equal to the frame time", () => {
    const rendered: number[] = [];
    const host = new Host();
    const handle = mount(host, composition("css-embedded", (frame) => {
      rendered.push(frame);
      return `<svg id="raster-${frame}"></svg>`;
    }), { mode: "scrub", frame: 2 });

    expect(handle.mode).toBe("scrub");
    expect(handle.frame).toBe(2);
    expect(host.innerHTML).toContain(svg);
    expect(host.innerHTML).toContain('data-svgif-player="root"');
    expect(host.innerHTML).toContain("animation-play-state: paused !important;");
    expect(host.innerHTML).toContain(`animation-delay: ${delayOf(2)} !important;`);
    expect(host.innerHTML).not.toContain('data-svgif-player="artifact"');
    expect(host.queries).toEqual([]);
    expect(rendered).toEqual([]);

    handle.seek(2);
    const again = host.innerHTML;
    handle.seek(1);
    expect(handle.frame).toBe(1);
    expect(host.innerHTML).toContain(`animation-delay: ${delayOf(1)} !important;`);
    expect(host.innerHTML).not.toContain(`animation-delay: ${delayOf(2)} !important;`);
    expect(host.innerHTML).not.toBe(again);
    handle.seek(2);
    expect(host.innerHTML).toBe(again);
    expect(rendered).toEqual([]);

    handle.seek(0);
    expect(host.innerHTML).toContain("animation-delay: 0s !important;");
    handle.seek(-4);
    expect(handle.frame).toBe(0);
    handle.seek(99);
    expect(handle.frame).toBe(3);
    expect(host.innerHTML).toContain(`animation-delay: ${delayOf(3)} !important;`);

    const external = new Host();
    mount(external, composition("css-external"), { mode: "scrub" });
    expect(external.innerHTML).toContain(css);
    expect(external.innerHTML).toContain(svg);
    expect(external.innerHTML).toContain("animation-play-state: paused !important;");
    expect(external.innerHTML).toContain("animation-delay: 0s !important;");
    expect(rendered).toEqual([]);
  });

  test("scrub seeks SMIL with setCurrentTime and does not replace the artifact", () => {
    const times: number[] = [];
    const rendered: number[] = [];
    const host = new Host();
    host.timed = {
      setCurrentTime(seconds) {
        times.push(seconds);
      },
    };
    const handle = mount(host, composition("smil", (frame) => {
      rendered.push(frame);
      return `<svg id="raster-${frame}"></svg>`;
    }), { mode: "scrub", frame: 2 });

    expect(host.innerHTML).toBe(svg);
    expect(host.innerHTML).not.toContain("animation-play-state");
    expect(times).toEqual([2 / 30]);
    expect(Object.is(times[0], 2 / 30)).toBe(true);
    expect(rendered).toEqual([]);
    expect(host.queries).toEqual(["svg"]);

    handle.seek(2);
    handle.seek(1);
    expect(times).toEqual([2 / 30, 2 / 30, 1 / 30]);
    expect(host.innerHTML).toBe(svg);
    expect(rendered).toEqual([]);

    handle.seek(99);
    expect(handle.frame).toBe(3);
    expect(Object.is(times.at(-1), 3 / 30)).toBe(true);
    handle.unmount();
    expect(host.innerHTML).toBe("");
    expect(() => handle.seek(1)).toThrow("player is unmounted");
  });

  test("scrub replaces the SVG from renderFrame when SMIL cannot seek", () => {
    const rendered: number[] = [];
    const renderFrame = (frame: number) => {
      rendered.push(frame);
      return `<svg id="frame-${frame}"></svg>`;
    };
    const missing = new Host();
    const handle = mount(missing, composition("smil", renderFrame), { mode: "scrub", frame: 2 });
    expect(missing.timed).toBeNull();
    expect(missing.innerHTML).toBe(`<svg id="frame-2"></svg>`);
    expect(missing.innerHTML).not.toContain('id="s-box"');
    expect(rendered).toEqual([2]);
    expect(missing.queries).toEqual(["svg"]);

    handle.seek(2);
    handle.seek(0);
    expect(rendered).toEqual([2, 2, 0]);
    expect(missing.innerHTML).toBe(`<svg id="frame-0"></svg>`);
    expect(handle.frame).toBe(0);

    const bare: PlayerHost = { innerHTML: "" };
    const bareRendered: number[] = [];
    const bareHandle = mount(bare, {
      fps: 30,
      durationInFrames: 4,
      artifact: { backend: "smil", svg },
      renderFrame(frame) {
        bareRendered.push(frame);
        return `<svg id="bare-${frame}"></svg>`;
      },
    }, { mode: "scrub" });
    expect(bare.innerHTML).toBe(`<svg id="bare-0"></svg>`);
    bareHandle.seek(3);
    expect(bareRendered).toEqual([0, 3]);

    const blind = new Host();
    blind.timed = {};
    expect(() => mount(blind, composition("smil"), { mode: "scrub", frame: 1 })).toThrow(
      "SMIL cannot seek and renderFrame is missing",
    );
    expect(blind.innerHTML).toBe("");

    expect(() => mount(new Host(), composition("smil", () => "not-svg"), { mode: "scrub" })).toThrow(
      "renderFrame must return an SVG document",
    );
  });

  test("compiled CSS and SMIL artifacts mount in both modes", () => {
    const embedded = compileCss(ir, "css-embedded");
    const external = compileCss(ir, "css-external");
    const smil = compileSmil(ir);
    const rendered: number[] = [];
    const renderFrame = (frame: number) => {
      rendered.push(frame);
      return `<svg id="baked-${frame}"></svg>`;
    };

    const staticHost = new Host();
    mount(staticHost, {
      fps: ir.fps,
      durationInFrames: ir.durationInFrames,
      artifact: { backend: "css-embedded", svg: embedded.svg },
      renderFrame,
    }, { mode: "static" });
    expect(staticHost.innerHTML).toBe(embedded.svg);
    expect(staticHost.innerHTML).not.toContain("animation-play-state");

    const scrubHost = new Host();
    mount(scrubHost, {
      fps: ir.fps,
      durationInFrames: ir.durationInFrames,
      artifact: { backend: "css-external", svg: external.svg, css: external.css },
      renderFrame,
    }, { mode: "scrub", frame: 1 });
    expect(external.css).toBeDefined();
    expect(scrubHost.innerHTML).toContain(external.css ?? "");
    expect(scrubHost.innerHTML).toContain(external.svg);
    expect(scrubHost.innerHTML).toContain(`animation-delay: ${delayOf(1)} !important;`);

    const times: number[] = [];
    const smilHost = new Host();
    smilHost.timed = { setCurrentTime(seconds) { times.push(seconds); } };
    mount(smilHost, {
      fps: ir.fps,
      durationInFrames: ir.durationInFrames,
      artifact: { backend: "smil", svg: smil.svg },
      renderFrame,
    }, { mode: "scrub", frame: 3 });
    expect(smilHost.innerHTML).toBe(smil.svg);
    expect(times).toEqual([3 / 30]);
    expect(rendered).toEqual([]);
  });

  test("raster replacement is the integer frame and not CSS or SMIL playback", () => {
    const source = readFileSync(playerEntry, "utf8");
    for (const token of ["MediaRecorder", "canvas", "encoder"]) {
      expect(source.includes(token)).toBe(false);
    }
    expect(source.includes("renderFrame")).toBe(true);
    expect(source.includes('from "../bake/')).toBe(false);

    const frames: string[] = [];
    const host = new Host();
    const handle = mount(host, {
      fps: 30,
      durationInFrames: 4,
      artifact: artifact("smil"),
      renderFrame(frame) {
        const svg = `<svg id="export-${frame}"></svg>`;
        frames.push(svg);
        return svg;
      },
    }, { mode: "scrub" });
    for (let frame = 0; frame < 4; frame += 1) handle.seek(frame);
    expect(frames).toEqual([
      `<svg id="export-0"></svg>`,
      `<svg id="export-0"></svg>`,
      `<svg id="export-1"></svg>`,
      `<svg id="export-2"></svg>`,
      `<svg id="export-3"></svg>`,
    ]);
    expect(host.innerHTML).toBe(frames.at(-1));
    expect(host.innerHTML).not.toContain("<animate");
    expect(host.innerHTML).not.toContain("animation-play-state");
  });

  test("a wall-clock read is not reachable from the player module", () => {
    const files = filesReachableFrom(playerEntry);
    expect(files.some((file) => file.endsWith("/player/index.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("/ir/quantize.ts"))).toBe(true);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of WALL_CLOCK) {
        expect(text.includes(token)).toBe(false);
      }
    }

    const calls: string[] = [];
    let now = 0;
    const dateNow = Date.now;
    const random = Math.random;
    Date.now = () => {
      calls.push("Date.now");
      now += 5000;
      return now;
    };
    Math.random = () => {
      calls.push("Math.random");
      return 0;
    };
    const perf = globalThis.performance;
    const perfNow = perf?.now.bind(perf);
    if (perf && perfNow) {
      perf.now = () => {
        calls.push("performance.now");
        now += 5000;
        return now;
      };
    }
    try {
      const host = new Host();
      const handle = mount(host, composition("css-external"), { mode: "scrub", frame: 1 });
      const first = host.innerHTML;
      handle.seek(1);
      expect(host.innerHTML).toBe(first);
      handle.seek(2);
      expect(host.innerHTML).toContain(`animation-delay: ${delayOf(2)} !important;`);
      expect(host.innerHTML).not.toContain(`animation-delay: ${delayOf(1 + 2)} !important;`);

      const smil = new Host();
      const times: number[] = [];
      smil.timed = { setCurrentTime(seconds) { times.push(seconds); } };
      const smilHandle = mount(smil, composition("smil"), { mode: "scrub", frame: 1 });
      smilHandle.seek(1);
      expect(times).toEqual([1 / 30, 1 / 30]);

      mount(new Host(), composition("css-embedded"), { mode: "static" });
      mount(new Host(), composition("smil"), { mode: "static" });
    } finally {
      Date.now = dateNow;
      Math.random = random;
      if (perf && perfNow) perf.now = perfNow;
    }
    expect(calls).toEqual([]);
    expect(now).toBe(0);
  });

  test("invalid mounts are rejected", () => {
    const host = new Host();
    const ok = composition("css-embedded");
    expect(() => mount(null as unknown as PlayerHost, ok, { mode: "static" })).toThrow("host must be an object");
    expect(() => mount(host, null as unknown as PlayerComposition, { mode: "static" })).toThrow(
      "composition must be an object",
    );
    expect(() => mount(host, ok, null as unknown as { mode: PlayerMode })).toThrow("options must be an object");
    expect(() => mount(host, ok, { mode: "play" as PlayerMode })).toThrow('mode must be "scrub" or "static"');
    expect(() => mount(host, { ...ok, fps: 0 }, { mode: "static" })).toThrow(TypeError);
    expect(() => mount(host, { ...ok, durationInFrames: 1.5 }, { mode: "static" })).toThrow(TypeError);
    expect(() => mount(host, { ...ok, artifact: null as unknown as PlayerArtifact }, { mode: "static" })).toThrow(
      "artifact must be an object",
    );
    expect(() => mount(host, { ...ok, artifact: { backend: "css-embedded", svg: "nope" } }, { mode: "static" })).toThrow(
      "artifact svg must be an SVG document",
    );
    expect(() =>
      mount(host, { ...ok, artifact: { backend: "css-external", svg } }, { mode: "static" }),
    ).toThrow("css-external artifact is missing css");
    expect(() =>
      mount(host, { ...ok, artifact: { backend: "css-embedded", svg, css: 1 as unknown as string } }, { mode: "static" }),
    ).toThrow("artifact css must be a string");
    expect(() =>
      mount(host, { ...ok, artifact: { backend: "other" as PlayerArtifact["backend"], svg } }, { mode: "static" }),
    ).toThrow("artifact backend must be css-external, css-embedded, or smil");
    expect(() => mount(host, ok, { mode: "scrub", frame: 1.2 })).toThrow("frame must be an integer");
    expect(host.innerHTML).not.toContain("animation-play-state");
  });
});
