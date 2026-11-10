# svgif.js

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.svg">
  <img alt="Hand-drawn hero for svgif.js. A single SVG file draws a curve and steps through integer frames. The engine is not shipped." src="docs/assets/readme/hero-light.svg" width="960">
</picture>

Make motion that stays a file.

svgif.js is an SVG animation library. The scene stays SVG, timelines are integer frames, and playback runs in the browser. There is no product server and no server-side encode.

The engine is not shipped. Studio is not built. Thumly is not shipped. The pictures on this page are hand-drawn. The design records under `.spec/` are the source until the engine exists.

The package name is `@modootoday/svgif`. Do not install the unscoped npm package `svgif`.

[Open Studio](https://thumly.io/svgif/studio/)

## Thumly

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/thumly-dark.svg">
  <img alt="Hand-drawn browser frame for thumly.io. The app is not shipped and is not running." src="docs/assets/readme/thumly-light.svg" width="720">
</picture>

Thumly is one static app at `apps/thumly`. Version 1 copy is English. The host is `https://thumly.io/`. `www.thumly.io` is not a second site. It redirects to the apex. The app is not shipped and is not running. svgif.js stays the section under `/svgif/`.

## One file

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/file-dark.svg">
  <img alt="Hand-drawn picture of one SVG document with the motion inside the file." src="docs/assets/readme/file-light.svg" width="720">
</picture>

| Backend | Stands alone |
| --- | --- |
| `css-external` | No. An external stylesheet does not travel inside a single SVG. |
| `css-embedded` | Yes. The same CSS is one `<style>` in the file. |
| `smil` | Yes. The motion is SMIL elements in the file. |

## Frames

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/frames-dark.svg">
  <img alt="Hand-drawn row of integer frames with a moving playhead. The player is not shipped." src="docs/assets/readme/frames-light.svg" width="720">
</picture>

Timelines sample integer frames. The player is not shipped.

The docs home is [svgif.js](https://thumly.io/svgif/). The guide and the developer notes are placeholders at [/svgif/guide/](https://thumly.io/svgif/guide/) and [/svgif/developers/](https://thumly.io/svgif/developers/).

License: MIT OR Apache-2.0.
