---
name: svgif-export
description: "Export a svgif project to SVG or HTML, or name the browser-only formats. Use when the user wants a file they can open, embed, or hand to Studio."
---
# Export a svgif project

## Node formats

`svgif export --format svg --json <file>` and `svgif export --format html --json <file>` run without a browser. Compare those bytes with Studio when you need parity. The same engine produces both.

## Browser formats

`webp`, `webm`, and `mp4` are encoded in the browser. Without `--browser`, the CLI exits 4 and names the format as browser-only. `--browser` runs the same export package in a headless Chrome or Chromium on the local machine, found through `SVGIF_BROWSER` or `PATH`. It is not a hosted encode service. With no browser found the CLI exits 4; when the browser cannot encode the format it exits 70 and writes no file. `gif` is not a format; the CLI exits 2 for it.

## Embed

`svgif embed --mode cdn --json` prints a snippet that loads the pinned CDN build. `svgif embed --mode inline --json` prints a snippet that plays with no network. Do not mix those modes.
