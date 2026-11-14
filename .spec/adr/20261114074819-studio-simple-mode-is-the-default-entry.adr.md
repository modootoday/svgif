---
id: adr:svgif/20261114074819
title: Studio simple mode is the default entry
status: active
created: 2026-11-14T07:48:19Z
updated: 2026-11-14T07:50:11Z
rel:
  depends_on: [adr:svgif/20261110173419, adr:svgif/20261110181452]
---

# Studio simple mode is the default entry

## Context

[[adr:svgif/20261110173419]] records Studio as a composition editor and records the artboard shell. [[adr:svgif/20261110181452]] records overlay placement and the unbounded preset registry. The live Studio page is a timeline editor. A non-expert cannot change preset words, add an icon, resize, or set loop. The owner adds milestone M9, Studio simple mode. This decision records that entry. It does not edit schema files, compiler code, or preset files. Both earlier decisions stay active.

## Decision

1. M9 is Studio simple mode. Simple mode is Studio's default entry for a non-expert. The current artboard, library, inspector, and timeline stay as Advanced. One toggle, and the choice is remembered. This supersedes the sentence that Studio is not a template editor and that a template is not the default surface.
2. Simple mode never shows keyframes, tracks, property paths (`attr.d`, `transform.*`), frame numbers, hex input as the only color path, codec or backend names, capability tables, or preset slugs.
3. Editable words use optional authoring fields `label` and `text` on scene nodes in schema v1.1 (`schemaRevision` 1, `schemaVersion` stays 1, revision-0 files still open). Text renders as real SVG `<text>` with a generic font-family stack. No font package and no new dependency. Existing path-morph presets stay until a template is rebuilt. That schema and compiler work is not this package. [[sot:svgif/schema-versioning]]
4. Motions are data, files that point at preset tracks. Studio code does not hardcode preset ids. Applying a motion honors the apply-frame offset in [[sot:svgif/animation-ir]] rule 8. After an entrance, the element is visible at rest.
5. Length is seconds plus a Loop switch. Raster exports either honor loop or the switch states plainly that loop applies to SVG and HTML only. GIF stays absent.
6. Acceptance is the non-expert task step counts below, at 1440×900 and 390×844, in a separate read-only live acceptance after Pages deploy.

| Task | Actions today | Where it stops | Simple-mode target |
| --- | --- | --- | --- |
| Sale badge, change the words and the color, export | 6 | The words never change. Color and SVG export do work | 5, and the file shows Sale 50% |
| Blank page, add a title and an icon, animate them in | 5 | No icon. Fade hides the title. The percent sign is wrong | 6 |
| Change the length and whether it loops | 1 | Frames only. Loop cannot be set | 2 |
| Move and resize on the canvas | 1 | The drag moves it. Resize cannot be done | 2 |

7. English only. Zero dependencies and no `devDependencies`. No model or vendor names. Ownership rules stay. Merges are diff-reviewed.

## Consequences

[[sot:svgif/roadmap]] gives M9 to Studio simple mode. [[sot:svgif/product-intent]] states that simple mode is the entry and Advanced keeps the artboard. GIF stays optional. The preset registry stays unbounded. [[plan:svgif/20261110122000]] names the M9 work packages. [[adr:svgif/20261110173419]] still holds the artboard shell. [[adr:svgif/20261110181452]] still holds the unbounded preset registry. The org chart gives this file to `govern`.
