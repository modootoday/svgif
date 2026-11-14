/** Studio shell. DOM and CSS only. Save and Export HTML share saveAndExportHtml. */

import { exportMp4 } from "../../../packages/svgif-export/src/mp4.ts";
import { type SvgBackend } from "../../../packages/svgif-export/src/svg.ts";
import { exportWebm } from "../../../packages/svgif-export/src/webm.ts";
import { exportWebp } from "../../../packages/svgif-export/src/webp.ts";
import { sample } from "../../../packages/svgif/src/ir/sample.ts";
import {
  addElement,
  createEditor,
  groupSelection,
  KEY_PROPERTIES,
  lengthFieldText,
  minimumDurationFrames,
  moveKeyframe,
  rasterComposition,
  setLengthSeconds,
  setLoop,
  removeKeyframe,
  reorderNode,
  replaceComposition,
  seedBlankShape,
  selectNode,
  selectedNodeIds,
  setEasing,
  setKeyframe,
  setText,
  ungroup,
  type EditorState,
  type ElementKind,
} from "./composition.ts";
import { chooseStudioFiles, readEmbeddedStudio } from "./embedded-assets.ts";
import { exportSupport } from "./export-support.ts";
import { importHtml, type Generation, type ImportedProject } from "./import-html.ts";
import { paintComposition } from "./playback.ts";
import { STUDIO_MOUNT_FLAG } from "./studio-flag.ts";
import type { PlayerHandle } from "../../../packages/svgif/src/player/index.ts";
import {
  applyMotionPreset,
  categoriesOf,
  fetchPresetDocument,
  fetchPresetIndex,
  filterPresets,
  placeComponentPreset,
  type PresetEntry,
} from "./presets.ts";
import { copySource, defaultSri, projectFromEditor, saveAndExportHtml, type SaveOptions } from "./project-file.ts";
import { fetchPagesStudioAssets, PLAYER_SOURCE, RUNTIME_VERSION } from "./runtime.ts";
import {
  capturePose,
  isCorner,
  moveBy,
  numberKeys,
  resizeCaptured,
  sampledGeometry,
  type Corner,
  type NumberKey,
  type PoseCapture,
} from "./direct.ts";
import { applySimpleMotion, loadMotions, motionByFile, timingFromChoices, type MotionDef } from "./motions.ts";
import { SHELL_MODE_KEY, resolveShell, type StudioShell } from "./shell-mode.ts";
import { svgFile } from "./svg-file.ts";
import {
  categoryOptions,
  inspectorMarkup,
  layerListMarkup,
  libraryMarkup,
  motionChoicesMarkup,
  shellMarkup,
  timelineMarkup,
} from "./shell-markup.ts";

const state: EditorState = createEditor();
let motions: MotionDef[] = [];
let generations: Generation[] = [];
let entries: PresetEntry[] = [];
let playing = false;
let playStart = 0;
let handle: PlayerHandle | null = null;
let panHeld = false;
let panLock = false;
let librarySize = 280;
let inspectorSize = 300;
let timelineSize = 168;
let view = { x: 0, y: 0, scale: 1 };
let digests = {
  runtimeSri: "sha384-0000000000000000000000000000000000000000000000000000000000000000",
  studioSri: {
    js: "sha384-0000000000000000000000000000000000000000000000000000000000000000",
    css: "sha384-0000000000000000000000000000000000000000000000000000000000000000",
  },
};
let studioSource = "";
let studioCss = "";
let playerFromPage = "";
let statusTimer = 0;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function appNode(): HTMLElement {
  const node = byId("app");
  if (!node) throw new Error("Studio shell is missing");
  return node;
}

function setStatus(message: string, tone: "ok" | "bad" = "ok"): void {
  window.clearTimeout(statusTimer);
  for (const id of ["status", "status-bar"]) {
    const status = byId(id);
    if (!status) continue;
    status.textContent = message;
    status.dataset.tone = tone;
  }
  const bar = byId("status-bar");
  if (!bar) return;
  bar.classList.remove("is-fading");
  if (tone !== "ok" || message.length === 0) return;
  void bar.offsetWidth;
  bar.classList.add("is-fading");
  statusTimer = window.setTimeout(() => {
    if (bar.dataset.tone !== "ok") return;
    bar.textContent = "";
    bar.classList.remove("is-fading");
    const inline = byId("status");
    if (inline?.dataset.tone === "ok") inline.textContent = "";
  }, 4000);
}

function updateTime(): void {
  const fps = state.composition.fps;
  const seconds = state.frame / fps;
  const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const time = byId("time");
  if (time) {
    const shell = document.getElementById("app")?.dataset.shell;
    time.textContent = shell === "simple" ? text : `${text}  f${state.frame}`;
  }
  const scrub = byId<HTMLInputElement>("scrub");
  if (scrub) {
    scrub.max = String(Math.max(0, state.composition.durationInFrames - 1));
    scrub.value = String(state.frame);
  }
  for (const id of ["play", "transport-play"]) {
    const button = byId(id);
    if (!button) continue;
    button.textContent = playing ? "Pause" : "Play";
    button.setAttribute("aria-pressed", playing ? "true" : "false");
  }
}

function paint(mode: "static" | "scrub"): void {
  const host = byId("player-host");
  if (!host) return;
  try {
    handle?.unmount();
    handle = paintComposition(host, state.composition, mode, state.frame);
  } catch (error) {
    host.textContent = error instanceof Error ? error.message : "Playback failed";
  }
}

