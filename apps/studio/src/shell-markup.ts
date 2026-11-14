/** Shell markup. Simple mode is the default entry. Advanced keeps the artboard. There is no GIF control. */

import type { EditorState, SceneNode } from "./composition.ts";
import { KEY_PROPERTIES, timelineNodes } from "./composition.ts";
import type { ExportDecision } from "./export-support.ts";
import { DELAY_CHOICES, SPEED_CHOICES, type MotionDef } from "./motions.ts";
import type { PresetEntry } from "./presets.ts";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sectionMarkup(title: string, body: string): string {
  return `<section class="simple-block"><h3>${esc(title)}</h3><p class="simple-placeholder">${esc(body)}</p></section>`;
}

function choiceOptions(choices: ReadonlyArray<{ id: string; label: string }>, selected: string): string {
  return choices
    .map((choice) => {
      const current = choice.id === selected ? " selected" : "";
      return `<option value="${esc(choice.id)}"${current}>${esc(choice.label)}</option>`;
    })
    .join("");
}

export function motionChoicesMarkup(motions: MotionDef[]): string {
  return motions
    .map(
      (motion, index) =>
        `<button type="button" class="motion-choice" role="menuitem" data-motion-index="${index}">${esc(motion.label)}</button>`,
    )
    .join("");
}

