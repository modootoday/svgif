---
id: sot:svgif/preset-registry
title: Preset registry
status: active
created: 2026-11-10T18:31:54Z
updated: 2026-11-11T05:50:00Z
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

A type marked `ambient` in the motion class sets that loop parameter. The frame after the last frame matches frame 0, so 0 percent of the pixels change. A ping-pong keeps the first key of its main track equal to the last key. A one-period drift may end one period away from its first key when that pixel wrap holds. A wrap that changes pixels fails. A beat that is not also ambient does not require the loop parameter, and the `dur + 0.1s` sample does not run on it.

A golden over 16 KB fails unless the preset declares `{ "name": "sizeReason", "value": "<why>" }`. That parameter is not a top-level field. The value is a short English clause.

A motion-preset track property `filter.x`, `filter.y`, `filter.width`, or `filter.height` sets that attribute on the `<filter>` element. `filter.<primitive>.<attribute>` still sets that attribute on the primitive. A property that is not one of those four filter-element names, and not a primitive key, stays invalid. The preset document has no top-level field for these keys.

A preset omits the baked demo subject and ground with the parameter `{ "name": "scene", "value": false }`. A preset the motion class marks as the subject itself uses that omission when the parameter is absent. The marked categories are `dataviz`, `text`, `creatures`, and `audio`, plus the nature atmosphere ids and the full-frame transition ids in the class file. `backgrounds` is not marked, so the subject stays and a pattern can be read over it. The full-frame transition list starts empty. An explicit `{ "name": "scene", "value": true }` keeps the subject in the generator and does not waive the golden check. A marked golden that still contains a fixture face id, `subject-f` or `ground-f`, fails, because that face is still painted on the last frame. A string or a number does not omit the scene. The preset document has no top-level `scene` field.

The generator drops a fixture face that stays at opacity 0 for every frame. A clip or a mask that reveals the face keeps it. A golden that still contains such a face fails.

### Artwork fields

`copied.strokeWidth`, `copied.ink`, and `copied.layers` live on the component document inside the preset. None of them is a top-level preset field. `schemaVersion` stays 1 and `schemaRevision` stays 0.

`copied.strokeWidth` is a number. The generator writes it as `attr.strokeWidth` on each emitted artwork node. Absent means that node has no stroke width.

`copied.ink` is one object with `d` and `fill`. The generator emits that path as a second child of the same wrapper as the body path, with that fill and no stroke. The body path keeps `copied.fill`, `copied.stroke`, and the stroke width. The wrapper's transform applies to both paths. The ink path is not a layer.

`copied.layers` is an ordered list. Each layer has an `id`, a shape, and may set its own fill, stroke, and opacity. A motion track may set `layer` to that id. Absent `layer` means the first layer. A preset with no list stays one node. The generator emits one node per layer, in list order, and each node receives only its own tracks. Paint order is the list order. When the list is present, the kind's own shape is not a further node. The ink path stays inside the first layer's wrapper.

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

The motion tempo matches the declared bpm. A looping preset that declares a tempo, the parameter `bpm` or `tempo`, has a cycle length that is a whole number of beats. Cycle length is `durationInFrames / fps`. Beats are `tempo / 60` times that length. 75 bpm on 24 frames at 30 fps is one beat. 150 bpm on the same cycle is two beats.

Beat or hit motion uses a fast-attack ease-out with a slower decay. One symmetric curve is not that pair. A type marked `beat` is the impact class. The golden samples the peak frame, the key with the largest absolute change from the first key, instead of the mid frame. Pixels at the peak differ from frame 0. The hit may finish before the mid frame, so the mid frame and the last frame may both match frame 0. `camera.shake` does that. A document that is identical at every frame, including the peak, fails. The 25 to 75 percent band does not apply to a beat.

Growth motion scales from its anchor. The anchor is the baseline or the inner radius. It is not a translation of the whole shape.

Non-text graphics have at least 3:1 contrast against their background. A creature graphic meets that ratio on both `#f4f4f2` and `#0b0b0c`. A fill whose relative luminance is about 0.11 to 0.27 passes both pages. A 2 px dark outline also passes. An audio graphic stands on both pages too. Amber `#a87800`, teal `#169187`, and text `#7d7b74` pass, and so does a 1.5 px outline that itself stands on both pages.

The end frame keeps its subject fully in frame and composed. An accent is not clipped at the edge.

A shake or an impulse starts and ends at rest, and the offset decays.

A per-category preset package is judged on the default-parameter golden. Reserved parameters are `bpm`, `loop`, `scene`, and `sizeReason`. Every other declared parameter changes geometry or timing. `--goldens` fails when changing one of those parameters leaves the bytes unchanged. That check is cross-category. It blocks the preset milestone. It does not block a per-category package.

A creature passes on its default-parameter golden when every part is visibly attached. Attachment is a fill-alpha overlap of at least 2 px on every frame, measured by the golden check. A parameter such as `expression` or `looseTiming` that does not change the pixels is not a creature failure. It is the cross-category parameter check.

Every golden is reproducible. The committed generator renders it from the preset file plus the shared demo fixture. A hand-drawn golden is not evidence.

Entrance or settle motion animates the whole component as one wrapper, unless the type needs per-part motion. Translucent layers must not show the parts underneath.

