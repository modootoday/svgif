#!/usr/bin/env node
// Walk presets/ and validate every preset file. Zero files is a pass.
// This script does not keep a list of preset ids.
// --goldens recompiles every golden from the preset plus the shared demo scene.
// The same preset and fixture are byte-stable.
// A parameter named loop with boolean true sets loop on the compiled timeline.
// Absent, false, or any other value leaves that field unset.
// A parameter named scene with boolean false omits the baked subject and ground.
// Absent, the string false, or any other value keeps them. The category is not read.
// A track whose sampled value does not change keeps its first key. The compiler
// writes that key as the static attribute. An element that stays at opacity 0,
// and that no clip or mask reveals, is omitted.
// A non-static golden is sampled at frame 0, a mid frame, and the last frame
// with CSS left active. The painted clip is compared with the markup clip.
// A SMIL document that has dur is also sampled as pixels at those frames.
// The mid-frame paint must differ from the last frame.
// One extra sample replaces the stage fill with #f7f7f7. The fixture fill stays.
// The browser binary is the studio shell lookup.
// A camera preset is a perspective projector. Scale dollies along the ray
// through the declared centre. depthRatio is the far travel divided by the
// near travel. The mesh positions for that ratio are placed with the pose.
// copied.strokeWidth is written as attr.strokeWidth. Absent means no stroke width.
// copied.ink is a second path in that same wrapper, with its fill and no stroke.
// copied.layers emits one node per layer, in list order. A track with no layer
// belongs to the first layer. The ink path stays in that first wrapper.
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
    ]).then(([lower, bake, scene, ir]) => ({ lower, bake, scene, ir }));
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
  if (typeof shape.d === "string" && shape.d.length > 0) return shape.d;
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