function motionBlock(): string {
  return `<section class="simple-block" id="motion-block">
    <h3>Motion</h3>
    <p class="simple-placeholder">Pick one entrance for the selected shape.</p>
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

function simplePanelMarkup(): string {
  const before: Array<[string, string]> = [
    ["Start", "Placeholder. Template choices are not here yet."],
    ["Words and color", "Placeholder. A headline and color choices are not here yet."],
    ["Picture", "Tap a shape to select it. Drag the shape to move it. Drag a corner to change its size."],
  ];
  const after: Array<[string, string]> = [
    ["Length", "Placeholder. Length in seconds and a loop switch are not here yet."],
    ["Download", "Placeholder. Download image and download video are not here yet."],
    ["Undo", "Placeholder. Undo and redo are not here yet."],
  ];
  const sections = [...before.map(([title, body]) => sectionMarkup(title, body)), motionBlock(), ...after.map(([title, body]) => sectionMarkup(title, body))].join("");
  return `<aside class="simple-panel" id="simple-panel" aria-label="Simple">
    <h2>Simple</h2>
    <p class="simple-lead">A plain starting point. Pick a motion from the menu. Template, words, length, download, and undo are labelled placeholders.</p>
    ${sections}
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
      <button type="button" id="open-file-button">Open</button>
      <input id="open-file" type="file" accept="text/html,.html" hidden>
      <button type="button" id="save-html">Save</button>
      <button type="button" id="export-menu">Export</button>
      <button type="button" id="theme">Theme</button>
    </header>
    <div class="workspace">
      <nav class="rail" aria-label="Panels">
        <button type="button" id="rail-library" aria-pressed="false" title="Library">Lib</button>
        <button type="button" id="rail-inspector" aria-pressed="false" title="Inspector">Ins</button>
      </nav>
      <aside class="library" id="library" aria-label="Library">
        <div class="panel-head">Library <button type="button" class="sheet-handle" id="sheet-snap">Sheet 40</button> <button type="button" id="collapse-library">Hide</button></div>
        <div class="library-tools">
          <input id="preset-search" type="search" placeholder="Search presets" aria-label="Search presets">
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
          <button type="button" id="pan-tool" aria-pressed="false" title="Pan">H</button>
        </div>
        <div class="hint">Space plays and pauses. H, the middle mouse button, or two fingers pan.</div>
        <p class="status-bar" id="status-bar" role="status" aria-live="polite"></p>
      </main>
      <div class="sash sash-inspector" id="sash-inspector" role="separator" aria-orientation="vertical" aria-label="Resize inspector"></div>
      <aside class="inspector" id="inspector" aria-label="Inspector">
        <div class="panel-head">Inspector <button type="button" class="sheet-handle" id="sheet-snap-inspector">Sheet 40</button> <button type="button" id="collapse-inspector">Hide</button></div>
        <div class="inspector-tools">
          <button type="button" id="add-rectangle">Rectangle</button>
          <button type="button" id="add-ellipse">Ellipse</button>
          <button type="button" id="add-path">Path</button>
          <button type="button" id="add-text">Text</button>
        </div>
        <div class="inspector-body" id="inspector-body"></div>
      </aside>
      ${simplePanelMarkup()}
    </div>
    <section class="timeline" id="timeline" aria-label="Timeline">
      <div class="sash sash-timeline" id="sash-timeline" role="separator" aria-orientation="horizontal" aria-label="Resize timeline"></div>
      <div class="timeline-transport">
        <button type="button" id="transport-play">Play</button>
        <input id="scrub" type="range" min="0" max="89" value="0" aria-label="Frame">
        <label class="filter"><input id="selected-layer-only" type="checkbox"> Selected layer only</label>
        <button type="button" id="group-selection">Group</button>
        <button type="button" id="ungroup-selection">Ungroup</button>
        <span class="spacer"></span>
        <button type="button" class="sheet-handle" id="sheet-snap-timeline">Sheet 40</button>
        <button type="button" id="collapse-timeline">Collapse</button>
      </div>
      <div class="timeline-body">
        <div class="timeline-col">
          <div class="group-label">Layers</div>
          <div class="layer-list" id="layer-list"></div>
        </div>
        <div class="timeline-col">
          <div class="group-label">Tracks</div>
          <div id="timeline-rows"></div>
        </div>
      </div>
    </section>
    <nav class="phone-tabs" aria-label="Mode">
      <button type="button" id="tab-preview" data-mode="preview" aria-selected="true">Preview</button>
      <button type="button" id="tab-library" data-mode="library" aria-selected="false">Library</button>
      <button type="button" id="tab-inspect" data-mode="inspect" aria-selected="false">Inspect</button>
      <button type="button" id="tab-timeline" data-mode="timeline" aria-selected="false">Timeline</button>
    </nav>
    <div class="popover" id="export-popover" hidden>
      <h2>Export</h2>
      <p class="status" id="status" role="status"></p>
      <div class="checks">
        <label><input id="embed-player" type="checkbox"> embed player</label>
        <label><input id="embed-studio" type="checkbox"> embed studio</label>
      </div>
      <div class="export-row">
        <button type="button" id="export-html" data-export="html">Export HTML</button>
        ${codecButton("svg", "SVG", decision.svg)}
        ${codecButton("webp", "WebP", decision.webp)}
        ${codecButton("webm", "WebM", decision.webm)}
        ${codecButton("mp4", "MP4", decision.mp4)}
      </div>
      <div class="field">
        <span>SVG backend</span>
        <select id="svg-backend" aria-label="SVG backend">
          <option value="css-embedded">CSS embedded</option>
          <option value="smil">SMIL</option>
          <option value="css-external">CSS external zip</option>
        </select>
      </div>
      <p class="reason" id="webp-reason">${esc(decision.webp.reason)}</p>
      <p class="reason" id="webm-reason">${esc(decision.webm.reason)}</p>
      <button type="button" id="copy-source">Copy source</button>
      <button type="button" id="theme-popover">Theme</button>
      <button type="button" id="migrate" hidden>Migrate</button>
      <table class="matrix">
        <thead><tr><th>Capability</th><th>This browser</th><th>Effect</th></tr></thead>
        <tbody>${matrix}</tbody>
      </table>
    </div>
    <dialog id="open-dialog">
      <form method="dialog">
        <h2>Open HTML</h2>
        <button type="button" id="choose-html">Choose .html file</button>
        <label class="field"><span>Paste HTML</span><textarea id="open-html"></textarea></label>
        <div class="stack">
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" id="open-apply" value="ok">Open</button>
        </div>
      </form>
    </dialog>
  </div>`;
}

export function libraryMarkup(entries: PresetEntry[]): string {
  if (entries.length === 0) return `<p class="reason">No presets match this search.</p>`;
  return entries
    .map(
      (entry) => `<div class="layer-row" data-preset-file="${esc(entry.file)}">
        <span>${esc(entry.category)} / ${esc(entry.id)}</span>
        <span class="row-actions">
          <button type="button" data-place="${esc(entry.file)}">Place</button>
          <button type="button" data-motion="${esc(entry.file)}">Apply motion</button>
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
        <button type="button" data-select="${esc(node.id)}"><i class="swatch" style="background:${esc(fillOf(node))}"></i> ${esc(state.labels[node.id] ?? node.id)}</button>
        <span class="row-actions">
          <button type="button" data-z="-1" data-node-id="${esc(node.id)}" aria-label="Send backward">Down</button>
          <button type="button" data-z="1" data-node-id="${esc(node.id)}" aria-label="Bring forward">Up</button>
        </span>
      </div>`,
    );
  };
  const seen = new Set<string>();
  for (const node of state.composition.nodes) {
    const group = state.groups.find((item) => item.childIds.includes(node.id));
    if (group && !seen.has(group.id)) {
      seen.add(group.id);
      const mark = selected.has(group.id) ? "true" : "false";
      parts.push(
        `<div class="group-label"><button type="button" data-select="${esc(group.id)}" data-selected="${mark}">Group ${esc(group.id)}</button> <button type="button" data-ungroup="${esc(group.id)}">Ungroup</button></div>`,
      );
    }
    if (!grouped.has(node.id) || group) emit(node, Boolean(group));
  }
  return parts.join("");
}

const EASING_CHOICES = ["linear", "hold", "spring", "cubic-bezier(0.4, 0, 0.2, 1)"];

function easingOptions(current: string | undefined): string {
  const choices = current && !EASING_CHOICES.includes(current) ? [...EASING_CHOICES, current] : EASING_CHOICES;
  return choices
    .map((choice) => `<option value="${esc(choice)}"${choice === current ? " selected" : ""}>${esc(choice)}</option>`)
    .join("");
}

function keyValue(value: number | string | number[]): string {
  return Array.isArray(value) ? value.join(" ") : String(value);
}

export function timelineMarkup(state: EditorState): string {
  const duration = Math.max(1, state.composition.durationInFrames);
  const propertyOptions = KEY_PROPERTIES.map((property) => `<option value="${esc(property)}">${esc(property)}</option>`).join("");
  return timelineNodes(state)
    .map((node) => {
      const mark = state.selection.includes(node.id) ? "true" : "false";
      const lanes = node.tracks
        .map((track) => {
          const dots = track.keys
            .map((key) => {
              const left = duration <= 1 ? 0 : (key.frame / (duration - 1)) * 100;
              return `<button type="button" class="key-dot" data-key-frame="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" style="left:${left}%">${key.frame}</button>`;
            })
            .join("");
          const editors = track.keys
            .map((key) => {
              const numeric = typeof key.value === "number" || track.property === "attr.fill";
              const valueField = numeric
                ? `<label class="key-edit">Value <input data-edit="value" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" value="${esc(keyValue(key.value))}"></label>`
                : `<label class="key-edit">Value <input data-edit="value" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" value="${esc(keyValue(key.value))}" disabled title="This track value is not a number."></label>`;
              return `<label class="key-edit">Frame <input data-edit="frame" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}" value="${key.frame}"></label>
              ${valueField}
              <label class="key-edit">Easing <select data-edit="easing" data-from="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}">${easingOptions(key.easing)}</select></label>
              <button type="button" data-remove-key="true" data-frame="${key.frame}" data-property="${esc(track.property)}" data-node-id="${esc(node.id)}">Remove</button>`;
            })
            .join("");
          return `<div class="key-lane" data-property="${esc(track.property)}">
            <div class="key-name">${esc(track.property)}</div>
            <div class="key-ruler" aria-hidden="false">${dots}</div>
            <div class="key-edits">${editors}</div>
          </div>`;
        })
        .join("");
      return `<div class="track-block" data-node-id="${esc(node.id)}" data-selected="${mark}">
        <div class="track-head">
          <button type="button" data-select="${esc(node.id)}">${esc(state.labels[node.id] ?? node.id)}</button>
          <select data-property-pick="${esc(node.id)}" aria-label="Track property">${propertyOptions}</select>
          <button type="button" data-add-key="${esc(node.id)}">Key at frame</button>
        </div>
        ${lanes}
      </div>`;
    })
    .join("");
}

