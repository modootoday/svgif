#!/usr/bin/env node
// Walk presets/<category>/<id>.json and write presets/index.json.
// The index is generated. It is not a hand-written catalogue.
// Zero preset files writes an empty index. --check fails when the
// committed file differs from that walk. This script does not list ids.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const presetsDir = join(root, "presets");
const indexPath = join(presetsDir, "index.json");

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function listPresetFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const presets = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const categoryDir = join(directory, entry.name);
    let files;
    try {
      files = readdirSync(categoryDir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      throw error;
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const id = file.name.slice(0, -".json".length);
      if (!id || id.startsWith(".")) continue;
      presets.push({
        category: entry.name,
        id,
        file: `presets/${entry.name}/${file.name}`,
      });
    }
  }
  presets.sort((left, right) => {
    const byCategory = compareText(left.category, right.category);
    if (byCategory !== 0) return byCategory;
    return compareText(left.id, right.id);
  });
  return presets;
}

export function renderIndex(directory = presetsDir) {
  return `${JSON.stringify({ presets: listPresetFiles(directory) }, null, 2)}\n`;
}

function writeIndex() {
  mkdirSync(presetsDir, { recursive: true });
  const text = renderIndex();
  writeFileSync(indexPath, text);
  const count = JSON.parse(text).presets.length;
  console.log(`wrote presets/index.json (${count} presets)`);
}

function checkIndex() {
  const text = renderIndex();
  let current;
  try {
    current = readFileSync(indexPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      console.error("presets/index.json is missing");
      process.exit(1);
    }
    throw error;
  }
  if (current !== text) {
    console.error("presets/index.json differs from the walk of presets/");
    process.exit(1);
  }
  const count = JSON.parse(text).presets.length;
  console.log(`preset index matches the walk (${count} presets)`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  writeIndex();
} else if (args.length === 1 && args[0] === "--check") {
  checkIndex();
} else {
  console.error("usage: node scripts/ci/render-preset-index.mjs [--check]");
  process.exit(2);
}
