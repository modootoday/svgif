#!/usr/bin/env node
// Walk presets/<category>/<id>.json and write presets/index.json.
// The index is generated. It is not a hand-written catalogue.
// Zero preset files writes an empty index. --check fails when the
// committed file differs from that walk. This script does not list ids.
// --contrast measures each text fill against the opaque shape painted
// under it, or against #ffffff when the text sits on the canvas.
// A filled glyph is not that backdrop. A stroke-only halo uses the core.
// Every preset text fill needs 4.5:1 on that backdrop.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const CARD = "#ffffff";
const TEXT_RATIO = 4.5;

function normalizeHex(value) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text.slice(1).split("").map((item) => item + item).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  return "";
}

// Same relative luminance and ratio as contrastRatio in check-presets.mjs.
function relativeLuminance(value) {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const linear = (channel) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const channels = [1, 3, 5].map((offset) => linear(Number.parseInt(hex.slice(offset, offset + 2), 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(left, right) {
  const lighter = relativeLuminance(left);
  const darker = relativeLuminance(right);
  if (lighter === null || darker === null) return 0;
  const hi = Math.max(lighter, darker);
  const lo = Math.min(lighter, darker);
  return (hi + 0.05) / (lo + 0.05);
}

function requiredRatio() {
  return TEXT_RATIO;
}

function solidHex(value) {
  return normalizeHex(value);
}

function opaqueShape(node) {
  if (!node?.box || !solidHex(node.fill)) return false;
  return node.opacity === undefined || node.opacity >= 1 - 1e-9;
}

function containsBox(outer, inner) {
  if (!outer || !inner) return false;
  const slack = 1e-6;
  return outer.minX <= inner.minX + slack
    && outer.minY <= inner.minY + slack
    && outer.maxX + slack >= inner.maxX
    && outer.maxY + slack >= inner.maxY;
}

function intersectsBox(left, right) {
  if (!left || !right) return false;
  return left.minX < right.maxX && left.maxX > right.minX && left.minY < right.maxY && left.maxY > right.minY;
}

function countsAsBackdrop(shape, text) {
  if (!opaqueShape(shape)) return false;
  if (shape.kind === "text" && solidHex(text?.fill)) return false;
  return true;
}

function backdropOf(nodes, index) {
  const text = nodes[index];
  if (!text?.box) return CARD;
  for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
    const shape = nodes[earlier];
    if (!countsAsBackdrop(shape, text)) continue;
    if (containsBox(shape.box, text.box)) return solidHex(shape.fill);
  }
  return CARD;
}

function choiceBackdrops(nodes, index, backdrop) {
  const found = [backdrop];
  const text = nodes[index];
  if (!text?.box) return found;
  for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
    const shape = nodes[earlier];
    if (!countsAsBackdrop(shape, text) || !intersectsBox(shape.box, text.box)) continue;
    const fill = solidHex(shape.fill);
    if (!found.includes(fill)) found.push(fill);
  }
  return found;
}

function colorsOf(node) {
  const colors = [];
  const add = (value) => {
    const hex = solidHex(value);
    if (hex && !colors.includes(hex)) colors.push(hex);
  };
  if (Array.isArray(node.colors)) {
    for (const color of node.colors) add(color);
    return colors;
  }
  add(node.fill);
  if (!solidHex(node.fill)) add(node.stroke);
  else add(node.stroke);
  return colors;
}

export function measureParent(nodes) {
  const samples = [];
  nodes.forEach((node, index) => {
    if (node?.kind !== "text") return;
    const backdrop = backdropOf(nodes, index);
    const minimum = requiredRatio();
    for (const color of colorsOf(node)) {
      const ratio = contrastRatio(color, backdrop);
      samples.push({
        color,
        backdrop,
        backdrops: choiceBackdrops(nodes, index, backdrop),
        minimum,
        ratio,
        pass: ratio >= minimum,
        size: typeof node.size === "number" ? node.size : null,
      });
    }
  });
  return samples;
}

export function suggestedPaint(fill, backdrops, minimum) {
  const origin = solidHex(fill);
  const targets = [];
  for (const backdrop of backdrops ?? []) {
    const hex = solidHex(backdrop);
    if (hex && !targets.includes(hex)) targets.push(hex);
  }
  if (targets.length === 0) targets.push(CARD);
  if (!origin) return origin;
  if (targets.every((backdrop) => contrastRatio(origin, backdrop) >= minimum)) return origin;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(origin.slice(offset, offset + 2), 16));
  const originLum = relativeLuminance(origin);
  const failing = targets.filter((backdrop) => contrastRatio(origin, backdrop) < minimum);
  const lighten = failing.every((backdrop) => originLum > relativeLuminance(backdrop));
  for (let step = 1; step <= 255; step += 1) {
    const scale = step / 255;
    const next = channels.map((channel) => {
      const value = lighten ? channel + (255 - channel) * scale : channel * (1 - scale);
      return Math.round(value);
    });
    const candidate = `#${next.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    if (targets.every((backdrop) => contrastRatio(candidate, backdrop) >= minimum)) return candidate;
  }
  return lighten ? "#ffffff" : "#000000";
}

function pathGeometry(d) {
  if (typeof d !== "string" || d.length === 0) return { box: null, subpaths: 0 };
  const tokens = d.replace(/,/g, " ").match(/[MmLlHhVvAaCcQqSsTtZz]|[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/g);
  if (!tokens) return { box: null, subpaths: 0 };
  let index = 0;
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let command = "";
  let subpaths = 0;
  const take = () => Number(tokens[index++]);
  const mark = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const at = (x, y) => {
      const px = relative ? cx + x : x;
      const py = relative ? cy + y : y;
      mark(px, py);
      cx = px;
      cy = py;
    };
    if (upper === "M" || upper === "L" || upper === "T") {
      if (index + 2 > tokens.length) break;
      if (upper === "M") subpaths += 1;
      at(take(), take());
      if (command === "M") command = "L";
      if (command === "m") command = "l";
    } else if (upper === "H") {
      if (index + 1 > tokens.length) break;
      const x = relative ? cx + take() : take();
      mark(x, cy);
      cx = x;
    } else if (upper === "V") {
      if (index + 1 > tokens.length) break;
      const y = relative ? cy + take() : take();
      mark(cx, y);
      cy = y;
    } else if (upper === "A") {
      if (index + 7 > tokens.length) break;
      const rx = Math.abs(take());
      const ry = Math.abs(take());
      take();
      take();
      take();
      mark(cx - rx, cy - ry);
      mark(cx + rx, cy + ry);
      at(take(), take());
      mark(cx - rx, cy - ry);
      mark(cx + rx, cy + ry);
    } else if (upper === "C") {
      if (index + 6 > tokens.length) break;
      at(take(), take());
      at(take(), take());
      at(take(), take());
    } else if (upper === "Q" || upper === "S") {
      if (index + 4 > tokens.length) break;
      at(take(), take());
      at(take(), take());
    } else if (upper === "Z") {
      command = "";
    } else {
      break;
    }
  }
  if (!(maxX > minX) || !(maxY > minY)) return { box: null, subpaths };
  return { box: { minX, minY, maxX, maxY }, subpaths };
}

function motionTracks(preset) {
  const tracks = preset?.motionPreset?.tracks;
  return Array.isArray(tracks) ? tracks : [];
}

function trackMatches(track, layerId, first) {
  const named = typeof track?.layer === "string" && track.layer.length > 0 ? track.layer : "";
  return named ? named === layerId : first;
}

function lastKey(track) {
  const keys = Array.isArray(track?.keys) ? track.keys : [];
  return keys.length > 0 ? keys[keys.length - 1].value : undefined;
}

function settledPath(preset, layerId, first) {
  let value = "";
  for (const track of motionTracks(preset)) {
    if (track?.property !== "attr.d" || !trackMatches(track, layerId, first)) continue;
    const next = lastKey(track);
    if (typeof next === "string") value = next;
  }
  return value;
}

function settledOffset(preset, layerId, first) {
  let x = 0;
  let y = 0;
  for (const track of motionTracks(preset)) {
    if (!trackMatches(track, layerId, first)) continue;
    const value = lastKey(track);
    if (track.property === "transform.translateX" && typeof value === "number") x = value;
    if (track.property === "transform.translateY" && typeof value === "number") y = value;
  }
  return { x, y };
}

function shiftBox(box, offset) {
  if (!box || (offset.x === 0 && offset.y === 0)) return box;
  return {
    minX: box.minX + offset.x,
    minY: box.minY + offset.y,
    maxX: box.maxX + offset.x,
    maxY: box.maxY + offset.y,
  };
}

function paintColors(preset, layerId, first, fill, stroke) {
  const colors = [];
  const add = (value) => {
    const hex = solidHex(value);
    if (hex && !colors.includes(hex)) colors.push(hex);
  };
  add(fill);
  if (!solidHex(fill)) add(stroke);
  else add(stroke);
  for (const track of motionTracks(preset)) {
    const property = typeof track?.property === "string" ? track.property : "";
    const paint = property === "attr.fill" || property === "attr.stroke" || property.endsWith("stop-color");
    if (!paint) continue;
    const named = typeof track.layer === "string" && track.layer.length > 0 ? track.layer : "";
    const matches = named ? named === layerId : first;
    if (!matches) continue;
    for (const key of Array.isArray(track.keys) ? track.keys : []) add(key?.value);
  }
  const parameters = Array.isArray(preset?.parameters) ? preset.parameters : [];
  const nodeId = `s-${preset?.id ?? ""}`;
  for (const parameter of parameters) {
    const bind = parameter?.bind;
    if (!bind || bind.kind !== "replace") continue;
    const property = typeof bind.property === "string" ? bind.property : "";
    const paint = property === "attr.fill" || property === "attr.stroke" || property.endsWith("stop-color");
    if (!paint) continue;
    const layers = Array.isArray(bind.layers) ? bind.layers : [];
    const hits = layers.includes(layerId) || (first && (layers.includes(nodeId) || layers.length === 0));
    if (hits) add(parameter.value);
  }
  return colors;
}

function artworkNodes(preset) {
  const copied = preset?.component?.copied ?? {};
  const layers = Array.isArray(copied.layers) && copied.layers.length > 0 ? copied.layers : null;
  const size = typeof copied.text?.size === "number" ? copied.text.size : null;
  const componentFill = solidHex(copied.fill);
  const sources = layers
    ? layers.map((layer, index) => ({
      layerId: typeof layer?.id === "string" ? layer.id : "",
      first: index === 0,
      fill: layer?.fill,
      stroke: layer?.stroke,
      opacity: typeof layer?.opacity === "number" ? layer.opacity : copied.opacity,
      d: layer?.shape?.d || settledPath(preset, layer?.id, index === 0),
    }))
    : [{
      layerId: "",
      first: true,
      fill: copied.fill,
      stroke: copied.stroke,
      opacity: copied.opacity,
      d: copied.shape?.d || settledPath(preset, "", true),
    }];
  const nodes = sources.map((source) => {
    const geometry = pathGeometry(source.d);
    const offset = settledOffset(preset, source.layerId, source.first);
    return {
      layerId: source.layerId,
      first: source.first,
      fill: source.fill,
      stroke: source.stroke,
      opacity: source.opacity,
      localBox: geometry.box,
      box: shiftBox(geometry.box, offset),
      subpaths: geometry.subpaths,
      size,
      colors: paintColors(preset, source.layerId, source.first, source.fill, source.stroke),
    };
  });
  const textKind = preset?.component?.kind === "text";
  nodes.forEach((node, index) => {
    const laterPlate = nodes.slice(index + 1).some((later) => later.subpaths > 1 && containsBox(node.box, later.box));
    const single = node.subpaths <= 1;
    const plate = single && (laterPlate || (solidHex(node.fill) && componentFill && solidHex(node.fill) !== componentFill));
    const hasInk = node.colors.length > 0 || solidHex(node.stroke);
    node.kind = textKind && !plate && hasInk ? "text" : "shape";
  });
  return nodes;
}

export function contrastSamples(preset, file = preset?.id ?? "") {
  const samples = [];
  const parents = [artworkNodes(preset)];
  const ink = preset?.component?.copied?.ink;
  const siblings = parents[0];
  if (ink && typeof ink.d === "string" && solidHex(ink.fill) && siblings.length > 0) {
    const host = siblings[0];
    const geometry = pathGeometry(ink.d);
    const size = preset?.component?.kind === "text" && typeof preset.component.copied?.text?.size === "number"
      ? preset.component.copied.text.size
      : null;
    parents.push([
      { ...host, kind: "shape", colors: [], box: host.localBox ?? host.box },
      {
        kind: "text",
        fill: ink.fill,
        box: geometry.box,
        size,
        colors: [solidHex(ink.fill)],
      },
    ]);
  }
  for (const parent of parents) {
    for (const sample of measureParent(parent)) {
      samples.push({ file, id: preset?.id ?? "", ...sample });
    }
  }
  return samples;
}

function formatRatio(value) {
  return `${value.toFixed(2)}:1`;
}

function contrastFailures(directory = presetsDir) {
  const failures = [];
  const seen = new Set();
  let checked = 0;
  for (const presetFile of listPresetFiles(directory)) {
    const full = join(directory, presetFile.file.slice("presets/".length));
    let preset;
    try {
      preset = JSON.parse(readFileSync(full, "utf8"));
    } catch {
      failures.push(`${presetFile.file} is not JSON`);
      continue;
    }
    for (const sample of contrastSamples(preset, presetFile.file)) {
      checked += 1;
      if (sample.pass) continue;
      const line = `${presetFile.file} text fill ${sample.color} on ${sample.backdrop} is ${formatRatio(sample.ratio)}, needs ${formatRatio(sample.minimum)}`;
      if (seen.has(line)) continue;
      seen.add(line);
      failures.push(line);
    }
  }
  return { failures, checked };
}

function checkContrast() {
  const { failures, checked } = contrastFailures();
  if (failures.length === 0) console.log(`preset text contrast ok (${checked} text fills)`);
  return failures;
}

function assertCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function selfTest() {
  const cream = "#f4f0e6";
  const card = CARD;
  const pill = "#141414";
  const textBox = { minX: 10, minY: 10, maxX: 40, maxY: 30 };
  const bare = measureParent([
    { kind: "text", fill: cream, box: textBox, size: 42 },
  ]);
  assertCheck(bare.length === 1, "text on the canvas is measured");
  assertCheck(bare[0].backdrop === card, "text on the canvas uses #ffffff");
  assertCheck(bare[0].pass === false, "cream on #ffffff fails");
  assertCheck(bare[0].ratio.toFixed(2) === "1.14", "cream on #ffffff is 1.14:1");
  assertCheck(bare[0].minimum === 4.5, "every text fill needs 4.5:1");
  const onPill = measureParent([
    { kind: "shape", fill: pill, box: { minX: 0, minY: 0, maxX: 80, maxY: 50 } },
    { kind: "text", fill: cream, box: textBox, size: 42 },
  ]);
  assertCheck(onPill.length === 1, "text on a pill is measured");
  assertCheck(onPill[0].backdrop === pill, "the containing shape is the backdrop");
  assertCheck(onPill[0].pass === true, "cream on the dark pill passes");
  const stacked = measureParent([
    { kind: "text", fill: "#1c1915", box: textBox, size: 42 },
    { kind: "text", fill: "#141414", box: textBox, size: 42 },
  ]);
  assertCheck(stacked[1].backdrop === card, "a filled glyph is not the backdrop of the glyph above it");
  assertCheck(stacked[1].pass === true, "ink stacked on another glyph is measured on #ffffff");
  const halo = measureParent([
    { kind: "text", fill: "#141414", box: textBox, size: 35 },
    { kind: "text", fill: "none", stroke: "#f7f4ee", box: textBox, size: 35 },
  ]);
  assertCheck(halo[1].backdrop === "#141414" && halo[1].color === "#f7f4ee" && halo[1].pass === true, "a stroke-only halo uses the core fill");
  assertCheck(suggestedPaint(cream, [pill], 4.5) === cream, "text on a dark pill is not darkened");
  const ink = measureParent([
    { kind: "text", fill: "#1c1915", box: textBox, size: 42 },
  ]);
  assertCheck(ink[0].pass === true && ink[0].ratio.toFixed(2) === "17.51", "default ink on #ffffff is 17.51:1");
  const amber = measureParent([
    { kind: "text", fill: "#9a6400", box: textBox, size: 42 },
  ]);
  assertCheck(amber[0].pass === true && amber[0].ratio.toFixed(2) === "5.00", "deep amber on #ffffff is 5.00:1");
  const washed = measureParent([
    { kind: "text", fill: "#96948e", box: textBox, size: 42 },
  ]);
  assertCheck(washed[0].pass === false, "a mid-gray that only clears 3:1 fails");
  const missed = measureParent([
    { kind: "shape", fill: pill, box: { minX: 0, minY: 0, maxX: 4, maxY: 4 } },
    { kind: "text", fill: cream, box: textBox, size: 18 },
  ]);
  assertCheck(missed[0].backdrop === card, "a shape that misses the text box leaves #ffffff");
  assertCheck(missed[0].minimum === 4.5, "smaller text still uses 4.5:1");
  const veil = measureParent([
    { kind: "shape", fill: pill, opacity: 0.4, box: { minX: 0, minY: 0, maxX: 80, maxY: 50 } },
    { kind: "text", fill: cream, box: textBox, size: 42 },
  ]);
  assertCheck(veil[0].backdrop === card, "a translucent shape is not the backdrop");
  const nested = measureParent([
    { kind: "shape", fill: card, box: { minX: 0, minY: 0, maxX: 120, maxY: 80 } },
    { kind: "shape", fill: pill, box: { minX: 0, minY: 0, maxX: 80, maxY: 50 } },
    { kind: "text", fill: cream, box: textBox, size: 24 },
  ]);
  assertCheck(nested[0].backdrop === pill, "the nearest earlier containing shape wins");
  assertCheck(nested[0].minimum === 4.5, "size 24 still uses 4.5:1");
  const cardPreset = {
    id: "sample-card",
    component: { kind: "text", copied: { fill: cream, text: { content: "NOTE", size: 42 } } },
  };
  const cardSamples = contrastSamples(cardPreset, "presets/text/sample-card.json");
  assertCheck(cardSamples.length === 1 && cardSamples[0].backdrop === card && cardSamples[0].pass === false, "a preset with no plate uses #ffffff");
  const pillPreset = {
    id: "sample-pill",
    component: {
      kind: "text",
      copied: {
        fill: cream,
        text: { content: "SEE", size: 28 },
        layers: [
          { id: "pill", fill: pill, shape: { d: "M 0 0 H 80 V 40 H 0 Z" } },
          { id: "label", fill: cream, shape: { d: "M 10 10 H 20 V 16 H 10 Z M 24 10 H 34 V 16 H 24 Z" } },
        ],
      },
    },
  };
  const pillSamples = contrastSamples(pillPreset, "presets/text/sample-pill.json");
  assertCheck(pillSamples.length === 1, "the pill itself is not a text fill");
  assertCheck(pillSamples[0].color === cream && pillSamples[0].backdrop === pill && pillSamples[0].pass === true, "text inside the pill uses the pill fill");
  const partial = {
    id: "sample-bar",
    component: {
      kind: "text",
      copied: {
        fill: cream,
        text: { content: "MARK", size: 42 },
        layers: [
          { id: "bar", fill: "#ffb703", shape: { d: "M 0 20 H 80 V 40 H 0 Z" } },
          { id: "words", fill: cream, shape: { d: "M 0 0 H 10 V 8 H 0 Z M 12 0 H 22 V 30 H 12 Z" } },
        ],
      },
    },
  };
  const partialSamples = contrastSamples(partial, "presets/text/sample-bar.json");
  assertCheck(partialSamples.length === 1 && partialSamples[0].backdrop === card, "a bar that does not contain the text leaves #ffffff");
  assertCheck(partialSamples[0].backdrops.includes("#ffb703"), "a bar that intersects the text is recorded");
  console.log("preset contrast self-test ok");
}

const launched = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launched) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    writeIndex();
  } else if (args.length === 1 && args[0] === "--check") {
    checkIndex();
  } else if (args.length === 1 && args[0] === "--contrast") {
    const failures = checkContrast();
    if (failures.length > 0) {
      for (const failure of failures) console.error(failure);
      process.exit(1);
    }
  } else if (args.length === 1 && args[0] === "--self-test") {
    selfTest();
  } else {
    console.error("usage: node scripts/ci/render-preset-index.mjs [--check | --contrast | --self-test]");
    process.exit(2);
  }
}
