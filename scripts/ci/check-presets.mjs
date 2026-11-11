#!/usr/bin/env node
// Walk presets/ and validate every preset file. Zero files is a pass.
// This script does not keep a list of preset ids.
// --goldens recompiles every golden from the preset plus the shared demo scene.
// The same preset and fixture are byte-stable.
// A parameter named loop with boolean true sets loop on the compiled timeline.
// Absent, false, or any other value leaves that field unset.
// A parameter named scene with boolean false omits the baked subject and ground.
// A motion-class subject preset uses that omission when the parameter is absent.
// Boolean true keeps the subject in the generator. A string or a number keeps it.
// A track whose sampled value does not change keeps its first key. The compiler
// writes that key as the static attribute. An element that stays at opacity 0,
// and that no clip or mask reveals, is omitted.
// A non-static golden is sampled at frame 0, a mid frame, and the last frame
// with CSS left active. pauseAnimations and setCurrentTime run before the shot.
// The painted clip is compared with the markup clip.
// Motion is a pixel difference. A beat is sampled at its peak frame.
// The mid-frame paint of any other moving document must differ from frame 0 and
// from the last frame. A looping document is also sampled at dur + 0.1s.
// One extra sample replaces the stage fill with #f7f7f7. The fixture fill stays.
// The browser binary is the studio shell lookup.
// A camera preset is a perspective projector. Scale changes fovY and keeps the
// eye on the rest pose. Dividing world Z by scale is not the zoom. depthRatio
// is the far travel divided by the near travel. The slab travels 50 px and the
// cube travels 30.497 px, within 0.05 px. The mesh positions for that
// ratio are placed with the pose. A camera subject stays inside the viewBox.
// A mesh stays on the near side of clip.z + clip.w >= 0. seed, strength,
// margin, scale, start, endFrame, and view each change the pose or the picture.
// An entrance that is not a beat keeps the mid frame at least 2 px from the
// last frame. A non-beat that starts and ends at rest skips the last-frame
// sampler message.
// Motion is a 2x raster after SMIL seek. Computed style is not the motion test.
// A looping timeline ends on its last key and does not add a frame past it.
// A wrap key that repeats key 0 may sit at frame durationInFrames.
// That frame is the duration. It is not one past the last key.
// Frame N is not rendered. dur is N / fps. A last key at frame 24 is 0.8 s.
// A wrap key at frame 30 is 1 s.
// An ink subpath that overlaps a filled subpath of the same path must paint.
// A same-direction winding that leaves the raster unchanged fails.
// The motion band uses the dominant visible track. A short opacity fade does
// not set it when another track moves. Equal opacity tracks measure the one
// that rises. A track that is still holding does not set the band.
// A beat peak reads a numeric key, a path box, or a matrix on the element
// path. The largest change from frame 0 wins. A tie keeps the earlier frame.
// Reveal completion is raster coverage.
// A camera bake receives the pose keys, so a hold stays a discrete step.
// copied.strokeWidth is written as attr.strokeWidth. Absent means no stroke width.
// copied.ink is a second path in that same wrapper, with its fill and no stroke.
// copied.layers emits one node per layer, in list order. A track with no layer
// belongs to the first layer. The ink path stays in that first wrapper.
// Pixel text is one rectangle per cell. A horizontal run on one path, the same
// row and the same fill, with touching edges, becomes one rectangle. A vertical
// stack stays separate. Keys that share that run stay aligned, so the filled
// picture does not change.
// A backgrounds preset paints directly after s-stage and before the subject
// and ground. Other categories keep the preset group after the baked subject.
// Opaque full-bleed is only bg.solid, bg.linearGradient, bg.sky, and
// bg.radialGradient. A pattern full-bleed uses opacity 0.12 to 0.3, or a dark
// tone from #1f1f1f to #2a2a2a.
// [[sot:svgif/determinism]] [[sot:svgif/preset-registry]]
// The default walk does not compare goldens.
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { inflateSync } from "node:zlib";
import { accessSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateContract } from "./check-schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(["later", "out"]);
const DEMO_SCENE = join(repoRoot, "schema/fixtures/preset/demo-scene.json");
const MOTION_CLASS = join(repoRoot, "schema/fixtures/preset/motion-class.json");
const CAMERA_POSE = new Set([
  "transform.translateX",
  "transform.translateY",
  "transform.rotate",
  "transform.scaleX",
  "transform.scaleY",
]);

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

let enginePromise;

function loadEngine() {
  if (!enginePromise) {
    const href = (path) => pathToFileURL(path).href;
    enginePromise = Promise.all([
      import(href(join(repoRoot, "packages/svgif/src/lower/index.ts"))),
      import(href(join(repoRoot, "packages/svgif/src/bake/index.ts"))),
      import(href(join(repoRoot, "packages/svgif/src/scene/index.ts"))),
      import(href(join(repoRoot, "packages/svgif/src/ir/index.ts"))),
      import(href(join(repoRoot, "packages/svgif/src/math/index.ts"))),
    ]).then(([lower, bake, scene, ir, math]) => ({ lower, bake, scene, ir, math }));
  }
  return enginePromise;
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} is not a finite number`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} is not a positive integer`);
  return value;
}

function vec3(value, label) {
  if (!value || typeof value !== "object") throw new Error(`${label} is missing`);
  return {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
    z: finiteNumber(value.z, `${label}.z`),
  };
}

function rgb(value, label) {
  if (!value || typeof value !== "object") throw new Error(`${label} is missing`);
  return {
    r: finiteNumber(value.r, `${label}.r`),
    g: finiteNumber(value.g, `${label}.g`),
    b: finiteNumber(value.b, `${label}.b`),
  };
}

function assertDemoScene(fixture) {
  if (!fixture || fixture.role !== "svgif-demo-scene") throw new Error("demo scene is missing");
  positiveInteger(fixture.fps, "fps");
  finiteNumber(fixture.width, "width");
  finiteNumber(fixture.height, "height");
  if (!(fixture.width > 0) || !(fixture.height > 0)) throw new Error("frame size is not positive");
  positiveInteger(fixture.durationInFrames, "duration");
  if (typeof fixture.stage?.fill !== "string" || fixture.stage.fill.length === 0) throw new Error("stage fill is missing");
  if (fixture.camera?.id !== "camera") throw new Error("demo camera is missing");
  finiteNumber(fixture.camera.fovY, "fovY");
  finiteNumber(fixture.camera.near, "near");
  finiteNumber(fixture.camera.far, "far");
  vec3(fixture.camera.position, "camera.position");
  rgb(fixture.lights?.ambient, "ambient");
  if (!Array.isArray(fixture.lights?.directional) || fixture.lights.directional.length === 0) {
    throw new Error("demo light is missing");
  }
  for (const light of fixture.lights.directional) {
    vec3(light.direction, "light.direction");
    rgb(light.diffuse, "light.diffuse");
  }
  rgb(fixture.material?.albedo, "albedo");
  if (!Array.isArray(fixture.meshes) || fixture.meshes.length === 0) throw new Error("demo mesh is missing");
  const ids = new Set();
  for (const mesh of fixture.meshes) {
    if (!mesh || typeof mesh.id !== "string" || mesh.id.length === 0) throw new Error("demo mesh id is missing");
    if (ids.has(mesh.id)) throw new Error("demo mesh id is duplicated");
    ids.add(mesh.id);
    if (mesh.solid !== "box") throw new Error("demo scene solid is not a box");
    finiteNumber(mesh.width, "mesh.width");
    finiteNumber(mesh.height, "mesh.height");
    finiteNumber(mesh.depth, "mesh.depth");
    vec3(mesh.position, "mesh.position");
  }
}

function formatAuthored(value) {
  const sign = value < 0 ? -1 : 1;
  const rounded = Math.floor(Math.abs(value) * 10000 + 0.5) / 10000;
  const out = sign * rounded;
  return Object.is(out, -0) ? "0" : String(out);
}

function sameEdge(left, right) {
  return Math.abs(left - right) <= 1e-4;
}

/** `M x y H x2 V y2 H x Z` cells. Anything else is not pixel text. */
function pixelRects(text) {
  const tokens = pathTokens(text);
  if (tokens.length === 0 || tokens.length % 10 !== 0) return null;
  const rects = [];
  for (let index = 0; index < tokens.length; index += 10) {
    const [move, x, y, horizontal, x2, vertical, y2, back, xBack, close] = tokens.slice(index, index + 10);
    if (move !== "M" || horizontal !== "H" || vertical !== "V" || back !== "H" || close !== "Z" || xBack !== x) {
      return null;
    }
    const left = Number(x);
    const top = Number(y);
    const right = Number(x2);
    const bottom = Number(y2);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    if (right + 1e-4 < left || bottom + 1e-4 < top) return null;
    rects.push({ x: left, y: top, x2: right, y2: bottom });
  }
  return rects.length > 0 ? rects : null;
}

function pixelRunGroups(grids) {
  const count = grids[0].length;
  const joinNext = new Array(count - 1).fill(true);
  for (const rects of grids) {
    for (let index = 0; index < count - 1; index += 1) {
      const current = rects[index];
      const next = rects[index + 1];
      if (!sameEdge(current.y, next.y) || !sameEdge(current.y2, next.y2) || !sameEdge(current.x2, next.x)) {
        joinNext[index] = false;
      }
    }
  }
  const groups = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    if (index === count - 1 || !joinNext[index]) {
      groups.push([start, index]);
      start = index + 1;
    }
  }
  return groups;
}

function emitPixelRuns(rects, groups) {
  return groups
    .map(([start, end]) => {
      const first = rects[start];
      const last = rects[end];
      const x = formatAuthored(first.x);
      const y = formatAuthored(first.y);
      const x2 = formatAuthored(last.x2);
      const y2 = formatAuthored(first.y2);
      return `M ${x} ${y} H ${x2} V ${y2} H ${x} Z`;
    })
    .join(" ");
}

/**
 * Collapse horizontal pixel-text runs. One string is one fill.
 * A run joins only when every string has that same touching row,
 * so an animated span keeps one command list.
 */
function mergePixelTextTracks(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return texts;
  const grids = texts.map((text) => pixelRects(text));
  if (grids.some((grid) => grid === null)) return texts;
  const count = grids[0].length;
  if (grids.some((grid) => grid.length !== count)) return texts;
  const groups = pixelRunGroups(grids);
  if (groups.length === count) return texts;
  return grids.map((rects) => emitPixelRuns(rects, groups));
}

function parameterNumber(preset, name) {
  const found = (preset.parameters ?? []).find((item) => item && item.name === name);
  return found && typeof found.value === "number" && Number.isFinite(found.value) ? found.value : undefined;
}

