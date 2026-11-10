---
id: sot:svgif/symbol-instance
title: Symbol and instance reuse
status: active
created: 2026-11-10T18:30:38Z
updated: 2026-11-10T18:31:32Z
rel:
  depends_on: [sot:svgif/architecture, sot:svgif/animation-ir, sot:svgif/determinism, adr:svgif/20261110120000, adr:svgif/20261110181452]
verify: [manual]
tags: [svg, symbol]
---

# Symbol and instance reuse

## Rule

One symbol definition can have many instances. The drawing lives in the definition. Each instance places that definition and carries its own position. An instance stores a reference, and the serialized document keeps a single copy of the drawing.

`renderFrame` emits one SVG document. [[adr:svgif/20261110120000]] [[sot:svgif/architecture]] The definition is one `<symbol>` element. Each instance is one `<use>` element whose `href` points at that symbol. The symbol sits in `<defs>`, so the document paints the instances and does not paint the definition as an extra copy. A second copy of the drawing markup fails this rule.

Changing the symbol changes every instance. The following document still contains that definition once, and every instance shows the changed drawing.

A later frame swap is a visibility track over instances. The track chooses which instance is shown at a frame. It keeps the same definition. This record states the reuse rule. The visibility track arrives in a later package. [[sot:svgif/animation-ir]]

### Acceptance fixture

The fixture is two instances of one symbol.

The definition id is `mark`. In the serialized document the symbol id is `s-mark`, and the instance ids are `s-a` and `s-b`, using the stable `s-` prefix. [[sot:svgif/architecture]] The drawing is a 40 by 40 rectangle whose top-left is the symbol origin and whose fill is `#112233`. Instance `a` is placed at (8, 8). Instance `b` is placed at (88, 8). The composition is 160 by 80. The document contains one `<symbol id="s-mark">` and two `<use href="#s-mark">` elements.

The changed symbol keeps the id `mark` and the same two instances at the same positions. The drawing becomes a 40 by 24 rectangle with the same origin and the same fill. Both instances show that shorter rectangle. The document still contains one symbol element.

| Golden file | Contents |
| --- | --- |
| `packages/svgif/test/fixtures/symbol-instance/two-instances.svg` | One definition of `mark` and instances `a` and `b`. |
| `packages/svgif/test/fixtures/symbol-instance/two-instances-changed.svg` | The same two instances after the symbol changes. One definition. |

These two paths are the golden pair. This package names them. The bytes and the engine arrive with a later implementation. That implementation compares each quantized `renderFrame` string with the matching file. [[sot:svgif/determinism]]

A separate vision review session passes the renders of that pair. The reviewer is the designated vision review model chosen by the launcher. The reuse rule waits on that session before it counts as passed. This package does not open the session.

## Why

A part swap keeps one drawing. Each instance is a placement of that drawing, so a change to the symbol reaches every instance from the single definition in the SVG.

## Verification

`spec check` resolves `sot:svgif/symbol-instance`. [[plan:svgif/20261110122000]] has no checkbox for `WP-SYMBOL-INSTANCE`. The golden pair is the table above. The string compare runs when the engine can emit the fixture. Until those files exist, this document is the gate.
