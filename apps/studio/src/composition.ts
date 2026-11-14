/** Editor state. The saved composition is the timeline IR: one node list, tracks on each node. */

import { pathOrigin, textPath } from "./glyphs.ts";

export interface Keyframe {
  frame: number;
  value: number | string | number[];
  easing?: string;
}

export interface Track {
  property: string;
  keys: Keyframe[];
}

export interface SceneNode {
  id: string;
  tracks: Track[];
}

export interface Group {
  id: string;
  childIds: string[];
}

export interface Composition {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  loop?: boolean;
  nodes: SceneNode[];
}

export interface EditorState {
  composition: Composition;
  groups: Group[];
  labels: Record<string, string>;
  texts: Record<string, string>;
  selection: string[];
  frame: number;
  nextId: number;
  selectedLayerOnly: boolean;
}

export const KEY_PROPERTIES = [
  "transform.translateX",
  "transform.translateY",
  "transform.rotate",
  "transform.scaleX",
  "transform.scaleY",
  "attr.opacity",
  "attr.fill",
] as const;

export type ElementKind = "rectangle" | "ellipse" | "path" | "text";

const PROPERTY =
  /^(?:transform\.(?:translate[XY]|rotate|scale[XY]|matrix)|attr\.(?:d|opacity|fill|stroke|offsetDistance)|filter\.[A-Za-z][A-Za-z0-9-]*\.[A-Za-z][A-Za-z0-9-]*|gradient\.(?:(?:x1|y1|x2|y2)|[A-Za-z][A-Za-z0-9-]*\.(?:offset|stop-color|stop-opacity))|clip|mask)$/;

const EASING = /^(?:linear|hold|spring|cubic-bezier\([^)]+\))$/;
const NODE_ID = /^s-[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function createEditor(): EditorState {
  return {
    composition: {
      fps: 30,
      width: 640,
      height: 360,
      durationInFrames: 90,
      nodes: [],
    },
    groups: [],
    labels: {},
    texts: {},
    selection: [],
    frame: 0,
    nextId: 0,
    selectedLayerOnly: false,
  };
}

export function isNodeId(value: string): boolean {
  return NODE_ID.test(value);
}

export function cloneTrack(track: Track): Track {
  return {
    property: track.property,
    keys: track.keys.map((key) => ({
      frame: key.frame,
      value: Array.isArray(key.value) ? key.value.slice() : key.value,
      ...(key.easing !== undefined ? { easing: key.easing } : {}),
    })),
  };
}

export function sanitizeTrack(value: unknown): Track | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.property !== "string" || !PROPERTY.test(record.property)) return null;
  if (!Array.isArray(record.keys) || record.keys.length === 0) return null;
  const keys: Keyframe[] = [];
  for (const item of record.keys) {
    if (item === null || typeof item !== "object") return null;
    const key = item as Record<string, unknown>;
    if (typeof key.frame !== "number" || !Number.isInteger(key.frame) || key.frame < 0) return null;
    const stored = sanitizeValue(key.value);
    if (stored === null) return null;
    const next: Keyframe = { frame: key.frame, value: stored };
    if (key.easing !== undefined) {
      if (typeof key.easing !== "string" || !EASING.test(key.easing)) return null;
      next.easing = key.easing;
    }
    keys.push(next);
  }
  keys.sort((left, right) => left.frame - right.frame);
  return { property: record.property, keys };
}

function sanitizeValue(value: unknown): number | string | number[] | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return value.slice();
  }
  return null;
}

export function exportComposition(composition: Composition): Composition {
  const next: Composition = {
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    durationInFrames: composition.durationInFrames,
    nodes: composition.nodes.map((node) => ({
      id: node.id,
      tracks: node.tracks.map(cloneTrack),
    })),
  };
  if (typeof composition.loop === "boolean") next.loop = composition.loop;
  return next;
}

export function projectComposition(composition: Composition): Composition {
  return exportComposition(composition);
}

