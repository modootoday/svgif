---
title: CLI
description: CLI reference. The CLI is not shipped yet.
lang: en
---

# CLI

The CLI is an optional adapter over the same engine as Studio. It is not shipped. A person does not need it to open Studio.

The package name is `@modootoday/svgif-cli`. The design commands are `validate`, `migrate`, `describe`, `compile`, `export`, `new`, and `embed`. Stdout is one JSON document. This snapshot does not publish the binary.

`compile` names the backends `css-external`, `css-embedded`, and `smil`. `export` names `svg` and `html` in-process. `webp`, `webm`, `mp4`, and `gif` need a local browser. There is no product server.