export function inspectorMarkup(state: EditorState): string {
  const id = state.selection.find((item) => state.composition.nodes.some((node) => node.id === item));
  const node = state.composition.nodes.find((item) => item.id === id);
  const comp = state.composition;
  const fields = [
    field("fps", "Frames per second", String(comp.fps)),
    field("width", "Width", String(comp.width)),
    field("height", "Height", String(comp.height)),
    field("duration", "Duration in frames", String(comp.durationInFrames)),
  ];
  if (!node) {
    return `${fields.join("")}<p class="reason">Select a layer to edit its tracks. The artboard stays the default surface.</p>`;
  }
  const number = (property: string) => {
    const track = node.tracks.find((item) => item.property === property);
    const value = track?.keys.find((key) => key.frame === state.frame) ?? track?.keys[0];
    return typeof value?.value === "number" ? String(value.value) : "";
  };
  const text = (property: string) => {
    const track = node.tracks.find((item) => item.property === property);
    const value = track?.keys[0]?.value;
    return typeof value === "string" ? value : "";
  };
  const textField = Object.hasOwn(state.texts, node.id) ? field("text", "Text", state.texts[node.id] ?? "") : "";
  return `${fields.join("")}
    <p class="group-label">${esc(node.id)}</p>
    ${field("label", "Label", state.labels[node.id] ?? "")}
    ${textField}
    ${field("fill", "Fill", text("attr.fill"))}
    ${field("x", "X", number("transform.translateX"))}
    ${field("y", "Y", number("transform.translateY"))}
    ${field("rotate", "Rotate", number("transform.rotate"))}
    <div class="field"><span>Tracks</span><pre class="reason json-dump">${esc(JSON.stringify(node.tracks, null, 2))}</pre></div>`;
}

function field(id: string, label: string, value: string): string {
  return `<label class="field"><span>${esc(label)}</span><input id="field-${id}" data-field="${id}" value="${esc(value)}"></label>`;
}
