# svgif.js

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.svg">
  <img alt="Hand-drawn hero for svgif.js. A single SVG file draws a curve and steps through integer frames. The engine is not shipped." src="docs/assets/readme/hero-light.svg" width="960">
</picture>

Make motion that stays a file.

[![CI](https://github.com/modootoday/svgif/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/modootoday/svgif/actions/workflows/ci.yml)
[![Pages](https://github.com/modootoday/svgif/actions/workflows/pages.yml/badge.svg)](https://github.com/modootoday/svgif/actions/workflows/pages.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue)](#license)
[![Docs](https://img.shields.io/badge/docs-thumly.io%2Fdocs-blue)](https://thumly.io/docs/)
[![Thumly](https://img.shields.io/badge/Thumly-thumly.io-orange)](https://thumly.io/)
[![status: pre-release](https://img.shields.io/static/v1?label=status&message=pre-release&color=orange)](https://github.com/modootoday/svgif)
[![npm](https://img.shields.io/npm/v/%40modootoday%2Fsvgif)](https://www.npmjs.com/package/@modootoday/svgif)
[![bundle size](https://img.shields.io/bundlephobia/minzip/%40modootoday%2Fsvgif)](https://bundlephobia.com/package/@modootoday/svgif)

Pre-release: APIs and commands below describe v1 and go live with the first gated release.

## What is svgif

svgif.js draws motion as SVG. A scene graph and cameras describe simulated 3D, and the render is still SVG. Timelines and compositions are frame-exact, renders are deterministic, and a finished file can stand alone. Playback honors reduced motion. The same library is published on a CDN with subresource integrity.

- SVG-only output
- Scene graph and cameras with simulated 3D
- Frame-exact timelines and compositions
- Deterministic renders
- Self-contained files
- Reduced-motion support
- CDN with SRI

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/thumly-dark.svg">
  <img alt="Hand-drawn browser frame for thumly.io. The app is not shipped and is not running." src="docs/assets/readme/thumly-light.svg" width="720">
</picture>

Thumly is one static app at `apps/thumly`. Version 1 copy is English. The host is `https://thumly.io/`. `www.thumly.io` is not a second site. It redirects to the apex.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/file-dark.svg">
  <img alt="Hand-drawn picture of one SVG document with the motion inside the file." src="docs/assets/readme/file-light.svg" width="720">
</picture>

| Backend | Stands alone |
| --- | --- |
| `css-external` | No. An external stylesheet does not travel inside a single SVG. |
| `css-embedded` | Yes. The same CSS is one `<style>` in the file. |
| `smil` | Yes. The motion is SMIL elements in the file. |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/frames-dark.svg">
  <img alt="Hand-drawn row of integer frames with a moving playhead. The player is not shipped." src="docs/assets/readme/frames-light.svg" width="720">
</picture>

Timelines sample integer frames.

## Quick start

```sh
npm i @modootoday/svgif
```

```ts
import * as svgif from "@modootoday/svgif";

const composition = svgif.composition({
  id: "shot",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 90,
});

const scene = new svgif.Scene();
const camera = new svgif.PerspectiveCamera(35, 1920 / 1080, 0.1, 100);
camera.position.set(0, 0, 8);
const cube = new svgif.Mesh(new svgif.BoxGeometry(1, 1, 1), { fill: "#e8ff47" });
scene.add(cube);

composition.sequence(0, 90, () => {
  cube.rotation.y = svgif.interpolate(0, Math.PI * 2);
  cube.position.y = svgif.spring({ stiffness: 120, damping: 14, mass: 1 });
});

const svg = svgif.renderFrame(composition, 12);
const file = svgif.compile(composition, { backend: "smil" });
// file.svg is self-contained; file.css is set only for backend "css-external"
```

## Surfaces

Studio is for people: [Open Studio](https://thumly.io/studio/).

The CLI is for agents.

```sh
npx @modootoday/svgif-cli@X.Y.Z
```

MCP and Agent Skills are thin adapters over the same core.

```sh
npx skills add modootoday/svgif --ref vX.Y.Z
```

Claude Code: `/plugin marketplace add modootoday/svgif`

Codex: `codex plugin marketplace add modootoday/svgif --ref vX.Y.Z`

Cursor: open the install link generated in that tag, or install the repository plugin at that ref.

```json
{
  "mcpServers": {
    "svgif": {
      "command": "npx",
      "args": ["-y", "@modootoday/svgif-mcp@X.Y.Z"]
    }
  }
}
```

```html
<script
  src="https://cdn.thumly.io/svgif/<version>/svgif.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>
```

Do not set `integrity` on `/svgif/latest/` or `/svgif/<major>/`.

`SVGIF_CDN_BASE` is unset. This page does not say the CDN is already serving files. Once `SVGIF_CDN_BASE` is set, the origin is `https://cdn.thumly.io/svgif`. jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`. Exact-version URLs are the ones that carry SRI. Alias URLs do not. Studio on Pages uses relative URLs and does not boot from the CDN. CDN object keys `/svgif/<version>/` stay. This package does not rename them.

## Documentation

| Page | URL |
| --- | --- |
| Docs home | https://thumly.io/docs/ |
| Getting started | https://thumly.io/docs/getting-started/ |
| User guide | https://thumly.io/docs/guides/ |
| API reference | https://thumly.io/docs/reference/api/ |
| CLI reference | https://thumly.io/docs/reference/cli/ |
| Human schema docs | https://thumly.io/docs/reference/schema/ |
| Agent Skills and MCP | https://thumly.io/docs/agents/ |

| Path | Page |
| --- | --- |
| `/` | Thumly landing |
| `/studio/` | Studio |
| `/docs/` | Docs home |
| `/docs/getting-started/` | Getting started |
| `/docs/guides/` | User guide |
| `/docs/reference/api/` | API reference |
| `/docs/reference/cli/` | CLI reference |
| `/docs/reference/schema/` | Human schema docs |
| `/docs/agents/` | Agent Skills and MCP |
| `/embed/` | Player |
| `/oembed` | Static oEmbed path. Not a query endpoint. |
| `/works/` | Examples gallery |
| `/schema/svgif/v1.json` | Machine-readable schema. The schema role publishes the file. |

## Repository layout

| Path | What it is |
| --- | --- |
| `.agents/` | Role bootstrap and handoff files |
| `.claude-plugin/` | Claude Code plugin manifest |
| `.codex-plugin/` | Codex plugin manifest |
| `.cursor-plugin/` | Cursor plugin manifest |
| `.githooks/` | Git hooks |
| `.github/` | Workflows and repository policy |
| `.spec/` | Design records |
| `distribution/` | Generated install text |
| `docs/` | Site source |
| `packages/` | Library workspace |
| `schema/` | JSON Schema files |
| `scripts/` | CI scripts |
| `skills/` | Agent Skills |

## How this project is built

The [org chart](.spec/sot/org-chart.sot.md) names who owns each path, and the [handoff](.spec/sot/handoff.sot.md) is how a session takes one assignment and returns it. The [release gate](.spec/sot/release-gate.sot.md) fails closed: a release is not done until every command and every snippet on this page runs. This page is the target spec.

## Security and supply chain

Third-party GitHub Actions are pinned to a commit SHA with a version comment. The supply-chain scan fails closed on an unpinned action, a failed audit, or a high or critical advisory. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Contributing

Open an issue or a pull request on this repository. Write in English. Design records live under `.spec/`.

## License

[MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE).

svgif.js is a modootoday project.
