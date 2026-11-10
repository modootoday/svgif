import { describe, expect, test } from "bun:test";
import {
  compose,
  eulerXYZFromQuaternion,
  identity,
  invert,
  lookAt,
  multiply,
  orthographic,
  perspective,
  perspectiveCamera,
  projectToNdc,
  quaternionFromEulerXYZ,
  transformPoint,
  viewportMap,
  type Mat4,
  type PerspectiveCamera,
  type Vec3,
} from "../src/math/index.ts";

const EPSILON = 1e-4;

function expectNear(actual: number, expected: number, epsilon = EPSILON): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
}

function expectVec(actual: Vec3, expected: Vec3, epsilon = EPSILON): void {
  expectNear(actual.x, expected.x, epsilon);
  expectNear(actual.y, expected.y, epsilon);
  expectNear(actual.z, expected.z, epsilon);
}

function expectMat(actual: Mat4, expected: Mat4, epsilon = 1e-9): void {
  for (let index = 0; index < 16; index++) {
    expectNear(actual[index], expected[index], epsilon);
  }
}

describe("perspective NDC", () => {
  test("projects (0, 0, -1) with an explicit camera and an identity view", () => {
    const camera: PerspectiveCamera = {
      fovY: Math.PI / 2,
      aspect: 1,
      near: 0.5,
      far: 2,
    };
    // Hand NDC, before emit quantization.
    // f = 1 / tan(π/4) = 1, so clip.x = 0 and clip.y = 0.
    // clip.w = 1.
    // clip.z = (-2 - 0.5 + 2 * 2 * 0.5) / (0.5 - 2) = -0.5 / -1.5 = 1/3.
    const handNdc = { x: 0, y: 0, z: 1 / 3 };

    const ndc = projectToNdc(camera, identity(), identity(), { x: 0, y: 0, z: -1 });

    expectVec(ndc, handNdc);
    expect(Math.abs(ndc.z - handNdc.z)).toBeLessThan(1e-9);
  });

  test("divides by clip.w when the point is not on a plane of w = 1", () => {
    const camera: PerspectiveCamera = {
      fovY: Math.PI / 2,
      aspect: 1,
      near: 0.5,
      far: 2,
    };
    // Point (0, 0, -2) sits on the far plane.
    // clip.w = 2 and clip.z = 2, so NDC z is 1. Skipping the divide would leave 2.
    const ndc = projectToNdc(camera, identity(), identity(), { x: 0, y: 0, z: -2 });
    expectVec(ndc, { x: 0, y: 0, z: 1 });

    // clip.x = 1, clip.w = 2, so NDC x is 1/2.
    const offset = projectToNdc(camera, identity(), identity(), { x: 1, y: 0, z: -2 });
    expectVec(offset, { x: 0.5, y: 0, z: 1 });
  });

  test("uses focal length and aspect in x and y", () => {
    const wide = projectToNdc(
      { fovY: Math.PI / 2, aspect: 2, near: 0.5, far: 2 },
      identity(),
      identity(),
      { x: 1, y: 0, z: -1 },
    );
    // f / aspect = 1/2, clip.w = 1, so NDC x is 1/2.
    expectVec(wide, { x: 0.5, y: 0, z: 1 / 3 });

    const narrow = projectToNdc(
      { fovY: Math.PI / 3, aspect: 1, near: 0.5, far: 2 },
      identity(),
      identity(),
      { x: 0, y: 1, z: -1 },
    );
    // f = 1 / tan(π/6) = √3. clip.w = 1.
    expectVec(narrow, { x: 0, y: Math.sqrt(3), z: 1 / 3 }, 1e-9);
  });

  test("applies a world translation before the identity view", () => {
    const world = compose({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 1, z: 1 });
    const ndc = projectToNdc(
      { fovY: Math.PI / 2, aspect: 1, near: 0.5, far: 2 },
      identity(),
      world,
      { x: 0, y: 0, z: 0 },
    );
    expectVec(ndc, { x: 0, y: 0, z: 1 / 3 });
  });

  test("refuses a point behind the camera", () => {
    const camera: PerspectiveCamera = {
      fovY: Math.PI / 2,
      aspect: 1,
      near: 0.5,
      far: 2,
    };
    expect(() => projectToNdc(camera, identity(), identity(), { x: 0, y: 0, z: 1 })).toThrow(
      "point is behind the camera",
    );
  });
});

