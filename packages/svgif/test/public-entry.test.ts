/**
 * The public entry `src/index.ts`. Its object has exactly the keys of
 * `SvgifPublicApi`, the named exports are the same values (rule 8), and the
 * sketch of [[sot:svgif/public-api]] runs against it. The sketch is read from
 * the record itself. The engine-test job installs no npm packages, so this
 * file does not use the TypeScript compiler.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as entry from "../src/index.ts";
import svgif from "../src/index.ts";
import { stepSpring } from "../src/ir/spring.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SOT_PATH = join(ROOT, ".spec/sot/public-api.sot.md");
const TYPES_PATH = join(import.meta.dir, "..", "src", "public-types.ts");

/** Strip comments and string contents, so brackets inside them do not count. Same approach as `public-api.test.ts`. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (text) => text[0] + " ".repeat(text.length - 2) + text[0]);
}

/** Member names of one interface: the names that start a member at depth 1 inside its braces. */
function interfaceKeys(source: string, interfaceName: string): string[] {
  const text = code(source);
  const head = new RegExp(`\\binterface\\s+${interfaceName}\\b[^{]*\\{`).exec(text);
  if (!head) throw new Error(`interface ${interfaceName} not found`);
  const keys: string[] = [];
  let depth = 0;
  let member = "";
  const flush = () => {
    const trimmed = member.trim();
    member = "";
    if (!trimmed) return;
    const name = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:(<]/.exec(trimmed);
    if (!name) throw new Error(`interface ${interfaceName} has a member that is not a plain key`);
    keys.push(name[1]);
  };
  for (let index = head.index + head[0].length; index < text.length; index++) {
    const char = text[index];
    if (depth === 0 && char === "}") {
      flush();
      return keys.sort();
    }
    if (char === "{" || char === "(" || char === "[" || char === "<") depth++;
    else if (char === "}" || char === ")" || char === "]" || (char === ">" && text[index - 1] !== "=")) depth--;
    if (depth === 0 && (char === ";" || char === ",")) flush();
    else member += char;
  }
  throw new Error(`interface ${interfaceName} is not closed`);
}

interface SketchResult {
  svg: string;
  file: { svg: string; css?: string };
  composition: ReturnType<typeof svgif.composition>;
  cube: InstanceType<typeof svgif.Mesh>;
  scene: InstanceType<typeof svgif.Scene>;
}

/** The ts sketch of the public-api record, run as written with `svgif` bound to the entry. */
function runSketch(): SketchResult {
  const markdown = readFileSync(SOT_PATH, "utf8");
  const sketch = /```ts\n([\s\S]*?)```/.exec(markdown);
  if (!sketch) throw new Error("public-api record has no ts sketch");
  const run = new Function("svgif", `${sketch[1]}\nreturn { svg, file, composition, cube, scene };`);
  return run(svgif) as SketchResult;
}

function cubeComposition(durationInFrames = 90) {
  const scene = new svgif.Scene();
  const camera = new svgif.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 8);
  const cube = new svgif.Mesh(new svgif.BoxGeometry(1, 1, 1), { fill: "#e8ff47" });
  scene.add(cube);
  const composition = svgif.composition({ id: "t", width: 320, height: 180, fps: 30, durationInFrames, scene, camera });
  return { composition, cube, scene, camera };
}

const SVG_DOCUMENT = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>\n[\s\S]*<\/svg>\n$/;

describe("public entry object", () => {
  test("its keys equal the keys of SvgifPublicApi", () => {
    const declared = interfaceKeys(readFileSync(TYPES_PATH, "utf8"), "SvgifPublicApi");
    expect(Object.keys(svgif).sort()).toEqual(declared);
  });

  test("named exports are the default export's values (rule 8)", () => {
    const named = Object.keys(entry)
      .filter((name) => name !== "default")
      .sort();
    expect(named).toEqual(Object.keys(svgif).sort());
    const record = entry as unknown as Record<string, unknown>;
    const object = svgif as unknown as Record<string, unknown>;
    for (const name of named) expect(record[name]).toBe(object[name]);
  });

  test("internal compile(ir, backend) is not a key", () => {
    expect("lower" in svgif).toBe(false);
    expect("bake" in svgif).toBe(false);
    expect(svgif.compile.length).toBe(2);
  });
});

describe("the public-api sketch", () => {
  test("returns an SVG frame and a self-contained smil file", () => {
    const { svg, file } = runSketch();
    expect(svg).toMatch(SVG_DOCUMENT);
    expect(svg).toContain("<path ");
    expect(Object.keys(file)).toEqual(["svg"]);
    expect(file.svg).toContain("<svg");
    expect(file.svg).toContain("<animate");
  });

  test("css is set only for css-external", () => {
    const { composition } = runSketch();
    const external = svgif.compile(composition, { backend: "css-external" });
    expect(typeof external.css).toBe("string");
    expect((external.css ?? "").length).toBeGreaterThan(0);
    expect(external.svg).toContain("<svg");
    const embedded = svgif.compile(composition, { backend: "css-embedded" });
    expect(embedded.css).toBeUndefined();
    expect(embedded.svg).toContain("<style");
    expect(svgif.compile(composition, { backend: "smil" }).css).toBeUndefined();
  });

  test("frame 0 and a later frame differ for the rotating cube", () => {
    const { composition } = runSketch();
    const first = svgif.renderFrame(composition, 0);
    const later = svgif.renderFrame(composition, 12);
    expect(first).toMatch(SVG_DOCUMENT);
    expect(later).not.toBe(first);
  });

  test("sampling leaves the authored transforms in place", () => {
    const { cube } = runSketch();
    expect({ x: cube.rotation.x, y: cube.rotation.y, z: cube.rotation.z }).toEqual({ x: 0, y: 0, z: 0 });
    expect({ x: cube.position.x, y: cube.position.y, z: cube.position.z }).toEqual({ x: 0, y: 0, z: 0 });
  });

  test("compile and renderFrame are deterministic", () => {
    const a = runSketch();
    const b = runSketch();
    expect(a.svg).toBe(b.svg);
    expect(a.file.svg).toBe(b.file.svg);
  });
});

