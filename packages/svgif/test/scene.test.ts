import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { formatUnit } from "../src/ir/quantize.ts";
import { lookAt, projectToNdc, viewportMap, type Mat4, type Vec3 } from "../src/math/index.ts";
import {
  boxGeometry,
  evaluateWorld,
  extrudeGeometry,
  groupNode,
  isMeshNode,
  isOrthographicCameraNode,
  isPath3Node,
  isPerspectiveCameraNode,
  latheGeometry,
  localMatrix,
  mapClipToViewport,
  meshNode,
  nodeTransform,
  orthographicCameraNode,
  parametricGeometry,
  path3,
  path3Node,
  perspectiveCameraNode,
  projectScene,
  selectorId,
  sphereGeometry,
  stableId,
  torusGeometry,
  type SceneNode,
  type TriangleMesh,
} from "../src/scene/index.ts";

/** C6 emit step is 1e-4. Comparisons here use the raw matrix, before that step. */
const C6_EPSILON = 1e-4;

function expectNear(actual: number, expected: number, epsilon = C6_EPSILON): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
}

function expectMat(actual: Mat4, expected: Mat4, epsilon = C6_EPSILON): void {
  for (let index = 0; index < 16; index++) {
    expectNear(actual[index], expected[index], epsilon);
  }
}

describe("parent world times local", () => {
  test("adds a child translation to the parent translation", () => {
    // Torso at (30, 12, 0), forearm at local (36, 16, 0). Both quaternions are
    // the identity and both scales are 1, so the forearm world origin is (66, 28, 0).
    const forearm = groupNode({
      id: "forearm",
      transform: { position: { x: 36, y: 16, z: 0 } },
    });
    const torso = groupNode({
      id: "torso",
      transform: { position: { x: 30, y: 12, z: 0 } },
      children: [forearm],
    });

    const evaluated = evaluateWorld(torso);
    const torsoWorld: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      30, 12, 0, 1,
    ];
    const forearmWorld: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      66, 28, 0, 1,
    ];

    expect(evaluated.map((entry) => entry.stableId)).toEqual(["torso", "forearm"]);
    expectMat(evaluated[0].world, torsoWorld, 0);
    expectMat(evaluated[1].world, forearmWorld, 0);
    expectMat(evaluated[1].local, localMatrix(forearm.transform), 0);
  });

  test("keeps the raw sum when that sum is not on the 1e-4 grid", () => {
    const child = groupNode({ transform: { position: { x: 1 / 3, y: 0, z: 0 } } });
    const parent = groupNode({
      transform: { position: { x: 1 / 3, y: 0, z: 0 } },
      children: [child],
    });
    const worldX = evaluateWorld(parent)[1].world[12];
    const raw = 2 / 3;
    // Emit quantization of 2/3 is 0.6667. The stored world value stays the raw sum.
    expect(Math.abs(worldX - raw)).toBeLessThanOrEqual(C6_EPSILON);
    expect(Math.abs(worldX - raw)).toBeLessThan(1e-9);
    expect(Math.abs(worldX - raw)).toBeLessThan(Math.abs(worldX - 0.6667));
  });

  test("rotates a child offset by the parent quaternion", () => {
    // Parent quaternion is +90° about Z, so local +X maps to world +Y.
    // Child origin (4, 0, 0) with scale 2 lands at world (0, 4, 0).
    // Column-major parent * child:
    //   parent columns (0,1,0), (-1,0,0), (0,0,1), (0,0,0)
    //   child columns (2,0,0), (0,2,0), (0,0,2), (4,0,0)
    //   product columns (0,2,0), (-2,0,0), (0,0,2), (0,4,0)
    const child = groupNode({
      transform: {
        position: { x: 4, y: 0, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
      },
    });
    const parent = groupNode({
      transform: { eulerXYZ: { x: 0, y: 0, z: Math.PI / 2 } },
      children: [child],
    });
    const handParent: Mat4 = [
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const handChild: Mat4 = [
      0, 2, 0, 0,
      -2, 0, 0, 0,
      0, 0, 2, 0,
      0, 4, 0, 1,
    ];

    const evaluated = evaluateWorld(parent);
    expectMat(evaluated[0].world, handParent, 1e-9);
    expectMat(evaluated[1].world, handChild, 1e-9);
    expect(Math.abs(evaluated[1].world[13] - 4)).toBeLessThanOrEqual(C6_EPSILON);
  });

  test("a child rotation leaves the parent world matrix in place", () => {
    const child = groupNode({
      id: "forearm",
      transform: { position: { x: 4, y: 0, z: 0 } },
    });
    const parent = groupNode({
      id: "torso",
      transform: { position: { x: 1, y: 2, z: 3 } },
      children: [child],
    });
    const before = evaluateWorld(parent);
    child.transform.quaternion = nodeTransform({
      eulerXYZ: { x: 0, y: 0, z: Math.PI / 2 },
    }).quaternion;
    const after = evaluateWorld(parent);

    expect(after[0].world).toEqual(before[0].world);
    expect(after[1].world).not.toEqual(before[1].world);
    expect(child.transform.position).toEqual({ x: 4, y: 0, z: 0 });
    // Local order is T * R * S, and the parent rotation is the identity.
    // The child origin stays at parent (1, 2, 3) plus local (4, 0, 0).
    expectMat(after[0].world, [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 2, 3, 1,
    ], 0);
    expectNear(after[1].world[12], 5, 1e-9);
    expectNear(after[1].world[13], 2, 1e-9);
    expectNear(after[1].world[14], 3, 1e-9);
  });

  test("a parent translation moves the child and leaves the child local transform", () => {
    const child = groupNode({ transform: { position: { x: 36, y: 16, z: 0 } } });
    const parent = groupNode({
      transform: { position: { x: 30, y: 12, z: 0 } },
      children: [child],
    });
    expect(evaluateWorld(parent)[1].world[12]).toBe(66);
    parent.transform.position = { x: 40, y: 12, z: 0 };
    const moved = evaluateWorld(parent);
    expect(child.transform.position).toEqual({ x: 36, y: 16, z: 0 });
    expect(moved[1].world[12]).toBe(76);
    expect(moved[1].world[13]).toBe(28);
  });

  test("evaluates a grandchild after its parent, depth-first", () => {
    const tip = groupNode({
      id: "tip",
      transform: { position: { x: 0, y: 0, z: 3 } },
    });
    const limb = groupNode({
      transform: { position: { x: 0, y: 2, z: 0 } },
      children: [tip],
    });
    const other = groupNode({ id: "other" });
    const root = groupNode({
      id: "root",
      transform: { position: { x: 1, y: 0, z: 0 } },
      children: [limb, other],
    });

    const evaluated = evaluateWorld(root);
    expect(evaluated.map((entry) => entry.stableId)).toEqual(["root", "n0", "tip", "other"]);
    expect(evaluated.map((entry) => entry.selectorId)).toEqual(["s-root", "s-n0", "s-tip", "s-other"]);
    // (1, 0, 0) + (0, 2, 0) + (0, 0, 3) = (1, 2, 3), and the tip is visited before the sibling.
    expect(evaluated[2].world[12]).toBe(1);
    expect(evaluated[2].world[13]).toBe(2);
    expect(evaluated[2].world[14]).toBe(3);
    expect(evaluated.findIndex((entry) => entry.stableId === "tip")).toBeLessThan(
      evaluated.findIndex((entry) => entry.stableId === "other"),
    );
  });

  test("multiplies an external parent world in front of the local matrix", () => {
    const parentWorld: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 0, 0, 1,
    ];
    const node: SceneNode = {
      kind: "group",
      transform: nodeTransform({ position: { x: 1, y: 2, z: 3 } }),
    };
    const evaluated = evaluateWorld(node, parentWorld);
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0].world[12]).toBe(11);
    expect(evaluated[0].world[13]).toBe(2);
    expect(evaluated[0].world[14]).toBe(3);
  });

  test("uses child indexes from the root when the parent has an author id", () => {
    const unnamed = groupNode({
      children: [groupNode({})],
    });
    const root = groupNode({ id: "shot", children: [groupNode({ id: "torso" }), unnamed] });
    const evaluated = evaluateWorld(root);
    expect(evaluated.map((entry) => entry.stableId)).toEqual(["shot", "torso", "n1", "n1/n0"]);
    expect(stableId(undefined, [])).toBe("");
    expect(stableId("torso", [0])).toBe("torso");
    expect(() => selectorId("")).toThrow("stable id is empty");
  });
});

