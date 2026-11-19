/**
 * Edge paths of Studio modules that the journey tests do not reach: loading the motion and
 * design lists over fetch, the capability probe, the import save path, and the fallbacks of
 * fitting words and drawing a design's picture.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addElement, createEditor, setText } from "../src/composition.ts";
import { exportSupport, probeCapabilities, type CapabilityFlags } from "../src/export-support.ts";
import type { ImportedProject } from "../src/import-html.ts";
import { applySimpleMotion, loadMotions, motionByFile, motionDocumentUrl } from "../src/motions.ts";
import { previewComposition } from "../src/playback.ts";
import { compositionForRaster, projectFromEditor, projectFromImport } from "../src/project-file.ts";
import {
  applyTemplate,
  loadTemplates,
  placeFittedWords,
  templateByFile,
  templateDocumentUrl,
  templateThumb,
  type TemplateDef,
} from "../src/templates.ts";

const studio = join(import.meta.dir, "..");
const PAGE = "https://thumly.io/studio/index.html";

const save = {
  embedPlayer: false,
  embedStudio: false,
  savedAt: "2026-11-19T00:00:00Z",
  id: "00000000-0000-4000-8000-000000000020",
  runtimeSri: "sha384-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  studioSri: {
    js: "sha384-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    css: "sha384-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  },
  playerSource: "/* player */\n",
};

/** A fetch that serves the files under `apps/studio/` by URL path, and records each request. */
function diskFetch(requested: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requested.push(url.pathname);
    const relative = url.pathname.replace(/^\/studio\//, "");
    try {
      return new Response(readFileSync(join(studio, relative), "utf8"), { status: 200 });
    } catch {
      return new Response("missing", { status: 404 });
    }
  }) as typeof fetch;
}

/** A fetch that answers one index document and serves nothing else. */
function indexFetch(index: unknown, requested: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requested.push(url.pathname);
    if (url.pathname.endsWith("/index.json")) return new Response(JSON.stringify(index), { status: 200 });
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
}

describe("motion list over fetch", () => {
  test("the URL sits beside the page, and a bad name names no file", () => {
    expect(motionDocumentUrl(PAGE, "fade-in.json")).toBe("https://thumly.io/studio/motions/fade-in.json");
    expect(motionDocumentUrl("https://thumly.io/studio/", "pop.json")).toBe("https://thumly.io/studio/motions/pop.json");
    expect(motionDocumentUrl(PAGE, "../secret.json")).toBe("https://thumly.io/studio/motions/");
  });

  test("loads every listed motion and finds one by file", async () => {
    const motions = await loadMotions(PAGE, diskFetch());
    const index = JSON.parse(readFileSync(join(studio, "motions/index.json"), "utf8")) as { files: string[] };
    expect(motions.length).toBeGreaterThan(0);
    expect(motions.length).toBeLessThanOrEqual(index.files.length);
    const first = motions[0];
    if (!first) throw new Error("no motion");
    expect(motionByFile(first.file)).toBe(first);
    expect(motionByFile("missing.json")).toBeUndefined();
  });

  test("skips the index and unsafe names, and fails on a missing file", async () => {
    const requested: string[] = [];
    const motions = await loadMotions(PAGE, indexFetch({ files: ["index.json", "../x.json", 7] }, requested));
    expect(motions).toEqual([]);
    expect(requested).toEqual(["/studio/motions/index.json"]);
    expect(loadMotions(PAGE, indexFetch({ files: ["gone.json"] }, []))).rejects.toThrow("motion request failed");
  });

  test("a motion longer than the composition lengthens it", async () => {
    const motions = await loadMotions(PAGE, diskFetch());
    const state = createEditor();
    const node = addElement(state, "rectangle");
    state.composition.durationInFrames = 1;
    const motion = motions.find((item) => item.tracks.length > 0);
    if (!motion) throw new Error("no motion with tracks");
    const written = applySimpleMotion(state, node.id, motion, { applyFrame: 0, factor: 1 });
    if (!written) throw new Error("the motion was not written");
    expect(written.lastFrame).toBeGreaterThan(0);
    expect(state.composition.durationInFrames).toBe(written.lastFrame + 1);
  });
});