function renderLists(): void {
  const layers = byId("layer-list");
  if (layers) layers.innerHTML = layerListMarkup(state);
  const rows = byId("timeline-rows");
  if (rows) rows.innerHTML = timelineMarkup(state);
  const body = byId("inspector-body");
  const typing = document.activeElement?.id?.startsWith("field-") === true;
  if (body && !typing) body.innerHTML = inspectorMarkup(state);
}

function renderLibrary(): void {
  const query = byId<HTMLInputElement>("preset-search")?.value ?? "";
  const category = byId<HTMLSelectElement>("preset-category")?.value ?? "";
  const select = byId<HTMLSelectElement>("preset-category");
  if (select) {
    const next = categoryOptions(categoriesOf(entries), category);
    if (select.innerHTML !== next) select.innerHTML = next;
  }
  const list = byId("library-list");
  if (list) list.innerHTML = libraryMarkup(filterPresets(entries, query, category));
}

function fit(): void {
  const stage = byId("stage");
  const fitted = byId("stage-fit");
  if (!stage || !fitted) return;
  const padX = 64;
  const padY = 80;
  const availableW = Math.max(1, stage.clientWidth - padX);
  const availableH = Math.max(1, stage.clientHeight - padY);
  view.scale = Math.max(0.05, Math.min(availableW / state.composition.width, availableH / state.composition.height));
  const drawnW = state.composition.width * view.scale;
  const drawnH = state.composition.height * view.scale;
  view.x = Math.max(0, (stage.clientWidth - drawnW) / 2);
  view.y = Math.max(0, (stage.clientHeight - drawnH) / 2);
  applyView(drawnW, drawnH);
}

function applyView(drawnW = state.composition.width * view.scale, drawnH = state.composition.height * view.scale): void {
  const fitted = byId("stage-fit");
  if (!fitted) return;
  fitted.style.width = `${Math.max(1, drawnW)}px`;
  fitted.style.height = `${Math.max(1, drawnH)}px`;
  fitted.style.transform = `translate(${view.x}px, ${view.y}px)`;
  placeDirect();
}

function syncTiming(): void {
  const input = byId<HTMLInputElement>("length-seconds");
  const toggle = byId<HTMLInputElement>("loop-switch");
  if (input) {
    const text = lengthFieldText(state.composition.durationInFrames, state.composition.fps);
    input.min = lengthFieldText(minimumDurationFrames(state), state.composition.fps);
    const typed = Number(input.value);
    const focused = document.activeElement === input;
    const same = focused && Number.isFinite(typed) && Math.round(typed * state.composition.fps) === state.composition.durationInFrames;
    if (!same) input.value = text;
  }
  if (toggle) {
    const on = state.composition.loop === true;
    toggle.checked = on;
    toggle.setAttribute("aria-checked", on ? "true" : "false");
  }
}

function refresh(repaint = true): void {
  renderLists();
  updateTime();
  syncTiming();
  if (!repaint) return;
  paint(playing ? "static" : "scrub");
  fit();
}

function closeMotionMenu(): void {
  const list = byId("motion-choices");
  const button = byId("motion-menu");
  if (list) list.hidden = true;
  button?.setAttribute("aria-expanded", "false");
}

function readTiming(): { applyFrame: number; factor: number } {
  const speed = byId<HTMLSelectElement>("motion-speed")?.value ?? "normal";
  const delay = byId<HTMLSelectElement>("motion-delay")?.value ?? "none";
  return timingFromChoices(speed, delay, state.composition.fps);
}

function writeMotion(index: number): void {
  const motion = motions[index];
  const nodeId = selectedNodeIds(state)[0];
  if (motions.length === 0) {
    setStatus("Motions did not load.", "bad");
    return;
  }
  if (!motion || !nodeId) {
    setStatus("Select a shape first.", "bad");
    return;
  }
  const applied = applySimpleMotion(state, nodeId, motion, readTiming());
  if (!applied) {
    setStatus("Select a shape first.", "bad");
    return;
  }
  playing = false;
  const menu = byId("motion-menu");
  if (menu) menu.textContent = motion.label;
  closeMotionMenu();
  setStatus("The entrance is on the shape.");
  refresh(true);
}

function retiming(): void {
  const nodeId = selectedNodeIds(state)[0];
  const file = nodeId ? state.simpleMotions[nodeId]?.file : undefined;
  const motion = file ? motionByFile(file) : undefined;
  if (!nodeId || !motion) return;
  applySimpleMotion(state, nodeId, motion, readTiming());
  playing = false;
  refresh(true);
}

function togglePlay(): void {
  playing = !playing;
  if (playing) {
    playStart = performance.now() - (state.frame / state.composition.fps) * 1000;
    paint("static");
    requestAnimationFrame(tick);
  } else {
    paint("scrub");
  }
  updateTime();
  placeDirect();
}

function tick(now: number): void {
  if (!playing) return;
  const duration = state.composition.durationInFrames;
  const frame = Math.floor(((now - playStart) / 1000) * state.composition.fps);
  if (state.composition.loop === true) {
    state.frame = duration <= 1 ? 0 : ((frame % duration) + duration) % duration;
    updateTime();
    requestAnimationFrame(tick);
    return;
  }
  const last = Math.max(0, duration - 1);
  if (frame >= last) {
    state.frame = last;
    playing = false;
    paint("scrub");
    updateTime();
    placeDirect();
    return;
  }
  state.frame = frame;
  updateTime();
  requestAnimationFrame(tick);
}

