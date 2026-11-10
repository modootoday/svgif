---
id: sot:svgif/docs-site
title: Docs site and Studio under /svgif
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [docs, pages, studio]
rel:
  depends_on:
    - sot:svgif/client-runtime
    - sot:svgif/audiences
    - adr:svgif/20261110120600
    - adr:svgif/20261110121400
---

# Docs site and Studio under /svgif

## Rule

Information architecture is a delivery order, not a suggestion. The top navigation follows it, and the svgif landing page's first action is Open Studio.

| Priority | Path | Page |
| --- | --- | --- |
| P0 | `/svgif/` | Marketing landing |
| P1 | `/svgif/studio/` | Studio |
| P2 | `/svgif/guide/` | User guide |
| P3 | `/svgif/developers/` | Developer guide: API, schema, embedding, contributing |

Work packages `WP-DOCS-P0` through `WP-DOCS-P3` run in that order. A Pages check that fails P0 does not get credit for P3. [[plan:svgif/20261110122000]]

`docs/llms.txt` is generated from the agent-surface source. The docs role does not hand-edit it. [[sot:svgif/agent-distribution]]

The public site is one GitHub Pages site. The docs source is a normal Jekyll tree under `docs/`: `_config.yml`, `_data/` (navigation), `_layouts/` and `_includes/` only when overriding the theme, and `assets/` for images and extra CSS. Page bodies are Markdown next to those directories. The theme gem supplies the layouts the site does not override. Jekyll writes `_site/`. Studio is not a second Jekyll collection: after the Jekyll build, the workflow copies `apps/studio/dist` onto `_site/svgif/studio`. [[sot:svgif/package-layout]]

### URLs

| Path on the artifact | Public URL | What it is |
| --- | --- | --- |
| `_site/index.html` | `https://thumly.io/` | Thumly placeholder. Not the svgif landing. The app is not shipped. |
| `_site/svgif/index.html` | `https://thumly.io/svgif/` | svgif landing. First action is still Open Studio. |
| `_site/svgif/studio/` | `https://thumly.io/svgif/studio/` | Studio placeholder, marker `data-svgif-studio=placeholder` |
| `_site/svgif/studio/assets/*` | `https://thumly.io/svgif/studio/assets/*` | Studio JS and CSS |
| `_site/svgif/guide/` | `https://thumly.io/svgif/guide/` | User guide |
| `_site/svgif/developers/` | `https://thumly.io/svgif/developers/` | Developer guide |
| `_site/svgif/works/<workId>/` | `https://thumly.io/svgif/works/<workId>/` | Work page, oEmbed files, card media. [[sot:svgif/external-embed]] |
| `_site/svgif/embed/<workId>/` | `https://thumly.io/svgif/embed/<workId>/` | Iframe player. Studio is not in the first response |
| `_site/CNAME` |  | the single line `thumly.io` |

`docs/_config.yml` sets `url: https://thumly.io` and an empty `baseurl`. svgif pages are physical directories under `docs/svgif/`, so the built files land at the artifact paths above. The custom domain is `thumly.io`. `docs/CNAME` is the single line `thumly.io`, and the Jekyll build copies it to `_site/CNAME`.

### How the artifact is built

The Pages workflow does these steps in order. No step calls an encode server.

1. `bundle exec jekyll build` in `docs/`, destination `_site`. `docs/index.md` is the Thumly root placeholder. The app is not shipped. `docs/svgif/studio/index.md` is the Studio placeholder whose text contains `data-svgif-studio=placeholder`. `docs/_config.yml` sets `sass.sourcemap` to `never`. After the build, delete every `*.map` under `_site`. The theme gem ships CSS source maps, and those files are not part of the published site. [[sot:svgif/sensitive-content]]
2. `bundle exec modootoday-check` runs against that Jekyll output, before any SPA copy, so the checker never has to parse the SPA.
3. When `apps/studio` exists, build it with Vite `base: './'` and an output directory `apps/studio/dist`.
4. Delete `_site/svgif/studio` and copy `apps/studio/dist` to `_site/svgif/studio`. The copy is the whole directory, so the placeholder is not what Pages serves.
5. Run `scripts/ci/studio-pages-dod.sh` on `_site`. It is the pre-deploy half of the M8 DoD.
6. `actions/upload-pages-artifact` uploads `_site`. `actions/deploy-pages` publishes it. Only `main` deploys. Pull requests build and run the DoD script but do not deploy.

Until `apps/studio` exists, steps 3–4 are skipped and the script reports that M8 is not active. The placeholder stays live so the path is linked from the docs nav. The milestone is not done while the marker is `placeholder`.

### Base path

Studio uses relative asset URLs (`base: './'`). The document is `/svgif/studio/` or `/svgif/studio/index.html` on `https://thumly.io`, so `./assets/app.js` resolves to `/svgif/studio/assets/app.js` without embedding the repository name in the bundle. Docs links use `{{ '/svgif/studio/' | relative_url }}`. An empty `baseurl` leaves that path on the custom-domain root.

### Same-origin assets

Studio bundles `@modootoday/svgif` and `@modootoday/svgif-export` into `/svgif/studio/assets`. It does not boot from the CDN. Third-party pages load the library from the CDN. [[sot:svgif/distribution]] Same-origin boot means Studio still opens when the CDN is down, and it does not need Cross-Origin-Resource-Policy headers that Pages cannot set.

### Deep links

The router is a hash router. A project link looks like `https://thumly.io/svgif/studio/#/edit/<id>`. Refresh sends the browser to `/svgif/studio/`, which exists as a file. Pages is not asked to rewrite unknown paths.

`docs/404.md` stays the documentation 404. Studio does not replace it with `index.html`. A history-mode SPA plus a copied `404.html` is rejected: it would hide missing asset files and would steal the docs 404.

### COOP, COEP, WASM threads

GitHub Pages does not let a repository set `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`. `crossOriginIsolated` stays false, so `SharedArrayBuffer` and threaded WASM do not run.

The required encode path is single-threaded WASM or pure JS, plus a Worker and `OffscreenCanvas` when the browser has them. Those do not need COOP/COEP. The fallback when `OffscreenCanvas` is missing is the same encoder on the main thread. There is no threaded build.

### Language

Docs source is English. [[adr:svgif/20261110120900]] A Korean locale would be `*.ko.md` later, not a second source, and not a substitute for the English Studio shell. Studio UI strings are English in v1.

## Why

The owner defined completion as Studio live at `/svgif/studio/` on the same Pages host as the theme docs. One artifact, one custom domain, no server rewrites.

## Verification

M8 in [[plan:svgif/20261110122000]] and [[sot:svgif/roadmap]]. The commands are `scripts/ci/studio-pages-dod.sh` before deploy and a `curl` of the live `https://thumly.io/svgif/studio/` URL after deploy. Both must see `data-svgif-studio="app"`.
