/**
 * HTML project file.
 * Save and Export HTML write one document: the identity meta tags and one
 * project script. Play loads a pinned runtime. Edit, and the hash `#edit`,
 * load Studio afterwards. This module does not encode SVG, WebP, WebM, or MP4.
 * GIF is not a release row. The function returns a Blob and does not open a socket.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]] [[sot:svgif/html-project]]
 */

export interface HtmlStudioSri {
  js: string;
  css: string;
}

export interface HtmlRuntime {
  mode: "cdn" | "inline";
  version: string;
  sri: string;
  studioSri: HtmlStudioSri;
}

export interface HtmlProject {
  schemaVersion: 1;
  schemaRevision: 0;
  generator: string;
  runtime: HtmlRuntime;
  composition: Record<string, unknown>;
  provenance: {
    generations: unknown[];
  };
}

export interface HtmlExportOptions {
  /** Public CDN hostname. No scheme and no path. Required for a CDN player or a CDN Studio. */
  cdnHost?: string;
  /** Player source used when `runtime.mode` is `inline`. */
  playerSource?: string;
  /** Studio script inlined when `embedStudio` is true. */
  studioSource?: string;
  /** Studio stylesheet inlined when `embedStudio` is true. */
  studioCss?: string;
  /** Default false. Studio stays on the CDN until this is set. */
  embedStudio?: boolean;
}

export interface HtmlExporter {
  readonly id: "html";
  readonly schema: "svgif.exporter/1";
  export(project: HtmlProject, options?: HtmlExportOptions): Blob;
}

const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const GENERATOR = /^@modootoday\/svgif@(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SRI = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const PROJECT_KEYS = ["schemaVersion", "schemaRevision", "generator", "runtime", "composition", "provenance"];
const RUNTIME_KEYS = ["mode", "version", "sri", "studioSri"];
const STUDIO_SRI_KEYS = ["js", "css"];
const PROVENANCE_KEYS = ["generations"];

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const present = Object.keys(value);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} is required`);
  }
  for (const key of present) {
    if (!keys.includes(key)) throw new TypeError(`${label}.${key} is not allowed`);
  }
}

function assertVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "latest" || !VERSION.test(value)) {
    throw new TypeError(`${label} must be an exact version`);
  }
  return value;
}

function assertSri(value: unknown, label: string): string {
  if (typeof value !== "string" || !SRI.test(value)) {
    throw new TypeError(`${label} must be a subresource integrity digest`);
  }
  return value;
}

function assertHost(value: string): string {
  if (!HOST.test(value)) throw new TypeError("cdnHost must be a hostname");
  return value;
}

function assertProject(value: unknown): HtmlProject {
  const project = assertObject(value, "project");
  exactKeys(project, PROJECT_KEYS, "project");
  if (project.schemaVersion !== 1) throw new TypeError("project.schemaVersion must be 1");
  if (project.schemaRevision !== 0) throw new TypeError("project.schemaRevision must be 0");
  if (typeof project.generator !== "string" || !GENERATOR.test(project.generator)) {
    throw new TypeError("project.generator must name @modootoday/svgif and an exact version");
  }
  const runtime = assertObject(project.runtime, "project.runtime");
  exactKeys(runtime, RUNTIME_KEYS, "project.runtime");
  if (runtime.mode !== "cdn" && runtime.mode !== "inline") {
    throw new TypeError("project.runtime.mode must be cdn or inline");
  }
  assertVersion(runtime.version, "project.runtime.version");
  assertSri(runtime.sri, "project.runtime.sri");
  const studioSri = assertObject(runtime.studioSri, "project.runtime.studioSri");
  exactKeys(studioSri, STUDIO_SRI_KEYS, "project.runtime.studioSri");
  assertSri(studioSri.js, "project.runtime.studioSri.js");
  assertSri(studioSri.css, "project.runtime.studioSri.css");
  const composition = assertObject(project.composition, "project.composition");
  const provenance = assertObject(project.provenance, "project.provenance");
  exactKeys(provenance, PROVENANCE_KEYS, "project.provenance");
  if (!Array.isArray(provenance.generations)) {
    throw new TypeError("project.provenance.generations must be an array");
  }
  return {
    schemaVersion: 1,
    schemaRevision: 0,
    generator: project.generator,
    runtime: {
      mode: runtime.mode,
      version: runtime.version as string,
      sri: runtime.sri as string,
      studioSri: {
        js: studioSri.js as string,
        css: studioSri.css as string,
      },
    },
    composition,
    provenance: { generations: provenance.generations },
  };
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function hideScriptEnd(value: string): string {
  return value.replaceAll(/<\/script/gi, "<\\/script");
}

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cdnFile(host: string, version: string, file: string): string {
  return `https://${host}/svgif/${version}/${file}`;
}

