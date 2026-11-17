/** Shell markup. Simple mode is the default entry. Advanced keeps the artboard. There is no GIF control. */

import type { EditorState, SceneNode } from "./composition.ts";
import { KEY_PROPERTIES, timelineNodes } from "./composition.ts";
import type { ExportDecision } from "./export-support.ts";
import { DELAY_CHOICES, SPEED_CHOICES, type MotionDef } from "./motions.ts";
import type { PresetEntry } from "./presets.ts";
import type { TemplateColor, TemplateDef } from "./templates.ts";
import { resolvedInk, TIGHT_WORD_HINT } from "./templates.ts";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function choiceOptions(choices: ReadonlyArray<{ id: string; label: string }>, selected: string): string {
  return choices
    .map((choice) => {
      const current = choice.id === selected ? " selected" : "";
      return `<option value="${esc(choice.id)}"${current}>${esc(choice.label)}</option>`;
    })
    .join("");
}

/** Blank is the first start. It is always offered and needs no file. */
export const BLANK_START = "Blank";

export function templateChoicesMarkup(templates: TemplateDef[], selectedFile: string, thumbs: readonly string[] = []): string {
  const blankPressed = selectedFile === "" ? "true" : "false";
  const blank = `<button type="button" class="start-choice" data-start-blank="true" aria-pressed="${blankPressed}"><span class="start-thumb start-thumb-blank" aria-hidden="true"></span><span class="start-name">${BLANK_START}</span></button>`;
  const named = templates
    .map((template, index) => {
      const pressed = template.file === selectedFile ? "true" : "false";
      const thumb = thumbs[index] ?? "";
      return `<button type="button" class="start-choice" data-start-index="${index}" aria-pressed="${pressed}"><span class="start-thumb" aria-hidden="true">${thumb}</span><span class="start-name">${esc(template.label)}</span></button>`;
    })
    .join("");
  return blank + named;
}

export function colorChoicesMarkup(colors: TemplateColor[], selected: number): string {
  return colors
    .map((color, index) => {
      const pressed = index === selected ? "true" : "false";
      const ink = resolvedInk(color);
      return `<button type="button" class="color-choice" data-color-index="${index}" aria-pressed="${pressed}" style="--swatch:${esc(color.backdrop)};--swatch-ink:${esc(ink)}">${esc(color.label)}</button>`;
    })
    .join("");
}

export function motionChoicesMarkup(motions: MotionDef[], current = ""): string {
  return motions
    .map((motion, index) => {
      const checked = motion.file === current ? "true" : "false";
      return `<button type="button" class="motion-choice" role="menuitemradio" aria-checked="${checked}" data-motion-index="${index}">${esc(motion.label)}</button>`;
    })
    .join("");
}

function motionBlock(): string {
  return `<section class="simple-block" id="motion-block">
    <h3>Motion</h3>
    <p class="simple-placeholder" id="motion-note">Tap something on the picture first.</p>
    <button type="button" id="motion-menu" aria-expanded="false" aria-controls="motion-choices">Choose a motion</button>
    <div id="motion-choices" role="menu" hidden></div>
    <label class="motion-field">Speed
      <select id="motion-speed" aria-label="Speed">${choiceOptions(SPEED_CHOICES, "normal")}</select>
    </label>
    <label class="motion-field">Delay
      <select id="motion-delay" aria-label="Delay">${choiceOptions(DELAY_CHOICES, "none")}</select>
    </label>
  </section>`;
}

function lengthBlock(): string {
  return `<section class="simple-block" id="length-block">
    <h3>Length</h3>
    <label class="motion-field">Seconds
      <input id="length-seconds" type="number" inputmode="decimal" min="0.1" step="any" value="3" aria-label="Length in seconds">
    </label>
    <label class="loop-switch">
      <input id="loop-switch" type="checkbox" role="switch" aria-checked="false" aria-describedby="loop-note">
      <span class="loop-rail" aria-hidden="true"><span class="loop-thumb"></span></span>
      <span>Loop</span>
    </label>
    <p id="loop-note" class="simple-placeholder">Loop applies to SVG and HTML only.</p>
  </section>`;
}

