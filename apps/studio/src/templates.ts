/**
 * Simple-mode starting designs.
 * Names, colors, and tracks come from the JSON list.
 * A text node is drawn with its baseline on the local origin at the SVG initial size.
 * The font size in the file becomes a uniform scale about that origin, and a translate
 * track places the baseline inside the frame.
 */

import { normalizeHex, readableInk, TEXT_CONTRAST_FLOOR } from "./contrast.ts";
import {
  cloneTrack,
  sanitizeTrack,
  setKeyframe,
  type EditorState,
  type SceneNode,
  type Track,
} from "./composition.ts";

export interface TemplateColor {
  label: string;
  backdrop: string;
  ink: string;
}

export interface TemplateNode {
  role: string;
  label: string;
  text?: string;
  fontSize?: number;
  paint?: "backdrop" | "ink";
  essential?: boolean;
  tracks: Track[];
}

export interface TemplateDef {
  file: string;
  label: string;
  width: number;
  height: number;
  colors: TemplateColor[];
  nodes: TemplateNode[];
}

/** SVG initial font size. The face is this many user units tall before the scale. */
export const SVG_INITIAL_FONT = 16;

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function colorOf(value: unknown): TemplateColor | null {
  const record = asRecord(value);
  if (!record || typeof record.label !== "string" || record.label.trim().length === 0) return null;
  const backdrop = typeof record.backdrop === "string" ? normalizeHex(record.backdrop) : "";
  const ink = typeof record.ink === "string" ? normalizeHex(record.ink) : "";
  if (!backdrop || !ink) return null;
  return { label: record.label.trim(), backdrop, ink };
}

