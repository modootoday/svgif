---
id: sot:svgif/preset-registry
title: Preset registry
status: active
created: 2026-11-10T18:31:54Z
updated: 2026-11-10T22:51:00Z
rel:
  governs: [schema/preset]
  depends_on: [adr:svgif/20261110181452, sot:svgif/licensing, sot:svgif/schema-versioning]
tags: [schema, milestone-0]
verify: [node scripts/ci/check-presets.mjs]
---

# Preset registry

## Rule

A component preset is one document in a registry with no maximum count. The registry grows by adding files. Studio does not keep a list of preset ids. Adding a file or a directory requires no Studio code change. [[adr:svgif/20261110181452]]

### Document

The document is `schema/preset/v1.schema.json`. Its `$id` is `https://thumly.io/schema/svgif/preset/v1.schema.json`. `schemaVersion` is 1 and `schemaRevision` is 0.

The document composes the component definition and the motion-preset definition with `$ref`. It does not copy those schemas. `component` references `https://thumly.io/schema/svgif/component/v1.schema.json`. `motionPreset` references `https://thumly.io/schema/svgif/motion-preset/v1.schema.json` and is optional. A preset with no motion preset is valid.

`parameters` holds the default parameter values. The list has no maximum count. There is no quantity limit inside a category.

A preset declares looping with the parameter `{ "name": "loop", "value": true }`. The preset document has no top-level `loop` field. The generator copies that boolean onto `loop` on the timeline IR. Absent, or any value other than boolean true, means the timeline does not loop. The published package and Studio do not turn a preset document into a timeline. `compile()` reads the timeline field.

A motion-preset track property `filter.x`, `filter.y`, `filter.width`, or `filter.height` sets that attribute on the `<filter>` element. `filter.<primitive>.<attribute>` still sets that attribute on the primitive. A property that is not one of those four filter-element names, and not a primitive key, stays invalid. The preset document has no top-level field for these keys.

A preset omits the baked demo subject and ground with the parameter `{ "name": "scene", "value": false }`. Absent, or any other value, keeps the subject and ground. A category does not decide this. The preset document has no top-level `scene` field.

`id` is a stable lowercase kebab slug, unique across the registry, matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

`category` matches the same slug pattern. It is not an enum. `later` and `out` are not categories.

### Paths

A preset file lives at `presets/<category>/<id>.json`. `category` is the directory name. `id` is the file name without `.json`. A new category is a new directory.

The golden file is `presets/<category>/<id>.golden.svg`. This package does not render that file.

### Categories

Categories derive from `schema/catalogue/components.v1.json`. This record does not copy those rows. A catalogue category is a preset directory for the types in that category. The directory is `presets/<category>/`. A schema-valid preset for one v1 type in that directory is `presets/<category>/<kebab>.json`, with `presets/<category>/<kebab>.golden.svg` beside it. The kebab form inserts a hyphen before each capital, turns dots into hyphens, and lowercases. `mask.rect` is `mask-rect`. `audio.eqBars` is `audio-eq-bars`. The preset `category` is the directory name. The preset `id` is that kebab. The v1 type id remains the `component.id`.

A v1 type id is also an addressable preset directory under `presets/<id>/`, with no quantity limit. A preset file there is `presets/<id>/<preset-id>.json`. The golden render is `presets/<id>/<preset-id>.golden.svg`. Adding a preset file does not require a code change. A directory that is neither a v1 type id nor a catalogue category is not a category. `later` and `out` are not categories.

### Determinism

The document has no unseeded random source. The same preset at the same integer frame is byte-stable. The golden file is the evidence of that render.

### Authoring

Frame 0 is the true start state, with nothing revealed unless the type says otherwise.

The frame-0 state is visible in the SVG markup with the CSS removed. A clip, a mask, or an opacity that exists only in a stylesheet is not the frame-0 state.

Geometric motion defaults to non-linear easing. The motion-preset schema accepts `spring` and `cubic-bezier(...)`. `linear` is for a type that says the move is linear.

The motion is visible at native size. Travel is meaningful. A change of about 2px is not the motion. A wipe or an iris travels across the frame. A filter moves by enough pixels to see.

A mask or a clip reveals content that differs from the mask or clip shape. The moving outline is not the only shape in the frame.

The motion tempo matches the declared bpm.

Beat or hit motion uses a fast-attack ease-out with a slower decay. One symmetric curve is not that pair.

Growth motion scales from its anchor. The anchor is the baseline or the inner radius. It is not a translation of the whole shape.

Non-text graphics have at least 3:1 contrast against their background.

The end frame keeps its subject fully in frame and composed. An accent is not clipped at the edge.

A shake or an impulse starts and ends at rest, and the offset decays.

Every declared parameter has a visible effect in the golden.

Every golden is reproducible. The committed generator renders it from the preset file plus the shared demo fixture. A hand-drawn golden is not evidence.

Entrance or settle motion animates the whole component as one wrapper, unless the type needs per-part motion. Translucent layers must not show the parts underneath.

A preset's own artwork does not paint an opaque full-bleed stage. The stage belongs to the shared demo fixture. The preset stays transparent so it sits on a dark page.

The review and the golden check sample a mid frame and the last frame with CSS active. A frame-0 markup check is not that review.

The end state of a reveal covers its target fully.

A preset-authoring assignment cites these rules. That includes every later wave. An assignment that is already `assigned` is not rewritten. The review of its goldens uses these rules.

### License

A preset file under `presets/` is covered by the repository license. [[sot:svgif/licensing]]

## Why

A closed list of preset ids would require a Studio change for every new file. The registry stays a directory of documents, so a new preset or a new category is a new file. [[adr:svgif/20261110181452]]

## Verification

`node scripts/ci/check-presets.mjs` walks `presets/`, validates every preset file, and does not contain a list of ids. Zero files is a pass. A file that fails the schema is a failure. When `scripts/ci/preset-coverage.mjs` exists, the walk calls it and does not turn a coverage gap into a failure. That coverage check counts a catalogue-category directory the same way [[sot:svgif/component-catalogue]] describes, and it still counts `presets/<id>/`. `node scripts/ci/check-presets.mjs --goldens` regenerates every golden from the preset plus the shared demo fixture and fails on any diff. That flag is the golden check. It is not part of the default walk until the committed goldens come from the generator. `node scripts/ci/check-schema.mjs` checks this contract and its fixture hash. `spec check` resolves this id.
