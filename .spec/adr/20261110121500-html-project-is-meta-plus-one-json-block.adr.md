---
id: adr:svgif/20261110121500
title: HTML project is meta plus one JSON block
status: active
created: 2026-11-10
updated: 2026-11-10
rel:
  depends_on:
    - sot:svgif/schema-versioning
---

# HTML project is meta plus one JSON block

## Context

Save and export must be the same file a browser can open and a tool can validate. A second JSON-LD payload would fork the source of truth.

## Decision

The file is HTML. One script `#svgif-project` of type `application/vnd.svgif.project+json` holds the project schema. Meta names `svgif:schema`, `svgif:revision` and `svgif:generator` repeat those fields and must match. Save and Export HTML write the same bytes.

## Consequences

Import uses DOMParser and JSON.parse, then the schema. Foreign scripts are not executed.