function nodeOf(value: unknown): TemplateNode | null {
  const record = asRecord(value);
  if (!record || typeof record.label !== "string" || record.label.trim().length === 0) return null;
  if (!Array.isArray(record.tracks)) return null;
  const tracks = record.tracks.flatMap((item) => {
    const track = sanitizeTrack(item);
    return track ? [track] : [];
  });
  const paint = record.paint === "backdrop" || record.paint === "ink" ? record.paint : undefined;
  const fontSize = typeof record.fontSize === "number" && Number.isFinite(record.fontSize) && record.fontSize > 0 ? record.fontSize : undefined;
  const text = typeof record.text === "string" ? record.text : undefined;
  if (tracks.length === 0 && text === undefined) return null;
  return {
    role: typeof record.role === "string" ? record.role : "",
    label: record.label.trim(),
    ...(text !== undefined ? { text } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(paint !== undefined ? { paint } : {}),
    ...(record.essential === true ? { essential: true } : {}),
    tracks,
  };
}

function templateFrom(file: string, value: unknown): TemplateDef | null {
  const record = asRecord(value);
  if (!record || typeof record.label !== "string" || record.label.trim().length === 0) return null;
  const width = positiveInt(record.width);
  const height = positiveInt(record.height);
  if (width === null || height === null || !Array.isArray(record.nodes) || !Array.isArray(record.colors)) return null;
  const colors = record.colors.flatMap((item) => {
    const color = colorOf(item);
    return color ? [color] : [];
  });
  const nodes = record.nodes.flatMap((item) => {
    const node = nodeOf(item);
    return node ? [node] : [];
  });
  if (colors.length === 0 || nodes.length === 0) return null;
  return { file, label: record.label.trim(), width, height, colors, nodes };
}

/** Designs in list order. Labels and tracks come from the documents, not from code. */
export function templatesFromDocuments(index: unknown, files: Record<string, unknown>): TemplateDef[] {
  const record = asRecord(index);
  const listed = Array.isArray(record?.files) ? record.files : [];
  const templates: TemplateDef[] = [];
  for (const item of listed) {
    if (typeof item !== "string" || !FILE_NAME.test(item)) continue;
    const template = templateFrom(item, files[item]);
    if (template) templates.push(template);
  }
  return templates;
}

/** URL of one design file beside the open Studio page. */
export function templateDocumentUrl(href: string, file: string): string {
  const url = new URL(href);
  const dir = url.pathname.endsWith("/") ? url.pathname : url.pathname.replace(/[^/]*$/, "");
  const clean = FILE_NAME.test(file) ? file : "";
  return `${url.origin}${dir}templates/${clean}`;
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error("design request failed");
  return response.json();
}

/** Load the starting designs that ship with this page. */
export async function loadTemplates(href: string, fetcher: typeof fetch = fetch): Promise<TemplateDef[]> {
  const index = await fetchJson(templateDocumentUrl(href, "index.json"), fetcher);
  const record = asRecord(index);
  const names = Array.isArray(record?.files) ? record.files.filter((item): item is string => typeof item === "string") : [];
  const files: Record<string, unknown> = {};
  await Promise.all(
    names.map(async (name) => {
      if (!FILE_NAME.test(name) || name === "index.json") return;
      files[name] = await fetchJson(templateDocumentUrl(href, name), fetcher);
    }),
  );
  return templatesFromDocuments(index, files);
}

export function templateByFile(templates: TemplateDef[], file: string): TemplateDef | undefined {
  return templates.find((template) => template.file === file);
}

function takeId(state: EditorState): string {
  const used = new Set(state.composition.nodes.map((node) => node.id));
  let id = "s-n";
  let salt = state.nextId;
  while (used.has(id)) {
    salt += 1;
    id = `s-n-${salt}`;
  }
  state.nextId = salt + 1;
  return id;
}

function writeNumber(tracks: Track[], property: string, value: number): void {
  const existing = tracks.find((track) => track.property === property);
  if (existing) existing.keys = [{ frame: 0, value }];
  else tracks.push({ property, keys: [{ frame: 0, value }] });
}

function writeFill(tracks: Track[], fill: string): void {
  const existing = tracks.find((track) => track.property === "attr.fill");
  if (existing) existing.keys = [{ frame: 0, value: fill }];
  else tracks.push({ property: "attr.fill", keys: [{ frame: 0, value: fill }] });
}

/** Scale that turns the SVG initial face into the file's font size, about the baseline. */
export function fontScale(fontSize: number): number {
  return fontSize / SVG_INITIAL_FONT;
}

export function resolvedInk(color: TemplateColor): string {
  return readableInk(color.backdrop, color.ink, TEXT_CONTRAST_FLOOR);
}

/**
 * Replace the picture with one starting design.
 * Length, loop, and the speed and delay choices stay.
 * The first color is the one the picture opens on.
 */
export function applyTemplate(state: EditorState, template: TemplateDef): SceneNode | null {
  const duration = state.composition.durationInFrames;
  const fps = state.composition.fps;
  const loop = state.composition.loop === true;
  const speed = state.motionSpeed;
  const delay = state.motionDelay;
  state.composition = {
    fps,
    width: template.width,
    height: template.height,
    durationInFrames: duration,
    nodes: [],
    ...(loop ? { loop: true } : {}),
  };
  state.groups = [];
  state.labels = {};
  state.texts = {};
  state.origins = {};
  state.simpleMotions = {};
  state.paints = {};
  state.startFile = template.file;
  state.colorChoice = 0;
  state.motionSpeed = speed;
  state.motionDelay = delay;
  state.frame = 0;
  const first = template.colors[0];
  const ink = first ? resolvedInk(first) : "";
  let words: SceneNode | null = null;
  for (const item of template.nodes) {
    const tracks = item.tracks.map(cloneTrack);
    if (item.fontSize !== undefined) {
      const scale = fontScale(item.fontSize);
      writeNumber(tracks, "transform.scaleX", scale);
      writeNumber(tracks, "transform.scaleY", scale);
    }
    if (item.paint === "backdrop" && first) writeFill(tracks, first.backdrop);
    if (item.paint === "ink" && first) writeFill(tracks, ink);
    const id = takeId(state);
    const node: SceneNode = { id, tracks };
    state.composition.nodes.push(node);
    state.labels[id] = item.label;
    if (item.paint) state.paints[id] = item.paint;
    if (item.text !== undefined) {
      state.texts[id] = item.text;
      if (!words) words = node;
    }
  }
  state.selection = words ? [words.id] : state.composition.nodes[0] ? [state.composition.nodes[0].id] : [];
  return words;
}

/** One palette choice. Backdrop and ink update together, and the ink stays readable. */
export function applyTemplateColor(state: EditorState, template: TemplateDef, index: number): boolean {
  const color = template.colors[index];
  if (!color) return false;
  const ink = resolvedInk(color);
  let wrote = false;
  for (const [id, paint] of Object.entries(state.paints)) {
    const fill = paint === "ink" ? ink : color.backdrop;
    setKeyframe(state, id, "attr.fill", 0, fill);
    wrote = true;
  }
  if (!wrote) return false;
  state.colorChoice = index;
  return true;
}
