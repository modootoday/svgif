import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  addElement,
  applyMotionTracks,
  createEditor,
  seedBlankShape,
  selectNode,
  setText,
  exportComposition,
  groupSelection,
  lengthFieldText,
  minimumDurationFrames,
  moveKeyframe,
  projectComposition,
  rasterComposition,
  removeKeyframe,
  replaceComposition,
  reorderNode,
  setEasing,
  setKeyframe,
  setLengthSeconds,
  setLoop,
  ungroup,
} from "../src/composition.ts";
import { chooseStudioFiles, readEmbeddedStudio } from "../src/embedded-assets.ts";
import { exportSupport, type CapabilityFlags } from "../src/export-support.ts";
import { textPath } from "../src/glyphs.ts";
import { playerShouldStart } from "../src/player-boot.ts";
import { STUDIO_MOUNT_FLAG } from "../src/studio-flag.ts";
import { parseHtmlTree } from "../src/html-tree.ts";
import { importHtml, liveDocument } from "../src/import-html.ts";
import { paintComposition } from "../src/playback.ts";
import {
  categoriesOf,
  fetchPresetDocument,
  fetchPresetIndex,
  filterPresets,
  parsePresetIndex,
  placeComponentPreset,
  presetDocumentUrl,
  presetIndexUrl,
  applyMotionPreset,
} from "../src/presets.ts";
import { copySource, defaultSri, projectFromEditor, saveAndExportHtml } from "../src/project-file.ts";
import { fetchPagesStudioAssets, PAGES_STUDIO_BASE, PLAYER_SOURCE, sha384Sri, studioFileUrl, studioRoot } from "../src/runtime.ts";
import {
  artboardBounds,
  capturePose,
  commandOps,
  moveBy,
  numberKeys,
  pathBounds,
  restCenter,
  restPosition,
  resizeCaptured,
  resizeRestPath,
  sampledGeometry,
} from "../src/direct.ts";
import { applySimpleMotion, motionsFromDocuments, timingFromChoices, type MotionDef } from "../src/motions.ts";
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  cloneEditor,
  commitEdit,
  createHistory,
  historyCommand,
  recordEdit,
  redoEdit,
  resetForComposition,
  undoEdit,
} from "../src/history.ts";
import { svgFile } from "../src/svg-file.ts";
import {
  IMAGE_NAME,
  NOTHING_TO_EXPORT,
  VIDEO_PROGRESS,
  VIDEO_UNSUPPORTED,
  compositionWithWords,
  hasSomethingToExport,
  imageFile,
  rasterWithWords,
  svgDownload,
  videoKind,
} from "../src/download-plain.ts";
import { explicitShell, rememberedShell, resolveShell, toggledShell } from "../src/shell-mode.ts";
import { inspectorMarkup, motionChoicesMarkup, shellMarkup, timelineMarkup, layerListMarkup } from "../src/shell-markup.ts";
import { compile } from "../../../packages/svgif/src/lower/index.ts";
import { sample } from "../../../packages/svgif/src/ir/sample.ts";
import { exportSvg } from "../../../packages/svgif-export/src/svg.ts";
import { renderFrame } from "../../../packages/svgif-export/src/webp.ts";

globalThis.DOMParser = class {
  parseFromString(markup: string, type: string) {
    if (type !== "text/html") throw new Error("unexpected type");
    return parseHtmlTree(markup);
  }
} as unknown as typeof DOMParser;

const studio = join(import.meta.dir, "..");
const repo = join(studio, "../..");
const flags = (patch: Partial<CapabilityFlags>): CapabilityFlags => ({
  canvasBlobSvg: true,
  webWorkers: true,
  offscreenCanvas: true,
  videoEncoder: true,
  mediaRecorderWebm: true,
  wasmInstantiate: true,
  pureJsWebp: true,
  ...patch,
});

const save = {
  embedPlayer: false,
  embedStudio: false,
  savedAt: "2026-11-13T00:00:00Z",
  id: "00000000-0000-4000-8000-000000000010",
  runtimeSri: "sha384-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  studioSri: {
    js: "sha384-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    css: "sha384-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  },
  playerSource: "/* player */\n",
  studioSource: "/* studio */\n",
  studioCss: "/* css */\n",
};

