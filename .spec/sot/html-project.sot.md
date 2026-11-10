---
id: sot:svgif/html-project
title: HTML project file
status: active
created: 2026-11-10
updated: 2026-11-10
verify: node scripts/ci/check-schema.mjs
tags: [html, studio, schema]
rel:
  depends_on:
    - sot:svgif/schema-versioning
    - adr:svgif/20261110121500
    - adr:svgif/20261110121600
---

# HTML project file

## Rule

Save and Export HTML write the same bytes. The file is a project and a preview. Opening it in a browser plays the animation. An Edit control, or the hash `#edit`, lazy-loads Studio from the CDN so the user can edit and save a new file. That relay is the way a svgif file evolves.

### Document shape

1. A full HTML document. The canonical payload is one element:

```html
<script id="svgif-project" type="application/vnd.svgif.project+json">
{ ... project schema ... }
</script>
```

2. These meta tags repeat two fields so a reader can see them without parsing the script. They must match the JSON or the file is invalid.

| Meta name | Value |
| --- | --- |
| `svgif:schema` | `schemaVersion` as decimal digits |
| `svgif:revision` | `schemaRevision` as decimal digits |
| `svgif:generator` | `generator` string, `@modootoday/svgif@<version>` |

3. No second payload. JSON-LD is not a second source. A file with two `svgif-project` scripts is invalid. When `presentation` is present, the meta tags named in [[sot:svgif/external-embed]] are required and must match that object. They are a projection. Open Graph, the Twitter card, and oEmbed are not stored again inside the script.
4. The JSON object is `schema/project/v1.schema.json`. `composition` is `schema/ir/v1.schema.json`.

### Playback and the editor

5. `runtime.mode` is `cdn` or `inline`.
   - `cdn`: the body loads `https://<cdn-host>/svgif/<runtime.version>/svgif.mjs` with `integrity` set to `runtime.sri` and `crossorigin="anonymous"`. The host is the public CDN. The version is the pin, never a floating `latest`.
   - `inline`: the player script is in the file. Play works with no network.
6. Both modes include a button labeled Edit and honor `#edit` on load. The editor script is always `https://<cdn-host>/svgif/<runtime.version>/studio.js` plus `studio.css`, each with SRI from `runtime.studioSri`. It is not loaded until Edit or `#edit`.
7. Default save uses `cdn` for the player and the editor. A checkbox "embed player" writes `inline` for the player only. A second checkbox "embed studio" inlines `studio.js` as well. Embed studio is off by default because of size. Play of an inline file works offline. Edit works offline only when studio was embedded; otherwise Edit requires the CDN (or a warm HTTP cache).
8. `docs/studio` is the same `studio.js` published on Pages at `/studio/`. The CDN object for that version must be byte-identical. M8 checks the hash. [[sot:svgif/docs-site]]
9. Opening an older pin in a newer Pages Studio offers Migrate. Migration runs [[sot:svgif/schema-versioning]] and the next save writes the new pin and SRI. The file does not change until the user saves. A newer `schemaVersion` than the Studio build supports shows `schema-too-new` and does not edit.

### Provenance

10. `provenance.generations` is an ordered array. Each save appends `{ id, parentId, schemaVersion, runtimeVersion, savedAt }` where `savedAt` is an ISO-8601 UTC time the user asked to stamp, not a hidden clock inside `renderFrame`. `id` is a random UUID created in the page. `parentId` is the previous id, or null for the first save. The array is kept in full for v1 (no silent trim).

### Import security

11. Studio import and "open HTML" use `DOMParser`. Scripts in the parsed document do not run.
12. The importer reads only the `svgif-project` script text, the three identity meta values, and the presentation meta tags when `presentation` is present. It `JSON.parse`s that text, checks the meta match, then validates the schema. It does not `eval`, does not keep foreign `<script>` bodies, and does not copy event-handler attributes into the live document.
13. After a valid parse, Studio discards the rest of the HTML and re-renders from the composition. Playback markup is not round-tripped.

### Copy source

14. "Copy source" is not a different project format. It copies either a CDN fragment or an inline fragment. Both fragments contain the same `svgif-project` script. The CDN fragment references the pinned runtime with SRI. The inline fragment contains the player. Neither fragment includes Studio unless the user also chose embed studio.

## Why

HTML is the file a person can double-click, and the meta plus one JSON block is the spec a tool can validate. One serializer for save and export keeps the relay from forking into two formats.

## Verification

`schema/fixtures/project/v1-valid.json` validates. `schema/fixtures/project/v1-script-mismatch.json` is rejected by `node scripts/ci/check-schema.mjs`. A later Studio test opens the fixture through `DOMParser` and asserts no project script was evaluated as JavaScript.
