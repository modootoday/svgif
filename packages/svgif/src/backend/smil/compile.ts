/**
 * Emit one SVG document.
 * Animation is animate, animateTransform, animateMotion, and set.
 * keyTimes, keySplines, begin, and end carry the timeline from frame 0.
 * Numbers use emit quantization. The compiler does not drop a channel.
 * [[sot:svgif/animation-backends]]
 */

import { parseEasing } from "../../ir/easing.ts";
import { parsePath, sameCommandList } from "../../ir/path.ts";
import { formatUnit } from "../../ir/quantize.ts";
import type { IrKey, IrNode, IrValue, TimelineIr } from "../../ir/types.ts";
import { lower } from "./lower.ts";

export interface SmilCompileResult {
  schemaVersion: 1;
  schemaRevision: 0;
  id: "smil";
  schema: "svgif.backend/1";
  svg: string;
}

interface Anim {
  tag: "animate" | "animateTransform" | "animateMotion" | "set";
  attributes: Array<[string, string]>;
  href?: string;
}

interface Primitive {
  attributes: Array<[string, string]>;
  anims: Anim[];
}

interface Shape {
  d: string;
  anims: Anim[];
}

const TRANSFORM = /^transform\.(translateX|translateY|rotate|scaleX|scaleY|matrix)$/;
const FILTER = /^filter\.([A-Za-z][A-Za-z0-9-]*)\.([A-Za-z][A-Za-z0-9-]*)$/;
const GRADIENT = /^gradient\.([A-Za-z][A-Za-z0-9-]*)\.(offset|stop-color)$/;

function orderedKeys(keys: IrKey[]): IrKey[] {
  return keys
    .map((key, index) => ({ key, index }))
    .sort((left, right) => left.key.frame - right.key.frame || left.index - right.index)
    .map((entry) => entry.key);
}

function isAffineMatrix(value: IrValue): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isPathProperty(property: string): boolean {
  return property === "attr.d" || property === "clip" || property === "mask";
}

function pathsMatch(left: IrValue, right: IrValue): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const from = parsePath(left);
  const to = parsePath(right);
  if (!from || !to) return false;
  return sameCommandList(from, to);
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function elementId(id: string): string {
  return id.startsWith("s-") ? id : `s-${id}`;
}

function formatSeconds(frame: number, fps: number): string {
  return `${formatUnit(frame / fps)}s`;
}

function formatScalar(value: IrValue): string {
  if (typeof value === "number") return formatUnit(value);
  if (typeof value === "string") return value;
  return value.map((item) => formatUnit(item)).join(" ");
}

function formatTransform(component: string, value: IrValue): string {
  if (component === "matrix" && isAffineMatrix(value)) {
    return value.map((item) => formatUnit(item)).join(" ");
  }
  if (typeof value !== "number") return formatScalar(value);
  const n = formatUnit(value);
  if (component === "translateX") return `${n} 0`;
  if (component === "translateY") return `0 ${n}`;
  if (component === "scaleX") return `${n} 1`;
  if (component === "scaleY") return `1 ${n}`;
  return n;
}

function keyTimes(frames: number[]): string {
  const first = frames[0] ?? 0;
  const last = frames[frames.length - 1] ?? first;
  const span = last - first;
  return frames
    .map((frame, index) => {
      if (index === 0) return "0";
      if (index === frames.length - 1) return "1";
      if (span === 0) return "0";
      return formatUnit((frame - first) / span);
    })
    .join(";");
}

function splineToken(token: string | undefined): string {
  const kind = parseEasing(token);
  if (kind.kind !== "cubic") return "0 0 1 1";
  return [kind.x1, kind.y1, kind.x2, kind.y2].map((item) => formatUnit(item)).join(" ");
}

function renderElement(
  name: string,
  attributes: Array<[string, string]>,
  children: string[],
  indent: number,
): string {
  const pad = "  ".repeat(indent);
  const attrs = attributes.map(([key, value]) => ` ${key}="${escapeAttr(value)}"`).join("");
  if (children.length === 0) return `${pad}<${name}${attrs}/>`;
  return `${pad}<${name}${attrs}>\n${children.join("\n")}\n${pad}</${name}>`;
}