describe("cameras", () => {
  test("stores a perspective camera quaternion and inverts that pose to a view", () => {
    const node = perspectiveCameraNode(
      { fovY: Math.PI / 2, aspect: 16 / 9, near: 0.1, far: 100 },
      {
        id: "cam",
        transform: {
          position: { x: 0, y: 0, z: 5 },
          eulerXYZ: { x: 0, y: 0, z: 0 },
        },
      },
    );
    expect(isPerspectiveCameraNode(node)).toBe(true);
    expect(node.camera).toEqual({ fovY: Math.PI / 2, aspect: 16 / 9, near: 0.1, far: 100 });
    expect(Object.keys(node.transform).sort()).toEqual(["position", "quaternion", "scale"]);
    expect(node.transform.quaternion).toEqual({ x: 0, y: 0, z: 0, w: 1 });

    const evaluated = evaluateWorld(node);
    const handWorld: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 5, 1,
    ];
    const handView: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, -5, 1,
    ];
    expectMat(evaluated[0].world, handWorld, 0);
    expectMat(evaluated[0].view ?? handWorld, handView, 0);
    expectMat(
      evaluated[0].view ?? handWorld,
      lookAt({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
      1e-12,
    );
    expect(evaluated[0].selectorId).toBe("s-cam");
  });

  test("stores an orthographic camera and the same inverse view", () => {
    const node = orthographicCameraNode(
      { left: -2, right: 2, top: 1, bottom: -1, near: 0.5, far: 20 },
      { transform: { position: { x: 0, y: 0, z: 5 } } },
    );
    expect(isOrthographicCameraNode(node)).toBe(true);
    expect(isPerspectiveCameraNode(node)).toBe(false);
    expect(node.camera).toEqual({ left: -2, right: 2, top: 1, bottom: -1, near: 0.5, far: 20 });
    const evaluated = evaluateWorld(node);
    expect(evaluated[0].stableId).toBe("");
    expect(evaluated[0].selectorId).toBeUndefined();
    expect(evaluated[0].view?.[14]).toBe(-5);
  });

  test("a group has no view matrix", () => {
    const evaluated = evaluateWorld(groupNode({ id: "g" }));
    expect(evaluated[0].view).toBeUndefined();
    expect(evaluated[0].world).toEqual(localMatrix(nodeTransform()));
  });

  test("rejects a zero scale camera pose", () => {
    const node = perspectiveCameraNode(
      { fovY: 1, aspect: 1, near: 0.1, far: 10 },
      { transform: { scale: { x: 0, y: 0, z: 0 } } },
    );
    expect(() => evaluateWorld(node)).toThrow("singular matrix");
  });
});