describe("interpolate and spring", () => {
  test("both throw outside a sequence", () => {
    expect(() => svgif.interpolate(0, 1)).toThrow(/outside a sequence/);
    expect(() => svgif.spring({})).toThrow(/outside a sequence/);
  });

  test("they read the sequence frame and repeat the same number", () => {
    const { composition } = cubeComposition(60);
    const seen: Array<{ frame: number; linear: number; eased: number; spring: number }> = [];
    let frame = -1;
    composition.sequence(10, 40, () => {
      seen.push({
        frame,
        linear: svgif.interpolate(0, 100),
        eased: svgif.interpolate(0, 100, { easing: "cubic-bezier(0.2,0,0,1)" }),
        spring: svgif.spring({ stiffness: 120, damping: 14, mass: 1, from: 0, to: 1 }),
      });
    });
    for (const at of [5, 10, 30, 30, 49]) {
      frame = at;
      svgif.renderFrame(composition, at);
    }
    // Frame 5 is before the sequence: the body does not run.
    expect(seen.map((item) => item.frame)).toEqual([10, 30, 30, 49]);
    const [start, middle, again, last] = seen;
    expect(start).toEqual({ frame: 10, linear: 0, eased: 0, spring: 0 });
    expect(middle.linear).toBe(50);
    expect(middle).toEqual({ ...again });
    expect(last.linear).toBe(97.5);

    // The spring is the discrete oscillator stepped at dt = 1/30 from the sequence's frame 0.
    let position = 0;
    let velocity = 0;
    for (let step = 0; step < 20; step++) {
      const next = stepSpring(position, velocity, 1, 1 / 30, { stiffness: 120, damping: 14, mass: 1 });
      position = next.position;
      velocity = next.velocity;
    }
    expect(middle.spring).toBe(position);
  });

  test("they do not read Date", () => {
    const { composition } = cubeComposition(30);
    const values: number[] = [];
    composition.sequence(0, 30, () => {
      values.push(svgif.interpolate(0, 1), svgif.spring({ to: 2 }));
    });
    const original = Date.now;
    Date.now = () => {
      throw new Error("Date.now was read");
    };
    try {
      svgif.renderFrame(composition, 7);
    } finally {
      Date.now = original;
    }
    expect(values.length).toBe(2);
  });
});

describe("renderFrame", () => {
  test("returns one SVG document and rejects a non-integer frame", () => {
    const { composition } = cubeComposition();
    const svg = svgif.renderFrame(composition, 0);
    expect(svg).toMatch(SVG_DOCUMENT);
    expect(svg.match(/<svg/g)?.length).toBe(1);
    expect(svg).toContain('fill="#e8ff47"');
    expect(() => svgif.renderFrame(composition, 1.5)).toThrow(TypeError);
  });

  test("composition requires a scene and a camera", () => {
    const camera = new svgif.PerspectiveCamera(35, 1, 0.1, 100);
    const options = { id: "x", width: 10, height: 10, fps: 30, durationInFrames: 1 };
    expect(() => svgif.composition({ ...options, camera } as never)).toThrow(/scene/);
    expect(() => svgif.composition({ ...options, scene: new svgif.Scene() } as never)).toThrow(/camera/);
  });
});

describe("player and export", () => {
  test("player.mount static inserts the compiled artifact", () => {
    const { composition } = cubeComposition(10);
    const host = { innerHTML: "" };
    const handle = svgif.player.mount(host, composition, { mode: "static" });
    expect(host.innerHTML).toContain("<svg");
    handle.unmount();
    expect(host.innerHTML).toBe("");
  });

  test("player.mount scrub falls back to renderFrame when SMIL cannot seek", () => {
    const { composition } = cubeComposition(10);
    const host = { innerHTML: "", querySelector: () => null };
    const handle = svgif.player.mount(host, composition, { mode: "scrub" });
    expect(host.innerHTML).toBe(svgif.renderFrame(composition, 0));
    handle.seek(4);
    expect(host.innerHTML).toBe(svgif.renderFrame(composition, 4));
  });

  test("exportInBrowser writes an SVG blob", async () => {
    const { composition } = cubeComposition(4);
    const blob = await svgif.exportInBrowser(composition, { codec: "svg" });
    expect(blob.type).toBe("image/svg+xml");
    expect(await blob.text()).toContain("<svg");
  });

  test("exportInBrowser rejects with UnsupportedError when the codec path is missing", async () => {
    const { composition } = cubeComposition(4);
    const gif = await svgif.exportInBrowser(composition, { codec: "gif" }).catch((error: unknown) => error);
    expect(gif).toBeInstanceOf(svgif.UnsupportedError);
    expect((gif as Error).name).toBe("UnsupportedError");
    const root = globalThis as { OffscreenCanvas?: unknown; document?: unknown };
    if (root.OffscreenCanvas === undefined && root.document === undefined) {
      const webp = await svgif.exportInBrowser(composition, { codec: "webp" }).catch((error: unknown) => error);
      expect(webp).toBeInstanceOf(svgif.UnsupportedError);
    }
  });
});