function desktop(): boolean {
  return window.innerWidth >= 1100;
}

function readRememberedShell(): string | null {
  try {
    return localStorage.getItem(SHELL_MODE_KEY);
  } catch {
    return null;
  }
}

function applyShell(shell: StudioShell): void {
  const app = appNode();
  app.dataset.shell = shell;
  byId("mode-simple")?.setAttribute("aria-pressed", shell === "simple" ? "true" : "false");
  byId("mode-advanced")?.setAttribute("aria-pressed", shell === "advanced" ? "true" : "false");
  const popover = byId("export-popover");
  if (shell === "simple" && popover) popover.hidden = true;
  updateTime();
  placeDirect();
}

function persistShell(shell: StudioShell): void {
  try {
    localStorage.setItem(SHELL_MODE_KEY, shell);
  } catch {
    // The page still switches. A blocked store leaves the next visit at the default.
  }
  const url = new URL(location.href);
  if (!url.searchParams.has("mode")) return;
  url.searchParams.delete("mode");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function applyChrome(): void {
  const app = appNode();
  if (!desktop()) {
    app.style.removeProperty("--library");
    app.style.removeProperty("--inspector");
    app.style.removeProperty("--timeline");
    syncRail();
    return;
  }
  const libraryCollapsed = app.classList.contains("is-library-collapsed");
  const inspectorCollapsed = app.classList.contains("is-inspector-collapsed");
  const timelineCollapsed = app.classList.contains("is-timeline-collapsed");
  app.style.setProperty("--library", libraryCollapsed ? "0px" : `${librarySize}px`);
  app.style.setProperty("--inspector", inspectorCollapsed ? "0px" : `${inspectorSize}px`);
  app.style.setProperty("--library-sash", libraryCollapsed ? "0px" : "6px");
  app.style.setProperty("--inspector-sash", inspectorCollapsed ? "0px" : "6px");
  const maxTimeline = Math.min(360, window.innerHeight * 0.4);
  timelineSize = Math.min(maxTimeline, Math.max(120, timelineSize));
  app.style.setProperty("--timeline", timelineCollapsed ? "48px" : `${timelineSize}px`);
  syncRail();
}

function saveOptions(): SaveOptions {
  return {
    embedPlayer: byId<HTMLInputElement>("embed-player")?.checked === true,
    embedStudio: byId<HTMLInputElement>("embed-studio")?.checked === true,
    savedAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    runtimeSri: digests.runtimeSri,
    studioSri: digests.studioSri,
    playerSource: playerFromPage || PLAYER_SOURCE,
    studioSource,
    studioCss,
  };
}

async function ensureStudioFiles(): Promise<void> {
  const embedded = readEmbeddedStudio(document);
  let fetchedSource = "";
  let fetchedCss = "";
  let pagesSri: { js: string; css: string } | null = null;
  try {
    const pages = await fetchPagesStudioAssets(location.href);
    fetchedSource = pages.jsText;
    fetchedCss = pages.cssText;
    pagesSri = pages.studioSri;
  } catch {
    fetchedSource = "";
    fetchedCss = "";
    pagesSri = null;
  }
  const chosen = chooseStudioFiles(embedded, {
    studioSource: fetchedSource || studioSource,
    studioCss: fetchedCss || studioCss,
    playerSource: PLAYER_SOURCE,
  });
  if (chosen.studioSource.length > 0) studioSource = chosen.studioSource;
  if (chosen.studioCss.length > 0) studioCss = chosen.studioCss;
  if (chosen.playerSource.length > 0) playerFromPage = chosen.playerSource;
  if (!pagesSri) return;
  const player = await defaultSri(playerFromPage || PLAYER_SOURCE, fetchedSource, fetchedCss);
  digests = { runtimeSri: player.runtimeSri, studioSri: pagesSri };
}

function writeProject(): ReturnType<typeof projectFromEditor> {
  const options = saveOptions();
  const project = projectFromEditor(state, generations, options);
  generations = project.provenance.generations as Generation[];
  return project;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveAndExport(): Promise<void> {
  try {
    await ensureStudioFiles();
    const options = saveOptions();
    if (options.embedStudio && (options.studioSource?.length === 0 || options.studioCss?.length === 0)) {
      setStatus("Studio source is not loaded.", "bad");
      return;
    }
    if (options.embedPlayer && (options.playerSource?.length ?? 0) === 0) {
      setStatus("Player source is not loaded.", "bad");
      return;
    }
    const project = writeProject();
    download(saveAndExportHtml(project, options), "project.html");
    setStatus("Saved HTML. Export HTML writes the same bytes.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Export failed", "bad");
  }
}

function openProject(markup: string): boolean {
  const result = importHtml(markup, RUNTIME_VERSION);
  const migrate = byId("migrate");
  if (!result.ok) {
    setStatus(result.code === "schema-too-new" ? "schema-too-new" : result.message, "bad");
    if (migrate) migrate.hidden = true;
    return false;
  }
  replaceComposition(state, result.project.composition);
  generations = result.project.provenance.generations.map((item) => ({ ...item }));
  if (migrate) migrate.hidden = !result.migrate;
  setStatus(result.migrate ? "Older pin. Migrate, then Save to write the new pin." : "Opened the composition.");
  playing = false;
  refresh(true);
  return true;
}

function bind(): void {
  const app = appNode();
  byId("play")?.addEventListener("click", togglePlay);
  byId("transport-play")?.addEventListener("click", togglePlay);
  byId("save-html")?.addEventListener("click", saveAndExport);
  byId("export-html")?.addEventListener("click", saveAndExport);
  byId("export-menu")?.addEventListener("click", () => {
    if (app.dataset.shell === "simple") return;
    const popover = byId("export-popover");
    if (!popover) return;
    popover.hidden = !popover.hidden;
  });
  for (const choice of ["simple", "advanced"] as const) {
    byId(choice === "simple" ? "mode-simple" : "mode-advanced")?.addEventListener("click", () => {
      if (app.dataset.shell === choice) return;
      applyShell(choice);
      persistShell(choice);
      fit();
    });
  }
  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
  };
  byId("theme")?.addEventListener("click", toggleTheme);
  byId("theme-popover")?.addEventListener("click", toggleTheme);
  byId("export-svg")?.addEventListener("click", () => {
    try {
      const backend = (byId<HTMLSelectElement>("svg-backend")?.value ?? "css-embedded") as SvgBackend;
      const blob = svgFile(state.composition, backend);
      download(blob, backend === "css-external" ? "composition.zip" : "composition.svg");
      setStatus(backend === "css-external" ? "SVG zip is ready." : "SVG is ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed", "bad");
    }
  });
  byId("export-webp")?.addEventListener("click", () => {
    try {
      download(exportWebp(rasterComposition(state.composition)), "composition.webp");
      setStatus("WebP is ready. Nothing was uploaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed", "bad");
    }
  });
  byId("export-webm")?.addEventListener("click", () => {
    try {
      download(exportWebm(rasterComposition(state.composition)), "composition.webm");
      setStatus("WebM is ready. Nothing was uploaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed", "bad");
    }
  });
  byId("export-mp4")?.addEventListener("click", () => {
    try {
      download(exportMp4(rasterComposition(state.composition)), "composition.mp4");
      setStatus("MP4 is ready. Nothing was uploaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed", "bad");
    }
  });
  byId("copy-source")?.addEventListener("click", async () => {
    try {
      await ensureStudioFiles();
      const options = saveOptions();
      if (options.embedStudio && (options.studioSource?.length === 0 || options.studioCss?.length === 0)) {
        setStatus("Studio source is not loaded.", "bad");
        return;
      }
      const project = projectFromEditor(state, generations, options);
      const fragment = copySource(project, options);
      await navigator.clipboard.writeText(fragment);
      setStatus(options.embedStudio ? "Copied source with Studio." : "Copied source.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Copy failed", "bad");
    }
  });
  byId("migrate")?.addEventListener("click", () => {
    setStatus("Migration is ready. Save to write the new pin. The open file is unchanged until then.");
  });
  byId("open-file-button")?.addEventListener("click", () => {
    const dialog = byId<HTMLDialogElement>("open-dialog");
    if (!dialog) return;
    dialog.returnValue = "";
    dialog.showModal();
  });
  byId("choose-html")?.addEventListener("click", () => byId<HTMLInputElement>("open-file")?.click());
  byId("open-file")?.addEventListener("change", async () => {
    const input = byId<HTMLInputElement>("open-file");
    const file = input?.files?.[0];
    if (!input || !file) return;
    const markup = await file.text();
    input.value = "";
    if (!openProject(markup)) return;
    const dialog = byId<HTMLDialogElement>("open-dialog");
    if (dialog?.open) dialog.close("file");
  });
  byId("open-dialog")?.addEventListener("close", () => {
    const dialog = byId<HTMLDialogElement>("open-dialog");
    if (dialog?.returnValue !== "ok") return;
    openProject(byId<HTMLTextAreaElement>("open-html")?.value ?? "");
  });
  for (const kind of ["rectangle", "ellipse", "path", "text"] as ElementKind[]) {
    byId(`add-${kind}`)?.addEventListener("click", () => {
      addElement(state, kind);
      refresh(true);
    });
  }
  byId("group-selection")?.addEventListener("click", () => {
    const group = groupSelection(state);
    setStatus(group ? "Grouped the selected layers." : "Select two layers to group.");
    refresh(true);
  });
  byId("ungroup-selection")?.addEventListener("click", () => {
    const id = state.selection.find((item) => state.groups.some((group) => group.id === item));
    if (id) ungroup(state, id);
    refresh(true);
  });
  byId("selected-layer-only")?.addEventListener("change", () => {
    state.selectedLayerOnly = byId<HTMLInputElement>("selected-layer-only")?.checked === true;
    renderLists();
  });
  byId("length-seconds")?.addEventListener("change", () => {
    const seconds = Number(byId<HTMLInputElement>("length-seconds")?.value);
    if (!Number.isFinite(seconds)) {
      syncTiming();
      return;
    }
    setLengthSeconds(state, seconds);
    playing = false;
    refresh(true);
  });
  byId("loop-switch")?.addEventListener("change", () => {
    setLoop(state, byId<HTMLInputElement>("loop-switch")?.checked === true);
    playing = false;
    refresh(true);
  });
  byId("scrub")?.addEventListener("input", () => {
    playing = false;
    state.frame = Number(byId<HTMLInputElement>("scrub")?.value ?? 0);
    paint("scrub");
    updateTime();
  });
  byId("layer-list")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const z = target.closest("[data-z]")?.getAttribute("data-z");
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (z && nodeId) {
      reorderNode(state, nodeId, Number(z) > 0 ? 1 : -1);
      refresh(true);
      return;
    }
    const ungroupId = target.closest("[data-ungroup]")?.getAttribute("data-ungroup");
    if (ungroupId) {
      ungroup(state, ungroupId);
      refresh(true);
      return;
    }
    const select = target.closest("[data-select]")?.getAttribute("data-select");
    if (select) {
      selectNode(state, select, event.shiftKey ? "add" : "replace");
      refresh(false);
      paint("scrub");
    }
  });
  byId("timeline-rows")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const remove = target.closest("[data-remove-key]");
    if (remove instanceof HTMLElement) {
      const nodeId = remove.dataset.nodeId ?? "";
      const property = remove.dataset.property ?? "";
      removeKeyframe(state, nodeId, property, Number(remove.dataset.frame));
      refresh(true);
      return;
    }
    const key = target.closest("[data-key-frame]");
    if (key instanceof HTMLElement) {
      const nodeId = key.dataset.nodeId ?? "";
      selectNode(state, nodeId);
      playing = false;
      state.frame = Number(key.dataset.keyFrame ?? 0);
      refresh(true);
      return;
    }
    const add = target.closest("[data-add-key]");
    if (add instanceof HTMLElement) {
      const nodeId = add.getAttribute("data-add-key") ?? "";
      const property = add.parentElement?.querySelector("select")?.value ?? KEY_PROPERTIES[0];
      setKeyframe(state, nodeId, property, state.frame, keyValue(nodeId, property));
      refresh(true);
      return;
    }
    const id = target.closest("[data-select]")?.getAttribute("data-select");
    if (!id) return;
    selectNode(state, id, event.shiftKey ? "add" : "replace");
    refresh(false);
  });
  byId("timeline-rows")?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
    const edit = input.dataset.edit;
    const nodeId = input.dataset.nodeId ?? "";
    const property = input.dataset.property ?? "";
    const from = Number(input.dataset.from);
    if (!edit || !nodeId || !property) return;
    if (edit === "frame") {
      const to = Number(input.value);
      if (!Number.isInteger(to)) return;
      moveKeyframe(state, nodeId, property, from, to);
    } else if (edit === "value") {
      const node = state.composition.nodes.find((item) => item.id === nodeId);
      const current = node?.tracks.find((track) => track.property === property)?.keys.find((key) => key.frame === from);
      const numeric = typeof current?.value === "number";
      const color = property === "attr.fill";
      if (!numeric && !color) {
        setStatus("That value stays on the path. The number field is off for this track.", "bad");
        return;
      }
      const value = numeric ? Number(input.value) : input.value;
      if (numeric && !Number.isFinite(value)) return;
      setKeyframe(state, nodeId, property, from, value);
    } else if (edit === "easing") {
      setEasing(state, nodeId, property, from, input.value);
    }
    refresh(true);
  });
  byId("inspector-body")?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const field = input.dataset.field;
    const nodeId = selectedNodeIds(state)[0];
    if (field === "fps" || field === "width" || field === "height" || field === "duration") {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < 1) return;
      if (field === "fps") state.composition.fps = value;
      if (field === "width") state.composition.width = value;
      if (field === "height") state.composition.height = value;
      if (field === "duration") state.composition.durationInFrames = value;
      if (state.frame >= state.composition.durationInFrames) state.frame = state.composition.durationInFrames - 1;
      refresh(true);
      return;
    }
    if (!nodeId) return;
    if (field === "label") state.labels[nodeId] = input.value;
    if (field === "text") setText(state, nodeId, input.value);
    if (field === "fill") setKeyframe(state, nodeId, "attr.fill", 0, input.value);
    if (field === "x" || field === "y" || field === "rotate") {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      const property = field === "x" ? "transform.translateX" : field === "y" ? "transform.translateY" : "transform.rotate";
      setKeyframe(state, nodeId, property, state.frame, value);
    }
    renderLists();
    paint(playing ? "static" : "scrub");
  });
  byId("library-list")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const place = target.closest("[data-place]")?.getAttribute("data-place");
    const motion = target.closest("[data-motion]")?.getAttribute("data-motion");
    const file = place ?? motion;
    if (!file) return;
    const entry = entries.find((item) => item.file === file);
    if (!entry) return;
    void fetchPresetDocument(entry)
      .then((preset) => {
        if (place) {
          const nodes = placeComponentPreset(state, preset);
          setStatus(nodes.length > 0 ? "Placed the component on the artboard." : "That preset did not place a node.");
        } else {
          const nodeId = selectedNodeIds(state)[0];
          if (!nodeId) {
            setStatus("Select a layer before applying motion.", "bad");
            return;
          }
          const applied = applyMotionPreset(state, preset, nodeId);
          setStatus(applied ? "Motion was written onto the selected node." : "This preset has no motion block.", applied ? "ok" : "bad");
        }
        refresh(true);
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Preset request failed", "bad");
      });
  });
  byId("preset-search")?.addEventListener("input", renderLibrary);
  byId("preset-category")?.addEventListener("change", renderLibrary);
  byId("motion-menu")?.addEventListener("click", () => {
    const list = byId("motion-choices");
    const button = byId("motion-menu");
    if (!list || !button) return;
    const open = list.hidden;
    list.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  byId("motion-choices")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const choice = target.closest("[data-motion-index]");
    if (!(choice instanceof HTMLElement)) return;
    const index = Number(choice.dataset.motionIndex);
    if (!Number.isInteger(index)) return;
    writeMotion(index);
  });
  byId("motion-speed")?.addEventListener("change", retiming);
  byId("motion-delay")?.addEventListener("change", retiming);
  for (const button of document.querySelectorAll<HTMLButtonElement>(".phone-tabs button")) {
    button.addEventListener("click", () => {
      app.dataset.mode = button.dataset.mode ?? "preview";
      for (const item of document.querySelectorAll<HTMLButtonElement>(".phone-tabs button")) {
        item.setAttribute("aria-selected", item === button ? "true" : "false");
      }
      fit();
    });
  }
  byId("rail-library")?.addEventListener("click", () => togglePanel("library"));
  byId("rail-inspector")?.addEventListener("click", () => togglePanel("inspector"));
  byId("collapse-library")?.addEventListener("click", () => collapsePanel("library"));
  byId("collapse-inspector")?.addEventListener("click", () => collapsePanel("inspector"));
  byId("collapse-timeline")?.addEventListener("click", () => {
    app.classList.toggle("is-timeline-collapsed");
    const button = byId("collapse-timeline");
    if (button) button.textContent = app.classList.contains("is-timeline-collapsed") ? "Expand" : "Collapse";
    applyChrome();
    fit();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>(".sheet-handle")) {
    button.addEventListener("click", () => {
      const order = ["40", "70", "90"];
      const current = app.dataset.sheet ?? "40";
      const next = order[(order.indexOf(current) + 1) % order.length] ?? "40";
      app.dataset.sheet = next;
      for (const item of document.querySelectorAll<HTMLButtonElement>(".sheet-handle")) item.textContent = `Sheet ${next}`;
    });
  }
  byId("zoom-in")?.addEventListener("click", () => zoom(1.1));
  byId("zoom-out")?.addEventListener("click", () => zoom(1 / 1.1));
  byId("zoom-fit")?.addEventListener("click", fit);
  byId("pan-tool")?.addEventListener("click", () => {
    panLock = !panLock;
    byId("pan-tool")?.setAttribute("aria-pressed", panLock ? "true" : "false");
  });
  bindStage();
  bindSash("sash-library", "library");
  bindSash("sash-inspector", "inspector");
  bindSash("sash-timeline", "timeline");
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", (event) => {
    if (event.key === "h" || event.key === "H") {
      panHeld = false;
      if (!panLock) byId("pan-tool")?.setAttribute("aria-pressed", "false");
    }
  });
  window.addEventListener("resize", () => {
    applyChrome();
    fit();
  });
  const stage = byId("stage");
  if (stage && typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => fit());
    observer.observe(stage);
  }
}

