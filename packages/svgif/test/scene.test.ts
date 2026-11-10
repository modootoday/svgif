import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lookAt, type Mat4 } from "../src/math/index.ts";
import {
  evaluateWorld,
  groupNode,
  isOrthographicCameraNode,
  isPerspectiveCameraNode,
  localMatrix,
  nodeTransform,
  orthographicCameraNode,
  perspectiveCameraNode,
  selectorId,
  stableId,
  type SceneNode,
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
    expect(() => evaluateWorld({ kind: "mesh" } as SceneNode)).toThrow("node kind is not a scene kind");
    const broken = groupNode();
    (broken as { children: unknown }).children = "no";
    expect(() => evaluateWorld(broken)).toThrow("children is not a list");
    expect(() => groupNode({ children: "no" as unknown as SceneNode[] })).toThrow(
      "children is not a list",
    );
    expect(() => evaluateWorld(undefined as unknown as SceneNode)).toThrow("node is missing");
  });

  test("the scene module does not read a wall clock or a random source", () => {
    const source = readFileSync(new URL("../src/scene/index.ts", import.meta.url), "utf8");
    expect(source.includes("Date.now")).toBe(false);
    expect(source.includes("performance.now")).toBe(false);
    expect(source.includes("Math.random")).toBe(false);
    expect(source.includes("quantize1e4")).toBe(false);
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
