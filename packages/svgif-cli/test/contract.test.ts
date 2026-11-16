/**
 * CLI contract.
 * Every exit code is reached. Stdout is one JSON value of the result shape.
 * `schemaVersion` on a described binary is the version it implements.
 * [[sot:svgif/agent-surface]]
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMANDS,
  EXIT,
  HELP,
  IMPLEMENTED_SCHEMA_REVISION,
  IMPLEMENTED_SCHEMA_VERSION,
  PROJECT_SCHEMAS,
  execute,
  exitCode,
  newProject,
  projectIssues,
  run,
  type CliIo,
  type CliResult,
} from "../src/index.ts";
import { CURRENT_SCHEMA_VERSION } from "../../../schema/migrate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "../../../schema/fixtures");
const validPath = join(fixtures, "project/v1-valid.json");
const invalidPath = join(fixtures, "project/v1-invalid.json");
const tooNewPath = join(fixtures, "migrations/schema-too-new.json");
const validText = readFileSync(validPath, "utf8");

function io(files: Record<string, string> = {}, stdin = ""): CliIo & { written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>();
  return {
    written,
    readFile(path) {
      const text = files[path];
      if (text === undefined) throw new Error("no such file");
      return text;
    },
    readStdin: () => stdin,
    writeFile(path, bytes) {
      written.set(path, bytes);
    },
  };
}

function parse(stdout: string): CliResult {
  expect(stdout.endsWith("\n")).toBe(true);
  expect(stdout.trim().split("\n").length).toBe(1);
  const value = JSON.parse(stdout) as CliResult;
  expect(value.schemaVersion).toBe(1);
  expect(value.schemaRevision).toBe(0);
  expect(typeof value.ok).toBe("boolean");
  expect(typeof value.command).toBe("string");
  expect(Object.hasOwn(value, value.ok ? "result" : "error")).toBe(true);
  expect(Object.hasOwn(value, value.ok ? "error" : "result")).toBe(false);
  return value;
}

const files = { "valid.json": validText, "invalid.json": readFileSync(invalidPath, "utf8"), "new.json": readFileSync(tooNewPath, "utf8"), "bad.json": "{" };

describe("exit codes", () => {
  test("0: every command succeeds on a valid project", async () => {
    const runs: string[][] = [
      ["validate", "--in", "valid.json"],
      ["migrate", "--in", "valid.json"],
      ["describe"],
      ["compile", "--in", "valid.json", "--backend", "css-embedded"],
      ["export", "--in", "valid.json", "--format", "svg", "--out", "out.svg"],
      ["new"],
      ["embed", "--in", "valid.json", "--mode", "cdn"],
    ];
    expect(runs.map((argv) => argv[0])).toEqual([...COMMANDS]);
    for (const argv of runs) {
      const output = await run(argv, io(files));
      expect(output.exitCode).toBe(0);
      expect(output.stderr).toBe("");
      const value = parse(output.stdout);
      expect(value.ok).toBe(true);
      expect(value.command).toBe(argv[0] ?? "");
    }
  });

  test("1: a document that fails the schema lists its issues", async () => {
    const output = await run(["validate", "--in", "invalid.json"], io(files));
    expect(output.exitCode).toBe(1);
    const value = parse(output.stdout);
    if (value.ok) throw new Error("expected a failure");
    expect(value.error.code).toBe("validation");
    expect(value.error.issues?.length).toBeGreaterThan(0);
    expect(output.stderr.startsWith("svgif: validation")).toBe(true);
    const notJson = await run(["validate", "--in", "bad.json"], io(files));
    expect(notJson.exitCode).toBe(1);
    expect(parse(notJson.stdout).ok).toBe(false);
    const compile = await run(["compile", "--in", "invalid.json", "--backend", "smil"], io(files));
    expect(compile.exitCode).toBe(1);
  });

  test("2: a wrong invocation", async () => {
    const wrong: string[][] = [
      [],
      ["render"],
      ["validate"],
      ["validate", "--in"],
      ["validate", "--in", "absent.json"],
      ["validate", "--in", "valid.json", "--loud"],
      ["validate", "--in", "valid.json", "extra"],
      ["validate", "--in", "valid.json", "--json", "--human"],
      ["compile", "--in", "valid.json"],
      ["compile", "--in", "valid.json", "--backend", "canvas"],
      ["export", "--in", "valid.json", "--format", "svg"],
      ["export", "--in", "valid.json", "--format", "png", "--out", "x.png"],
      ["export", "--in", "valid.json", "--out", "x.svg"],
      ["embed", "--in", "valid.json"],
      ["embed", "--in", "valid.json", "--mode", "iframe"],
    ];
    for (const argv of wrong) {
      const output = await run(argv, io(files));
      expect(output.exitCode).toBe(2);
      const value = parse(output.stdout);
      if (value.ok) throw new Error("expected a failure");
      expect(value.error.code).toBe("usage");
    }
  });

  test("3: a newer schemaVersion is schema-too-new on every command that reads a project", async () => {
    for (const argv of [
      ["validate", "--in", "new.json"],
      ["migrate", "--in", "new.json"],
      ["compile", "--in", "new.json", "--backend", "smil"],
      ["export", "--in", "new.json", "--format", "html", "--out", "x.html"],
      ["embed", "--in", "new.json", "--mode", "inline"],
    ]) {
      const output = await run(argv, io(files));
      expect(output.exitCode).toBe(3);
      const value = parse(output.stdout);
      if (value.ok) throw new Error("expected a failure");
      expect(value.error.code).toBe("schema-too-new");
    }
  });

  test("4: a raster format without --browser writes nothing", async () => {
    for (const format of ["webp", "webm", "mp4"]) {
      const disk = io(files);
      const output = await run(["export", "--in", "valid.json", "--format", format, "--out", `x.${format}`], disk);
      expect(output.exitCode).toBe(4);
      const value = parse(output.stdout);
      if (value.ok) throw new Error("expected a failure");
      expect(value.error.code).toBe("needs-browser");
      expect(disk.written.size).toBe(0);
    }
  });

  test("70: an internal failure is reported and nothing else is printed", async () => {
    const disk = io(files);
    disk.writeFile = () => {
      throw new Error("disk is full");
    };
    const output = await run(["export", "--in", "valid.json", "--format", "svg", "--out", "x.svg"], disk);
    expect(output.exitCode).toBe(70);
    const value = parse(output.stdout);
    if (value.ok) throw new Error("expected a failure");
    expect(value.error.code).toBe("internal");
    expect(value.error.message).toBe("disk is full");
    const gif = io(files);
    const browser = await run(["export", "--in", "valid.json", "--format", "gif", "--out", "x.gif", "--browser"], gif);
    expect(browser.exitCode).toBe(2);
    expect(gif.written.size).toBe(0);
    const noWriter = await execute("export", JSON.parse(validText), { format: "svg", out: "x.svg" });
    expect(exitCode(noWriter)).toBe(70);
  });

  test("the exit table is the contract", () => {
    expect(EXIT).toEqual({ validation: 1, usage: 2, "schema-too-new": 3, "needs-browser": 4, internal: 70 });
  });
});

describe("results", () => {
  test("describe names the schema version this binary implements", async () => {
    const value = parse((await run(["describe"], io())).stdout);
    if (!value.ok) throw new Error("expected success");
    expect(value.result).toEqual({
      implementedSchemaVersion: CURRENT_SCHEMA_VERSION,
      implementedSchemaRevision: IMPLEMENTED_SCHEMA_REVISION,
      commands: [...COMMANDS],
    });
    expect(IMPLEMENTED_SCHEMA_VERSION).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(PROJECT_SCHEMAS).map(Number)).toEqual([0, IMPLEMENTED_SCHEMA_REVISION]);
    expect((PROJECT_SCHEMAS[0] as { $id: string }).$id).toBe("https://thumly.io/schema/svgif/project/v1.schema.json");
  });

  test("new prints a project that validates, and validate reads it from stdin", async () => {
    const created = parse((await run(["new"], io())).stdout);
    if (!created.ok) throw new Error("expected success");
    expect(created.result).toEqual(newProject());
    expect(projectIssues(created.result)).toEqual([]);
    const piped = await run(["validate", "--in", "-"], io({}, JSON.stringify(created.result)));
    expect(piped.exitCode).toBe(0);
    expect(parse(piped.stdout)).toMatchObject({ ok: true, result: { valid: true } });
  });

  test("migrate returns the project and compile returns the backend output", async () => {
    const migrated = parse((await run(["migrate", "--in", "valid.json"], io(files))).stdout);
    if (!migrated.ok) throw new Error("expected success");
    expect(migrated.result).toEqual(JSON.parse(validText));
    for (const backend of ["css-external", "css-embedded", "smil"]) {
      const value = parse((await run(["compile", "--in", "valid.json", "--backend", backend], io(files))).stdout);
      if (!value.ok) throw new Error("expected success");
      const result = value.result as { backend: string; svg: string; css?: string };
      expect(result.backend).toBe(backend);
      expect(result.svg.includes("<svg")).toBe(true);
      expect(typeof result.css === "string").toBe(backend === "css-external");
      expect(Object.keys(result).sort()).toEqual(backend === "css-external" ? ["backend", "css", "svg"] : ["backend", "svg"]);
    }
  });

  test("export writes the file and returns its path", async () => {
    for (const format of ["svg", "html"]) {
      const disk = io(files);
      const value = parse((await run(["export", "--in", "valid.json", "--format", format, "--out", `out.${format}`], disk)).stdout);
      if (!value.ok) throw new Error("expected success");
      expect(value.result).toEqual({ format, out: `out.${format}` });
      const text = new TextDecoder().decode(disk.written.get(`out.${format}`));
      expect(text.includes(format === "svg" ? "<svg" : "<!doctype html>") || text.includes("<!DOCTYPE html>")).toBe(true);
    }
  });

  test("embed returns the copy-source fragment for each mode", async () => {
    const cdn = parse((await run(["embed", "--in", "valid.json", "--mode", "cdn"], io(files))).stdout);
    const inline = parse((await run(["embed", "--in", "valid.json", "--mode", "inline"], io(files))).stdout);
    if (!cdn.ok || !inline.ok) throw new Error("expected success");
    const cdnResult = cdn.result as { mode: string; html: string };
    const inlineResult = inline.result as { mode: string; html: string };
    expect(cdnResult.mode).toBe("cdn");
    expect(cdnResult.html.includes('integrity="sha384-')).toBe(true);
    expect(cdnResult.html.includes("oembed")).toBe(false);
    expect(inlineResult.mode).toBe("inline");
    expect(inlineResult.html.includes(" src=")).toBe(false);
    expect(inlineResult.html.includes('id="svgif-player"')).toBe(true);
  });

  test("a revision the build does not implement is a validation failure", async () => {
    const project = JSON.parse(validText) as Record<string, unknown>;
    project.schemaRevision = 9;
    const value = await execute("validate", project);
    expect(exitCode(value)).toBe(1);
    expect(exitCode(await execute("validate", [1]))).toBe(1);
    expect(exitCode(await execute("validate", undefined))).toBe(2);
    expect(exitCode(await execute("migrate", undefined))).toBe(2);
    expect(exitCode(await execute("migrate", { schemaVersion: "1" }))).toBe(1);
  });
});

describe("help and human output", () => {
  test("help names the commands, the flags, and the exit codes", async () => {
    const output = await run(["--help"], io());
    expect(output.exitCode).toBe(0);
    const value = parse(output.stdout);
    if (!value.ok) throw new Error("expected success");
    expect(value.result).toBe(HELP);
    for (const command of COMMANDS) expect(HELP.includes(command)).toBe(true);
    for (const token of ["--backend", "--format", "--out", "--mode", "--browser", "70 internal", "4 needs a browser"]) {
      expect(HELP.includes(token)).toBe(true);
    }
    expect(HELP.includes("[[")).toBe(false);
    const human = await run(["export", "--help", "--human"], io());
    expect(human.stdout).toBe(`${HELP}\n`);
  });

  test("--human prints text and keeps the exit code", async () => {
    const ok = await run(["describe", "--human"], io());
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.includes('"commands"')).toBe(true);
    const bad = await run(["validate", "--in", "invalid.json", "--human"], io(files));
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout.startsWith("validate: validation:")).toBe(true);
    expect(bad.stdout.includes("project.")).toBe(true);
  });
});

describe("the bin", () => {
  test("prints one JSON document, writes the file, and sets the exit code", () => {
    const dir = mkdtempSync(join(tmpdir(), "svgif-cli-"));
    try {
      const bin = resolve(here, "../src/bin.ts");
      const out = join(dir, "out.svg");
      const good = spawnSync(process.execPath, [bin, "export", "--in", validPath, "--format", "svg", "--out", out], { encoding: "utf8" });
      expect(good.status).toBe(0);
      expect(parse(good.stdout).ok).toBe(true);
      expect(readFileSync(out, "utf8").includes("<svg")).toBe(true);
      const piped = spawnSync(process.execPath, [bin, "validate", "--in", "-"], { encoding: "utf8", input: validText });
      expect(piped.status).toBe(0);
      const bad = spawnSync(process.execPath, [bin, "validate", "--in", invalidPath], { encoding: "utf8" });
      expect(bad.status).toBe(1);
      expect(parse(bad.stdout).ok).toBe(false);
      expect(bad.stderr.startsWith("svgif: validation")).toBe(true);
      const tooNew = spawnSync(process.execPath, [bin, "validate", "--in", tooNewPath], { encoding: "utf8" });
      expect(tooNew.status).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