function syncRail(): void {
  const app = appNode();
  if (desktop()) {
    byId("rail-library")?.setAttribute("aria-pressed", String(!app.classList.contains("is-library-collapsed")));
    byId("rail-inspector")?.setAttribute("aria-pressed", String(!app.classList.contains("is-inspector-collapsed")));
    return;
  }
  byId("rail-library")?.setAttribute("aria-pressed", String(app.dataset.drawer === "library"));
  byId("rail-inspector")?.setAttribute("aria-pressed", String(app.dataset.drawer === "inspector"));
}

function togglePanel(name: "library" | "inspector"): void {
  const app = appNode();
  if (desktop()) {
    app.classList.toggle(name === "library" ? "is-library-collapsed" : "is-inspector-collapsed");
    applyChrome();
    fit();
    return;
  }
  setDrawer(name);
}

function setDrawer(name: "library" | "inspector"): void {
  const app = appNode();
  app.dataset.drawer = app.dataset.drawer === name ? "" : name;
  syncRail();
}

function collapsePanel(name: "library" | "inspector"): void {
  const app = appNode();
  if (window.innerWidth < 1100) {
    if (app.dataset.drawer === name) app.dataset.drawer = "";
    byId("rail-library")?.setAttribute("aria-pressed", "false");
    byId("rail-inspector")?.setAttribute("aria-pressed", "false");
    return;
  }
  app.classList.toggle(name === "library" ? "is-library-collapsed" : "is-inspector-collapsed");
  applyChrome();
  fit();
}

