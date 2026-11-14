/** Preset index. Categories and ids come from the fetched document. */

import {
  applyMotionTracks,
  sanitizeTrack,
  type EditorState,
  type SceneNode,
  type Track,
} from "./composition.ts";

export interface PresetEntry {
  category: string;
  id: string;
  file: string;
}

export function parsePresetIndex(value: unknown): PresetEntry[] {
  if (value === null || typeof value !== "object") throw new TypeError("preset index must be an object");
  const presets = (value as { presets?: unknown }).presets;
  if (!Array.isArray(presets)) throw new TypeError("preset index is missing presets");
  return presets.map((item) => {
    if (item === null || typeof item !== "object") throw new TypeError("preset entry must be an object");
    const entry = item as Record<string, unknown>;
    if (typeof entry.category !== "string" || typeof entry.id !== "string" || typeof entry.file !== "string") {
      throw new TypeError("preset entry is missing category, id, or file");
    }
    if (!entry.file.startsWith("presets/") || !entry.file.endsWith(".json")) {
      throw new TypeError("preset file must stay under presets/");
    }
    return { category: entry.category, id: entry.id, file: entry.file };
  });
}

export function categoriesOf(entries: PresetEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.category))].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

export function filterPresets(entries: PresetEntry[], query: string, category: string): PresetEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (!needle) return true;
    return (
      entry.id.toLowerCase().includes(needle) ||
      entry.category.toLowerCase().includes(needle) ||
      entry.file.toLowerCase().includes(needle)
    );
  });
}

export async function fetchPresetIndex(
  url = "./presets/index.json",
  fetcher: typeof fetch = fetch,
): Promise<PresetEntry[]> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error("preset index request failed");
  return parsePresetIndex(await response.json());
}

export async function fetchPresetDocument(
  entry: PresetEntry,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(`./${entry.file}`);
  if (!response.ok) throw new Error("preset request failed");
  return response.json();
}

interface LayerDraft {
  id: string;
  d?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  label?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function shapeD(value: unknown): string | undefined {
  const shape = asRecord(value);
  const d = shape?.d;
  return typeof d === "string" && d.length > 0 ? d : undefined;
}

function layersFromPreset(preset: Record<string, unknown>): LayerDraft[] {
  const component = asRecord(preset.component);
  const copied = asRecord(component?.copied);
  const rawLayers = copied?.layers;
  if (Array.isArray(rawLayers) && rawLayers.length > 0) {
    return rawLayers.map((item, index) => {
      const layer = asRecord(item) ?? {};
      const id = typeof layer.id === "string" && layer.id.length > 0 ? layer.id : `layer${index}`;
      const text = asRecord(layer.text);
      return {
        id,
        d: shapeD(layer.shape),
        fill: typeof layer.fill === "string" ? layer.fill : undefined,
        stroke: typeof layer.stroke === "string" ? layer.stroke : undefined,
        opacity: typeof layer.opacity === "number" ? layer.opacity : undefined,
        label: typeof text?.content === "string" ? text.content : undefined,
      };
    });
  }
  const text = asRecord(copied?.text);
  return [
    {
      id: typeof preset.id === "string" ? preset.id : "node",
      d: shapeD(copied?.shape),
      fill: typeof copied?.fill === "string" ? copied.fill : undefined,
      stroke: typeof copied?.stroke === "string" ? copied.stroke : undefined,
      opacity: typeof copied?.opacity === "number" ? copied.opacity : undefined,
      label: typeof text?.content === "string" ? text.content : undefined,
    },
  ];
}

export function motionTracksOf(preset: unknown): Track[] | null {
  const record = asRecord(preset);
  const motion = asRecord(record?.motionPreset);
  if (!motion || !Array.isArray(motion.tracks)) return null;
  const tracks: Track[] = [];
  for (const item of motion.tracks) {
    const clean = sanitizeTrack(item);
    if (clean) tracks.push(clean);
  }
  return tracks;
}

function safeStem(value: string): string {
  const stem = value.replace(/[^A-Za-z0-9_-]/g, "");
  const body = /^[A-Za-z0-9]/.test(stem) ? stem : `n${stem}`;
  return body.length > 0 ? body : "n";
}

function allocate(state: EditorState, stem: string): string {
  const used = new Set(state.composition.nodes.map((node) => node.id));
  let id = stem;
  let salt = 2;
  while (used.has(id)) {
    id = `${stem}-${salt}`;
    salt += 1;
  }
  return id;
}

function geometryTracks(layer: LayerDraft): Track[] {
  const tracks: Track[] = [];
  if (layer.d) tracks.push({ property: "attr.d", keys: [{ frame: 0, value: layer.d }] });
  if (layer.fill) tracks.push({ property: "attr.fill", keys: [{ frame: 0, value: layer.fill }] });
  if (layer.stroke) tracks.push({ property: "attr.stroke", keys: [{ frame: 0, value: layer.stroke }] });
  if (layer.opacity !== undefined) tracks.push({ property: "attr.opacity", keys: [{ frame: 0, value: layer.opacity }] });
  return tracks;
}

/** Place a component preset as scene nodes. Motion on the file is written onto those new nodes. */
export function placeComponentPreset(state: EditorState, preset: unknown): SceneNode[] {
  const record = asRecord(preset);
  if (!record) return [];
  const presetId = typeof record.id === "string" ? record.id : "preset";
  const layers = layersFromPreset(record);
  const motion = asRecord(record.motionPreset);
  const rawTracks = Array.isArray(motion?.tracks) ? motion.tracks : [];
  const created: SceneNode[] = [];
  layers.forEach((layer, index) => {
    const id = allocate(state, `s-${safeStem(presetId)}-${safeStem(layer.id)}`);
    const tracks = geometryTracks(layer);
    for (const item of rawTracks) {
      const source = asRecord(item);
      const layerName = typeof source?.layer === "string" ? source.layer : "";
      const targeted = layerName.length > 0;
      const matches = !targeted ? index === 0 : layerName === layer.id || layerName === id;
      if (!matches) continue;
      const clean = sanitizeTrack(item);
      if (!clean) continue;
      const existing = tracks.findIndex((track) => track.property === clean.property);
      if (existing >= 0) tracks[existing] = clean;
      else tracks.push(clean);
    }
    const node: SceneNode = { id, tracks };
    state.composition.nodes.push(node);
    if (layer.label) state.labels[id] = layer.label;
    created.push(node);
    const last = tracks.reduce((max, track) => Math.max(max, ...track.keys.map((key) => key.frame)), 0);
    if (last + 1 > state.composition.durationInFrames) state.composition.durationInFrames = last + 1;
  });
  const parameters = Array.isArray(record.parameters) ? record.parameters : [];
  const loops = parameters.some((item) => {
    const parameter = asRecord(item);
    return parameter?.name === "loop" && parameter.value === true;
  });
  if (loops) state.composition.loop = true;
  const first = created[0];
  if (first) state.selection = [first.id];
  return created;
}

/** Apply a preset's motion block to the selected node without adding a node. */
export function applyMotionPreset(state: EditorState, preset: unknown, nodeId: string): SceneNode | null {
  const tracks = motionTracksOf(preset);
  if (!tracks || tracks.length === 0) return null;
  const node = state.composition.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const hasGeometry = node.tracks.some((track) => track.property === "attr.d" && track.keys.length > 0);
  const incoming = hasGeometry ? tracks.filter((track) => track.property !== "attr.d") : tracks;
  if (incoming.length === 0) return node;
  return applyMotionTracks(state, nodeId, incoming);
}