function renderAnim(anim: Anim, indent: number): string {
  const children = anim.href ? [renderElement("mpath", [["href", anim.href]], [], indent + 1)] : [];
  return renderElement(anim.tag, anim.attributes, children, indent);
}

type SpanMode = "linear" | "spline" | "discrete";

function spanMode(property: string, start: IrKey, end: IrKey): SpanMode {
  const kind = parseEasing(end.easing);
  if (kind.kind === "hold" || kind.kind === "spring") return "discrete";
  if (isPathProperty(property) && !pathsMatch(start.value, end.value)) return "discrete";
  if (kind.kind === "cubic") return "spline";
  return "linear";
}

interface SpanGroup {
  mode: SpanMode;
  keys: IrKey[];
}

function groupsFor(property: string, keys: IrKey[]): SpanGroup[] {
  const ordered = orderedKeys(keys);
  const groups: SpanGroup[] = [];
  if (ordered.length < 2) return groups;
  let current: SpanGroup | null = null;
  for (let index = 1; index < ordered.length; index += 1) {
    const start = ordered[index - 1];
    const end = ordered[index];
    if (!start || !end || start.frame === end.frame) continue;
    const mode = spanMode(property, start, end);
    if (!current || (current.mode === "discrete") !== (mode === "discrete")) {
      current = { mode, keys: [start, end] };
      groups.push(current);
      continue;
    }
    if (mode === "spline") current.mode = "spline";
    current.keys.push(end);
  }
  return groups;
}

function timedAttributes(
  pairs: Array<[string, string]>,
  keys: IrKey[],
  mode: SpanMode,
  fps: number,
  freeze: boolean,
): Array<[string, string]> {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return pairs;
  const attributes = pairs.slice();
  attributes.push(["begin", formatSeconds(first.frame, fps)]);
  attributes.push(["end", formatSeconds(last.frame, fps)]);
  const calcMode = mode === "spline" ? "spline" : mode === "discrete" ? "discrete" : "linear";
  attributes.push(["calcMode", calcMode]);
  attributes.push(["keyTimes", keyTimes(keys.map((key) => key.frame))]);
  if (mode === "spline") {
    const splines: string[] = [];
    for (let index = 1; index < keys.length; index += 1) {
      splines.push(splineToken(keys[index]?.easing));
    }
    attributes.push(["keySplines", splines.join(";")]);
  }
  attributes.push(["fill", freeze ? "freeze" : "remove"]);
  return attributes;
}

function withValues(attributes: Array<[string, string]>, values: string): Array<[string, string]> {
  const next = attributes.slice();
  const at = next.findIndex(([key]) => key === "keyTimes");
  next.splice(at, 0, ["values", values]);
  return next;
}

function isShowHide(property: string, keys: IrKey[]): boolean {
  if (property !== "attr.opacity") return false;
  const ordered = orderedKeys(keys);
  if (ordered.length < 2) return false;
  for (const key of ordered) {
    if (key.value !== 0 && key.value !== 1) return false;
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (parseEasing(ordered[index]?.easing).kind !== "hold") return false;
  }
  return true;
}

function emitShowHide(keys: IrKey[], fps: number, durationInFrames: number): Anim[] {
  const ordered = orderedKeys(keys);
  const anims: Anim[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const key = ordered[index];
    if (!key) continue;
    const next = ordered[index + 1];
    const begin = formatSeconds(key.frame, fps);
    const end = formatSeconds(next ? next.frame : durationInFrames, fps);
    if (begin === end) continue;
    const last = index === ordered.length - 1;
    anims.push({
      tag: "set",
      attributes: [
        ["attributeName", "opacity"],
        ["to", formatScalar(key.value)],
        ["begin", begin],
        ["end", end],
        ["fill", last ? "freeze" : "remove"],
      ],
    });
  }
  return anims;
}

