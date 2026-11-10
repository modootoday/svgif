#!/usr/bin/env node
// Walk presets/ and validate every preset file. Zero files is a pass.
// This script does not keep a list of preset ids.
// --goldens recompiles every golden from the preset plus the shared demo scene.
// The same preset and fixture are byte-stable.
// A parameter named loop with boolean true sets loop on the compiled timeline.
// Absent, false, or any other value leaves that field unset.
// A non-static golden is sampled at frame 0, a mid frame, and the last frame
// with CSS left active. The painted clip is compared with the markup clip.
// The browser binary is the studio shell lookup.
// [[sot:svgif/determinism]] [[sot:svgif/preset-registry]]
// The default walk does not compare goldens.
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
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
  return {
    property: track.property,
    keys: (track.keys ?? []).map((key) => {
      const next = { frame: key.frame, value: Array.isArray(key.value) ? key.value.slice() : key.value };
      if (key.easing !== undefined) next.easing = key.easing;
      return next;
    }),
  };
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

function componentTracks(preset, fixture, consumePose) {
  const motion = motionTracks(preset);
  const consumed = consumePose ? motion.filter((track) => CAMERA_POSE.has(track.property)) : [];
  const rest = consumePose ? motion.filter((track) => !CAMERA_POSE.has(track.property)) : motion;
  const present = new Set(rest.map((track) => track.property));
  const tracks = [];
  if (!consumePose) {
    const copied = preset.component?.copied ?? {};
    const d = shapePath(copied, fixture);
    if (d && !present.has("attr.d")) tracks.push(staticTrack("attr.d", d));
    if (typeof copied.fill === "string" && copied.fill.length > 0 && !present.has("attr.fill")) {
      tracks.push(staticTrack("attr.fill", copied.fill));
    }
    if (typeof copied.stroke === "string" && copied.stroke.length > 0 && !present.has("attr.stroke")) {
      tracks.push(staticTrack("attr.stroke", copied.stroke));
    }
    if (typeof copied.opacity === "number" && !present.has("attr.opacity")) {
      tracks.push(staticTrack("attr.opacity", copied.opacity));
    }
  }
  tracks.push(...rest);
  return { tracks, consumed };
}

function selectorId(preset, used) {
  const base = `s-${preset.id}`;
  if (!used.has(base)) return base;
  return `s-${preset.id}-preset`;
}

function cameraPose(preset, base, values) {
  const distance = parameterNumber(preset, "distance") ?? base.z;
  const scale = firstNumber(1, values["transform.scaleX"], values["transform.scaleY"]);
  return {
    position: {
      x: firstNumber(base.x, values["transform.translateX"], parameterNumber(preset, "x")),
      y: firstNumber(base.y, values["transform.translateY"], parameterNumber(preset, "y")),
      z: scale === 0 ? distance : distance / scale,
    },
    eulerXYZ: {
      x: parameterNumber(preset, "latitude") ?? 0,
      y: firstNumber(0, values["transform.rotate"], parameterNumber(preset, "azimuth")),
      z: 0,
    },
  };
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

function buildRoot(scene, fixture, cameraAtFrame0, extraMesh) {
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
  for (const mesh of fixture.meshes) children.push(boxFrom(scene, mesh));
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

/**
 * The timeline compiled for this preset on the shared demo scene.
 * Boolean true on `{ name: "loop", value: true }` sets `loop`.
 * Absent, false, or any other value leaves the field unset.
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
  const split = componentTracks(preset, fixture, consumePose);
  const duration = timelineDuration(fixture, motionTracks(preset));
  const fps = fixture.fps;
  const motions = [];
  let cameraAtFrame0 = {
    position: { ...fixture.camera.position },
    eulerXYZ: { x: 0, y: 0, z: 0 },
  };
  if (cameraPreset) {
    const tracks = split.consumed;
    const poseAt = (frame) => cameraPose(preset, fixture.camera.position, samplePose(sample, "camera", tracks, frame, duration, fps));
    cameraAtFrame0 = poseAt(0);
    motions.push(poseMotion("camera", tracks, duration, fps, (frame) => poseAt(frame)));
  }
  if (solid) {
    const tracks = split.consumed;
    const poseAt = (frame) => meshPose(solid.position, samplePose(sample, solid.id, tracks, frame, duration, fps));
    motions.push(poseMotion(solid.id, tracks, duration, fps, (frame) => poseAt(frame)));
  }
  const root = buildRoot(engine.scene, fixture, cameraAtFrame0, solid);
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
  if (split.tracks.length > 0) {
    nodes.push({ id: selectorId(preset, used), tracks: split.tracks });
  }
  const timeline = {
    fps,
    width: fixture.width,
    height: fixture.height,
    durationInFrames: duration,
    nodes,
  };
  if (timelineLoops(preset)) timeline.loop = true;
  return timeline;
}

/**
 * One SVG for this preset on the shared demo scene.
 * The projector, the CSS backends, and the SMIL backend each run.
 * The golden file is the SMIL document. A second run matches the first.
 * [[sot:svgif/determinism]] [[sot:svgif/preset-registry]]
 */
export async function renderPresetGolden(preset, fixture) {
  const timeline = await presetTimeline(preset, fixture);
  const { compile } = (await loadEngine()).lower;
  const smil = compile(timeline, "smil");
  const smilAgain = compile(timeline, "smil");
  const embedded = compile(timeline, "css-embedded");
  const external = compile(timeline, "css-external");
  if (smil.svg !== smilAgain.svg || !smil.svg.includes("<svg")) throw new Error("the golden is not byte-stable");
  if (!embedded.svg.includes("<svg") || !external.svg.includes("<svg")) throw new Error("the compiler did not return an SVG");
  return smil.svg;
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
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>\n${svg}\n</body></html>`;
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
          shots[name] = value;
        }
        return shots;
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
            { frame: 8, value: 2, easing: "linear" },
          ],
        },
      ],
    };
    writePreset(camera);
    const cameraErrors = await checkGoldens(root, fixture);
    if (!cameraErrors.some((line) => line.includes("camera-dolly.golden.svg"))) {
      throw new Error("a missing camera golden should fail");
    }
    if ((await checkGoldens(root, fixture)).length !== 0) throw new Error("a fresh camera write should match");
    const cameraSvg = readFileSync(join(root, "camera", "camera-dolly.golden.svg"), "utf8");
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
  } finally {
    await closeBrowser();
    rmSync(root, { recursive: true, force: true });
  }
  console.log("preset goldens self-test ok");
}

const launched = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launched) {
  Promise.resolve()
    .then(async () => {
      if (process.argv.includes("--self-test")) {
        selfTest();
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