function zoom(factor: number): void {
  view.scale = Math.min(8, Math.max(0.05, view.scale * factor));
  applyView();
}

function onKey(event: KeyboardEvent): void {
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
  if (typing) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  }
  if ((event.key === "h" || event.key === "H") && !event.repeat) {
    panHeld = true;
    byId("pan-tool")?.setAttribute("aria-pressed", "true");
  }
}

function sampledNumber(nodeId: string, property: string): number | undefined {
  const sampled = sample(rasterComposition(state.composition), state.frame);
  const value = sampled[nodeId]?.[property];
  return typeof value === "number" ? value : undefined;
}

function keyValue(nodeId: string, property: string): number | string {
  const sampled = sample(rasterComposition(state.composition), state.frame);
  const current = sampled[nodeId]?.[property];
  if (typeof current === "number" || typeof current === "string") return current;
  if (property === "attr.fill") return "#1c1915";
  if (property === "attr.opacity" || property.startsWith("transform.scale")) return 1;
  return 0;
}

function nodeFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const host = byId("player-host");
  let el: Element | null = target;
  while (el && el !== host) {
    if (el.id && state.composition.nodes.some((node) => node.id === el?.id)) return el.id;
    el = el.parentElement;
  }
  return null;
}

function drawnBox(nodeId: string): { left: number; top: number; width: number; height: number } | null {
  const drawn = document.getElementById(nodeId);
  if (!(drawn instanceof Element)) return null;
  const shape = drawn.getBoundingClientRect();
  if (shape.width <= 0 || shape.height <= 0) return null;
  const sampled = sampledGeometry(state, nodeId, state.frame);
  if (sampled && "getBBox" in drawn) {
    const local = (drawn as SVGGraphicsElement).getBBox();
    const differs =
      local.width > 0 &&
      local.height > 0 &&
      (Math.abs(sampled.x - local.x) > 0.5 ||
        Math.abs(sampled.y - local.y) > 0.5 ||
        Math.abs(sampled.width - local.width) > 0.5 ||
        Math.abs(sampled.height - local.height) > 0.5);
    if (differs) {
      return {
        left: shape.left + ((sampled.x - local.x) / local.width) * shape.width,
        top: shape.top + ((sampled.y - local.y) / local.height) * shape.height,
        width: (sampled.width / local.width) * shape.width,
        height: (sampled.height / local.height) * shape.height,
      };
    }
  }
  return { left: shape.left, top: shape.top, width: shape.width, height: shape.height };
}

