import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run, type CliIo } from "../src/index.ts";
import { findBrowser, servedFile, toJavaScript } from "../src/browser.ts";

const fixture = readFileSync(join(import.meta.dir, "../../../schema/fixtures/project/v1-valid.json"), "utf8");

function disk(): CliIo & { written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>();
  return {
    readFile: () => fixture,
    readStdin: () => "",
    writeFile: (path, bytes) => {
      written.set(path, bytes);
    },
    written,
  };
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

describe("browser export plumbing", () => {
  test("serves only the engine and export sources", () => {
    expect(servedFile("/svgif-export/src/index.ts")).toEndWith("index.ts");
    expect(servedFile("/svgif/src/ir/sample.ts")).toEndWith("sample.ts");
    for (const path of [
      "/svgif-cli/src/index.ts",
      "/svgif-export/package.json",
      "/svgif-export/src/../../../schema/validate.mjs",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/svgif-export/src/missing.ts",
      "svgif-export/src/index.ts",
      "/svgif-export/src/index.ts%00",
    ]) {
      expect(servedFile(path)).toBeNull();
    }
  });

  test("strips types without changing what runs", async () => {
    const code = await toJavaScript('import type { A } from "./a.ts";\nexport const x: number = 1;\n');
    expect(code).not.toContain("number");
    expect(code).not.toContain("import type");
    expect(code).toContain("x");
  });

  test("a browser path that does not exist is no browser", () => {
    expect(findBrowser({ SVGIF_BROWSER: "/nonexistent/svgif-browser", PATH: "" })).toBeNull();
    expect(findBrowser({ PATH: "" })).toBeNull();
  });

  test("no browser is exit 4 and writes nothing", async () => {
    const saved = process.env.SVGIF_BROWSER;
    process.env.SVGIF_BROWSER = "/nonexistent/svgif-browser";
    try {
      const files = disk();
      const output = await run(["export", "--in", "p.json", "--format", "webp", "--out", "x.webp", "--browser"], files);
      expect(output.exitCode).toBe(4);
      expect(JSON.parse(output.stdout).error.code).toBe("needs-browser");
      expect(files.written.size).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.SVGIF_BROWSER;
      else process.env.SVGIF_BROWSER = saved;
    }
  });
});

const browser = findBrowser();

describe.skipIf(browser === null)("export --browser in a local browser", () => {
  test("webp is a RIFF/WEBP file with one frame per composition frame", async () => {
    const files = disk();
    const output = await run(["export", "--in", "p.json", "--format", "webp", "--out", "x.webp", "--browser"], files);
    expect(output.exitCode).toBe(0);
    const bytes = files.written.get("x.webp");
    if (!bytes) throw new Error("no file was written");
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 4)).toBe("WEBP");
    const frames = JSON.parse(fixture).composition.durationInFrames as number;
    let count = 0;
    for (let at = 12; at + 8 <= bytes.length; ) {
      const size = bytes[at + 4]! | (bytes[at + 5]! << 8) | (bytes[at + 6]! << 16) | (bytes[at + 7]! << 24);
      if (ascii(bytes, at, 4) === "ANMF") count++;
      at += 8 + size + (size % 2);
    }
    expect(count).toBe(frames);
    expect(JSON.parse(output.stdout).result.bytes).toBe(bytes.length);
  }, 120_000);

  test("webm starts with the EBML header", async () => {
    const files = disk();
    const output = await run(["export", "--in", "p.json", "--format", "webm", "--out", "x.webm", "--browser"], files);
    expect(output.exitCode).toBe(0);
    const bytes = files.written.get("x.webm");
    if (!bytes) throw new Error("no file was written");
    expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  }, 120_000);

  test("mp4 begins with ftyp, or reports that the browser has no H.264 encoder", async () => {
    const files = disk();
    const output = await run(["export", "--in", "p.json", "--format", "mp4", "--out", "x.mp4", "--browser"], files);
    if (output.exitCode === 0) {
      const bytes = files.written.get("x.mp4");
      if (!bytes) throw new Error("no file was written");
      expect(ascii(bytes, 4, 4)).toBe("ftyp");
    } else {
      expect(output.exitCode).toBe(70);
      expect(JSON.parse(output.stdout).error.message).toContain("codec-unsupported");
      expect(files.written.size).toBe(0);
    }
  }, 120_000);
});