function downloadBlock(): string {
  return `<section class="simple-block simple-foot" id="download-block">
    <h3>Download</h3>
    <div class="download-row">
      <button type="button" id="download-image">Download image</button>
      <button type="button" id="download-video" aria-live="polite">Download video</button>
    </div>
    <p id="download-note" class="simple-placeholder" hidden></p>
  </section>`;
}

function wordsBlock(): string {
  return `<section class="simple-block" id="words-block">
    <h3>Words and color</h3>
    <label class="motion-field">Headline
      <input id="headline" type="text" autocomplete="off" aria-label="Headline" value="" placeholder="Tap words on the picture">
    </label>
    <p id="headline-hint" class="simple-placeholder" hidden>${esc(TIGHT_WORD_HINT)}</p>
    <div id="color-choices"></div>
  </section>`;
}

function startBlock(): string {
  return `<section class="simple-block" id="start-block">
    <h3>Start</h3>
    <div id="template-choices"></div>
  </section>`;
}

function undoBlock(): string {
  return `<div class="simple-head" id="undo-block">
    <h2>Simple</h2>
    <div class="undo-row" role="group" aria-label="Undo">
      <button type="button" id="undo" disabled aria-disabled="true">Undo</button>
      <button type="button" id="redo" disabled aria-disabled="true">Redo</button>
    </div>
  </div>`;
}

function pictureBlock(): string {
  return `<section class="simple-block" id="picture-block">
    <h3>Picture</h3>
    <p class="simple-placeholder" id="selection-name" aria-live="polite">Nothing is selected. Tap something on the picture.</p>
    <div class="add-row">
      <button type="button" id="add-words" data-simple-add="words">Add words</button>
      <button type="button" id="add-shape" data-simple-add="shape">Add shape</button>
      <button type="button" id="add-icon" data-simple-add="icon">Add icon</button>
      <button type="button" id="remove-selected" disabled aria-disabled="true">Remove</button>
    </div>
    <p class="simple-placeholder">Drag to move. Drag a corner to change the size.</p>
  </section>`;
}

function simplePanelMarkup(): string {
  const sections = [startBlock(), wordsBlock(), pictureBlock(), motionBlock(), lengthBlock()].join("");
  return `<aside class="simple-dock" aria-label="Simple">
    ${undoBlock()}
    <div class="simple-panel" id="simple-panel">
      <p class="simple-lead">Pick a start, change the words and the color, add and animate what you need, then download.</p>
      ${sections}
    </div>
    ${downloadBlock()}
  </aside>`;
}

function codecButton(id: string, label: string, choice: { enabled: boolean; reason: string }): string {
  const disabled = choice.enabled ? "" : " disabled";
  return `<button type="button" id="export-${id}" data-export="${id}"${disabled} title="${esc(choice.reason)}">${esc(label)}</button>`;
}