/** Raster exporters accept the timeline without the loop field. */
export function rasterComposition(composition: Composition): Omit<Composition, "loop"> {
  const next = exportComposition(composition);
  delete next.loop;
  return next;
}

function takeId(state: EditorState, stem: string): string {
  const used = new Set([
    ...state.composition.nodes.map((node) => node.id),
    ...state.groups.map((group) => group.id),
  ]);
  let id = stem;
  while (used.has(id) || !isNodeId(id)) {
    state.nextId += 1;
    id = `${stem}-${state.nextId}`;
  }
  state.nextId += 1;
  return id;
}

function hold(property: string, value: number | string | number[]): Track {
  return { property, keys: [{ frame: 0, value }] };
}

function shapePath(kind: ElementKind, index: number): { tracks: Track[]; label?: string } {
  const x = 48 + (index % 5) * 24;
  const y = 48 + (index % 4) * 20;
  if (kind === "ellipse") {
    return {
      tracks: [
        hold("attr.d", `M ${x + 80} ${y} A 80 48 0 1 1 ${x + 79.9} ${y} Z`),
        hold("attr.fill", "#0c5c59"),
      ],
    };
  }
  if (kind === "path") {
    return {
      tracks: [
        hold("attr.d", `M ${x} ${y + 72} L ${x + 36} ${y} L ${x + 72} ${y + 72} L ${x + 36} ${y + 48} Z`),
        hold("attr.fill", "#9c4a1a"),
      ],
    };
  }
  if (kind === "text") {
    return {
      tracks: [hold("attr.d", textPath("Text", x, y)), hold("attr.fill", "#1c1915")],
      label: "Text",
    };
  }
  return {
    tracks: [
      hold("attr.d", `M ${x} ${y} H ${x + 160} V ${y + 96} H ${x} Z`),
      hold("attr.fill", "#c4552a"),
    ],
  };
}

export function addElement(state: EditorState, kind: ElementKind): SceneNode {
  const id = takeId(state, "s-n");
  const shaped = shapePath(kind, state.composition.nodes.length);
  const node: SceneNode = { id, tracks: shaped.tracks };
  state.composition.nodes.push(node);
  if (shaped.label) state.labels[id] = shaped.label;
  if (kind === "text") state.texts[id] = "Text";
  state.selection = [id];
  return node;
}

export function nodeById(state: EditorState, id: string): SceneNode | undefined {
  return state.composition.nodes.find((node) => node.id === id);
}

export function selectNode(state: EditorState, id: string, mode: "replace" | "add" = "replace"): void {
  if (!nodeById(state, id) && !state.groups.some((group) => group.id === id)) return;
  if (mode === "add") {
    state.selection = state.selection.includes(id)
      ? state.selection.filter((item) => item !== id)
      : [...state.selection, id];
    return;
  }
  state.selection = [id];
}

function groupOf(state: EditorState, id: string): Group | undefined {
  return state.groups.find((group) => group.id === id || group.childIds.includes(id));
}

/** Paint blocks. A group stays contiguous. Later blocks paint above earlier blocks. */
export function paintBlocks(state: EditorState): string[][] {
  const member = new Map<string, Group>();
  for (const group of state.groups) {
    for (const id of group.childIds) member.set(id, group);
  }
  const blocks: string[][] = [];
  const seen = new Set<string>();
  for (const node of state.composition.nodes) {
    const group = member.get(node.id);
    if (!group) {
      blocks.push([node.id]);
      continue;
    }
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    const ids = state.composition.nodes.map((item) => item.id).filter((id) => group.childIds.includes(id));
    blocks.push(ids);
  }
  return blocks;
}

