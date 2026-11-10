#!/usr/bin/env node
// Walk presets/ and validate every preset file. Zero files is a pass.
// This script does not keep a list of preset ids.
// --goldens recompiles every golden from the preset plus the shared demo scene.
// The same preset and fixture are byte-stable.
// [[sot:svgif/determinism]] [[sot:svgif/preset-registry]]
// The default walk does not compare goldens.
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

/**
 * One SVG for this preset on the shared demo scene.
 * The projector, the CSS backends, and the SMIL backend each run.
 * The golden file is the SMIL document. A second run matches the first.
 * [[sot:svgif/determinism]] [[sot:svgif/preset-registry]]
 */
export async function renderPresetGolden(preset, fixture) {
  assertDemoScene(fixture);
  const engine = await loadEngine();
  const { compile } = engine.lower;
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
  const ir = {
    fps,
    width: fixture.width,
    height: fixture.height,
    durationInFrames: duration,
    nodes,
  };
  const smil = compile(ir, "smil");
  const smilAgain = compile(ir, "smil");
  const embedded = compile(ir, "css-embedded");
  const external = compile(ir, "css-external");
  if (smil.svg !== smilAgain.svg || !smil.svg.includes("<svg")) throw new Error("the golden is not byte-stable");
  if (!embedded.svg.includes("<svg") || !external.svg.includes("<svg")) throw new Error("the compiler did not return an SVG");
  return smil.svg;
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
  } finally {
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
        const errors = await checkGoldens(join(repoRoot, "presets"), readDocument(DEMO_SCENE));
        if (errors.length > 0) {
          for (const error of errors) console.error(error);
          process.exit(1);
        }
        console.log("preset goldens ok");
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