export function shellMarkup(decision: ExportDecision): string {
  const rows = [
    ["Canvas and blob SVG", decision.flags.canvasBlobSvg ? "ready" : "missing", decision.canvas === "missing" ? "WebP and WebM stay off" : decision.canvas === "offscreen" ? "Offscreen canvas" : "Main-thread canvas"],
    ["Web Workers", decision.flags.webWorkers ? "ready" : "missing", decision.thread === "worker" ? "Off-main encode" : "Main thread"],
    ["OffscreenCanvas", decision.flags.offscreenCanvas ? "ready" : "missing", decision.flags.offscreenCanvas ? "Worker canvas" : "Main-thread canvas"],
    ["VideoEncoder", decision.flags.videoEncoder ? "ready" : "missing", decision.webmPath === "video-encoder" ? "WebM" : "MediaRecorder fallback"],
    ["MediaRecorder webm", decision.flags.mediaRecorderWebm ? "ready" : "missing", decision.webmPath === "disabled" ? "WebM stays off when VideoEncoder is also missing" : "WebM fallback"],
    ["WebAssembly instantiate", decision.flags.wasmInstantiate ? "ready" : "missing", decision.webp.reason],
    ["SharedArrayBuffer", decision.sharedArrayBuffer, "Not a fallback"],
  ];
  const matrix = rows
    .map(
      ([name, state, effect]) =>
        `<tr><th scope="row">${esc(name ?? "")}</th><td>${esc(state ?? "")}</td><td>${esc(effect ?? "")}</td></tr>`,
    )
    .join("");
  return `<div class="app" id="app" data-mode="preview" data-drawer="" data-sheet="40" data-surface="artboard" data-shell="simple">
    <header class="topbar">
      <div class="wordmark">Studio</div>
      <div class="mode-switch" role="group" aria-label="Simple or Advanced">
        <button type="button" id="mode-simple" data-shell-choice="simple" aria-pressed="true">Simple</button>
        <button type="button" id="mode-advanced" data-shell-choice="advanced" aria-pressed="false">Advanced</button>
      </div>
      <button type="button" id="play" aria-pressed="false">Play</button>
      <span class="time" id="time">00:00</span>
      <span class="spacer"></span>
      <button type="button" id="more-menu" aria-expanded="false" aria-controls="file-actions">More</button>
      <div class="file-actions" id="file-actions">
        <button type="button" id="open-file-button">Open</button>
        <input id="open-file" type="file" accept="text/html,.html" hidden>
        <button type="button" id="save-html">Save</button>
        <button type="button" id="export-menu">Export</button>
        <button type="button" id="theme">Theme</button>
      </div>
    </header>
    <div class="workspace">
      <nav class="rail" aria-label="Panels">
        <button type="button" id="rail-library" aria-pressed="false" title="Library" aria-label="Library"><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg></button>
        <button type="button" id="rail-inspector" aria-pressed="false" title="Properties" aria-label="Properties"><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 5h14M3 10h14M3 15h14"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="9" cy="15" r="2"/></svg></button>
      </nav>
      <aside class="library" id="library" aria-label="Library">
        <div class="panel-head"><span class="panel-title">Library</span> <button type="button" class="sheet-handle" id="sheet-snap" aria-label="Make the panel taller">Taller</button> <button type="button" id="collapse-library" title="Hide the library">Hide</button></div>
        <div class="add-tools" role="group" aria-label="Add a shape">
          <span class="add-tools-label">Add a shape</span>
          <button type="button" id="add-rectangle">Rectangle</button>
          <button type="button" id="add-ellipse">Ellipse</button>
          <button type="button" id="add-path">Arrow</button>
          <button type="button" id="add-text">Text</button>
        </div>
        <div class="library-tools">
          <input id="preset-search" type="search" placeholder="Search the library" aria-label="Search the library">
          <select id="preset-category" aria-label="Category"><option value="">All</option></select>
        </div>
        <div class="library-list" id="library-list"></div>
      </aside>
      <div class="sash sash-library" id="sash-library" role="separator" aria-orientation="vertical" aria-label="Resize library"></div>
      <main class="artboard" id="artboard">
        <div class="stage" id="stage">
          <div class="stage-fit" id="stage-fit"><div id="player-host"></div></div>
          <div id="direct" class="direct" hidden>
            <div id="direct-box" class="direct-box" data-direct="move"></div>
            <button type="button" class="direct-handle" data-handle="nw" aria-label="Resize top left"></button>
            <button type="button" class="direct-handle" data-handle="ne" aria-label="Resize top right"></button>
            <button type="button" class="direct-handle" data-handle="sw" aria-label="Resize bottom left"></button>
            <button type="button" class="direct-handle" data-handle="se" aria-label="Resize bottom right"></button>
          </div>
        </div>
        <div class="zoom-bar">
          <button type="button" id="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" id="zoom-fit">Fit</button>
          <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" id="pan-tool" aria-pressed="false" title="Pan the canvas (hold H)">Pan</button>
        </div>
        <div class="hint">Space plays and pauses. Hold H and drag, or drag with two fingers, to pan.</div>
        <p class="status-bar" id="status-bar" role="status" aria-live="polite"></p>
      </main>
      <div class="sash sash-inspector" id="sash-inspector" role="separator" aria-orientation="vertical" aria-label="Resize inspector"></div>
      <aside class="inspector" id="inspector" aria-label="Inspector">
        <div class="panel-head"><span class="panel-title">Properties</span> <button type="button" class="sheet-handle" id="sheet-snap-inspector" aria-label="Make the panel taller">Taller</button> <button type="button" id="collapse-inspector" title="Hide the properties">Hide</button></div>
        <div class="inspector-body" id="inspector-body"></div>
      </aside>
      ${simplePanelMarkup()}
    </div>
    <section class="timeline" id="timeline" aria-label="Timeline">
      <div class="sash sash-timeline" id="sash-timeline" role="separator" aria-orientation="horizontal" aria-label="Resize timeline"></div>
      <div class="timeline-transport">
        <button type="button" id="transport-play">Play</button>
        <input id="scrub" type="range" min="0" max="89" value="0" aria-label="Frame" title="Drag to move the playhead">
        <label class="filter"><input id="selected-layer-only" type="checkbox"> Only the selected layer</label>
        <span class="spacer"></span>
        <button type="button" class="sheet-handle" id="sheet-snap-timeline" aria-label="Make the panel taller">Taller</button>
        <button type="button" id="collapse-timeline">Hide timeline</button>
      </div>
      <div class="timeline-body">
        <div class="timeline-col">
          <div class="group-label layers-head"><span>Layers <small>top = front</small></span>
            <span class="layers-actions"><button type="button" id="group-selection" title="Group the selected layers (Shift-click to select more)">Group</button><button type="button" id="ungroup-selection">Ungroup</button></span>
          </div>
          <div class="layer-list" id="layer-list"></div>
        </div>
        <div class="timeline-col">
          <div class="group-label">Animation <small>click a ◆ key to edit it</small></div>
          <div id="timeline-rows"></div>
        </div>
      </div>
    </section>
    <nav class="phone-tabs" aria-label="Mode">
      <button type="button" id="tab-preview" data-mode="preview" aria-selected="true">Preview</button>
      <button type="button" id="tab-library" data-mode="library" aria-selected="false">Library</button>
      <button type="button" id="tab-inspect" data-mode="inspect" aria-selected="false">Properties</button>
      <button type="button" id="tab-timeline" data-mode="timeline" aria-selected="false">Timeline</button>
    </nav>
    <div class="popover" id="export-popover" hidden role="dialog" aria-label="Export">
      <div class="popover-head"><h2>Export</h2><button type="button" id="export-close" aria-label="Close export">Close</button></div>
      <p class="status" id="status" role="status"></p>
      <section class="export-group" aria-label="Video">
        <h3>Video</h3>
        <div class="export-row">
          ${codecButton("mp4", "MP4 video", decision.mp4)}
          ${codecButton("webm", "WebM video", decision.webm)}
        </div>
      </section>
      <section class="export-group" aria-label="Image">
        <h3>Image</h3>
        <div class="export-row">
          ${codecButton("svg", "Animated SVG", decision.svg)}
          ${codecButton("webp", "Animated WebP", decision.webp)}
        </div>
      </section>
      <section class="export-group" aria-label="Web page">
        <h3>Web page</h3>
        <div class="export-row">
          <button type="button" id="export-html" data-export="html">HTML page</button>
          <button type="button" id="copy-source" title="Copy the page's HTML">Copy HTML</button>
        </div>
        <div class="checks">
          <label><input id="embed-player" type="checkbox"> Works offline <small>(embed player)</small></label>
          <label><input id="embed-studio" type="checkbox"> Can be edited from the file <small>(embed studio)</small></label>
        </div>
        <details class="card-fields" id="card-fields">
          <summary>Link preview for sharing</summary>
          <label class="field"><span>Work id</span><input id="card-work-id" type="text" spellcheck="false" autocomplete="off" placeholder="box-spin"></label>
          <label class="field"><span>Title</span><input id="card-title" type="text" autocomplete="off"></label>
          <label class="field"><span>Description</span><input id="card-description" type="text" autocomplete="off"></label>
          <label class="field"><span>Site address</span><input id="card-base" type="url" spellcheck="false" autocomplete="off" placeholder="https://example.com"></label>
        </details>
      </section>
      <details class="export-details">
        <summary>Details for this browser</summary>
        <div class="field">
          <span>How the SVG animates</span>
          <select id="svg-backend" aria-label="SVG backend">
            <option value="css-embedded">CSS embedded</option>
            <option value="smil">SMIL</option>
            <option value="css-external">CSS external zip</option>
          </select>
        </div>
        <p class="reason" id="webp-reason">${esc(decision.webp.reason)}</p>
        <p class="reason" id="webm-reason">${esc(decision.webm.reason)}</p>
        <button type="button" id="theme-popover">Switch light or dark</button>
        <table class="matrix">
          <thead><tr><th>Capability</th><th>This browser</th><th>Effect</th></tr></thead>
          <tbody>${matrix}</tbody>
        </table>
      </details>
      <button type="button" id="migrate" hidden>Migrate</button>
    </div>
    <dialog id="open-dialog">
      <form method="dialog">
        <h2>Open a project</h2>
        <p class="reason">A project is the .html file that Save wrote. Opening one replaces what is on the canvas. Undo does not bring it back.</p>
        <button type="button" id="choose-html">Choose a .html file</button>
        <details><summary>Or paste its HTML</summary><label class="field"><span>HTML</span><textarea id="open-html"></textarea></label></details>
        <div class="stack">
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" id="open-apply" value="ok">Open</button>
        </div>
      </form>
    </dialog>
  </div>`;
}