export function reorderNode(state: EditorState, id: string, direction: -1 | 1): void {
  const blocks = paintBlocks(state);
  const index = blocks.findIndex((block) => block.includes(id) || block[0] === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= blocks.length) return;
  const next = blocks.slice();
  const swap = next[target];
  next[target] = next[index] ?? [];
  next[index] = swap ?? [];
  const byId = new Map(state.composition.nodes.map((node) => [node.id, node]));
  state.composition.nodes = next.flat().flatMap((nodeId) => {
    const node = byId.get(nodeId);
    return node ? [node] : [];
  });
}

export function groupSelection(state: EditorState): Group | null {
  const selected = new Set(state.selection.filter((id) => nodeById(state, id)));
  if (selected.size < 2) return null;
  const ordered = state.composition.nodes.map((node) => node.id).filter((id) => selected.has(id));
  for (const group of state.groups) {
    group.childIds = group.childIds.filter((id) => !selected.has(id));
  }
  state.groups = state.groups.filter((group) => group.childIds.length > 1);
  const picked = ordered.flatMap((id) => {
    const node = nodeById(state, id);
    return node ? [node] : [];
  });
  const first = state.composition.nodes.findIndex((node) => node.id === ordered[0]);
  const before = state.composition.nodes.slice(0, first).filter((node) => !selected.has(node.id));
  const after = state.composition.nodes.filter((node) => !selected.has(node.id) && !before.includes(node));
  state.composition.nodes = [...before, ...picked, ...after];
  const group: Group = { id: takeId(state, "s-group"), childIds: ordered };
  state.groups.push(group);
  state.selection = [group.id];
  return group;
}

export function ungroup(state: EditorState, groupId: string): void {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;
  state.groups = state.groups.filter((item) => item.id !== groupId);
  state.selection = group.childIds.slice();
}

/** Write a motion block onto one node. The node list stays the same length. */
export function applyMotionTracks(state: EditorState, nodeId: string, tracks: Track[]): SceneNode | null {
  const node = nodeById(state, nodeId);
  if (!node) return null;
  const incoming = tracks.map(cloneTrack);
  for (const track of incoming) {
    const index = node.tracks.findIndex((item) => item.property === track.property);
    if (index >= 0) node.tracks[index] = track;
    else node.tracks.push(track);
  }
  const last = incoming.reduce((max, track) => {
    const frame = track.keys.reduce((inner, key) => Math.max(inner, key.frame), 0);
    return Math.max(max, frame);
  }, 0);
  if (last + 1 > state.composition.durationInFrames) {
    state.composition.durationInFrames = last + 1;
  }
  return node;
}

export function setKeyframe(
  state: EditorState,
  nodeId: string,
  property: string,
  frame: number,
  value: number | string | number[],
): void {
  const node = nodeById(state, nodeId);
  if (!node || !PROPERTY.test(property) || !Number.isInteger(frame) || frame < 0) return;
  const stored = sanitizeValue(value);
  if (stored === null) return;
  let track = node.tracks.find((item) => item.property === property);
  if (!track) {
    track = { property, keys: [] };
    node.tracks.push(track);
  }
  const key = track.keys.find((item) => item.frame === frame);
  if (key) key.value = stored;
  else track.keys.push({ frame, value: stored });
  track.keys.sort((left, right) => left.frame - right.frame);
  if (frame + 1 > state.composition.durationInFrames) state.composition.durationInFrames = frame + 1;
}

export function setText(state: EditorState, nodeId: string, text: string): void {
  const node = nodeById(state, nodeId);
  if (!node) return;
  state.texts[nodeId] = text;
  const current = node.tracks.find((track) => track.property === "attr.d");
  const existing = typeof current?.keys[0]?.value === "string" ? current.keys[0].value : "";
  const origin = pathOrigin(existing);
  setKeyframe(state, nodeId, "attr.d", 0, textPath(text, origin.x, origin.y));
}

export function removeKeyframe(state: EditorState, nodeId: string, property: string, frame: number): void {
  const node = nodeById(state, nodeId);
  if (!node) return;
  const track = node.tracks.find((item) => item.property === property);
  if (!track) return;
  track.keys = track.keys.filter((key) => key.frame !== frame);
  if (track.keys.length === 0) node.tracks = node.tracks.filter((item) => item !== track);
}

