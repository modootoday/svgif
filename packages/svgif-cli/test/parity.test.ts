/**
 * CLI and Studio parity.
 * On one fixture the CLI's SVG bytes are the bytes Studio downloads, and its
 * HTML bytes are the bytes Studio's save writes for the same project.
 * [[sot:svgif/agent-surface]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run, type CliIo } from "../src/index.ts";
import { createEditor, loadComposition } from "../../../apps/studio/src/composition.ts";
import { imageFile } from "../../../apps/studio/src/download-plain.ts";
import { saveAndExportHtml } from "../../../apps/studio/src/project-file.ts";
import { importHtml } from "../../../apps/studio/src/import-html.ts";
import type { HtmlProject } from "../../svgif-export/src/html.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const fixtureText = readFileSync(fixturePath, "utf8");

async function cliExport(format: string, text = fixtureText): Promise<Uint8Array> {
  const written = new Map<string, Uint8Array>();
  const io: CliIo = {
    readFile: () => text,
    readStdin: () => "",
    writeFile(path, bytes) {
      written.set(path, bytes);
    },
  };
  const output = await run(["export", "--in", "project.json", "--format", format, "--out", "out"], io);
  expect(output.exitCode).toBe(0);
  const bytes = written.get("out");
  if (!bytes) throw new Error("the CLI wrote no file");
  return bytes;
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("parity on schema/fixtures/project/v1-valid.json", () => {
  test("SVG bytes match the Studio image download", async () => {
    const project = JSON.parse(fixtureText) as HtmlProject;
    const composition = loadComposition(project.composition);
    if (!composition) throw new Error("Studio did not load the fixture");
    const studio = await bytesOf(imageFile({ ...createEditor(), composition }));
    const cli = await cliExport("svg");
    expect(cli.length).toBeGreaterThan(100);
    expect(Buffer.from(cli).equals(Buffer.from(studio))).toBe(true);
  });

  test("SVG bytes match when the composition loops", async () => {
    const project = JSON.parse(fixtureText) as HtmlProject & { schemaRevision: number };
    project.schemaRevision = 1;
    (project.composition as { loop?: boolean }).loop = true;
    const composition = loadComposition(project.composition);
    if (!composition) throw new Error("Studio did not load the fixture");
    const studio = await bytesOf(imageFile({ ...createEditor(), composition }));
    const cli = await cliExport("svg", JSON.stringify(project));
    expect(Buffer.from(cli).equals(Buffer.from(studio))).toBe(true);
    expect(Buffer.from(cli).equals(Buffer.from(await cliExport("svg")))).toBe(false);
  });

  test("HTML bytes match the Studio save writer, and Studio opens the CLI file", async () => {
    const project = JSON.parse(fixtureText) as HtmlProject;
    const last = project.provenance.generations[project.provenance.generations.length - 1] as { id: string; savedAt: string };
    const studio = await bytesOf(
      saveAndExportHtml(project, { embedPlayer: false, embedStudio: false, id: last.id, savedAt: last.savedAt }),
    );
    const cli = await cliExport("html");
    expect(cli.length).toBeGreaterThan(100);
    expect(Buffer.from(cli).equals(Buffer.from(studio))).toBe(true);
    const opened = importHtml(new TextDecoder().decode(cli));
    expect(opened.ok).toBe(true);
  });
});