describe("import", () => {
  test("rejects a meta mismatch and does not keep foreign scripts or handlers", () => {
    const fixture = JSON.parse(readFileSync(join(repo, "schema/fixtures/project/v1-script-mismatch.json"), "utf8")) as {
      meta: Record<string, string>;
      script: unknown;
    };
    const html = `<!DOCTYPE html><html><head>
      <meta name="svgif:schema" content="${fixture.meta["svgif:schema"]}">
      <meta name="svgif:revision" content="${fixture.meta["svgif:revision"]}">
      <meta name="svgif:generator" content="${fixture.meta["svgif:generator"]}">
    </head><body>
      <script id="svgif-project" type="application/vnd.svgif.project+json">${JSON.stringify(fixture.script)}</script>
      <script>globalThis.__svgifForeign = "secret-script-body";</script>
      <div onclick="doEvil()">x</div>
    </body></html>`;
    const result = importHtml(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("script-mismatch");
    expect(globalThis.__svgifForeign).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("secret-script-body");
    expect(JSON.stringify(result)).not.toContain("doEvil");
    expect(JSON.stringify(result)).not.toContain("onclick");
  });

  test("accepts a matching file and rebuilds playback without the foreign markup", async () => {
    const state = createEditor();
    addElement(state, "rectangle");
    const project = projectFromEditor(state, [], save);
    const html = await saveAndExportHtml(project, save).text();
    const opened = importHtml(html);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.project.composition.nodes.map((node) => node.id)).toEqual(state.composition.nodes.map((node) => node.id));
    expect(opened.project.composition.nodes[0]?.tracks).toEqual(state.composition.nodes[0]?.tracks);
    const live = liveDocument(opened.project.composition);
    expect(live).not.toContain("onclick");
    expect(live).not.toContain("<script");
  });

  test("reports schema-too-new and does not treat the document as editable", () => {
    const state = createEditor();
    const project = projectFromEditor(state, [], save);
    const tooNew = { ...project, schemaVersion: 2 };
    const html = `<!DOCTYPE html><meta name="svgif:schema" content="2"><meta name="svgif:revision" content="0"><meta name="svgif:generator" content="${tooNew.generator}"><script id="svgif-project" type="application/vnd.svgif.project+json">${JSON.stringify(tooNew)}</script>`;
    const result = importHtml(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("schema-too-new");
  });

  test("offers migrate for an older runtime pin", async () => {
    const state = createEditor();
    const project = projectFromEditor(state, [], save);
    const html = await saveAndExportHtml(project, save).text();
    const opened = importHtml(html, "1.0.0");
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(opened.migrate).toBe(true);
  });
});

describe("save", () => {
  test("save and export HTML are one writer and round-trip the composition", async () => {
    const state = createEditor();
    addElement(state, "path");
    const project = projectFromEditor(state, [], save);
    const first = await saveAndExportHtml(project, save).text();
    const second = await saveAndExportHtml(project, save).text();
    expect(first).toBe(second);
    expect(first).toContain('id="svgif-project"');
    const opened = importHtml(first);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.project.composition.durationInFrames).toBe(state.composition.durationInFrames);
    expect(opened.project.provenance.generations).toHaveLength(1);
    expect(opened.project.provenance.generations[0]?.parentId).toBeNull();
    const again = projectFromEditor(state, opened.project.provenance.generations, {
      ...save,
      id: "00000000-0000-4000-8000-000000000011",
      savedAt: "2026-11-13T01:00:00Z",
    });
    expect(again.provenance.generations[1]).toMatchObject({ parentId: opened.project.provenance.generations[0]?.id });
  });

  test("copy source matches the project script and skips Studio unless requested", async () => {
    const state = createEditor();
    const project = projectFromEditor(state, [], save);
    const html = await saveAndExportHtml(project, save).text();
    const script = html.match(/<script id="svgif-project"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
    const cdn = copySource(project, save);
    expect(cdn).toContain(script);
    expect(cdn).toContain("integrity=");
    expect(cdn).toContain('crossorigin="anonymous"');
    expect(cdn).not.toContain("svgif-studio-source");
    const inlineProject = projectFromEditor(state, [], { ...save, embedPlayer: true });
    const inlineHtml = await saveAndExportHtml(inlineProject, { ...save, embedPlayer: true }).text();
    const inlineScript = inlineHtml.match(/<script id="svgif-project"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
    const inline = copySource(inlineProject, { ...save, embedPlayer: true, embedStudio: false });
    expect(inline).toContain(inlineScript);
    expect(inline).toContain("/* player */");
    expect(inline).not.toContain("svgif-studio-source");
    const withStudio = copySource(inlineProject, { ...save, embedPlayer: true, embedStudio: true });
    expect(withStudio).toContain(inlineScript);
    expect(withStudio).toContain("svgif-studio-source");
  });
});

describe("presets", () => {
  test("loads the index without a hardcoded id or category", () => {
    const distIndex = join(studio, "dist/presets/index.json");
    const indexPath = existsSync(distIndex) ? distIndex : join(repo, "presets/index.json");
    const entries = parsePresetIndex(JSON.parse(readFileSync(indexPath, "utf8")));
    expect(entries.length).toBeGreaterThan(0);
    expect(categoriesOf(entries)).toEqual([...new Set(entries.map((entry) => entry.category))].sort());
    const sample = entries[0];
    expect(sample).toBeDefined();
    if (!sample) return;
    expect(filterPresets(entries, sample.id, sample.category).every((entry) => entry.category === sample.category)).toBe(true);
    const source = readTree(join(studio, "src"));
    for (const entry of entries.slice(0, 8)) {
      expect(source.includes(entry.id)).toBe(false);
    }
    if (indexPath === distIndex) {
      for (const entry of entries) {
        expect(existsSync(join(studio, "dist", entry.file))).toBe(true);
        expect(entry.file.endsWith(".golden.svg")).toBe(false);
      }
    }
  });

  test("places a component and writes motion onto the selected node", () => {
    const index = parsePresetIndex(JSON.parse(readFileSync(join(repo, "presets/index.json"), "utf8")));
    const entry = index.find((item) => {
      const preset = JSON.parse(readFileSync(join(repo, item.file), "utf8")) as { motionPreset?: { tracks?: unknown[] } };
      return Array.isArray(preset.motionPreset?.tracks) && preset.motionPreset.tracks.length > 0;
    });
    expect(entry).toBeDefined();
    if (!entry) return;
    const preset = JSON.parse(readFileSync(join(repo, entry.file), "utf8"));
    const state = createEditor();
    const before = state.composition.nodes.length;
    const placed = placeComponentPreset(state, preset);
    expect(placed.length).toBeGreaterThan(0);
    expect(state.composition.nodes.length).toBe(before + placed.length);
    expect(placed.every((node) => node.id.startsWith("s-"))).toBe(true);
    const target = addElement(state, "rectangle");
    const count = state.composition.nodes.length;
    const applied = applyMotionPreset(state, preset, target.id);
    expect(applied?.id).toBe(target.id);
    expect(state.composition.nodes.length).toBe(count);
    expect(Object.keys(applied ?? {})).toEqual(["id", "tracks"]);
  });
});

describe("editor", () => {
  test("reorders z and groups without a second timeline", () => {
    const state = createEditor();
    const first = addElement(state, "rectangle");
    const second = addElement(state, "ellipse");
    const third = addElement(state, "path");
    state.selection = [first.id, third.id];
    const group = groupSelection(state);
    expect(group?.childIds).toEqual([first.id, third.id]);
    expect(state.composition.nodes.map((node) => node.id)).toEqual([first.id, third.id, second.id]);
    reorderNode(state, first.id, 1);
    expect(state.composition.nodes.map((node) => node.id)).toEqual([second.id, first.id, third.id]);
    expect(state.groups[0]?.childIds).toEqual([first.id, third.id]);
    ungroup(state, group?.id ?? "");
    expect(state.groups).toHaveLength(0);
    expect(state.composition.nodes).toHaveLength(3);
    applyMotionTracks(state, second.id, [
      { property: "transform.translateX", keys: [{ frame: 0, value: 0 }, { frame: 12, value: 40 }] },
    ]);
    expect(state.composition.nodes).toHaveLength(3);
    expect(second.tracks.some((track) => track.property === "transform.translateX")).toBe(true);
  });

  test("shares one id between the layer row and the timeline row", () => {
    const state = createEditor();
    const node = addElement(state, "text");
    const layers = layerListMarkup(state);
    const timeline = timelineMarkup(state);
    expect(layers).toContain(`data-node-id="${node.id}"`);
    expect(timeline).toContain(`data-node-id="${node.id}"`);
    expect(shellMarkup(exportSupport(flags({}))).includes("Selected layer only")).toBe(true);
    state.selectedLayerOnly = true;
    state.selection = [];
    expect(timelineMarkup(state)).not.toContain(node.id);
  });
});

describe("export support", () => {
  test("disables codecs from the probe and never offers a GIF control", () => {
    const missingCanvas = exportSupport(flags({ canvasBlobSvg: false }));
    expect(missingCanvas.webp.enabled).toBe(false);
    expect(missingCanvas.webm.enabled).toBe(false);
    expect(missingCanvas.svg.enabled).toBe(true);
    const noWebm = exportSupport(flags({ videoEncoder: false, mediaRecorderWebm: false }));
    expect(noWebm.webm.enabled).toBe(false);
    expect(noWebm.webm.reason.toLowerCase()).toContain("webm");
    const recorder = exportSupport(flags({ videoEncoder: false, mediaRecorderWebm: true }));
    expect(recorder.webmPath).toBe("media-recorder");
    const pure = exportSupport(flags({ wasmInstantiate: false, pureJsWebp: true }));
    expect(pure.webp.enabled).toBe(true);
    expect(pure.webpEncoder).toBe("pure-js");
    const neither = exportSupport(flags({ wasmInstantiate: false, pureJsWebp: false }));
    expect(neither.webp.enabled).toBe(false);
    const mainThread = exportSupport(flags({ webWorkers: false, offscreenCanvas: false }));
    expect(mainThread.thread).toBe("main");
    expect(mainThread.canvas).toBe("main");
    expect(mainThread.sharedArrayBuffer).toBe("not used");
    const html = shellMarkup(missingCanvas);
    expect(html).toContain('data-export="html"');
    expect(html).toContain('data-export="svg"');
    expect(html).toContain('data-export="webp" disabled');
    expect(html).toContain('data-export="webm" disabled');
    expect(html).toContain('data-export="mp4"');
    expect(html).not.toContain('data-export="gif"');
    expect(html.toLowerCase()).not.toContain(">gif<");
    expect(html).toContain("Selected layer only");
    expect(html).toContain(">Preview<");
    expect(html).toContain(">Library<");
    expect(html).toContain(">Inspect<");
    expect(html).toContain(">Timeline<");
    expect(html).toContain("embed player");
    expect(html).toContain("embed studio");
    expect(html).not.toContain("embed studio\" checked");
  });
});

describe("playback", () => {
  test("mounts static and scrub playback", () => {
    const state = createEditor();
    addElement(state, "rectangle");
    for (const mode of ["static", "scrub"] as const) {
      let markup = "";
      const host = {
        get innerHTML() {
          return markup;
        },
        set innerHTML(value: string) {
          markup = value;
        },
        querySelector() {
          return null;
        },
      };
      const player = paintComposition(host, state.composition, mode, 0);
      expect(markup).toContain("<svg");
      expect(player.mode).toBe(mode);
      if (mode === "scrub") {
        player.seek(1);
        expect(player.frame).toBe(1);
      }
      player.unmount();
    }
  });
});

describe("timeline and fidelity", () => {
  test("edits keyframes on the selected node's timeline", () => {
    const state = createEditor();
    const node = addElement(state, "rectangle");
    setKeyframe(state, node.id, "transform.translateX", 4, 12);
    const markup = timelineMarkup(state);
    expect(markup).toContain(`data-node-id="${node.id}"`);
    expect(markup).toContain(`data-add-key="${node.id}"`);
    expect(markup).toContain('data-key-frame="4"');
    expect(markup).toContain("transform.translateX");
    expect(markup).toContain("Key at frame");
    setEasing(state, node.id, "transform.translateX", 4, "hold");
    moveKeyframe(state, node.id, "transform.translateX", 4, 6);
    expect(node.tracks.find((track) => track.property === "transform.translateX")?.keys).toEqual([
      { frame: 6, value: 12, easing: "hold" },
    ]);
    removeKeyframe(state, node.id, "transform.translateX", 6);
    expect(node.tracks.some((track) => track.property === "transform.translateX")).toBe(false);
    const shell = shellMarkup(exportSupport(flags({})));
    expect(shell).toContain('id="status-bar"');
    expect(shell).toContain("Choose .html file");
    expect(shell).toContain('id="theme-popover"');
  });

  test("keeps loop, existing geometry, and a clean open", () => {
    const state = createEditor();
    const placed = placeComponentPreset(state, {
      id: "loop-demo",
      parameters: [{ name: "loop", value: true }],
      component: { copied: { shape: { d: "M 0 0 H 10 V 10 H 0 Z" } } },
    });
    expect(placed.length).toBeGreaterThan(0);
    expect(state.composition.loop).toBe(true);
    expect(exportComposition(state.composition).loop).toBe(true);
    expect(projectComposition(state.composition).loop).toBe(true);
    expect("loop" in rasterComposition(state.composition)).toBe(false);
    const node = addElement(state, "rectangle");
    const geometry = node.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value;
    const applied = applyMotionPreset(
      state,
      {
        motionPreset: {
          tracks: [
            { property: "attr.d", keys: [{ frame: 0, value: "M 1 1 H 2" }] },
            { property: "attr.opacity", keys: [{ frame: 0, value: 0.4 }] },
            { property: "transform.rotate", keys: [{ frame: 0, value: 0 }, { frame: 8, value: 20, easing: "linear" }] },
          ],
        },
      },
      node.id,
    );
    expect(applied?.id).toBe(node.id);
    expect(node.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value).toBe(geometry);
    expect(node.tracks.some((track) => track.property === "attr.opacity")).toBe(true);
    state.groups.push({ id: "s-group-9", childIds: [node.id] });
    state.labels[node.id] = "Keep";
    state.texts[node.id] = "Hi";
    state.frame = 3;
    replaceComposition(state, { fps: 12, width: 100, height: 80, durationInFrames: 10, nodes: [] });
    expect(state.groups).toEqual([]);
    expect(state.labels).toEqual({});
    expect(state.texts).toEqual({});
    expect(state.frame).toBe(0);
  });

  test("text is a vector path and the preview does not stamp a text overlay", async () => {
    const state = createEditor();
    const node = addElement(state, "text");
    const geometry = node.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value;
    expect(typeof geometry).toBe("string");
    expect(String(geometry).split("M ").length).toBeGreaterThan(3);
    const raster = rasterComposition(state.composition);
    const svg = await exportSvg(raster, { backend: "css-embedded" }).text();
    const frame = renderFrame(raster, 0);
    const compiled = compile(raster, "css-embedded").svg;
    const pathOf = (markup: string) => [...markup.matchAll(/\bd="([^"]+)"/g)].map((match) => match[1]);
    expect(pathOf(svg)).toEqual(pathOf(frame));
    expect(pathOf(compiled).length).toBeGreaterThan(0);
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(frame).not.toMatch(/<text[\s>]/);
    expect(compiled).not.toMatch(/<text[\s>]/);
    expect(readFileSync(join(studio, "src/main.ts"), "utf8")).not.toContain("createElementNS");
    let markup = "";
    paintComposition(
      {
        get innerHTML() {
          return markup;
        },
        set innerHTML(value: string) {
          markup = value;
        },
      },
      state.composition,
      "static",
      0,
    );
    expect(markup).not.toMatch(/<text[\s>]/);
  });

  test("the studio bundle is an iife and embed studio keeps its sources", async () => {
    const scriptPath = join(studio, "dist/studio.js");
    expect(existsSync(scriptPath)).toBe(true);
    const script = readFileSync(scriptPath, "utf8");
    expect(script.includes("sourceMappingURL")).toBe(false);
    expect(script.trimStart().startsWith("import ")).toBe(false);
    expect(script.trimStart().startsWith("export ")).toBe(false);
    expect(PLAYER_SOURCE.length).toBeGreaterThan(200);
    expect(PLAYER_SOURCE).toContain("svgif-project");
    expect(PLAYER_SOURCE).toContain("css-embedded");
    const state = createEditor();
    const project = projectFromEditor(state, [], { ...save, embedStudio: true, embedPlayer: true });
    const html = await saveAndExportHtml(project, {
      ...save,
      embedStudio: true,
      embedPlayer: true,
      studioCss: "/* studio-css-marker */\n",
      studioSource: "/* studio-js-marker */\n",
    }).text();
    expect(html).toContain("/* studio-css-marker */");
    expect(html).toContain("/* studio-js-marker */");
    expect(html).not.toContain('id="svgif-studio" type="module"');
    expect(html).toContain('id="svgif-studio-source"');
  });

  test("a chosen file does not reopen the pasted HTML", () => {
    const main = readFileSync(join(studio, "src/main.ts"), "utf8");
    expect(main).toContain('dialog.close("file")');
    expect(main).toContain('dialog.returnValue = ""');
    expect(main).toContain('if (dialog?.returnValue !== "ok") return;');
    const opensPaste = (returnValue: string) => returnValue === "ok";
    expect(opensPaste("ok")).toBe(true);
    expect(opensPaste("file")).toBe(false);
    expect(opensPaste("")).toBe(false);
  });

  test("the inline player stays off when Studio is mounted", () => {
    const project = { getElementById: () => null, documentElement: { dataset: {} } };
    expect(playerShouldStart(project)).toBe(true);
    expect(
      playerShouldStart({
        getElementById: (id) => (id === "studio-root" ? { textContent: "" } : null),
      }),
    ).toBe(false);
    expect(
      playerShouldStart({
        getElementById: () => null,
        documentElement: { dataset: { svgifStudio: STUDIO_MOUNT_FLAG } },
      }),
    ).toBe(false);
  });

  test("embedded studio blocks win over a later fetch", () => {
    const host = {
      getElementById(id: string) {
        if (id === "svgif-studio-source") return { textContent: "  embedded-js  " };
        if (id === "svgif-studio-css") return { textContent: "embedded-css" };
        if (id === "svgif-player") return { textContent: "embedded-player" };
        return null;
      },
    };
    const embedded = readEmbeddedStudio(host);
    expect(embedded.studioSource).toBe("embedded-js");
    const chosen = chooseStudioFiles(embedded, {
      studioSource: "fetched-js",
      studioCss: "",
      playerSource: "fetched-player",
    });
    expect(chosen.studioSource).toBe("embedded-js");
    expect(chosen.studioCss).toBe("embedded-css");
    expect(chosen.playerSource).toBe("embedded-player");
    const filled = chooseStudioFiles(
      { studioSource: "", studioCss: "", playerSource: "" },
      { studioSource: "fetched-js", studioCss: "fetched-css", playerSource: "fetched-player" },
    );
    expect(filled.studioSource).toBe("fetched-js");
    expect(filled.studioCss).toBe("fetched-css");
  });

  test("repeated text edits keep the origin for A and a leading space", () => {
    const pathOf = (nodeId: string) => {
      const value = state.composition.nodes.find((node) => node.id === nodeId)?.tracks.find((track) => track.property === "attr.d")
        ?.keys[0]?.value;
      return typeof value === "string" ? value : "";
    };
    const state = createEditor();
    const node = addElement(state, "text");
    setText(state, node.id, "A");
    const letter = pathOf(node.id);
    expect(letter).toBe(textPath("A", state.origins[node.id]?.x ?? 0, state.origins[node.id]?.y ?? 0));
    setText(state, node.id, "A");
    expect(pathOf(node.id)).toBe(letter);
    delete state.origins[node.id];
    setText(state, node.id, "A");
    expect(pathOf(node.id)).toBe(letter);

    setText(state, node.id, " x");
    const spaced = pathOf(node.id);
    expect(spaced).not.toBe(letter);
    setText(state, node.id, " x");
    expect(pathOf(node.id)).toBe(spaced);
    delete state.origins[node.id];
    setText(state, node.id, " x");
    expect(pathOf(node.id)).toBe(spaced);
    expect(spaced.startsWith("M ")).toBe(true);
  });
});

describe("pages asset base", () => {
  const saved = "file:///tmp/project.html";
  const local = "http://127.0.0.1:4173/index.html";
  const pages = "https://thumly.io/studio/index.html";

  test("preset index, every preset file, and Studio assets use the absolute Pages base", async () => {
    const entries = parsePresetIndex(JSON.parse(readFileSync(join(repo, "presets/index.json"), "utf8")));
    expect(entries.length).toBeGreaterThan(0);
    for (const href of [saved, local, pages]) {
      expect(studioRoot(href)).toBe(PAGES_STUDIO_BASE);
      expect(presetIndexUrl(href)).toBe(`${PAGES_STUDIO_BASE}presets/index.json`);
      expect(studioFileUrl(studioRoot(href), "studio.js")).toBe(`${PAGES_STUDIO_BASE}studio.js`);
      expect(studioFileUrl(studioRoot(href), "studio.css")).toBe(`${PAGES_STUDIO_BASE}studio.css`);
      for (const entry of entries) {
        expect(entry.file.startsWith("presets/")).toBe(true);
        expect(presetDocumentUrl(entry, href)).toBe(`${PAGES_STUDIO_BASE}${entry.file}`);
      }
    }

    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/presets/index.json")) {
        return new Response(JSON.stringify({ presets: entries }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const file = url.slice(PAGES_STUDIO_BASE.length);
      return new Response(readFileSync(join(repo, file), "utf8"), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const index = await fetchPresetIndex(saved, fetcher);
    expect(calls[0]).toBe(`${PAGES_STUDIO_BASE}presets/index.json`);
    for (const entry of index) await fetchPresetDocument(entry, saved, fetcher);
    expect(calls.slice(1)).toEqual(index.map((entry) => `${PAGES_STUDIO_BASE}${entry.file}`));
    expect(calls.every((url) => new URL(url).hostname === "thumly.io" && new URL(url).pathname.startsWith("/studio/"))).toBe(true);
  });

  test("Studio script and stylesheet digests are the sha384 of the Pages bytes", async () => {
    const jsText = readFileSync(join(studio, "dist/studio.js"), "utf8");
    const cssText = readFileSync(join(studio, "dist/studio.css"), "utf8");
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${PAGES_STUDIO_BASE}studio.js`) return new Response(jsText, { status: 200 });
      if (url === `${PAGES_STUDIO_BASE}studio.css`) return new Response(cssText, { status: 200 });
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const loaded = await fetchPagesStudioAssets("file:///tmp/project.html", fetcher);
    expect(loaded.jsUrl).toBe(`${PAGES_STUDIO_BASE}studio.js`);
    expect(loaded.cssUrl).toBe(`${PAGES_STUDIO_BASE}studio.css`);
    expect(loaded.studioSri.js).toBe(await sha384Sri(jsText));
    expect(loaded.studioSri.css).toBe(await sha384Sri(cssText));
    const digests = await defaultSri("player-bytes", jsText, cssText);
    expect(digests.studioSri).toEqual(loaded.studioSri);
    expect(digests.studioSri.js).not.toBe(digests.runtimeSri);

    const html = readFileSync(join(studio, "dist/index.html"), "utf8");
    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/svg+xml");
    const css = readFileSync(join(studio, "src/studio.css"), "utf8");
    const stage = css.slice(css.indexOf(".stage-fit {"), css.indexOf(".stage-fit svg"));
    expect(stage).toContain("background: #ffffff");
    expect(stage.includes("var(--card)")).toBe(false);
  });
});

describe("simple shell", () => {
  test("simple is the default and the URL wins without writing memory", () => {
    expect(resolveShell("", null)).toBe("simple");
    expect(resolveShell("?width=1440&height=900", null)).toBe("simple");
    expect(resolveShell("?width=1440&height=900", "advanced")).toBe("advanced");
    expect(resolveShell("?mode=advanced", "simple")).toBe("advanced");
    expect(resolveShell("?mode=simple", "advanced")).toBe("simple");
    expect(resolveShell("?width=390&height=844&mode=advanced", null)).toBe("advanced");
    expect(resolveShell("?mode=nope", null)).toBe("simple");
    expect(explicitShell("?mode=other")).toBeNull();
    expect(rememberedShell("advanced")).toBe("advanced");
    expect(rememberedShell("nope")).toBeNull();
    expect(toggledShell("simple")).toBe("advanced");
    expect(toggledShell("advanced")).toBe("simple");
  });

  test("the simple panel is a labelled skeleton and Advanced keeps the shell", () => {
    const html = shellMarkup(exportSupport(flags({})));
    expect(html).toContain('id="mode-simple"');
    expect(html).toContain('id="mode-advanced"');
    expect(html).toContain('aria-label="Simple or Advanced"');
    expect(html).toContain(">Simple<");
    expect(html).toContain(">Advanced<");
    expect(html).toContain('id="mode-simple" data-shell-choice="simple" aria-pressed="true"');
    expect(html).toContain('id="mode-advanced" data-shell-choice="advanced" aria-pressed="false"');
    expect(html).toContain('id="simple-panel"');
    expect(html).toContain("Placeholder. Template choices are not here yet.");
    expect(html).toContain("Tap a shape to select it. Drag the shape to move it. Drag a corner to change its size.");
    expect(html).toContain('id="motion-menu"');
    expect(html).toContain('aria-label="Speed"');
    expect(html).toContain('aria-label="Delay"');
    expect(html).toContain(">Slower<");
    expect(html).toContain(">Normal<");
    expect(html).toContain(">Faster<");
    expect(html).toContain(">None<");
    expect(html).toContain(">Short<");
    expect(html).toContain(">Long<");
    const motions = readStudioMotions();
    const choices = motionChoicesMarkup(motions);
    expect(choices).toContain('class="motion-choice"');
    for (const motion of motions) expect(choices).toContain(`>${motion.label}<`);
    const shown = `${html}\n${choices}`;
    expect(html).toContain('id="length-seconds"');
    expect(html).toContain('aria-label="Length in seconds"');
    expect(html).toContain('id="loop-switch"');
    expect(html).toContain('role="switch"');
    expect(html).toContain("Loop applies to SVG and HTML only.");
    expect(html).not.toContain("Length in seconds and a loop switch are not here yet.");
    expect(html).toContain('id="download-image"');
    expect(html).toContain('id="download-video"');
    expect(html).toContain(">Download image<");
    expect(html).toContain(">Download video<");
    expect(html).toContain('id="download-note"');
    expect(html).not.toContain("Placeholder. Download image and download video are not here yet.");
    expect(html).toContain('id="export-svg"');
    expect(html).toContain('id="export-webp"');
    expect(html).toContain('id="export-webm"');
    expect(html).toContain('id="export-mp4"');
    expect(html).toContain('id="svg-backend"');
    expect(html).not.toContain("export-gif");
    expect(html).not.toContain(">GIF<");
    expect(html).toContain('id="headline"');
    expect(html).toContain('aria-label="Headline"');
    expect(html).toContain('id="undo"');
    expect(html).toContain('id="redo"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(">Undo<");
    expect(html).toContain(">Redo<");
    expect(html).not.toContain("Undo and redo are not here yet.");
    expect(html).not.toContain("A headline and color choices are not here yet.");
    expect(html).toContain('class="timeline"');
    expect(html).toContain('aria-label="Frame"');
    expect(html).toContain(">Tracks<");
    expect(html).toContain('data-handle="se"');
    const state = createEditor();
    const node = addElement(state, "rectangle");
    state.selection = [node.id];
    expect(inspectorMarkup(state)).toContain("json-dump");
    const panelStart = html.indexOf('id="simple-panel"');
    const panel = `${html.slice(panelStart, html.indexOf("</aside>", panelStart))}\n${choices}`;
    for (const word of [
      "timeline",
      "track",
      "json",
      "frame",
      "keyframe",
      "attr.d",
      "transform.",
      "codec",
      "backend",
      "capability",
      "smil",
      "offscreen",
      "preset",
      "css embedded",
      "offscreencanvas",
      "webp",
      "webm",
      "mp4",
      "gif",
    ]) {
      expect(panel.toLowerCase()).not.toContain(word);
    }
    expect(shown).toContain('id="motion-menu"');
    const source = ["shell-mode.ts", "main.ts", "shell-markup.ts", "direct.ts", "motions.ts", "svg-file.ts", "history.ts", "download-plain.ts"]
      .map((name) => readFileSync(join(studio, "src", name), "utf8"))
      .join("\n");
    expect(source).not.toContain("userAgent");
    expect(source).not.toContain("webdriver");
    expect(source).not.toContain("headless");
  });

  test("a blank project has one shape, and a drag writes the rest position and size", async () => {
    const state = createEditor();
    expect(state.composition.nodes).toHaveLength(0);
    const seeded = seedBlankShape(state);
    expect(seeded?.id).toBe("s-n");
    expect(state.selection).toEqual([]);
    expect(seedBlankShape(state)).toBeNull();
    const node = state.composition.nodes[0];
    expect(node).toBeDefined();
    if (!node) return;
    const before = pathBounds(node.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value as string);
    expect(before).toEqual({ x: 180, y: 90, width: 280, height: 160 });
    state.frame = 6;
    moveBy(state, node.id, null, null, 24, -8);
    const translate = node.tracks.find((track) => track.property === "transform.translateX");
    expect(translate?.keys).toEqual([{ frame: 0, value: 24 }]);
    expect(node.tracks.find((track) => track.property === "transform.translateY")?.keys).toEqual([{ frame: 0, value: -8 }]);
    expect(restPosition(node)).toEqual({ x: 24, y: -8 });
    const path = node.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value;
    expect(typeof path).toBe("string");
    if (typeof path !== "string" || !before) return;
    const resized = resizeRestPath(path, before, "se", 30, 10);
    expect(resized).toBe("M 180 90 H 490 V 260 H 180 Z");
    const grown = pathBounds(resized ?? "");
    expect(grown?.width).toBe(310);
    expect(grown?.height).toBe(170);
    state.frame = 4;
    moveBy(state, node.id, numberKeys(node, "transform.translateX"), numberKeys(node, "transform.translateY"), 0, 0);
    expect(node.tracks.find((track) => track.property === "transform.translateX")?.keys.map((key) => key.frame)).toEqual([0]);
    const project = projectFromEditor(state, [], save);
    const html = await saveAndExportHtml(project, save).text();
    expect(html).toContain('"frame":0');
    expect(html).toContain("24");
    expect(html).toContain("-8");
    const svg = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).text();
    expect(svg).toContain("translate(24px, -8px)");
    expect(svg).toContain('d="M 180 90 H 460 V 250 H 180 Z"');
  });

  test("a move shifts every position key, and a resize scales every shape key", async () => {
    const state = createEditor();
    const node = addElement(state, "rectangle");
    const first = "M 0 0 H 100 V 100 H 0 Z";
    const second = "M 0 0 H 40 V 40 H 0 Z";
    setKeyframe(state, node.id, "attr.d", 0, first);
    setKeyframe(state, node.id, "attr.d", 22, second);
    setKeyframe(state, node.id, "transform.translateX", 0, 0);
    setKeyframe(state, node.id, "transform.translateX", 11, 20);
    setKeyframe(state, node.id, "transform.translateX", 22, 40);
    setKeyframe(state, node.id, "transform.translateY", 0, 0);
    setKeyframe(state, node.id, "transform.translateY", 11, 8);
    setKeyframe(state, node.id, "transform.translateY", 22, 16);
    const originX = numberKeys(node, "transform.translateX");
    const originY = numberKeys(node, "transform.translateY");
    state.frame = 22;
    moveBy(state, node.id, originX, originY, 4, -6);
    expect(node.tracks.find((track) => track.property === "transform.translateX")?.keys).toEqual([
      { frame: 0, value: 4 },
      { frame: 11, value: 24 },
      { frame: 22, value: 44 },
    ]);
    expect(node.tracks.find((track) => track.property === "transform.translateY")?.keys).toEqual([
      { frame: 0, value: -6 },
      { frame: 11, value: 2 },
      { frame: 22, value: 10 },
    ]);
    const svg = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).text();
    expect(svg).toContain("translate(4px, -6px)");
    expect(svg).toContain("translate(24px, 2px)");
    expect(svg).toContain("translate(44px, 10px)");
    const pose = capturePose(state, node.id, state.frame);
    expect(pose?.box).toEqual({ x: 44, y: 10, width: 40, height: 40 });
    if (!pose) return;
    resizeCaptured(state, node.id, pose, "se", 40, 0);
    const paths = node.tracks.find((track) => track.property === "attr.d")?.keys ?? [];
    expect(paths.map((key) => key.value)).toEqual(["M -40 0 H 160 V 100 H -40 Z", "M 0 0 H 80 V 40 H 0 Z"]);
    expect(commandOps(String(paths[0]?.value))).toBe(commandOps(first));
    expect(commandOps(String(paths[1]?.value))).toBe(commandOps(second));
    expect(commandOps(first)).toBe("MHVHZ");
    expect(paths.map((key) => key.frame)).toEqual([0, 22]);
    const still = addElement(state, "rectangle");
    moveBy(state, still.id, null, null, 1, 1);
    moveBy(state, still.id, null, null, 9, -2);
    expect(still.tracks.find((track) => track.property === "transform.translateX")?.keys).toEqual([{ frame: 0, value: 9 }]);
    expect(still.tracks.find((track) => track.property === "transform.translateY")?.keys).toEqual([{ frame: 0, value: -2 }]);
  });

  test("each motion ends on the rest pose, and Fade in ends opaque", () => {
    const motions = readStudioMotions();
    expect(motions.map((motion) => motion.label)).toEqual(["Fade in", "Slide up", "Pop", "Bounce", "Pulse"]);
    const loader = ["motions.ts", "shell-markup.ts", "main.ts"]
      .map((name) => readFileSync(join(studio, "src", name), "utf8"))
      .join("\n");
    for (const label of ["Fade in", "Slide up", "Bounce", "Pulse"]) expect(loader).not.toContain(label);
    expect(loader).not.toMatch(/["']Pop["']/);
    for (const motion of motions) {
      const state = createEditor();
      const node = addElement(state, "rectangle");
      moveBy(state, node.id, null, null, 30, -12);
      setKeyframe(state, node.id, "transform.scaleX", 0, 2);
      setKeyframe(state, node.id, "transform.scaleY", 0, 2);
      const fill = node.tracks.find((track) => track.property === "attr.fill")?.keys[0]?.value;
      const written = applySimpleMotion(state, node.id, motion, { applyFrame: 0, factor: 1 });
      expect(written).not.toBeNull();
      const atRest = sample(rasterComposition(state.composition), written?.lastFrame ?? 0)[node.id] ?? {};
      expect(atRest["transform.translateX"] ?? 0).toBe(30);
      expect(atRest["transform.translateY"] ?? 0).toBe(-12);
      expect(atRest["transform.scaleX"] ?? 1).toBe(2);
      expect(atRest["transform.scaleY"] ?? 1).toBe(2);
      expect(atRest["attr.opacity"] ?? 1).toBe(1);
      expect(node.tracks.find((track) => track.property === "attr.fill")?.keys[0]?.value).toBe(fill);
      const scales = motion.tracks.some((track) => track.property.startsWith("transform.scale"));
      if (!scales) expect(restPosition(node).x).toBe(30);
    }
    const fade = motions.find((motion) => motion.label === "Fade in");
    expect(fade).toBeDefined();
    if (!fade) return;
    const state = createEditor();
    const node = addElement(state, "rectangle");
    const written = applySimpleMotion(state, node.id, fade, { applyFrame: 0, factor: 1 });
    const end = sample(rasterComposition(state.composition), written?.lastFrame ?? 0)[node.id]?.["attr.opacity"];
    const midFrame = Math.max(1, Math.floor((written?.lastFrame ?? 2) / 3));
    const mid = sample(rasterComposition(state.composition), midFrame)[node.id]?.["attr.opacity"];
    expect(end).toBe(1);
    expect(typeof mid).toBe("number");
    expect(Number(mid)).toBeLessThan(1);
  });

  test("a later apply frame offsets the block, and a new motion replaces the previous one", async () => {
    const motions = readStudioMotions();
    const fade = motionNamed(motions, "Fade in");
    const slide = motionNamed(motions, "Slide up");
    const pulse = motionNamed(motions, "Pulse");
    const state = createEditor();
    const node = addElement(state, "rectangle");
    moveBy(state, node.id, null, null, 18, 6);
    const shifted = applySimpleMotion(state, node.id, fade, { applyFrame: 15, factor: 1 });
    const fadeOpacity = relativeKeys(fade, "attr.opacity");
    const opacity = node.tracks.find((track) => track.property === "attr.opacity");
    expect(opacity?.keys.map((key) => key.frame)).toEqual(fadeOpacity.map((key) => key.frame + 15));
    expect(shifted?.lastFrame).toBe(15 + (fadeOpacity.at(-1)?.frame ?? 0));
    expect(sample(rasterComposition(state.composition), shifted?.lastFrame ?? 0)[node.id]?.["attr.opacity"]).toBe(1);
    expect(sample(rasterComposition(state.composition), 15)[node.id]?.["attr.opacity"]).toBe(0);
    applySimpleMotion(state, node.id, slide, { applyFrame: 0, factor: 1 });
    const afterSlide = node.tracks.find((track) => track.property === "attr.opacity");
    expect(afterSlide?.keys.map((key) => key.frame)).toEqual(relativeKeys(slide, "attr.opacity").map((key) => key.frame));
    expect(node.tracks.find((track) => track.property === "transform.translateY")?.keys.map((key) => key.value)).toEqual(
      relativeKeys(slide, "transform.translateY").map((key) => 6 + Number(key.value)),
    );
    expect(Object.keys(state.simpleMotions[node.id]?.frames ?? {}).sort()).toEqual(["attr.opacity", "transform.translateY"]);
    const settledPulse = applySimpleMotion(state, node.id, pulse, { applyFrame: 0, factor: 1 });
    const heldOpacity = node.tracks.find((track) => track.property === "attr.opacity");
    const heldY = node.tracks.find((track) => track.property === "transform.translateY");
    expect(heldOpacity?.keys).toEqual([{ frame: 0, value: 1 }]);
    expect(heldY?.keys.some((key) => key.value === 6 + 72)).toBe(false);
    expect(node.tracks.find((track) => track.property === "transform.scaleX")?.keys).toHaveLength(3);
    expect(Object.keys(state.simpleMotions[node.id]?.frames ?? {}).sort()).toEqual([
      "transform.scaleX",
      "transform.scaleY",
      "transform.translateX",
      "transform.translateY",
    ]);
    const pose = sample(rasterComposition(state.composition), settledPulse?.lastFrame ?? 0)[node.id] ?? {};
    expect(pose["transform.translateX"] ?? 0).toBe(18);
    expect(pose["transform.translateY"] ?? 0).toBe(6);
    expect(pose["transform.scaleX"]).toBe(1);
    const svg = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).text();
    expect(svg).toContain("scale(1, 1)");
    const peak = Math.max(...relativeKeys(pulse, "transform.scaleX").map((key) => Number(key.value)));
    expect(svg).toContain(`scale(${peak}, ${peak})`);
    expect(node.tracks.find((track) => track.property === "transform.scaleX")?.keys.some((key) => key.easing?.startsWith("cubic-bezier"))).toBe(true);
  });

  test("a drag after a motion shifts every position key, and the file keeps the entrance", async () => {
    const slide = motionNamed(readStudioMotions(), "Slide up");
    const state = createEditor();
    const node = addElement(state, "rectangle");
    moveBy(state, node.id, null, null, 4, 10);
    const timing = timingFromChoices("slower", "short", state.composition.fps);
    const written = applySimpleMotion(state, node.id, slide, timing);
    expect(timingFromChoices("slower", "short", 30)).toEqual({ applyFrame: 12, factor: 2 });
    const relativeY = relativeKeys(slide, "transform.translateY");
    const beforeY = numberKeys(node, "transform.translateY");
    const beforeX = numberKeys(node, "transform.translateX");
    expect(beforeY?.map((key) => key.frame)).toEqual(relativeY.map((key) => timing.applyFrame + Math.round(key.frame * timing.factor)));
    expect(beforeY?.map((key) => key.value)).toEqual(relativeY.map((key) => 10 + Number(key.value)));
    moveBy(state, node.id, beforeX, beforeY, 7, -3);
    const afterY = numberKeys(node, "transform.translateY");
    expect(afterY?.map((key) => key.frame)).toEqual(beforeY?.map((key) => key.frame));
    expect(afterY?.map((key) => key.value)).toEqual(relativeY.map((key) => 7 + Number(key.value)));
    expect(numberKeys(node, "transform.translateX")?.map((key) => key.value)).toEqual([11]);
    const settled = sample(rasterComposition(state.composition), written?.lastFrame ?? 0)[node.id] ?? {};
    expect(settled["transform.translateX"]).toBe(11);
    expect(settled["transform.translateY"]).toBe(7 + Number(relativeY.at(-1)?.value ?? 0));
    expect(settled["attr.opacity"]).toBe(1);
    const svg = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).text();
    const entranceY = 7 + Number(relativeY[0]?.value ?? 0);
    const restY = 7 + Number(relativeY.at(-1)?.value ?? 0);
    expect(svg).toContain(`translate(11px, ${entranceY}px)`);
    expect(svg).toContain(`translate(11px, ${restY}px)`);
    expect(svg).toContain("@keyframes");
  });

  test("Pop and Pulse scale about the element center, and a drag or resize keeps that pivot", async () => {
    const motions = readStudioMotions();
    for (const label of ["Pop", "Pulse"]) {
      const motion = motionNamed(motions, label);
      const state = createEditor();
      const node = addElement(state, "rectangle");
      moveBy(state, node.id, null, null, 40, -16);
      const written = applySimpleMotion(state, node.id, motion, { applyFrame: 0, factor: 1 });
      const last = written?.lastFrame ?? 0;
      const center = restCenter(node);
      expect(center).not.toBeNull();
      expect(state.origins[node.id]).toEqual(center);
      const mid = Math.max(1, Math.floor(last / 2));
      const centers = [0, last].map((frame) => poseCenter(state, node.id, frame));
      const during = poseCenter(state, node.id, mid);
      for (const point of [...centers, during]) {
        expect(Math.abs(point.x - (centers[0]?.x ?? 0))).toBeLessThan(0.05);
        expect(Math.abs(point.y - (centers[0]?.y ?? 0))).toBeLessThan(0.05);
      }
      const originPivot = poseCenter(state, node.id, 0);
      const scaled = sample(rasterComposition(state.composition), mid)[node.id] ?? {};
      const restScale = Number(sample(rasterComposition(state.composition), last)[node.id]?.["transform.scaleX"] ?? 1);
      const midScale = Number(scaled["transform.scaleX"] ?? 1);
      expect(midScale).not.toBeCloseTo(restScale, 2);
      const local = pathBounds(String(sample(rasterComposition(state.composition), mid)[node.id]?.["attr.d"] ?? ""));
      expect(local).not.toBeNull();
      if (!local || !originPivot) return;
      const unpivoted = artboardBounds(local, 40, -16, midScale, midScale);
      const unpivotedCenter = unpivoted.x + unpivoted.width / 2;
      expect(Math.abs(unpivotedCenter - originPivot.x)).toBeGreaterThan(1);
      const beforeX = numberKeys(node, "transform.translateX");
      const beforeY = numberKeys(node, "transform.translateY");
      moveBy(state, node.id, beforeX, beforeY, 12, 9);
      const shifted = [0, mid, last].map((frame) => poseCenter(state, node.id, frame));
      for (const point of shifted) {
        expect(Math.abs(point.x - ((centers[0]?.x ?? 0) + 12))).toBeLessThan(0.05);
        expect(Math.abs(point.y - ((centers[0]?.y ?? 0) + 9))).toBeLessThan(0.05);
      }
      const pose = capturePose(state, node.id, 0);
      expect(pose).not.toBeNull();
      if (!pose) return;
      resizeCaptured(state, node.id, pose, "se", 48, 24);
      const resized = [0, mid, last].map((frame) => poseCenter(state, node.id, frame));
      for (const point of resized) {
        expect(Math.abs(point.x - (resized[0]?.x ?? 0))).toBeLessThan(0.05);
        expect(Math.abs(point.y - (resized[0]?.y ?? 0))).toBeLessThan(0.05);
      }
      expect(state.origins[node.id]).toEqual(restCenter(node));
      const svg = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).text();
      expect(svg).toContain("scale(");
      expect(svg).not.toContain("scale(0, 0)");
    }
  });

  test("length keeps the entrance, and a looped export repeats that duration", async () => {
    const slide = motionNamed(readStudioMotions(), "Slide up");
    const state = createEditor();
    const node = addElement(state, "rectangle");
    moveBy(state, node.id, null, null, 16, 9);
    const written = applySimpleMotion(state, node.id, slide, { applyFrame: 0, factor: 1 });
    const end = written?.lastFrame ?? 0;
    expect(minimumDurationFrames(state)).toBe(end + 1);
    const framesBefore = node.tracks.map((track) => track.keys.map((key) => key.frame));
    expect(setLengthSeconds(state, 4)).toBe(120);
    expect(state.composition.durationInFrames).toBe(120);
    expect(node.tracks.map((track) => track.keys.map((key) => key.frame))).toEqual(framesBefore);
    expect(lengthFieldText(120, 30)).toBe("4");
    const settled = sample(rasterComposition(state.composition), end)[node.id] ?? {};
    expect(settled["transform.translateX"]).toBe(16);
    expect(settled["transform.translateY"]).toBe(9);
    expect(settled["attr.opacity"]).toBe(1);
    setLoop(state, true);
    const looped = await svgFile(state.composition, "css-embedded").text();
    expect(looped).toContain("4s linear 0s infinite");
    expect(looped).not.toContain("0s 1 normal");
    const smil = await svgFile(state.composition, "smil").text();
    expect(smil).toContain('repeatCount="indefinite"');
    expect(smil).toContain('dur="4s"');
    const zip = new TextDecoder().decode(await svgFile(state.composition, "css-external").arrayBuffer());
    expect(zip.startsWith("PK")).toBe(true);
    expect(zip).toContain("4s linear 0s infinite");
    expect(setLengthSeconds(state, 0.2)).toBe(end + 1);
    expect(node.tracks.map((track) => track.keys.map((key) => key.frame))).toEqual(framesBefore);
    expect(lengthFieldText(end + 1, 30)).toBe("1.23");
    const clamped = sample(rasterComposition(state.composition), end)[node.id] ?? {};
    expect(clamped["transform.translateY"]).toBe(9);
    expect(clamped["attr.opacity"]).toBe(1);
    const short = await svgFile(state.composition, "css-embedded").text();
    expect(short).toContain("1.2333s linear 0s infinite");
    expect(short).not.toContain("0.2s");
    const project = projectFromEditor(state, [], save);
    const html = await saveAndExportHtml(project, save).text();
    const script = html.match(/<script id="svgif-project"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
    const saved = JSON.parse(script) as { composition: { durationInFrames: number; loop?: boolean } };
    expect(saved.composition.durationInFrames).toBe(end + 1);
    expect(saved.composition.loop).toBe(true);
    const fromHtml = compile(
      {
        ...(saved.composition as { fps: number; width: number; height: number; durationInFrames: number; nodes: [] }),
        loop: true,
      },
      "css-embedded",
    ).svg;
    expect(fromHtml).toContain("1.2333s linear 0s infinite");
    setLoop(state, false);
    const once = await svgFile(state.composition, "css-embedded").text();
    const direct = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).text();
    expect(once).toBe(direct);
    expect(once).toContain("1.2333s linear 0s 1 normal");
    expect(once.includes("infinite")).toBe(false);
  });

  test("a looped still element stays on the rest pose at both ends", async () => {
    const state = createEditor();
    const node = addElement(state, "rectangle");
    moveBy(state, node.id, null, null, 22, -7);
    setLengthSeconds(state, 2);
    setLoop(state, true);
    const start = sample(rasterComposition(state.composition), 0)[node.id] ?? {};
    const end = sample(rasterComposition(state.composition), state.composition.durationInFrames - 1)[node.id] ?? {};
    expect(start["transform.translateX"]).toBe(22);
    expect(end["transform.translateX"]).toBe(22);
    expect(start["transform.translateY"]).toBe(-7);
    expect(end["transform.translateY"]).toBe(-7);
    const svg = await svgFile(state.composition, "css-embedded").text();
    expect(svg.includes("@keyframes")).toBe(false);
    expect(svg).toContain("translate(22px, -7px)");
    const project = projectFromEditor(state, [], save);
    const html = await saveAndExportHtml(project, save).text();
    expect(html).toContain('"durationInFrames":60');
    expect(html).toContain('"loop":true');
  });
});

describe("plain download", () => {
  test("image bytes match the existing SVG export, including length, loop, and live text", async () => {
    const state = createEditor();
    const node = addElement(state, "rectangle");
    setLengthSeconds(state, 2);
    expect(hasSomethingToExport(0)).toBe(false);
    expect(NOTHING_TO_EXPORT).toBe("There is nothing to download yet.");
    expect(hasSomethingToExport(state.composition.nodes.length)).toBe(true);
    const plain = await imageFile(state).arrayBuffer();
    const existing = await exportSvg(rasterComposition(state.composition), { backend: "css-embedded" }).arrayBuffer();
    expect(new Uint8Array(plain)).toEqual(new Uint8Array(existing));
    expect(IMAGE_NAME).toBe("animation.svg");

    const slide = motionNamed(readStudioMotions(), "Slide up");
    applySimpleMotion(state, node.id, slide, { applyFrame: 0, factor: 1 });
    setText(state, node.id, "Sale 50%");
    setLengthSeconds(state, 4);
    setLoop(state, true);
    const composition = compositionWithWords(state);
    const image = await imageFile(state).arrayBuffer();
    const looped = await svgFile(composition, "css-embedded").arrayBuffer();
    expect(new Uint8Array(image)).toEqual(new Uint8Array(looped));
    const svg = new TextDecoder().decode(image);
    expect(svg).toContain("Sale 50%");
    expect(svg).toMatch(/<text[\s>]/);
    expect(svg).toContain("4s linear 0s infinite");
    expect(svg).not.toContain("0s 1 normal");

    setLoop(state, false);
    const onceComposition = compositionWithWords(state);
    const once = await imageFile(state).arrayBuffer();
    const viaFile = await svgFile(onceComposition, "css-embedded").arrayBuffer();
    const viaExport = await exportSvg(
      {
        fps: onceComposition.fps,
        width: onceComposition.width,
        height: onceComposition.height,
        durationInFrames: onceComposition.durationInFrames,
        nodes: onceComposition.nodes,
      },
      { backend: "css-embedded" },
    ).arrayBuffer();
    expect(new Uint8Array(once)).toEqual(new Uint8Array(viaFile));
    expect(new Uint8Array(once)).toEqual(new Uint8Array(viaExport));
    const onceSvg = new TextDecoder().decode(once);
    expect(onceSvg).toContain("Sale 50%");
    expect(onceSvg).toMatch(/<text[\s>]/);
    expect(onceSvg).toContain("4s linear 0s 1 normal");
    expect(onceSvg.includes("infinite")).toBe(false);
  });

  test("advanced and simple image bytes match for the same project", async () => {
    const state = createEditor();
    const node = addElement(state, "rectangle");
    const slide = motionNamed(readStudioMotions(), "Slide up");
    applySimpleMotion(state, node.id, slide, { applyFrame: 0, factor: 1 });
    setText(state, node.id, "Sale 50%");
    setLengthSeconds(state, 4);
    setLoop(state, true);
    const simple = new Uint8Array(await imageFile(state).arrayBuffer());
    const advanced = new Uint8Array(await svgDownload(state, "css-embedded").arrayBuffer());
    expect(advanced).toEqual(simple);
    const svg = new TextDecoder().decode(simple);
    expect(svg).toContain("Sale 50%");
    expect(svg).toMatch(/<text[\s>]/);
    expect(svg).toContain("4s linear 0s infinite");
    const handed = rasterWithWords(state);
    expect("loop" in handed).toBe(false);
    expect((handed.nodes[0] as { text?: string }).text).toBe("Sale 50%");
    setText(state, node.id, "");
    const cleared = rasterWithWords(state);
    expect((cleared.nodes[0] as { text?: string }).text).toBe("");
    const clearedSvg = new TextDecoder().decode(await svgDownload(state, "css-embedded").arrayBuffer());
    expect(clearedSvg).not.toContain("Sale 50%");
  });

  test("video picks the raster exporter without naming it, or says the browser cannot", () => {
    expect(videoKind(exportSupport(flags({})))).toBe("webm");
    expect(videoKind(exportSupport(flags({ videoEncoder: false, mediaRecorderWebm: false, canvasBlobSvg: true })))).toBe("webp");
    expect(
      videoKind(
        exportSupport(flags({ videoEncoder: false, mediaRecorderWebm: false, canvasBlobSvg: false, pureJsWebp: false })),
      ),
    ).toBe("none");
    expect(VIDEO_UNSUPPORTED).toBe("This browser can't make a video. Try Download image.");
    expect(VIDEO_PROGRESS).toBe("Making the video\u2026");
    const panelWords = `${VIDEO_UNSUPPORTED} ${VIDEO_PROGRESS} ${NOTHING_TO_EXPORT} Download image Download video`.toLowerCase();
    for (const word of ["smil", "css embedded", "offscreen", "codec", "backend", "webp", "webm", "gif", "keyframe"]) {
      expect(panelWords).not.toContain(word);
    }
  });
});

describe("undo", () => {
  test("undo restores words and an added shape", () => {
    const state = createEditor();
    const history = createHistory();
    const before = editorSnap(state);
    let textId = "";
    recordEdit(history, state, () => {
      textId = addElement(state, "text").id;
    });
    const added = editorSnap(state);
    expect(state.texts[textId]).toBe("Text");
    expect(state.labels[textId]).toBe("Text");
    recordEdit(history, state, () => setText(state, textId, "Sale"));
    const sale = editorSnap(state);
    recordEdit(history, state, () => {
      state.labels[textId] = "Badge";
    });
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(sale);
    expect(state.texts[textId]).toBe("Sale");
    expect(state.labels[textId]).toBe("Text");
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(added);
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(before);
    expect(redoEdit(history, state)).toBe(true);
    expect(state.texts[state.composition.nodes[0]?.id ?? ""]).toBe("Text");
  });

  test("undo restores a move, a resize, the length, and loop", () => {
    const state = createEditor();
    const history = createHistory();
    const node = addElement(state, "rectangle");
    const origin = editorSnap(state);
    recordEdit(history, state, () => moveBy(state, node.id, null, null, 15, -4));
    const moved = editorSnap(state);
    const pose = capturePose(state, node.id, 0);
    expect(pose).not.toBeNull();
    recordEdit(history, state, () => {
      if (pose) resizeCaptured(state, node.id, pose, "se", 24, 10);
    });
    const sized = editorSnap(state);
    recordEdit(history, state, () => {
      setLengthSeconds(state, 4);
    });
    const lengthened = editorSnap(state);
    expect(state.composition.durationInFrames).toBe(120);
    recordEdit(history, state, () => setLoop(state, true));
    expect(state.composition.loop).toBe(true);
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(lengthened);
    expect(state.composition.loop).not.toBe(true);
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(sized);
    expect(state.composition.durationInFrames).toBe(90);
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(moved);
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(origin);
    const restored = state.composition.nodes[0];
    expect(restored).toBeDefined();
    if (!restored) return;
    expect(restPosition(restored)).toEqual({ x: 0, y: 0 });
  });

  test("undo restores a motion so a later replace and length clamp use that motion", () => {
    const motions = readStudioMotions();
    const fade = motionNamed(motions, "Fade in");
    const slide = motionNamed(motions, "Slide up");
    const pulse = motionNamed(motions, "Pulse");
    const make = () => {
      const state = createEditor();
      const node = addElement(state, "rectangle");
      moveBy(state, node.id, null, null, 12, 4);
      state.labels[node.id] = "Badge";
      state.texts[node.id] = "Sale";
      return { state, node };
    };
    const edited = make();
    const history = createHistory();
    recordEdit(history, edited.state, () => {
      applySimpleMotion(edited.state, edited.node.id, fade, { applyFrame: 0, factor: 1 });
    });
    const faded = editorSnap(edited.state);
    recordEdit(history, edited.state, () => {
      stateSpeed(edited.state, "faster");
      applySimpleMotion(edited.state, edited.node.id, fade, timingFromChoices("faster", edited.state.motionDelay, edited.state.composition.fps));
    });
    expect(edited.state.motionSpeed).toBe("faster");
    expect(undoEdit(history, edited.state)).toBe(true);
    expect(editorSnap(edited.state)).toBe(faded);
    expect(edited.state.motionSpeed).toBe("normal");
    recordEdit(history, edited.state, () => {
      edited.state.motionDelay = "short";
      applySimpleMotion(
        edited.state,
        edited.node.id,
        fade,
        timingFromChoices(edited.state.motionSpeed, "short", edited.state.composition.fps),
      );
    });
    expect(undoEdit(history, edited.state)).toBe(true);
    expect(editorSnap(edited.state)).toBe(faded);
    recordEdit(history, edited.state, () => {
      applySimpleMotion(edited.state, edited.node.id, slide, { applyFrame: 0, factor: 1 });
    });
    expect(undoEdit(history, edited.state)).toBe(true);
    expect(editorSnap(edited.state)).toBe(faded);
    expect(edited.state.simpleMotions[edited.node.id]?.file).toBe(fade.file);
    expect(edited.state.labels[edited.node.id]).toBe("Badge");
    expect(edited.state.texts[edited.node.id]).toBe("Sale");
    recordEdit(history, edited.state, () => {
      applySimpleMotion(edited.state, edited.node.id, pulse, { applyFrame: 0, factor: 1 });
    });
    const control = make();
    applySimpleMotion(control.state, control.node.id, fade, { applyFrame: 0, factor: 1 });
    applySimpleMotion(control.state, control.node.id, pulse, { applyFrame: 0, factor: 1 });
    expect(editorSnap(edited.state)).toBe(editorSnap(control.state));

    const lengthened = make();
    const lengthHistory = createHistory();
    recordEdit(lengthHistory, lengthened.state, () => {
      applySimpleMotion(lengthened.state, lengthened.node.id, slide, { applyFrame: 0, factor: 1 });
    });
    const entrance = minimumDurationFrames(lengthened.state);
    recordEdit(lengthHistory, lengthened.state, () => setLengthSeconds(lengthened.state, 4));
    expect(lengthened.state.composition.durationInFrames).toBe(120);
    recordEdit(lengthHistory, lengthened.state, () => setLengthSeconds(lengthened.state, 0.2));
    expect(lengthened.state.composition.durationInFrames).toBe(entrance);
    expect(undoEdit(lengthHistory, lengthened.state)).toBe(true);
    expect(lengthened.state.composition.durationInFrames).toBe(120);
    expect(lengthened.state.simpleMotions[lengthened.node.id]?.file).toBe(slide.file);
    expect(setLengthSeconds(lengthened.state, 0.2)).toBe(entrance);
  });

  test("a new edit clears redo", () => {
    const state = createEditor();
    const history = createHistory();
    const node = addElement(state, "text");
    recordEdit(history, state, () => setText(state, node.id, "Sale"));
    recordEdit(history, state, () => setText(state, node.id, "Sale 50%"));
    expect(undoEdit(history, state)).toBe(true);
    expect(state.texts[node.id]).toBe("Sale");
    expect(canRedo(history)).toBe(true);
    expect(redoEdit(history, state)).toBe(true);
    expect(state.texts[node.id]).toBe("Sale 50%");
    expect(undoEdit(history, state)).toBe(true);
    recordEdit(history, state, () => setText(state, node.id, "Hello"));
    expect(canRedo(history)).toBe(false);
    expect(redoEdit(history, state)).toBe(false);
    expect(state.texts[node.id]).toBe("Hello");
    expect(undoEdit(history, state)).toBe(true);
    expect(state.texts[node.id]).toBe("Sale");
  });

  test("a whole drag is one step", () => {
    const state = createEditor();
    const history = createHistory();
    const node = addElement(state, "rectangle");
    const before = editorSnap(state);
    const started = cloneEditor(state);
    const originX = numberKeys(node, "transform.translateX");
    const originY = numberKeys(node, "transform.translateY");
    moveBy(state, node.id, originX, originY, 4, 1);
    moveBy(state, node.id, originX, originY, 11, -3);
    moveBy(state, node.id, originX, originY, 18, 6);
    expect(commitEdit(history, started, state)).toBe(true);
    expect(history.undo).toHaveLength(1);
    expect(restPosition(node)).toEqual({ x: 18, y: 6 });
    expect(undoEdit(history, state)).toBe(true);
    expect(editorSnap(state)).toBe(before);
    expect(redoEdit(history, state)).toBe(true);
    expect(restPosition(node)).toEqual({ x: 18, y: 6 });
    const pose = capturePose(state, node.id, 0);
    expect(pose).not.toBeNull();
    if (!pose) return;
    const sized = cloneEditor(state);
    resizeCaptured(state, node.id, pose, "se", 8, 4);
    resizeCaptured(state, node.id, pose, "se", 20, 10);
    resizeCaptured(state, node.id, pose, "se", 36, 16);
    expect(commitEdit(history, sized, state)).toBe(true);
    expect(history.undo).toHaveLength(2);
    const grown = state.composition.nodes[0]?.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value;
    expect(undoEdit(history, state)).toBe(true);
    const restored = state.composition.nodes[0];
    expect(restored?.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value).not.toBe(grown);
    expect(restored).toBeDefined();
    if (!restored) return;
    expect(restPosition(restored)).toEqual({ x: 18, y: 6 });
    expect(history.undo).toHaveLength(1);
  });

  test("history keeps fifty edits and a replaced composition clears it", () => {
    const state = createEditor();
    const history = createHistory();
    const node = addElement(state, "rectangle");
    state.labels[node.id] = "0";
    for (let step = 1; step <= HISTORY_LIMIT + 5; step += 1) {
      recordEdit(history, state, () => {
        state.labels[node.id] = String(step);
      });
    }
    expect(history.undo).toHaveLength(HISTORY_LIMIT);
    expect(state.labels[node.id]).toBe(String(HISTORY_LIMIT + 5));
    for (let step = 0; step < HISTORY_LIMIT; step += 1) expect(undoEdit(history, state)).toBe(true);
    expect(state.labels[node.id]).toBe("5");
    expect(canUndo(history)).toBe(false);
    recordEdit(history, state, () => setText(state, node.id, "Sale"));
    expect(canUndo(history)).toBe(true);
    const next = exportComposition(state.composition);
    next.durationInFrames = 12;
    resetForComposition(history, state, next);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(state.texts).toEqual({});
    expect(state.labels).toEqual({});
    expect(state.simpleMotions).toEqual({});
    expect(state.motionSpeed).toBe("normal");
    expect(state.motionDelay).toBe("none");
    expect(state.composition.durationInFrames).toBe(12);
  });

  test("selection and an unchanged length are not steps", () => {
    const state = createEditor();
    const history = createHistory();
    const node = addElement(state, "rectangle");
    expect(recordEdit(history, state, () => selectNode(state, node.id))).toBe(false);
    expect(recordEdit(history, state, () => setLengthSeconds(state, 3))).toBe(false);
    expect(canUndo(history)).toBe(false);
    state.frame = 8;
    const before = editorSnap(state);
    expect(recordEdit(history, state, () => moveBy(state, node.id, null, null, 3, 1))).toBe(true);
    expect(undoEdit(history, state)).toBe(true);
    expect(state.frame).toBe(8);
    expect(editorSnap(state)).toBe(before);
  });

  test("keyboard shortcuts map to undo and redo", () => {
    const plain = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
    expect(historyCommand({ ...plain, key: "z", ctrlKey: true })).toBe("undo");
    expect(historyCommand({ ...plain, key: "z", metaKey: true })).toBe("undo");
    expect(historyCommand({ ...plain, key: "Z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(historyCommand({ ...plain, key: "z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(historyCommand({ ...plain, key: "y", ctrlKey: true })).toBe("redo");
    expect(historyCommand({ ...plain, key: "y", metaKey: true })).toBe("redo");
    expect(historyCommand({ ...plain, key: "z" })).toBeNull();
    expect(historyCommand({ ...plain, key: "z", ctrlKey: true, altKey: true })).toBeNull();
  });
});

function stateSpeed(state: ReturnType<typeof createEditor>, speed: string): void {
  state.motionSpeed = speed;
}

function editorSnap(state: ReturnType<typeof createEditor>): string {
  return JSON.stringify(cloneEditor(state));
}

function poseCenter(state: ReturnType<typeof createEditor>, nodeId: string, frame: number): { x: number; y: number } {
  const sampled = sample(rasterComposition(state.composition), frame)[nodeId] ?? {};
  const local = sampledGeometry(state, nodeId, frame);
  if (!local) return { x: Number.NaN, y: Number.NaN };
  const tx = typeof sampled["transform.translateX"] === "number" ? sampled["transform.translateX"] : 0;
  const ty = typeof sampled["transform.translateY"] === "number" ? sampled["transform.translateY"] : 0;
  const sx = typeof sampled["transform.scaleX"] === "number" ? sampled["transform.scaleX"] : 1;
  const sy = typeof sampled["transform.scaleY"] === "number" ? sampled["transform.scaleY"] : 1;
  const box = artboardBounds(local, tx, ty, sx, sy);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function relativeKeys(motion: MotionDef, property: string): MotionDef["tracks"][number]["keys"] {
  const track = motion.tracks.find((item) => item.property === property);
  if (!track) throw new Error(`missing ${property}`);
  return track.keys;
}

function motionNamed(motions: MotionDef[], label: string): MotionDef {
  const motion = motions.find((item) => item.label === label);
  if (!motion) throw new Error(`missing motion ${label}`);
  return motion;
}

function readStudioMotions(): MotionDef[] {
  const dir = join(studio, "motions");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as unknown;
  const files: Record<string, unknown> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    files[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
  }
  return motionsFromDocuments(index, files);
}

function readTree(dir: string): string {
  const parts: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) parts.push(readTree(path));
    else parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}
