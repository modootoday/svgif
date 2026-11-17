import { describe, expect, test } from "bun:test";
import { addElement, createEditor, setKeyframe } from "../src/composition.ts";
import { exportSupport } from "../src/export-support.ts";
import { inspectorMarkup, layerListMarkup, propertyName, shellMarkup, timelineMarkup } from "../src/shell-markup.ts";

const RAW = /transform\.|attr\.|cubic-bezier\(|\bf\d+\b/;

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Advanced mode words", () => {
  test("animated properties read as plain words, with the stored name in a tooltip", () => {
    expect(propertyName("transform.translateX")).toBe("Position X");
    expect(propertyName("attr.d")).toBe("Outline");
    expect(propertyName("attr.opacity")).toBe("Opacity");
    expect(propertyName("filter.blur.stdDeviation")).toBe("Std deviation");
    const state = createEditor();
    const node = addElement(state, "rectangle");
    setKeyframe(state, node.id, "transform.translateX", 4, 12);
    setKeyframe(state, node.id, "transform.translateX", 8, 40, "cubic-bezier(0.4, 0, 0.2, 1)");
    const open = timelineMarkup(state, { node: node.id, property: "transform.translateX", frame: 8 });
    expect(visibleText(open)).not.toMatch(RAW);
    expect(open).toContain(">Smooth<");
    expect(open).toContain('title="transform.translateX"');
  });

  test("the layer list puts the front of the picture at the top", () => {
    const state = createEditor();
    const back = addElement(state, "rectangle");
    const front = addElement(state, "ellipse");
    const markup = layerListMarkup(state);
    expect(markup.indexOf(`data-select="${front.id}"`)).toBeLessThan(markup.indexOf(`data-select="${back.id}"`));
    expect(markup).toContain('aria-label="Bring forward"');
    expect(markup).not.toContain(">Up<");
  });

  test("the properties panel leads with the selection and keeps the canvas in its own section", () => {
    const state = createEditor();
    expect(inspectorMarkup(state)).toContain("Start here");
    expect(inspectorMarkup(state)).toContain("<details class=\"canvas-settings\" open>");
    const node = addElement(state, "rectangle");
    state.selection = [node.id];
    const markup = inspectorMarkup(state);
    expect(markup.indexOf("Layer name")).toBeLessThan(markup.indexOf("Canvas width"));
    expect(markup).toContain('type="color"');
    expect(markup).toContain("<details class=\"canvas-settings\">");
    expect(visibleText(markup.replace(/<details class="raw-keys">[\s\S]*?<\/details>/, ""))).not.toMatch(RAW);
  });

  test("the shell has no bare abbreviations and groups export by what it makes", () => {
    const html = shellMarkup(exportSupport());
    for (const word of [">Lib<", ">Ins<", ">H<", "Sheet 40", ">Collapse<", "Key at frame", "Search presets"]) {
      expect(html).not.toContain(word);
    }
    for (const group of ['aria-label="Video"', 'aria-label="Image"', 'aria-label="Web page"']) expect(html).toContain(group);
    expect(html).toContain('id="export-close"');
    expect(html).toContain("<summary>Format details for this browser</summary>");
  });
});

describe("Advanced motion placement", () => {
  test("a motion's position keys end on the layer's resting place", async () => {
    const { applyMotionPreset } = await import("../src/presets.ts");
    const state = createEditor();
    const node = addElement(state, "rectangle");
    setKeyframe(state, node.id, "transform.translateY", 0, 40);
    applyMotionPreset(
      state,
      {
        motionPreset: {
          tracks: [
            { property: "transform.translateY", keys: [{ frame: 0, value: 106 }, { frame: 18, value: 90 }] },
            { property: "attr.opacity", keys: [{ frame: 0, value: 0 }, { frame: 18, value: 1 }] },
          ],
        },
      },
      node.id,
    );
    const keys = node.tracks.find((track) => track.property === "transform.translateY")?.keys ?? [];
    expect(keys.map((key) => key.value)).toEqual([56, 40]);
  });
});
