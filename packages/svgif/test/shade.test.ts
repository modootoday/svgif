import { describe, expect, test } from "bun:test";
import { identity, multiply, perspective, transformPoint, type Vec3 } from "../src/math/index.ts";
import { facesAway, shadeTriangles, type ClipCorner, type Rgb, type ShadeFace } from "../src/shade/index.ts";

/**
 * Cull and painter order for flat Lambert faces.
 * [[sot:svgif/scene-3d]] [[adr:svgif/20261110120500]]
 */

const WHITE: Rgb = { r: 1, g: 1, b: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const UP = { x: 0, y: 0, z: 1 };

function corner(x: number, y: number, z: number, w = 1): ClipCorner {
  return { x, y, z, w };
}

/** Winding whose clip-space normal z is positive, so the face points at the camera. */
function front(z: number, nodeId: string, faceIndex: number, shift = 0): ShadeFace {
  return {
    nodeId,
    faceIndex,
    normal: UP,
    clip: [corner(-1 + shift, -1, z), corner(1 + shift, -1, z), corner(1 + shift, 1, z)],
  };
}

/** Opposite winding. The clip-space normal points away from the camera. */
function back(z: number, nodeId: string, faceIndex: number): ShadeFace {
  return {
    nodeId,
    faceIndex,
    normal: UP,
    clip: [corner(-1, -1, z), corner(1, 1, z), corner(1, -1, z)],
  };
}

function shade(
  faces: readonly ShadeFace[],
  albedo: Rgb = WHITE,
  diffuse: Rgb = WHITE,
  ambient: Rgb = BLACK,
) {
  return shadeTriangles(faces, { albedo }, { ambient, directional: [{ direction: UP, diffuse }] });
}

describe("back-face cull", () => {
  test("drops a triangle whose clip-space normal points away", () => {
    const away = back(1, "box", 0);
    const toward = front(1, "box", 1);
    expect(facesAway(away.clip)).toBe(true);
    expect(facesAway(toward.clip)).toBe(false);

    const shaded = shade([away, toward]);
    expect(shaded.map((face) => face.faceIndex)).toEqual([1]);
    expect(shaded[0].nodeId).toBe("box");
  });

  test("drops the winding that faces away under the perspective projection", () => {
    const camera = { fovY: Math.PI / 2, aspect: 1, near: 0.1, far: 100 };
    const mvp = multiply(perspective(camera), identity());
    const toClip = (point: Vec3): ClipCorner => transformPoint(mvp, point);
    const toward = toClip({ x: -1, y: -1, z: -2 });
    const right = toClip({ x: 1, y: -1, z: -2 });
    const up = toClip({ x: 1, y: 1, z: -2 });
    const facing: ShadeFace = { nodeId: "view", faceIndex: 0, normal: UP, clip: [toward, right, up] };
    const reversed: ShadeFace = { nodeId: "view", faceIndex: 1, normal: UP, clip: [toward, up, right] };
    const shaded = shade([reversed, facing]);
    expect(shaded.map((face) => face.faceIndex)).toEqual([0]);
  });

  test("drops an edge-on triangle whose normal z is zero", () => {
    const edge: ShadeFace = {
      nodeId: "edge",
      faceIndex: 0,
      normal: UP,
      clip: [corner(0, 0, 1), corner(1, 0, 1), corner(1, 0, 2)],
    };
    expect(facesAway(edge.clip)).toBe(true);
    expect(shade([edge, front(4, "keep", 0)]).map((face) => face.nodeId)).toEqual(["keep"]);
  });
});

describe("painter sort", () => {
  test("puts the larger clip-space z first and breaks a shared z by node id then face index", () => {
    const shared = 2;
    const shaded = shade([
      front(shared, "mesh-b", 0),
      front(shared, "mesh-a", 1),
      front(9, "later", 0),
      front(shared, "mesh-a", 0),
      front(shared, "mesh-a", 0, 0.25),
    ]);

    expect(shaded.map((face) => face.depth)).toEqual([9, shared, shared, shared, shared]);
    expect(shaded.map((face) => [face.nodeId, face.faceIndex])).toEqual([
      ["later", 0],
      ["mesh-a", 0],
      ["mesh-a", 0],
      ["mesh-a", 1],
      ["mesh-b", 0],
    ]);
    expect(shaded[1].depth).toBe(shaded[4].depth);
  });
});

describe("Lambert fill", () => {
  test("encodes a fully lit albedo to 8-bit sRGB", () => {
    const [face] = shade([front(1, "red", 0)], { r: 1, g: 0, b: 0 });
    expect(face.color).toBe("#ff0000");
    expect(face.fill).toBe("#ff0000");
    expect(face.gradient).toBeUndefined();
  });

  test("encodes linear 0.2 through the sRGB gamma curve", () => {
    // 1.055 * 0.2^(1/2.4) - 0.055, then the 8-bit half-up step, is 124.
    const [face] = shade([front(1, "grey", 0)], WHITE, BLACK, { r: 0.2, g: 0.2, b: 0.2 });
    expect(face.color).toBe("#7c7c7c");
  });

  test("uses the linear segment for a very dark channel", () => {
    // 0.001 * 12.92 * 255 rounds to 3.
    const [face] = shade([front(1, "dark", 0)], WHITE, BLACK, { r: 0.001, g: 0.001, b: 0.001 });
    expect(face.color).toBe("#030303");
  });

  test("clamps a negative light contribution to zero", () => {
    const [face] = shadeTriangles(
      [front(1, "dark", 0)],
      { albedo: WHITE },
      {
        ambient: BLACK,
        directional: [{ direction: { x: 0, y: 0, z: -1 }, diffuse: WHITE }],
      },
    );
    expect(face.color).toBe("#000000");
  });

  test("adds a second directional light and rejects a third", () => {
    const face = front(1, "sum", 0);
    const lights = {
      ambient: BLACK,
      directional: [
        { direction: UP, diffuse: { r: 0.25, g: 0, b: 0 } },
        { direction: UP, diffuse: { r: 0.25, g: 0, b: 0 } },
      ],
    };
    // Two contributions of 0.25 make linear 0.5. The gamma byte is 188.
    const [shaded] = shadeTriangles([face], { albedo: WHITE, shaded: "lambert" }, lights);
    expect(shaded.color).toBe("#bc0000");

    expect(() =>
      shadeTriangles([face], { albedo: WHITE }, {
        ambient: BLACK,
        directional: [...lights.directional, { direction: UP, diffuse: WHITE }],
      }),
    ).toThrow("one or two directional lights");
  });

  test("rejects specular and any other shaded mode", () => {
    const face = front(1, "mode", 0);
    const lights = { ambient: BLACK, directional: [{ direction: UP, diffuse: WHITE }] };
    expect(() => shadeTriangles([face], { albedo: WHITE, shaded: "specular" as "lambert" }, lights)).toThrow(
      "specular is out of v1",
    );
    expect(() => shadeTriangles([face], { albedo: WHITE, shaded: "flat" as "lambert" }, lights)).toThrow(
      "shaded mode is not lambert",
    );
  });
});

describe("lambert gradient", () => {
  test("runs the gradient along the first light and keeps the Lambert color", () => {
    const face: ShadeFace = {
      nodeId: "grad",
      faceIndex: 3,
      normal: { x: 1, y: 0, z: 0 },
      clip: [corner(-0.5, 0, 1), corner(0.5, 0, 1), corner(0, 0.2, 1)],
    };
    const [shaded] = shadeTriangles(
      [face],
      { albedo: { r: 1, g: 0, b: 0 }, shaded: "lambert-gradient" },
      {
        ambient: BLACK,
        directional: [
          { direction: { x: 1, y: 0, z: 0 }, diffuse: WHITE },
          { direction: UP, diffuse: BLACK },
        ],
      },
      { width: 100, height: 100 },
    );
    expect(shaded.color).toBe("#ff0000");
    expect(shaded.fill).toBe("url(#shade-0)");
    expect(shaded.gradient).toEqual({
      id: "shade-0",
      x1: 25,
      y1: 50,
      x2: 75,
      y2: 50,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#ff0000" },
      ],
    });
  });

  test("flips the light y so SVG y grows downward", () => {
    const face: ShadeFace = {
      nodeId: "up",
      faceIndex: 0,
      normal: UP,
      clip: [corner(0, 0.6, 1), corner(0, -0.6, 1), corner(0.2, 0, 1)],
    };
    const [shaded] = shadeTriangles(
      [face],
      { albedo: WHITE, shaded: "lambert-gradient" },
      { ambient: BLACK, directional: [{ direction: { x: 0, y: 1, z: 0 }, diffuse: WHITE }] },
      { width: 100, height: 100 },
    );
    expect(shaded.gradient?.x1).toBe(50);
    expect(shaded.gradient?.y1).toBe(80);
    expect(shaded.gradient?.x2).toBe(50);
    expect(shaded.gradient?.y2).toBe(20);
  });

  test("uses a perpendicular axis when the light axis is flat on screen", () => {
    const face: ShadeFace = {
      nodeId: "flat-axis",
      faceIndex: 0,
      normal: UP,
      clip: [corner(1, 0, 1, 1), corner(2, 0, 1, 2), corner(1, 1, 1, 1)],
    };
    const [shaded] = shadeTriangles(
      [face],
      { albedo: WHITE, shaded: "lambert-gradient" },
      { ambient: BLACK, directional: [{ direction: { x: 1, y: 0, z: 0 }, diffuse: WHITE }] },
      { width: 100, height: 100 },
    );
    expect(shaded.gradient?.x1).toBe(100);
    expect(shaded.gradient?.x2).toBe(100);
    expect(shaded.gradient?.y1).toBe(0);
    expect(shaded.gradient?.y2).toBe(50);
  });

  test("uses +X in the screen when the light faces the camera", () => {
    const [shaded] = shadeTriangles(
      [front(1, "camera-light", 0)],
      { albedo: WHITE, shaded: "lambert-gradient" },
      { ambient: BLACK, directional: [{ direction: UP, diffuse: WHITE }] },
      { width: 100, height: 100 },
    );
    expect((shaded.gradient?.x2 ?? 0) > (shaded.gradient?.x1 ?? 0)).toBe(true);
  });

  test("rejects a corner behind the camera and a missing viewport", () => {
    const behind: ShadeFace = {
      nodeId: "behind",
      faceIndex: 0,
      normal: UP,
      clip: [corner(-1, -1, 1, -1), corner(1, -1, 1, 1), corner(1, 1, 1, 1)],
    };
    const lights = { ambient: BLACK, directional: [{ direction: UP, diffuse: WHITE }] };
    expect(() =>
      shadeTriangles([behind], { albedo: WHITE, shaded: "lambert-gradient" }, lights, {
        width: 100,
        height: 100,
      }),
    ).toThrow("point is behind the camera");
    expect(() => shadeTriangles([front(1, "g", 0)], { albedo: WHITE, shaded: "lambert-gradient" }, lights)).toThrow(
      "viewport is required for a lambert gradient",
    );
    expect(() =>
      shadeTriangles([front(1, "g", 0)], { albedo: WHITE, shaded: "lambert-gradient" }, lights, {
        width: 0,
        height: 10,
      }),
    ).toThrow("width is not positive");
    expect(() =>
      shadeTriangles([front(1, "g", 0)], { albedo: WHITE, shaded: "lambert-gradient" }, lights, {
        width: 10,
        height: Number.NaN,
      }),
    ).toThrow("height is not positive");
  });
});