/** A preset id read as words: hyphens become spaces, and the first letter is capital. */
export function presetName(id: string): string {
  const words = id.split(/[-_]+/).filter(Boolean).join(" ");
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

/** A number a person reads: at most two decimals, and no trailing zeros. */
export function plainNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

export function libraryMarkup(entries: PresetEntry[]): string {
  if (entries.length === 0) return `<p class="reason">Nothing in the library matches this search.</p>`;
  return entries
    .map(
      (entry) => `<div class="layer-row library-row" data-preset-file="${esc(entry.file)}">
        <span class="preset-name" title="${esc(entry.category)} / ${esc(entry.id)}"><b>${esc(presetName(entry.id))}</b><small>${esc(entry.category)}</small></span>
        <span class="row-actions">
          <button type="button" data-place="${esc(entry.file)}" title="Add this to the canvas">Add</button>
          <button type="button" data-motion="${esc(entry.file)}" class="needs-selection" title="Give the selected layer this motion">Animate selected</button>
        </span>
      </div>`,
    )
    .join("");
}

export function categoryOptions(categories: string[], selected: string): string {
  const options = [`<option value="">All</option>`];
  for (const category of categories) {
    const current = category === selected ? " selected" : "";
    options.push(`<option value="${esc(category)}"${current}>${esc(category)}</option>`);
  }
  return options.join("");
}

function fillOf(node: SceneNode): string {
  const track = node.tracks.find((item) => item.property === "attr.fill");
  const value = track?.keys[0]?.value;
  return typeof value === "string" ? value : "#c4552a";
}

export function layerListMarkup(state: EditorState): string {
  const selected = new Set(state.selection);
  const grouped = new Set(state.groups.flatMap((group) => group.childIds));
  const parts: string[] = [];
  const emit = (node: SceneNode, indent: boolean) => {
    const mark = selected.has(node.id) ? "true" : "false";
    parts.push(
      `<div class="layer-row" data-node-id="${esc(node.id)}" data-selected="${mark}" style="margin-left:${indent ? "12px" : "0"}">
        <button type="button" data-select="${esc(node.id)}" title="${esc(state.labels[node.id] ?? node.id)}"><i class="swatch" style="background:${esc(fillOf(node))}"></i> <span class="layer-name">${esc(state.labels[node.id] ?? node.id)}</span></button>
        <span class="row-actions">
          <button type="button" data-z="1" data-node-id="${esc(node.id)}" aria-label="Bring forward" title="Bring forward">↑</button>
          <button type="button" data-z="-1" data-node-id="${esc(node.id)}" aria-label="Send backward" title="Send backward">↓</button>
        </span>
      </div>`,
    );
  };
  const seen = new Set<string>();
  // The front of the picture is the top of the list, as in other design tools.
  for (const node of [...state.composition.nodes].reverse()) {
    const group = state.groups.find((item) => item.childIds.includes(node.id));
    if (group && !seen.has(group.id)) {
      seen.add(group.id);
      const mark = selected.has(group.id) ? "true" : "false";
      parts.push(
        `<div class="group-label layer-group"><button type="button" data-select="${esc(group.id)}" data-selected="${mark}">Group</button> <button type="button" data-ungroup="${esc(group.id)}">Ungroup</button></div>`,
      );
    }
    if (!grouped.has(node.id) || group) emit(node, Boolean(group));
  }
  if (parts.length === 0) return `<p class="reason">No layers yet. Add something from the library.</p>`;
  return parts.join("");
}

const PROPERTY_NAMES: Record<string, string> = {
  "transform.translateX": "Position X",
  "transform.translateY": "Position Y",
  "transform.rotate": "Rotation",
  "transform.scaleX": "Scale X",
  "transform.scaleY": "Scale Y",
  "transform.matrix": "Transform",
  "attr.opacity": "Opacity",
  "attr.fill": "Color",
  "attr.stroke": "Outline color",
  "attr.d": "Shape",
  "attr.offsetDistance": "Path progress",
  clip: "Clip",
  mask: "Mask",
};

/** The words a person reads for an animated property. The stored name stays in a tooltip. */
export function propertyName(property: string): string {
  const known = PROPERTY_NAMES[property];
  if (known) return known;
  const last = property.split(".").pop() ?? property;
  const words = last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const EASING_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "cubic-bezier(0.4, 0, 0.2, 1)", label: "Smooth" },
  { value: "linear", label: "Steady" },
  { value: "hold", label: "Jump (no blend)" },
  { value: "spring", label: "Bouncy" },
];