function placeDirect(): void {
  const overlay = byId("direct");
  const box = byId("direct-box");
  const stage = byId("stage");
  if (!overlay || !box || !stage) return;
  const shell = document.getElementById("app")?.dataset.shell;
  const nodeId = selectedNodeIds(state)[0];
  const shape = shell === "simple" && nodeId && !playing ? drawnBox(nodeId) : null;
  if (!shape || shape.width <= 0 || shape.height <= 0) {
    overlay.hidden = true;
    return;
  }
  const stageBox = stage.getBoundingClientRect();
  overlay.hidden = false;
  box.style.left = `${shape.left - stageBox.left}px`;
  box.style.top = `${shape.top - stageBox.top}px`;
  box.style.width = `${shape.width}px`;
  box.style.height = `${shape.height}px`;
  for (const handle of overlay.querySelectorAll<HTMLElement>("[data-handle]")) {
    const corner = handle.dataset.handle ?? "";
    const east = corner === "ne" || corner === "se";
    const south = corner === "sw" || corner === "se";
    const x = east ? shape.left + shape.width : shape.left;
    const y = south ? shape.top + shape.height : shape.top;
    handle.style.left = `${x - stageBox.left - 22}px`;
    handle.style.top = `${y - stageBox.top - 22}px`;
  }
}

