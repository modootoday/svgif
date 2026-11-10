/**
 * The HTML blob matches the project schema and the identity meta tags.
 * The package does not open a socket and does not encode another codec.
 * [[sot:svgif/studio-export]] [[adr:svgif/20261110121100]] [[sot:svgif/html-project]]
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContract } from "../../../scripts/ci/check-schema.mjs";
import { exportHtml, htmlExporter, type HtmlProject } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as HtmlProject;
const host = "cdn.example.invalid";

const BANNED = ["WebSocket", "XMLHttpRequest", "fetch(", "node:http", "node:https", "node:net", "Date", "performance.now", "Math.random"];

function cloneProject(): HtmlProject {
  return JSON.parse(JSON.stringify(fixture)) as HtmlProject;
}

function scripts(html: string): { attrs: string; body: string }[] {
  const found: { attrs: string; body: string }[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let match = pattern.exec(html);
  while (match) {
    found.push({ attrs: match[1] ?? "", body: match[2] ?? "" });
    match = pattern.exec(html);
  }
  return found;
}

function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return match?.[1];
}

function meta(html: string, name: string): string | undefined {
  const match = new RegExp(`<meta name="${name}" content="([^"]*)">`).exec(html);
  return match?.[1];
}

describe("exportHtml", () => {
  test("validates the project script and the identity meta tags", async () => {
    const project = cloneProject();
    const before = JSON.stringify(project);
    const blob = exportHtml(project, { cdnHost: host });
    expect(JSON.stringify(project)).toBe(before);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type.replace(/;charset=utf-8$/i, "")).toBe("text/html");
    const html = await blob.text();
    expect(meta(html, "svgif:schema")).toBe(String(project.schemaVersion));
    expect(meta(html, "svgif:revision")).toBe(String(project.schemaRevision));
    expect(meta(html, "svgif:generator")).toBe(project.generator);
    const blocks = scripts(html);
    const payload = blocks.filter((block) => attr(block.attrs, "id") === "svgif-project");
    expect(payload).toHaveLength(1);
    expect(attr(payload[0]?.attrs ?? "", "type")).toBe("application/vnd.svgif.project+json");
    const parsed = JSON.parse(payload[0]?.body ?? "") as HtmlProject;
    expect(parsed).toEqual(project);
    expect(validateContract("project", parsed)).toEqual([]);
    expect(html.includes('id="svgif-edit">Edit</button>')).toBe(true);
    expect(html.includes('location.hash === "#edit"')).toBe(true);
    const player = blocks.find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(player).toBeDefined();
    expect(attr(player?.attrs ?? "", "src")).toBe(`https://${host}/svgif/${project.runtime.version}/svgif.mjs`);
    expect(attr(player?.attrs ?? "", "integrity")).toBe(project.runtime.sri);
    expect(attr(player?.attrs ?? "", "crossorigin")).toBe("anonymous");
    expect(html.includes(`https://${host}/svgif/${project.runtime.version}/studio.js`)).toBe(true);
    expect(html.includes(`https://${host}/svgif/${project.runtime.version}/studio.css`)).toBe(true);
    expect(html.includes("/svgif/latest/")).toBe(false);
    expect(htmlExporter.id).toBe("html");
    expect(htmlExporter.schema).toBe("svgif.exporter/1");
    expect(await htmlExporter.export(project, { cdnHost: host }).text()).toBe(html);
  });

  test("keeps a script-closing string inside the project JSON", async () => {
    const project = cloneProject();
    const composition = project.composition as {
      nodes: { tracks: { keys: { value: unknown }[] }[] }[];
    };
    const marker = "</script><script>alert(1)</script>";
    const key = composition.nodes[0]?.tracks[0]?.keys[0];
    if (!key) throw new Error("fixture key missing");
    key.value = marker;
    const html = await exportHtml(project, { cdnHost: host }).text();
    expect(html.includes("</script><script>")).toBe(false);
    const payload = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-project");
    const parsed = JSON.parse(payload?.body ?? "") as HtmlProject;
    const parsedKey = (parsed.composition as typeof composition).nodes[0]?.tracks[0]?.keys[0];
    expect(parsedKey?.value).toBe(marker);
    expect(validateContract("project", parsed)).toEqual([]);
  });

  test("inlines the player and can inline Studio", async () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    const html = await exportHtml(project, {
      playerSource: "const player = 1;\n",
      embedStudio: true,
      studioSource: "const studio = 1;\n",
      studioCss: "button { color: canvastext; }\n",
    }).text();
    const player = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(attr(player?.attrs ?? "", "src")).toBeUndefined();
    expect(player?.body).toContain("const player = 1;");
    expect(html.includes("svgif.mjs")).toBe(false);
    expect(html.includes("studio.js")).toBe(false);
    expect(html.includes('id="svgif-studio-source"')).toBe(true);
    expect(html.includes("const studio = 1;")).toBe(true);
    expect(html.includes("button { color: canvastext; }")).toBe(true);
  });

  test("escapes an inline player that contains a script end tag", async () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    const html = await exportHtml(project, {
      cdnHost: host,
      playerSource: "const end = '</script>';\n",
    }).text();
    expect(html.includes("'<\\/script>'")).toBe(true);
    const player = scripts(html).find((block) => attr(block.attrs, "id") === "svgif-player");
    expect(player?.body).toContain("const end");
  });

  test("rejects a document that is not revision 0", () => {
    const project = cloneProject();
    (project as { schemaRevision: number }).schemaRevision = 1;
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/schemaRevision/);
  });

  test("rejects a floating runtime version and a missing host", () => {
    const project = cloneProject();
    project.runtime.version = "latest";
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/exact version/);
    const again = cloneProject();
    expect(() => exportHtml(again)).toThrow(/cdnHost/);
    expect(() => exportHtml(again, { cdnHost: "https://cdn.example.invalid/svgif" })).toThrow(/hostname/);
  });

  test("rejects inline playback without player bytes and embedded Studio without sources", () => {
    const project = cloneProject();
    project.runtime.mode = "inline";
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/playerSource/);
    expect(() => exportHtml(project, { playerSource: "ok", embedStudio: true })).toThrow(/studioCss/);
  });

  test("rejects a generator that is not this package", () => {
    const project = cloneProject();
    project.generator = "other@1.0.0";
    expect(() => exportHtml(project, { cdnHost: host })).toThrow(/generator/);
  });

  test("rejects a project that cannot carry the meta tags", () => {
    expect(() => exportHtml(null as unknown as HtmlProject, { cdnHost: host })).toThrow(/object/);
    const extra = cloneProject() as HtmlProject & { extra?: boolean };
    extra.extra = true;
    expect(() => exportHtml(extra, { cdnHost: host })).toThrow(/not allowed/);
    const sri = cloneProject();
    sri.runtime.sri = "nope";
    expect(() => exportHtml(sri, { cdnHost: host })).toThrow(/integrity/);
    const mode = cloneProject();
    (mode.runtime as { mode: string }).mode = "file";
    expect(() => exportHtml(mode, { cdnHost: host })).toThrow(/mode/);
    const generations = cloneProject();
    (generations.provenance as { generations: unknown }).generations = {};
    expect(() => exportHtml(generations, { cdnHost: host })).toThrow(/generations/);
  });

  test("does not ship another codec and does not open a socket", () => {
    const files = readdirSync(srcDir).sort();
    expect(files).toEqual(["html.ts", "index.ts"]);
    const source = files.map((file) => readFileSync(resolve(srcDir, file), "utf8")).join("\n");
    for (const token of BANNED) expect(source.includes(token)).toBe(false);
    expect(source.includes('id: "html"')).toBe(true);
    expect(source.includes("GIF is not a release row")).toBe(true);
  });
});
