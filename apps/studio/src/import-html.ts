/**
 * Open an HTML project with DOMParser.
 * The reader keeps the project script, the identity meta tags, and presentation
 * meta tags when that object is present. Scripts are not run. Foreign markup is dropped.
 */

import { loadComposition, type Composition } from "./composition.ts";
import { parseHtmlTree, type HtmlNode } from "./html-tree.ts";
import { compareVersions, SUPPORTED_SCHEMA_VERSION } from "./runtime.ts";

export interface ImportedProject {
  schemaVersion: number;
  schemaRevision: number;
  generator: string;
  runtime: {
    mode: "cdn" | "inline";
    version: string;
    sri: string;
    studioSri: { js: string; css: string };
  };
  composition: Composition;
  provenance: { generations: Generation[] };
  presentation?: Presentation;
}

export interface Generation {
  id: string;
  parentId: string | null;
  schemaVersion: number;
  runtimeVersion: string;
  savedAt: string;
}

export interface Presentation {
  workId: string;
  title: string;
  description: string;
}

export type ImportResult =
  | { ok: true; project: ImportedProject; migrate: boolean }
  | { ok: false; code: "schema-too-new" | "script-mismatch" | "invalid"; message: string };

const GENERATOR =
  /^@modootoday\/svgif@(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const VERSION =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SRI = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const STAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;

interface View {
  id: string;
  text: string;
  getAttribute(name: string): string | null;
}

function views(doc: { querySelectorAll(selector: string): Iterable<HtmlNode> | Iterable<Element> }, tag: string): View[] {
  return [...doc.querySelectorAll(tag)].map((node) => {
    const element = node as HtmlNode;
    return {
      id: element.id ?? "",
      text: element.textContent ?? "",
      getAttribute: (name: string) => element.getAttribute(name),
    };
  });
}

function parseWithDom(markup: string): View[][] {
  const Parser = globalThis.DOMParser;
  const doc =
    typeof Parser === "function"
      ? new Parser().parseFromString(markup, "text/html")
      : parseHtmlTree(markup);
  return [views(doc, "script"), views(doc, "meta")];
}

function metaMap(metas: View[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const meta of metas) {
    const name = meta.getAttribute("name");
    if (name) map.set(name, meta.getAttribute("content") ?? "");
  }
  return map;
}

function fail(code: ImportResult extends infer R ? (R extends { ok: false } ? R["code"] : never) : never, message: string): ImportResult {
  return { ok: false, code, message };
}

export function importHtml(markup: string, supportedVersion = "0.0.0"): ImportResult {
  const [scripts, metas] = parseWithDom(markup);
  const projects = scripts.filter(
    (script) => script.id === "svgif-project" && script.getAttribute("type") === "application/vnd.svgif.project+json",
  );
  if (projects.length !== 1) return fail("invalid", "The file needs one svgif project script.");
  const raw = projects[0]?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("invalid", "The project script is not JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("invalid", "The project script must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.schemaVersion === "number" && record.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    return fail("schema-too-new", "schema-too-new");
  }
  const identity = metaMap(metas);
  if (identity.get("svgif:schema") !== String(record.schemaVersion)) {
    return fail("script-mismatch", "svgif:schema does not match the project script.");
  }
  if (identity.get("svgif:revision") !== String(record.schemaRevision)) {
    return fail("script-mismatch", "svgif:revision does not match the project script.");
  }
  if (identity.get("svgif:generator") !== record.generator) {
    return fail("script-mismatch", "svgif:generator does not match the project script.");
  }
  if (record.presentation !== undefined) {
    const presentation = record.presentation;
    if (presentation === null || typeof presentation !== "object") {
      return fail("invalid", "presentation must be an object.");
    }
    const card = presentation as Record<string, unknown>;
    if (identity.get("svgif:title") !== card.title) return fail("script-mismatch", "svgif:title does not match presentation.");
    if (identity.get("svgif:description") !== card.description) {
      return fail("script-mismatch", "svgif:description does not match presentation.");
    }
    if (identity.get("svgif:work") !== card.workId) return fail("script-mismatch", "svgif:work does not match presentation.");
  }
  const project = validateProject(record);
  if (!project) return fail("invalid", "The project does not match the supported schema.");
  const migrate =
    project.schemaVersion < SUPPORTED_SCHEMA_VERSION || compareVersions(project.runtime.version, supportedVersion) < 0;
  return { ok: true, project, migrate };
}

function validateProject(record: Record<string, unknown>): ImportedProject | null {
  if (record.schemaVersion !== 1 || record.schemaRevision !== 0) return null;
  if (typeof record.generator !== "string" || !GENERATOR.test(record.generator)) return null;
  const runtime = record.runtime;
  if (runtime === null || typeof runtime !== "object") return null;
  const run = runtime as Record<string, unknown>;
  if (run.mode !== "cdn" && run.mode !== "inline") return null;
  if (typeof run.version !== "string" || !VERSION.test(run.version)) return null;
  if (typeof run.sri !== "string" || !SRI.test(run.sri)) return null;
  const studio = run.studioSri;
  if (studio === null || typeof studio !== "object") return null;
  const sri = studio as Record<string, unknown>;
  if (typeof sri.js !== "string" || !SRI.test(sri.js) || typeof sri.css !== "string" || !SRI.test(sri.css)) return null;
  const composition = loadComposition(record.composition);
  if (!composition) return null;
  const provenance = record.provenance;
  if (provenance === null || typeof provenance !== "object") return null;
  const generations = (provenance as { generations?: unknown }).generations;
  if (!Array.isArray(generations)) return null;
  const cleanGenerations: Generation[] = [];
  for (const item of generations) {
    const generation = validateGeneration(item);
    if (!generation) return null;
    cleanGenerations.push(generation);
  }
  const allowed = new Set(["schemaVersion", "schemaRevision", "generator", "runtime", "composition", "provenance"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return null;
  }
  return {
    schemaVersion: 1,
    schemaRevision: 0,
    generator: record.generator,
    runtime: {
      mode: run.mode,
      version: run.version,
      sri: run.sri,
      studioSri: { js: sri.js, css: sri.css },
    },
    composition,
    provenance: { generations: cleanGenerations },
  };
}

function validateGeneration(value: unknown): Generation | null {
  if (value === null || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !UUID.test(item.id)) return null;
  if (!(item.parentId === null || (typeof item.parentId === "string" && UUID.test(item.parentId)))) return null;
  if (typeof item.schemaVersion !== "number" || !Number.isInteger(item.schemaVersion) || item.schemaVersion < 1) return null;
  if (typeof item.runtimeVersion !== "string" || item.runtimeVersion.length === 0) return null;
  if (typeof item.savedAt !== "string" || !STAMP.test(item.savedAt)) return null;
  const keys = Object.keys(item);
  for (const key of keys) {
    if (!["id", "parentId", "schemaVersion", "runtimeVersion", "savedAt"].includes(key)) return null;
  }
  return {
    id: item.id,
    parentId: item.parentId as string | null,
    schemaVersion: item.schemaVersion,
    runtimeVersion: item.runtimeVersion,
    savedAt: item.savedAt,
  };
}

/** Playback markup rebuilt from the composition. Foreign scripts and handlers are not copied. */
export function liveDocument(composition: Composition): string {
  const nodes = composition.nodes
    .map((node) => `<g id="${node.id.replaceAll('"', "")}"></g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${composition.width} ${composition.height}">${nodes}</svg>`;
}