type DirectDrag =
  | {
      kind: "move";
      pointer: number;
      x: number;
      y: number;
      node: string;
      originX: NumberKey[] | null;
      originY: NumberKey[] | null;
    }
  | {
      kind: "resize";
      pointer: number;
      x: number;
      y: number;
      node: string;
      corner: Corner;
      pose: PoseCapture;
    };

function beginSimpleGesture(
  stage: HTMLElement,
  event: PointerEvent,
  pointers: Map<number, { x: number; y: number }>,
  setDirect: (next: DirectDrag | null) => void,
): void {
  stage.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const panning = panHeld || panLock || event.button === 1 || pointers.size > 1;
  if (panning || event.button !== 0) {
    setDirect(null);
    return;
  }
  const handle = event.target instanceof Element ? event.target.closest("[data-handle]") : null;
  if (handle instanceof HTMLElement) {
    const corner = handle.dataset.handle;
    const nodeId = selectedNodeIds(state)[0];
    const pose = nodeId ? capturePose(state, nodeId, state.frame) : null;
    if (nodeId && pose && isCorner(corner)) {
      setDirect({
        kind: "resize",
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        node: nodeId,
        corner,
        pose,
      });
      event.preventDefault();
    }
    return;
  }
  const fromShape = nodeFromTarget(event.target);
  const fromBody =
    event.target instanceof Element && event.target.closest("[data-direct='move']") ? selectedNodeIds(state)[0] : undefined;
  const nodeId = fromShape ?? fromBody;
  if (!nodeId) {
    state.selection = [];
    setDirect(null);
    placeDirect();
    return;
  }
  selectNode(state, nodeId);
  const node = state.composition.nodes.find((item) => item.id === nodeId);
  setDirect({
    kind: "move",
    pointer: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    node: nodeId,
    originX: node ? numberKeys(node, "transform.translateX") : null,
    originY: node ? numberKeys(node, "transform.translateY") : null,
  });
  placeDirect();
  event.preventDefault();
}