function easingOptions(current: string | undefined): string {
  const known = EASING_CHOICES.some((choice) => choice.value === current);
  const choices = current && !known ? [...EASING_CHOICES, { value: current, label: "Custom curve" }] : EASING_CHOICES;
  const chosen = current ?? "linear";
  return choices
    .map((choice) => `<option value="${esc(choice.value)}"${choice.value === chosen ? " selected" : ""}>${esc(choice.label)}</option>`)
    .join("");
}

function keyValue(value: number | string | number[]): string {
  return Array.isArray(value) ? value.join(" ") : String(value);
}

/** The one key whose editor is open. Clicking a key opens its editor beside it. */
export interface ActiveKey {
  node: string;
  property: string;
  frame: number;
}

export function timelineMarkup(state: EditorState, active: ActiveKey | null = null): string {
  const duration = Math.max(1, state.composition.durationInFrames);
  const propertyOptions = KEY_PROPERTIES.map(
    (property) => `<option value="${esc(property)}" title="${esc(property)}">${esc(propertyName(property))}</option>`,
  ).join("");
  return timelineNodes(state)
    .map((node) => {
      const mark = state.selection.includes(node.id) ? "true" : "false";
      const name = state.labels[node.id] ?? node.id;
      const lanes = node.tracks
        .map((track) => {
          const label = propertyName(track.property);
          const dots = track.keys
            .map((key) => {
              const left = duration <= 1 ? 0 : (key.frame / (duration - 1)) * 100;
              const open =
                active !== null && active.node === node.id && active.property === track.property && active.frame === key.frame;
              return `<button type="button" class="key-dot" data-key-frame="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" aria-pressed="${open ? "true" : "false"}" aria-label="${esc(label)} key at frame ${key.frame}" title="${esc(label)} · frame ${key.frame}" style="left:${left}%"></button>`;
            })
            .join("");
          const key =
            active !== null && active.node === node.id && active.property === track.property
              ? track.keys.find((item) => item.frame === active.frame)
              : undefined;
          let editor = "";
          if (key) {
            const numeric = typeof key.value === "number" || track.property === "attr.fill";
            const valueField = numeric
              ? `<label class="key-edit">Value <input data-edit="value" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" value="${esc(keyValue(key.value))}"></label>`
              : `<p class="key-edit reason">This key holds a drawn shape. Drag it on the canvas to change it.</p>`;
            editor = `<div class="key-edits" role="group" aria-label="${esc(label)} key">
              <label class="key-edit">Frame <input data-edit="frame" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" value="${key.frame}" inputmode="numeric"></label>
              ${valueField}
              <label class="key-edit">Easing <select data-edit="easing" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}">${easingOptions(key.easing)}</select></label>
              <button type="button" data-remove-key="true" data-frame="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}">Delete key</button>
            </div>`;
          }
          return `<div class="key-lane" data-property="${esc(track.property)}">
            <div class="key-name" title="${esc(track.property)}">${esc(label)}</div>
            <div class="key-ruler">${dots}</div>
          </div>${editor}`;
        })
        .join("");
      return `<div class="track-block" data-node-id="${esc(node.id)}" data-selected="${mark}">
        <div class="track-head">
          <button type="button" data-select="${esc(node.id)}" title="${esc(name)}">${esc(name)}</button>
          <select data-property-pick="${esc(node.id)}" aria-label="Property to key">${propertyOptions}</select>
          <button type="button" data-add-key="${esc(node.id)}" title="Add a key for this property at the playhead">Add key</button>
        </div>
        ${lanes}
      </div>`;
    })
    .join("");
}

