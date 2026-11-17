/**
 * Simple-mode picture edits: start blank, add words, a shape, or an icon, and remove the selection.
 * Each one is a plain editor change. The caller records it as one undo step.
 */

import { createEditor, type EditorState, type SceneNode, type Track } from "./composition.ts";
import { fontScale } from "./templates.ts";

export type SimpleAddKind = "words" | "shape" | "icon";

/** Font size of added words, in composition units. */
export const ADDED_WORD_SIZE = 40;

const SHAPE_FILL = "#c4552a";
const ICON_FILL = "#0c5c59";
const DARK_INK = "#1c1915";

const LABELS: Record<SimpleAddKind, string> = {
  words: "Words",
  shape: "Shape",
  icon: "Icon",
};

function hold(property: string, value: number | string): Track {
  return { property, keys: [{ frame: 0, value }] };
}

function freshId(state: EditorState): string {
  const used = new Set([...state.composition.nodes.map((node) => node.id), ...state.groups.map((group) => group.id)]);
  let salt = state.nextId;
  let id = `s-n-${salt}`;
  while (used.has(id)) {
    salt += 1;
    id = `s-n-${salt}`;
  }
  state.nextId = salt + 1;
  return id;
}

function nextLabel(state: EditorState, kind: SimpleAddKind): string {
  const stem = LABELS[kind];
  const taken = new Set(Object.values(state.labels));
  if (!taken.has(stem)) return stem;
  let count = 2;
  while (taken.has(`${stem} ${count}`)) count += 1;
  return `${stem} ${count}`;
}

/** Ink for added words: the start's ink when a start painted some, otherwise a dark ink. */
function wordInk(state: EditorState): string {
  for (const [id, paint] of Object.entries(state.paints)) {
    if (paint !== "ink") continue;
    const node = state.composition.nodes.find((item) => item.id === id);
    const fill = node?.tracks.find((track) => track.property === "attr.fill")?.keys[0]?.value;
    if (typeof fill === "string") return fill;
  }
  return DARK_INK;
}

/** Five-point star path centered on (cx, cy), `radius` from the center to a point. */
export function starPath(cx: number, cy: number, radius: number): string {
  const inner = radius * 0.45;
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const r = index % 2 === 0 ? radius : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const x = Math.round((cx + r * Math.cos(angle)) * 100) / 100;
    const y = Math.round((cy + r * Math.sin(angle)) * 100) / 100;
    points.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
  }
  return `${points.join(" ")} Z`;
}

/**
 * Add one element near the middle of the picture and select it.
 * Each later addition steps down and to the right, so a new element does not hide the last one.
 */
export function addSimpleElement(state: EditorState, kind: SimpleAddKind): SceneNode {
  const { width, height } = state.composition;
  const step = (state.composition.nodes.length % 4) * 16;
  const cx = width / 2 + step;
  const cy = height / 2 + step;
  const id = freshId(state);
  let tracks: Track[];
  if (kind === "words") {
    const scale = fontScale(ADDED_WORD_SIZE);
    // A first guess at the line's width. The headline edit recenters on the drawn width.
    const guess = "Words".length * ADDED_WORD_SIZE * 0.56;
    tracks = [
      hold("transform.translateX", Math.round(cx - guess / 2)),
      hold("transform.translateY", Math.round(cy + ADDED_WORD_SIZE / 3)),
      hold("transform.scaleX", scale),
      hold("transform.scaleY", scale),
      hold("attr.fill", wordInk(state)),
    ];
    state.texts[id] = "Words";
    state.wordAlign[id] = "center";
  } else if (kind === "shape") {
    const w = Math.round(width * 0.25);
    const h = Math.round(height * 0.25);
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    tracks = [hold("attr.d", `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`), hold("attr.fill", SHAPE_FILL)];
  } else {
    const radius = Math.round(Math.min(width, height) * 0.12);
    tracks = [hold("attr.d", starPath(cx, cy, radius)), hold("attr.fill", ICON_FILL)];
  }
  const node: SceneNode = { id, tracks };
  state.composition.nodes.push(node);
  state.labels[id] = nextLabel(state, kind);
  state.selection = [id];
  return node;
}

/** Remove the selected elements and every editor record that names them. Returns how many went. */
export function removeSelected(state: EditorState): number {
  const gone = new Set(state.selection.filter((id) => state.composition.nodes.some((node) => node.id === id)));
  if (gone.size === 0) return 0;
  state.composition.nodes = state.composition.nodes.filter((node) => !gone.has(node.id));
  state.groups = state.groups
    .map((group) => ({ ...group, childIds: group.childIds.filter((id) => !gone.has(id)) }))
    .filter((group) => group.childIds.length > 0);
  const records = [
    state.labels,
    state.texts,
    state.origins,
    state.simpleMotions,
    state.paints,
    state.wordAlign,
    state.wordScale,
    state.marks,
    state.tightWords,
  ] as Array<Record<string, unknown>>;
  for (const record of records) {
    for (const id of gone) delete record[id];
  }
  state.selection = [];
  return gone.size;
}

/**
 * Clear the picture to a blank page with one shape, as a first visit opens.
 * Length, loop, speed, and delay stay.
 */
export function startBlank(state: EditorState, seed: (state: EditorState) => unknown): void {
  const fresh = createEditor();
  const keep = state.composition;
  fresh.composition.fps = keep.fps;
  fresh.composition.durationInFrames = keep.durationInFrames;
  if (keep.loop === true) fresh.composition.loop = true;
  fresh.motionSpeed = state.motionSpeed;
  fresh.motionDelay = state.motionDelay;
  fresh.nextId = state.nextId;
  Object.assign(state, fresh);
  seed(state);
}

/** The plain name of the selection, or empty when nothing is selected. */
export function selectionName(state: EditorState): string {
  const id = state.selection[0];
  if (!id) return "";
  const label = state.labels[id];
  if (label) return label;
  const text = state.texts[id];
  return text ? text : "the element";
}
