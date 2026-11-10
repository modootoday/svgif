---
id: sot:svgif/component-catalogue
title: Component catalogue
status: active
created: 2026-11-10T18:38:24Z
updated: 2026-11-10T20:35:18Z
rel:
  depends_on: [adr:svgif/20261110181452, sot:svgif/schema-versioning]
verify: [node scripts/ci/preset-coverage.mjs]
tags: [schema, catalogue, milestone-0]
---

# Component catalogue

## Rule

The catalogue of component types is `schema/catalogue/components.v1.json`. This record does not copy the rows. For each type, that file is the source of `id`, `category`, and `tier`. The parameter schema for a preset is `https://thumly.io/schema/svgif/preset/v1.schema.json`. [[adr:svgif/20261110181452]] [[sot:svgif/schema-versioning]]

The file has 536 types in 19 categories. The tiers are v1 476, later 56, and out 4. Those counts are the contract.

A catalogue category is a preset directory for the types in that category. The directory is `presets/<category>/`. A schema-valid preset for one v1 type in that directory is `presets/<category>/<kebab>.json`, with `presets/<category>/<kebab>.golden.svg` beside it. The kebab form inserts a hyphen before each capital, turns dots into hyphens, and lowercases. `mask.rect` is `mask-rect`. `audio.eqBars` is `audio-eq-bars`. The preset `category` is the directory name. The preset `id` is that kebab. The v1 type id remains the `component.id`.

A v1 type id is also an addressable preset directory under `presets/<id>/`, with no quantity limit. A preset file there is `presets/<id>/<preset-id>.json`. The golden render is `presets/<id>/<preset-id>.golden.svg`. Adding a preset file does not require a code change. `later` and `out` are not categories. A directory that is neither a v1 type id nor a catalogue category fails the check.

A v1 type has coverage when at least one preset for it validates against the parameter schema and that preset's golden file is present. In a catalogue-category directory that preset is the one whose `id` is the type's kebab. In a type-id directory any schema-valid preset there counts. A type with no such preset is a gap. A gap does not fail the check. A missing catalogue, a count that differs from the contract, or a preset that fails the schema does fail the check.

`presets/index.json` is a generated index of preset files. It is not a preset document and it is not a type.

The same data file holds the locomotion block and the engine-gap list. Those blocks are not preset categories and they are not extra types.

## Why

One data file keeps the type ids, the tiers, and the coverage check on the same counts. The record stays short because the rows live in the data file.

## Verification

`node scripts/ci/preset-coverage.mjs` reads `schema/catalogue/components.v1.json` and `presets/`. It counts a v1 type when a catalogue-category directory holds a schema-valid preset whose `id` is that type's kebab and the golden file is beside it, and it still counts a v1 type from `presets/<id>/`. It reports how many v1 types have that coverage. A gap exits 0. A missing catalogue, a changed count, a directory that is neither a v1 type id nor a catalogue category, or a preset that fails the schema exits non-zero.
