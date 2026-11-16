/**
 * Inline player boot.
 * A saved file mounts the static player, and Studio owning the page stops it.
 * [[sot:svgif/html-project]]
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mountInlinePlayer, playerShouldStart, type PlayerDocument } from "../src/player-boot.ts";
import { STUDIO_MOUNT_FLAG } from "../src/studio-flag.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../../../schema/fixtures/project/v1-valid.json");
const projectText = readFileSync(fixturePath, "utf8");

interface Host {
  id: string;
  innerHTML: string;
  textContent?: string | null;
}

function page(options: { project?: string | null; host?: boolean; studioRoot?: boolean; dataset?: string; attribute?: string; noBody?: boolean; noCreate?: boolean }): {
  doc: PlayerDocument;
  appended: Host[];
  host?: Host;
} {
  const appended: Host[] = [];
  const host: Host | undefined = options.host ? { id: "svgif-preview", innerHTML: "" } : undefined;
  const doc: PlayerDocument = {
    getElementById(id: string) {
      if (id === "studio-root") return options.studioRoot ? { textContent: "" } : null;
      if (id === "svgif-project") return options.project === null ? null : { textContent: options.project ?? projectText };
      if (id === "svgif-preview") return host ?? null;
      return null;
    },
    documentElement: {
      ...(options.dataset !== undefined ? { dataset: { svgifStudio: options.dataset } } : {}),
      ...(options.attribute !== undefined ? { getAttribute: () => options.attribute ?? null } : {}),
    },
    ...(options.noBody ? {} : { body: { append: (node: unknown) => void appended.push(node as Host) } }),
    ...(options.noCreate ? {} : { createElement: () => ({ id: "", innerHTML: "" }) as Host }),
  };
  return { doc, appended, ...(host ? { host } : {}) };
}

describe("playerShouldStart", () => {
  test("starts on a saved file and stops when Studio owns the page", () => {
    expect(playerShouldStart(page({}).doc)).toBe(true);
    expect(playerShouldStart(page({ studioRoot: true }).doc)).toBe(false);
    expect(playerShouldStart(page({ dataset: STUDIO_MOUNT_FLAG }).doc)).toBe(false);
    expect(playerShouldStart(page({ attribute: STUDIO_MOUNT_FLAG }).doc)).toBe(false);
    expect(playerShouldStart(page({ dataset: "placeholder" }).doc)).toBe(true);
    expect(playerShouldStart({ getElementById: () => null })).toBe(true);
  });
});

describe("mountInlinePlayer", () => {
  test("creates the preview host and mounts one static SVG", () => {
    const { doc, appended } = page({});
    expect(mountInlinePlayer(doc)).toBe(true);
    expect(appended.length).toBe(1);
    expect(appended[0]?.id).toBe("svgif-preview");
    const html = appended[0]?.innerHTML ?? "";
    expect(html.includes("<svg")).toBe(true);
    expect(html.includes("<style")).toBe(true);
  });

  test("reuses a preview host that is already on the page", () => {
    const { doc, appended, host } = page({ host: true });
    expect(mountInlinePlayer(doc)).toBe(true);
    expect(appended.length).toBe(0);
    expect(host?.innerHTML.includes("<svg")).toBe(true);
  });

  test("keeps a loop flag when the composition has one", () => {
    const project = JSON.parse(projectText) as { composition: Record<string, unknown> };
    project.composition.loop = true;
    const { doc, appended } = page({ project: JSON.stringify(project) });
    expect(mountInlinePlayer(doc)).toBe(true);
    expect(appended[0]?.innerHTML.includes("<svg")).toBe(true);
  });

  test("does nothing without a project, a body, or a composition", () => {
    expect(mountInlinePlayer(page({ studioRoot: true }).doc)).toBe(false);
    expect(mountInlinePlayer(page({ project: null }).doc)).toBe(false);
    expect(mountInlinePlayer(page({ project: "" }).doc)).toBe(false);
    expect(mountInlinePlayer(page({ noBody: true }).doc)).toBe(false);
    expect(mountInlinePlayer(page({ noCreate: true }).doc)).toBe(false);
    expect(mountInlinePlayer(page({ project: "{}" }).doc)).toBe(false);
    expect(mountInlinePlayer(page({ project: '{"composition":{"nodes":1}}' }).doc)).toBe(false);
  });
});
