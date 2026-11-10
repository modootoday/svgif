#!/usr/bin/env node
// Walk presets/ and validate every preset file. Zero files is a pass.
// This script does not keep a list of preset ids.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateContract } from "./check-schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(["later", "out"]);

function readDocument(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function checkPresetTree(presetsRoot) {
  const errors = [];
  if (!existsSync(presetsRoot)) return errors;
  const seen = new Map();
  for (const entry of readdirSync(presetsRoot, { withFileTypes: true })) {
    const top = join(presetsRoot, entry.name);
    if (entry.isFile()) {
      if (entry.name === "index.json" || entry.name.endsWith(".golden.svg")) continue;
      if (entry.name.endsWith(".json")) errors.push(`presets/${entry.name} is not presets/<category>/<id>.json`);
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (!SLUG.test(entry.name) || RESERVED.has(entry.name)) {
      errors.push(`presets/${entry.name} is not a category directory`);
    }
    for (const file of readdirSync(top, { withFileTypes: true })) {
      const relativePath = `presets/${entry.name}/${file.name}`;
      if (file.isDirectory()) {
        errors.push(`${relativePath} is nested too deeply`);
        continue;
      }
      if (!file.isFile()) continue;
      if (file.name.endsWith(".golden.svg")) continue;
      if (!file.name.endsWith(".json")) continue;
      const id = file.name.slice(0, -".json".length);
      if (!SLUG.test(id)) errors.push(`${relativePath} file name is not a kebab slug`);
      const full = join(top, file.name);
      let document;
      try {
        document = readDocument(full);
      } catch {
        errors.push(`${relativePath} is not JSON`);
        continue;
      }
      for (const found of validateContract("preset", document)) errors.push(`${relativePath} ${found}`);
      if (!document || typeof document !== "object" || Array.isArray(document)) continue;
      if (document.id !== id) errors.push(`${relativePath} id does not match the file name`);
      if (document.category !== entry.name) errors.push(`${relativePath} category does not match the directory`);
      if (typeof document.id === "string") {
        const prior = seen.get(document.id);
        if (prior) errors.push(`${relativePath} duplicates id ${document.id} from ${prior}`);
        else seen.set(document.id, relativePath);
      }
    }
  }
  return errors;
}

function runCoverage() {
  const script = join(repoRoot, "scripts/ci/preset-coverage.mjs");
  if (!existsSync(script)) return 0;
  const result = spawnSync(process.execPath, [script], { cwd: repoRoot, stdio: "inherit" });
  return result.status ?? 1;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function selfTest() {
  const sample = readDocument(join(repoRoot, "schema/fixtures/preset/v1-valid.json"));
  const root = mkdtempSync(join(tmpdir(), "svgif-presets-"));
  const preset = (category, id, patch = {}) => {
    const document = structuredClone(sample);
    document.category = category;
    document.id = id;
    Object.assign(document, patch);
    const directory = join(root, category);
    mkdirSync(directory, { recursive: true });
    writeJson(join(directory, `${id}.json`), document);
  };
  try {
    const missing = join(root, "missing");
    if (checkPresetTree(missing).length !== 0) throw new Error("a missing directory should pass");
    if (checkPresetTree(root).length !== 0) throw new Error("zero files should pass");
    writeJson(join(root, "index.json"), { presets: [] });
    writeFileSync(join(root, "notes.txt"), "notes\n");
    if (checkPresetTree(root).length !== 0) throw new Error("an empty index should pass");
    preset("primitives", "soft-rect");
    writeFileSync(join(root, "primitives", "soft-rect.golden.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
    if (checkPresetTree(root).length !== 0) throw new Error("one preset should pass");
    preset("text", "fade-title");
    if (checkPresetTree(root).length !== 0) throw new Error("two presets should pass");
    preset("icons", "soft-rect");
    const duplicate = checkPresetTree(root);
    if (!duplicate.some((line) => line.includes("duplicates id"))) throw new Error("a duplicate id should fail");
    rmSync(join(root, "icons"), { recursive: true });
    const mismatch = structuredClone(sample);
    mismatch.id = "other-name";
    mismatch.category = "text";
    writeJson(join(root, "primitives", "other-name.json"), mismatch);
    const mismatched = checkPresetTree(root);
    if (!mismatched.some((line) => line.includes("does not match"))) throw new Error("a path mismatch should fail");
    rmSync(join(root, "primitives", "other-name.json"));
    mkdirSync(join(root, "later"));
    const reserved = checkPresetTree(root);
    if (!reserved.some((line) => line.includes("later"))) throw new Error("later should fail");
    rmSync(join(root, "later"), { recursive: true });
    writeJson(join(root, "loose.json"), sample);
    if (!checkPresetTree(root).some((line) => line.includes("loose.json"))) throw new Error("a loose file should fail");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const repoErrors = checkPresetTree(join(repoRoot, "presets"));
  if (repoErrors.length > 0) throw new Error(repoErrors.join("\n"));
  console.log("presets self-test ok");
}

const launched = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launched) {
  try {
    if (process.argv.includes("--self-test")) {
      selfTest();
    } else {
      const errors = checkPresetTree(join(repoRoot, "presets"));
      if (errors.length > 0) {
        for (const error of errors) console.error(error);
        process.exit(1);
      }
      const coverage = runCoverage();
      if (coverage !== 0) process.exit(coverage);
      console.log("presets ok");
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