function canvasSettings(state: EditorState, open: boolean): string {
  const comp = state.composition;
  const seconds = comp.fps > 0 ? plainNumber(comp.durationInFrames / comp.fps) : "";
  return `<details class="canvas-settings"${open ? " open" : ""}>
    <summary>Canvas</summary>
    ${field("width", "Canvas width", String(comp.width))}
    ${field("height", "Canvas height", String(comp.height))}
    ${field("duration", `Length in frames (${seconds} s)`, String(comp.durationInFrames))}
    ${field("fps", "Frames per second", String(comp.fps))}
  </details>`;
}

function layerPicker(state: EditorState, selected: string): string {
  const options = [...state.composition.nodes]
    .reverse()
    .map((node) => {
      const name = state.labels[node.id] ?? node.id;
      return `<option value="${esc(node.id)}"${node.id === selected ? " selected" : ""}>${esc(name)}</option>`;
    })
    .join("");
  const none = selected ? "" : `<option value="" selected>Choose a layer</option>`;
  return `<label class="field layer-pick"><span>Layer</span><select id="field-layer" data-field="layer">${none}${options}</select></label>`;
}

export function inspectorMarkup(state: EditorState): string {
  const id = state.selection.find((item) => state.composition.nodes.some((node) => node.id === item));
  const node = state.composition.nodes.find((item) => item.id === id);
  if (!node) {
    const picker = state.composition.nodes.length > 0 ? layerPicker(state, "") : "";
    return `<div class="inspector-empty">
      <h3>Start here</h3>
      <ol>
        <li>Add a shape or a library item from the panel on the left.</li>
        <li>Select it, then press Animate selected on a motion in the library.</li>
        <li>Press Export to save a video, an image, or a web page.</li>
      </ol>
    </div>
    ${picker}
    ${canvasSettings(state, true)}`;
  }
  const number = (property: string) => {
    const track = node.tracks.find((item) => item.property === property);
    const value = track?.keys.find((key) => key.frame === state.frame) ?? track?.keys[0];
    return typeof value?.value === "number" ? plainNumber(value.value) : "";
  };
  const text = (property: string) => {
    const track = node.tracks.find((item) => item.property === property);
    const value = track?.keys[0]?.value;
    return typeof value === "string" ? value : "";
  };
  const fill = text("attr.fill");
  const hex = /^#[0-9a-fA-F]{6}$/.test(fill) ? fill.toLowerCase() : /^#[0-9a-fA-F]{3}$/.test(fill) ? `#${[...fill.slice(1)].map((digit) => digit + digit).join("")}`.toLowerCase() : "";
  const swatch = hex
    ? `<input type="color" id="field-fill-pick" data-field="fill" value="${esc(hex)}" aria-label="Pick a color">`
    : "";
  const textField = Object.hasOwn(state.texts, node.id) ? field("text", "Words", state.texts[node.id] ?? "") : "";
  return `${layerPicker(state, node.id)}
    ${field("label", "Layer name", state.labels[node.id] ?? "")}
    ${textField}
    <label class="field fill-field"><span>Color</span><span class="fill-row">${swatch}<input id="field-fill" data-field="fill" value="${esc(fill)}" spellcheck="false"></span></label>
    <div class="field-pair">
      ${field("x", "X (px)", number("transform.translateX"))}
      ${field("y", "Y (px)", number("transform.translateY"))}
    </div>
    ${field("rotate", "Rotation (°)", number("transform.rotate"))}
    <p class="reason">Position and rotation are keyed at the playhead.</p>
    <details class="raw-keys"><summary>Keys as data</summary><pre class="reason json-dump">${esc(JSON.stringify(node.tracks, null, 2))}</pre></details>
    ${canvasSettings(state, false)}`;
}

function field(id: string, label: string, value: string): string {
  return `<label class="field"><span>${esc(label)}</span><input id="field-${id}" data-field="${id}" value="${esc(value)}"></label>`;
}