describe("design list over fetch", () => {
  test("the URL sits beside the page, and a bad name names no file", () => {
    expect(templateDocumentUrl(PAGE, "sale.json")).toBe("https://thumly.io/studio/templates/sale.json");
    expect(templateDocumentUrl("https://thumly.io/studio/", "launch.json")).toBe("https://thumly.io/studio/templates/launch.json");
    expect(templateDocumentUrl(PAGE, "a/b.json")).toBe("https://thumly.io/studio/templates/");
  });

  test("loads every listed design and finds one by file", async () => {
    const templates = await loadTemplates(PAGE, diskFetch());
    expect(templates.length).toBeGreaterThan(0);
    const first = templates[0];
    if (!first) throw new Error("no design");
    expect(templateByFile(templates, first.file)).toBe(first);
    expect(templateByFile(templates, "missing.json")).toBeUndefined();
  });

  test("skips the index and unsafe names, and fails on a missing file", async () => {
    const requested: string[] = [];
    expect(await loadTemplates(PAGE, indexFetch({ files: ["index.json", "..", null] }, requested))).toEqual([]);
    expect(requested).toEqual(["/studio/templates/index.json"]);
    expect(loadTemplates(PAGE, indexFetch({ files: ["gone.json"] }, []))).rejects.toThrow("design request failed");
  });
});

describe("fitting words", () => {
  async function wordsOnDesign() {
    const templates = await loadTemplates(PAGE, diskFetch());
    const design = templates.find((item) => item.nodes.some((node) => node.text !== undefined));
    if (!design) throw new Error("no design with words");
    const state = createEditor();
    applyTemplate(state, design);
    const words = state.composition.nodes.find((node) => state.wordScale[node.id] !== undefined);
    if (!words) throw new Error("no fitted words");
    return { state, words };
  }

  test("a fit that is not tight clears the tight mark", async () => {
    const { state, words } = await wordsOnDesign();
    state.tightWords[words.id] = true;
    const placed = placeFittedWords(state, words.id, { x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 1000, height: 1000 });
    expect(placed).toBe(true);
    expect(state.tightWords[words.id]).toBeUndefined();
  });

  test("a missing rest track is added, and a zero scale rest is replaced", async () => {
    const { state, words } = await wordsOnDesign();
    words.tracks = words.tracks.filter((track) => track.property !== "transform.translateX");
    const scaleY = words.tracks.find((track) => track.property === "transform.scaleY");
    if (scaleY) scaleY.keys = [{ frame: 0, value: 0 }];
    else words.tracks.push({ property: "transform.scaleY", keys: [{ frame: 0, value: 0 }] });
    expect(placeFittedWords(state, words.id, { x: 0, y: 0, width: 40, height: 20 }, { x: 10, y: 10, width: 400, height: 200 })).toBe(true);
    const translateX = words.tracks.find((track) => track.property === "transform.translateX");
    expect(translateX?.keys).toHaveLength(1);
    expect(translateX?.keys[0]?.frame).toBe(0);
    const scale = words.tracks.find((track) => track.property === "transform.scaleY")?.keys;
    expect(scale).toHaveLength(1);
    expect(scale?.[0]?.value).not.toBe(0);
  });
});

describe("design picture", () => {
  test("a shape with no paint and no fill is drawn in the default ink", () => {
    const design: TemplateDef = {
      file: "plain.json",
      label: "Plain",
      width: 100,
      height: 50,
      colors: [],
      nodes: [{ role: "mark", label: "Mark", tracks: [{ property: "attr.d", keys: [{ frame: 0, value: "M0 0H10V10Z" }] }] }],
    };
    const picture = templateThumb(design);
    expect(picture).toContain('<path d="M0 0H10V10Z" fill="#1c1915"/>');
    expect(picture).toStartWith('<svg viewBox="0 0 100 50"');
  });
});

describe("artboard preview", () => {
  test("words travel with nodes that have no shape path", () => {
    const state = createEditor();
    const words = addElement(state, "text");
    setText(state, words.id, "Hello");
    const shape = addElement(state, "rectangle");
    state.texts[shape.id] = "not drawn";
    const loose = addElement(state, "ellipse");
    loose.tracks = loose.tracks.filter((track) => track.property !== "attr.d");
    (state.texts as Record<string, unknown>)[loose.id] = 42;
    const bare = addElement(state, "rectangle");
    bare.tracks = bare.tracks.filter((track) => track.property !== "attr.d");
    state.texts[bare.id] = "Bare";
    const preview = previewComposition(state);
    const textOf = (id: string) => (preview.nodes.find((node) => node.id === id) as { text?: string } | undefined)?.text;
    expect(textOf(bare.id)).toBe("Bare");
    // Words drawn as glyph paths are already in the picture.
    if (words.tracks.some((track) => track.property === "attr.d")) expect(textOf(words.id)).toBeUndefined();
    else expect(textOf(words.id)).toBe("Hello");
    expect(textOf(shape.id)).toBeUndefined();
    expect(textOf(loose.id)).toBeUndefined();
    expect(state.composition.nodes.every((node) => !("text" in node))).toBe(true);
  });
});