function applySimpleGesture(direct: DirectDrag, event: PointerEvent): void {
  if (Math.hypot(event.clientX - direct.x, event.clientY - direct.y) < 1) return;
  const scale = Math.max(view.scale, 0.0001);
  const dx = (event.clientX - direct.x) / scale;
  const dy = (event.clientY - direct.y) / scale;
  if (direct.kind === "move") {
    moveBy(state, direct.node, direct.originX, direct.originY, dx, dy);
  } else {
    resizeCaptured(state, direct.node, direct.pose, direct.corner, dx, dy);
  }
  paint("scrub");
  placeDirect();
}

function bindStage(): void {
  const stage = byId("stage");
  if (!stage) return;
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; node: string; originX: number; originY: number } | null = null;
  let direct: DirectDrag | null = null;
  stage.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".zoom-bar, .hint")) return;
      if (appNode().dataset.shell === "simple") {
        beginSimpleGesture(stage, event, pointers, (next) => {
          direct = next;
        });
        return;
      }
      direct = null;
      stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const panning = panHeld || panLock || event.button === 1 || pointers.size > 1;
      if (!panning && event.button === 0) {
        const host = byId("player-host");
        const hit = event.target instanceof Element ? event.target.closest("[id^='s-']") : null;
        let nodeId = selectedNodeIds(state)[0];
        if (hit instanceof Element && host?.contains(hit) && state.composition.nodes.some((node) => node.id === hit.id)) {
          nodeId = hit.id;
          selectNode(state, nodeId);
        }
        if (!nodeId) return;
        drag = {
          x: event.clientX,
          y: event.clientY,
          node: nodeId,
          originX: sampledNumber(nodeId, "transform.translateX") ?? 0,
          originY: sampledNumber(nodeId, "transform.translateY") ?? 0,
        };
      }
    },
    { passive: false },
  );
  stage.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    const deltaX = previous ? event.clientX - previous.x : 0;
    const deltaY = previous ? event.clientY - previous.y : 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      direct = null;
      drag = null;
      view.x += deltaX;
      view.y += deltaY;
      applyView();
      return;
    }
    if (panHeld || panLock || event.buttons === 4) {
      direct = null;
      drag = null;
      view.x += deltaX;
      view.y += deltaY;
      applyView();
      return;
    }
    if (direct && direct.pointer === event.pointerId) {
      applySimpleGesture(direct, event);
      return;
    }
    if (!drag) return;
    const dx = (event.clientX - drag.x) / view.scale;
    const dy = (event.clientY - drag.y) / view.scale;
    setKeyframe(state, drag.node, "transform.translateX", state.frame, Math.round(drag.originX + dx));
    setKeyframe(state, drag.node, "transform.translateY", state.frame, Math.round(drag.originY + dy));
    paint("scrub");
  });
  const end = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (direct?.pointer === event.pointerId) direct = null;
    drag = null;
    renderLists();
    placeDirect();
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
}

function bindSash(id: string, kind: "library" | "inspector" | "timeline"): void {
  const sash = byId(id);
  if (!sash) return;
  sash.addEventListener("pointerdown", (event) => {
    if (!desktop()) return;
    const start = kind === "timeline" ? event.clientY : event.clientX;
    const initial = kind === "library" ? librarySize : kind === "inspector" ? inspectorSize : timelineSize;
    const move = (next: PointerEvent) => {
      const delta = (kind === "timeline" ? start - next.clientY : next.clientX - start) * (kind === "inspector" ? -1 : 1);
      if (kind === "library") librarySize = Math.min(400, Math.max(240, initial + delta));
      if (kind === "inspector") inspectorSize = Math.min(400, Math.max(260, initial + delta));
      if (kind === "timeline") timelineSize = initial + delta;
      applyChrome();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      fit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

async function loadDigests(): Promise<void> {
  try {
    await ensureStudioFiles();
  } catch {
    digests = await defaultSri(PLAYER_SOURCE, studioSource, studioCss);
  }
}

function retirePlayer(): void {
  document.documentElement.dataset.svgifStudio = STUDIO_MOUNT_FLAG;
  document.getElementById("svgif-preview")?.remove();
  document.getElementById("svgif-edit")?.remove();
  for (const node of document.querySelectorAll("svg, [data-svgif-player]")) {
    if (node.closest("#studio-root")) continue;
    node.remove();
  }
}

function boot(): void {
  retirePlayer();
  let root = document.querySelector("#studio-root");
  const embedded = !(root instanceof HTMLElement) && document.getElementById("svgif-project") !== null;
  const embeddedMarkup = embedded ? document.documentElement.outerHTML : "";
  if (embedded) {
    root = document.createElement("div");
    root.id = "studio-root";
    document.body.append(root);
  }
  if (!(root instanceof HTMLElement)) return;
  root.innerHTML = shellMarkup(exportSupport());
  applyShell(resolveShell(location.search, readRememberedShell()));
  bind();
  applyChrome();
  if (embeddedMarkup) openProject(embeddedMarkup);
  else {
    seedBlankShape(state);
    refresh(true);
  }
  void fetchPresetIndex()
    .then((index) => {
      entries = index;
      renderLibrary();
    })
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Preset index request failed", "bad");
    });
  void loadMotions(location.href)
    .then((list) => {
      motions = list;
      const host = byId("motion-choices");
      if (host) host.innerHTML = motionChoicesMarkup(list);
    })
    .catch(() => {
      setStatus("Motions did not load.", "bad");
    });
  void loadDigests();
}

boot();

export type { ImportedProject };
