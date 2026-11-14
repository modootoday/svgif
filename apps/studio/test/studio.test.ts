import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  addElement,
  applyMotionTracks,
  createEditor,
  seedBlankShape,
  setText,
  exportComposition,
  groupSelection,
  moveKeyframe,
  projectComposition,
  rasterComposition,
  removeKeyframe,
  replaceComposition,
  reorderNode,
  setEasing,
  setKeyframe,
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
import { pathBounds, resizeRestPath, restPosition, writeRestPosition } from "../src/direct.ts";
import { explicitShell, rememberedShell, resolveShell, toggledShell } from "../src/shell-mode.ts";
import { inspectorMarkup, shellMarkup, timelineMarkup, layerListMarkup } from "../src/shell-markup.ts";
import { compile } from "../../../packages/svgif/src/lower/index.ts";
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
    expect(html).toContain("Placeholder. Download image and download video are not here yet.");
    expect(html).toContain('class="timeline"');
    expect(html).toContain('aria-label="Frame"');
    expect(html).toContain(">Tracks<");
    expect(html).toContain('data-handle="se"');
    const state = createEditor();
    const node = addElement(state, "rectangle");
    state.selection = [node.id];
    expect(inspectorMarkup(state)).toContain("json-dump");
    const panelStart = html.indexOf('id="simple-panel"');
    const panel = html.slice(panelStart, html.indexOf("</aside>", panelStart));
    for (const word of ["timeline", "track", "json", "frame", "keyframe", "attr.d", "transform.", "codec", "backend", "capability", "smil", "offscreen", "preset"]) {
      expect(panel.toLowerCase()).not.toContain(word);
    }
    const source = ["shell-mode.ts", "main.ts", "shell-markup.ts", "direct.ts"]
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
    writeRestPosition(state, node.id, 24, -8);
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
    writeRestPosition(state, node.id, 24, -8);
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
});

function readTree(dir: string): string {
  const parts: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) parts.push(readTree(path));
    else parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}
