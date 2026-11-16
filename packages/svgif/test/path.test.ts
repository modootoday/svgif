/**
 * SVG path command lists.
 * A list that parses may interpolate with a list of the same commands.
 * A string that does not parse returns null, and the sampler holds.
 * [[sot:svgif/animation-ir]]
 */

import { describe, expect, test } from "bun:test";
import { parsePath, sameCommandList, writePath } from "../src/ir/path.ts";

describe("parsePath", () => {
  test("reads commands with their arity and keeps the letter case", () => {
    expect(parsePath("M 0 0 L 10 0 l 0 10 H 5 v -5 Z")).toEqual([
      { op: "M", args: [0, 0] },
      { op: "L", args: [10, 0] },
      { op: "l", args: [0, 10] },
      { op: "H", args: [5] },
      { op: "v", args: [-5] },
      { op: "Z", args: [] },
    ]);
    expect(parsePath("M0,0 C1,2 3,4 5,6 S7,8 9,10 Q1,1 2,2 T3,3 A1 1 0 0 1 4 4z")).toEqual([
      { op: "M", args: [0, 0] },
      { op: "C", args: [1, 2, 3, 4, 5, 6] },
      { op: "S", args: [7, 8, 9, 10] },
      { op: "Q", args: [1, 1, 2, 2] },
      { op: "T", args: [3, 3] },
      { op: "A", args: [1, 1, 0, 0, 1, 4, 4] },
      { op: "z", args: [] },
    ]);
  });

  test("reads signs, decimals, and exponents", () => {
    expect(parsePath("M -1.5 +2 L .5 1e2 L 2E-1 3.")).toEqual([
      { op: "M", args: [-1.5, 2] },
      { op: "L", args: [0.5, 100] },
      { op: "L", args: [0.2, 3] },
    ]);
    expect(parsePath("M 1e 2")).toBeNull();
    expect(parsePath("M 1e+ 2")).toBeNull();
  });

  test("repeats a command for extra argument groups, and a move repeats as a line", () => {
    expect(parsePath("M 0 0 1 1 2 2")).toEqual([
      { op: "M", args: [0, 0] },
      { op: "L", args: [1, 1] },
      { op: "L", args: [2, 2] },
    ]);
    expect(parsePath("m 0 0 1 1")).toEqual([
      { op: "m", args: [0, 0] },
      { op: "l", args: [1, 1] },
    ]);
    expect(parsePath("L 0 0\t1 1\n2,2\r3 3")).toEqual([
      { op: "L", args: [0, 0] },
      { op: "L", args: [1, 1] },
      { op: "L", args: [2, 2] },
      { op: "L", args: [3, 3] },
    ]);
  });

  test("returns null for a string that is not a path", () => {
    expect(parsePath("")).toBeNull();
    expect(parsePath("   ")).toBeNull();
    expect(parsePath("0 0")).toBeNull();
    expect(parsePath("X 1 2")).toBeNull();
    expect(parsePath("M 1")).toBeNull();
    expect(parsePath("M a b")).toBeNull();
    expect(parsePath("M 0 0 L 1 . ")).toBeNull();
    expect(parsePath("M 0 0 L - 1")).toBeNull();
  });

  test("stops a repeat group that is short and fails on what is left", () => {
    expect(parsePath("M 0 0 1")).toBeNull();
    expect(parsePath("L 0 0 1 1 2")).toBeNull();
  });
});

describe("sameCommandList", () => {
  test("is true only when every command and argument count matches", () => {
    const a = parsePath("M 0 0 L 1 1 Z") ?? [];
    const b = parsePath("M 5 5 L 9 9 Z") ?? [];
    expect(sameCommandList(a, b)).toBe(true);
    expect(sameCommandList(a, parsePath("M 0 0 L 1 1") ?? [])).toBe(false);
    expect(sameCommandList(a, parsePath("M 0 0 l 1 1 Z") ?? [])).toBe(false);
    expect(sameCommandList(a, [a[0], { op: "L", args: [1] }, a[2]] as never)).toBe(false);
    expect(sameCommandList([undefined] as never, [undefined] as never)).toBe(false);
  });
});

describe("writePath", () => {
  test("writes each command with its formatted values", () => {
    const commands = parsePath("M 0 0 L 1 1 Z") ?? [];
    const text = writePath(commands, [[0.25, 1], [2, 3.5], []], (n) => n.toFixed(1));
    expect(text).toBe("M 0.3 1.0 L 2.0 3.5 Z");
    expect(writePath(commands, [[1, 2]], String)).toBe("M 1 2 L Z");
    expect(writePath([undefined, commands[2]] as never, [[], []], String)).toBe("Z");
  });
});
