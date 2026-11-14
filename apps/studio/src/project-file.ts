/** Save, export HTML, and copy source share one project object and one HTML writer. */

import { exportHtml, type HtmlExportOptions, type HtmlProject } from "../../../packages/svgif-export/src/html.ts";
import { exportComposition, projectComposition, type Composition, type EditorState } from "./composition.ts";
import type { Generation, ImportedProject } from "./import-html.ts";
import { CDN_HOST, GENERATOR, PLAYER_SOURCE, RUNTIME_VERSION, sha384Sri } from "./runtime.ts";

export interface SaveOptions {
  embedPlayer: boolean;
  embedStudio: boolean;
  savedAt: string;
  id: string;
  cdnHost?: string;
  playerSource?: string;
  studioSource?: string;
  studioCss?: string;
  runtimeSri?: string;
  studioSri?: { js: string; css: string };
}

const EMPTY_SRI = "sha384-0000000000000000000000000000000000000000000000000000000000000000";

export function appendGeneration(previous: Generation[], options: SaveOptions): Generation[] {
  const parent = previous.length > 0 ? previous[previous.length - 1]?.id ?? null : null;
  return [
    ...previous.map((item) => ({ ...item })),
    {
      id: options.id,
      parentId: parent,
      schemaVersion: 1,
      runtimeVersion: RUNTIME_VERSION,
      savedAt: options.savedAt,
    },
  ];
}

export function projectFromEditor(state: EditorState, previous: Generation[], options: SaveOptions): HtmlProject {
  const runtime = runtimeOf(options);
  return {
    schemaVersion: 1,
    schemaRevision: 0,
    generator: GENERATOR,
    runtime,
    composition: projectComposition(state.composition) as unknown as HtmlProject["composition"],
    provenance: { generations: appendGeneration(previous, options) },
  };
}

export function projectFromImport(project: ImportedProject, options: SaveOptions): HtmlProject {
  return {
    schemaVersion: 1,
    schemaRevision: 0,
    generator: GENERATOR,
    runtime: runtimeOf(options, project),
    composition: projectComposition(project.composition) as unknown as HtmlProject["composition"],
    provenance: { generations: appendGeneration(project.provenance.generations, options) },
  };
}

function runtimeOf(options: SaveOptions, previous?: ImportedProject): HtmlProject["runtime"] {
  return {
    mode: options.embedPlayer ? "inline" : "cdn",
    version: RUNTIME_VERSION,
    sri: options.runtimeSri ?? previous?.runtime.sri ?? EMPTY_SRI,
    studioSri: options.studioSri ?? previous?.runtime.studioSri ?? { js: EMPTY_SRI, css: EMPTY_SRI },
  };
}

export function htmlOptions(options: SaveOptions): HtmlExportOptions {
  return {
    cdnHost: options.cdnHost ?? CDN_HOST,
    playerSource: options.playerSource ?? PLAYER_SOURCE,
    studioSource: options.studioSource ?? "",
    studioCss: options.studioCss ?? "",
    embedStudio: options.embedStudio,
  };
}

/** Save and Export HTML. Both call this function, which calls the HTML writer. */
export function saveAndExportHtml(project: HtmlProject, options: SaveOptions): Blob {
  return exportHtml(project, htmlOptions(options));
}

function scriptJson(project: HtmlProject): string {
  return JSON.stringify(project)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** CDN fragment or inline fragment. Studio is included only when embed studio is on. */
export function copySource(project: HtmlProject, options: SaveOptions): string {
  const json = scriptJson(project);
  const script = `<script id="svgif-project" type="application/vnd.svgif.project+json">${json}</script>`;
  const host = options.cdnHost ?? CDN_HOST;
  const version = project.runtime.version;
  const player =
    project.runtime.mode === "inline"
      ? `<script type="module" id="svgif-player">${options.playerSource ?? PLAYER_SOURCE}</script>`
      : `<script type="module" id="svgif-player" src="https://${host}/svgif/${version}/svgif.mjs" integrity="${project.runtime.sri}" crossorigin="anonymous"></script>`;
  const studio = options.embedStudio
    ? [
        `<script type="text/plain" id="svgif-studio-css">${options.studioCss ?? ""}</script>`,
        `<script type="text/plain" id="svgif-studio-source">${options.studioSource ?? ""}</script>`,
      ].join("\n")
    : "";
  return [script, player, studio].filter((part) => part.length > 0).join("\n");
}

export async function defaultSri(player = PLAYER_SOURCE, studioJs = "", studioCss = ""): Promise<{
  runtimeSri: string;
  studioSri: { js: string; css: string };
}> {
  return {
    runtimeSri: await sha384Sri(player),
    studioSri: {
      js: await sha384Sri(studioJs),
      css: await sha384Sri(studioCss),
    },
  };
}

export function compositionForRaster(composition: Composition) {
  return exportComposition(composition);
}