function norm3(a) {
  const length = Math.hypot(a.x, a.y, a.z);
  if (!(length > 0)) return { x: 0, y: 0, z: -1 };
  return { x: a.x / length, y: a.y / length, z: a.z / length };
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

function pivotPixel(preset, fixture) {
  const text = parameterText(preset, "center");
  if (text) {
    const parts = text.trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && parts.every((value) => Number.isFinite(value))) {
      return { x: parts[0], y: parts[1] };
    }
  }
  return { x: fixture.width / 2, y: fixture.height / 2 };
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

function viewRay(basis, fixture, pixel) {
  const focal = 1 / Math.tan(fixture.camera.fovY / 2);
  const aspect = fixture.width / fixture.height;
  const ndcX = (pixel.x / fixture.width) * 2 - 1;
  const ndcY = 1 - (pixel.y / fixture.height) * 2;
  const camX = (ndcX * aspect) / focal;
  const camY = ndcY / focal;
  return norm3({
    x: basis.right.x * camX + basis.up.x * camY + basis.forward.x,
    y: basis.right.y * camX + basis.up.y * camY + basis.forward.y,
    z: basis.right.z * camX + basis.up.z * camY + basis.forward.z,
  });
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

function projectCorner(eye, basis, fixture, point) {
  const rel = sub3(point, eye);
  const depth = dot3(rel, basis.forward);
  if (!(depth > 1e-6)) return null;
  const focal = 1 / Math.tan(fixture.camera.fovY / 2);
  const aspect = fixture.width / fixture.height;
  const ndcX = ((focal / aspect) * dot3(rel, basis.right)) / depth;
  const ndcY = (focal * dot3(rel, basis.up)) / depth;
  return {
    x: (ndcX * 0.5 + 0.5) * fixture.width,
    y: (ndcY * -0.5 + 0.5) * fixture.height,
  };
}

function subjectWidth(eye, basis, fixture) {
  const mesh = namedMesh(fixture, "subject");
  if (!mesh) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const corner of boxCorners(mesh)) {
    const pixel = projectCorner(eye, basis, fixture, corner);
    if (!pixel) continue;
    if (pixel.x < minX) minX = pixel.x;
    if (pixel.x > maxX) maxX = pixel.x;
  }
  return maxX > minX ? maxX - minX : 0;
}

function dollyAlong(eye, basis, fixture, pixel, factor) {
  if (!(factor > 0) || factor === 1) return eye;
  const ray = viewRay(basis, fixture, pixel);
  const depth = dot3(sub3(meshPoint(namedMesh(fixture, "subject")), eye), basis.forward);
  const align = dot3(ray, basis.forward);
  if (!(depth > 1e-6) || !(align > 1e-6)) return eye;
  const pivot = add3(eye, mul3(ray, depth / align));
  return add3(pivot, mul3(sub3(eye, pivot), 1 / factor));
}

/** Dolly factor whose subject width is `targetWidth`. The ray is the declared centre. */
function dollyToWidth(eye, basis, fixture, pixel, targetWidth) {
  if (!(targetWidth > 0)) return eye;
  let low = 0.05;
  let high = 8;
  let best = eye;
  for (let step = 0; step < 28; step += 1) {
    const factor = (low + high) / 2;
    const next = dollyAlong(eye, basis, fixture, pixel, factor);
    const width = subjectWidth(next, basis, fixture);
    if (!(width > 0)) {
      high = factor;
      continue;
    }
    best = next;
    if (width < targetWidth) low = factor;
    else high = factor;
  }
  return best;
}

/**
 * Perspective pose for one frame.
 * Scale dollies along the ray through `center` until the subject width matches
 * that scale. A translate without a depth ratio is a view-plane shift of
 * angle times the subject depth. A depth ratio strafes by the translate
 * itself. Dividing world Z by scale is not the zoom.
 * [[sot:svgif/preset-registry]] [[sot:svgif/determinism]]
 */
function cameraPose(preset, base, values, fixture) {
  const distance = parameterNumber(preset, "distance") ?? base.z;
  const scale = firstNumber(1, values["transform.scaleX"], values["transform.scaleY"]);
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
  if (scale !== 1 && Number.isFinite(scale) && scale !== 0) {
    const pixel = pivotPixel(preset, fixture);
    const baseWidth = subjectWidth(restEye, basis, fixture);
    eye = baseWidth > 0 ? dollyToWidth(eye, basis, fixture, pixel, baseWidth * scale) : dollyAlong(eye, basis, fixture, pixel, scale);
  }
  return { position: eye, eulerXYZ };
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

function poseMotion(nodeId, tracks, duration, fps, poseAt) {
  return {
    nodeId,
    at(frame) {
      return poseAt(frame, tracks, duration, fps);
    },
  };
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
  const children = [
    scene.perspectiveCameraNode(
      {
        fovY: camera.fovY,
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
    ),
  ];
  for (const mesh of meshes) children.push(boxFrom(scene, mesh));
  if (extraMesh) children.push(boxFrom(scene, extraMesh));
  return scene.groupNode({ children });
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

function timelineDuration(fixture, tracks) {
  return Math.max(fixture.durationInFrames, maxKeyFrame(tracks) + 1);
}

/** Boolean true on a parameter named loop. A category does not decide this. */
function timelineLoops(preset) {
  const parameters = preset?.parameters;
  if (!Array.isArray(parameters)) return false;
  return parameters.some((parameter) => parameter?.name === "loop" && parameter?.value === true);
}

/** Boolean false on a parameter named scene. A category does not decide this. */
function sceneOmitted(preset) {
  const parameters = preset?.parameters;
  if (!Array.isArray(parameters)) return false;
  return parameters.some((parameter) => parameter?.name === "scene" && parameter?.value === false);
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
  const duration = timelineDuration(fixture, motionTracks(preset));
  const fps = fixture.fps;
  const motions = [];
  let cameraAtFrame0 = {
    position: { ...fixture.camera.position },
    eulerXYZ: { x: 0, y: 0, z: 0 },
  };
  if (cameraPreset) {
    const tracks = irTracks(plan.consumed);
    const poseAt = (frame) =>
      cameraPose(preset, fixture.camera.position, samplePose(sample, "camera", tracks, frame, duration, fps), fixture);
    cameraAtFrame0 = poseAt(0);
    motions.push(poseMotion("camera", tracks, duration, fps, (frame) => poseAt(frame)));
  }
  if (solid) {
    const tracks = irTracks(plan.consumed);
    const poseAt = (frame) => meshPose(solid.position, samplePose(sample, solid.id, tracks, frame, duration, fps));
    motions.push(poseMotion(solid.id, tracks, duration, fps, (frame) => poseAt(frame)));
  }
  const root = buildRoot(engine.scene, fixture, cameraAtFrame0, solid, layoutMeshes(preset, fixture, cameraAtFrame0));
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
  const nodes = [stageNode(fixture), ...baked.ir.nodes];
  const inkNodeId = appendArtwork(nodes, preset, used, plan.parts);
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
    return {
      async sample(svg, fps, duration) {
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
        for (const name of ["frame0", "mid", "last"]) {
          const frame = indexes[name];
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
          shots[name] = { signature: value.signature, clipShifted: value.clipShifted, paint: await capturePaint(send, sessionId, size) };
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
        return { ...shots, lightInk: paintDiffersFromLight(await capturePaint(send, sessionId, size)) };
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

async function capturePaint(send, sessionId, size) {
  const shot = await send(
    "Page.captureScreenshot",
    {
      format: "png",
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
      captureBeyondViewport: true,
      fromSurface: true,
    },
    sessionId,
  );
  if (!shot?.data) throw new Error("frame was not sampled");
  return decodePng(shot.data);
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
  const browser = await openBrowser();
  const shots = await browser.sample(svg, fps, duration);
  if (shots.frame0.clipShifted || shots.mid.clipShifted || shots.last.clipShifted) {
    return "clip shifted when CSS applies";
  }
  if (hasDur(svg) && paintsMatch(shots.mid.paint, shots.last.paint)) return "mid frame matches the last frame";
  if (!shots.lightInk) return "mark disappears on a light stage";
  if (!options.requireMotion) return "";
  if (shots.mid.signature === shots.frame0.signature) return "mid frame does not move when CSS is active";
  if (shots.last.signature === shots.frame0.signature) return "last frame does not move when CSS is active";
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
    const timeline = timelineDuration(fixture, motionTracks(document));
    try {
      const motion = await motionProblem(svg, {
        fps: fixture.fps,
        duration: timeline,
        requireMotion: requiresMotion(document, svg),
      });
      if (motion) errors.push(`${file.relative.replace(/\.json$/, ".golden.svg")} ${motion}`);
    } catch (error) {
      errors.push(`${file.relative.replace(/\.json$/, ".golden.svg")} ${error instanceof Error ? error.message : "frame was not sampled"}`);
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
    w: box.maxX - box.minX,
    h: box.maxY - box.minY,
    cx: (box.minX + box.maxX) / 2,
    cy: (box.minY + box.maxY) / 2,
  };
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
  const parallax = await shot("camera-parallax");
  const near = pictureTravel(parallax.start.ground, parallax.end.ground);
  const far = pictureTravel(parallax.start.subject, parallax.end.subject);
  const depthRatio = parameterNumber(parallax.preset, "depthRatio");
  if (!(near > far)) throw new Error("parallax depth order should keep the slab nearer than the box");
  if (Math.abs(near - 28) > 1) throw new Error("the near slab should travel about 28px");
  if (Math.abs(far - 11) > 1) throw new Error("the far box should travel about 11px");
  if (Math.abs(far / near - depthRatio) > 0.02) {
    throw new Error("parallax travel should follow depthRatio");
  }
  const cut = await shot("camera-cut");
  const cutScale = cut.preset.motionPreset.tracks.find((track) => track.property === "transform.scaleX").keys.at(-1).value;
  const cutRatio = cut.end.subject.w / cut.start.subject.w;
  if (Math.abs(cutRatio - cutScale) > 0.01) throw new Error("cut scale should match the subject width");
  console.log("preset pose self-test ok");
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
    artwork.motionPreset = {
      schemaVersion: 1,
      schemaRevision: 0,
      id: "motion.fade",
      tracks: [
        {
          property: "attr.opacity",
          keys: [
            { frame: 0, value: 0 },
            { frame: 12, value: 1, easing: "linear" },
          ],
        },
      ],
    };
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