function nonEmpty(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
  return value;
}

function studioBootstrap(embedStudio: boolean, jsUrl: string, cssUrl: string, jsSri: string, cssSri: string): string {
  const load = embedStudio
    ? [
        '    var cssNode = document.getElementById("svgif-studio-css");',
        '    var jsNode = document.getElementById("svgif-studio-source");',
        '    var style = document.createElement("style");',
        '    style.textContent = cssNode ? cssNode.textContent : "";',
        "    document.head.appendChild(style);",
        '    var script = document.createElement("script");',
        '    script.id = "svgif-studio";',
        '    script.text = jsNode ? jsNode.textContent : "";',
        "    document.body.appendChild(script);",
      ]
    : [
        '    var link = document.createElement("link");',
        '    link.rel = "stylesheet";',
        `    link.href = ${JSON.stringify(cssUrl)};`,
        `    link.integrity = ${JSON.stringify(cssSri)};`,
        '    link.crossOrigin = "anonymous";',
        "    document.head.appendChild(link);",
        '    var script = document.createElement("script");',
        '    script.id = "svgif-studio";',
        `    script.src = ${JSON.stringify(jsUrl)};`,
        `    script.integrity = ${JSON.stringify(jsSri)};`,
        '    script.crossOrigin = "anonymous";',
        "    document.body.appendChild(script);",
      ];
  return [
    "<script>",
    "(function () {",
    "  var loaded = false;",
    "  function loadStudio() {",
    "    if (loaded) return;",
    "    loaded = true;",
    ...load,
    "  }",
    '  var button = document.getElementById("svgif-edit");',
    '  if (button) button.addEventListener("click", loadStudio);',
    '  if (location.hash === "#edit") loadStudio();',
    "})();",
    "</script>",
  ].join("\n");
}

function renderDocument(project: HtmlProject, options: HtmlExportOptions): string {
  const embedStudio = options.embedStudio === true;
  const needsHost = project.runtime.mode === "cdn" || !embedStudio;
  const host = needsHost ? assertHost(nonEmpty(options.cdnHost, "cdnHost")) : "";
  const version = project.runtime.version;
  const player = project.runtime.mode === "inline"
    ? `<script type="module" id="svgif-player">${hideScriptEnd(nonEmpty(options.playerSource, "playerSource"))}</script>`
    : `<script type="module" id="svgif-player" src="${attribute(cdnFile(host, version, "svgif.mjs"))}" integrity="${attribute(project.runtime.sri)}" crossorigin="anonymous"></script>`;
  const studio = embedStudio
    ? [
        `<script type="text/plain" id="svgif-studio-css">${hideScriptEnd(nonEmpty(options.studioCss, "studioCss"))}</script>`,
        `<script type="text/plain" id="svgif-studio-source">${hideScriptEnd(nonEmpty(options.studioSource, "studioSource"))}</script>`,
      ].join("\n")
    : "";
  const studioJs = host ? cdnFile(host, version, "studio.js") : "";
  const studioCss = host ? cdnFile(host, version, "studio.css") : "";
  const parts = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta name="svgif:schema" content="${attribute(String(project.schemaVersion))}">`,
    `<meta name="svgif:revision" content="${attribute(String(project.schemaRevision))}">`,
    `<meta name="svgif:generator" content="${attribute(project.generator)}">`,
    "<title>svgif</title>",
    "</head>",
    "<body>",
    `<script id="svgif-project" type="application/vnd.svgif.project+json">${jsonForScript(project)}</script>`,
    '<button type="button" id="svgif-edit">Edit</button>',
    player,
    ...(studio === "" ? [] : [studio]),
    studioBootstrap(embedStudio, studioJs, studioCss, project.runtime.studioSri.js, project.runtime.studioSri.css),
    "</body>",
    "</html>",
  ];
  return `${parts.join("\n")}\n`;
}

/** Write the HTML project file. The bytes are the project schema plus the meta tags. */
export function exportHtml(project: HtmlProject, options: HtmlExportOptions = {}): Blob {
  const document = assertProject(project);
  const html = renderDocument(document, options);
  return new Blob([html], { type: "text/html" });
}

export const htmlExporter: HtmlExporter = {
  id: "html",
  schema: "svgif.exporter/1",
  export(project: HtmlProject, options?: HtmlExportOptions): Blob {
    return exportHtml(project, options);
  },
};
