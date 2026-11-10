---
id: sot:svgif/preset-registry
title: Preset registry
status: active
created: 2026-11-10T18:31:54Z
updated: 2026-11-10T18:33:47Z
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

`id` is a stable lowercase kebab slug, unique across the registry, matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

`category` matches the same slug pattern. It is not an enum. `later` and `out` are not categories.

### Paths

A preset file lives at `presets/<category>/<id>.json`. `category` is the directory name. `id` is the file name without `.json`. A new category is a new directory.

The golden file is `presets/<category>/<id>.golden.svg`. This package does not render that file.

### Categories

Categories derive from `schema/catalogue/components.v1.json` when that file is in the tree. Until that copy exists, the source extract is `.agents/handoff/assignments/catalogue-components.v1.json`. This record does not copy those rows. A v1 type id in that source is an addressable category. The directory name is the category slug. `later` and `out` are not categories.

### Determinism

The document has no unseeded random source. The same preset at the same integer frame is byte-stable. The golden file is the evidence of that render.

### License

A preset file under `presets/` is covered by the repository license. [[sot:svgif/licensing]]

## Why

A closed list of preset ids would require a Studio change for every new file. The registry stays a directory of documents, so a new preset or a new category is a new file. [[adr:svgif/20261110181452]]

## Verification

`node scripts/ci/check-presets.mjs` walks `presets/`, validates every preset file, and does not contain a list of ids. Zero files is a pass. A file that fails the schema is a failure. When `scripts/ci/preset-coverage.mjs` exists, the walk calls it and does not turn a coverage gap into a failure. `node scripts/ci/check-schema.mjs` checks this contract and its fixture hash. `spec check` resolves this id.
