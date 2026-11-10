import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { frameDelta, frameSeconds, sampleClock, type ClockSampleInput } from "../src/clock/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const clockEntry = resolve(here, "../src/clock/index.ts");

const WALL_CLOCK = ["Date.now", "performance.now", "Math.random"];

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

/** Independent semi-implicit Euler. dt is 1/fps. Coefficients match the public API sketch. */
function euler(from: number, to: number, steps: number, fps: number): number {
  let position = from;
  let velocity = 0;
  const dt = 1 / fps;
  for (let i = 0; i < steps; i += 1) {
    const acceleration = (-120 * (position - to) - 14 * velocity) / 1;
    velocity += acceleration * dt;
    position += velocity * dt;
  }
  return position;
}

function sampleTwice(input: ClockSampleInput) {
  return [sampleClock(input), sampleClock(input)] as const;
}

describe("frame clock", () => {
  test("t is frame/fps and dt is 1/fps", () => {
    expect(frameSeconds(12, 30)).toBe(12 / 30);
    expect(frameDelta(30)).toBe(1 / 30);
    expect(Object.is(frameDelta(30), 1 / 30)).toBe(true);
    const sample = sampleClock({ frame: 12, fps: 30 });
    expect(sample.t).toBe(12 / 30);
    expect(sample.dt).toBe(1 / 30);
    expect(sample.frame).toBe(12);
    expect(sample.fps).toBe(30);
  });

  test("the same frame samples the same values", () => {
    const input: ClockSampleInput = {
      frame: 15,
      fps: 30,
      spanStart: 0,
      spanFrames: 30,
      easing: "cubic-bezier(0.2,0,0,1)",
      from: 0,
      to: 120,
    };
    const [first, second] = sampleTwice(input);
    expect(first).toEqual(second);
    expect(Object.is(first.t, second.t)).toBe(true);
    expect(Object.is(first.dt, second.dt)).toBe(true);
    expect(Object.is(first.eased, second.eased)).toBe(true);
    expect(Object.is(first.spring, second.spring)).toBe(true);
    const left = new DataView(new ArrayBuffer(8));
    const right = new DataView(new ArrayBuffer(8));
    left.setFloat64(0, first.spring);
    right.setFloat64(0, second.spring);
    expect(left.getBigUint64(0)).toBe(right.getBigUint64(0));
  });

  test("linear, hold, and spring stay on the frame step", () => {
    const linear = sampleClock({
      frame: 15,
      fps: 30,
      spanFrames: 30,
      easing: "linear",
      from: 0,
      to: 120,
    });
    expect(linear.eased).toBe(60);
    expect(linear.dt).toBe(1 / 30);

    const held = sampleClock({
      frame: 15,
      fps: 30,
      spanFrames: 30,
      easing: "hold",
      from: 0,
      to: 120,
    });
    expect(held.eased).toBe(0);
    expect(sampleClock({ frame: 30, fps: 30, spanFrames: 30, easing: "hold", from: 0, to: 120 }).eased).toBe(
      120,
    );

    const sprung = sampleClock({
      frame: 3,
      fps: 30,
      spanFrames: 30,
      easing: "spring",
      from: 0,
      to: 120,
    });
    const again = sampleClock({
      frame: 3,
      fps: 30,
      spanFrames: 30,
      easing: "spring",
      from: 0,
      to: 120,
    });
    expect(Object.is(sprung.spring, again.spring)).toBe(true);
    expect(Object.is(sprung.spring, euler(0, 120, 3, 30))).toBe(true);
    expect(sprung.spring).not.toBe(sprung.eased);
    expect(sampleClock({ frame: 0, fps: 30, from: 0, to: 120 }).spring).toBe(0);
    expect(sampleClock({ frame: 1, fps: 30, from: 0, to: 120 }).spring).toBe(16);
  });

  test("a non-integer frame or fps is rejected", () => {
    expect(() => sampleClock({ frame: 1.5, fps: 30 })).toThrow(TypeError);
    expect(() => sampleClock({ frame: -1, fps: 30 })).toThrow(TypeError);
    expect(() => frameSeconds(0, 0)).toThrow(TypeError);
    expect(() => frameDelta(29.97)).toThrow(TypeError);
  });

  test("a wall-clock read is not reachable from the clock module", () => {
    const files = filesReachableFrom(clockEntry);
    expect(files.some((file) => file.endsWith("/ir/spring.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("/ir/easing.ts"))).toBe(true);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of WALL_CLOCK) {
        expect(text.includes(token)).toBe(false);
      }
    }

    const calls: string[] = [];
    const dateNow = Date.now;
    const random = Math.random;
    Date.now = () => {
      calls.push("Date.now");
      return 0;
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
        return 0;
      };
    }
    try {
      sampleTwice({ frame: 12, fps: 30, easing: "spring", from: 0, to: 120, spanFrames: 30 });
      sampleTwice({ frame: 12, fps: 30, easing: "linear", from: 0, to: 1 });
    } finally {
      Date.now = dateNow;
      Math.random = random;
      if (perf && perfNow) perf.now = perfNow;
    }
    expect(calls).toEqual([]);
  });
});