function emitValues(property: string, component: string | null, keys: IrKey[]): string {
  return keys
    .map((key) => (component ? formatTransform(component, key.value) : formatScalar(key.value)))
    .join(";");
}

function emitAttribute(
  tag: Anim["tag"],
  attributeName: string | null,
  property: string,
  component: string | null,
  keys: IrKey[],
  fps: number,
  extra: Array<[string, string]>,
): Anim[] {
  const groups = groupsFor(property, keys);
  return groups.map((group, index) => {
    const freeze = index === groups.length - 1;
    const head: Array<[string, string]> = [];
    if (attributeName) head.push(["attributeName", attributeName]);
    for (const pair of extra) {
      if (pair[0] === "type") head.push(pair);
    }
    let attributes = timedAttributes(head, group.keys, group.mode, fps, freeze);
    attributes = withValues(attributes, emitValues(property, component, group.keys));
    for (const pair of extra) {
      if (pair[0] !== "type") attributes.splice(attributes.length - 1, 0, pair);
    }
    return { tag, attributes };
  });
}

function emitMotion(keys: IrKey[], fps: number, href: string): Anim[] {
  const groups = groupsFor("attr.offsetDistance", keys);
  return groups.map((group, index) => {
    const freeze = index === groups.length - 1;
    const points = group.keys.map((key) => formatScalar(key.value)).join(";");
    let attributes = timedAttributes([], group.keys, group.mode, fps, freeze);
    const at = attributes.findIndex(([key]) => key === "keyTimes");
    attributes.splice(at, 0, ["keyPoints", points]);
    return { tag: "animateMotion", attributes, href };
  });
}

function staticPaint(property: string, keys: IrKey[]): [string, string] | null {
  const first = orderedKeys(keys)[0];
  if (!first) return null;
  if (property === "attr.opacity") return ["opacity", formatScalar(first.value)];
  if (property === "attr.fill") return ["fill", formatScalar(first.value)];
  if (property === "attr.stroke") return ["stroke", formatScalar(first.value)];
  return null;
}

interface StaticTransform {
  translateX?: IrValue;
  translateY?: IrValue;
  rotate?: IrValue;
  scaleX?: IrValue;
  scaleY?: IrValue;
  matrix?: IrValue;
}

function rememberStatic(component: string, value: IrValue, into: StaticTransform): void {
  if (component === "translateX") into.translateX = value;
  else if (component === "translateY") into.translateY = value;
  else if (component === "rotate") into.rotate = value;
  else if (component === "scaleX") into.scaleX = value;
  else if (component === "scaleY") into.scaleY = value;
  else if (component === "matrix") into.matrix = value;
}

function staticTransform(parts: StaticTransform): string | null {
  const list: string[] = [];
  if (parts.translateX !== undefined || parts.translateY !== undefined) {
    const x = parts.translateX === undefined ? "0" : formatTransform("translateX", parts.translateX).split(" ")[0];
    const y = parts.translateY === undefined ? "0" : formatTransform("translateY", parts.translateY).split(" ")[1];
    list.push(`translate(${x ?? "0"} ${y ?? "0"})`);
  }
  if (parts.rotate !== undefined) list.push(`rotate(${formatTransform("rotate", parts.rotate)})`);
  if (parts.scaleX !== undefined || parts.scaleY !== undefined) {
    const x = parts.scaleX === undefined ? "1" : formatTransform("scaleX", parts.scaleX).split(" ")[0];
    const y = parts.scaleY === undefined ? "1" : formatTransform("scaleY", parts.scaleY).split(" ")[1];
    list.push(`scale(${x ?? "1"} ${y ?? "1"})`);
  }
  if (parts.matrix !== undefined) {
    list.push(`matrix(${formatTransform("matrix", parts.matrix).replaceAll(" ", ",")})`);
  }
  return list.length > 0 ? list.join(" ") : null;
}

