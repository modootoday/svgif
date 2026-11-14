/** Undo and redo. One user action is one step. A drag commits once, at the end. */

import { replaceComposition, type Composition, type EditorState } from "./composition.ts";

/** Enough to step back through a sitting, and small enough to keep in memory. */
export const HISTORY_LIMIT = 50;

export interface History {
  undo: EditorState[];
  redo: EditorState[];
}

export interface HistoryKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function createHistory(): History {
  return { undo: [], redo: [] };
}

export function cloneEditor(state: EditorState): EditorState {
  return structuredClone(state);
}

/** True when the composition and the editor records match. Selection and the playhead do not count. */
export function sameEdits(left: EditorState, right: EditorState): boolean {
  const a = structuredClone(left);
  const b = structuredClone(right);
  a.selection = [];
  b.selection = [];
  a.frame = 0;
  b.frame = 0;
  a.selectedLayerOnly = false;
  b.selectedLayerOnly = false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function canUndo(history: History): boolean {
  return history.undo.length > 0;
}

export function canRedo(history: History): boolean {
  return history.redo.length > 0;
}

export function resetHistory(history: History): void {
  history.undo.length = 0;
  history.redo.length = 0;
}

function remember(history: History, before: EditorState): void {
  history.undo.push(structuredClone(before));
  if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
  history.redo.length = 0;
}

/** Run one user action. Nothing is stored when the edit does not change the document. */
export function recordEdit(history: History, state: EditorState, apply: () => void): boolean {
  const before = structuredClone(state);
  apply();
  if (sameEdits(before, state)) return false;
  remember(history, before);
  return true;
}

/**
 * Store one edit that already happened, such as a finished drag.
 * `before` is the document from when the action started.
 */
export function commitEdit(history: History, before: EditorState, state: EditorState): boolean {
  if (sameEdits(before, state)) return false;
  remember(history, before);
  return true;
}

export function undoEdit(history: History, state: EditorState): boolean {
  const previous = history.undo.pop();
  if (!previous) return false;
  history.redo.push(structuredClone(state));
  Object.assign(state, structuredClone(previous));
  return true;
}

export function redoEdit(history: History, state: EditorState): boolean {
  const next = history.redo.pop();
  if (!next) return false;
  history.undo.push(structuredClone(state));
  Object.assign(state, structuredClone(next));
  return true;
}

/** Opening, importing, or replacing the composition starts the stacks over. */
export function resetForComposition(history: History, state: EditorState, composition: Composition): void {
  replaceComposition(state, composition);
  resetHistory(history);
}

/** Ctrl or Cmd+Z undoes. Ctrl or Cmd+Shift+Z, and Ctrl or Cmd+Y, redo. */
export function historyCommand(event: HistoryKey): "undo" | "redo" | null {
  if (event.altKey || (!event.ctrlKey && !event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y") return "redo";
  return null;
}
