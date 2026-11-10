---
id: adr:svgif/20261110121800
title: Milestone 0 freezes the schemas
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/product-intent
---

# Milestone 0 freezes the schemas

## Context

Parallel work on backends, Studio and exporters will fork if the file format and the plugin shapes are still moving.

## Decision

Milestone 0 is the schema registry under `schema/`, published at the `$id` URLs on Pages. `schemaVersion` is an integer. Optional-field minors use `schemaRevision` and a new file, not an overwrite. npm majors follow `schemaVersion`. CDN code paths are `/svgif/<npm-version>/` and are immutable. Migrators step `N` to `N+1` and are tested. A newer document than the build is `schema-too-new`. No engine package starts before `node scripts/ci/check-schema.mjs` passes. The first real npm release waits on this milestone ([[adr:svgif/20261110122100]]).

## Consequences

Every later work package depends on these files. Changing a frozen contract needs a new ADR.
