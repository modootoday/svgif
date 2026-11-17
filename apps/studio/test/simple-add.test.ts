import { describe, expect, test } from "bun:test";
import { createEditor, seedBlankShape } from "../src/composition.ts";
import { addSimpleElement, removeSelected, selectionName, starPath, startBlank } from "../src/simple-add.ts";
import { applyTemplate, templateThumb, type TemplateDef } from "../src/templates.ts";

const design: TemplateDef = {
  file: "card.json",
  label: "Card",
  width: 640,
  height: 360,
  colors: [{ label: "Night", backdrop: "#101820", ink: "#ffffff" }],
  nodes: [
    { role: "badge", label: "Badge", paint: "backdrop", tracks: [{ property: "attr.d", keys: [{ frame: 0, value: "M 0 0 H 640 V 360 H 0 Z" }] }] },
    {
      role: "words",
      label: "Words",
      text: "Hi & bye",
      fontSize: 48,
      align: "center",
      paint: "ink",
      tracks: [
        { property: "transform.translateX", keys: [{ frame: 0, value: 200 }] },
        { property: "transform.translateY", keys: [{ frame: 0, value: 200 }] },
      ],
    },
  ],
};

describe("simple picture edits", () => {
  test("added words, shape, and icon are selected and named in plain words", () => {
    const state = createEditor();
    const words = addSimpleElement(state, "words");
    expect(state.selection).toEqual([words.id]);
    expect(state.texts[words.id]).toBe("Words");
    expect(state.wordAlign[words.id]).toBe("center");
    expect(words.tracks.some((track) => track.property === "attr.d")).toBe(false);
    expect(selectionName(state)).toBe("Words");
    const shape = addSimpleElement(state, "shape");
    const icon = addSimpleElement(state, "icon");
    const again = addSimpleElement(state, "icon");
    expect(state.labels[shape.id]).toBe("Shape");
    expect(state.labels[icon.id]).toBe("Icon");
    expect(state.labels[again.id]).toBe("Icon 2");
    expect(new Set([words.id, shape.id, icon.id, again.id]).size).toBe(4);
    expect(selectionName(state)).toBe("Icon 2");
  });

  test("words added to a start take the start's ink", () => {
    const state = createEditor();
    applyTemplate(state, design);
    const words = addSimpleElement(state, "words");
    const fill = words.tracks.find((track) => track.property === "attr.fill")?.keys[0]?.value;
    expect(fill).toBe("#ffffff");
  });

  test("remove drops the node and every record that names it", () => {
    const state = createEditor();
    applyTemplate(state, design);
    const id = state.selection[0] ?? "";
    expect(state.texts[id]).toBeDefined();
    expect(removeSelected(state)).toBe(1);
    expect(state.composition.nodes.some((node) => node.id === id)).toBe(false);
    for (const record of [state.labels, state.texts, state.paints, state.wordAlign, state.wordScale]) {
      expect(Object.hasOwn(record, id)).toBe(false);
    }
    expect(state.selection).toEqual([]);
    expect(selectionName(state)).toBe("");
    expect(removeSelected(state)).toBe(0);
  });

  test("blank keeps length, loop, speed, and delay, and seeds one shape", () => {
    const state = createEditor();
    applyTemplate(state, design);
    state.composition.durationInFrames = 120;
    state.composition.loop = true;
    state.motionSpeed = "faster";
    startBlank(state, seedBlankShape);
    expect(state.startFile).toBe("");
    expect(state.composition.nodes.length).toBe(1);
    expect(state.composition.durationInFrames).toBe(120);
    expect(state.composition.loop).toBe(true);
    expect(state.motionSpeed).toBe("faster");
    expect(Object.keys(state.paints)).toEqual([]);
  });

  test("the star has ten points and closes", () => {
    const d = starPath(100, 100, 40);
    expect(d.match(/[ML]/g)?.length).toBe(10);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.startsWith("M 100 60")).toBe(true);
  });
});

describe("start pictures", () => {
  test("a thumbnail draws the first color and shows words as a bar, not as text", () => {
    const svg = templateThumb(design);
    expect(svg).toContain('viewBox="0 0 640 360"');
    expect(svg).toContain('fill="#101820"');
    expect(svg).toContain("<rect x=\"200\"");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("Hi &");
  });
});