A preset's own artwork does not paint an opaque full-bleed stage. The stage belongs to the shared demo fixture. The preset stays transparent so it sits on a dark page. The `backgrounds` category is the exception. It may paint full-bleed. Opaque full-bleed is allowed only for `bg.solid`, `bg.linearGradient`, `bg.sky`, and `bg.radialGradient`. A pattern type stays non-opaque. Its ink opacity is 0.12 to 0.3, or its ink is a dark tone from `#1f1f1f` to `#2a2a2a` on the `#141414` stage. Pattern ink against its own wash is at least 1.8:1. The 3:1 rule is the demo subject against that background, not the pattern ink against the wash. Scene stays on for this category. The generator does not default it to `{ "name": "scene", "value": false }`. A moving group does not carry its own frame clip. The root viewport clips the document.

`presetTimeline` emits the backgrounds group directly after `s-stage` and before the baked subject and ground. Those nodes are `subject-*` and `ground-*` on the timeline and compile to `s-subject` and `s-ground`. `renderPresetGolden` compiles that timeline. The other categories keep the preset group after the baked subject and ground.

The review and the golden check sample a mid frame and the last frame with CSS active. `pauseAnimations` and `setCurrentTime` run before the shot. Motion is a pixel difference. A SMIL clip or a filter whose CSS signature stays put still passes when the mid-frame pixels differ from frame 0 and from the last frame. A document whose pixels do not change fails. A frame-0 markup check is not that review.

At the mid frame, the main track has covered 25 to 75 percent of its travel. The main track is the numeric track with the largest absolute change. When the first and last keys differ, progress is the mid value's share of that change. When they match, progress is the mid value's share of the largest excursion away from the first key. A type marked `fall` is exempt from the 25 percent floor and must still be under 75 percent. `cubic-bezier(0.55, 0, 1, 0.45)` is about 13.5 percent at the mid frame. Constant speed stays inside the band, and `linear` is allowed for a fall. A beat is exempt from the band. When an assignment names an ease that leaves the main track outside this band, the band wins. The session picks an ease whose mid-frame progress is 60 to 72 percent of the travel.

A reveal's coverage completes no earlier than about 75 percent of the run. The static tail, the frames after the clip or mask matches its end path, is at most 25 percent of the duration. A reveal that is fully open before that point fails. The end state of a reveal covers its target fully.

A rotating limb pivots. Successive `transform.rotate` keys differ by at most 30 degrees, so the chord of that step stays within 3.4 percent of the arc. A limb drawn by translating its vertices along the arc fails.

A circle or an arc drawn as a polyline fails when its chord sag is over 1 user unit at 1x. Sag is `R - sqrt(R^2 - (chord / 2)^2)` on the circle through the vertices. An `A` or `a` arc command is exact and passes. A `<circle>` passes.

`--goldens` samples a looping preset at `dur + 0.1s` and compares it with the sample at `0.1s`. `dur` is `durationInFrames / fps`. The samples match when the loop wraps. A document that has frozen by `dur + 0.1s` fails. The default walk does not run this sample.

A glyph-swap preset is checked on every rendered frame. The list is the private `SVGIF_DENY_TERMS` secret, the same newline-separated list the public-surface scan uses. The class starts with `text.scramble`. The check does not print a match. When `SVGIF_REQUIRE_DENY_TERMS` is unset, the lint is skipped. When that flag is true and the secret is empty, the check fails closed.

### Motion class

The marks live in `schema/fixtures/preset/motion-class.json`. The golden check loads that file. The id lists are not copied into the checker. A type may carry more than one mark. `nature.sun.pulse` and `nature.star.twinkle` are ambient and beat. `nature.rain.fall` and `nature.snow.fall` are ambient and fall. The ambient list also holds every v1 background id. The beat list holds `nature.lightning` and `camera.shake`. The fall list holds `nature.water.drop` and `nature.leaf.fall`.

A preset-authoring assignment cites these rules. That includes every later wave. An assignment that is already `assigned` is not rewritten, except an owner ruling that the mid-frame band wins over a named ease, an owner ruling on pattern ink contrast or a frame clip on a moving group, or an owner ruling that a per-category package is judged on its default-parameter golden. That ruling is written into the open assignment. The review of its goldens uses these rules.

### License

A preset file under `presets/` is covered by the repository license. [[sot:svgif/licensing]]

## Why

A closed list of preset ids would require a Studio change for every new file. The registry stays a directory of documents, so a new preset or a new category is a new file. [[adr:svgif/20261110181452]]

## Verification

`node scripts/ci/check-presets.mjs --self-test` builds one preset with an ink path and a stroke width of 1.5 and checks both reach the compiled SVG. It builds two layers with different opacity tracks and checks both nodes appear in that order. It also checks the mid-frame band, the reveal tail, the beat peak, the fall exemption, the ambient loop, the scene default, the hidden-face drop, the chord sag, the 16 KB cap, the glyph-swap lint, and the pixel sample. It fails a pattern background that paints an opaque full-bleed rect, passes `bg.solid` when that rect is opaque, and fails a backgrounds timeline whose preset group is after the subject. `node scripts/ci/check-presets.mjs` walks `presets/`, validates every preset file, and does not contain a list of ids. Zero files is a pass. A file that fails the schema is a failure. When `scripts/ci/preset-coverage.mjs` exists, the walk calls it and does not turn a coverage gap into a failure. That coverage check counts a catalogue-category directory the same way [[sot:svgif/component-catalogue]] describes, and it still counts `presets/<id>/`. The default walk stays green on goldens that predate the motion rules and on goldens that predate the background paint order. `node scripts/ci/check-presets.mjs --goldens` regenerates every golden from the preset plus the shared demo fixture, fails on any diff, and enforces those rules from pixels, including the background paint order and the opaque full-bleed exception. That flag is the golden check. It is not part of the default walk until the committed goldens come from the generator. `node scripts/ci/check-schema.mjs` checks this contract and its fixture hash. `spec check` resolves this id.
