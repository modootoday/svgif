import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  addElement,
  applyMotionTracks,
  createEditor,
  groupSelection,
  reorderNode,
  ungroup,
} from "../src/composition.ts";
import { exportSupport, type CapabilityFlags } from "../src/export-support.ts";
import { parseHtmlTree } from "../src/html-tree.ts";
import { importHtml, liveDocument } from "../src/import-html.ts";
import { paintComposition } from "../src/playback.ts";
import { categoriesOf, filterPresets, parsePresetIndex, placeComponentPreset, applyMotionPreset } from "../src/presets.ts";
import { copySource, projectFromEditor, saveAndExportHtml } from "../src/project-file.ts";
import { shellMarkup, timelineMarkup, layerListMarkup } from "../src/shell-markup.ts";

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

function readTree(dir: string): string {
  const parts: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) parts.push(readTree(path));
    else parts.push(readFileSync(path, "utf8"));
  }
  return parts.join("\n");
}
