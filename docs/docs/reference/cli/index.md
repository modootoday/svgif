---
layout: doc
title: CLI
description: CLI reference. The CLI is not shipped yet.
lang: en
---

# CLI

The CLI is an optional adapter over the same engine as Studio. It is not shipped. A person does not need it to open Studio. The library is a scene graph and cameras, with frame-exact timelines and compositions. The render stays SVG.

The package name is `@modootoday/svgif-cli`. The design commands are `validate`, `migrate`, `describe`, `compile`, `export`, `new`, and `embed`. Stdout is one JSON document. This snapshot does not publish the binary.

`compile` names the backends `css-external`, `css-embedded`, and `smil`. `export` names `svg` and `html` in-process. `webp`, `webm`, and `mp4` need a local browser: with `--browser`, the CLI runs the same export code as Studio in a headless Chrome or Chromium on your machine and writes the file. Set `SVGIF_BROWSER` to the browser binary if it is not on `PATH`. Without a browser the CLI exits 4. `gif` has no exporter yet. There is no product server.
