/**
 * Mux and capability paths with stand-in browser globals.
 * The stand-ins are a canvas that stores RGBA, an image decode that paints a
 * flat color, and a video encoder that returns the bytes this test hands it.
 * They prove the container bytes and the failure paths. They do not prove a
 * picture. Real pictures are decoded in pixels.test.ts.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121700]]
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExportCapabilityError,
  exportAnimatedMp4,
  exportAnimatedWebm,
  exportAnimatedWebp,
  rasterizeComposition,
  rasterizeSvg,
} from "../src/index.ts";
import type { SvgComposition } from "../src/svg.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { composition: SvgComposition };

const NAMES = ["OffscreenCanvas", "document", "createImageBitmap", "Image", "VideoEncoder", "VideoFrame", "ImageData"] as const;
const scope = globalThis as unknown as Record<string, unknown>;
const saved = new Map<string, PropertyDescriptor | undefined>();
for (const name of NAMES) saved.set(name, Object.getOwnPropertyDescriptor(scope, name));
const urlApi = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
const savedCreate = urlApi.createObjectURL;
const savedRevoke = urlApi.revokeObjectURL;

function setGlobal(name: (typeof NAMES)[number], value: unknown): void {
  Object.defineProperty(scope, name, { value, configurable: true, writable: true });
}

afterEach(() => {
  for (const name of NAMES) {
    const descriptor = saved.get(name);
    if (descriptor) Object.defineProperty(scope, name, descriptor);
    else delete scope[name];
  }
  urlApi.createObjectURL = savedCreate;
  urlApi.revokeObjectURL = savedRevoke;
});

function small(frames = 3): SvgComposition {
  const composition = JSON.parse(JSON.stringify(fixture.composition)) as SvgComposition;
  composition.width = 4;
  composition.height = 2;
  composition.durationInFrames = frames;
  return composition;
}

interface Painted {
  rgba: [number, number, number, number];
  close?: () => void;
}

class Context {
  data: Uint8ClampedArray;
  constructor(
    private readonly plane: { width: number; height: number },
    private readonly short: boolean,
  ) {
    this.data = new Uint8ClampedArray(plane.width * plane.height * 4);
  }
  clearRect(): void {
    this.data = new Uint8ClampedArray(this.plane.width * this.plane.height * 4);
  }
  drawImage(source: Painted): void {
    for (let index = 0; index < this.data.length; index += 4) this.data.set(source.rgba, index);
  }
  putImageData(image: { data: Uint8ClampedArray }): void {
    this.data = new Uint8ClampedArray(image.data);
  }
  getImageData(): { data: Uint8ClampedArray } {
    return { data: this.short ? this.data.slice(0, 4) : this.data };
  }
}

function canvasClass(options: { context?: boolean; short?: boolean } = {}): new (w?: number, h?: number) => unknown {
  return class {
    width: number;
    height: number;
    private ctx?: Context;
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
    }
    getContext(): Context | null {
      if (options.context === false) return null;
      this.ctx ??= new Context(this, options.short === true);
      return this.ctx;
    }
  };
}

let decodes = 0;
let closed = 0;

function installRaster(): void {
  decodes = 0;
  closed = 0;
  setGlobal("OffscreenCanvas", canvasClass());
  setGlobal("createImageBitmap", async (): Promise<Painted> => {
    decodes += 1;
    const shade = decodes * 40;
    return {
      rgba: [shade, 255 - shade, 7, 255],
      close: () => {
        closed += 1;
      },
    };
  });
}

interface EncoderPlan {
  supported: string[];
  chunk?: (index: number) => Uint8Array;
  description?: Uint8Array | ArrayBuffer;
  fail?: "error" | "throw" | "drop";
}

const seen: { configured: Record<string, unknown>[]; closed: number; frames: number } = { configured: [], closed: 0, frames: 0 };

function installEncoder(plan: EncoderPlan): void {
  seen.configured = [];
  seen.closed = 0;
  seen.frames = 0;
  setGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  setGlobal(
    "VideoFrame",
    class {
      close(): void {
        seen.frames += 1;
      }
    },
  );
  setGlobal(
    "VideoEncoder",
    class {
      static async isConfigSupported(config: Record<string, unknown>): Promise<{ supported?: boolean }> {
        return { supported: plan.supported.includes(String(config.codec)) };
      }
      private index = 0;
      constructor(
        private readonly init: {
          output: (chunk: unknown, meta: unknown) => void;
          error: (reason: Error) => void;
        },
      ) {}
      configure(config: Record<string, unknown>): void {
        seen.configured.push(config);
      }
      encode(): void {
        if (plan.fail === "throw") throw new Error("encoder refused the frame");
        if (plan.fail === "error") {
          this.init.error(new Error("encoder failed"));
          return;
        }
        if (plan.fail === "drop" && this.index > 0) return;
        const bytes = plan.chunk ? plan.chunk(this.index) : Uint8Array.of(1, 2, 3, this.index);
        const meta = this.index === 0 && plan.description ? { decoderConfig: { description: plan.description } } : {};
        this.index += 1;
        this.init.output(
          {
            type: "key",
            byteLength: bytes.length,
            copyTo(target: Uint8Array): void {
              target.set(bytes);
            },
          },
          meta,
        );
      }
      async flush(): Promise<void> {}
      close(): void {
        seen.closed += 1;
      }
    },
  );
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function find(bytes: Uint8Array, needle: number[] | string, from = 0): number {
  const target = typeof needle === "string" ? [...needle].map((char) => char.charCodeAt(0)) : needle;
  outer: for (let index = from; index <= bytes.length - target.length; index += 1) {
    for (let offset = 0; offset < target.length; offset += 1) {
      if (bytes[index + offset] !== target[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function count(bytes: Uint8Array, needle: string): number {
  let total = 0;
  let at = find(bytes, needle);
  while (at >= 0) {
    total += 1;
    at = find(bytes, needle, at + needle.length);
  }
  return total;
}

function be32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

async function capability(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof ExportCapabilityError) return error.code;
    throw error;
  }
  return "no error";
}

describe("raster stand-in", () => {
  test("rasterizes each frame through the offscreen canvas and releases the decode", async () => {
    installRaster();
    const frames = await rasterizeComposition(small(3));
    expect(frames.length).toBe(3);
    expect(decodes).toBe(3);
    expect(closed).toBe(3);
    expect(Array.from(frames[0] ?? []).slice(0, 4)).toEqual([40, 215, 7, 255]);
    expect(Array.from(frames[2] ?? []).slice(0, 4)).toEqual([120, 135, 7, 255]);
    expect(frames[0]?.length).toBe(4 * 2 * 4);
  });

  test("refuses a frame size that is not a positive integer", async () => {
    installRaster();
    await expect(rasterizeSvg("<svg/>", 0, 2)).rejects.toThrow(/positive integer/);
    await expect(rasterizeSvg("<svg/>", 2, 1.5)).rejects.toThrow(/positive integer/);
  });

  test("uses a document canvas when there is no offscreen canvas", async () => {
    installRaster();
    delete scope.OffscreenCanvas;
    const Canvas = canvasClass();
    setGlobal("document", { createElement: () => new Canvas() });
    const pixels = await rasterizeSvg("<svg/>", 2, 2);
    expect(pixels.length).toBe(16);
    expect(Array.from(pixels.slice(0, 4))).toEqual([40, 215, 7, 255]);
  });

  test("falls back to the document canvas when the offscreen context is null", async () => {
    installRaster();
    setGlobal("OffscreenCanvas", canvasClass({ context: false }));
    const Canvas = canvasClass();
    setGlobal("document", { createElement: () => new Canvas() });
    expect((await rasterizeSvg("<svg/>", 1, 1)).length).toBe(4);
  });

  test("throws raster-unsupported when no canvas can be read", async () => {
    installRaster();
    delete scope.OffscreenCanvas;
    delete scope.document;
    expect(await capability(rasterizeSvg("<svg/>", 2, 2))).toBe("raster-unsupported");
    setGlobal("document", { createElement: () => new (canvasClass({ context: false }))() });
    expect(await capability(rasterizeSvg("<svg/>", 2, 2))).toBe("raster-unsupported");
    expect(await capability(exportAnimatedWebp(small(1)))).toBe("raster-unsupported");
  });

  test("throws raster-unsupported when the canvas returns too few pixels", async () => {
    installRaster();
    setGlobal("OffscreenCanvas", canvasClass({ short: true }));
    expect(await capability(rasterizeSvg("<svg/>", 2, 2))).toBe("raster-unsupported");
  });

  test("retries the bitmap decode without a resize", async () => {
    installRaster();
    let calls = 0;
    setGlobal("createImageBitmap", async (_blob: Blob, options?: unknown): Promise<Painted> => {
      calls += 1;
      if (options) throw new Error("resize is not supported");
      return { rgba: [9, 8, 7, 255], close: () => {} };
    });
    const pixels = await rasterizeSvg("<svg/>", 1, 1);
    expect(calls).toBe(2);
    expect(Array.from(pixels)).toEqual([9, 8, 7, 255]);
  });

  test("decodes through an image element when the bitmap decode fails", async () => {
    installRaster();
    setGlobal("createImageBitmap", async (): Promise<Painted> => {
      throw new Error("bitmap decode failed");
    });
    const revoked: string[] = [];
    urlApi.createObjectURL = () => "blob:frame";
    urlApi.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    setGlobal(
      "Image",
      class {
        rgba = [1, 2, 3, 255];
        width = 0;
        height = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const pixels = await rasterizeSvg("<svg/>", 1, 1);
    expect(Array.from(pixels)).toEqual([1, 2, 3, 255]);
    expect(revoked).toEqual(["blob:frame"]);
  });

  test("throws raster-unsupported when the image element fails to load", async () => {
    installRaster();
    delete scope.createImageBitmap;
    const revoked: string[] = [];
    urlApi.createObjectURL = () => "blob:bad";
    urlApi.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    setGlobal(
      "Image",
      class {
        width = 0;
        height = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    expect(await capability(rasterizeSvg("<svg/>", 1, 1))).toBe("raster-unsupported");
    expect(revoked).toEqual(["blob:bad"]);
  });

  test("throws raster-unsupported when there is no decode at all", async () => {
    installRaster();
    delete scope.createImageBitmap;
    delete scope.Image;
    expect(await capability(rasterizeSvg("<svg/>", 1, 1))).toBe("raster-unsupported");
  });
});

describe("animated WebP container", () => {
  test("writes one ANMF chunk per frame with the frame duration", async () => {
    installRaster();
    const composition = small(3);
    const bytes = await bytesOf(await exportAnimatedWebp(composition));
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 4)).toBe("WEBP");
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 8);
    expect(count(bytes, "ANMF")).toBe(3);
    expect(count(bytes, "VP8L")).toBe(3);
    expect(find(bytes, "VP8X")).toBe(12);
    expect(find(bytes, "ANIM")).toBeGreaterThan(0);
  });
});

describe("WebM container", () => {
  test("muxes VP8 samples into an EBML file with the composition size", async () => {
    installRaster();
    installEncoder({ supported: ["vp8"] });
    const composition = small(3);
    const blob = await exportAnimatedWebm(composition);
    expect(blob.type).toBe("video/webm");
    const bytes = await bytesOf(blob);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(find(bytes, "webm")).toBeGreaterThan(0);
    expect(find(bytes, "V_VP8")).toBeGreaterThan(0);
    expect(find(bytes, "V_VP9")).toBe(-1);
    expect(find(bytes, [1, 2, 3, 0])).toBeGreaterThan(0);
    expect(find(bytes, [1, 2, 3, 2])).toBeGreaterThan(0);
    expect(seen.configured.length).toBe(1);
    expect(seen.configured[0]?.codec).toBe("vp8");
    expect(seen.configured[0]?.width).toBe(4);
    expect(seen.configured[0]?.framerate).toBe(composition.fps);
    expect(seen.frames).toBe(3);
    expect(seen.closed).toBe(1);
  });

  test("falls to VP9 when VP8 is not supported and keeps the codec private bytes", async () => {
    installRaster();
    installEncoder({ supported: ["vp09.00.10.08"], description: Uint8Array.of(0xaa, 0xbb, 0xcc).buffer });
    const bytes = await bytesOf(await exportAnimatedWebm(small(2)));
    expect(find(bytes, "V_VP9")).toBeGreaterThan(0);
    expect(find(bytes, [0xaa, 0xbb, 0xcc])).toBeGreaterThan(0);
    expect(seen.configured[0]?.codec).toBe("vp09.00.10.08");
  });

  test("writes a long file without losing a frame", async () => {
    installRaster();
    installEncoder({ supported: ["vp8"], chunk: (index) => new Uint8Array(300).fill(index + 1) });
    const composition = small(40);
    composition.fps = 1;
    const bytes = await bytesOf(await exportAnimatedWebm(composition));
    for (let index = 0; index < 40; index += 1) {
      expect(find(bytes, new Array(300).fill(index + 1))).toBeGreaterThan(0);
    }
  });

  test("throws codec-unsupported and writes nothing when the encoder is missing or refuses", async () => {
    installRaster();
    expect(await capability(exportAnimatedWebm(small(1)))).toBe("codec-unsupported");
    installEncoder({ supported: [] });
    expect(await capability(exportAnimatedWebm(small(1)))).toBe("codec-unsupported");
    expect(seen.configured.length).toBe(0);
    installEncoder({ supported: ["vp8"], fail: "error" });
    expect(await capability(exportAnimatedWebm(small(2)))).toBe("codec-unsupported");
    expect(seen.closed).toBe(1);
    installEncoder({ supported: ["vp8"], fail: "throw" });
    expect(await capability(exportAnimatedWebm(small(2)))).toBe("codec-unsupported");
    expect(seen.closed).toBe(1);
    installEncoder({ supported: ["vp8"], fail: "drop" });
    expect(await capability(exportAnimatedWebm(small(3)))).toBe("codec-unsupported");
    installEncoder({ supported: ["vp8"], chunk: () => new Uint8Array(0) });
    expect(await capability(exportAnimatedWebm(small(1)))).toBe("codec-unsupported");
  });

  test("throws raster-unsupported before it asks for an encoder", async () => {
    installEncoder({ supported: ["vp8"] });
    delete scope.OffscreenCanvas;
    delete scope.document;
    expect(await capability(exportAnimatedWebm(small(1)))).toBe("raster-unsupported");
    expect(seen.configured.length).toBe(0);
  });
});

describe("MP4 container", () => {
  const description = Uint8Array.of(1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 2, 0x67, 0x64, 1, 0, 2, 0x68, 0xee);

  test("muxes AVC samples behind an ftyp box with the duration in milliseconds", async () => {
    installRaster();
    installEncoder({ supported: ["avc1.640028"], description, chunk: (index) => Uint8Array.of(0, 0, 0, 2, 0x65, index) });
    const composition = small(3);
    composition.fps = 30;
    const blob = await exportAnimatedMp4(composition);
    expect(blob.type).toBe("video/mp4");
    const bytes = await bytesOf(blob);
    expect(ascii(bytes, 4, 4)).toBe("ftyp");
    const moov = find(bytes, "moov");
    const mvhd = find(bytes, "mvhd");
    const mdat = find(bytes, "mdat");
    expect(moov).toBeGreaterThan(0);
    expect(mdat).toBeGreaterThan(moov);
    expect(be32(bytes, mvhd + 4 + 4 + 8)).toBe(1000);
    expect(be32(bytes, mvhd + 4 + 4 + 12)).toBe(100);
    expect(find(bytes, "avc1")).toBeGreaterThan(0);
    const avcc = find(bytes, "avcC");
    expect(Array.from(bytes.subarray(avcc + 4, avcc + 4 + description.length))).toEqual(Array.from(description));
    const stsz = find(bytes, "stsz");
    expect(be32(bytes, stsz + 4 + 4 + 4)).toBe(3);
    const stco = find(bytes, "stco");
    expect(be32(bytes, stco + 4 + 4)).toBe(1);
    expect(be32(bytes, stco + 4 + 8)).toBe(mdat + 4);
    expect(be32(bytes, mdat - 4)).toBe(bytes.length - (mdat - 4));
    expect(seen.configured[0]?.codec).toBe("avc1.640028");
    expect(seen.configured[0]?.avc).toEqual({ format: "avc" });
  });

  test("tries the next AVC profile when the first is not supported", async () => {
    installRaster();
    installEncoder({ supported: ["avc1.42001f"], description });
    const bytes = await bytesOf(await exportAnimatedMp4(small(1)));
    expect(ascii(bytes, 4, 4)).toBe("ftyp");
    expect(seen.configured[0]?.codec).toBe("avc1.42001f");
  });

  test("throws codec-unsupported when the encoder gives no decoder description", async () => {
    installRaster();
    installEncoder({ supported: ["avc1.640028"] });
    expect(await capability(exportAnimatedMp4(small(2)))).toBe("codec-unsupported");
    installEncoder({ supported: ["avc1.640028"], description: new Uint8Array(0) });
    expect(await capability(exportAnimatedMp4(small(2)))).toBe("codec-unsupported");
  });

  test("throws codec-unsupported when no AVC profile is supported or the encoder is missing", async () => {
    installRaster();
    expect(await capability(exportAnimatedMp4(small(1)))).toBe("codec-unsupported");
    installEncoder({ supported: ["vp8"] });
    expect(await capability(exportAnimatedMp4(small(1)))).toBe("codec-unsupported");
  });
});