describe("inputs", () => {
  test("copies transform numbers and children", () => {
    const position = { x: 1, y: 2, z: 3 };
    const child = groupNode();
    const children = [child];
    const parent = groupNode({ transform: { position }, children });
    position.x = 9;
    children.push(groupNode());
    expect(parent.transform.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(parent.children).toEqual([child]);
  });

  test("rejects two orientation inputs and non-finite numbers", () => {
    expect(() =>
      nodeTransform({
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        eulerXYZ: { x: 0, y: 0, z: 0 },
      }),
    ).toThrow("stored orientation is a quaternion");
    expect(() => nodeTransform({ position: { x: Number.NaN, y: 0, z: 0 } })).toThrow(
      "position has a non-finite number",
    );
    expect(() => nodeTransform({ eulerXYZ: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 } })).toThrow(
      "Euler has a non-finite number",
    );
    expect(() =>
      nodeTransform({ quaternion: { x: 0, y: 0, z: Number.NaN, w: 1 } }),
    ).toThrow("quaternion has a non-finite number");
    expect(() => nodeTransform({ scale: { x: 1, y: Number.NaN, z: 1 } })).toThrow(
      "scale has a non-finite number",
    );
    expect(() => perspectiveCameraNode({ fovY: Number.NaN, aspect: 1, near: 0.1, far: 2 })).toThrow(
      "perspective camera has a non-finite number",
    );
    expect(() =>
      orthographicCameraNode({
        left: -1,
        right: 1,
        top: Number.NaN,
        bottom: -1,
        near: 0.1,
        far: 2,
      }),
    ).toThrow("orthographic camera has a non-finite number");
  });

  test("rejects a node that is not a transform node", () => {
    expect(() => evaluateWorld({} as SceneNode)).toThrow("node kind is not a scene kind");
    expect(() => evaluateWorld({ kind: "group" } as SceneNode)).toThrow("node is missing a transform");
    expect(() =>
      evaluateWorld({
        kind: "perspective-camera",
        transform: nodeTransform(),
      } as SceneNode),
    ).toThrow("perspective camera is missing its fields");
    expect(() =>
      evaluateWorld({
        kind: "orthographic-camera",
        transform: nodeTransform(),
      } as SceneNode),
    ).toThrow("orthographic camera is missing its fields");
    expect(() => evaluateWorld({ kind: "sprite" } as unknown as SceneNode)).toThrow(
      "node kind is not a scene kind",
    );
    const broken = groupNode();
    (broken as { children: unknown }).children = "no";
    expect(() => evaluateWorld(broken)).toThrow("children is not a list");
    expect(() => groupNode({ children: "no" as unknown as SceneNode[] })).toThrow(
      "children is not a list",
    );
    expect(() => evaluateWorld(undefined as unknown as SceneNode)).toThrow("node is missing");
  });

  test("the scene module does not read a wall clock or a random source", () => {
    const dir = new URL("../src/scene/", import.meta.url);
    const source = readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(new URL(name, dir), "utf8"))
      .join("\n");
    expect(source.includes("sot:svgif/scene-3d")).toBe(true);
    expect(source.includes("sot:svgif/determinism")).toBe(true);
    expect(source.includes("Date.now")).toBe(false);
    expect(source.includes("performance.now")).toBe(false);
    expect(source.includes("Math.random")).toBe(false);
    expect(source.includes(".sort(")).toBe(false);
    expect(source.includes("formatUnit")).toBe(true);
    expect(source.includes("viewportMap")).toBe(true);
  });

  test("two evaluations of the same graph match", () => {
    const node = groupNode({
      transform: { position: { x: 2, y: 0, z: 0 }, eulerXYZ: { x: 0.2, y: -0.1, z: 0.4 } },
      children: [groupNode({ transform: { position: { x: 0, y: 1, z: 0 } } })],
    });
    const first = evaluateWorld(node);
    const second = evaluateWorld(node);
    expect(second[0].world).toEqual(first[0].world);
    expect(second[1].world).toEqual(first[1].world);
  });
});

const SQUARE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function faceNormal(mesh: TriangleMesh, face: [number, number, number]): Vec3 {
  const a = mesh.positions[face[0]];
  const b = mesh.positions[face[1]];
  const c = mesh.positions[face[2]];
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  return {
    x: uy * vz - uz * vy,
    y: uz * vx - ux * vz,
    z: ux * vy - uy * vx,
  };
}

function centroid(mesh: TriangleMesh, face: [number, number, number]): Vec3 {
  const a = mesh.positions[face[0]];
  const b = mesh.positions[face[1]];
  const c = mesh.positions[face[2]];
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
}

function expectOutward(mesh: TriangleMesh, outward: (point: Vec3) => Vec3): void {
  for (const face of mesh.faces) {
    const normal = faceNormal(mesh, face);
    const point = centroid(mesh, face);
    const direction = outward(point);
    const dot = normal.x * direction.x + normal.y * direction.y + normal.z * direction.z;
    expect(dot).toBeGreaterThan(0);
  }
}

function near(point: Vec3, x: number, y: number, z: number): boolean {
  return Math.abs(point.x - x) < 1e-9 && Math.abs(point.y - y) < 1e-9 && Math.abs(point.z - z) < 1e-9;
}

