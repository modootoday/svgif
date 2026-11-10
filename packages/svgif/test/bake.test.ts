/**
 * Baked 3D motion. The box fixture's frame 0 SVG is the committed string.
 * A 1000-triangle fixture at 30 fps must finish `renderFrame` without throwing.
 * The budget numbers live in this file.
 * [[adr:svgif/20261110120400]] [[sot:svgif/determinism]] [[sot:svgif/scene-3d]]
 */

import { describe, expect, test } from "bun:test";
import { bake, renderFrame, type BakeScene } from "../src/bake/index.ts";
import { BACKENDS } from "../src/backend/capability.ts";
import { sample } from "../src/ir/index.ts";
import { compile } from "../src/lower/index.ts";
import {
  boxGeometry,
  groupNode,
  meshNode,
  orthographicCameraNode,
  path3,
  path3Node,
  perspectiveCameraNode,
  type SceneNode,
  type TriangleMesh,
} from "../src/scene/index.ts";
import type { ShadeLights, ShadeMaterial } from "../src/shade/index.ts";

/** Golden 3D fixtures stay at or below this many triangles. */
const GOLDEN_TRIANGLE_LIMIT = 200;
/** Player preview fixture. The budget is this test, not a workflow setting. */
const PREVIEW_TRIANGLES = 1000;
const PREVIEW_FPS = 30;

/**
 * Unit box, side 1, centered on the origin.
 * Perspective camera at (0, 0, 4), identity quaternion, looking down -Z.
 * fovY is π/2, aspect is 1, near is 0.1, far is 100. Viewport is 100 by 100.
 * Lambert uses a white albedo, ambient 0.2, and one light along +Z.
 * The front face dot is 1, so ambient + diffuse is 1.2, which encodes as #ffffff.
 * The two front paths are the same quantized viewport numbers as the projection
 * of corners z = 0.5: 300/7 and 400/7. Faces that do not face the camera are absent.
 */
const BOX_FRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<path id="s-box-f0" d="M 42.8571 57.1429 L 57.1429 57.1429 L 57.1429 42.8571 Z" fill="#ffffff"/>
<path id="s-box-f1" d="M 42.8571 57.1429 L 57.1429 42.8571 L 42.8571 42.8571 Z" fill="#ffffff"/>
</svg>
`;

const WHITE = { r: 1, g: 1, b: 1 };
const MATERIAL: ShadeMaterial = { albedo: WHITE };
const LIGHTS: ShadeLights = {
  ambient: { r: 0.2, g: 0.2, b: 0.2 },
  directional: [{ direction: { x: 0, y: 0, z: 1 }, diffuse: WHITE }],
};

function boxRoot(): SceneNode {
  return groupNode({
    children: [
      perspectiveCameraNode(
        { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
        { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
      ),
      meshNode(boxGeometry(), { id: "box" }),
    ],
  });
}

function boxScene(durationInFrames = 2): BakeScene {
  return {
    fps: PREVIEW_FPS,
    width: 100,
    height: 100,
    durationInFrames,
    root: boxRoot(),
    material: MATERIAL,
    lights: LIGHTS,
    motions: [
      {
        nodeId: "box",
        at(frame) {
          return { eulerXYZ: { x: 0, y: frame === 0 ? 0 : 0.4, z: 0 } };
        },
      },
    ],
  };
}

function pathWidth(svg: string, id: string): number {
  const match = svg.match(new RegExp(`id="${id}" d="([^"]+)"`));
  if (match === null) throw new Error("path is missing");
  const numbers = match[1].match(/-?\d+(?:\.\d+)?/g);
  if (numbers === null) throw new Error("path is missing");
  const xs = numbers.filter((_, index) => index % 2 === 0).map(Number);
  return Math.max(...xs) - Math.min(...xs);
}

function gridMesh(count: number): TriangleMesh {
  const positions: TriangleMesh["positions"] = [];
  const faces: TriangleMesh["faces"] = [];
  for (let index = 0; index < count; index += 1) {
    const x = (index % 40) * 0.01;
    const y = Math.floor(index / 40) * 0.01;
    const base = positions.length;
    positions.push({ x, y, z: 0 }, { x: x + 0.004, y, z: 0 }, { x, y: y + 0.004, z: 0 });
    faces.push([base, base + 1, base + 2]);
  }
  return { primitive: "parametric", positions, faces, segments: { segmentsU: count, segmentsV: 1 } };
}