function upsert(list: Array<[string, string]>, name: string, value: string): void {
  const index = list.findIndex(([key]) => key === name);
  if (index >= 0) list[index] = [name, value];
  else list.push([name, value]);
}

function buildNode(node: IrNode, fps: number, durationInFrames: number): { defs: string[]; group: string } {
  const id = elementId(node.id);
  const groupAnims: Anim[] = [];
  const paint: Array<[string, string]> = [];
  const transform: StaticTransform = {};
  let shape: Shape | null = null;
  const filters = new Map<string, Primitive>();
  const stops = new Map<string, Primitive>();
  let clip: Shape | null = null;
  let mask: Shape | null = null;
  let motion = false;

  const shapeFor = (current: Shape | null, keys: IrKey[]): Shape => {
    const first = orderedKeys(keys)[0];
    const d = first && typeof first.value === "string" ? first.value : "";
    if (!current) return { d, anims: [] };
    return current;
  };

  for (const track of node.tracks) {
    const keys = orderedKeys(track.keys);
    if (keys.length === 0) continue;
    const first = keys[0];
    if (!first) continue;
    const transformMatch = TRANSFORM.exec(track.property);
    const filterMatch = FILTER.exec(track.property);
    const gradientMatch = GRADIENT.exec(track.property);

    if (transformMatch) {
      const component = transformMatch[1] ?? "";
      if (keys.length < 2) {
        rememberStatic(component, first.value, transform);
        continue;
      }
      const affine = component !== "matrix" || keys.every((key) => isAffineMatrix(key.value));
      if (affine) {
        groupAnims.push(
          ...emitAttribute("animateTransform", "transform", track.property, component, keys, fps, [
            ["type", transformType(component)],
            ["additive", "sum"],
          ]),
        );
      } else {
        groupAnims.push(...emitAttribute("animate", "transform", track.property, null, keys, fps, []));
      }
      continue;
    }

    if (track.property === "attr.offsetDistance") {
      motion = true;
      groupAnims.push(...emitMotion(keys, fps, `#${id}-motion`));
      continue;
    }

    if (isShowHide(track.property, keys)) {
      const paintPair = staticPaint(track.property, keys);
      if (paintPair) upsert(paint, paintPair[0], paintPair[1]);
      groupAnims.push(...emitShowHide(keys, fps, durationInFrames));
      continue;
    }

    const paintPair = staticPaint(track.property, keys);
    if (paintPair) {
      upsert(paint, paintPair[0], paintPair[1]);
      groupAnims.push(...emitAttribute("animate", paintPair[0], track.property, null, keys, fps, []));
      continue;
    }

    if (track.property === "attr.d") {
      shape = shapeFor(shape, keys);
      shape.anims.push(...emitAttribute("animate", "d", track.property, null, keys, fps, []));
      continue;
    }

    if (filterMatch) {
      const primitive = filterMatch[1] ?? "feGaussianBlur";
      const attribute = filterMatch[2] ?? "stdDeviation";
      const bucket = filters.get(primitive) ?? { attributes: [], anims: [] };
      upsert(bucket.attributes, attribute, formatScalar(first.value));
      bucket.anims.push(...emitAttribute("animate", attribute, track.property, null, keys, fps, []));
      filters.set(primitive, bucket);
      continue;
    }

    if (gradientMatch) {
      const stop = gradientMatch[1] ?? "s0";
      const attribute = gradientMatch[2] ?? "offset";
      const bucket = stops.get(stop) ?? { attributes: [], anims: [] };
      upsert(bucket.attributes, attribute, formatScalar(first.value));
      bucket.anims.push(...emitAttribute("animate", attribute, track.property, null, keys, fps, []));
      stops.set(stop, bucket);
      continue;
    }

    if (track.property === "clip" || track.property === "mask") {
      const target = shapeFor(track.property === "clip" ? clip : mask, keys);
      target.anims.push(...emitAttribute("animate", "d", track.property, null, keys, fps, []));
      if (track.property === "clip") clip = target;
      else mask = target;
      continue;
    }

    const attribute = track.property.startsWith("attr.") ? track.property.slice(5) : track.property;
    upsert(paint, attribute, formatScalar(first.value));
    groupAnims.push(...emitAttribute("animate", attribute, track.property, null, keys, fps, []));
  }

  const defs: string[] = [];
  if (motion) {
    defs.push(renderElement("path", [["id", `${id}-motion`], ["d", "M 0 0 L 100 0"]], [], 2));
  }
  if (filters.size > 0) {
    const primitives: string[] = [];
    for (const [name, bucket] of filters) {
      primitives.push(
        renderElement(name, bucket.attributes, bucket.anims.map((anim) => renderAnim(anim, 4)), 3),
      );
    }
    defs.push(renderElement("filter", [["id", `${id}-filter`]], primitives, 2));
  }
  if (stops.size > 0) {
    const stopElements: string[] = [];
    for (const [name, bucket] of stops) {
      stopElements.push(
        renderElement(
          "stop",
          [["id", `${id}-${name}`], ...bucket.attributes],
          bucket.anims.map((anim) => renderAnim(anim, 4)),
          3,
        ),
      );
    }
    defs.push(renderElement("linearGradient", [["id", `${id}-gradient`]], stopElements, 2));
  }
  if (clip) {
    const path = renderElement("path", [["d", clip.d]], clip.anims.map((anim) => renderAnim(anim, 4)), 3);
    defs.push(renderElement("clipPath", [["id", `${id}-clip`]], [path], 2));
  }
  if (mask) {
    const path = renderElement("path", [["d", mask.d]], mask.anims.map((anim) => renderAnim(anim, 4)), 3);
    defs.push(
      renderElement("mask", [["id", `${id}-mask`], ["maskUnits", "userSpaceOnUse"]], [path], 2),
    );
  }

  const attributes: Array<[string, string]> = [["id", id], ...paint];
  const transformValue = staticTransform(transform);
  if (transformValue) attributes.push(["transform", transformValue]);
  if (filters.size > 0) attributes.push(["filter", `url(#${id}-filter)`]);
  if (clip) attributes.push(["clip-path", `url(#${id}-clip)`]);
  if (mask) attributes.push(["mask", `url(#${id}-mask)`]);
  const children = groupAnims.map((anim) => renderAnim(anim, 2));
  if (shape) {
    children.push(renderElement("path", [["id", `${id}-shape`], ["d", shape.d]], shape.anims.map((anim) => renderAnim(anim, 3)), 2));
  }
  return { defs, group: renderElement("g", attributes, children, 1) };
}