describe("meshes", () => {
  test("a box has twelve faces and the unit corners", () => {
    const box = boxGeometry();
    expect(box.primitive).toBe("box");
    expect(box.segments).toEqual({});
    expect(box.positions).toHaveLength(8);
    expect(box.faces).toHaveLength(12);
    expect(box.faces).toEqual([
      [4, 5, 6],
      [4, 6, 7],
      [1, 0, 3],
      [1, 3, 2],
      [3, 7, 6],
      [3, 6, 2],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [4, 7, 3],
      [4, 3, 0],
    ]);
    expect(box.positions[0]).toEqual({ x: -0.5, y: -0.5, z: -0.5 });
    expect(box.positions[6]).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
    expectOutward(box, (point) => point);
    const wide = boxGeometry(2, 4, 6);
    expect(wide.positions[1]).toEqual({ x: 1, y: -2, z: -3 });
    expect(wide.faces).toHaveLength(12);
  });

  test("a sphere stays on 16 by 12 unless the caller sets both counts", () => {
    const sphere = sphereGeometry();
    expect(sphere.segments).toEqual({ widthSegments: 16, heightSegments: 12 });
    expect(sphere.positions).toHaveLength(2 + 11 * 16);
    expect(sphere.faces).toHaveLength(16 + 16 + 10 * 16 * 2);
    expect(sphere.positions.filter((point) => Math.abs(point.y - 1) < 1e-12)).toHaveLength(1);
    expect(sphere.positions.filter((point) => Math.abs(point.y + 1) < 1e-12)).toHaveLength(1);
    expectOutward(sphere, (point) => point);

    const again = sphereGeometry();
    expect(again.segments.widthSegments).toBe(16);
    expect(again.segments.heightSegments).toBe(12);
    expect(again.faces).toEqual(sphere.faces);

    const coarse = sphereGeometry(2, 4, 2);
    expect(coarse.segments).toEqual({ widthSegments: 4, heightSegments: 2 });
    expect(coarse.positions).toHaveLength(6);
    expect(coarse.faces).toHaveLength(8);
    expect(coarse.positions.some((point) => near(point, 2, 0, 0))).toBe(true);
    expect(coarse.positions.some((point) => near(point, 0, 0, 2))).toBe(true);
    expect(coarse.positions.some((point) => near(point, 0, 2, 0))).toBe(true);
    expectOutward(coarse, (point) => point);
  });

  test("a torus stays on 24 by 12", () => {
    const torus = torusGeometry();
    expect(torus.segments).toEqual({ radialSegments: 24, tubularSegments: 12 });
    expect(torus.positions).toHaveLength(24 * 12);
    expect(torus.faces).toHaveLength(24 * 12 * 2);
    expect(torus.positions.filter((point) => near(point, 1.25, 0, 0))).toHaveLength(1);
    expectOutward(torus, (point) => {
      const theta = Math.atan2(point.z, point.x);
      return {
        x: point.x - Math.cos(theta),
        y: point.y,
        z: point.z - Math.sin(theta),
      };
    });
    const custom = torusGeometry(2, 0.5, 3, 3);
    expect(custom.segments).toEqual({ radialSegments: 3, tubularSegments: 3 });
    expect(custom.faces).toHaveLength(18);
  });

  test("an extrude records the explicit bevel step count", () => {
    const prism = extrudeGeometry(SQUARE, { depth: 2, bevelSteps: 0 });
    expect(prism.segments).toEqual({ bevelSteps: 0 });
    expect(prism.positions).toHaveLength(8);
    expect(prism.faces).toHaveLength(12);
    expect(prism.positions.some((point) => near(point, 0, 0, 0))).toBe(true);
    expect(prism.positions.some((point) => near(point, 1, 1, 2))).toBe(true);
    const bottom = prism.faces
      .map((face) => faceNormal(prism, face))
      .find((normal) => normal.y < 0 && Math.abs(normal.x) < 1e-9 && Math.abs(normal.z) < 1e-9);
    expect(bottom).toBeDefined();

    const closed = extrudeGeometry([...SQUARE, { x: 0, y: 0 }], { depth: 1, bevelSteps: 0 });
    expect(closed.faces).toHaveLength(12);
    const clockwise = extrudeGeometry(
      [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
      ],
      { depth: 1, bevelSteps: 0 },
    );
    expect(clockwise.faces).toHaveLength(12);

    const collinear = extrudeGeometry(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ],
      { depth: 1, bevelSteps: 0 },
    );
    expect(collinear.positions).toHaveLength(8);

    const bevel = extrudeGeometry(SQUARE, {
      depth: 1,
      bevelSteps: 2,
      bevelSize: 0.2,
      bevelThickness: 0.2,
    });
    expect(bevel.segments.bevelSteps).toBe(2);
    const inset = 0.2 * Math.cos(Math.PI / 4);
    const z = 0.2 * Math.sin(Math.PI / 4);
    expect(bevel.positions.some((point) => near(point, 0.2, 0.2, 0))).toBe(true);
    expect(bevel.positions.some((point) => near(point, inset, inset, z))).toBe(true);
    expect(bevel.positions.some((point) => near(point, 0, 0, 0.2))).toBe(true);
    expect(bevel.positions.some((point) => near(point, 0.2, 0.2, 1))).toBe(true);

    const shape = extrudeGeometry(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 0, y: 2 },
      ],
      { depth: 1, bevelSteps: 0 },
    );
    expect(shape.faces).toHaveLength((6 * 2) + (6 - 2) * 2);
  });

  test("a lathe and a parametric surface use the segment counts they are given", () => {
    const cylinder = latheGeometry(
      [
        { x: 1, y: -0.5 },
        { x: 1, y: 0.5 },
      ],
      4,
    );
    expect(cylinder.segments).toEqual({ segments: 4 });
    expect(cylinder.positions).toHaveLength(8);
    expect(cylinder.faces).toHaveLength(8);
    expectOutward(cylinder, (point) => ({ x: point.x, y: 0, z: point.z }));

    const cone = latheGeometry(
      [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      4,
    );
    expect(cone.positions.filter((point) => near(point, 0, 1, 0))).toHaveLength(1);
    expect(cone.faces).toHaveLength(4);
    expectOutward(cone, (point) => ({ x: point.x, y: point.y, z: point.z }));

    const down = latheGeometry(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      4,
    );
    expect(down.faces).toHaveLength(4);
    expectOutward(down, (point) => ({ x: point.x, y: point.y - 1, z: point.z }));

    const surface = parametricGeometry((u, v) => ({ x: u, y: v, z: 0 }), 1, 1);
    expect(surface.segments).toEqual({ segmentsU: 1, segmentsV: 1 });
    expect(surface.positions).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]);
    expect(surface.faces).toEqual([
      [0, 2, 1],
      [2, 3, 1],
    ]);
    const normal = faceNormal(surface, surface.faces[0]);
    expect(normal.z).toBeGreaterThan(0);

    const grid = parametricGeometry((u, v) => ({ x: u, y: 0, z: v }), 2, 3);
    expect(grid.faces).toHaveLength(12);
    expect(grid.positions).toHaveLength(12);
  });

  test("a path3 keeps its points and the closed flag", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];
    const open = path3(points);
    expect(open).toEqual({ primitive: "path3", points, closed: false });
    points[0].x = 4;
    expect(open.points[0].x).toBe(0);
    const closed = path3(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
      ],
      true,
    );
    expect(closed.closed).toBe(true);
    expect(closed.points).toHaveLength(2);
  });

  test("a mesh node keeps local positions and inherits the parent world", () => {
    const geometry = boxGeometry();
    const box = meshNode(geometry, {
      id: "box",
      transform: { position: { x: 3, y: 0, z: 0 } },
    });
    geometry.positions[0].x = 9;
    geometry.faces.push([0, 0, 0]);
    expect(isMeshNode(box)).toBe(true);
    expect(isPath3Node(box)).toBe(false);
    expect(box.geometry.positions[0].x).toBe(-0.5);
    expect(box.geometry.faces).toHaveLength(12);

    const root = groupNode({
      id: "root",
      transform: { position: { x: 1, y: 2, z: 0 } },
      children: [box],
    });
    const evaluated = evaluateWorld(root);
    expect(evaluated.map((entry) => entry.stableId)).toEqual(["root", "box"]);
    expect(evaluated[1].world[12]).toBe(4);
    expect(evaluated[1].world[13]).toBe(2);
    expect(box.geometry.positions[6]).toEqual({ x: 0.5, y: 0.5, z: 0.5 });

    const line = path3Node(
      path3([
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ]),
      { id: "line" },
    );
    expect(isPath3Node(line)).toBe(true);
    expect(isMeshNode(line)).toBe(false);
    const posed = evaluateWorld(line);
    expect(posed[0].selectorId).toBe("s-line");
    expect(line.path.points[1]).toEqual({ x: 0, y: 0, z: 1 });
  });

  test("rejects meshes that are not the documented samples", () => {
    expect(() => boxGeometry(0, 1, 1)).toThrow("width is not positive");
    expect(() => boxGeometry(1, -1, 1)).toThrow("height is not positive");
    expect(() => boxGeometry(1, 1, Number.NaN)).toThrow("depth is not positive");
    expect(() => sphereGeometry(0)).toThrow("radius is not positive");
    expect(() => sphereGeometry(1, 2.5, 12)).toThrow("width segments is not a whole number");
    expect(() => sphereGeometry(1, 2, 12)).toThrow("width segments is below 3");
    expect(() => sphereGeometry(1, 16, 1)).toThrow("height segments is below 2");
    expect(() => torusGeometry(-1, 0.25)).toThrow("radius is not positive");
    expect(() => torusGeometry(1, 0)).toThrow("tube is not positive");
    expect(() => torusGeometry(1, 0.2, 3, 2)).toThrow("tubular segments is below 3");
    expect(() => torusGeometry(1, 0.2, 1, 3)).toThrow("radial segments is below 3");
    expect(() => extrudeGeometry(SQUARE, undefined as unknown as { depth: number; bevelSteps: number })).toThrow(
      "bevel steps are explicit",
    );
    expect(() => extrudeGeometry(SQUARE, { depth: 1, bevelSteps: undefined as unknown as number })).toThrow(
      "bevel steps are explicit",
    );
    expect(() => extrudeGeometry(SQUARE, { depth: 0, bevelSteps: 0 })).toThrow("depth is not positive");
    expect(() => extrudeGeometry(SQUARE, { depth: 1, bevelSteps: 1.5 })).toThrow(
      "bevel steps is not a whole number",
    );
    expect(() => extrudeGeometry(SQUARE, { depth: 1, bevelSteps: -1 })).toThrow("bevel steps is below 0");
    expect(() => extrudeGeometry(SQUARE, { depth: 1, bevelSteps: 1 })).toThrow("bevel size is explicit");
    expect(() => extrudeGeometry(SQUARE, { depth: 1, bevelSteps: 1, bevelSize: 0.1 })).toThrow(
      "bevel thickness is explicit",
    );
    expect(() =>
      extrudeGeometry(SQUARE, { depth: 1, bevelSteps: 1, bevelSize: 0, bevelThickness: 0.1 }),
    ).toThrow("bevel size is not positive");
    expect(() =>
      extrudeGeometry(SQUARE, { depth: 1, bevelSteps: 1, bevelSize: 0.1, bevelThickness: 0.5 }),
    ).toThrow("bevel thickness leaves no side wall");
    expect(() =>
      extrudeGeometry(
        [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 3 },
          { x: 0, y: 3 },
        ],
        { depth: 2, bevelSteps: 1, bevelSize: 0.6, bevelThickness: 0.2 },
      ),
    ).toThrow("profile bevel crosses itself");
    expect(() => extrudeGeometry([{ x: 0, y: 0 }], { depth: 1, bevelSteps: 0 })).toThrow(
      "profile needs three points",
    );
    expect(() =>
      extrudeGeometry(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        { depth: 1, bevelSteps: 0 },
      ),
    ).toThrow("profile needs three points");
    expect(() =>
      extrudeGeometry(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
        { depth: 1, bevelSteps: 0 },
      ),
    ).toThrow("profile area is zero");
    const notched = extrudeGeometry(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 1, y: 1 },
        { x: 0, y: 3 },
      ],
      { depth: 1, bevelSteps: 0 },
    );
    expect(notched.faces.length).toBeGreaterThan(0);
    const arrow = extrudeGeometry(
      [
        { x: 0, y: 0 },
        { x: 3, y: 1 },
        { x: 0, y: 2 },
        { x: 1, y: 1 },
      ],
      { depth: 1, bevelSteps: 0 },
    );
    expect(arrow.faces.length).toBeGreaterThan(0);
    expect(() =>
      extrudeGeometry(
        [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 3 },
          { x: 0, y: 3 },
        ],
        { depth: 4, bevelSteps: 1, bevelSize: 3, bevelThickness: 0.2 },
      ),
    ).toThrow("profile is not a simple polygon");
    expect(() => extrudeGeometry("no" as unknown as typeof SQUARE, { depth: 1, bevelSteps: 0 })).toThrow(
      "profile needs three points",
    );
    expect(() =>
      extrudeGeometry([{ x: 0, y: 0 }, { x: 1, y: Number.NaN }, { x: 0, y: 1 }], { depth: 1, bevelSteps: 0 }),
    ).toThrow("profile point 1 has a non-finite number");

    expect(() => latheGeometry([{ x: 1, y: 0 }], 4)).toThrow("lathe profile needs two points");
    expect(() => latheGeometry("no" as unknown as typeof SQUARE, 4)).toThrow("lathe profile needs two points");
    expect(() =>
      latheGeometry(
        [
          { x: 1, y: 0 },
          { x: -0.1, y: 1 },
        ],
        4,
      ),
    ).toThrow("lathe radius is negative");
    expect(() => latheGeometry([{ x: 1, y: 0 }, { x: 1, y: 1 }], 2)).toThrow("lathe segments is below 3");
    expect(() => latheGeometry([{ x: 1, y: 0 }, { x: 1, y: 1 }], 3.2)).toThrow(
      "lathe segments is not a whole number",
    );
    expect(() =>
      latheGeometry(
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        4,
      ),
    ).toThrow("lathe profile has no faces");
    expect(() =>
      latheGeometry(
        [
          { x: 1, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
        3,
      ),
    ).not.toThrow();

    expect(() => parametricGeometry(undefined as unknown as (u: number, v: number) => Vec3, 1, 1)).toThrow(
      "parametric sample is missing",
    );
    expect(() => parametricGeometry((u, v) => ({ x: u, y: v, z: 0 }), 0, 1)).toThrow(
      "parametric segmentsU is below 1",
    );
    expect(() => parametricGeometry((u, v) => ({ x: u, y: v, z: 0 }), 1, 1.2)).toThrow(
      "parametric segmentsV is not a whole number",
    );
    expect(() => parametricGeometry(() => ({ x: 0, y: 0, z: Number.NaN }), 1, 1)).toThrow(
      "parametric point has a non-finite number",
    );

    expect(() => path3([{ x: 0, y: 0, z: 0 }])).toThrow("path3 needs two points");
    expect(() => path3([{ x: 0, y: Number.NaN, z: 0 }, { x: 1, y: 0, z: 0 }])).toThrow(
      "path3 point 0 has a non-finite number",
    );
    expect(() => path3([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], "yes" as unknown as boolean)).toThrow(
      "path3 closed is not a boolean",
    );
  });

  test("rejects a mesh node whose payload was replaced", () => {
    const box = meshNode(boxGeometry(), { children: [groupNode()] });
    expect(box.children).toHaveLength(1);
    box.geometry.faces[0] = [0, 1, 99];
    expect(() => evaluateWorld(box)).toThrow("face index is out of range");
    box.geometry.faces[0] = [0, 1, 1.5] as unknown as [number, number, number];
    expect(() => evaluateWorld(box)).toThrow("face index is out of range");
    box.geometry.faces[0] = [0, 1] as unknown as [number, number, number];
    expect(() => evaluateWorld(box)).toThrow("face is not a triangle");
    box.geometry.faces = [];
    expect(() => evaluateWorld(box)).toThrow("mesh is missing its faces");
    box.geometry.positions = [];
    expect(() => evaluateWorld(box)).toThrow("mesh is missing its positions");
    box.geometry.positions = [{ x: Number.NaN, y: 0, z: 0 }];
    box.geometry.faces = [[0, 0, 0]];
    expect(() => evaluateWorld(box)).toThrow("mesh position has a non-finite number");
    (box.geometry as { primitive: string }).primitive = "sprite";
    expect(() => evaluateWorld(box)).toThrow("mesh primitive is not a v1 primitive");
    expect(() => meshNode(undefined as unknown as TriangleMesh)).toThrow(
      "mesh primitive is not a v1 primitive",
    );

    const line = path3Node(path3([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]));
    (line.path as { primitive: string }).primitive = "line";
    expect(() => evaluateWorld(line)).toThrow("path3 primitive is missing");
    line.path.primitive = "path3";
    line.path.points = [{ x: 0, y: 0, z: 0 }];
    expect(() => evaluateWorld(line)).toThrow("path3 is missing its points");
    line.path.points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: Number.NaN, z: 0 },
    ];
    expect(() => evaluateWorld(line)).toThrow("path3 point has a non-finite number");
    line.path.points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    (line.path as { closed: unknown }).closed = "yes";
    expect(() => evaluateWorld(line)).toThrow("path3 closed is not a boolean");
    expect(() => path3Node(undefined as unknown as ReturnType<typeof path3>)).toThrow(
      "path3 primitive is missing",
    );

    expect(() =>
      evaluateWorld({
        kind: "mesh",
        transform: nodeTransform(),
      } as SceneNode),
    ).toThrow("mesh primitive is not a v1 primitive");
    expect(() =>
      evaluateWorld({
        kind: "path3",
        transform: nodeTransform(),
      } as SceneNode),
    ).toThrow("path3 primitive is missing");
  });
});

