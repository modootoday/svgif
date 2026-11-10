---
id: sot:svgif/component-catalogue
title: Component catalogue
status: active
created: 2026-11-10T18:38:24Z
updated: 2026-11-10T18:40:23Z
rel:
  depends_on: [adr:svgif/20261110181452, sot:svgif/schema-versioning]
verify: [node scripts/ci/preset-coverage.mjs]
tags: [schema, catalogue, milestone-0]
---

# Component catalogue

## Rule

The catalogue of component types is `schema/catalogue/components.v1.json`. This record does not copy the rows. For each type, that file is the source of `id`, `category`, and `tier`. The parameter schema for a preset is `https://thumly.io/schema/svgif/preset/v1.schema.json`. [[adr:svgif/20261110181452]] [[sot:svgif/schema-versioning]]

The file has 536 types in 19 categories. The tiers are v1 476, later 56, and out 4. Those counts are the contract.

`category` on a type row groups that type with other types. It is not a preset directory.

Every v1 type id is an addressable preset category under `presets/<id>/`, with no quantity limit. A preset file in that category is `presets/<id>/<preset-id>.json`. The golden render for that preset is `presets/<category>/<id>.golden.svg`, where `<category>` is the v1 type id and `<id>` is the preset id. Adding a preset file under a v1 type does not require a code change. `later` and `out` are not categories.

A v1 type has coverage when at least one preset under its id validates against the parameter schema and that preset's golden file is present. A type with no such preset is a gap. A gap does not fail the check. A missing catalogue, a count that differs from the contract, or a preset that fails the schema does fail the check.

`presets/index.json` is a generated index of preset files. It is not a preset document and it is not a type.

The same data file holds the locomotion block and the engine-gap list. Those blocks are not preset categories and they are not extra types.

## Why

One data file keeps the type ids, the tiers, and the coverage check on the same counts. The record stays short because the rows live in the data file.

## Verification

`node scripts/ci/preset-coverage.mjs` reads `schema/catalogue/components.v1.json` and `presets/`. It reports how many v1 types have at least one schema-valid preset and a `presets/<category>/<id>.golden.svg`. A gap exits 0. A missing catalogue, a changed count, or a preset that fails the schema exits non-zero.
