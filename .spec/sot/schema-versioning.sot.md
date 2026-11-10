---
id: sot:svgif/schema-versioning
title: Schema versioning is the first contract
status: active
created: 2026-11-10
updated: 2026-11-10
verify: node scripts/ci/check-schema.mjs
tags: [schema, milestone-0, api]
rel:
  depends_on:
    - sot:svgif/product-intent
    - adr:svgif/20261110121800
---

# Schema versioning is the first contract

## Rule

Milestone 0 is the schema registry. No engine, Studio, or exporter work starts until this contract is frozen and `node scripts/ci/check-schema.mjs` passes. Every later work package depends on it. [[plan:svgif/20261110122000]] [[adr:svgif/20261110121800]]

Schema files live under `/schema`, one `*.schema.json` per contract and version. Each file sets `$schema` and an absolute `$id`. That is the JSON Schema file idiom. They are not Jekyll pages and not a specfold document type. The Pages workflow copies the tree onto `_site/schema` so the `$id` URL serves the file. [[sot:svgif/package-layout]]

### What is frozen in v1

| Contract | Registry file | `$id` |
| --- | --- | --- |
| HTML project payload | `schema/project/v1.schema.json` | `https://thumly.io/svgif/schema/project/v1.schema.json` |
| Composition / timeline IR | `schema/ir/v1.schema.json` | `https://thumly.io/svgif/schema/ir/v1.schema.json` |
| Exporter job | `schema/exporter-job/v1.schema.json` | `https://thumly.io/svgif/schema/exporter-job/v1.schema.json` |
| Backend compile result | `schema/backend-result/v1.schema.json` | `https://thumly.io/svgif/schema/backend-result/v1.schema.json` |

The HTML wrapper around the payload (meta names, script type, Edit bootstrap) is [[sot:svgif/html-project]]. The JSON inside the script is the project schema. The public function names are [[sot:svgif/public-api]]. Plugin shapes are below.

### Semver policy

1. `schemaVersion` is an integer. v1 is the number in the files above.
2. A change that rejects a previously valid project or IR document increments `schemaVersion` and the npm major version together. Before the first npm major, the package may stay `0.y` only while `schemaVersion` stays `1`. The first published major is `1.y.z` and means schema 1.
3. Adding an optional field is a minor release and does not increment `schemaVersion`. Readers ignore unknown optional fields only when `additionalProperties` is later relaxed by a minor schema revision published as `v1.1` in the filename. v1 files in this tree set `additionalProperties: false`. A minor revision that allows a new optional field is a new file `v1.1.schema.json` with the same `schemaVersion: 1` and a `schemaRevision: 1`. Unknown fields still fail on revision 0.
4. npm patch releases do not change schema files.
5. CDN objects for code are immutable: `/svgif/<npm-version>/svgif.mjs` and `/svgif/<npm-version>/studio.js`. Schema files are also copied to `/svgif/schema/project/v1.schema.json` and stay byte-stable for that major. A new schema version is a new path, never an overwrite.
6. A project file records `schemaVersion`, `schemaRevision`, and `runtime.version` (the npm version). Those three pins are independent except for rule 2.

### Compatibility

7. Backward: a newer runtime loads an older `schemaVersion` by running the migrator chain `N -> N+1 -> ... -> current`. Each step is a pure function covered by a fixture pair in `schema/fixtures/migrations/`.
8. Forward: a runtime refuses `schemaVersion` greater than the newest migrator target. It does not guess. The error code is `schema-too-new`.
9. `schema/migrate.mjs` is the only migration entry. v1 has an identity step. There is no v2 document yet. Adding v2 without a `1-to-2` fixture pair fails CI.

### Deprecation

10. A public JS name or a schema field that will be removed is marked deprecated in the same minor release that still accepts it, for at least one minor, and is removed only on the next `schemaVersion` or the next npm major, whichever the removal needs. The changelog group is `Deprecated`. Removal is `Removed` and a major bump.
11. CDN paths of removed majors stay online. They are not deleted, so old HTML pins keep playing.

### Studio, backends, exporters

12. Studio talks to the runtime only through `loadProject`, `migrate`, `renderFrame`, `compile`, and `exportInBrowser`. It does not import files under a future `src/internal`.
13. A backend module implements `{ id, schema: "svgif.backend/1", compile(sampled, opts) -> backend-result }`. Ids in v1: `css-external`, `css-embedded`, `smil`.
14. An exporter implements `{ id, schema: "svgif.exporter/1", export(job) -> Blob }`. Required ids: `html`, `svg`, `webp`, `webm`, `mp4`. Optional id: `gif`.
15. `docs/studio` and the editor lazy-loaded into a saved HTML file are the same `studio.js` bytes. [[adr:svgif/20261110121600]]

### Conformance

16. Every schema version has at least one valid fixture and one invalid fixture under `schema/fixtures/`. CI validates the valid ones and rejects the invalid ones.
17. The Pages site publishes the schema files at the `$id` paths. The CDN mirror, once the host exists, is a copy, not a second `$id`.

## Why

Parallel agents otherwise invent incompatible project files, IR, and CDN paths. One registry with a failing check is the only way those packages can start together.

## Verification

`node scripts/ci/check-schema.mjs` exits 0. `spec check` resolves the links in this document. A pull request that changes a v1 schema file without a fixture change fails that script.