describe("project file from an import", () => {
  test("keeps the imported composition and appends one generation", () => {
    const state = createEditor();
    addElement(state, "rectangle");
    const saved = projectFromEditor(state, [], save);
    const imported = { ...saved, composition: state.composition } as unknown as ImportedProject;
    const next = projectFromImport(imported, { ...save, id: "00000000-0000-4000-8000-000000000021" });
    expect(next.schemaRevision).toBe(0);
    expect(next.composition).toEqual(saved.composition);
    expect(next.provenance.generations.map((item) => item.id)).toEqual([save.id, "00000000-0000-4000-8000-000000000021"]);
    expect(next.provenance.generations[1]?.parentId).toBe(save.id);
    expect("groups" in next).toBe(false);
    expect("presentation" in next).toBe(false);
  });

  test("a presentation and groups move the file to revision 1", () => {
    const state = createEditor();
    const first = addElement(state, "rectangle");
    const second = addElement(state, "ellipse");
    const saved = projectFromEditor(state, [], save);
    const imported = {
      ...saved,
      composition: state.composition,
      presentation: { title: "Card" },
      groups: [
        { id: "g-1", childIds: [first.id, "missing", second.id] },
        { id: "g-2", childIds: [first.id] },
      ],
    } as unknown as ImportedProject;
    const next = projectFromImport(imported, save);
    expect(next.schemaRevision).toBe(1);
    expect(next.presentation).toEqual({ title: "Card" });
    // A group keeps only children that are still nodes, and needs two of them.
    expect(next.groups).toEqual([{ id: "g-1", childIds: [first.id, second.id] }]);
  });

  test("the raster composition has no loop field", () => {
    const state = createEditor();
    addElement(state, "rectangle");
    const raster = compositionForRaster({ ...state.composition, loop: true });
    expect("loop" in raster).toBe(false);
    expect(raster.nodes).toHaveLength(1);
  });
});

describe("capability probe", () => {
  const scope = globalThis as Record<string, unknown>;
  const saved = { document: scope.document, MediaRecorder: scope.MediaRecorder };
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete scope[name];
      else scope[name] = value;
    }
  });

  test("a document with a 2D canvas can paint blob SVG", () => {
    scope.document = { createElement: () => ({ getContext: () => ({}) }) };
    expect(probeCapabilities().canvasBlobSvg).toBe(true);
  });

  test("a canvas that throws or has no 2D context cannot", () => {
    scope.document = {
      createElement: () => {
        throw new Error("no canvas");
      },
    };
    expect(probeCapabilities().canvasBlobSvg).toBe(false);
    scope.document = { createElement: () => ({ getContext: () => null }) };
    expect(probeCapabilities().canvasBlobSvg).toBe(false);
  });

  test("MediaRecorder counts only when it can say which types it records", () => {
    scope.MediaRecorder = function MediaRecorder() {};
    expect(probeCapabilities().mediaRecorderWebm).toBe(false);
    const recorder = function MediaRecorder() {} as unknown as { isTypeSupported: (mime: string) => boolean };
    recorder.isTypeSupported = (mime) => mime === "video/webm;codecs=vp8";
    scope.MediaRecorder = recorder;
    expect(probeCapabilities().mediaRecorderWebm).toBe(true);
    recorder.isTypeSupported = () => false;
    expect(probeCapabilities().mediaRecorderWebm).toBe(false);
  });

  test("WebP uses WebAssembly when the pure-JS encoder is not bundled", () => {
    const flags: CapabilityFlags = {
      canvasBlobSvg: true,
      webWorkers: false,
      offscreenCanvas: false,
      videoEncoder: false,
      mediaRecorderWebm: false,
      wasmInstantiate: true,
      pureJsWebp: false,
    };
    const decision = exportSupport(flags);
    expect(decision.webpEncoder).toBe("wasm");
    expect(decision.webp.enabled).toBe(true);
    expect(decision.webp.reason).toStartWith("WebP uses WebAssembly instantiate.");
  });
});