function svgDocument(ir: TimelineIr): string {
  const defs: string[] = [];
  const groups: string[] = [];
  for (const node of ir.nodes) {
    const built = buildNode(node, ir.fps, ir.durationInFrames);
    defs.push(...built.defs);
    groups.push(built.group);
  }
  const children: string[] = [];
  if (defs.length > 0) children.push(renderElement("defs", [], defs, 1));
  children.push(...groups);
  return renderElement(
    "svg",
    [
      ["xmlns", "http://www.w3.org/2000/svg"],
      ["width", String(ir.width)],
      ["height", String(ir.height)],
      ["viewBox", `0 0 ${ir.width} ${ir.height}`],
    ],
    children,
    0,
  );
}

function transformType(component: string): string {
  if (component === "translateX" || component === "translateY") return "translate";
  if (component === "scaleX" || component === "scaleY") return "scale";
  return component;
}

/** Compile a timeline IR to one SMIL SVG. Channels are lowered before emit. */
export function compile(ir: TimelineIr, opts?: { backend?: string }): SmilCompileResult {
  if (opts?.backend !== undefined && opts.backend !== "smil") {
    throw new TypeError("compile on the SMIL backend expects backend smil");
  }
  const lowered = lower(ir);
  return {
    schemaVersion: 1,
    schemaRevision: 0,
    id: "smil",
    schema: "svgif.backend/1",
    svg: svgDocument(lowered),
  };
}
