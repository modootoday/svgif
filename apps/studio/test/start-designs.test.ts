import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createEditor } from "../src/composition.ts";
import { contrastRatio, ICON_CONTRAST_MINIMUM, TEXT_CONTRAST_MINIMUM } from "../src/contrast.ts";
import { pathBounds } from "../src/direct.ts";
import { applyTemplate, applyTemplateColor, resolvedInk, templatesFromDocuments, wordFitBox, type TemplateDef } from "../src/templates.ts";

const dir = join(import.meta.dir, "..", "templates");

function readDesigns(): TemplateDef[] {
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as unknown;
  const files: Record<string, unknown> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    files[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
  }
  return templatesFromDocuments(index, files);
}

function firstPath(design: TemplateDef, paint: "backdrop" | "ink", essential: boolean) {
  const node = design.nodes.find((item) => item.paint === paint && (item.essential === true) === essential && item.text === undefined);
  const d = node?.tracks.find((track) => track.property === "attr.d")?.keys[0]?.value;
  return typeof d === "string" ? pathBounds(d) : null;
}

describe("starting designs", () => {
  const designs = readDesigns();

  test("every listed file is a design, and each one has its own name", () => {
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as { files: string[] };
    expect(designs.map((design) => design.file)).toEqual(index.files);
    expect(designs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(designs.map((design) => design.label)).size).toBe(designs.length);
  });

  for (const design of designs) {
    test(`${design.label}: every color keeps the words and the mark readable`, () => {
      expect(design.colors.length).toBeGreaterThanOrEqual(2);
      expect(new Set(design.colors.map((color) => color.label)).size).toBe(design.colors.length);
      for (const color of design.colors) {
        const ink = resolvedInk(color);
        expect(ink).toBe(color.ink);
        expect(contrastRatio(ink, color.backdrop)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MINIMUM);
        expect(contrastRatio(ink, color.backdrop)).toBeGreaterThanOrEqual(ICON_CONTRAST_MINIMUM);
      }
    });

    test(`${design.label}: words have room beside the mark, inside the card`, () => {
      const backdrop = firstPath(design, "backdrop", false);
      const mark = firstPath(design, "ink", true);
      if (!backdrop || !mark) throw new Error(`${design.label} needs a backdrop and an essential mark`);
      const box = wordFitBox(backdrop, [mark]);
      if (!box) throw new Error(`${design.label} leaves no room for words`);
      expect(box.width).toBeGreaterThanOrEqual(backdrop.width / 2);
      expect(box.height).toBeGreaterThanOrEqual(64);
      expect(mark.x).toBeGreaterThanOrEqual(backdrop.x);
      expect(mark.y).toBeGreaterThanOrEqual(backdrop.y);
      expect(mark.x + mark.width).toBeLessThanOrEqual(backdrop.x + backdrop.width);
      expect(mark.y + mark.height).toBeLessThanOrEqual(backdrop.y + backdrop.height);
    });

    test(`${design.label}: applying selects the words, and each color repaints them`, () => {
      const state = createEditor();
      const words = applyTemplate(state, design);
      if (!words) throw new Error(`${design.label} has no words`);
      expect(state.selection).toEqual([words.id]);
      expect(state.texts[words.id]?.length).toBeGreaterThan(0);
      for (let index = 0; index < design.colors.length; index += 1) {
        expect(applyTemplateColor(state, design, index)).toBe(true);
        const fill = words.tracks.find((track) => track.property === "attr.fill")?.keys[0]?.value;
        expect(fill).toBe(resolvedInk(design.colors[index] ?? design.colors[0]!));
      }
    });
  }
});