describe("input checks", () => {
  const lights = { ambient: BLACK, directional: [{ direction: UP, diffuse: WHITE }] };
  const material = { albedo: WHITE };

  test("rejects an empty light list, a missing material, and a broken face", () => {
    expect(() => shadeTriangles([front(1, "a", 0)], material, { ambient: BLACK, directional: [] })).toThrow(
      "one or two directional lights",
    );
    expect(() => shadeTriangles([front(1, "a", 0)], material, undefined as unknown as typeof lights)).toThrow(
      "directional lights are missing",
    );
    expect(() => shadeTriangles([front(1, "a", 0)], undefined as unknown as typeof material, lights)).toThrow(
      "material is missing",
    );
    expect(() =>
      shadeTriangles([front(1, "a", 0)], material, {
        ambient: BLACK,
        directional: [undefined as unknown as (typeof lights.directional)[number]],
      }),
    ).toThrow("directional light is missing");
    expect(() =>
      shadeTriangles([front(1, "a", 0)], material, {
        ambient: BLACK,
        directional: [{ direction: { x: 0, y: 0, z: 0 }, diffuse: WHITE }],
      }),
    ).toThrow("directional light 0 has zero length");
    expect(() =>
      shadeTriangles([front(1, "a", 0)], material, {
        ambient: BLACK,
        directional: [{ direction: { x: Number.NaN, y: 0, z: 1 }, diffuse: WHITE }],
      }),
    ).toThrow("directional light 0 has a non-finite number");
    expect(() =>
      shadeTriangles([front(1, "a", 0)], material, {
        ambient: BLACK,
        directional: [{ direction: UP, diffuse: { r: Number.NaN, g: 0, b: 0 } }],
      }),
    ).toThrow("diffuse 0 has a non-finite number");
    expect(() => shadeTriangles([front(1, "a", 0)], { albedo: { r: 1, g: Number.NaN, b: 0 } }, lights)).toThrow(
      "albedo has a non-finite number",
    );
    expect(() =>
      shadeTriangles([front(1, "a", 0)], material, {
        ambient: { r: 0, g: 0, b: Number.POSITIVE_INFINITY },
        directional: lights.directional,
      }),
    ).toThrow("ambient has a non-finite number");

    const broken = front(1, "a", 0);
    expect(() => shadeTriangles([undefined as unknown as ShadeFace], material, lights)).toThrow(
      "node id is missing",
    );
    expect(() => shadeTriangles([{ ...broken, nodeId: undefined as unknown as string }], material, lights)).toThrow(
      "node id is missing",
    );
    expect(() => shadeTriangles([{ ...broken, faceIndex: 1.5 }], material, lights)).toThrow(
      "face index is not a whole number",
    );
    expect(() => shadeTriangles([{ ...broken, faceIndex: -1 }], material, lights)).toThrow(
      "face index is not a whole number",
    );
    expect(() => shadeTriangles([{ ...broken, clip: undefined as unknown as ShadeFace["clip"] }], material, lights)).toThrow(
      "face is not a triangle",
    );
    expect(() =>
      shadeTriangles(
        [{ ...broken, clip: [broken.clip[0], broken.clip[1], { x: 0, y: 0, z: Number.NaN, w: 1 }] }],
        material,
        lights,
      ),
    ).toThrow("clip corner has a non-finite number");
    expect(() =>
      shadeTriangles(
        [{ ...broken, clip: [broken.clip[0], null as unknown as ClipCorner, broken.clip[2]] }],
        material,
        lights,
      ),
    ).toThrow("clip corner has a non-finite number");
    expect(() => shadeTriangles([{ ...broken, normal: { x: 0, y: 0, z: 0 } }], material, lights)).toThrow(
      "face normal has zero length",
    );
    expect(() =>
      shadeTriangles([{ ...broken, normal: { x: 0, y: Number.NaN, z: 1 } }], material, lights),
    ).toThrow("face normal has a non-finite number");
  });
});
