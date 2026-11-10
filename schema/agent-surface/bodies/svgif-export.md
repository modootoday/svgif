# Export a svgif project

## Node formats

`svgif export --format svg --json <file>` and `svgif export --format html --json <file>` run without a browser. Compare those bytes with Studio when you need parity. The same engine produces both.

## Browser formats

`webp`, `webm`, `mp4`, and `gif` are encoded in the browser. Without `--browser`, the CLI exits 4 and names the format as browser-only. `--browser` runs the same export package in a headless browser on the local machine. It is not a hosted encode service.

## Embed

`svgif embed --mode cdn --json` prints a snippet that loads the pinned CDN build. `svgif embed --mode inline --json` prints a snippet that plays with no network. Do not mix those modes.
