import { describe, expect, test } from "bun:test";
import { quantize1e4, sample, sampleReport, type TimelineIr } from "../src/ir/index.ts";

function ir(partial: Pick<TimelineIr, "nodes"> & Partial<TimelineIr>): TimelineIr {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 90,
    ...partial,
  };
}

describe("sample", () => {
  test("a sample on a key frame returns that key", () => {
    const matrix = [1, 0, 0, 1, 4, 8];
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0 },
                { frame: 30, value: 120, easing: "cubic-bezier(0.2,0,0,1)" },
              ],
            },
            {
              property: "transform.matrix",
              keys: [{ frame: 0, value: matrix }],
            },
          ],
        },
      ],
    });

    const atStart = sample(document, 0);
    const atEnd = sample(document, 30);
    expect(atStart["s-n0"]?.["transform.translateX"]).toBe(0);
    expect(atEnd["s-n0"]?.["transform.translateX"]).toBe(120);
    expect(atStart["s-n0"]?.["transform.matrix"]).toBe(matrix);
  });

  test("a sample midway on a linear span returns the midpoint", () => {
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0, easing: "hold" },
                { frame: 30, value: 120 },
              ],
            },
          ],
        },
      ],
    });

    expect(sample(document, 15)["s-n0"]?.["transform.translateX"]).toBe(60);
  });

  test("a mismatched attr.d span is hold", () => {
    const from = "M 0 0 L 10 10";
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "attr.d",
              keys: [
                { frame: 0, value: from },
                { frame: 10, value: "M 0 0 L 10 10 L 20 20", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });

    const report = sampleReport(document, 5);
    expect(report.nodes["s-n0"]?.["attr.d"]).toBe(from);
    expect(report.diagnostics).toEqual([
      {
        code: "attr-d-mismatch",
        nodeId: "s-n0",
        property: "attr.d",
        fromFrame: 0,
        toFrame: 10,
      },
    ]);
    expect(sampleReport(document, 0).diagnostics).toEqual([]);
    expect(sampleReport(document, 10).nodes["s-n0"]?.["attr.d"]).toBe("M 0 0 L 10 10 L 20 20");
  });

  test("a matching attr.d span interpolates arguments", () => {
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "attr.d",
              keys: [
                { frame: 0, value: "M0,0 L10 0" },
                { frame: 10, value: "M 0 10 L 10 10", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });

    expect(sample(document, 5)["s-n0"]?.["attr.d"]).toBe("M 0 5 L 10 5");
  });

  test("a spring sampled twice at the same frame matches bitwise after C6 quantization", () => {
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: 0 },
                { frame: 30, value: 120, easing: "spring" },
              ],
            },
          ],
        },
      ],
    });

    const first = sample(document, 3)["s-n0"]?.["transform.translateX"];
    const second = sample(document, 3)["s-n0"]?.["transform.translateX"];
    expect(typeof first).toBe("number");
    expect(typeof second).toBe("number");
    if (typeof first !== "number" || typeof second !== "number") return;
    expect(Object.is(first, second)).toBe(true);
    expect(first).toBe(second);
    expect(first).toBe(quantize1e4(first));
    expect(Object.is(first, quantize1e4(first))).toBe(true);
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, first);
    const again = new DataView(new ArrayBuffer(8));
    again.setFloat64(0, second);
    expect(bits.getBigUint64(0)).toBe(again.getBigUint64(0));
    expect(sample(document, 1)["s-n0"]?.["transform.translateX"]).toBe(16);
    expect(sample(document, 3)["s-n0"]?.["transform.translateX"]).toBe(61.2267);
    expect(sample(document, 0)["s-n0"]?.["transform.translateX"]).toBe(0);
    expect(sample(document, 30)["s-n0"]?.["transform.translateX"]).toBe(120);
  });

  test("spring quantization is half away from zero", () => {
    expect(quantize1e4(1.00005)).toBe(1.0001);
    expect(quantize1e4(-1.00005)).toBe(-1.0001);
    expect(quantize1e4(0.00004)).toBe(0);
    expect(Object.is(quantize1e4(-0), 0)).toBe(true);

    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateY",
              keys: [
                { frame: 0, value: 0 },
                { frame: 30, value: -120, easing: "spring" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(document, 1)["s-n0"]?.["transform.translateY"]).toBe(-16);
  });

  test("hold keeps the span start, and the frame is clamped", () => {
    const document = ir({
      durationInFrames: 40,
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "attr.opacity",
              keys: [
                { frame: 0, value: 0 },
                { frame: 10, value: 1, easing: "hold" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(document, 9)["s-n0"]?.["attr.opacity"]).toBe(0);
    expect(sample(document, 10)["s-n0"]?.["attr.opacity"]).toBe(1);
    expect(sampleReport(document, 100).frame).toBe(39);
    expect(sample(document, 100)["s-n0"]?.["attr.opacity"]).toBe(1);
    expect(sampleReport(document, -4).frame).toBe(0);
    expect(sample(document, -4)["s-n0"]?.["attr.opacity"]).toBe(0);
  });

  test("a transform matrix and a fill use the span easing", () => {
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.matrix",
              keys: [
                { frame: 0, value: [1, 0, 0, 1, 0, 0] },
                { frame: 10, value: [1, 0, 0, 1, 10, 20], easing: "linear" },
              ],
            },
            {
              property: "attr.fill",
              keys: [
                { frame: 0, value: "#000000" },
                { frame: 10, value: "#ffffff", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(document, 5)["s-n0"]?.["transform.matrix"]).toEqual([1, 0, 0, 1, 5, 10]);
    expect(sample(document, 5)["s-n0"]?.["attr.fill"]).toBe("#808080");
  });

  test("cubic-bezier is deterministic and stays on the span", () => {
    const document = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.rotate",
              keys: [
                { frame: 0, value: 0 },
                { frame: 30, value: 120, easing: "cubic-bezier(0.2,0,0,1)" },
              ],
            },
          ],
        },
      ],
    });
    const value = sample(document, 15)["s-n0"]?.["transform.rotate"];
    expect(value).toBe(sample(document, 15)["s-n0"]?.["transform.rotate"]);
    expect(typeof value).toBe("number");
    if (typeof value !== "number") return;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(120);
    expect(value).not.toBe(60);
  });

  test("equal-length numeric lists blend as quantized numbers", () => {
    const span = ir({
      durationInFrames: 24,
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: "0 0" },
                { frame: 23, value: "14 40", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(span, 0)["s-n0"]?.["transform.translateX"]).toBe("0 0");
    expect(sample(span, 23)["s-n0"]?.["transform.translateX"]).toBe("14 40");
    expect(sample(span, 11)["s-n0"]?.["transform.translateX"]).toBe("6.6957 19.1304");

    const half = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "filter.feGaussianBlur.stdDeviation",
              keys: [
                { frame: 0, value: "0 0" },
                { frame: 2, value: "14 40", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(half, 1)["s-n0"]?.["filter.feGaussianBlur.stdDeviation"]).toBe("7 20");

    const held = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: "0  0" },
                { frame: 10, value: "14 40", easing: "hold" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(held, 5)["s-n0"]?.["transform.translateX"]).toBe("0  0");

    const shorter = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: "0 0" },
                { frame: 10, value: "14", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(shorter, 5)["s-n0"]?.["transform.translateX"]).toBe("0 0");

    const words = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "transform.translateX",
              keys: [
                { frame: 0, value: "0 0" },
                { frame: 10, value: "14 px", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(words, 5)["s-n0"]?.["transform.translateX"]).toBe("0 0");

    const color = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "attr.fill",
              keys: [
                { frame: 0, value: "#000000" },
                { frame: 10, value: "#ffffff", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(color, 5)["s-n0"]?.["attr.fill"]).toBe("#808080");

    const path = ir({
      nodes: [
        {
          id: "s-n0",
          tracks: [
            {
              property: "attr.d",
              keys: [
                { frame: 0, value: "M 0 0 L 10 0" },
                { frame: 10, value: "M 0 10 L 10 10", easing: "linear" },
              ],
            },
          ],
        },
      ],
    });
    expect(sample(path, 5)["s-n0"]?.["attr.d"]).toBe("M 0 5 L 10 5");
  });
});