export function moveKeyframe(state: EditorState, nodeId: string, property: string, fromFrame: number, toFrame: number): void {
  const node = nodeById(state, nodeId);
  if (!node || !Number.isInteger(toFrame) || toFrame < 0) return;
  const track = node.tracks.find((item) => item.property === property);
  const key = track?.keys.find((item) => item.frame === fromFrame);
  if (!track || !key || fromFrame === toFrame) return;
  const value = key.value;
  const easing = key.easing;
  track.keys = track.keys.filter((item) => item.frame !== fromFrame && item.frame !== toFrame);
  const next: Keyframe = { frame: toFrame, value: Array.isArray(value) ? value.slice() : value };
  if (easing !== undefined) next.easing = easing;
  track.keys.push(next);
  track.keys.sort((left, right) => left.frame - right.frame);
  if (toFrame + 1 > state.composition.durationInFrames) state.composition.durationInFrames = toFrame + 1;
}

export function setEasing(state: EditorState, nodeId: string, property: string, frame: number, easing: string): void {
  const node = nodeById(state, nodeId);
  if (!node || !EASING.test(easing)) return;
  const key = node.tracks.find((item) => item.property === property)?.keys.find((item) => item.frame === frame);
  if (!key) return;
  key.easing = easing;
}

export function selectedNodeIds(state: EditorState): string[] {
  const ids: string[] = [];
  for (const id of state.selection) {
    const group = state.groups.find((item) => item.id === id);
    if (group) ids.push(...group.childIds);
    else if (nodeById(state, id)) ids.push(id);
  }
  return [...new Set(ids)];
}

export function timelineNodes(state: EditorState): SceneNode[] {
  if (!state.selectedLayerOnly) return state.composition.nodes;
  const ids = new Set(selectedNodeIds(state));
  return state.composition.nodes.filter((node) => ids.has(node.id));
}

export function replaceComposition(state: EditorState, composition: Composition): void {
  state.composition = {
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    durationInFrames: composition.durationInFrames,
    nodes: composition.nodes.map((node) => ({ id: node.id, tracks: node.tracks.map(cloneTrack) })),
  };
  if (typeof composition.loop === "boolean") state.composition.loop = composition.loop;
  state.groups = [];
  state.labels = {};
  state.texts = {};
  state.selection = state.composition.nodes[0] ? [state.composition.nodes[0].id] : [];
  state.frame = 0;
  state.nextId = state.composition.nodes.length;
}

export function loadComposition(value: unknown): Composition | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fps = record.fps;
  const width = record.width;
  const height = record.height;
  const durationInFrames = record.durationInFrames;
  if (
    typeof fps !== "number" ||
    !Number.isInteger(fps) ||
    fps < 1 ||
    typeof width !== "number" ||
    !Number.isInteger(width) ||
    width < 1 ||
    typeof height !== "number" ||
    !Number.isInteger(height) ||
    height < 1 ||
    typeof durationInFrames !== "number" ||
    !Number.isInteger(durationInFrames) ||
    durationInFrames < 1 ||
    !Array.isArray(record.nodes)
  ) {
    return null;
  }
  const nodes: SceneNode[] = [];
  for (const item of record.nodes) {
    if (item === null || typeof item !== "object") return null;
    const node = item as Record<string, unknown>;
    if (typeof node.id !== "string" || !isNodeId(node.id) || !Array.isArray(node.tracks)) return null;
    const tracks: Track[] = [];
    for (const track of node.tracks) {
      const clean = sanitizeTrack(track);
      if (!clean) return null;
      tracks.push(clean);
    }
    nodes.push({ id: node.id, tracks });
  }
  const composition: Composition = { fps, width, height, durationInFrames, nodes };
  if (typeof record.loop === "boolean") composition.loop = record.loop;
  return composition;
}