describe("bake", () => {
  test("the box fixture at frame 0 matches the committed golden", () => {
    const scene = boxScene();
    expect(boxGeometry().faces.length).toBe(12);
    expect(boxGeometry().faces.length).toBeLessThanOrEqual(GOLDEN_TRIANGLE_LIMIT);

    const svg = renderFrame(scene, 0);
    expect(svg).toBe(BOX_FRAME_SVG);
    expect(renderFrame(scene, 0)).toBe(svg);
    expect(svg).not.toContain("matrix3d");
    expect(svg.match(/<path /g)).toHaveLength(2);

    const baked = bake(scene);
    expect(baked.triangles).toBe(12);
    expect(baked.triangles).toBeLessThanOrEqual(GOLDEN_TRIANGLE_LIMIT);
    expect(baked.diagnostics).toEqual([]);
    expect(baked.ir.fps).toBe(PREVIEW_FPS);
    expect(baked.ir.nodes).toHaveLength(12);

    const properties = new Set(baked.ir.nodes.flatMap((node) => node.tracks.map((track) => track.property)));
    expect([...properties].sort()).toEqual(["attr.d", "attr.fill", "attr.opacity"]);
    const text = JSON.stringify(baked.ir);
    expect(text).not.toContain("matrix3d");
    expect(text).not.toContain("camera");
    expect(text).not.toContain("fovY");

    const frame0 = sample(baked.ir, 0);
    expect(frame0["box-f0"]?.["attr.d"]).toBe(
      "M 42.8571 57.1429 L 57.1429 57.1429 L 57.1429 42.8571 Z",
    );
    expect(frame0["box-f0"]?.["attr.fill"]).toBe("#ffffff");
    expect(frame0["box-f0"]?.["attr.opacity"]).toBe(1);
    expect(frame0["box-f2"]?.["attr.opacity"]).toBe(0);

    const turned = renderFrame(scene, 1);
    expect(turned).not.toBe(svg);
    expect(turned).not.toContain("matrix3d");
    expect(sample(baked.ir, 1)["box-f0"]?.["attr.d"]).not.toBe(frame0["box-f0"]?.["attr.d"]);
    for (const node of baked.ir.nodes) {
      for (const track of node.tracks) expect(track.keys.map((key) => key.frame)).toEqual([0, 1]);
    }

    for (const backend of BACKENDS) {
      const compiled = compile(baked.ir, backend);
      const artifact = compiled.css === undefined ? compiled.svg : `${compiled.svg}\n${compiled.css}`;
      expect(artifact).not.toContain("matrix3d");
      expect(artifact).not.toContain("fovY");
      expect(artifact).not.toContain("perspective-camera");
    }
  });

  test("an orthographic front face keeps the viewport square and a solid fill", () => {
    const scene: BakeScene = {
      fps: PREVIEW_FPS,
      width: 100,
      height: 100,
      durationInFrames: 1,
      root: groupNode({
        children: [
          orthographicCameraNode(
            { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 100 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
          meshNode(boxGeometry(), { id: "box" }),
        ],
      }),
      material: MATERIAL,
      lights: LIGHTS,
    };
    const svg = renderFrame(scene, 0);
    expect(svg).toContain('d="M 25 75 L 75 75 L 75 25 Z" fill="#ffffff"');
    expect(svg).not.toContain("matrix3d");
  });

  test("a 1000-triangle fixture at 30 fps finishes renderFrame without throwing", () => {
    const mesh = gridMesh(PREVIEW_TRIANGLES);
    expect(mesh.faces).toHaveLength(PREVIEW_TRIANGLES);
    const scene: BakeScene = {
      fps: PREVIEW_FPS,
      width: 64,
      height: 64,
      durationInFrames: 1,
      root: groupNode({
        children: [
          perspectiveCameraNode(
            { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
          meshNode(mesh, { id: "grid" }),
        ],
      }),
      material: MATERIAL,
      lights: LIGHTS,
    };
    expect(scene.fps).toBe(30);
    let svg = "";
    expect(() => {
      svg = renderFrame(scene, 0);
    }).not.toThrow();
    expect(svg.match(/<path /g)).toHaveLength(PREVIEW_TRIANGLES);
    expect(svg).not.toContain("matrix3d");
    expect(renderFrame(scene, 4)).toBe(svg);
  });

  test("records a diagnostic above 300 baked frames times face nodes and does not throw", () => {
    const scene = boxScene(30);
    let baked: ReturnType<typeof bake> | undefined;
    expect(() => {
      baked = bake(scene);
    }).not.toThrow();
    expect(baked?.diagnostics.map((item) => item.code)).toContain("baked-frames");
    expect(baked?.ir.nodes.length).toBe(12);
  });

  test("records a path-element diagnostic above 5000 paths and does not throw", () => {
    const count = 5001;
    const scene: BakeScene = {
      fps: 1,
      width: 32,
      height: 32,
      durationInFrames: 1,
      root: groupNode({
        children: [
          perspectiveCameraNode(
            { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 50 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
          meshNode(gridMesh(count), { id: "grid" }),
        ],
      }),
      material: MATERIAL,
      lights: LIGHTS,
    };
    const baked = bake(scene);
    expect(baked.diagnostics.map((item) => item.code)).toContain("path-elements");
    expect(baked.triangles).toBe(count);
  });

  test("clips a triangle on the near plane and keeps a fully hidden triangle out of the SVG", () => {
    const crossing: TriangleMesh = {
      primitive: "parametric",
      positions: [
        { x: -0.2, y: -0.2, z: 3 },
        { x: 0.2, y: -0.2, z: 3 },
        { x: 0, y: 0.2, z: 3.97 },
      ],
      faces: [[0, 1, 2]],
      segments: { segmentsU: 1, segmentsV: 1 },
    };
    const hidden: TriangleMesh = {
      primitive: "parametric",
      positions: [
        { x: 0, y: 0, z: 5 },
        { x: 0.2, y: 0, z: 5 },
        { x: 0, y: 0.2, z: 5 },
      ],
      faces: [[0, 1, 2]],
      segments: {},
    };
    const scene: BakeScene = {
      fps: PREVIEW_FPS,
      width: 100,
      height: 100,
      durationInFrames: 1,
      root: groupNode({
        children: [
          perspectiveCameraNode(
            { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
          meshNode(crossing, { id: "cross" }),
          meshNode(hidden, { id: "hidden" }),
          path3Node(
            path3(
              [
                { x: 0, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
              ],
              false,
            ),
            { id: "line" },
          ),
        ],
      }),
      material: MATERIAL,
      lights: LIGHTS,
      motions: [
        {
          nodeId: "cross",
          at: () => ({
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            position: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          }),
        },
      ],
    };
    const svg = renderFrame(scene, 0);
    expect(svg).toContain('id="s-cross-f0"');
    expect(svg).not.toContain("s-hidden-f0");
    expect(svg).not.toContain("matrix3d");
    const baked = bake(scene);
    const hiddenPath = sample(baked.ir, 0)["hidden-f0"];
    expect(hiddenPath?.["attr.opacity"]).toBe(0);
    expect(hiddenPath?.["attr.d"]).toBe("M 0 0 L 0 0 L 0 0 Z");
    const clipped = String(sample(baked.ir, 0)["cross-f0"]?.["attr.d"]);
    expect(clipped.startsWith("M ")).toBe(true);
    expect(clipped).not.toBe("M 0 0 L 0 0 L 0 0 Z");
  });

  test("selects a camera by id and rejects a mesh id that cannot be a selector", () => {
    const camera = perspectiveCameraNode(
      { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
      { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
    );
    const other = perspectiveCameraNode(
      { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
      { id: "other", transform: { position: { x: 0, y: 0, z: 8 } } },
    );
    const scene: BakeScene = {
      fps: PREVIEW_FPS,
      width: 100,
      height: 100,
      durationInFrames: 1,
      root: groupNode({ children: [other, camera, meshNode(boxGeometry(), { id: "box" })] }),
      cameraId: "camera",
      material: MATERIAL,
      lights: LIGHTS,
    };
    expect(renderFrame(scene, 0)).toBe(BOX_FRAME_SVG);
    expect(() => renderFrame({ ...scene, cameraId: undefined }, 0)).toThrow("camera id is required");
    expect(() => renderFrame({ ...scene, cameraId: "missing" }, 0)).toThrow("camera is missing");
    expect(() =>
      renderFrame(
        {
          ...scene,
          root: groupNode({ children: [camera, meshNode(boxGeometry(), { id: "box.1" })] }),
        },
        0,
      ),
    ).toThrow("node id cannot form a stable selector");
    expect(() => renderFrame({ ...scene, root: meshNode(boxGeometry()) }, 0)).toThrow("stable id is empty");
  });

  /**
   * Dolly is camera depth. Orbit is camera azimuth.
   * Each integer frame is projected again. Back faces and depth order use the shade pass.
   * [[sot:svgif/scene-3d]] [[sot:svgif/determinism]]
   */
  test("dolly follows distance and orbit turns azimuth", () => {
    const facing = (z: number, toward: 1 | -1): TriangleMesh => {
      const a = { x: -0.5, y: -0.5, z };
      const b = { x: 0.5, y: -0.5, z };
      const c = { x: -0.5, y: 0.5, z };
      return {
        primitive: "parametric",
        positions: toward > 0 ? [a, b, c] : [a, c, b],
        faces: [[0, 1, 2]],
        segments: { segmentsU: 1, segmentsV: 1 },
      };
    };
    let seenFps = 0;
    const scene: BakeScene = {
      fps: PREVIEW_FPS,
      width: 100,
      height: 100,
      durationInFrames: 3,
      root: groupNode({
        children: [
          perspectiveCameraNode(
            { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
          meshNode(boxGeometry(), { id: "box" }),
          meshNode(facing(0, 1), { id: "near" }),
          meshNode(facing(-3, 1), { id: "far" }),
          meshNode(facing(1, -1), { id: "back" }),
          path3Node(
            path3(
              [
                { x: 0, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
              ],
              false,
            ),
            { id: "line" },
          ),
        ],
      }),
      material: MATERIAL,
      lights: LIGHTS,
      cameraMove: {
        distance(frame, fps) {
          seenFps = fps;
          return frame === 1 ? 8 : 4;
        },
        azimuth(frame) {
          return frame === 2 ? Math.PI / 2 : 0;
        },
      },
    };

    const close = renderFrame(scene, 0);
    const farDolly = renderFrame(scene, 1);
    const turned = renderFrame(scene, 2);
    expect(renderFrame(scene, 0)).toBe(close);
    expect(seenFps).toBe(PREVIEW_FPS);
    expect(close).not.toContain("matrix3d");
    expect(farDolly).not.toContain("matrix3d");
    expect(turned).not.toContain("matrix3d");

    expect(close).toContain('id="s-box-f0"');
    expect(close).not.toContain("s-box-f2");
    expect(close).not.toContain("s-back-f0");
    // The far card is authored after the near card. Earlier in the document means farther.
    const farAt = close.indexOf('id="s-far-f0"');
    const nearAt = close.indexOf('id="s-near-f0"');
    expect(farAt).toBeGreaterThan(-1);
    expect(nearAt).toBeGreaterThan(farAt);

    const closeNear = pathWidth(close, "s-near-f0");
    const closeFar = pathWidth(close, "s-far-f0");
    const deepNear = pathWidth(farDolly, "s-near-f0");
    const deepFar = pathWidth(farDolly, "s-far-f0");
    expect(closeNear).toBeCloseTo(12.5, 6);
    expect(closeFar).toBeCloseTo(7.1428, 6);
    expect(deepNear).toBeCloseTo(6.25, 6);
    expect(deepFar).toBeCloseTo(4.5454, 6);
    expect(closeNear / deepNear).not.toBeCloseTo(closeFar / deepFar, 2);

    expect(close).not.toContain("s-box-f8");
    expect(turned).toContain('id="s-box-f8"');
    expect(turned).not.toContain("s-box-f10");
    const sideAt = turned.indexOf('id="s-box-f0"');
    const frontAt = turned.indexOf('id="s-box-f8"');
    expect(sideAt).toBeGreaterThan(-1);
    expect(frontAt).toBeGreaterThan(sideAt);
    expect(turned).not.toBe(close);

    const baked = bake(scene);
    expect(baked.diagnostics).toEqual([]);
    expect(baked.triangles).toBe(15);
    const frame0 = sample(baked.ir, 0);
    const frame1 = sample(baked.ir, 1);
    const frame2 = sample(baked.ir, 2);
    expect(frame0["back-f0"]?.["attr.opacity"]).toBe(0);
    expect(frame0["box-f2"]?.["attr.opacity"]).toBe(0);
    expect(frame0["near-f0"]?.["attr.d"]).not.toBe(frame1["near-f0"]?.["attr.d"]);
    expect(frame0["box-f8"]?.["attr.opacity"]).toBe(0);
    expect(frame2["box-f8"]?.["attr.opacity"]).toBe(1);
    expect(frame2["box-f10"]?.["attr.opacity"]).toBe(0);
    expect(JSON.stringify(baked.ir)).not.toContain("matrix3d");
  });

  test("a fixed dolly and azimuth keep the box golden", () => {
    const scene = boxScene(1);
    scene.motions = [];
    scene.cameraMove = { distance: 4, azimuth: 0 };
    expect(renderFrame(scene, 0)).toBe(BOX_FRAME_SVG);
  });

  test("an orthographic orbit uses the same camera pose", () => {
    const scene: BakeScene = {
      fps: PREVIEW_FPS,
      width: 100,
      height: 100,
      durationInFrames: 1,
      root: groupNode({
        children: [
          orthographicCameraNode(
            { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 100 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
          meshNode(boxGeometry(), { id: "box" }),
        ],
      }),
      material: MATERIAL,
      lights: LIGHTS,
      cameraMove: { azimuth: Math.PI / 2 },
    };
    const svg = renderFrame(scene, 0);
    expect(svg).toContain('id="s-box-f8"');
    expect(svg).not.toContain("matrix3d");
    expect(svg).not.toContain("s-box-f10");
  });

  test("rejects a camera move that is not a finite depth", () => {
    const scene = boxScene(1);
    expect(() =>
      renderFrame({ ...scene, cameraMove: { distance: () => "far" as unknown as number } }, 0),
    ).toThrow("camera move is not a number");
    expect(() => renderFrame({ ...scene, cameraMove: { distance: -1 } }, 0)).toThrow("distance is not positive");
    expect(() =>
      renderFrame(
        {
          ...scene,
          root: groupNode({
            children: [
              perspectiveCameraNode(
                { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
                { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
              ),
              perspectiveCameraNode(
                { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
                { id: "other", transform: { position: { x: 0, y: 0, z: 8 } } },
              ),
              meshNode(boxGeometry(), { id: "box" }),
            ],
          }),
          cameraMove: { azimuth: 0.2 },
        },
        0,
      ),
    ).toThrow("camera id is required");
    expect(renderFrame({ ...scene, cameraMove: {} }, 0)).toBe(renderFrame(scene, 0));
  });

  test("rejects a missing camera, a bad clock, and a motion that names no node", () => {
    const scene = boxScene();
    expect(() => renderFrame({ ...scene, fps: 0 }, 0)).toThrow("fps is not a positive integer");
    expect(() => renderFrame({ ...scene, durationInFrames: 0 }, 0)).toThrow("duration is not a positive integer");
    expect(() => renderFrame({ ...scene, width: 0 }, 0)).toThrow("width is not positive");
    expect(() => renderFrame({ ...scene, height: -1 }, 0)).toThrow("height is not positive");
    expect(() =>
      renderFrame({ ...scene, motions: [{ nodeId: "", at: () => ({}) }] }, 0),
    ).toThrow("motion node is missing");
    expect(() =>
      renderFrame(
        {
          ...scene,
          root: groupNode({ children: [meshNode(boxGeometry(), { id: "box" })] }),
        },
        0,
      ),
    ).toThrow("camera is missing");
    expect(() =>
      renderFrame(
        {
          ...scene,
          motions: [{ nodeId: "missing", at: () => ({}) }],
        },
        0,
      ),
    ).toThrow("motion node is missing");
    expect(() =>
      renderFrame(
        {
          ...scene,
          motions: [
            { nodeId: "box", at: () => ({}) },
            { nodeId: "box", at: () => ({}) },
          ],
        },
        0,
      ),
    ).toThrow("motion node is duplicated");
    expect(() =>
      renderFrame(
        {
          ...scene,
          motions: [{ nodeId: "box", at: () => ({ quaternion: { x: 0, y: 0, z: 0, w: 1 }, eulerXYZ: { x: 0, y: 0, z: 0 } }) }],
        },
        0,
      ),
    ).toThrow("stored orientation is a quaternion");
  });
});
