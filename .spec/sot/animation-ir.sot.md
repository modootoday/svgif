---
id: sot:svgif/animation-ir
title: Timeline and keyframe IR
status: active
created: 2026-11-10
updated: 2026-11-10T18:45:00Z
verify: manual
tags: [ir, animation]
rel:
  depends_on:
    - sot:svgif/architecture
    - adr:svgif/20261110173419
    - adr:svgif/20261110181452
---

# Timeline and keyframe IR

## Rule

One IR compiles to every backend. Backends do not invent a second timeline.

### Document

```json
{
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "durationInFrames": 90,
  "nodes": [
    {
      "id": "s-n0",
      "tracks": [
        {
          "property": "transform.translateX",
          "keys": [
            { "frame": 0, "value": 0 },
            { "frame": 30, "value": 120, "easing": "cubic-bezier(0.2,0,0,1)" }
          ]
        }
      ]
    }
  ]
}
```

1. `property` is a dotted path. Core paths: `transform.translateX|Y`, `transform.rotate`, `transform.scaleX|Y`, `transform.matrix` (2D affine `a b c d e f`), `attr.d`, `attr.opacity`, `attr.fill`, `attr.stroke`, `attr.offsetDistance`, `filter.<primitive>.<attribute>`, `gradient.x1|y1|x2|y2`, `gradient.<stop>.offset|stop-color|stop-opacity`, `clip` and `mask` as references plus their geometry tracks.
2. A key holds `frame` (integer), `value` (number, string, or number array), and optional `easing` applied on the span that ends at that key. The first key's easing is ignored.
3. Easing tokens: `linear`, `hold`, CSS cubic-bezier strings, and `spring` (the clock's discrete spring, sampled into numeric keys before a backend that cannot host a solver). SMIL receives `keySplines` only after the compiler converts a cubic-bezier. `hold` becomes CSS `steps(1,end)` or SMIL `calcMode="discrete"`.
4. Sampling: `sample(ir, frame) -> node map of concrete values`. Frame is clamped to `0 .. durationInFrames-1` for export. The player may request the same clamp.
5. Path morphing (`attr.d`) is legal only when both key values have the same command list and the same argument counts. Otherwise the span is `hold` and the compiler records a diagnostic. No automatic point insertion in v1.
6. 3D motion is not an IR property. The projector emits 2D keys (`attr.d`, fills, transforms) through `bake`. Backends never see a camera. [[adr:svgif/20261110120400]]
7. Sequences in the authoring API are flattened into absolute frames before compile. The IR has one duration and absolute frames, so SMIL `begin` and CSS `animation-delay` share one zero.
8. A motion preset is a block of tracks. Frames in that block are relative to the apply point. Applying the preset writes those keys onto the selected node's tracks as absolute frames, with the apply frame as frame 0 of the block. The document still has one timeline per node. `sample(ir, frame)` reads the tracks after that write. It does not sample a preset as a second clock. [[adr:svgif/20261110173419]]
9. Placing a component preset creates one scene node on the artboard. When that preset includes a motion preset, applying it writes that block onto the new node's tracks at the apply frame, with the apply frame as frame 0 of the block. The document still has one timeline per node. `sample(ir, frame)` reads the tracks after that write. It does not sample the preset as a second clock. [[adr:svgif/20261110181452]]

## Why

Filters, motion paths, masks, gradients and transforms are the same kind of keyed channel. A special case per feature would fork the compilers. A motion preset is that same channel written onto the node that receives it, so the compilers still see one timeline. A component preset that includes a motion preset still writes that block onto the one new node's tracks.

## Verification

`WP-IR` tests: sample at a key frame returns the key; sample midway on a linear span returns the midpoint; a mismatched `attr.d` span is `hold`; a spring sampled twice at the same frame matches bitwise after C6 quantization. The motion-preset rule is this record. After the write, the same `sample(ir, frame)` call reads that node's tracks. The sampler does not take a preset as an input. `WP-PRESET-APPLY` is this record. Placing a component preset creates one scene node. When that preset includes a motion preset, the write lands on that node's tracks at the apply frame, and the same `sample(ir, frame)` call reads those tracks.