/**
 * Unit box, side 1, centered on the origin.
 * Perspective camera at (0, 0, 4), identity quaternion, so it looks down -Z.
 * fovY is π/2, aspect is 1, near is 0.1, far is 100. Viewport is 100 by 100.
 * The first path is face [4, 5, 6], the +Z side. A corner at z = 0.5 maps by
 * `x / (4 - z)`, then the viewport. 300/7 and 400/7 are those viewport numbers.
 * The far corners at z = -0.5 use 400/9 and 500/9. Twelve paths is the whole
 * box, including faces that point away from the camera, in face-index order.
 */
const UNIT_BOX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<g id="s-box">
<path d="M 42.8571 57.1429 L 57.1429 57.1429 L 57.1429 42.8571 Z"/>
<path d="M 42.8571 57.1429 L 57.1429 42.8571 L 42.8571 42.8571 Z"/>
<path d="M 55.5556 55.5556 L 44.4444 55.5556 L 44.4444 44.4444 Z"/>
<path d="M 55.5556 55.5556 L 44.4444 44.4444 L 55.5556 44.4444 Z"/>
<path d="M 44.4444 44.4444 L 42.8571 42.8571 L 57.1429 42.8571 Z"/>
<path d="M 44.4444 44.4444 L 57.1429 42.8571 L 55.5556 44.4444 Z"/>
<path d="M 44.4444 55.5556 L 55.5556 55.5556 L 57.1429 57.1429 Z"/>
<path d="M 44.4444 55.5556 L 57.1429 57.1429 L 42.8571 57.1429 Z"/>
<path d="M 55.5556 55.5556 L 55.5556 44.4444 L 57.1429 42.8571 Z"/>
<path d="M 55.5556 55.5556 L 57.1429 42.8571 L 57.1429 57.1429 Z"/>
<path d="M 42.8571 57.1429 L 42.8571 42.8571 L 44.4444 44.4444 Z"/>
<path d="M 42.8571 57.1429 L 44.4444 44.4444 L 44.4444 55.5556 Z"/>
</g>
</svg>
`;

function unitBoxRoot(): SceneNode {
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

function clipRoot(child: SceneNode): SceneNode {
  return groupNode({
    children: [
      perspectiveCameraNode(
        { fovY: Math.PI / 2, aspect: 1, near: 1, far: 10 },
        { id: "camera" },
      ),
      child,
    ],
  });
}

describe("projection", () => {
  test("a unit box at a fixed camera matches the committed golden", () => {
    expect(formatUnit(300 / 7)).toBe("42.8571");
    expect(formatUnit(400 / 7)).toBe("57.1429");
    expect(formatUnit(400 / 9)).toBe("44.4444");
    expect(formatUnit(500 / 9)).toBe("55.5556");

    const root = unitBoxRoot();
    const svg = projectScene(root, { width: 100, height: 100 });
    expect(svg).toBe(UNIT_BOX_SVG);
    expect(projectScene(root, { width: 100, height: 100 })).toBe(svg);

    const paths = svg.match(/<path /g) ?? [];
    expect(paths).toHaveLength(12);
    expect(paths.length).toBeLessThanOrEqual(200);
    const nearFace = svg.indexOf('d="M 42.8571 57.1429 L 57.1429 57.1429 L 57.1429 42.8571 Z"');
    const farFace = svg.indexOf('d="M 55.5556 55.5556 L 44.4444 55.5556 L 44.4444 44.4444 Z"');
    expect(nearFace).toBeGreaterThan(0);
    expect(farFace).toBeGreaterThan(nearFace);

    const evaluated = evaluateWorld(root);
    const camera = evaluated[1];
    const box = evaluated[2];
    expect(isPerspectiveCameraNode(camera.node)).toBe(true);
    if (!isPerspectiveCameraNode(camera.node) || camera.view === undefined) return;
    const nearCorner = projectToNdc(camera.node.camera, camera.view, box.world, {
      x: -0.5,
      y: -0.5,
      z: 0.5,
    });
    const nearViewport = viewportMap(nearCorner, 100, 100);
    expect(formatUnit(nearViewport.x)).toBe("42.8571");
    expect(formatUnit(nearViewport.y)).toBe("57.1429");
    const farCorner = projectToNdc(camera.node.camera, camera.view, box.world, {
      x: -0.5,
      y: -0.5,
      z: -0.5,
    });
    const farViewport = viewportMap(farCorner, 100, 100);
    expect(formatUnit(farViewport.x)).toBe("44.4444");
    expect(formatUnit(farViewport.y)).toBe("55.5556");
  });

  test("an orthographic window keeps x and y and ignores depth", () => {
    const root = groupNode({
      children: [
        orthographicCameraNode(
          { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 100 },
          { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
        ),
        meshNode(boxGeometry(), { id: "box" }),
      ],
    });
    const svg = projectScene(root, { width: 100, height: 100 });
    expect(svg).toContain('id="s-box"');
    expect(svg).toContain('d="M 25 75 L 75 75 L 75 25 Z"');
  });

  test("a parent transform matches the math module viewport", () => {
    const root = groupNode({
      transform: { position: { x: 0.25, y: 0, z: 0 } },
      children: [
        perspectiveCameraNode(
          { fovY: Math.PI / 3, aspect: 2, near: 0.5, far: 50 },
          { transform: { position: { x: 0, y: 1, z: 6 } } },
        ),
        meshNode(boxGeometry(), {
          id: "box",
          transform: { position: { x: 1, y: 0, z: 0 } },
        }),
      ],
    });
    const svg = projectScene(root, { width: 80, height: 40 });
    const evaluated = evaluateWorld(root);
    const camera = evaluated[1];
    const box = evaluated[2];
    expect(isPerspectiveCameraNode(camera.node)).toBe(true);
    if (!isPerspectiveCameraNode(camera.node) || camera.view === undefined) return;
    const ndc = projectToNdc(camera.node.camera, camera.view, box.world, { x: -0.5, y: -0.5, z: -0.5 });
    const viewport = viewportMap(ndc, 80, 40);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40">')).toBe(
      true,
    );
    expect(svg).toContain(`${formatUnit(viewport.x)} ${formatUnit(viewport.y)}`);
    expect(svg).toContain('id="s-box"');
  });

  test("clips a triangle and a polyline on the near plane before the divide", () => {
    const surface = parametricGeometry(
      (u, v) => {
        if (u === 0 && v === 0) return { x: 1, y: 0, z: -2 };
        if (u === 0 && v === 1) return { x: 1, y: 2, z: -2 };
        if (u === 1 && v === 0) return { x: 1, y: 0, z: 0 };
        return { x: 1, y: 2, z: -2 };
      },
      1,
      1,
    );
    const meshSvg = projectScene(clipRoot(meshNode(surface, { id: "tri" })), { width: 100, height: 100 });
    expect(meshSvg).toContain(
      '<path d="M 75 50 L 100 50 L 100 0 L 75 0 Z"/>\n<path d="M 100 0 L 100 0 L 75 0 L 75 0 Z"/>',
    );

    const line = projectScene(
      clipRoot(
        path3Node(
          path3([
            { x: 1, y: 0, z: -2 },
            { x: 1, y: 0, z: 0 },
          ]),
          { id: "line" },
        ),
      ),
      { width: 100, height: 100 },
    );
    expect(line).toContain('<path d="M 75 50 L 100 50"/>');
    expect(line.includes(" Z")).toBe(false);

    const split = projectScene(
      clipRoot(
        path3Node(
          path3([
            { x: 1, y: 0, z: -2 },
            { x: 1, y: 0, z: 0 },
            { x: 1, y: 2, z: -2 },
          ]),
          { id: "split" },
        ),
      ),
      { width: 100, height: 100 },
    );
    expect(split).toContain('<path d="M 75 50 L 100 50"/>\n<path d="M 100 0 L 75 0"/>');

    const closed = projectScene(
      clipRoot(
        path3Node(
          path3(
            [
              { x: 1, y: 0, z: -2 },
              { x: -1, y: 0, z: -2 },
              { x: 0, y: 1, z: -2 },
            ],
            true,
          ),
          { id: "loop" },
        ),
      ),
      { width: 100, height: 100 },
    );
    expect(closed).toContain('d="M 75 50 L 25 50 L 50 25 Z"');

    const opened = projectScene(
      clipRoot(
        path3Node(
          path3(
            [
              { x: 1, y: 0, z: -2 },
              { x: 1, y: 2, z: -2 },
              { x: 1, y: 0, z: 0 },
            ],
            true,
          ),
          { id: "cut" },
        ),
      ),
      { width: 100, height: 100 },
    );
    expect(opened.includes(" Z")).toBe(false);
    expect(opened).toContain("<path ");

    const repeated = projectScene(
      clipRoot(
        path3Node(
          path3([
            { x: 1, y: 0, z: -2 },
            { x: 1, y: 0, z: -2 },
            { x: 1, y: 2, z: -2 },
          ]),
          { id: "repeat" },
        ),
      ),
      { width: 100, height: 100 },
    );
    expect(repeated).toContain('<path d="M 75 50 L 75 0"/>');

    const hidden = projectScene(
      clipRoot(
        path3Node(
          path3([
            { x: 0, y: 0, z: 1 },
            { x: 1, y: 0, z: 2 },
          ]),
          { id: "hidden" },
        ),
      ),
      { width: 100, height: 100 },
    );
    expect(hidden).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">\n</svg>\n`,
    );
  });

  test("a mesh behind the camera contributes no path", () => {
    const root = groupNode({
      children: [
        perspectiveCameraNode(
          { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 },
          { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
        ),
        meshNode(boxGeometry(), { id: "box", transform: { position: { x: 0, y: 0, z: 10 } } }),
      ],
    });
    expect(projectScene(root, { width: 100, height: 100 })).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">\n</svg>\n`,
    );
  });

  test("names a node from its stable id and escapes attribute text", () => {
    const bare = projectScene(
      meshNode(boxGeometry(), {
        children: [
          perspectiveCameraNode(
            { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 10 },
            { id: "camera", transform: { position: { x: 0, y: 0, z: 4 } } },
          ),
        ],
      }),
      { width: 100, height: 100 },
    );
    expect(bare).toContain("<g>\n<path ");
    expect(bare.includes('id="s-"')).toBe(false);

    const nested = projectScene(
      groupNode({
        children: [
          perspectiveCameraNode({ fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 10 }, { id: "camera" }),
          groupNode({
            children: [
              path3Node(
                path3([
                  { x: 0, y: 0, z: -2 },
                  { x: 1, y: 0, z: -2 },
                ]),
              ),
            ],
          }),
        ],
      }),
      { width: 100, height: 100 },
    );
    expect(nested).toContain('data-node="s-n1/n0"');

    const escaped = projectScene(
      groupNode({
        children: [
          perspectiveCameraNode({ fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 10 }, { id: "camera" }),
          path3Node(
            path3([
              { x: 0, y: 0, z: -2 },
              { x: 1, y: 0, z: -2 },
            ]),
            { id: `a&b"<c>` },
          ),
        ],
      }),
      { width: 100, height: 100 },
    );
    expect(escaped).toContain('data-node="s-a&amp;b&quot;&lt;c&gt;"');
  });

  test("quantizes the viewport size and refuses a missing camera", () => {
    const root = unitBoxRoot();
    expect(projectScene(root, { width: 100.25, height: 50 })).toContain(
      'width="100.25" height="50" viewBox="0 0 100.25 50"',
    );
    expect(() => projectScene(root, { width: 0, height: 10 })).toThrow("width is not positive");
    expect(() => projectScene(root, { width: -1, height: 10 })).toThrow("width is not positive");
    expect(() => projectScene(root, { width: Number.NaN, height: 10 })).toThrow("width is not positive");
    expect(() => projectScene(root, { width: Number.POSITIVE_INFINITY, height: 10 })).toThrow(
      "width is not positive",
    );
    expect(() => projectScene(root, { width: 10, height: 0 })).toThrow("height is not positive");
    expect(() => projectScene(groupNode(), { width: 10, height: 10 })).toThrow("camera is missing");
    expect(() => projectScene(root, { width: 10, height: 10, cameraId: "box" })).toThrow("camera is missing");
    const two = groupNode({
      children: [
        perspectiveCameraNode({ fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 10 }, { id: "near-cam" }),
        orthographicCameraNode(
          { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 10 },
          { id: "flat-cam", transform: { position: { x: 0, y: 0, z: 4 } } },
        ),
        meshNode(boxGeometry(), { id: "box" }),
      ],
    });
    expect(() => projectScene(two, { width: 100, height: 100 })).toThrow("camera id is required");
    expect(projectScene(two, { width: 100, height: 100, cameraId: "flat-cam" })).toContain(
      'd="M 25 75 L 75 75 L 75 25 Z"',
    );
    expect(() =>
      projectScene(
        groupNode({
          children: [
            perspectiveCameraNode({ fovY: 0, aspect: 1, near: 0.1, far: 10 }, { id: "camera" }),
            meshNode(boxGeometry(), { id: "box" }),
          ],
        }),
        { width: 10, height: 10 },
      ),
    ).toThrow("fovY must be between 0 and π");
    expect(() =>
      projectScene(
        groupNode({
          children: [
            orthographicCameraNode(
              { left: 1, right: 1, top: 1, bottom: -1, near: 0.1, far: 10 },
              { id: "camera" },
            ),
            meshNode(boxGeometry(), { id: "box" }),
          ],
        }),
        { width: 10, height: 10 },
      ),
    ).toThrow("orthographic bounds are degenerate");
    expect(() => projectScene(undefined as unknown as SceneNode, { width: 10, height: 10 })).toThrow(
      "node is missing",
    );
  });

  test("the divider rejects a point behind the camera", () => {
    expect(mapClipToViewport({ x: 0, y: 0, z: -1, w: 1 }, 100, 100)).toEqual({ x: 50, y: 50 });
    expect(() => mapClipToViewport({ x: 0, y: 0, z: 0, w: 0 }, 100, 100)).toThrow(
      "point is behind the camera",
    );
    expect(() => mapClipToViewport({ x: 1, y: 2, z: 3, w: -0.5 }, 100, 100)).toThrow(
      "point is behind the camera",
    );
  });
});