describe("matrices", () => {
  test("multiplies column-major matrices in application order", () => {
    const translate: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      5, 0, 0, 1,
    ];
    const scaleX: Mat4 = [
      2, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const translateThenScale = transformPoint(multiply(scaleX, translate), { x: 1, y: 0, z: 0 });
    const scaleThenTranslate = transformPoint(multiply(translate, scaleX), { x: 1, y: 0, z: 0 });
    expect(translateThenScale.x).toBe(12);
    expect(scaleThenTranslate.x).toBe(7);
    expectMat(multiply(identity(), translate), translate);
  });

  test("inverts a swapped pivot and a perspective matrix", () => {
    const swap: Mat4 = [
      0, 1, 0, 0,
      1, 0, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    expectMat(invert(swap), swap);
    expectMat(multiply(swap, invert(swap)), identity());

    const camera = perspective({ fovY: Math.PI / 3, aspect: 16 / 9, near: 0.25, far: 40 });
    expectMat(multiply(camera, invert(camera)), identity(), 1e-8);
  });

  test("rejects a singular matrix", () => {
    const zero = identity();
    for (let index = 0; index < 16; index++) zero[index] = 0;
    expect(() => invert(zero)).toThrow("singular matrix");
  });

  test("composes translation, rotation, and scale", () => {
    const quaternion = quaternionFromEulerXYZ({ x: 0, y: 0, z: Math.PI / 2 });
    expectNear(quaternion.x, 0, 1e-12);
    expectNear(quaternion.y, 0, 1e-12);
    expectNear(quaternion.z, Math.SQRT1_2, 1e-12);
    expectNear(quaternion.w, Math.SQRT1_2, 1e-12);

    const matrix = compose({ x: 10, y: 0, z: 0 }, quaternion, { x: 2, y: 1, z: 1 });
    const moved = transformPoint(matrix, { x: 1, y: 0, z: 0 });
    expectNear(moved.x, 10, 1e-12);
    expectNear(moved.y, 2, 1e-12);
    expectNear(moved.z, 0, 1e-12);
    expectNear(moved.w, 1, 1e-12);

    const back = transformPoint(invert(matrix), { x: moved.x, y: moved.y, z: moved.z });
    expectNear(back.x, 1, 1e-9);
    expectNear(back.y, 0, 1e-9);
    expectNear(back.z, 0, 1e-9);
  });

  test("round-trips an intrinsic XYZ Euler triple", () => {
    const euler = { x: 0.3, y: -0.4, z: 0.5 };
    const again = eulerXYZFromQuaternion(quaternionFromEulerXYZ(euler));
    expectVec(again, euler, 1e-12);
    const identityEuler = eulerXYZFromQuaternion({ x: 0, y: 0, z: 0, w: 1 });
    expectVec(identityEuler, { x: 0, y: 0, z: 0 }, 1e-12);
  });
});

describe("cameras and viewport", () => {
  test("lookAt of the origin down negative Z is the identity view", () => {
    const view = lookAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    expectMat(view, identity());

    const pulledBack = lookAt({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const origin = transformPoint(pulledBack, { x: 0, y: 0, z: 0 });
    expectNear(origin.x, 0, 1e-12);
    expectNear(origin.y, 0, 1e-12);
    expectNear(origin.z, -5, 1e-12);

    const ndc = projectToNdc(
      { fovY: Math.PI / 2, aspect: 1, near: 0.5, far: 2 },
      pulledBack,
      identity(),
      { x: 0, y: 0, z: 0 },
    );
    // clip.w = 5 and clip.z = 7, so NDC z is 7/5.
    expectVec(ndc, { x: 0, y: 0, z: 1.4 }, 1e-9);
  });

  test("rejects a lookAt with no direction or no up", () => {
    expect(() => lookAt({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 1, z: 0 })).toThrow(
      "zero length vector",
    );
    expect(() => lookAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -1 })).toThrow(
      "zero length vector",
    );
  });

  test("defaults aspect to width over height", () => {
    const sized = perspectiveCamera(Math.PI / 2, 0.5, 2, { width: 1920, height: 1080 });
    expect(sized.aspect).toBe(1920 / 1080);
    const explicit = perspectiveCamera(Math.PI / 4, 0.1, 10, 1.5);
    expect(explicit).toEqual({ fovY: Math.PI / 4, aspect: 1.5, near: 0.1, far: 10 });
    expect(() => perspectiveCamera(Math.PI / 2, 0.5, 2, { width: 100, height: 0 })).toThrow(
      "height is zero",
    );
  });

  test("rejects a degenerate perspective or orthographic camera", () => {
    expect(() => perspective({ fovY: 0, aspect: 1, near: 0.1, far: 1 })).toThrow(/fovY/);
    expect(() => perspective({ fovY: Math.PI, aspect: 1, near: 0.1, far: 1 })).toThrow(/fovY/);
    expect(() => perspective({ fovY: Math.PI / 2, aspect: 0, near: 0.1, far: 1 })).toThrow(
      "degenerate",
    );
    expect(() => perspective({ fovY: Math.PI / 2, aspect: 1, near: 2, far: 2 })).toThrow(
      "degenerate",
    );
    expect(() =>
      orthographic({ left: 0, right: 0, top: 1, bottom: -1, near: 0.1, far: 1 }),
    ).toThrow("degenerate");
  });

  test("projects an orthographic point to hand NDC", () => {
    const camera = { left: -2, right: 2, top: 1, bottom: -1, near: 0.5, far: 2 };
    const matrix = orthographic(camera);
    // x: 2/4 * 2 + 0 = 1. z: 2/(0.5-2) * -1 + (2.5)/(0.5-2) = 4/3 - 5/3 = -1/3.
    const clip = transformPoint(matrix, { x: 2, y: 0, z: -1 });
    expectNear(clip.x, 1, 1e-12);
    expectNear(clip.y, 0, 1e-12);
    expectNear(clip.z, -1 / 3, 1e-12);
    expectNear(clip.w, 1, 1e-12);

    const ndc = projectToNdc(camera, identity(), identity(), { x: 2, y: 0, z: -1 });
    expectVec(ndc, { x: 1, y: 0, z: -1 / 3 }, 1e-12);
  });

  test("maps NDC into a y-down viewport", () => {
    expect(viewportMap({ x: 0, y: 0, z: 0 }, 200, 100)).toEqual({ x: 100, y: 50 });
    expect(viewportMap({ x: 1, y: 1, z: 0 }, 200, 100)).toEqual({ x: 200, y: 0 });
    expect(viewportMap({ x: -1, y: -1, z: 0 }, 200, 100)).toEqual({ x: 0, y: 100 });
  });
});