function firstNumber(fallback, ...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function cloneTrack(track) {
  const next = {
    property: track.property,
    keys: (track.keys ?? []).map((key) => {
      const cloned = { frame: key.frame, value: Array.isArray(key.value) ? key.value.slice() : key.value };
      if (key.easing !== undefined) cloned.easing = key.easing;
      return cloned;
    }),
  };
  if (typeof track.layer === "string" && track.layer.length > 0) next.layer = track.layer;
  if (next.property === "attr.d") {
    const texts = next.keys.map((key) => (typeof key.value === "string" ? key.value : null));
    if (texts.every((text) => text !== null)) {
      const merged = mergePixelTextTracks(texts);
      for (let index = 0; index < next.keys.length; index += 1) next.keys[index].value = merged[index];
    }
  }
  return next;
}

function irTracks(tracks) {
  return tracks.map((track) => ({ property: track.property, keys: track.keys }));
}

function motionTracks(preset) {
  const tracks = preset.motionPreset?.tracks;
  return Array.isArray(tracks) ? tracks.map(cloneTrack) : [];
}

function maxKeyFrame(tracks) {
  let max = 0;
  for (const track of tracks) {
    for (const key of track.keys) {
      if (Number.isInteger(key.frame) && key.frame > max) max = key.frame;
    }
  }
  return max;
}

function isCameraPreset(preset) {
  const id = preset.component?.id;
  return preset.category === "camera" || (typeof id === "string" && id.startsWith("camera."));
}

function shapePath(copied, frame) {
  const shape = copied?.shape;
  if (!shape || typeof shape !== "object") return null;
  if (typeof shape.d === "string" && shape.d.length > 0) return mergePixelTextTracks([shape.d])[0];
  if (typeof shape.width === "number" && typeof shape.height === "number") {
    const x = (frame.width - shape.width) / 2;
    const y = (frame.height - shape.height) / 2;
    return `M ${formatAuthored(x)} ${formatAuthored(y)} H ${formatAuthored(x + shape.width)} V ${formatAuthored(y + shape.height)} H ${formatAuthored(x)} Z`;
  }
  if (typeof shape.radius === "number") {
    const cx = frame.width / 2;
    const cy = frame.height / 2;
    const radius = shape.radius;
    return `M ${formatAuthored(cx - radius)} ${formatAuthored(cy)} A ${formatAuthored(radius)} ${formatAuthored(radius)} 0 1 0 ${formatAuthored(cx + radius)} ${formatAuthored(cy)} A ${formatAuthored(radius)} ${formatAuthored(radius)} 0 1 0 ${formatAuthored(cx - radius)} ${formatAuthored(cy)} Z`;
  }
  return null;
}

function staticTrack(property, value) {
  return { property, keys: [{ frame: 0, value }] };
}

function stageNode(fixture) {
  const d = `M 0 0 H ${formatAuthored(fixture.width)} V ${formatAuthored(fixture.height)} H 0 Z`;
  return {
    id: "s-stage",
    tracks: [staticTrack("attr.d", d), staticTrack("attr.fill", fixture.stage.fill)],
  };
}

function paintTracks(source, fixture, present) {
  const tracks = [];
  const d = shapePath(source, fixture);
  if (d && !present.has("attr.d")) tracks.push(staticTrack("attr.d", d));
  if (typeof source.fill === "string" && source.fill.length > 0 && !present.has("attr.fill")) {
    tracks.push(staticTrack("attr.fill", source.fill));
  }
  if (typeof source.stroke === "string" && source.stroke.length > 0 && !present.has("attr.stroke")) {
    tracks.push(staticTrack("attr.stroke", source.stroke));
  }
  if (
    typeof source.strokeWidth === "number" &&
    Number.isFinite(source.strokeWidth) &&
    !present.has("attr.strokeWidth")
  ) {
    tracks.push(staticTrack("attr.strokeWidth", source.strokeWidth));
  }
  if (typeof source.opacity === "number" && !present.has("attr.opacity")) {
    tracks.push(staticTrack("attr.opacity", source.opacity));
  }
  return tracks;
}

function layerList(copied) {
  const layers = copied?.layers;
  if (!Array.isArray(layers) || layers.length === 0) return null;
  const seen = new Set();
  for (const layer of layers) {
    if (!layer || typeof layer.id !== "string" || layer.id.length === 0) throw new Error("layer id is missing");
    if (seen.has(layer.id)) throw new Error("layer id is duplicated");
    seen.add(layer.id);
  }
  return layers;
}

function trackLayer(track) {
  return typeof track.layer === "string" && track.layer.length > 0 ? track.layer : null;
}

/** Pose tracks stay on the camera or solid. The rest become one node, or one node per layer. */
function artworkPlan(preset, fixture, consumePose) {
  const motion = motionTracks(preset);
  const consumed = consumePose ? motion.filter((track) => CAMERA_POSE.has(track.property)) : [];
  const rest = consumePose ? motion.filter((track) => !CAMERA_POSE.has(track.property)) : motion;
  const copied = preset.component?.copied ?? {};
  const layers = layerList(copied);
  if (!layers) {
    const present = new Set(rest.map((track) => track.property));
    const tracks = consumePose ? [] : paintTracks(copied, fixture, present);
    tracks.push(...rest);
    return { consumed, parts: [{ tracks: irTracks(tracks) }] };
  }
  const ids = new Set(layers.map((layer) => layer.id));
  for (const track of rest) {
    const named = trackLayer(track);
    if (named !== null && !ids.has(named)) throw new Error("layer is not in the list");
  }
  const parts = layers.map((layer, index) => {
    const own = rest.filter((track) => {
      const named = trackLayer(track);
      return named === null ? index === 0 : named === layer.id;
    });
    const present = new Set(own.map((track) => track.property));
    const source = {
      shape: layer.shape,
      fill: layer.fill,
      stroke: layer.stroke,
      opacity: layer.opacity,
      strokeWidth: copied.strokeWidth,
    };
    const tracks = consumePose ? [] : paintTracks(source, fixture, present);
    tracks.push(...own);
    return { layerId: layer.id, tracks: irTracks(tracks) };
  });
  return { consumed, parts };
}

function layerSelectorId(preset, used, layerId) {
  const base = `s-${preset.id}-${layerId}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function appendArtwork(nodes, preset, used, parts) {
  let inkNodeId = null;
  parts.forEach((part, index) => {
    const id = index === 0 ? selectorId(preset, used) : layerSelectorId(preset, used, part.layerId);
    used.add(id);
    if (part.tracks.length === 0) return;
    nodes.push({ id, tracks: part.tracks });
    if (index === 0) inkNodeId = id;
  });
  return inkNodeId;
}

function xmlAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function groupOpens(line, id) {
  const head = `  <g id="${id}"`;
  if (!line.startsWith(head)) return false;
  const next = line.charAt(head.length);
  return next === "" || next === " " || next === ">" || next === "/";
}

/** The ink path is the last child of the body wrapper, so the wrapper transform covers both paths. */
function insertInkPath(svg, nodeId, ink) {
  const lines = svg.split("\n");
  const start = lines.findIndex((line) => groupOpens(line, nodeId));
  if (start < 0) throw new Error("ink wrapper is missing");
  const path = `    <path id="${xmlAttr(nodeId)}-ink" d="${xmlAttr(ink.d)}" fill="${xmlAttr(ink.fill)}" stroke="none"/>`;
  if (lines[start].endsWith("/>")) {
    lines[start] = `${lines[start].slice(0, -2)}>`;
    lines.splice(start + 1, 0, path, "  </g>");
    return lines.join("\n");
  }
  let end = start + 1;
  while (end < lines.length && lines[end] !== "  </g>") end += 1;
  if (end >= lines.length) throw new Error("ink wrapper is missing");
  lines.splice(end, 0, path);
  return lines.join("\n");
}

function withInk(svg, preset, host) {
  const ink = preset.component?.copied?.ink;
  if (!host || !ink || typeof ink.d !== "string" || ink.d.length === 0 || typeof ink.fill !== "string" || ink.fill.length === 0) {
    return svg;
  }
  return insertInkPath(svg, host, ink);
}

function inkPathData(svg) {
  const found = [];
  const re = /<path\b([^>]*)\/?>/g;
  let match;
  while ((match = re.exec(svg))) {
    const attrs = match[1];
    const id = attrs.match(/\bid="([^"]*)"/)?.[1] ?? "";
    if (!id.endsWith("-ink")) continue;
    const d = attrs.match(/\bd="([^"]*)"/)?.[1];
    if (d) found.push(d);
  }
  return found;
}

/** A same-direction subpath that overlaps a filled subpath leaves the raster unchanged. */
async function inkOverlapProblem(svg) {
  const paths = inkPathData(svg);
  if (paths.length === 0) return "";
  const size = svgPixelSize(svg);
  const browser = await openBrowser();
  for (const d of paths) {
    const problem = await browser.inkSubpathProblem(d, size.width, size.height);
    if (problem) return problem;
  }
  return "";
}

function selectorId(preset, used) {
  const base = `s-${preset.id}`;
  if (!used.has(base)) return base;
  return `s-${preset.id}-preset`;
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul3(a, k) {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function quaternionFromEulerXYZ(euler) {
  const halfX = euler.x * 0.5;
  const halfY = euler.y * 0.5;
  const halfZ = euler.z * 0.5;
  const cx = Math.cos(halfX);
  const sx = Math.sin(halfX);
  const cy = Math.cos(halfY);
  const sy = Math.sin(halfY);
  const cz = Math.cos(halfZ);
  const sz = Math.sin(halfZ);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

function rotateByQuaternion(quaternion, vector) {
  const { x: qx, y: qy, z: qz, w: qw } = quaternion;
  const tx = 2 * (qy * vector.z - qz * vector.y);
  const ty = 2 * (qz * vector.x - qx * vector.z);
  const tz = 2 * (qx * vector.y - qy * vector.x);
  return {
    x: vector.x + qw * tx + (qy * tz - qz * ty),
    y: vector.y + qw * ty + (qz * tx - qx * tz),
    z: vector.z + qw * tz + (qx * ty - qy * tx),
  };
}

function cameraBasis(euler) {
  const quaternion = quaternionFromEulerXYZ(euler);
  return {
    right: rotateByQuaternion(quaternion, { x: 1, y: 0, z: 0 }),
    up: rotateByQuaternion(quaternion, { x: 0, y: 1, z: 0 }),
    forward: rotateByQuaternion(quaternion, { x: 0, y: 0, z: -1 }),
  };
}

function restTranslate(preset, property, fallback) {
  const track = motionTracks(preset).find((item) => item && item.property === property);
  const key = earliestKey(track);
  return key && typeof key.value === "number" && Number.isFinite(key.value) ? key.value : fallback;
}

function parameterText(preset, name) {
  const found = (preset.parameters ?? []).find((item) => item && item.name === name);
  return found && typeof found.value === "string" ? found.value : undefined;
}

function namedMesh(fixture, id) {
  return (fixture.meshes ?? []).find((mesh) => mesh && mesh.id === id) ?? null;
}

function meshPoint(mesh) {
  return {
    x: mesh?.position?.x ?? 0,
    y: mesh?.position?.y ?? 0,
    z: mesh?.position?.z ?? 0,
  };
}

function boxCorners(mesh) {
  const center = meshPoint(mesh);
  const hx = (mesh.width ?? 0) / 2;
  const hy = (mesh.height ?? 0) / 2;
  const hz = (mesh.depth ?? 0) / 2;
  const corners = [];
  for (const x of [-hx, hx]) {
    for (const y of [-hy, hy]) {
      for (const z of [-hz, hz]) corners.push({ x: center.x + x, y: center.y + y, z: center.z + z });
    }
  }
  return corners;
}

function projectCorner(eye, basis, fixture, point, fovY = fixture.camera.fovY) {
  const rel = sub3(point, eye);
  const depth = dot3(rel, basis.forward);
  if (!(depth > 1e-6)) return null;
  const focal = 1 / Math.tan(fovY / 2);
  const aspect = fixture.width / fixture.height;
  const ndcX = ((focal / aspect) * dot3(rel, basis.right)) / depth;
  const ndcY = (focal * dot3(rel, basis.up)) / depth;
  return {
    x: (ndcX * 0.5 + 0.5) * fixture.width,
    y: (ndcY * -0.5 + 0.5) * fixture.height,
  };
}

function subjectBox(eye, basis, fixture, fovY = fixture.camera.fovY) {
  const mesh = namedMesh(fixture, "subject");
  if (!mesh) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of boxCorners(mesh)) {
    const pixel = projectCorner(eye, basis, fixture, corner, fovY);
    if (!pixel) continue;
    if (pixel.x < minX) minX = pixel.x;
    if (pixel.y < minY) minY = pixel.y;
    if (pixel.x > maxX) maxX = pixel.x;
    if (pixel.y > maxY) maxY = pixel.y;
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function subjectWidth(eye, basis, fixture, fovY = fixture.camera.fovY) {
  return subjectBox(eye, basis, fixture, fovY)?.w ?? 0;
}

/** `scale` matches the track ratio on the committed zoom, and changes the picture when it does not. */
function declaredScaleFactor(preset) {
  const declared = parameterNumber(preset, "scale");
  if (!(declared > 0)) return 1;
  const track = motionTracks(preset).find((item) => item && item.property === "transform.scaleX");
  const keys = orderedNumericKeys(track);
  if (keys.length < 2 || !(keys[0].value > 0)) return declared;
  const ratio = keys[keys.length - 1].value / keys[0].value;
  if (!(ratio > 0) || Math.abs(ratio - declared) <= 1e-6) return 1;
  return declared / ratio;
}

function viewScale(preset) {
  const view = parameterText(preset, "view");
  if (view === "near") return 1.12;
  if (view === "far") return 0.72;
  if (view === "wide") return 0.55;
  return 1;
}

function hashUnit(seed) {
  let n = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

/** Pixel offset from `seed` and `strength`. Absent parameters leave the eye put. */
function seedShiftPixels(preset) {
  const seed = parameterNumber(preset, "seed");
  const strength = parameterNumber(preset, "strength");
  if (seed === undefined && strength === undefined) return null;
  const amp = strength ?? 0;
  if (!(amp > 0)) return null;
  const angle = hashUnit(seed ?? 0) * Math.PI * 2;
  return { x: Math.cos(angle) * amp, y: Math.sin(angle) * amp };
}

function shiftEyeByPixels(eye, basis, fixture, fovY, pixels) {
  if (!pixels || (pixels.x === 0 && pixels.y === 0)) return eye;
  const depth = dot3(sub3(meshPoint(namedMesh(fixture, "subject")), eye), basis.forward);
  if (!(depth > 1e-6)) return eye;
  const focal = 1 / Math.tan(fovY / 2);
  const aspect = fixture.width / fixture.height;
  const worldX = ((pixels.x / fixture.width) * 2 * depth * aspect) / focal;
  const worldY = ((-pixels.y / fixture.height) * 2 * depth) / focal;
  return add3(eye, add3(mul3(basis.right, worldX), mul3(basis.up, worldY)));
}

/** Narrower field of view enlarges the subject. The eye stays put. */
function fovForSubjectWidth(eye, basis, fixture, targetWidth) {
  const base = fixture.camera.fovY;
  if (!(targetWidth > 0)) return base;
  let low = 0.02;
  let high = Math.PI - 0.02;
  let best = base;
  let bestWidth = subjectWidth(eye, basis, fixture, base);
  for (let step = 0; step < 40; step += 1) {
    const fov = (low + high) / 2;
    const width = subjectWidth(eye, basis, fixture, fov);
    if (!(width > 0)) {
      high = fov;
      continue;
    }
    if (Math.abs(width - targetWidth) < Math.abs(bestWidth - targetWidth)) {
      best = fov;
      bestWidth = width;
    }
    if (width < targetWidth) high = fov;
    else low = fov;
  }
  const wider = subjectWidth(eye, basis, fixture, low);
  if (bestWidth < targetWidth && wider >= bestWidth) return low;
  return best;
}

/** Widen the field until the subject sits inside the declared margin. A fit that already holds stays. */
function fovForMargin(eye, basis, fixture, fovY, margin) {
  if (!(margin > 0)) return fovY;
  const inset = Math.min(margin, Math.min(fixture.width, fixture.height) / 2 - 1);
  if (!(inset > 0)) return fovY;
  const fits = (fov) => {
    const box = subjectBox(eye, basis, fixture, fov);
    if (!box) return false;
    return box.minX >= inset - 0.5 && box.minY >= inset - 0.5 && box.maxX <= fixture.width - inset + 0.5 && box.maxY <= fixture.height - inset + 0.5;
  };
  if (fits(fovY)) return fovY;
  let low = fovY;
  let high = Math.PI - 0.02;
  if (!fits(high)) return high;
  for (let step = 0; step < 24; step += 1) {
    const fov = (low + high) / 2;
    if (fits(fov)) high = fov;
    else low = fov;
  }
  return high;
}

/**
 * Perspective pose for one frame.
 * Scale changes fovY until the subject width matches that scale. The eye
 * stays on the rest pose. A translate without a depth ratio is a view-plane
 * shift of angle times the subject depth. A depth ratio strafes by the
 * translate itself. Dividing world Z by scale is not the zoom.
 * [[sot:svgif/preset-registry]] [[sot:svgif/determinism]]
 */
function cameraPose(preset, base, values, fixture) {
  const distance = parameterNumber(preset, "distance") ?? base.z;
  const trackScale = firstNumber(1, values["transform.scaleX"], values["transform.scaleY"]);
  const scale = trackScale * declaredScaleFactor(preset) * viewScale(preset);
  const latitude = parameterNumber(preset, "latitude") ?? 0;
  const azimuth = firstNumber(0, values["transform.rotate"], parameterNumber(preset, "azimuth"));
  const restX = restTranslate(preset, "transform.translateX", firstNumber(base.x, parameterNumber(preset, "x")));
  const restY = restTranslate(preset, "transform.translateY", firstNumber(base.y, parameterNumber(preset, "y")));
  const x = firstNumber(restX, values["transform.translateX"]);
  const y = firstNumber(restY, values["transform.translateY"]);
  const eulerXYZ = { x: latitude, y: azimuth, z: 0 };
  const basis = cameraBasis(eulerXYZ);
  const depthRatio = parameterNumber(preset, "depthRatio");
  const restEye = { x: restX, y: restY, z: distance };
  const dx = x - restX;
  const dy = y - restY;
  let eye = restEye;
  if (depthRatio !== undefined) {
    eye = add3(restEye, add3(mul3(basis.right, dx), mul3(basis.up, dy)));
  } else if (dx !== 0 || dy !== 0) {
    const depth = dot3(sub3(meshPoint(namedMesh(fixture, "subject")), restEye), basis.forward);
    if (depth > 1e-6) {
      eye = add3(restEye, add3(mul3(basis.right, dx * depth), mul3(basis.up, dy * depth)));
    }
  }
  const baseFov = fixture.camera.fovY;
  const baseWidth = subjectWidth(eye, basis, fixture, baseFov);
  let fovY = baseFov;
  if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 1e-6 && baseWidth > 0) {
    fovY = fovForSubjectWidth(eye, basis, fixture, baseWidth * scale);
  }
  eye = shiftEyeByPixels(eye, basis, fixture, fovY, seedShiftPixels(preset));
  fovY = fovForMargin(eye, basis, fixture, fovY, parameterNumber(preset, "margin") ?? 0);
  return { position: eye, eulerXYZ, fovY };
}

/** `start` and `endFrame` remap the pose across the timeline. Absent, the frame is unchanged. */
function poseSampleFrame(preset, frame, duration) {
  const start = parameterNumber(preset, "start");
  const endFrame = parameterNumber(preset, "endFrame");
  if (start === undefined && endFrame === undefined) return frame;
  const from = start ?? 0;
  const to = endFrame ?? Math.max(0, duration - 1);
  if (duration <= 1) return from;
  return from + ((to - from) * frame) / (duration - 1);
}

function sampledCameraPose(preset, fixture, frame, duration, fps, sample) {
  const tracks = irTracks(motionTracks(preset).filter((track) => CAMERA_POSE.has(track.property)));
  const sampled = poseSampleFrame(preset, frame, duration);
  const span = Math.max(duration, Math.floor(Math.abs(sampled)) + 1);
  return cameraPose(preset, fixture.camera.position, samplePose(sample, "camera", tracks, sampled, span, fps), fixture);
}

function meshPose(base, values) {
  const scaleX = firstNumber(1, values["transform.scaleX"]);
  const scaleY = firstNumber(scaleX, values["transform.scaleY"]);
  return {
    position: {
      x: base.x + firstNumber(0, values["transform.translateX"]),
      y: base.y + firstNumber(0, values["transform.translateY"]),
      z: base.z,
    },
    eulerXYZ: { x: 0, y: 0, z: firstNumber(0, values["transform.rotate"]) },
    scale: { x: scaleX, y: scaleY, z: scaleX },
  };
}

function placeAtDepth(point, eye, forward, depth) {
  const current = dot3(sub3(point, eye), forward);
  return add3(point, mul3(forward, depth - current));
}

/**
 * Far travel / near travel follows depthRatio. The slab is the near mesh and
 * the box is the far mesh. The slab's view depth is the camera distance plus
 * the slab thickness plus the box thickness times the ratio. The box is
 * farther by 1/ratio. Both stay on their view rays.
 * [[sot:svgif/preset-registry]] [[sot:svgif/determinism]]
 */
function layoutMeshes(preset, fixture, restPose) {
  const ratio = parameterNumber(preset, "depthRatio");
  if (ratio === undefined || !(ratio > 0) || ratio >= 1) return fixture.meshes;
  const basis = cameraBasis(restPose.eulerXYZ);
  const eye = restPose.position;
  const slab = namedMesh(fixture, "ground");
  const box = namedMesh(fixture, "subject");
  if (!slab || !box) return fixture.meshes;
  const distance = parameterNumber(preset, "distance") ?? eye.z;
  const nearDepth = distance + slab.depth + box.depth * ratio;
  if (!(nearDepth > 1e-6)) return fixture.meshes;
  const farDepth = nearDepth / ratio;
  return fixture.meshes.map((mesh) => {
    if (mesh.id === slab.id) {
      return { ...mesh, position: placeAtDepth(meshPoint(mesh), eye, basis.forward, nearDepth) };
    }
    if (mesh.id === box.id) {
      return { ...mesh, position: placeAtDepth(meshPoint(mesh), eye, basis.forward, farDepth) };
    }
    return mesh;
  });
}

/**
 * One key list for the bake. A repeated frame is kept only when the later key
 * is a hold. The same frame and easing from a second axis is one key.
 * A key on or past the duration is omitted so the bake stays per frame.
 */
function poseBakeKeys(tracks, duration) {
  const entries = [];
  for (const track of tracks) {
    for (const key of track?.keys ?? []) {
      if (!key || !Number.isInteger(key.frame)) continue;
      entries.push({
        frame: key.frame,
        easing: typeof key.easing === "string" ? key.easing : undefined,
        order: entries.length,
      });
    }
  }
  entries.sort((left, right) => left.frame - right.frame || left.order - right.order);
  const keys = [];
  for (const entry of entries) {
    const previous = keys[keys.length - 1];
    if (previous && previous.frame === entry.frame && (previous.easing ?? "") === (entry.easing ?? "")) continue;
    if (previous && previous.frame === entry.frame && entry.easing !== "hold") continue;
    const next = { frame: entry.frame };
    if (entry.easing !== undefined) next.easing = entry.easing;
    keys.push(next);
  }
  if (keys.length === 0 || keys.some((key) => key.frame < 0 || key.frame >= duration)) return undefined;
  return keys;
}

/** The value on this bake key. A later key on the same frame does not leak backward. */
function valuesForBakeKey(tracks, bakeKeys, index) {
  const bakeKey = bakeKeys[index];
  const values = {};
  for (const track of tracks) {
    const keys = track?.keys ?? [];
    const same = keys.filter((key) => key.frame === bakeKey.frame && (key.easing ?? undefined) === (bakeKey.easing ?? undefined));
    let chosen = same[0];
    if (!chosen) {
      const earlier = keys.filter((key) => Number.isInteger(key.frame) && key.frame <= bakeKey.frame);
      chosen = earlier[earlier.length - 1];
    }
    if (chosen && chosen.value !== undefined) values[track.property] = chosen.value;
  }
  return values;
}

function poseMotion(nodeId, tracks, duration, fps, poseAt, keys) {
  const motion = {
    nodeId,
    at(frame) {
      return poseAt(frame, tracks, duration, fps);
    },
  };
  if (keys && keys.length > 0) motion.keys = keys;
  return motion;
}

function samplePose(sample, nodeId, tracks, frame, duration, fps) {
  const ir = {
    fps,
    width: 1,
    height: 1,
    durationInFrames: duration,
    nodes: [{ id: nodeId, tracks }],
  };
  return sample(ir, frame)[nodeId] ?? {};
}

function boxFrom(scene, mesh) {
  return scene.meshNode(scene.boxGeometry(mesh.width, mesh.height, mesh.depth), {
    id: mesh.id,
    transform: { position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z } },
  });
}

function buildRoot(scene, fixture, cameraAtFrame0, extraMesh, meshes = fixture.meshes) {
  const camera = fixture.camera;
  const cameraNode = scene.perspectiveCameraNode(
    {
      fovY: cameraAtFrame0.fovY ?? camera.fovY,
      aspect: fixture.width / fixture.height,
      near: camera.near,
      far: camera.far,
    },
    {
      id: camera.id,
      transform: {
        position: cameraAtFrame0.position,
        eulerXYZ: cameraAtFrame0.eulerXYZ,
      },
    },
  );
  const children = [cameraNode];
  for (const mesh of meshes) children.push(boxFrom(scene, mesh));
  if (extraMesh) children.push(boxFrom(scene, extraMesh));
  return { root: scene.groupNode({ children }), camera: cameraNode };
}

function presetSolid(preset) {
  if (preset.component?.kind !== "primitive-3d") return null;
  const solid = preset.component.copied?.primitive3d;
  if (!solid || solid.solid !== "box") throw new Error("preset solid is not a box");
  return {
    id: "preset-solid",
    solid: "box",
    width: firstNumber(1, solid.width),
    height: firstNumber(1, solid.height),
    depth: firstNumber(1, solid.depth),
    position: { x: 0, y: 0, z: 0 },
  };
}

/**
 * A key on the last frame is the cycle boundary.
 * A loop ends on that key. A wrap that repeats key 0 may sit at frame N.
 * N is the duration. It is not maxKey + 1. Frame N is not rendered.
 * Any other timeline still includes its last key.
 */
function timelineDuration(fixture, tracks, preset) {
  const last = maxKeyFrame(tracks);
  if (preset && timelineLoops(preset) && last > 0) return last;
  return Math.max(fixture.durationInFrames, last + 1);
}

/** Boolean true on a parameter named loop. A category does not decide this. */
function timelineLoops(preset) {
  const parameters = preset?.parameters;
  if (!Array.isArray(parameters)) return false;
  return parameters.some((parameter) => parameter?.name === "loop" && parameter?.value === true);
}

let motionClassCache;

function loadMotionClass() {
  if (!motionClassCache) {
    const document = readDocument(MOTION_CLASS);
    for (const key of ["ambient", "beat", "fall", "glyphSwap", "fullFrameTransitions", "keepSubjectCategories"]) {
      if (!Array.isArray(document?.[key])) throw new Error("motion class fixture is missing");
    }
    if (!document.sceneOff || !Array.isArray(document.sceneOff.categories) || !Array.isArray(document.sceneOff.ids)) {
      throw new Error("motion class fixture is missing");
    }
    motionClassCache = document;
  }
  return motionClassCache;
}

function componentId(preset) {
  return typeof preset?.component?.id === "string" ? preset.component.id : "";
}

function hasMark(preset, mark) {
  const list = loadMotionClass()[mark];
  return Array.isArray(list) && list.includes(componentId(preset));
}

function sceneOffMark(preset) {
  const motion = loadMotionClass();
  if (motion.sceneOff.categories.includes(preset?.category)) return true;
  const id = componentId(preset);
  return motion.sceneOff.ids.includes(id) || motion.fullFrameTransitions.includes(id);
}

function keepSubject(preset) {
  return loadMotionClass().keepSubjectCategories.includes(preset?.category);
}

function sceneValue(preset) {
  const parameters = preset?.parameters;
  if (!Array.isArray(parameters)) return undefined;
  const found = parameters.find((parameter) => parameter?.name === "scene");
  return found ? found.value : undefined;
}

/** Boolean false omits the subject. A marked subject preset defaults to that. */
function sceneOmitted(preset) {
  const value = sceneValue(preset);
  if (value === false) return true;
  if (value !== undefined) return false;
  return sceneOffMark(preset);
}

function orderedNumericKeys(track) {
  const keys = track?.keys;
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((key) => key && Number.isInteger(key.frame) && typeof key.value === "number" && Number.isFinite(key.value))
    .sort((left, right) => left.frame - right.frame);
}

function numericSpan(track) {
  const ordered = orderedNumericKeys(track);
  if (ordered.length < 2) return null;
  const first = ordered[0].value;
  let excursion = 0;
  for (const key of ordered) excursion = Math.max(excursion, Math.abs(key.value - first));
  if (excursion === 0) return null;
  return { ordered, first, last: ordered[ordered.length - 1].value, excursion };
}

function isOpacityFade(track) {
  const property = typeof track?.property === "string" ? track.property : "";
  return property === "attr.opacity" || property.endsWith("opacity");
}

function pathExtent(value) {
  if (typeof value !== "string") return null;
  const nums = value.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < nums.length; index += 2) {
    const x = Number(nums[index]);
    const y = Number(nums[index + 1]);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!(maxX > minX) && !(maxY > minY)) return null;
  return { width: maxX - minX, height: maxY - minY };
}

function geometrySpan(track) {
  const keys = [...(track.keys ?? [])]
    .filter((key) => key && typeof key.value === "string")
    .sort((left, right) => left.frame - right.frame);
  if (keys.length < 2) return null;
  const firstBox = pathExtent(keys[0].value);
  const lastBox = pathExtent(keys[keys.length - 1].value);
  if (!firstBox || !lastBox) return null;
  const widthDelta = Math.abs(lastBox.width - firstBox.width);
  const heightDelta = Math.abs(lastBox.height - firstBox.height);
  const axis = widthDelta >= heightDelta ? "width" : "height";
  const excursion = Math.max(widthDelta, heightDelta);
  if (!(excursion > 0)) return null;
  return { ordered: keys, first: firstBox[axis], last: lastBox[axis], excursion, axis };
}

function trackSpan(track) {
  if (track?.property === "attr.d" || track?.property === "clip" || track?.property === "mask") {
    const span = geometrySpan(track);
    return span;
  }
  const span = numericSpan(track);
  return span ? { ...span, axis: "" } : null;
}

function opacityRises(span) {
  return span.last > span.first;
}

/** The first step still holds the opening value, so the mid frame has not left it. */
function opacityHoldsFirstStep(track) {
  const ordered = orderedNumericKeys(track);
  return ordered.length >= 2 && ordered[1].value === ordered[0].value;
}

/** The largest visible change. An opacity fade loses to any other moving track. */
function mainSpan(preset) {
  const tracks = motionTracks(preset);
  const visible = tracks.filter((track) => !isOpacityFade(track));
  const pool = visible.some((track) => trackSpan(track)) ? visible : tracks;
  let best = null;
  for (const track of pool) {
    const span = trackSpan(track);
    if (!span) continue;
    if (!best || span.excursion > best.span.excursion) {
      best = { track, span };
      continue;
    }
    if (span.excursion !== best.span.excursion || !isOpacityFade(track) || !isOpacityFade(best.track)) continue;
    const incoming = opacityRises(span) && !opacityHoldsFirstStep(track);
    const incumbent = opacityRises(best.span) && !opacityHoldsFirstStep(best.track);
    if (incoming && !incumbent) best = { track, span };
  }
  return best;
}

async function trackValueAt(property, keys, frame, duration, fps) {
  const { sample } = (await loadEngine()).ir;
  const ir = {
    fps,
    width: 16,
    height: 16,
    durationInFrames: Math.max(1, duration),
    nodes: [{ id: "n", tracks: [{ property, keys }] }],
  };
  return sample(ir, frame).n?.[property];
}

async function bandProblem(preset, fixture) {
  if (hasMark(preset, "beat")) return "";
  const main = mainSpan(preset);
  if (!main) return "";
  const duration = timelineDuration(fixture, motionTracks(preset), preset);
  const mid = sampleFrameIndexes(duration).mid;
  const sampled = await trackValueAt(main.track.property, main.track.keys, mid, duration, fixture.fps);
  const value = main.span.axis ? pathExtent(sampled)?.[main.span.axis] : sampled;
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const progress = main.span.first !== main.span.last
    ? (value - main.span.first) / (main.span.last - main.span.first)
    : Math.abs(value - main.span.first) / main.span.excursion;
  if (hasMark(preset, "fall")) {
    return progress > 0.75 ? "fall is past 75 percent at the mid frame" : "";
  }
  if (progress < 0.25 || progress > 0.75) return "main track is outside the 25 to 75 percent band at the mid frame";
  return "";
}

async function revealProblem(preset, fixture) {
  const tracks = motionTracks(preset).filter((track) => track?.property === "clip" || track?.property === "mask");
  if (tracks.length === 0) return "";
  const duration = timelineDuration(fixture, motionTracks(preset), preset);
  const fps = fixture.fps;
  const browser = await openBrowser();
  for (const track of tracks) {
    if (!Array.isArray(track.keys) || track.keys.length < 2) continue;
    const start = await trackValueAt(track.property, track.keys, 0, duration, fps);
    const end = await trackValueAt(track.property, track.keys, duration - 1, duration, fps);
    if (start === undefined || end === undefined) continue;
    const seen = new Map();
    const cover = async (value) => {
      const text = String(value);
      if (seen.has(text)) return seen.get(text);
      const signature = await browser.pathCoverage(text, fixture.width, fixture.height);
      seen.set(text, signature);
      return signature;
    };
    const startCover = await cover(start);
    const endCover = await cover(end);
    if (String(start) === String(end) && startCover === endCover) continue;
    let firstMatch = duration - 1;
    for (let frame = 0; frame < duration; frame += 1) {
      const value = await trackValueAt(track.property, track.keys, frame, duration, fps);
      if ((await cover(value)) === endCover) {
        firstMatch = frame;
        break;
      }
    }
    if (firstMatch / duration < 0.75) return "reveal coverage matches the end path before 75 percent of the duration";
  }
  return "";
}

function angleDelta(left, right) {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

function chordShortening(degrees) {
  const theta = (degrees * Math.PI) / 180;
  if (theta < 1e-6) return 0;
  return 1 - Math.sin(theta / 2) / (theta / 2);
}

function limbProblem(preset) {
  for (const track of motionTracks(preset)) {
    if (track?.property !== "transform.rotate") continue;
    const keys = orderedNumericKeys(track);
    for (let index = 1; index < keys.length; index += 1) {
      const delta = angleDelta(keys[index - 1].value, keys[index].value);
      if (delta > 30) return "rotate keys jump more than 30 degrees";
      if (chordShortening(delta) > 0.034) return "the chord of a rotate step is more than 3.4 percent shorter than the arc";
    }
  }
  for (const track of motionTracks(preset)) {
    if (track?.property !== "attr.d" || !Array.isArray(track.keys)) continue;
    const keys = [...track.keys].filter((key) => key && typeof key.value === "string").sort((left, right) => left.frame - right.frame);
    for (let index = 1; index < keys.length; index += 1) {
      const left = pathLinePoints(keys[index - 1].value);
      const right = pathLinePoints(keys[index].value);
      if (!left || !right || left.length < 2 || left.length !== right.length) continue;
      for (let point = 1; point < left.length; point += 1) {
        const radius = Math.hypot(left[point].x - left[0].x, left[point].y - left[0].y);
        const next = Math.hypot(right[point].x - right[0].x, right[point].y - right[0].y);
        if (radius < 1 || next < 1 || Math.abs(radius - next) / Math.max(radius, next) > 0.05) continue;
        const start = Math.atan2(left[point].y - left[0].y, left[point].x - left[0].x);
        const end = Math.atan2(right[point].y - right[0].y, right[point].x - right[0].x);
        let degrees = (Math.abs(end - start) * 180) / Math.PI;
        if (degrees > 180) degrees = 360 - degrees;
        if (degrees > 30) return "a limb drawn by translating its vertices along the arc";
      }
    }
  }
  return "";
}

function tempoProblem(preset, fixture) {
  if (!timelineLoops(preset)) return "";
  const bpm = parameterNumber(preset, "bpm") ?? parameterNumber(preset, "tempo");
  if (bpm === undefined) return "";
  const duration = timelineDuration(fixture, motionTracks(preset), preset);
  const beats = (bpm / 60) * (duration / fixture.fps);
  if (Math.abs(beats - Math.round(beats)) > 1e-6) return "cycle length is not a whole number of beats";
  return "";
}

function ambientLoopProblem(preset) {
  if (!hasMark(preset, "ambient") || timelineLoops(preset)) return "";
  return "ambient preset has no loop parameter";
}

function ambientKeysDiffer(preset) {
  if (!hasMark(preset, "ambient")) return false;
  const main = mainSpan(preset);
  return Boolean(main && main.span.first !== main.span.last);
}

function wrapSample(preset) {
  if (!timelineLoops(preset)) return false;
  if (hasMark(preset, "beat") && !hasMark(preset, "ambient")) return false;
  return true;
}

function orderedFrameKeys(track) {
  const keys = track?.keys;
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((key) => key && Number.isInteger(key.frame))
    .sort((left, right) => left.frame - right.frame);
}

function valueAtFrameZero(keys) {
  const at = keys.filter((key) => key.frame <= 0).pop();
  return (at ?? keys[0])?.value;
}

function pathBox(value) {
  if (typeof value !== "string") return null;
  const tokens = pathTokens(value);
  let index = 0;
  let command = "";
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let saw = false;
  const mark = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    saw = true;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") {
      command = "";
      continue;
    }
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[upper];
    if (!arity || index + arity > tokens.length) break;
    const args = tokens.slice(index, index + arity).map(Number);
    index += arity;
    const take = (x, y) => {
      const point = relative ? { x: cx + x, y: cy + y } : { x, y };
      cx = point.x;
      cy = point.y;
      mark(point.x, point.y);
      return point;
    };
    if (upper === "H") {
      cx = relative ? cx + args[0] : args[0];
      mark(cx, cy);
    } else if (upper === "V") {
      cy = relative ? cy + args[0] : args[0];
      mark(cx, cy);
    } else if (upper === "A") {
      const rx = Math.abs(args[0]);
      const ry = Math.abs(args[1]);
      mark(cx - rx, cy - ry);
      mark(cx + rx, cy + ry);
      const end = take(args[5], args[6]);
      mark(end.x - rx, end.y - ry);
      mark(end.x + rx, end.y + ry);
    } else if (upper === "C") {
      take(args[0], args[1]);
      take(args[2], args[3]);
      take(args[4], args[5]);
    } else if (upper === "S" || upper === "Q") {
      take(args[0], args[1]);
      take(args[2], args[3]);
    } else {
      take(args[0], args[1]);
      if (upper === "M") command = relative ? "l" : "L";
    }
  }
  if (!saw) return null;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function boxDeviation(next, base) {
  return Math.max(
    Math.abs(next.minX - base.minX),
    Math.abs(next.minY - base.minY),
    Math.abs(next.width - base.width),
    Math.abs(next.height - base.height),
  );
}

function matrixNumbers(value) {
  if (!Array.isArray(value) || value.length !== 6) return null;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return value;
}

function applyMatrix(box, matrix) {
  const [a, b, c, d, e, f] = matrix;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const corners = [
    [box.minX, box.minY],
    [box.minX + box.width, box.minY],
    [box.minX, box.minY + box.height],
    [box.minX + box.width, box.minY + box.height],
  ];
  for (const [x, y] of corners) {
    const nextX = a * x + c * y + e;
    const nextY = b * x + d * y + f;
    if (nextX < minX) minX = nextX;
    if (nextY < minY) minY = nextY;
    if (nextX > maxX) maxX = nextX;
    if (nextY > maxY) maxY = nextY;
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function elementPath(preset, track) {
  const copied = preset?.component?.copied ?? {};
  const layerName = typeof track?.layer === "string" ? track.layer : "";
  const layers = Array.isArray(copied.layers) ? copied.layers : [];
  if (layerName) {
    const layer = layers.find((item) => item?.id === layerName);
    if (typeof layer?.shape?.d === "string" && layer.shape.d.length > 0) return layer.shape.d;
  }
  if (typeof copied.shape?.d === "string" && copied.shape.d.length > 0) return copied.shape.d;
  for (const item of motionTracks(preset)) {
    if (item?.property !== "attr.d") continue;
    if (layerName && item.layer !== layerName) continue;
    const text = valueAtFrameZero(orderedFrameKeys(item));
    if (typeof text === "string" && text.length > 0) return text;
  }
  return "";
}

function frameZeroBox(preset, track) {
  const text = elementPath(preset, track);
  return pathBox(text) ?? { minX: 0, minY: 0, width: 1, height: 1 };
}

function considerPeak(best, frame, delta) {
  if (!Number.isFinite(delta)) return best;
  if (!best || delta > best.delta || (delta === best.delta && frame < best.frame)) {
    return { delta, frame };
  }
  return best;
}

function peakFrame(preset, duration) {
  let best = null;
  for (const track of motionTracks(preset)) {
    const numeric = orderedNumericKeys(track);
    if (numeric.length > 0) {
      const first = numeric[0].value;
      for (const key of numeric) best = considerPeak(best, key.frame, Math.abs(key.value - first));
    }
    if (track?.property === "attr.d" || track?.property === "clip" || track?.property === "mask") {
      const keys = orderedFrameKeys(track).filter((key) => typeof key.value === "string");
      const base = pathBox(valueAtFrameZero(keys));
      if (base) {
        for (const key of keys) {
          const box = pathBox(key.value);
          if (box) best = considerPeak(best, key.frame, boxDeviation(box, base));
        }
      }
    }
    if (track?.property === "transform.matrix") {
      const keys = orderedFrameKeys(track);
      const matrices = keys.map((key) => ({ frame: key.frame, matrix: matrixNumbers(key.value) })).filter((key) => key.matrix);
      if (matrices.length > 0) {
        const baseMatrix = matrixNumbers(valueAtFrameZero(keys)) ?? [1, 0, 0, 1, 0, 0];
        const source = frameZeroBox(preset, track);
        const base = applyMatrix(source, baseMatrix);
        for (const key of matrices) {
          best = considerPeak(best, key.frame, boxDeviation(applyMatrix(source, key.matrix), base));
        }
      }
    }
  }
  const frame = best ? best.frame : 0;
  const limit = Number.isInteger(duration) && duration > 0 ? duration - 1 : 0;
  return Math.max(0, Math.min(limit, frame));
}

function containsFixtureFace(svg) {
  return /subject-f|ground-f/.test(svg);
}

function sceneFaceProblem(preset, svg) {
  const painted = containsFixtureFace(svg);
  if (sceneOffMark(preset) && painted) return "marked golden still contains subject-f or ground-f";
  if (keepSubject(preset) && !painted) return "backgrounds golden drops subject-f";
  return "";
}

const OPAQUE_FULL_BLEED = new Set(["bg.solid", "bg.linearGradient", "bg.sky", "bg.radialGradient"]);

function svgGroupIds(svg) {
  const ids = [];
  const re = /<g\b[^>]*\bid="([^"]+)"/g;
  let match;
  while ((match = re.exec(svg))) ids.push(match[1]);
  return ids;
}

function artworkGroupIds(preset, ids) {
  const prefix = `s-${preset?.id ?? ""}`;
  if (prefix === "s-") return [];
  return ids.filter((id) => id === prefix || id.startsWith(`${prefix}-`));
}

/** Backgrounds paint directly after the stage and before the subject and ground. */
function backgroundOrderProblem(preset, ids) {
  if (preset?.category !== "backgrounds") return "";
  const list = Array.isArray(ids) ? ids : [];
  const artwork = [];
  const allowed = new Set(artworkGroupIds(preset, list));
  list.forEach((id, index) => {
    if (allowed.has(id)) artwork.push(index);
  });
  if (artwork.length === 0) return "";
  const stage = list.indexOf("s-stage");
  const subject = list.findIndex((id) =>
    id === "subject" ||
    id.startsWith("subject-") ||
    id.startsWith("s-subject") ||
    id === "ground" ||
    id.startsWith("ground-") ||
    id.startsWith("s-ground"),
  );
  const first = artwork[0];
  if (subject >= 0 && first > subject) return "backgrounds group is after the subject";
  if (stage >= 0 && first !== stage + 1) return "backgrounds group is not directly after s-stage";
  for (let index = 1; index < artwork.length; index += 1) {
    if (artwork[index] !== artwork[index - 1] + 1) return "backgrounds group is not directly after s-stage";
  }
  if (subject >= 0 && artwork[artwork.length - 1] > subject) return "backgrounds group is after the subject";
  return "";
}

function svgUserSize(svg) {
  const view = svg.match(/\bviewBox="\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*"/);
  if (view) return { width: Number(view[1]), height: Number(view[2]) };
  const width = Number.parseFloat(svg.match(/\bwidth="([0-9.]+)"/)?.[1] ?? "");
  const height = Number.parseFloat(svg.match(/\bheight="([0-9.]+)"/)?.[1] ?? "");
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1,
    height: Number.isFinite(height) && height > 0 ? height : 1,
  };
}

function tagAttr(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";
}

function tagNumber(tag, name) {
  const text = tagAttr(tag, name);
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function isDarkStageInk(fill) {
  const hex = normalizeHex(fill);
  if (!hex) return false;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return channels.every((channel) => channel >= 0x1f && channel <= 0x2a);
}

function patternInkAllowed(fill, opacity) {
  if (opacity !== null && opacity >= 0.12 - 1e-9 && opacity <= 0.3 + 1e-9) return true;
  return isDarkStageInk(fill);
}

function elementBounds(tag) {
  if (tag.startsWith("<rect")) {
    const x = tagNumber(tag, "x") ?? 0;
    const y = tagNumber(tag, "y") ?? 0;
    const width = tagNumber(tag, "width");
    const height = tagNumber(tag, "height");
    if (width === null || height === null) return null;
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  const points = pathLinePoints(tagAttr(tag, "d"));
  if (!points || points.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

function coversFrame(bounds, width, height) {
  return bounds.minX <= 0.5 && bounds.minY <= 0.5 && bounds.maxX >= width - 0.5 && bounds.maxY >= height - 0.5;
}

function groupSlice(svg, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const open = new RegExp(`<g\\b[^>]*\\bid="${escaped}"[^>]*>`).exec(svg);
  if (!open) return "";
  if (open[0].endsWith("/>")) return open[0];
  const close = svg.indexOf("</g>", open.index);
  if (close < 0) return "";
  return svg.slice(open.index, close + "</g>".length);
}

/** A pattern background may not paint an opaque full-bleed rect. bg.solid may. */
function backgroundBleedProblem(preset, svg) {
  if (preset?.category !== "backgrounds") return "";
  if (OPAQUE_FULL_BLEED.has(componentId(preset))) return "";
  const size = svgUserSize(svg);
  for (const id of artworkGroupIds(preset, svgGroupIds(svg))) {
    const block = groupSlice(svg, id);
    if (!block) continue;
    const open = block.slice(0, block.indexOf(">") + 1);
    const groupFill = tagAttr(open, "fill");
    const groupOpacity = tagNumber(open, "opacity");
    const tags = block.match(/<(?:path|rect)\b[^>]*\/?>/g) ?? [];
    for (const tag of tags) {
      const fill = tagAttr(tag, "fill") || groupFill;
      if (!fill || fill === "none") continue;
      const own = tagNumber(tag, "opacity");
      const opacity = own === null ? groupOpacity : groupOpacity === null ? own : own * groupOpacity;
      const bounds = elementBounds(tag);
      if (!bounds || !coversFrame(bounds, size.width, size.height)) continue;
      if (!patternInkAllowed(fill, opacity)) return "pattern paints an opaque full-bleed";
    }
  }
  return "";
}

function hiddenFixtureFaceProblem(svg) {
  const pattern = /<g id="s-(?:subject|ground)-f\d+"[^>]*>[\s\S]*?<\/g>/g;
  for (const match of svg.matchAll(pattern)) {
    const block = match[0];
    const open = block.slice(0, block.indexOf(">") + 1);
    if (!/\sopacity="0"/.test(open)) continue;
    const animations = [...block.matchAll(/<animate\b[^>]*\battributeName="opacity"[^>]*>/g)];
    if (animations.length === 0) return "fixture face stays at opacity 0";
    const stays = animations.every((tag) => {
      const values = tag[0].match(/\bvalues="([^"]*)"/);
      if (!values) return false;
      return values[1].split(";").every((part) => part.trim() === "0");
    });
    if (stays) return "fixture face stays at opacity 0";
  }
  return "";
}

function sizeProblem(preset, svg) {
  if (Buffer.byteLength(svg, "utf8") <= 16 * 1024) return "";
  const reason = parameterText(preset, "sizeReason");
  if (typeof reason === "string" && reason.trim()) return "";
  return "golden is over 16 KB without sizeReason";
}

function normalizeHex(value) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text.slice(1).split("").map((item) => item + item).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  return "";
}

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

function inLuminanceBand(value) {
  const luminance = relativeLuminance(value);
  const contrast = loadMotionClass().contrast;
  return luminance !== null && luminance >= contrast.luminanceMin && luminance <= contrast.luminanceMax;
}

function contrastsPages(value) {
  const pages = loadMotionClass().contrast.pages;
  return pages.every((page) => contrastRatio(value, page) >= 3);
}

function fillStands(value) {
  return inLuminanceBand(value) || contrastsPages(value);
}

function outlineStands(preset, minPx, darkOnLight) {
  const stroke = preset?.component?.copied?.stroke;
  const width = preset?.component?.copied?.strokeWidth;
  if (typeof width !== "number" || width + 1e-9 < minPx || !stroke) return false;
  if (darkOnLight) {
    const light = loadMotionClass().contrast.pages[0];
    const strokeLuminance = relativeLuminance(stroke);
    const lightLuminance = relativeLuminance(light);
    return strokeLuminance !== null && lightLuminance !== null && strokeLuminance < lightLuminance && contrastRatio(stroke, light) >= 3;
  }
  return fillStands(stroke);
}

function contrastProblem(preset) {
  const contrast = loadMotionClass().contrast;
  const creature = contrast.creatureCategories.includes(preset?.category);
  const audio = contrast.audioCategories.includes(preset?.category);
  if (!creature && !audio) return "";
  const fills = [];
  const copied = preset?.component?.copied;
  if (typeof copied?.fill === "string") fills.push(copied.fill);
  if (Array.isArray(copied?.layers)) {
    for (const layer of copied.layers) {
      if (typeof layer?.fill === "string") fills.push(layer.fill);
    }
  }
  if (fills.length === 0) return "";
  const minPx = creature ? contrast.creatureOutlinePx : contrast.audioOutlinePx;
  const outline = outlineStands(preset, minPx, creature);
  if (fills.every((fill) => fillStands(fill) || outline)) return "";
  return "graphic misses 3:1 on a page";
}

function pathTokens(text) {
  return String(text).match(/[a-zA-Z]|[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
}

function pathLinePoints(text) {
  const tokens = pathTokens(text);
  const points = [];
  let index = 0;
  let command = "";
  let cx = 0;
  let cy = 0;
  let curved = false;
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") break;
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[upper];
    if (!arity || index + arity > tokens.length) break;
    const args = tokens.slice(index, index + arity).map(Number);
    index += arity;
    if (upper === "C" || upper === "S" || upper === "Q" || upper === "T" || upper === "A") {
      curved = true;
      continue;
    }
    if (upper === "H") {
      cx = relative ? cx + args[0] : args[0];
      points.push({ x: cx, y: cy });
    } else if (upper === "V") {
      cy = relative ? cy + args[0] : args[0];
      points.push({ x: cx, y: cy });
    } else {
      cx = relative ? cx + args[0] : args[0];
      cy = relative ? cy + args[1] : args[1];
      points.push({ x: cx, y: cy });
      if (upper === "M") command = relative ? "l" : "L";
    }
  }
  return curved ? null : points;
}

function lineSubpaths(text) {
  const tokens = pathTokens(text);
  const result = [];
  let index = 0;
  let command = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let points = [];
  let curved = false;
  const flush = (close) => {
    if (close && points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first.x !== last.x || first.y !== last.y) points.push({ x: first.x, y: first.y });
    }
    if (!curved && points.length >= 8) result.push(points);
    points = [];
    curved = false;
  };
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") {
      flush(true);
      cx = sx;
      cy = sy;
      command = "";
      continue;
    }
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }[upper];
    if (!arity || index + arity > tokens.length) break;
    const args = tokens.slice(index, index + arity).map(Number);
    index += arity;
    if (upper === "C" || upper === "S" || upper === "Q" || upper === "T" || upper === "A") {
      curved = true;
      continue;
    }
    let x = cx;
    let y = cy;
    if (upper === "H") x = relative ? cx + args[0] : args[0];
    else if (upper === "V") y = relative ? cy + args[0] : args[0];
    else {
      x = relative ? cx + args[0] : args[0];
      y = relative ? cy + args[1] : args[1];
    }
    if (upper === "M" && points.length > 0) flush(false);
    if (upper === "M") {
      sx = x;
      sy = y;
    }
    points.push({ x, y });
    cx = x;
    cy = y;
    if (upper === "M") command = relative ? "l" : "L";
  }
  if (points.length > 0) flush(false);
  return result;
}

function circleFrom(a, b, c) {
  const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(determinant) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / determinant;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / determinant;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

function chordSagProblem(svg) {
  const paths = svg.match(/\bd="([^"]*)"/g) ?? [];
  for (const raw of paths) {
    const data = raw.slice(3, -1);
    if (/\b[Aa]\s/.test(data) && !/[LlHhVv]/.test(data)) continue;
    for (const points of lineSubpaths(data)) {
      const unique = points.slice();
      const first = unique[0];
      const last = unique[unique.length - 1];
      if (first && last && first.x === last.x && first.y === last.y) unique.pop();
      if (unique.length < 8) continue;
      const circle = circleFrom(unique[0], unique[Math.floor(unique.length / 3)], unique[Math.floor((2 * unique.length) / 3)]);
      if (!circle || circle.r < 1) continue;
      const onCircle = unique.every((point) => Math.abs(Math.hypot(point.x - circle.x, point.y - circle.y) - circle.r) <= 0.08);
      if (!onCircle) continue;
      for (let index = 0; index + 1 < points.length; index += 1) {
        const chord = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
        const half = chord / 2;
        if (half >= circle.r) return "circle chord sag is over 1 user unit";
        const sag = circle.r - Math.sqrt(circle.r * circle.r - half * half);
        if (sag > 1) return "circle chord sag is over 1 user unit";
      }
    }
  }
  return "";
}

function denyTerms() {
  return (process.env.SVGIF_DENY_TERMS ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function glyphGate() {
  if (process.env.SVGIF_REQUIRE_DENY_TERMS !== "true") return { skip: true };
  const terms = denyTerms();
  if (terms.length === 0) return { error: "SVGIF_DENY_TERMS is not set" };
  return { terms };
}

function glyphTextProblem(texts) {
  const gate = glyphGate();
  if (gate.skip) return "";
  if (gate.error) return gate.error;
  const haystack = (texts ?? []).join("\n");
  for (const term of gate.terms) {
    if (haystack.includes(term)) return "glyph swap matched a denied term";
  }
  return "";
}

function sameSample(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function earliestKey(track) {
  const keys = track?.keys;
  if (!Array.isArray(keys) || keys.length === 0) return null;
  let best = keys[0];
  for (const key of keys) {
    if (key && key.frame < best.frame) best = key;
  }
  return best;
}

function staticKey(track) {
  const first = earliestKey(track);
  if (!first) return null;
  return { property: track.property, keys: [{ frame: 0, value: first.value }] };
}

function trackStaysConstant(frames, nodeId, track) {
  const first = earliestKey(track);
  if (!first) return false;
  for (const frame of frames) {
    if (!sameSample(frame[nodeId]?.[track.property], first.value)) return false;
  }
  return true;
}

function clipOrMaskReveals(node) {
  return (node.tracks ?? []).some((track) => track.property === "clip" || track.property === "mask");
}

function opacityStaysZero(frames, nodeId) {
  let saw = false;
  for (const frame of frames) {
    const value = frame[nodeId]?.["attr.opacity"];
    if (value === undefined) return false;
    saw = true;
    if (value !== 0) return false;
  }
  return saw;
}

function fixtureFace(id) {
  return /^(?:subject|ground)-f\d+$/.test(id);
}

/**
 * Drop constant tracks to the first key and omit faces that stay invisible.
 * [[sot:svgif/preset-registry]] [[sot:svgif/determinism]]
 */
function fitTimeline(sample, timeline, preset) {
  const frames = [];
  for (let frame = 0; frame < timeline.durationInFrames; frame += 1) {
    frames.push(sample(timeline, frame));
  }
  const nodes = [];
  for (const node of timeline.nodes) {
    if (sceneOmitted(preset) && fixtureFace(node.id)) continue;
    if (node.id !== "s-stage" && !clipOrMaskReveals(node) && opacityStaysZero(frames, node.id)) continue;
    const tracks = [];
    for (const track of node.tracks ?? []) {
      if (trackStaysConstant(frames, node.id, track)) {
        const kept = staticKey(track);
        if (kept) tracks.push(kept);
      } else tracks.push(track);
    }
    nodes.push({ id: node.id, tracks });
  }
  return { ...timeline, nodes };
}

/**
 * The timeline compiled for this preset on the shared demo scene.
 * Boolean true on `{ name: "loop", value: true }` sets `loop`.
 * Absent, false, or any other value leaves the field unset.
 * Boolean false on `{ name: "scene", value: false }` omits the baked subject and ground.
 * A backgrounds preset paints directly after s-stage and before the subject and ground.
 * Other categories keep the preset group after the baked subject and ground.
 * [[sot:svgif/preset-registry]]
 */
export async function presetTimeline(preset, fixture) {
  assertDemoScene(fixture);
  const engine = await loadEngine();
  const { bake } = engine.bake;
  const { projectScene } = engine.scene;
  const { sample } = engine.ir;
  const cameraPreset = isCameraPreset(preset);
  const solid = cameraPreset ? null : presetSolid(preset);
  const consumePose = cameraPreset || solid !== null;
  const plan = artworkPlan(preset, fixture, consumePose);
  const duration = timelineDuration(fixture, motionTracks(preset), preset);
  const fps = fixture.fps;
  const motions = [];
  let cameraAtFrame0 = {
    position: { ...fixture.camera.position },
    eulerXYZ: { x: 0, y: 0, z: 0 },
    fovY: fixture.camera.fovY,
  };
  let cameraNode = null;
  if (cameraPreset) {
    const tracks = irTracks(plan.consumed);
    const remap = parameterNumber(preset, "start") !== undefined || parameterNumber(preset, "endFrame") !== undefined;
    const bakeKeys = remap ? [] : (poseBakeKeys(tracks, duration) ?? []);
    let nextKey = 0;
    const poseAt = (frame) => sampledCameraPose(preset, fixture, frame, duration, fps, sample);
    const poseForKey = (frame) => {
      if (bakeKeys.length > 0 && (nextKey >= bakeKeys.length || frame < bakeKeys[nextKey].frame)) nextKey = 0;
      if (nextKey < bakeKeys.length && bakeKeys[nextKey].frame === frame) {
        const values = valuesForBakeKey(tracks, bakeKeys, nextKey);
        nextKey += 1;
        return cameraPose(preset, fixture.camera.position, values, fixture);
      }
      return poseAt(frame);
    };
    cameraAtFrame0 = bakeKeys.length > 0
      ? cameraPose(preset, fixture.camera.position, valuesForBakeKey(tracks, bakeKeys, 0), fixture)
      : poseAt(0);
    motions.push(
      poseMotion("camera", tracks, duration, fps, (frame) => {
        const pose = poseForKey(frame);
        if (cameraNode) cameraNode.camera.fovY = pose.fovY;
        return { position: pose.position, eulerXYZ: pose.eulerXYZ };
      }, bakeKeys),
    );
  }
  if (solid) {
    const tracks = irTracks(plan.consumed);
    const poseAt = (frame) => meshPose(solid.position, samplePose(sample, solid.id, tracks, frame, duration, fps));
    motions.push(poseMotion(solid.id, tracks, duration, fps, (frame) => poseAt(frame)));
  }
  const built = buildRoot(engine.scene, fixture, cameraAtFrame0, solid, layoutMeshes(preset, fixture, cameraAtFrame0));
  cameraNode = built.camera;
  const root = built.root;
  const projected = projectScene(root, { width: fixture.width, height: fixture.height, cameraId: "camera" });
  const projectedAgain = projectScene(root, { width: fixture.width, height: fixture.height, cameraId: "camera" });
  if (projected !== projectedAgain || !projected.includes("<svg")) throw new Error("the projection is not byte-stable");
  const scene = {
    fps,
    width: fixture.width,
    height: fixture.height,
    durationInFrames: duration,
    root,
    cameraId: "camera",
    material: { albedo: { ...fixture.material.albedo } },
    lights: {
      ambient: { ...fixture.lights.ambient },
      directional: fixture.lights.directional.map((light) => ({
        direction: { ...light.direction },
        diffuse: { ...light.diffuse },
      })),
    },
    motions,
  };
  const baked = bake(scene);
  const bakedAgain = bake(scene);
  if (JSON.stringify(baked.ir) !== JSON.stringify(bakedAgain.ir)) throw new Error("the golden is not byte-stable");
  const used = new Set(["s-stage", ...baked.ir.nodes.map((node) => node.id)]);
  const stage = stageNode(fixture);
  const bakedNodes = baked.ir.nodes;
  const nodes = [stage];
  let inkNodeId = null;
  if (preset.category === "backgrounds") {
    inkNodeId = appendArtwork(nodes, preset, used, plan.parts);
    nodes.push(...bakedNodes);
  } else {
    nodes.push(...bakedNodes);
    inkNodeId = appendArtwork(nodes, preset, used, plan.parts);
  }
  const timeline = {
    fps,
    width: fixture.width,
    height: fixture.height,
    durationInFrames: duration,
    nodes,
  };
  if (timelineLoops(preset)) timeline.loop = true;
  const fitted = fitTimeline(sample, timeline, preset);
  if (inkNodeId && fitted.nodes.some((node) => node.id === inkNodeId)) fitted.inkHost = inkNodeId;
  return fitted;
}

/**
 * One SVG for this preset on the shared demo scene.
 * The projector, the CSS backends, and the SMIL backend each run.
 * The golden file is the SMIL document. A second run matches the first.
 * [[sot:svgif/determinism]] [[sot:svgif/preset-registry]]
 */
export async function renderPresetGolden(preset, fixture) {
  const timeline = await presetTimeline(preset, fixture);
  const inkHost = timeline.inkHost;
  delete timeline.inkHost;
  const { compile } = (await loadEngine()).lower;
  const smil = compile(timeline, "smil");
  const smilAgain = compile(timeline, "smil");
  const embedded = compile(timeline, "css-embedded");
  const external = compile(timeline, "css-external");
  if (smil.svg !== smilAgain.svg || !smil.svg.includes("<svg")) throw new Error("the golden is not byte-stable");
  if (!embedded.svg.includes("<svg") || !external.svg.includes("<svg")) throw new Error("the compiler did not return an SVG");
  return withInk(smil.svg, preset, inkHost);
}

function hasMotionKeys(preset) {
  const tracks = preset?.motionPreset?.tracks;
  if (!Array.isArray(tracks)) return false;
  return tracks.some((track) => Array.isArray(track?.keys) && track.keys.length > 0);
}

function isCssOnly(svg) {
  return /@keyframes\b/.test(svg) && !/<(?:animate|animateTransform|animateMotion)\b/.test(svg);
}

function requiresMotion(preset, svg) {
  if (isCssOnly(svg)) return true;
  if (preset && !hasMotionKeys(preset)) return false;
  if (preset && hasMotionKeys(preset)) return true;
  return /<(?:animate|animateTransform|animateMotion)\b/.test(svg) || /@keyframes\b/.test(svg);
}

function sampleFrameIndexes(duration) {
  const last = Math.max(0, duration - 1);
  const mid = last === 0 ? 0 : Math.max(1, Math.floor(last / 2));
  return { frame0: 0, mid, last };
}

function commandPath(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return "";
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The same candidate loop as scripts/ci/studio-shell.sh. This file does not edit that script. */
function chromiumBinary() {
  const fromEnv = process.env.SVGIF_SHELL_BROWSER ?? "";
  if (fromEnv) {
    if (executable(fromEnv)) return fromEnv;
    throw new Error("studio shell page exists but no browser is on PATH");
  }
  const text = readFileSync(join(repoRoot, "scripts/ci/studio-shell.sh"), "utf8");
  const match = text.match(/for candidate in ([^;\n]+)/);
  const names = match ? match[1].trim().split(/\s+/) : [];
  for (const name of names) {
    const found = commandPath(name);
    if (found && executable(found)) return found;
  }
  throw new Error("studio shell page exists but no browser is on PATH");
}

const SAMPLE_PAGE = `
function delayFor(frame, fps) {
  if (frame === 0) return "0s";
  return "-" + (frame / fps) + "s";
}
function seek(frame, fps) {
  let style = document.head.querySelector("style[data-svgif-seek]");
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("data-svgif-seek", "");
    document.head.appendChild(style);
  }
  const delay = delayFor(frame, fps);
  style.textContent = "* { animation-play-state: paused !important; animation-delay: " + delay + " !important; }";
  const svg = document.querySelector("svg");
  if (svg && typeof svg.pauseAnimations === "function") svg.pauseAnimations();
  if (svg && typeof svg.setCurrentTime === "function") svg.setCurrentTime(frame / fps);
}
function seekTime(seconds) {
  let style = document.head.querySelector("style[data-svgif-seek]");
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("data-svgif-seek", "");
    document.head.appendChild(style);
  }
  const delay = seconds === 0 ? "0s" : "-" + seconds + "s";
  style.textContent = "* { animation-play-state: paused !important; animation-delay: " + delay + " !important; }";
  const svg = document.querySelector("svg");
  if (svg && typeof svg.pauseAnimations === "function") svg.pauseAnimations();
  if (svg && typeof svg.setCurrentTime === "function") svg.setCurrentTime(seconds);
}
function visibleText() {
  const parts = [];
  for (const el of document.querySelectorAll("text, tspan")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const opacity = Number.parseFloat(style.opacity);
    if (Number.isFinite(opacity) && opacity === 0) continue;
    const value = el.textContent || "";
    if (value.trim()) parts.push(value);
  }
  return parts.join("\\n");
}
function round(value) {
  return Math.round(value * 100) / 100;
}
function signature() {
  const svg = document.querySelector("svg");
  if (!svg) return "";
  const rows = [];
  for (const el of svg.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    rows.push([
      el.tagName,
      el.id || "",
      style.opacity,
      style.transform,
      style.fill,
      style.stroke,
      style.clipPath,
      round(box.x),
      round(box.y),
      round(box.width),
      round(box.height),
    ].join(" "));
  }
  return rows.join("\\n");
}
function svgPixels(svg) {
  const width = Number.parseFloat(svg.getAttribute("width") || "");
  const height = Number.parseFloat(svg.getAttribute("height") || "");
  const box = svg.viewBox && svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(Number.isFinite(width) && width > 0 ? width : (box && box.width) || rect.width || 1)),
    height: Math.max(1, Math.round(Number.isFinite(height) && height > 0 ? height : (box && box.height) || rect.height || 1)),
  };
}
function paintBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, count };
}
function boundsDiffer(left, right) {
  if (!left || !right) return left !== right;
  if (Math.abs(left.minX - right.minX) > 2) return true;
  if (Math.abs(left.minY - right.minY) > 2) return true;
  if (Math.abs(left.maxX - right.maxX) > 2) return true;
  if (Math.abs(left.maxY - right.maxY) > 2) return true;
  const scale = Math.max(left.count, right.count, 1);
  return Math.abs(left.count - right.count) / scale > 0.02;
}
async function rasterClip(svg, markup) {
  const live = [...svg.querySelectorAll("[clip-path]")];
  const clone = svg.cloneNode(true);
  const cloned = [...clone.querySelectorAll("[clip-path]")];
  const samples = [];
  for (let index = 0; index < live.length; index++) {
    const computed = (getComputedStyle(live[index]).clipPath || "").replace(/\\s+/g, "").toLowerCase();
    if (!computed || computed === "none" || computed.startsWith("url(")) continue;
    const attr = live[index].getAttribute("clip-path") || "";
    if (!attr.includes("url(")) continue;
    cloned[index].setAttribute("data-svgif-clip-sample", "");
    cloned[index].style.setProperty("--svgif-markup-clip", attr);
    samples.push(cloned[index]);
  }
  if (samples.length === 0) return { absent: true };
  const keep = new Set();
  for (const el of samples) {
    let node = el;
    while (node && node !== clone) {
      keep.add(node);
      node = node.parentElement;
    }
  }
  for (const el of clone.querySelectorAll("*")) {
    if (keep.has(el)) el.style.setProperty("opacity", "1", "important");
    else el.style.setProperty("opacity", "0", "important");
  }
  for (const el of samples) {
    el.style.setProperty("fill", "#000000", "important");
    el.style.setProperty("stroke", "none", "important");
    if (markup) el.style.setProperty("clip-path", "var(--svgif-markup-clip)", "important");
  }
  const size = svgPixels(svg);
  clone.setAttribute("width", String(size.width));
  clone.setAttribute("height", String(size.height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return { bounds: paintBounds(ctx.getImageData(0, 0, size.width, size.height).data, size.width, size.height) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function paintedClipShifted() {
  const svg = document.querySelector("svg");
  if (!svg) return false;
  const painted = await rasterClip(svg, false);
  if (!painted || painted.absent) return false;
  const markup = await rasterClip(svg, true);
  return boundsDiffer(painted.bounds, markup && markup.bounds);
}
async function sample(frame, fps) {
  seek(frame, fps);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  // The markup clip is the frame-0 state. A reference-box offset is already
  // visible there, while a later frame may animate the clip on purpose.
  const shifted = frame === 0 ? await paintedClipShifted() : false;
  return { signature: signature(), clipShifted: shifted };
}
`;

let browserPromise;

function openBrowser() {
  if (!browserPromise) browserPromise = launchBrowser();
  return browserPromise;
}

async function launchBrowser() {
  const binary = chromiumBinary();
  const profile = mkdtempSync(join(tmpdir(), "svgif-golden-"));
  const chrome = spawn(
    binary,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  const portWait = new Promise((resolvePort, rejectPort) => {
    const timer = setTimeout(() => rejectPort(new Error("browser did not open a debugging port")), 20000);
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    });
    chrome.on("exit", (code) => {
      clearTimeout(timer);
      rejectPort(new Error(`browser exited ${code} before the debugging port opened`));
    });
  });
  const close = () => {
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  };
  try {
    const debugPort = await portWait;
    const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.json());
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", () => rejectOpen(new Error("browser socket failed")), { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolveSend, rejectSend } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectSend(new Error(message.error.message ?? "browser command failed"));
      else resolveSend(message.result ?? {});
    });
    const send = (method, params = {}, sessionId) => {
      const id = ++nextId;
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolveSend, rejectSend });
        socket.send(JSON.stringify(message));
      });
    };
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    const callPage = async (source, args) => {
      const holder = await send(
        "Runtime.evaluate",
        { expression: "globalThis", returnByValue: false },
        sessionId,
      );
      const objectId = holder.result?.objectId;
      if (!objectId) throw new Error("frame was not sampled");
      try {
        const evaluated = await send(
          "Runtime.callFunctionOn",
          {
            objectId,
            functionDeclaration: source,
            arguments: args.map((value) => ({ value })),
            awaitPromise: true,
            returnByValue: true,
          },
          sessionId,
        );
        if (evaluated.exceptionDetails || evaluated.result?.subtype === "error") throw new Error("frame was not sampled");
        return evaluated.result?.value;
      } finally {
        await send("Runtime.releaseObject", { objectId }, sessionId);
      }
    };
    return {
      async sample(svg, fps, duration, extra = {}) {
        const size = svgPixelSize(svg);
        await send(
          "Emulation.setDeviceMetricsOverride",
          { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false },
          sessionId,
        );
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f7f7f7}</style></head><body>\n${svg}\n</body></html>`;
        const tree = await send("Page.getFrameTree", {}, sessionId);
        const frameId = tree.frameTree?.frame?.id;
        if (!frameId) throw new Error("frame was not sampled");
        await send("Page.setDocumentContent", { frameId, html }, sessionId);
        const indexes = sampleFrameIndexes(duration);
        const shots = {};
        const named = [
          ["frame0", indexes.frame0],
          ["mid", indexes.mid],
          ["last", indexes.last],
        ];
        if (Number.isInteger(extra.peakFrame)) named.push(["peak", extra.peakFrame]);
        for (const [name, frame] of named) {
          const evaluated = await send(
            "Runtime.evaluate",
            {
              expression: `(async () => { ${SAMPLE_PAGE} return await sample(${frame}, ${fps}); })()`,
              awaitPromise: true,
              returnByValue: true,
            },
            sessionId,
          );
          if (evaluated.exceptionDetails || evaluated.result?.subtype === "error") {
            throw new Error("frame was not sampled");
          }
          const value = evaluated.result?.value;
          if (!value || typeof value.signature !== "string") throw new Error("frame was not sampled");
          shots[name] = { signature: value.signature, clipShifted: value.clipShifted, paint: await capturePaint(send, sessionId, size, RASTER_SCALE) };
        }
        if (extra.wrap) {
          const dur = duration / fps;
          for (const [name, seconds] of [
            ["after", dur],
            ["early", 0.1],
            ["late", dur + 0.1],
          ]) {
            const evaluated = await send(
              "Runtime.evaluate",
              {
                expression: `(async () => { ${SAMPLE_PAGE} seekTime(${seconds}); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return { signature: signature(), clipShifted: false }; })()`,
                awaitPromise: true,
                returnByValue: true,
              },
              sessionId,
            );
            if (evaluated.exceptionDetails || evaluated.result?.subtype === "error") throw new Error("frame was not sampled");
            const value = evaluated.result?.value;
            if (!value || typeof value.signature !== "string") throw new Error("frame was not sampled");
            shots[name] = { signature: value.signature, clipShifted: false, paint: await capturePaint(send, sessionId, size, RASTER_SCALE) };
          }
        }
        if (extra.text) {
          const texts = [];
          for (let frame = 0; frame < duration; frame += 1) {
            const evaluated = await send(
              "Runtime.evaluate",
              {
                expression: `(async () => { ${SAMPLE_PAGE} seek(${frame}, ${fps}); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return visibleText(); })()`,
                awaitPromise: true,
                returnByValue: true,
              },
              sessionId,
            );
            if (evaluated.exceptionDetails || evaluated.result?.subtype === "error") throw new Error("frame was not sampled");
            if (typeof evaluated.result?.value !== "string") throw new Error("frame was not sampled");
            texts.push(evaluated.result.value);
          }
          shots.texts = texts;
        }
        const lightFrame = indexes.last;
        const prepared = await send(
          "Runtime.evaluate",
          {
            expression: `(async () => { ${SAMPLE_PAGE} const stage = document.querySelector("#s-stage"); if (stage) stage.setAttribute("fill", "#f7f7f7"); seek(${lightFrame}, ${fps}); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()`,
            awaitPromise: true,
            returnByValue: true,
          },
          sessionId,
        );
        if (prepared.exceptionDetails || prepared.result?.subtype === "error") throw new Error("frame was not sampled");
        return { ...shots, lightInk: paintDiffersFromLight(await capturePaint(send, sessionId, size, RASTER_SCALE)) };
      },
      async paintAt(svg, fps, frames) {
        const size = svgPixelSize(svg);
        await send(
          "Emulation.setDeviceMetricsOverride",
          { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false },
          sessionId,
        );
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f7f7f7}</style></head><body>\n${svg}\n</body></html>`;
        const tree = await send("Page.getFrameTree", {}, sessionId);
        const frameId = tree.frameTree?.frame?.id;
        if (!frameId) throw new Error("frame was not sampled");
        await send("Page.setDocumentContent", { frameId, html }, sessionId);
        const paints = [];
        for (const frame of frames) {
          const evaluated = await send(
            "Runtime.evaluate",
            {
              expression: `(async () => { ${SAMPLE_PAGE} seek(${frame}, ${fps}); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()`,
              awaitPromise: true,
              returnByValue: true,
            },
            sessionId,
          );
          if (evaluated.exceptionDetails || evaluated.result?.subtype === "error") throw new Error("frame was not sampled");
          paints.push(await capturePaint(send, sessionId, size, RASTER_SCALE));
        }
        return paints;
      },
      async inkSubpathProblem(d, width, height) {
        const value = await callPage(
          `async function inkCheck(d, width, height) { ${INK_PAGE} return await inkSubpathProblem(d, width, height); }`,
          [d, width, height],
        );
        if (typeof value !== "string") throw new Error("frame was not sampled");
        return value;
      },
      async pathCoverage(d, width, height) {
        const value = await callPage(
          `async function coverCheck(d, width, height) { ${INK_PAGE} return await pathCoverage(d, width, height); }`,
          [d, width, height],
        );
        if (typeof value !== "string") throw new Error("frame was not sampled");
        return value;
      },
      async close() {
        socket.close();
        close();
      },
    };
  } catch (error) {
    close();
    browserPromise = null;
    throw error;
  }
}

async function closeBrowser() {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // The launch already reported the browser failure.
  }
}

function svgPixelSize(svg) {
  const width = Number.parseFloat(svg.match(/\bwidth="([0-9.]+)"/)?.[1] ?? "");
  const height = Number.parseFloat(svg.match(/\bheight="([0-9.]+)"/)?.[1] ?? "");
  const view = svg.match(/\bviewBox="\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*"/);
  const parsedWidth = Number.isFinite(width) && width > 0 ? width : view ? Number(view[1]) : 1;
  const parsedHeight = Number.isFinite(height) && height > 0 ? height : view ? Number(view[2]) : 1;
  return { width: Math.max(1, Math.round(parsedWidth)), height: Math.max(1, Math.round(parsedHeight)) };
}

function decodePng(base64) {
  const buf = Buffer.from(base64, "base64");
  if (buf.length < 8 || buf.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error("frame was not sampled");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    offset += 4;
    const type = buf.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = buf.subarray(offset, offset + length);
    offset += length + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (interlace !== 0 || (colorType !== 2 && colorType !== 6) || width < 1 || height < 1) {
    throw new Error("frame was not sampled");
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let src = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const row = Buffer.from(inflated.subarray(src, src + stride));
    src += stride;
    if (row.length !== stride) throw new Error("frame was not sampled");
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 255;
      else if (filter === 2) row[index] = (row[index] + up) & 255;
      else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const paeth = left + up - upLeft;
        const distanceLeft = Math.abs(paeth - left);
        const distanceUp = Math.abs(paeth - up);
        const distanceUpLeft = Math.abs(paeth - upLeft);
        const predictor = distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft ? left : distanceUp <= distanceUpLeft ? up : upLeft;
        row[index] = (row[index] + predictor) & 255;
      } else if (filter !== 0) throw new Error("frame was not sampled");
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const dest = (y * width + x) * 4;
      out[dest] = row[source];
      out[dest + 1] = row[source + 1];
      out[dest + 2] = row[source + 2];
      out[dest + 3] = channels === 4 ? row[source + 3] : 255;
    }
    previous = row;
  }
  return out;
}

const INK_PAGE = `
function inkParts(d) {
  const parts = [];
  const re = /[Mm][^Mm]*/g;
  let match;
  while ((match = re.exec(d))) {
    const part = match[0].trim();
    if (part) parts.push(part);
  }
  return parts;
}
function inkBox(d) {
  const tokens = d.match(/[MmLlHhVvAaCcQqSsTtZz]|-?\\d+(?:\\.\\d+)?/g);
  if (!tokens) return null;
  let index = 0;
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let command = "";
  const take = () => Number(tokens[index++]);
  const mark = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    const at = (x, y) => {
      const px = relative ? cx + x : x;
      const py = relative ? cy + y : y;
      mark(px, py);
      cx = px;
      cy = py;
    };
    if (command === "M" || command === "m" || command === "L" || command === "l" || command === "T" || command === "t") {
      at(take(), take());
      if (command === "M") command = "L";
      if (command === "m") command = "l";
    } else if (command === "H" || command === "h") {
      const x = relative ? cx + take() : take();
      mark(x, cy);
      cx = x;
    } else if (command === "V" || command === "v") {
      const y = relative ? cy + take() : take();
      mark(cx, y);
      cy = y;
    } else if (command === "A" || command === "a") {
      const rx = Math.abs(take());
      const ry = Math.abs(take());
      take();
      take();
      take();
      const startX = cx;
      const startY = cy;
      at(take(), take());
      mark(startX - rx, startY - ry);
      mark(startX + rx, startY + ry);
      mark(cx - rx, cy - ry);
      mark(cx + rx, cy + ry);
    } else if (command === "C" || command === "c") {
      at(take(), take());
      at(take(), take());
      at(take(), take());
    } else if (command === "Q" || command === "q" || command === "S" || command === "s") {
      at(take(), take());
      at(take(), take());
    } else if (command === "Z" || command === "z") {
      command = "";
    } else {
      break;
    }
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return { minX, minY, maxX, maxY };
}
function boxesOverlap(left, right) {
  return left.maxX > right.minX && right.maxX > left.minX && left.maxY > right.minY && right.maxY > left.minY;
}
async function rasterPath(d, width, height) {
  const scale = 4;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (width * scale) + '" height="' + (height * scale) + '" viewBox="0 0 ' + width + ' ' + height + '"><rect width="' + width + '" height="' + height + '" fill="#f7f7f7"/><path fill="#111111" d="' + d + '"/></svg>';
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function covered(data, index) {
  const delta = Math.max(
    Math.abs(data[index] - 0x11),
    Math.abs(data[index + 1] - 0x11),
    Math.abs(data[index + 2] - 0x11),
  );
  return data[index + 3] > 200 && delta < 24;
}
function overlapInterior(alone, other, index, stride) {
  for (const offset of [0, -4, 4, -stride, stride]) {
    if (!covered(alone, index + offset) || !covered(other, index + offset)) return false;
  }
  return true;
}
function interiorUnchanged(full, other, alone, canvasWidth) {
  const stride = canvasWidth * 4;
  const height = alone.length / stride;
  let interior = 0;
  for (let y = 1; y + 1 < height; y += 1) {
    for (let x = 1; x + 1 < canvasWidth; x += 1) {
      const index = (y * canvasWidth + x) * 4;
      if (!overlapInterior(alone, other, index, stride)) continue;
      interior += 1;
      if (full[index] !== other[index] || full[index + 1] !== other[index + 1] || full[index + 2] !== other[index + 2] || full[index + 3] !== other[index + 3]) {
        return false;
      }
    }
  }
  return interior > 0;
}
async function pathCoverage(d, width, height) {
  const data = await rasterPath(String(d), width, height);
  let hash = 2166136261;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (!covered(data, index)) continue;
    count += 1;
    hash ^= data[index];
    hash = Math.imul(hash, 16777619);
  }
  return count + ":" + (hash >>> 0);
}
async function inkSubpathProblem(d, width, height) {
  const parts = inkParts(d);
  if (parts.length < 2) return "";
  const boxes = parts.map(inkBox);
  const full = await rasterPath(parts.join(" "), width, height);
  for (let index = 1; index < parts.length; index += 1) {
    const box = boxes[index];
    if (!box) continue;
    let overlaps = false;
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (boxes[earlier] && boxesOverlap(box, boxes[earlier])) overlaps = true;
    }
    if (!overlaps) continue;
    const alone = await rasterPath(parts[index], width, height);
    const rest = parts.filter((_, item) => item !== index).join(" ");
    const other = await rasterPath(rest, width, height);
    if (interiorUnchanged(full, other, alone, width * 4)) return "ink subpath does not paint";
  }
  return "";
}
`;

const RASTER_SCALE = 2;

async function capturePaint(send, sessionId, size, scale = RASTER_SCALE) {
  const shot = await send(
    "Page.captureScreenshot",
    {
      format: "png",
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale },
      captureBeyondViewport: true,
      fromSurface: true,
    },
    sessionId,
  );
  if (!shot?.data) throw new Error("frame was not sampled");
  return decodePng(shot.data);
}

/** Pixels whose channels differ by more than `minDelta` in a 2x SMIL raster. */
function pixelChangeCount(left, right, minDelta = 8) {
  if (!left || !right || left.length !== right.length) return 0;
  let count = 0;
  for (let index = 0; index < left.length; index += 4) {
    const delta = Math.max(
      Math.abs(left[index] - right[index]),
      Math.abs(left[index + 1] - right[index + 1]),
      Math.abs(left[index + 2] - right[index + 2]),
      Math.abs(left[index + 3] - right[index + 3]),
    );
    if (delta > minDelta) count += 1;
  }
  return count;
}

function paintsMatch(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** White sits eight levels from #f7f7f7, so ink within 16 levels does not count. */
function paintDiffersFromLight(pixels) {
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue;
    const delta = Math.max(
      Math.abs(pixels[index] - 0xf7),
      Math.abs(pixels[index + 1] - 0xf7),
      Math.abs(pixels[index + 2] - 0xf7),
    );
    if (delta > 16) return true;
  }
  return false;
}

function hasDur(svg) {
  return /\sdur\s*=/.test(svg);
}

export async function motionProblem(svg, options) {
  const fps = options.fps;
  const duration = options.duration;
  if (!Number.isInteger(fps) || fps < 1 || !Number.isInteger(duration) || duration < 1) {
    throw new Error("frame was not sampled");
  }
  if (options.text) {
    const gate = glyphGate();
    if (gate.error) return gate.error;
  }
  const browser = await openBrowser();
  const shots = await browser.sample(svg, fps, duration, {
    peakFrame: options.peakFrame,
    wrap: options.wrap === true,
    text: options.text === true && glyphGate().skip !== true,
  });
  if (shots.frame0.clipShifted || shots.mid.clipShifted || shots.last.clipShifted) {
    return "clip shifted when CSS applies";
  }
  if (!shots.lightInk) return "mark disappears on a light stage";
  if (options.text) {
    const glyph = glyphTextProblem(shots.texts ?? []);
    if (glyph) return glyph;
  }
  if (options.wrap) {
    if (!shots.after || !paintsMatch(shots.after.paint, shots.frame0.paint)) return "frame after the last frame differs from frame 0";
    if (!shots.late || !shots.early || !paintsMatch(shots.late.paint, shots.early.paint)) {
      return "loop sample at dur + 0.1s differs from 0.1s";
    }
    if (options.report) options.report.wrapHeld = true;
  }
  if (!options.requireMotion) return "";
  if (options.beat) {
    if (!shots.peak || paintsMatch(shots.peak.paint, shots.frame0.paint)) return "peak frame matches frame 0";
    return "";
  }
  if (options.entrance) {
    const gap = paintGap(shots.mid.paint, shots.last.paint, svgPixelSize(svg).width * RASTER_SCALE) / RASTER_SCALE;
    const entrance = entranceGapProblem(gap);
    if (entrance) return entrance;
  } else if (hasDur(svg) && paintsMatch(shots.mid.paint, shots.last.paint)) return "mid frame matches the last frame";
  if (paintsMatch(shots.mid.paint, shots.frame0.paint)) return "mid frame does not move when CSS is active";
  if (!options.rest && paintsMatch(shots.last.paint, shots.frame0.paint)) return "last frame does not move when CSS is active";
  return "";
}

function listPresetJson(presetsRoot) {
  if (!existsSync(presetsRoot)) return [];
  const found = [];
  const categories = readdirSync(presetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const category of categories) {
    const directory = join(presetsRoot, category);
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
    for (const name of files) {
      found.push({ full: join(directory, name), relative: `presets/${category}/${name}` });
    }
  }
  return found;
}

export async function checkGoldens(presetsRoot, fixture) {
  const errors = [];
  for (const file of listPresetJson(presetsRoot)) {
    let document;
    try {
      document = readDocument(file.full);
    } catch {
      errors.push(`${file.relative} is not JSON`);
      continue;
    }
    const schemaErrors = validateContract("preset", document);
    if (schemaErrors.length > 0) {
      errors.push(`${file.relative} ${schemaErrors[0]}`);
      continue;
    }
    let svg;
    try {
      svg = await renderPresetGolden(document, fixture);
    } catch (error) {
      errors.push(`${file.relative} ${error instanceof Error ? error.message : "render failed"}`);
      continue;
    }
    const golden = `${file.full.slice(0, -".json".length)}.golden.svg`;
    const previous = existsSync(golden) ? readFileSync(golden, "utf8") : null;
    if (previous !== svg) {
      writeFileSync(golden, svg);
      errors.push(`${file.relative.replace(/\.json$/, ".golden.svg")} differs from the generator`);
    }
    const timeline = timelineDuration(fixture, motionTracks(document), document);
    const label = file.relative.replace(/\.json$/, ".golden.svg");
    for (const problem of [
      await bandProblem(document, fixture),
      await revealProblem(document, fixture),
      limbProblem(document),
      tempoProblem(document, fixture),
      ambientLoopProblem(document),
      sceneFaceProblem(document, svg),
      backgroundOrderProblem(document, svgGroupIds(svg)),
      backgroundBleedProblem(document, svg),
      hiddenFixtureFaceProblem(svg),
      chordSagProblem(svg),
      sizeProblem(document, svg),
      contrastProblem(document),
      await cameraFramingProblem(document, fixture),
      await inkOverlapProblem(svg),
    ]) {
      if (problem) errors.push(`${label} ${problem}`);
    }
    const looping = wrapSample(document);
    const beat = hasMark(document, "beat");
    const report = {};
    try {
      const motion = await motionProblem(svg, {
        fps: fixture.fps,
        duration: timeline,
        requireMotion: requiresMotion(document, svg),
        beat,
        entrance: !beat && travelEndsAtLast(document),
        rest: !beat && travelRests(document),
        peakFrame: beat ? peakFrame(document, timeline) : undefined,
        wrap: looping,
        text: hasMark(document, "glyphSwap"),
        report,
      });
      if (motion) errors.push(`${label} ${motion}`);
      if (ambientKeysDiffer(document) && !report.wrapHeld) {
        errors.push(`${label} ambient first and last keys differ`);
      }
    } catch (error) {
      errors.push(`${label} ${error instanceof Error ? error.message : "frame was not sampled"}`);
    }
  }
  return errors;
}

function pictureBounds(sampled, prefix) {
  let box = null;
  for (const [id, values] of Object.entries(sampled)) {
    if (!id.startsWith(prefix) || values["attr.opacity"] === 0) continue;
    const text = values["attr.d"];
    if (typeof text !== "string") continue;
    const nums = text.match(/-?\d+(?:\.\d+)?/g);
    if (!nums) continue;
    for (let index = 0; index + 1 < nums.length; index += 2) {
      const x = Number(nums[index]);
      const y = Number(nums[index + 1]);
      if (!box) box = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        if (x < box.minX) box.minX = x;
        if (y < box.minY) box.minY = y;
        if (x > box.maxX) box.maxX = x;
        if (y > box.maxY) box.maxY = y;
      }
    }
  }
  if (!box) return null;
  return {
    minX: box.minX,
    minY: box.minY,
    maxX: box.maxX,
    maxY: box.maxY,
    w: box.maxX - box.minX,
    h: box.maxY - box.minY,
    cx: (box.minX + box.maxX) / 2,
    cy: (box.minY + box.maxY) / 2,
  };
}

function travelEndsAtLast(preset) {
  const main = mainSpan(preset);
  return Boolean(main && main.span.first !== main.span.last);
}

function travelRests(preset) {
  const main = mainSpan(preset);
  return Boolean(main && main.span.first === main.span.last);
}

function meshCrossesNear(math, pose, mesh, fixture) {
  const quaternion = math.quaternionFromEulerXYZ(pose.eulerXYZ);
  const cameraWorld = math.compose(pose.position, quaternion, { x: 1, y: 1, z: 1 });
  const view = math.invert(cameraWorld);
  const projection = math.perspective({
    fovY: pose.fovY,
    aspect: fixture.width / fixture.height,
    near: fixture.camera.near,
    far: fixture.camera.far,
  });
  const mvp = math.multiply(projection, view);
  for (const corner of boxCorners(mesh)) {
    const clip = math.transformPoint(mvp, corner);
    if (clip.z + clip.w < 0) return true;
  }
  return false;
}

/** Subject outside the viewBox, or any mesh corner with clip.z + clip.w < 0. */
async function cameraFramingProblem(preset, fixture) {
  if (!isCameraPreset(preset)) return "";
  const engine = await loadEngine();
  const { sample } = engine.ir;
  const timeline = await presetTimeline(preset, fixture);
  const duration = timeline.durationInFrames;
  const rest = sampledCameraPose(preset, fixture, 0, duration, fixture.fps, sample);
  const meshes = layoutMeshes(preset, fixture, rest);
  for (let frame = 0; frame < duration; frame += 1) {
    const extent = pictureBounds(sample(timeline, frame), "subject");
    if (
      !extent ||
      extent.minX < -0.05 ||
      extent.minY < -0.05 ||
      extent.maxX > fixture.width + 0.05 ||
      extent.maxY > fixture.height + 0.05
    ) {
      return "subject leaves the viewBox";
    }
    const pose = sampledCameraPose(preset, fixture, frame, duration, fixture.fps, sample);
    if (meshes.some((mesh) => meshCrossesNear(engine.math, pose, mesh, fixture))) return "mesh crosses the near plane";
  }
  return "";
}

function contentMetrics(pixels, width, height) {
  const bgR = pixels[0];
  const bgG = pixels[1];
  const bgB = pixels[2];
  let weight = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(pixels[index] - bgR),
        Math.abs(pixels[index + 1] - bgG),
        Math.abs(pixels[index + 2] - bgB),
      );
      if (pixels[index + 3] < 16 || delta <= 16) continue;
      const sampleWeight = Math.min(1, delta / 32);
      const px = x + 0.5;
      const py = y + 0.5;
      weight += sampleWeight;
      sx += px * sampleWeight;
      sy += py * sampleWeight;
      sxx += px * px * sampleWeight;
      syy += py * py * sampleWeight;
    }
  }
  if (!(weight > 0)) return null;
  const cx = sx / weight;
  const cy = sy / weight;
  return {
    cx,
    cy,
    w: Math.sqrt(Math.max(0, sxx / weight - cx * cx) * 12),
    h: Math.sqrt(Math.max(0, syy / weight - cy * cy) * 12),
  };
}

function paintGap(left, right, width) {
  if (!left || !right || left.length !== right.length || !(width > 0)) return 0;
  const height = left.length / (4 * width);
  if (!Number.isInteger(height) || height < 1) return 0;
  const start = contentMetrics(left, width, height);
  const end = contentMetrics(right, width, height);
  if (!start || !end) return 0;
  return Math.max(Math.hypot(start.cx - end.cx, start.cy - end.cy), Math.abs(start.w - end.w), Math.abs(start.h - end.h));
}

function entranceGapProblem(gap) {
  if (!(gap >= 2)) return "entrance mid frame is within 2 px of the last frame";
  return "";
}

function pictureTravel(start, end) {
  return Math.hypot(end.cx - start.cx, end.cy - start.cy);
}

/**
 * Declared zoom, ken-burns scale, parallax depth, and cut scale match the
 * measured picture. The zoom centre stays put.
 * [[sot:svgif/preset-registry]] [[sot:svgif/determinism]]
 */
async function posePictureSelfTest() {
  const fixture = readDocument(DEMO_SCENE);
  const { sample } = (await loadEngine()).ir;
  const shot = async (id) => {
    const preset = readDocument(join(repoRoot, "presets/camera", `${id}.json`));
    const timeline = await presetTimeline(preset, fixture);
    const at = (frame) => ({
      subject: pictureBounds(sample(timeline, frame), "subject"),
      ground: pictureBounds(sample(timeline, frame), "ground"),
    });
    return { preset, start: at(0), end: at(timeline.durationInFrames - 1) };
  };
  const zoom = await shot("camera-zoom");
  const zoomScale = parameterNumber(zoom.preset, "scale");
  const zoomRatio = zoom.end.subject.w / zoom.start.subject.w;
  if (Math.abs(zoom.start.subject.w - 34.6) > 0.2) {
    throw new Error("zoom should start near 34.6px");
  }
  if (Math.abs(zoom.end.subject.w - 42.9) > 0.2) {
    throw new Error("zoom should end near 42.9px");
  }
  if (Math.abs(zoomRatio - zoomScale) > 0.01) {
    throw new Error("zoom scale should match the subject width");
  }
  if (pictureTravel(zoom.start.subject, zoom.end.subject) >= 1) {
    throw new Error("zoom centre should stay put");
  }
  const burns = await shot("camera-ken-burns");
  const burnsRatio = burns.end.subject.w / burns.start.subject.w;
  if (burnsRatio < 1.14) throw new Error("ken burns should grow the subject by at least 14 percent");
  if (pictureTravel(burns.start.subject, burns.end.subject) < 24) {
    throw new Error("ken burns should move the subject by at least 24px");
  }
  const zoomPose = cameraPose(zoom.preset, fixture.camera.position, { "transform.scaleX": 1, "transform.scaleY": 1 }, fixture);
  const zoomEndPose = cameraPose(
    zoom.preset,
    fixture.camera.position,
    { "transform.scaleX": zoomScale, "transform.scaleY": zoomScale },
    fixture,
  );
  if (
    zoomPose.position.x !== zoomEndPose.position.x ||
    zoomPose.position.y !== zoomEndPose.position.y ||
    zoomPose.position.z !== zoomEndPose.position.z
  ) {
    throw new Error("zoom should keep the eye on the rest pose");
  }
  if (!(Math.abs(zoomEndPose.fovY - zoomPose.fovY) > 1e-4)) throw new Error("zoom should change fovY");
  const committed = readDocument(join(repoRoot, "presets/camera/camera-parallax.json"));
  const parallaxPreset = Math.abs((parameterNumber(committed, "depthRatio") ?? 0) - 0.6) <= 1e-6
    ? committed
    : followUpParallax(committed);
  const parallaxTimeline = await presetTimeline(parallaxPreset, fixture);
  const parallaxAt = (frame) => ({
    subject: pictureBounds(sample(parallaxTimeline, frame), "subject"),
    ground: pictureBounds(sample(parallaxTimeline, frame), "ground"),
  });
  const parallaxStart = parallaxAt(0);
  const parallaxEnd = parallaxAt(parallaxTimeline.durationInFrames - 1);
  const near = pictureTravel(parallaxStart.ground, parallaxEnd.ground);
  const far = pictureTravel(parallaxStart.subject, parallaxEnd.subject);
  const depthRatio = parameterNumber(parallaxPreset, "depthRatio");
  if (!(near > far)) throw new Error("parallax depth order should keep the slab nearer than the box");
  if (Math.abs(near - 50) > 0.05) throw new Error(`the near slab should travel 50px: ${near}`);
  if (Math.abs(far - 30.497) > 0.05) throw new Error(`the far cube should travel 30.497px: ${far}`);
  if (Math.abs(far / near - depthRatio) > 0.02) {
    throw new Error("parallax travel should follow depthRatio");
  }
  const cut = await shot("camera-cut");
  const cutKeys = cut.preset.motionPreset.tracks.find((track) => track.property === "transform.scaleX").keys;
  const cutRatio = cut.end.subject.w / cut.start.subject.w;
  if (Math.abs(cutRatio - cutKeys.at(-1).value / cutKeys[0].value) > 0.01) {
    throw new Error("cut scale should match the subject width");
  }
  const cutTimeline = await presetTimeline(cut.preset, fixture);
  const cutStep = cutTimeline.nodes
    .map((node) => node.tracks.find((track) => track.property === "attr.d"))
    .find((track) => track && track.keys.length > 2 && track.keys[1]?.value !== track.keys[2]?.value);
  const cutStamp = cutStep?.keys.map((key) => `${key.frame}:${key.easing ?? ""}`).join(",") ?? "";
  if (cutStamp !== "0:,10:cubic-bezier(0.33, 0, 0.2, 1),10:hold,24:cubic-bezier(0.33, 0, 0.2, 1)") {
    throw new Error(`the cut preset scale keys should reach the bake: ${cutStamp}`);
  }
  if (await cameraFramingProblem(zoom.preset, fixture)) throw new Error("zoom should keep the subject inside the viewBox");
  const pushed = structuredClone(zoom.preset);
  pushed.motionPreset = {
    ...pushed.motionPreset,
    tracks: [
      ...pushed.motionPreset.tracks,
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 1.7889 },
          { frame: 24, value: 3.2 },
        ],
      },
    ],
  };
  if ((await cameraFramingProblem(pushed, fixture)) !== "subject leaves the viewBox") {
    throw new Error("a subject outside the viewBox should fail");
  }
  const tight = structuredClone(fixture);
  const ground = tight.meshes.find((mesh) => mesh.id === "ground");
  ground.position = { x: 1.7889, y: 1.8698, z: 2.9178 };
  const closeProblem = await cameraFramingProblem(zoom.preset, tight);
  if (closeProblem !== "mesh crosses the near plane") {
    throw new Error(`a mesh across the near plane should fail: ${closeProblem}`);
  }
  await parameterEffectSelfTest(fixture, sample);
  const still = coveredRect(80, 40, 12, 10, 20, 16);
  const nudge = coveredRect(80, 40, 12.59, 10, 20, 16);
  const moved = coveredRect(80, 40, 20, 10, 20, 16);
  const smallGap = paintGap(still, nudge, 80);
  if (!entranceGapProblem(smallGap)) throw new Error("a 0.59 px gap should fail");
  if (!(smallGap > 0.4 && smallGap < 2)) throw new Error(`a 0.59 px gap should stay under 2 px: ${smallGap}`);
  if (entranceGapProblem(paintGap(still, moved, 80))) throw new Error("an 8 px gap should pass");
  console.log("preset pose self-test ok");
}

/** Recorded parallax picture: the slab travels 50 px and the cube 30.497 px. */
function followUpParallax(preset) {
  const next = structuredClone(preset);
  next.parameters = [
    { name: "depthRatio", value: 0.6 },
    { name: "x", value: -0.4803 },
    { name: "y", value: -0.3446 },
    { name: "distance", value: 0.555 },
    { name: "latitude", value: -0.2063 },
    { name: "azimuth", value: 0.58 },
  ];
  next.motionPreset = {
    ...next.motionPreset,
    tracks: [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: -0.4803 },
          { frame: 24, value: 0.9434, easing: "cubic-bezier(0.42, 0, 0.58, 1)" },
        ],
      },
    ],
  };
  return next;
}

function coveredRect(width, height, x, y, rectWidth, rectHeight) {
  const data = Buffer.alloc(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const index = (py * width + px) * 4;
      const cover = Math.max(0, Math.min(px + 1, x + rectWidth) - Math.max(px, x))
        * Math.max(0, Math.min(py + 1, y + rectHeight) - Math.max(py, y));
      const channel = Math.round(0xf7 * (1 - cover) + 0x11 * cover);
      data[index] = channel;
      data[index + 1] = channel;
      data[index + 2] = channel;
      data[index + 3] = 255;
    }
  }
  return data;
}

async function subjectPicture(preset, fixture, sample, frame) {
  const timeline = await presetTimeline(preset, fixture);
  const index = frame < 0 ? timeline.durationInFrames - 1 : frame;
  return pictureBounds(sample(timeline, index), "subject");
}

async function parameterEffectSelfTest(fixture, sample) {
  const read = (id) => readDocument(join(repoRoot, "presets/camera", `${id}.json`));
  const differ = (left, right) => !left || !right || Math.abs(left.w - right.w) > 0.5 || Math.abs(left.cx - right.cx) > 0.5 || Math.abs(left.cy - right.cy) > 0.5;
  const zoom = read("camera-zoom");
  const scaled = structuredClone(zoom);
  scaled.parameters = scaled.parameters.map((parameter) => (parameter.name === "scale" ? { ...parameter, value: 1.8 } : parameter));
  if (!differ(await subjectPicture(zoom, fixture, sample, -1), await subjectPicture(scaled, fixture, sample, -1))) {
    throw new Error("scale should change the picture");
  }
  const shake = read("camera-shake");
  const reseeded = structuredClone(shake);
  reseeded.parameters = reseeded.parameters.map((parameter) => (parameter.name === "seed" ? { ...parameter, value: 29 } : parameter));
  if (!differ(await subjectPicture(shake, fixture, sample, 6), await subjectPicture(reseeded, fixture, sample, 6))) {
    throw new Error("seed should change the picture");
  }
  const stronger = structuredClone(shake);
  stronger.parameters = stronger.parameters.map((parameter) => (parameter.name === "strength" ? { ...parameter, value: 48 } : parameter));
  if (!differ(await subjectPicture(shake, fixture, sample, 6), await subjectPicture(stronger, fixture, sample, 6))) {
    throw new Error("strength should change the picture");
  }
  const frame = read("camera-frame");
  const tight = structuredClone(frame);
  tight.parameters = tight.parameters.map((parameter) => (parameter.name === "margin" ? { ...parameter, value: 155 } : parameter));
  if (!differ(await subjectPicture(frame, fixture, sample, 0), await subjectPicture(tight, fixture, sample, 0))) {
    throw new Error("margin should change the picture");
  }
  const burns = read("camera-ken-burns");
  const later = structuredClone(burns);
  later.parameters = later.parameters.map((parameter) => (parameter.name === "start" ? { ...parameter, value: 24 } : parameter));
  if (!differ(await subjectPicture(burns, fixture, sample, 0), await subjectPicture(later, fixture, sample, 0))) {
    throw new Error("start should change the picture");
  }
  const sooner = structuredClone(burns);
  sooner.parameters = sooner.parameters.map((parameter) => (parameter.name === "endFrame" ? { ...parameter, value: 12 } : parameter));
  if (!differ(await subjectPicture(burns, fixture, sample, -1), await subjectPicture(sooner, fixture, sample, -1))) {
    throw new Error("endFrame should change the picture");
  }
  const cut = read("camera-cut");
  const farView = structuredClone(cut);
  farView.parameters = farView.parameters.map((parameter) => (parameter.name === "view" ? { ...parameter, value: "far" } : parameter));
  if (!differ(await subjectPicture(cut, fixture, sample, -1), await subjectPicture(farView, fixture, sample, -1))) {
    throw new Error("view should change the picture");
  }
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
  pixelTextSelfTest();
  console.log("presets self-test ok");
}

/** One path is one fill. A run that touches on every key collapses together. */
function pixelTextSelfTest() {
  const cell = (x, y, w = 4, h = 2) => `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  const row = `${cell(0, 0)} ${cell(4, 0)} ${cell(8, 0)}`;
  const stacked = `${cell(0, 0)} ${cell(0, 2)}`;
  const gapped = `${cell(0, 0)} ${cell(6, 0)}`;
  const merged = mergePixelTextTracks([row]);
  if (merged[0] !== "M 0 0 H 12 V 2 H 0 Z") throw new Error("a horizontal pixel run should be one rectangle");
  if (mergePixelTextTracks([stacked])[0] !== stacked) throw new Error("a vertical stack should stay separate");
  if (mergePixelTextTracks([gapped])[0] !== gapped) throw new Error("a gap should stay two rectangles");
  const curve = "M 0 0 C 1 2 3 4 5 6";
  if (mergePixelTextTracks([curve])[0] !== curve) throw new Error("a non-rect path should stay unchanged");
  const start = `${cell(10, 10, 0, 0)} ${cell(10, 10, 0, 0)} ${cell(10, 12, 0, 0)}`;
  const end = `${cell(0, 0)} ${cell(4, 0)} ${cell(0, 2)}`;
  const pair = mergePixelTextTracks([start, end]);
  if (pair[0] !== "M 10 10 H 10 V 10 H 10 Z M 10 12 H 10 V 12 H 10 Z") {
    throw new Error("a shared run should collapse on the first key");
  }
  if (pair[1] !== "M 0 0 H 8 V 2 H 0 Z M 0 2 H 4 V 4 H 0 Z") {
    throw new Error("a shared run should collapse on the last key");
  }
  const other = mergePixelTextTracks([`${cell(0, 0, 4, 4)}`, end]);
  if (other[0] !== `${cell(0, 0, 4, 4)}` || other[1] !== end) {
    throw new Error("keys that are not the same grid should stay unchanged");
  }
}

async function goldenSelfTest() {
  const fixture = readDocument(DEMO_SCENE);
  const sample = readDocument(join(repoRoot, "schema/fixtures/preset/v1-valid.json"));
  const root = mkdtempSync(join(tmpdir(), "svgif-goldens-"));
  const writePreset = (document) => {
    const directory = join(root, document.category);
    mkdirSync(directory, { recursive: true });
    writeJson(join(directory, `${document.id}.json`), document);
  };
  try {
    const artwork = structuredClone(sample);
    artwork.component.copied.stroke = "#f4f4f2";
    artwork.component.copied.strokeWidth = 4;
    artwork.motionPreset = {
      schemaVersion: 1,
      schemaRevision: 0,
      id: "motion.fade",
      tracks: [
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 0 },
            { frame: 23, value: 1, easing: "linear" },
          ],
        },
        {
          property: "transform.translateX",
          keys: [
            { frame: 0, value: 0 },
            { frame: 23, value: 48, easing: "linear" },
          ],
        },
      ],
    };
    artwork.parameters = [...(artwork.parameters ?? []), { name: "sizeReason", value: "shared demo scene" }];
    writePreset(artwork);
    const missing = await checkGoldens(root, fixture);
    if (!missing.some((line) => line.includes("differs from the generator"))) throw new Error("a missing golden should fail");
    const goldenPath = join(root, "primitives", "soft-rect.golden.svg");
    const written = readFileSync(goldenPath, "utf8");
    if (!written.includes("<svg") || !written.includes("s-stage") || !written.includes("s-subject-f0")) {
      throw new Error("the golden should compile the shared scene");
    }
    if (!written.includes("#1c1c1c") || !written.includes("<animate")) throw new Error("the golden should compile the preset");
    if ((await checkGoldens(root, fixture)).length !== 0) throw new Error("a fresh write should match");
    const again = await renderPresetGolden(artwork, fixture);
    if (again !== written) throw new Error("the same preset and fixture should be byte-stable");
    writeFileSync(goldenPath, `${written.slice(0, -1)} `);
    const changed = await checkGoldens(root, fixture);
    if (!changed.some((line) => line.includes("differs from the generator"))) throw new Error("a changed byte should fail");
    if (readFileSync(goldenPath, "utf8") !== written) throw new Error("a fresh write should match the generator");
    writeFileSync(goldenPath, "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
    if (checkPresetTree(root).length !== 0) throw new Error("the default walk should ignore a hand-drawn golden");

    const camera = structuredClone(sample);
    camera.category = "camera";
    camera.id = "camera-dolly";
    camera.component.id = "camera.dolly";
    camera.component.copied.fill = "#abc123";
    camera.component.copied.shape = { form: "rect", width: 960, height: 540 };
    camera.parameters = [{ name: "distance", value: 5 }];
    camera.motionPreset = {
      schemaVersion: 1,
      schemaRevision: 0,
      id: "camera.dolly",
      tracks: [
        {
          property: "transform.scaleX",
          keys: [
            { frame: 0, value: 1 },
            { frame: 23, value: 2, easing: "linear" },
          ],
        },
      ],
    };
    writePreset(camera);
    const cameraErrors = await checkGoldens(root, fixture);
    if (!cameraErrors.some((line) => line.includes("camera-dolly.golden.svg"))) {
      throw new Error("a missing camera golden should fail");
    }
    const cameraFresh = await checkGoldens(root, fixture);
    if (cameraFresh.some((line) => line.includes("differs from the generator"))) {
      throw new Error("a fresh camera write should match");
    }
    if (!cameraFresh.some((line) => line.includes("mark disappears on a light stage"))) {
      throw new Error("a light scene should fail on a light stage");
    }
    const cameraSvg = readFileSync(join(root, "camera", "camera-dolly.golden.svg"), "utf8");
    if ((await renderPresetGolden(camera, fixture)) !== cameraSvg) throw new Error("a fresh camera write should match");
    if (cameraSvg.includes("#abc123") || cameraSvg.includes("960")) throw new Error("a camera golden should use the shared scene");
    const farther = structuredClone(camera);
    farther.parameters = [{ name: "distance", value: 9 }];
    if ((await renderPresetGolden(farther, fixture)) === cameraSvg) throw new Error("camera depth should change the golden");
    const otherScene = structuredClone(fixture);
    otherScene.meshes[0].width = 2.2;
    if ((await renderPresetGolden(artwork, otherScene)) === written) throw new Error("the shared fixture should change the golden");

    const looping = structuredClone(artwork);
    looping.parameters = [...artwork.parameters, { name: "loop", value: true }];
    const loopingTimeline = await presetTimeline(looping, fixture);
    if (loopingTimeline.loop !== true) throw new Error("a loop parameter set to true should set loop");
    const plainTimeline = await presetTimeline(artwork, fixture);
    if (plainTimeline.loop === true) throw new Error("a preset with no loop parameter should not loop");
    const textual = structuredClone(artwork);
    textual.parameters = [...artwork.parameters, { name: "loop", value: "true" }];
    if ((await presetTimeline(textual, fixture)).loop === true) throw new Error("a non-boolean loop value should not loop");
    const numeric = structuredClone(artwork);
    numeric.parameters = [...artwork.parameters, { name: "loop", value: 1 }];
    if ((await presetTimeline(numeric, fixture)).loop === true) throw new Error("a non-boolean loop value should not loop");
    const off = structuredClone(artwork);
    off.parameters = [...artwork.parameters, { name: "loop", value: false }];
    if ((await presetTimeline(off, fixture)).loop === true) throw new Error("a false loop value should not loop");
    const byCategory = structuredClone(artwork);
    byCategory.category = "loop";
    if ((await presetTimeline(byCategory, fixture)).loop === true) throw new Error("a category should not set loop");
    if ((await renderPresetGolden(artwork, fixture)) !== written) throw new Error("a preset without loop should keep its golden");

    const fixtureFaces = (timeline) => timeline.nodes.filter((node) => /^(?:subject|ground)-f\d+$/.test(node.id));
    const artworkFaces = fixtureFaces(plainTimeline);
    if (artworkFaces.length === 0 || artworkFaces.length >= 24) throw new Error("hidden fixture faces should be omitted");
    for (const face of artworkFaces) {
      for (const property of ["attr.d", "attr.fill", "attr.opacity"]) {
        const track = face.tracks.find((item) => item.property === property);
        if (!track || track.keys.length !== 1) throw new Error("a constant fixture track should keep one key");
      }
      const opacity = face.tracks.find((item) => item.property === "attr.opacity");
      if (opacity.keys[0].value === 0) throw new Error("a face that stays at opacity 0 should be omitted");
    }
    const artworkNode = plainTimeline.nodes.find((node) => node.id === "s-soft-rect");
    const artworkOpacity = artworkNode?.tracks.find((track) => track.property === "attr.opacity");
    if (!artworkOpacity || artworkOpacity.keys.length < 2) throw new Error("a changing opacity track should stay");
    const subjectFace = written.match(/<g id="s-subject-f0"[^>]*>[\s\S]*?<\/g>/);
    if (!subjectFace || subjectFace[0].includes("<animate")) throw new Error("a constant subject face should be static");
    if (/id="s-(?:subject|ground)-f\d+"[^>]*\sopacity="0"/.test(written)) {
      throw new Error("a hidden fixture face should be omitted");
    }
    const hiddenScene = structuredClone(artwork);
    hiddenScene.parameters = [...(artwork.parameters ?? []), { name: "scene", value: false }];
    const hiddenTimeline = await presetTimeline(hiddenScene, fixture);
    if (fixtureFaces(hiddenTimeline).length !== 0) throw new Error("scene false should omit the subject and the ground");
    if (!hiddenTimeline.nodes.some((node) => node.id === "s-stage")) throw new Error("scene false should keep the stage");
    const hiddenSvg = await renderPresetGolden(hiddenScene, fixture);
    if (hiddenSvg.includes("s-subject-") || hiddenSvg.includes("s-ground-")) {
      throw new Error("scene false should omit the baked scene");
    }
    const sceneText = structuredClone(artwork);
    sceneText.parameters = [...(artwork.parameters ?? []), { name: "scene", value: "false" }];
    if (fixtureFaces(await presetTimeline(sceneText, fixture)).length === 0) {
      throw new Error("a string false should keep the scene");
    }
    const sceneNumber = structuredClone(artwork);
    sceneNumber.parameters = [...(artwork.parameters ?? []), { name: "scene", value: 0 }];
    if (fixtureFaces(await presetTimeline(sceneNumber, fixture)).length === 0) {
      throw new Error("a non-boolean scene value should keep the scene");
    }
    const sceneOn = structuredClone(artwork);
    sceneOn.parameters = [...(artwork.parameters ?? []), { name: "scene", value: true }];
    if (fixtureFaces(await presetTimeline(sceneOn, fixture)).length === 0) throw new Error("scene true should keep the scene");
    const byScene = structuredClone(artwork);
    byScene.category = "scene";
    if (fixtureFaces(await presetTimeline(byScene, fixture)).length === 0) throw new Error("a category should not omit the scene");
    if ((await renderPresetGolden(artwork, fixture)) !== written) throw new Error("a preset without scene false should keep its golden");
    const heldMotion = {
      schemaVersion: 1,
      schemaRevision: 0,
      id: "motion.hold",
      tracks: [
        { property: "attr.opacity", keys: [{ frame: 0, value: 0 }, { frame: 8, value: 0 }] },
      ],
    };
    const invisible = structuredClone(artwork);
    invisible.motionPreset = heldMotion;
    if ((await presetTimeline(invisible, fixture)).nodes.some((node) => node.id === "s-soft-rect")) {
      throw new Error("an element that stays at opacity 0 should be omitted");
    }
    const veiled = structuredClone(artwork);
    veiled.motionPreset = {
      ...heldMotion,
      tracks: [...heldMotion.tracks, { property: "clip", keys: [{ frame: 0, value: "M 0 0 H 10 V 10 H 0 Z" }] }],
    };
    if (!(await presetTimeline(veiled, fixture)).nodes.some((node) => node.id === "s-soft-rect")) {
      throw new Error("a clip should keep an element that stays at opacity 0");
    }
    const masked = structuredClone(artwork);
    masked.motionPreset = {
      ...heldMotion,
      tracks: [...heldMotion.tracks, { property: "mask", keys: [{ frame: 0, value: "M 0 0 H 10 V 10 H 0 Z" }] }],
    };
    if (!(await presetTimeline(masked, fixture)).nodes.some((node) => node.id === "s-soft-rect")) {
      throw new Error("a mask should keep an element that stays at opacity 0");
    }

    const stuck = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#111" opacity="0"><animate attributeName="opacity" begin="0s" end="1s" calcMode="linear" values="0;1" keyTimes="0;1" fill="freeze"/></rect></svg>`;
    const stuckProblem = await motionProblem(stuck, { fps: 10, duration: 10, requireMotion: true });
    if (!stuckProblem) throw new Error("a golden without dur that stays on the first value should fail");
    if (stuckProblem.includes("rendered before") || stuckProblem.includes("skip")) {
      throw new Error("a golden without dur was skipped");
    }
    const cssOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><style>#mover { animation-name: slide; animation-duration: 1s; animation-timing-function: linear; animation-fill-mode: both; } @keyframes slide { from { transform: translate(0px, 0px); } to { transform: translate(40px, 0px); } }</style><rect id="mover" x="0" y="0" width="20" height="20" fill="#111"/></svg>`;
    if (!isCssOnly(cssOnly)) throw new Error("a CSS-only golden should be non-static");
    const cssProblem = await motionProblem(cssOnly, { fps: 10, duration: 10, requireMotion: true });
    if (cssProblem) throw new Error(`a CSS-only golden should move: ${cssProblem}`);
    const shifted = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><clipPath id="gate" clipPathUnits="userSpaceOnUse"><path d="M 0 0 H 40 V 40 H 0 Z"/></clipPath></defs><style>#box { clip-path: inset(12px); }</style><rect id="box" x="0" y="0" width="80" height="80" fill="#111" clip-path="url(#gate)"/></svg>`;
    const shiftProblem = await motionProblem(shifted, { fps: 10, duration: 2, requireMotion: false });
    if (shiftProblem !== "clip shifted when CSS applies") throw new Error("a clip shifted by CSS should fail");
    const reference = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><clipPath id="gate" clipPathUnits="userSpaceOnUse"><path d="M 0 0 H 40 V 40 H 0 Z"/></clipPath></defs><style>#box { clip-path: path("M 0 0 H 40 V 40 H 0 Z"); }</style><rect id="box" x="32" y="32" width="80" height="80" fill="#111111" clip-path="url(#gate)"/></svg>`;
    const referenceProblem = await motionProblem(reference, { fps: 10, duration: 2, requireMotion: false });
    if (referenceProblem !== "clip shifted when CSS applies") {
      throw new Error("a path clip shifted by the reference box should fail");
    }
    const aligned = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><clipPath id="gate" clipPathUnits="userSpaceOnUse"><path d="M 0 0 H 40 V 40 H 0 Z"/></clipPath></defs><style>#box { clip-path: path("M 0 0 H 40 V 40 H 0 Z"); }</style><rect id="box" x="0" y="0" width="80" height="80" fill="#111111" clip-path="url(#gate)"/></svg>`;
    if (await motionProblem(aligned, { fps: 10, duration: 2, requireMotion: false })) {
      throw new Error("a path clip on the element origin should pass");
    }
    const held = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><clipPath id="gate" clipPathUnits="userSpaceOnUse"><path d="M 0 0 H 40 V 40 H 0 Z"/></clipPath></defs><rect id="box" x="0" y="0" width="80" height="80" fill="#111" clip-path="url(#gate)"/></svg>`;
    if (await motionProblem(held, { fps: 10, duration: 2, requireMotion: false })) {
      throw new Error("a markup clip should pass while CSS is active");
    }
    const early = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="0" y="10" width="20" height="20" fill="#111111"><animate attributeName="x" begin="0s" dur="0.2s" calcMode="linear" values="0;40" keyTimes="0;1" fill="freeze"/></rect></svg>`;
    const earlyProblem = await motionProblem(early, { fps: 10, duration: 10, requireMotion: true });
    if (earlyProblem !== "mid frame matches the last frame") {
      throw new Error(`a SMIL document that finishes before the mid frame should fail: ${earlyProblem}`);
    }
    const moving = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="0" y="10" width="20" height="20" fill="#111111"><animate attributeName="x" begin="0s" dur="1s" calcMode="linear" values="0;40" keyTimes="0;1" fill="freeze"/></rect></svg>`;
    const movingProblem = await motionProblem(moving, { fps: 10, duration: 10, requireMotion: true });
    if (movingProblem) throw new Error(`a SMIL document that is still moving at the mid frame should pass: ${movingProblem}`);
    const white = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><g id="s-stage" fill="#141414"><path d="M 0 0 H 80 V 40 H 0 Z"/></g><rect x="10" y="10" width="30" height="20" fill="#ffffff"/></svg>`;
    const whiteProblem = await motionProblem(white, { fps: 10, duration: 2, requireMotion: false });
    if (whiteProblem !== "mark disappears on a light stage") {
      throw new Error(`a white mark should fail on a light stage: ${whiteProblem}`);
    }
    const dark = white.replace("#ffffff", "#111111");
    if (await motionProblem(dark, { fps: 10, duration: 2, requireMotion: false })) {
      throw new Error("a dark mark should pass on a light stage");
    }

    const motionDocument = (id, tracks, extra = {}) => {
      const document = structuredClone(sample);
      document.id = id;
      document.component.id = extra.componentId ?? document.component.id;
      if (extra.category) document.category = extra.category;
      if (extra.parameters) document.parameters = extra.parameters;
      if (extra.fill) document.component.copied.fill = extra.fill;
      if (extra.stroke) document.component.copied.stroke = extra.stroke;
      if (extra.strokeWidth !== undefined) document.component.copied.strokeWidth = extra.strokeWidth;
      document.motionPreset = { schemaVersion: 1, schemaRevision: 0, id: `motion.${id}`, tracks };
      return document;
    };
    const travel = (easing) => [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 24, value: 100, easing },
        ],
      },
    ];
    const steep = motionDocument("steep-ease", travel("cubic-bezier(0.22, 1, 0.36, 1)"));
    if (!(await bandProblem(steep, fixture)).includes("25 to 75")) {
      throw new Error("a steep ease past 75 percent at the mid frame should fail");
    }
    const fallId = loadMotionClass().fall.find((id) => !loadMotionClass().ambient.includes(id));
    const fall = motionDocument("fall-ease", travel("cubic-bezier(0.55, 0, 1, 0.45)"), { componentId: fallId });
    if (await bandProblem(fall, fixture)) throw new Error("a fall on the ease-in curve should pass");
    const steepFall = motionDocument("fall-steep", travel("cubic-bezier(0.22, 1, 0.36, 1)"), { componentId: fallId });
    if (!(await bandProblem(steepFall, fixture)).includes("75")) throw new Error("a fall past 75 percent should fail");
    const beat = motionDocument("beat-hit", [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 3, value: 40, easing: "linear" },
          { frame: 8, value: 0, easing: "linear" },
          { frame: 24, value: 0, easing: "hold" },
        ],
      },
    ], { componentId: "camera.shake" });
    if (await bandProblem(beat, fixture)) throw new Error("a beat that peaks early should pass");
    const fadeThenMove = motionDocument("fade-then-move", [
      { property: "attr.opacity", keys: [{ frame: 0, value: 0 }, { frame: 3, value: 1, easing: "linear" }] },
      { property: "transform.translateX", keys: [{ frame: 0, value: 0 }, { frame: 24, value: 100, easing: "linear" }] },
    ]);
    if (await bandProblem(fadeThenMove, fixture)) {
      throw new Error("a short opacity fade should not set the band");
    }
    const crossfade = motionDocument("crossfade-band", [
      {
        property: "attr.opacity",
        keys: [
          { frame: 0, value: 1 },
          { frame: 18, value: 1 },
          { frame: 24, value: 0, easing: "linear" },
        ],
      },
      {
        property: "attr.opacity",
        keys: [
          { frame: 0, value: 0 },
          { frame: 24, value: 1, easing: "linear" },
        ],
      },
    ]);
    if (await bandProblem(crossfade, fixture)) {
      throw new Error("equal opacity tracks should measure the rising track");
    }
    const pathPeak = motionDocument("path-peak", [
      {
        property: "attr.d",
        keys: [
          { frame: 0, value: "M 0 0 H 10 V 10 H 0 Z" },
          { frame: 4, value: "M 2 0 H 12 V 10 H 2 Z" },
          { frame: 9, value: "M 0 0 H 40 V 10 H 0 Z" },
        ],
      },
    ]);
    if (peakFrame(pathPeak, timelineDuration(fixture, motionTracks(pathPeak), pathPeak)) !== 9) {
      throw new Error("a path peaks at the frame whose box moves most");
    }
    const matrixPeak = motionDocument("matrix-peak", [
      {
        property: "transform.matrix",
        keys: [
          { frame: 0, value: [1, 0, 0, 1, 0, 0] },
          { frame: 4, value: [1.5, 0, 0, 1, 0, 0] },
          { frame: 8, value: [1, 0, 0, 1, 10, 0] },
        ],
      },
    ]);
    matrixPeak.component.copied.shape.d = "M 0 0 H 100 V 10 H 0 Z";
    if (peakFrame(matrixPeak, timelineDuration(fixture, motionTracks(matrixPeak), matrixPeak)) !== 4) {
      throw new Error("a matrix peaks at the frame whose box moves most");
    }
    const tied = motionDocument("tied-peak", [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 4, value: 10 },
        ],
      },
      {
        property: "attr.d",
        keys: [
          { frame: 0, value: "M 0 0 H 10 V 10 H 0 Z" },
          { frame: 8, value: "M 0 0 H 20 V 10 H 0 Z" },
        ],
      },
    ]);
    if (peakFrame(tied, 12) !== 4) throw new Error("an equal numeric and geometric delta keeps the earlier frame");
    if (peakFrame(pathPeak, 5) !== 4) throw new Error("a peak past the rendered frames stays on the last rendered frame");
    const zoomDoc = readDocument(join(repoRoot, "presets/transitions/trans-zoom.json"));
    if (await bandProblem(zoomDoc, fixture)) throw new Error("trans-zoom should be measured on the path, not the opacity fade");
    if (ambientLoopProblem(beat)) throw new Error("camera.shake should not require loop");
    const ambientId = loadMotionClass().ambient.find((id) => id.startsWith("bg."));
    const ambient = motionDocument("ambient-hold", travel("linear"), { componentId: ambientId });
    if (ambientLoopProblem(ambient) !== "ambient preset has no loop parameter") {
      throw new Error("an ambient preset with no loop parameter should fail");
    }
    if (!ambientKeysDiffer(ambient)) throw new Error("an ambient preset whose first and last keys differ should fail");

    const faceNodes = (timeline) => timeline.nodes.filter((node) => /^(?:subject|ground)-f\d+$/.test(node.id));
    const dataviz = structuredClone(sample);
    dataviz.category = "dataviz";
    dataviz.id = "viz-band";
    if (faceNodes(await presetTimeline(dataviz, fixture)).length !== 0) throw new Error("a dataviz preset should omit the fixture");
    const datavizOn = structuredClone(dataviz);
    datavizOn.parameters = [...dataviz.parameters, { name: "scene", value: true }];
    if (faceNodes(await presetTimeline(datavizOn, fixture)).length === 0) {
      throw new Error("scene true should keep the fixture in the generator");
    }
    const painted = `<svg xmlns="http://www.w3.org/2000/svg"><g id="s-subject-f0"></g></svg>`;
    if (!sceneFaceProblem(dataviz, painted).includes("subject-f")) {
      throw new Error("a dataviz golden that still contains subject-f should fail");
    }
    if (sceneFaceProblem(datavizOn, painted).includes("subject-f") !== true) {
      throw new Error("scene true should not waive the subject check");
    }
    if (sceneFaceProblem(dataviz, "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")) {
      throw new Error("a dataviz golden that omits the fixture should pass");
    }
    const backgrounds = structuredClone(sample);
    backgrounds.category = "backgrounds";
    if (sceneFaceProblem(backgrounds, "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>") !== "backgrounds golden drops subject-f") {
      throw new Error("a backgrounds golden that drops subject-f should fail");
    }
    const fullBleed = (id, fill, opacity) => {
      const opacityAttr = opacity === undefined ? "" : ` opacity="${opacity}"`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><g id="s-stage" fill="#141414"><path d="M 0 0 H 320 V 180 H 0 Z"/></g><g id="s-${id}" fill="${fill}"${opacityAttr}><rect x="0" y="0" width="320" height="180"/></g></svg>`;
    };
    const solidBg = structuredClone(sample);
    solidBg.category = "backgrounds";
    solidBg.id = "bg-solid";
    solidBg.component.id = "bg.solid";
    const patternBg = structuredClone(sample);
    patternBg.category = "backgrounds";
    patternBg.id = "bg-dots";
    patternBg.component.id = "bg.dots";
    if (backgroundBleedProblem(patternBg, fullBleed("bg-dots", "#f4efe4")) !== "pattern paints an opaque full-bleed") {
      throw new Error("a pattern background that paints an opaque full-bleed rect should fail");
    }
    const patternPath = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><g id="s-bg-dots" fill="#f4efe4"><path d="M 0 0 H 320 V 180 H 0 Z"/></g></svg>`;
    if (backgroundBleedProblem(patternBg, patternPath) !== "pattern paints an opaque full-bleed") {
      throw new Error("a pattern background that paints an opaque full-bleed path should fail");
    }
    if (backgroundBleedProblem(solidBg, fullBleed("bg-solid", "#f4efe4"))) {
      throw new Error("bg.solid should pass an opaque full-bleed rect");
    }
    if (backgroundBleedProblem(patternBg, fullBleed("bg-dots", "#f4efe4", 0.12))) {
      throw new Error("a pattern at opacity 0.12 should pass");
    }
    if (backgroundBleedProblem(patternBg, fullBleed("bg-dots", "#f4efe4", 0.3))) {
      throw new Error("a pattern at opacity 0.3 should pass");
    }
    if (backgroundBleedProblem(patternBg, fullBleed("bg-dots", "#1f1f1f"))) {
      throw new Error("a pattern ink of #1f1f1f should pass");
    }
    if (backgroundBleedProblem(patternBg, fullBleed("bg-dots", "#2a2a2a"))) {
      throw new Error("a pattern ink of #2a2a2a should pass");
    }
    if (backgroundBleedProblem(patternBg, fullBleed("bg-dots", "#1e1e1e")) !== "pattern paints an opaque full-bleed") {
      throw new Error("a pattern ink darker than #1f1f1f should fail");
    }
    const insetPattern = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><g id="s-bg-dots" fill="#f4efe4"><rect x="56" y="32" width="208" height="116"/></g></svg>`;
    if (backgroundBleedProblem(patternBg, insetPattern)) throw new Error("an inset pattern should pass");
    if (backgroundOrderProblem(patternBg, ["s-stage", "subject-f0", "ground-f0", "s-bg-dots"]) !== "backgrounds group is after the subject") {
      throw new Error("a backgrounds timeline whose preset group is after the subject should fail");
    }
    if (backgroundOrderProblem(patternBg, ["s-stage", "s-subject-f0", "s-ground-f0", "s-bg-dots"]) !== "backgrounds group is after the subject") {
      throw new Error("a backgrounds document whose preset group is after the subject should fail");
    }
    if (sceneOmitted(solidBg)) throw new Error("backgrounds should not default scene to false");
    const ordered = (await presetTimeline(solidBg, fixture)).nodes.map((node) => node.id);
    const stageAt = ordered.indexOf("s-stage");
    const artAt = ordered.indexOf("s-bg-solid");
    const subjectAt = ordered.findIndex((id) => id === "subject" || id.startsWith("subject-") || id.startsWith("s-subject"));
    const groundAt = ordered.findIndex((id) => id === "ground" || id.startsWith("ground-") || id.startsWith("s-ground"));
    if (
      backgroundOrderProblem(solidBg, ordered) ||
      artAt !== stageAt + 1 ||
      subjectAt < 0 ||
      artAt > subjectAt ||
      groundAt < 0 ||
      artAt > groundAt
    ) {
      throw new Error(`a backgrounds group should sit between the stage and the subject: ${ordered.join(" ")}`);
    }
    const compiled = await renderPresetGolden(solidBg, fixture);
    if (backgroundOrderProblem(solidBg, svgGroupIds(compiled))) {
      throw new Error("renderPresetGolden should compile the backgrounds group before the subject");
    }
    const plainIds = (await presetTimeline(sample, fixture)).nodes.map((node) => node.id);
    const plainArt = plainIds.indexOf("s-soft-rect");
    const plainSubject = plainIds.findIndex((id) => id === "subject" || id.startsWith("subject-") || id.startsWith("s-subject"));
    if (plainArt < 0 || plainSubject < 0 || plainArt < plainSubject) {
      throw new Error("other categories should keep the preset group after the subject");
    }
    const creatures = structuredClone(sample);
    creatures.category = "creatures";
    if (!sceneFaceProblem(creatures, painted).includes("subject-f")) {
      throw new Error("a creatures golden that still contains subject-f should fail");
    }
    const audio = structuredClone(sample);
    audio.category = "audio";
    if (!sceneFaceProblem(audio, painted).includes("subject-f")) {
      throw new Error("an audio golden that still contains subject-f should fail");
    }
    const atmosphere = structuredClone(sample);
    atmosphere.component.id = loadMotionClass().sceneOff.ids[0];
    if (faceNodes(await presetTimeline(atmosphere, fixture)).length !== 0) {
      throw new Error("a marked atmosphere preset should omit the fixture");
    }
    const hiddenFace = `<svg xmlns="http://www.w3.org/2000/svg"><g id="s-subject-f2" opacity="0"><path d="M 0 0 H 4 V 4 H 0 Z"/></g></svg>`;
    if (!hiddenFixtureFaceProblem(hiddenFace)) throw new Error("a fixture face at opacity 0 should fail");
    if (hiddenFixtureFaceProblem(painted)) throw new Error("a visible fixture face should pass the opacity check");

    const polygon = (count) => {
      const parts = [];
      for (let index = 0; index < count; index += 1) {
        const angle = (2 * Math.PI * index) / count;
        parts.push(`${index === 0 ? "M" : "L"} ${(16 * Math.cos(angle)).toFixed(4)} ${(16 * Math.sin(angle)).toFixed(4)}`);
      }
      return `<svg xmlns="http://www.w3.org/2000/svg"><path d="${parts.join(" ")} Z"/></svg>`;
    };
    if (!chordSagProblem(polygon(8))) throw new Error("a radius-16 circle drawn with 8 chords should fail");
    if (chordSagProblem(polygon(24))) throw new Error("a radius-16 circle drawn with 24 chords should pass");
    if (chordSagProblem(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M 16 0 A 16 16 0 1 1 15.9 0.1"/></svg>`)) {
      throw new Error("an arc command should pass");
    }
    if (chordSagProblem(`<svg xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16"/></svg>`)) {
      throw new Error("a circle element should pass");
    }

    const bulky = `<svg xmlns="http://www.w3.org/2000/svg">${"<!-- pad -->".repeat(2000)}</svg>`;
    if (Buffer.byteLength(bulky) <= 16 * 1024) throw new Error("the size fixture should be over 16 KB");
    if (!sizeProblem(sample, bulky).includes("16 KB")) throw new Error("a golden over 16 KB with no sizeReason should fail");
    const reasoned = structuredClone(sample);
    reasoned.parameters = [...sample.parameters, { name: "sizeReason", value: "baked mesh faces" }];
    if (sizeProblem(reasoned, bulky)) throw new Error("a golden that declares a reason should pass");

    const creatureFill = (fill, stroke, strokeWidth) => {
      const document = structuredClone(sample);
      document.category = "creatures";
      document.component.copied.fill = fill;
      if (stroke) document.component.copied.stroke = stroke;
      if (strokeWidth !== undefined) document.component.copied.strokeWidth = strokeWidth;
      return document;
    };
    if (!contrastProblem(creatureFill("#ffffff"))) throw new Error("a creature fill that misses 3:1 should fail");
    if (contrastProblem(creatureFill("#6c6c6c"))) throw new Error("a luminance in the 0.11 to 0.27 band should pass");
    if (contrastProblem(creatureFill("#ffffff", "#111111", 2))) throw new Error("a 2 px dark outline should pass");
    for (const fill of loadMotionClass().contrast.audioFills) {
      const document = structuredClone(sample);
      document.category = "audio";
      document.component.copied.fill = fill;
      if (contrastProblem(document)) throw new Error("an audio fill on both pages should pass");
    }

    const tempo = (frame) => motionDocument("tempo-loop", [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame, value: 10, easing: "linear" },
        ],
      },
    ], {
      parameters: [...sample.parameters, { name: "loop", value: true }, { name: "bpm", value: 75 }],
    });
    if (!tempoProblem(tempo(30), fixture)) throw new Error("a 75 bpm loop whose cycle is not a whole number of beats should fail");
    if (tempoProblem(tempo(24), fixture)) throw new Error("75 bpm on 24 frames at 30 fps should be one beat");
    if (timelineDuration(fixture, motionTracks(tempo(24)), tempo(24)) !== 24) {
      throw new Error("a looping timeline should end on its last key");
    }
    if (timelineDuration(fixture, motionTracks(tempo(23)), tempo(23)) !== 23) {
      throw new Error("a looping timeline should not add a frame past the last key");
    }
    const once = tempo(24);
    once.parameters = once.parameters.filter((parameter) => parameter.name !== "loop");
    if (timelineDuration(fixture, motionTracks(once), once) !== 25) {
      throw new Error("a timeline that does not loop still includes its last key");
    }
    const paced = motionDocument("paced-loop", [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 24, value: 48, easing: "linear" },
        ],
      },
    ], {
      parameters: [...sample.parameters, { name: "loop", value: true }],
    });
    const pacedSvg = await renderPresetGolden(paced, fixture);
    const durations = [...pacedSvg.matchAll(/\sdur="([^"]+)"/g)].map((match) => match[1]);
    if (durations.length === 0 || durations.some((value) => value !== "0.8s")) {
      throw new Error(`a last key at frame 24 should emit dur of 0.8s: ${durations.join(" ")}`);
    }
    const wrapped = motionDocument("wrap-boundary", [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 15, value: 20, easing: "linear" },
          { frame: 30, value: 0, easing: "linear" },
        ],
      },
    ], {
      parameters: [...sample.parameters, { name: "loop", value: true }],
    });
    if (timelineDuration(fixture, motionTracks(wrapped), wrapped) !== 30) {
      throw new Error("a wrap key at frame 30 is the duration");
    }
    const wrappedTimeline = await presetTimeline(wrapped, fixture);
    if (wrappedTimeline.durationInFrames !== 30) throw new Error("frame 30 is not a rendered frame");
    const wrapKey = wrappedTimeline.nodes.some((node) => (node.tracks ?? []).some((track) => (
      (track.keys ?? []).some((key) => key.frame === 30)
    )));
    if (!wrapKey) throw new Error("the wrap key should stay at frame 30");
    const wrappedSvg = await renderPresetGolden(wrapped, fixture);
    const wrappedDurations = [...wrappedSvg.matchAll(/\sdur="([^"]+)"/g)].map((match) => match[1]);
    if (wrappedDurations.length === 0 || wrappedDurations.some((value) => value !== "1s")) {
      throw new Error(`a wrap key at frame 30 should emit dur of 1s: ${wrappedDurations.join(" ")}`);
    }
    const swung = motionDocument("limb-swing", [
      {
        property: "transform.rotate",
        keys: [
          { frame: 0, value: 0 },
          { frame: 6, value: 45 },
        ],
      },
    ]);
    if (!limbProblem(swung).includes("30")) throw new Error("a limb rotate whose keys jump more than 30 degrees should fail");
    const redrawn = motionDocument("limb-redraw", [
      {
        property: "attr.d",
        keys: [
          { frame: 0, value: "M 0 0 L 20 0" },
          { frame: 6, value: "M 0 0 L 0 20" },
        ],
      },
    ]);
    if (!limbProblem(redrawn).includes("vertices")) throw new Error("a limb drawn by translating its vertices should fail");

    const reveal = (frame) => motionDocument("reveal-clip", [
      {
        property: "clip",
        keys: [
          { frame: 0, value: "M 0 0 H 10 V 10 H 0 Z" },
          { frame, value: "M 0 0 H 80 V 80 H 0 Z", easing: "linear" },
        ],
      },
    ]);
    if (!(await revealProblem(reveal(8), fixture)).includes("75")) {
      throw new Error("a reveal that matches the end path before 75 percent should fail");
    }
    if (await revealProblem(reveal(20), fixture)) throw new Error("a reveal that matches only in the last quarter should pass");
    const sameCoverage = motionDocument("reveal-same-coverage", [
      {
        property: "clip",
        keys: [
          { frame: 0, value: "M 0 0 H 80 V 80 H 0 Z" },
          { frame: 20, value: "M 0 0 H 80 V 80 H 0 Z M 10 10 H 20 V 20 H 10 Z", easing: "linear" },
        ],
      },
    ]);
    if (!(await revealProblem(sameCoverage, fixture)).includes("75")) {
      throw new Error("a clip whose coverage already matches the end should fail even when the path string differs");
    }

    const shakeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><rect x="10" y="10" width="20" height="20" fill="#111111"><animate attributeName="x" begin="0s" dur="0.8s" calcMode="linear" values="10;10;36;10;10" keyTimes="0;0.18;0.233333;0.3;1" fill="freeze"/></rect></svg>`;
    const shakePass = await motionProblem(shakeSvg, { fps: 30, duration: 24, requireMotion: true, beat: true, peakFrame: 7 });
    if (shakePass) throw new Error(`camera.shake should pass when the peak moves and the ends rest: ${shakePass}`);
    const entrancePass = await motionProblem(moving, { fps: 10, duration: 10, requireMotion: true, entrance: true });
    if (entrancePass) throw new Error(`an entrance whose mid frame travels should pass: ${entrancePass}`);
    const entranceFail = await motionProblem(early, { fps: 10, duration: 10, requireMotion: true, entrance: true });
    if (entranceFail !== "entrance mid frame is within 2 px of the last frame") {
      throw new Error(`an entrance that has already settled should fail: ${entranceFail}`);
    }
    const restSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><rect x="10" y="10" width="16" height="16" fill="#111111"><animate attributeName="x" begin="0s" dur="1s" calcMode="linear" values="10;10;40;40;10;10" keyTimes="0;0.2;0.35;0.55;0.8;1" fill="freeze"/></rect></svg>`;
    const restPass = await motionProblem(restSvg, { fps: 10, duration: 10, requireMotion: true, rest: true });
    if (restPass) throw new Error(`a non-beat that starts and ends at rest should pass: ${restPass}`);
    const restFail = await motionProblem(restSvg, { fps: 10, duration: 10, requireMotion: true });
    if (restFail !== "last frame does not move when CSS is active") {
      throw new Error(`a rest-to-rest sample should still report the last frame without the exemption: ${restFail}`);
    }
    const shakeStill = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><rect x="10" y="10" width="20" height="20" fill="#111111"/></svg>`;
    const shakeFail = await motionProblem(shakeStill, { fps: 30, duration: 24, requireMotion: true, beat: true, peakFrame: 7 });
    if (shakeFail !== "peak frame matches frame 0") throw new Error(`a shake whose pixels never change should fail: ${shakeFail}`);

    const sameWind = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path id="s-mark-ink" fill="#111111" d="M 2 2 H 30 V 30 H 2 Z M 10 10 H 20 V 20 H 10 Z"/></svg>`;
    const oppositeWind = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path id="s-mark-ink" fill="#111111" d="M 2 2 H 30 V 30 H 2 Z M 10 10 V 20 H 20 V 10 Z"/></svg>`;
    if ((await inkOverlapProblem(sameWind)) !== "ink subpath does not paint") {
      throw new Error("a same-direction ink subpath should fail");
    }
    if (await inkOverlapProblem(oppositeWind)) throw new Error("an opposite-direction ink subpath should paint");
    // H-127 recorded 14616. A 2x seek of the committed golden measures 12608.
    const seeked = [
      ["presets/pathfx/filter-drop-shadow.golden.svg", 12608],
      ["presets/transitions/trans-wipe.golden.svg", 47104],
      ["presets/transitions/trans-iris.golden.svg", 78409],
      ["presets/transitions/trans-mask-reveal.golden.svg", 79844],
    ];
    const browser = await openBrowser();
    for (const [file, expected] of seeked) {
      const svg = readFileSync(join(repoRoot, file), "utf8");
      const problem = await motionProblem(svg, { fps: 30, duration: 25, requireMotion: true });
      if (typeof problem === "string" && problem.includes("does not move")) {
        throw new Error(`${file} should move in the SMIL raster: ${problem}`);
      }
      const [first, later] = await browser.paintAt(svg, 30, [0, 12]);
      const count = pixelChangeCount(first, later);
      if (Math.abs(count - expected) > 15) throw new Error(`${file} frame 0 and frame 12 differ by ${count} px at 2x`);
    }
    const clip = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><defs><clipPath id="gate" clipPathUnits="userSpaceOnUse"><path d="M 0 0 H 8 V 40 H 0 Z"><animate attributeName="d" begin="0s" dur="1s" calcMode="linear" values="M 0 0 H 8 V 40 H 0 Z;M 0 0 H 70 V 40 H 0 Z" keyTimes="0;1" fill="freeze"/></path></clipPath></defs><rect x="0" y="0" width="80" height="40" fill="#111111" clip-path="url(#gate)"/></svg>`;
    const clipShots = await browser.sample(clip, 10, 10);
    if (clipShots.mid.signature !== clipShots.frame0.signature) throw new Error("a SMIL clip signature should stay put");
    if (paintsMatch(clipShots.mid.paint, clipShots.frame0.paint) || paintsMatch(clipShots.mid.paint, clipShots.last.paint)) {
      throw new Error("a SMIL clip should move pixels");
    }
    const clipProblem = await motionProblem(clip, { fps: 10, duration: 10, requireMotion: true });
    if (clipProblem) throw new Error(`a SMIL clip whose pixels move should pass: ${clipProblem}`);
    const stillClip = clip.replace("M 0 0 H 70 V 40 H 0 Z", "M 0 0 H 8 V 40 H 0 Z");
    const stillProblem = await motionProblem(stillClip, { fps: 10, duration: 10, requireMotion: true });
    if (!stillProblem) throw new Error("a SMIL clip whose pixels stay put should fail");

    const drift = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><g><animateTransform attributeName="transform" type="translate" dur="0.8s" repeatCount="indefinite" values="0 0;-40 0" keyTimes="0;1" calcMode="linear"/><rect x="0" y="0" width="20" height="20" fill="#111111"/><rect x="20" y="0" width="20" height="20" fill="#333333"/><rect x="40" y="0" width="20" height="20" fill="#111111"/><rect x="60" y="0" width="20" height="20" fill="#333333"/></g></svg>`;
    const driftReport = {};
    const driftProblem = await motionProblem(drift, { fps: 10, duration: 8, requireMotion: false, wrap: true, report: driftReport });
    if (driftProblem || !driftReport.wrapHeld) throw new Error(`a one-period drift whose pixels wrap should pass: ${driftProblem}`);
    const frozenDrift = drift.replace(' repeatCount="indefinite"', ' fill="freeze"');
    const frozenReport = {};
    const frozenProblem = await motionProblem(frozenDrift, { fps: 10, duration: 8, requireMotion: false, wrap: true, report: frozenReport });
    if (frozenProblem !== "loop sample at dur + 0.1s differs from 0.1s") {
      throw new Error(`a looping sample at dur + 0.1s that differs should fail: ${frozenProblem}`);
    }
    const slide = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="0" y="8" width="18" height="18" fill="#111111"><animate attributeName="x" dur="0.8s" fill="freeze" calcMode="linear" values="0;28" keyTimes="0;1"/></rect></svg>`;
    const slideProblem = await motionProblem(slide, { fps: 10, duration: 8, requireMotion: false, wrap: true });
    if (slideProblem !== "frame after the last frame differs from frame 0") {
      throw new Error(`an ambient background whose frame after the last frame differs should fail: ${slideProblem}`);
    }

    const term = "glyph-deny-fixture";
    const glyphSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="#111111"/><text x="4" y="24" fill="#f4f4f2" font-size="16">${term}</text></svg>`;
    const savedRequire = process.env.SVGIF_REQUIRE_DENY_TERMS;
    const savedTerms = process.env.SVGIF_DENY_TERMS;
    try {
      delete process.env.SVGIF_REQUIRE_DENY_TERMS;
      process.env.SVGIF_DENY_TERMS = `${term}\n`;
      const skipped = await motionProblem(glyphSvg, { fps: 10, duration: 2, requireMotion: false, text: true });
      if (typeof skipped === "string" && (skipped.includes("denied") || skipped.includes("not set"))) {
        throw new Error("glyph lint should skip when the flag is unset");
      }
      process.env.SVGIF_REQUIRE_DENY_TERMS = "true";
      process.env.SVGIF_DENY_TERMS = " \n";
      const closed = await motionProblem(glyphSvg, { fps: 10, duration: 2, requireMotion: false, text: true });
      if (closed !== "SVGIF_DENY_TERMS is not set") throw new Error("an empty deny list should fail closed");
      process.env.SVGIF_DENY_TERMS = term;
      const matched = await motionProblem(glyphSvg, { fps: 10, duration: 2, requireMotion: false, text: true });
      if (matched !== "glyph swap matched a denied term") throw new Error("a glyph-swap frame with a denied term should fail");
      if (matched.includes(term)) throw new Error("a glyph-swap failure should not print the term");
    } finally {
      if (savedRequire === undefined) delete process.env.SVGIF_REQUIRE_DENY_TERMS;
      else process.env.SVGIF_REQUIRE_DENY_TERMS = savedRequire;
      if (savedTerms === undefined) delete process.env.SVGIF_DENY_TERMS;
      else process.env.SVGIF_DENY_TERMS = savedTerms;
    }
  } finally {
    await closeBrowser();
    rmSync(root, { recursive: true, force: true });
  }
  console.log("preset goldens self-test ok");
}

function assertValidPreset(document) {
  const errors = validateContract("preset", document);
  if (errors.length > 0) throw new Error(errors.join("; "));
}

function groupBlock(svg, id) {
  const lines = svg.split("\n");
  const start = lines.findIndex((line) => groupOpens(line, id));
  if (start < 0) return "";
  let end = start;
  if (!lines[start].endsWith("/>")) {
    end = start + 1;
    while (end < lines.length && lines[end] !== "  </g>") end += 1;
  }
  return lines.slice(start, end + 1).join("\n");
}

/**
 * Ink and stroke width land in the compiled SVG. Two layers keep their own
 * opacity tracks and stay in list order. [[sot:svgif/preset-registry]]
 */
async function inkLayerSelfTest() {
  const fixture = readDocument(DEMO_SCENE);
  const sample = readDocument(join(repoRoot, "schema/fixtures/preset/v1-valid.json"));
  const inked = structuredClone(sample);
  inked.id = "ink-outline";
  inked.component.copied.stroke = "#141414";
  inked.component.copied.strokeWidth = 1.5;
  inked.component.copied.ink = { d: "M 10 10 H 40 V 40 H 10 Z", fill: "#141414" };
  assertValidPreset(inked);
  const svg = await renderPresetGolden(inked, fixture);
  const wrapper = groupBlock(svg, "s-ink-outline");
  if (!wrapper.includes('stroke-width="1.5"')) throw new Error("stroke width 1.5 should reach the compiled SVG");
  if (!wrapper.includes('fill="#1c1c1c"') || !wrapper.includes('stroke="#141414"')) {
    throw new Error("the body should keep fill and stroke");
  }
  const ink = wrapper.match(/<path id="s-ink-outline-ink"[^>]*\/>/);
  if (!ink) throw new Error("the ink path should reach the compiled SVG");
  if (!ink[0].includes('d="M 10 10 H 40 V 40 H 10 Z"') || !ink[0].includes('fill="#141414"') || !ink[0].includes('stroke="none"')) {
    throw new Error("the ink path should keep its fill and no stroke");
  }
  const body = wrapper.match(/<path id="s-ink-outline-shape"[^>]*\/>/);
  if (!body) throw new Error("the body path should stay in the wrapper");
  const children = wrapper.split("\n").filter((line) => line.startsWith("    <"));
  if (children.length !== 2 || !children[1].includes("s-ink-outline-ink")) {
    throw new Error("the ink path should be the second child of the same wrapper");
  }
  const moved = structuredClone(inked);
  moved.motionPreset = {
    schemaVersion: 1,
    schemaRevision: 0,
    id: "motion.slide",
    tracks: [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 12, value: 24, easing: "linear" },
        ],
      },
    ],
  };
  assertValidPreset(moved);
  const movedSvg = await renderPresetGolden(moved, fixture);
  const movedWrapper = groupBlock(movedSvg, "s-ink-outline");
  const open = movedWrapper.split("\n")[0];
  if (!open.includes("transform=")) throw new Error("the wrapper transform should cover the ink path");
  if (movedWrapper.match(/<path id="s-ink-outline-ink"[^>]*\/>/)?.[0].includes("transform=")) {
    throw new Error("the ink path should use the wrapper transform");
  }

  const plain = await presetTimeline(sample, fixture);
  if (plain.nodes.filter((node) => node.id.startsWith("s-soft-rect")).length !== 1) {
    throw new Error("a preset with no layer list should stay one node");
  }
  if ((await renderPresetGolden(sample, fixture)).includes("stroke-width=")) {
    throw new Error("absent stroke width should not be written");
  }

  const layered = structuredClone(sample);
  layered.id = "crossfade-layers";
  layered.component.copied.strokeWidth = 1.5;
  layered.component.copied.ink = { d: "M 1 1 H 8 V 8 H 1 Z", fill: "#141414" };
  layered.component.copied.layers = [
    { id: "from", shape: { form: "rect", width: 80, height: 40 }, fill: "#111111", stroke: "#141414", opacity: 1 },
    { id: "to", shape: { form: "rect", width: 100, height: 50 }, fill: "#333333", opacity: 1 },
  ];
  layered.motionPreset = {
    schemaVersion: 1,
    schemaRevision: 0,
    id: "motion.crossfade",
    tracks: [
      {
        property: "attr.opacity",
        layer: "from",
        keys: [
          { frame: 0, value: 1 },
          { frame: 12, value: 0.2, easing: "linear" },
        ],
      },
      {
        property: "attr.opacity",
        layer: "to",
        keys: [
          { frame: 0, value: 0.2 },
          { frame: 12, value: 1, easing: "linear" },
        ],
      },
    ],
  };
  assertValidPreset(layered);
  const timeline = await presetTimeline(layered, fixture);
  const ids = timeline.nodes.map((node) => node.id);
  const fromAt = ids.indexOf("s-crossfade-layers");
  const toAt = ids.indexOf("s-crossfade-layers-to");
  if (fromAt < 0 || toAt < 0 || fromAt > toAt) throw new Error("layers should appear in list order");
  const fromOpacity = timeline.nodes[fromAt].tracks.find((track) => track.property === "attr.opacity");
  const toOpacity = timeline.nodes[toAt].tracks.find((track) => track.property === "attr.opacity");
  if (!fromOpacity || fromOpacity.keys.at(-1).value !== 0.2) throw new Error("the first layer should keep its opacity track");
  if (!toOpacity || toOpacity.keys.at(-1).value !== 1) throw new Error("the second layer should keep its opacity track");
  if (timeline.nodes[toAt].tracks.some((track) => track.property === "attr.opacity" && track.keys[0].value === 1)) {
    throw new Error("the second layer should not receive the first layer track");
  }
  if (timeline.nodes.some((node) => node.tracks.some((track) => track.layer !== undefined))) {
    throw new Error("layer is not a timeline field");
  }
  const layeredSvg = await renderPresetGolden(layered, fixture);
  const first = groupBlock(layeredSvg, "s-crossfade-layers");
  const second = groupBlock(layeredSvg, "s-crossfade-layers-to");
  if (!first.includes("s-crossfade-layers-ink") || !first.includes('stroke-width="1.5"')) {
    throw new Error("ink and stroke width should stay on the first layer");
  }
  if (second.includes("-ink")) throw new Error("ink is not its own layer");
  if (layeredSvg.indexOf('id="s-crossfade-layers"') > layeredSvg.indexOf('id="s-crossfade-layers-to"')) {
    throw new Error("paint order should follow the layer list");
  }

  const untagged = structuredClone(sample);
  untagged.id = "untagged-layer";
  untagged.component.copied.layers = [
    { id: "a", shape: { form: "rect", width: 40, height: 20 }, fill: "#111111" },
    { id: "b", shape: { form: "rect", width: 40, height: 20 }, fill: "#222222" },
  ];
  untagged.motionPreset = {
    schemaVersion: 1,
    schemaRevision: 0,
    id: "motion.untagged",
    tracks: [
      {
        property: "transform.translateX",
        keys: [
          { frame: 0, value: 0 },
          { frame: 8, value: 20, easing: "linear" },
        ],
      },
    ],
  };
  assertValidPreset(untagged);
  const untaggedTimeline = await presetTimeline(untagged, fixture);
  const firstLayer = untaggedTimeline.nodes.find((node) => node.id === "s-untagged-layer");
  const secondLayer = untaggedTimeline.nodes.find((node) => node.id === "s-untagged-layer-b");
  if (!firstLayer?.tracks.some((track) => track.property === "transform.translateX")) {
    throw new Error("an absent layer should target the first layer");
  }
  if (secondLayer?.tracks.some((track) => track.property === "transform.translateX")) {
    throw new Error("an absent layer should not target later layers");
  }
  console.log("preset ink self-test ok");
}

const launched = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launched) {
  Promise.resolve()
    .then(async () => {
      if (process.argv.includes("--self-test")) {
        selfTest();
        await inkLayerSelfTest();
        await posePictureSelfTest();
        await goldenSelfTest();
        return;
      }
      if (process.argv.includes("--goldens")) {
        try {
          const errors = await checkGoldens(join(repoRoot, "presets"), readDocument(DEMO_SCENE));
          if (errors.length > 0) {
            for (const error of errors) console.error(error);
            process.exit(1);
          }
          console.log("preset goldens ok");
        } finally {
          await closeBrowser();
        }
        return;
      }
      const errors = checkPresetTree(join(repoRoot, "presets"));
      if (errors.length > 0) {
        for (const error of errors) console.error(error);
        process.exit(1);
      }
      const coverage = runCoverage();
      if (coverage !== 0) process.exit(coverage);
      console.log("presets ok");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
