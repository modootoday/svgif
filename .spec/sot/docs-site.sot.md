---
id: sot:svgif/docs-site
title: Docs site routes on thumly.io
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

# Docs site routes on thumly.io

## Rule

Information architecture is a delivery order, not a suggestion. The top navigation lists Studio, the user guide, and the developer guide, in that order. The landing page is not a nav row. Its first action is Open Studio.

| Priority | Path | Page |
| --- | --- | --- |
| P0 | `/` | Thumly landing. The first action is Open Studio. |
| P1 | `/studio/` | Studio |
| P2 | `/docs/guides/` | User guide |
| P3 | `/docs/reference/api/` | Developer guide, starting with the API reference |

Work packages `WP-DOCS-P0` through `WP-DOCS-P3` run in that order. A Pages check that fails P0 does not get credit for P3. [[plan:svgif/20261110122000]]

`docs/llms.txt` is generated from the agent-surface source. The docs role does not hand-edit it. [[sot:svgif/agent-distribution]]

The public site is one GitHub Pages site. The docs source is a normal Jekyll tree under `docs/`: `_config.yml`, `_data/` (navigation), `_layouts/` and `_includes/` only when overriding the theme, and `assets/` for images and extra CSS. Page bodies are Markdown next to those directories. The theme gem supplies the layouts the site does not override. Jekyll writes `_site/`. Studio is not a second Jekyll collection: after the Jekyll build, the workflow copies `apps/studio/dist` onto `_site/studio`. [[sot:svgif/package-layout]]

### Routes

Apex `https://thumly.io` stays canonical. `www.thumly.io` is not a second site. It redirects to the apex.

| Path | Page |
| --- | --- |
| `/` | Thumly landing |
| `/studio/` | Studio |
| `/docs/` | Docs home. The public docs URL is `https://thumly.io/docs/`. |
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

The former `/svgif/` section is removed. The site was never indexed. Do not add a redirect, a meta refresh, or a `rel=canonical` stub for an old `/svgif/` URL. Those paths are retired. CDN object keys `/svgif/<version>/` are not site routes and stay.

### URLs

| Path on the artifact | Public URL | What it is |
| --- | --- | --- |
| `_site/index.html` | `https://thumly.io/` | Thumly landing. The app is not shipped. First action is Open Studio. |
| `_site/docs/index.html` | `https://thumly.io/docs/` | Docs home. First action is Open Studio. |
| `_site/docs/getting-started/` | `https://thumly.io/docs/getting-started/` | Getting started |
| `_site/docs/guides/` | `https://thumly.io/docs/guides/` | User guide |
| `_site/docs/reference/api/` | `https://thumly.io/docs/reference/api/` | API reference |
| `_site/docs/reference/cli/` | `https://thumly.io/docs/reference/cli/` | CLI reference |
| `_site/docs/reference/schema/` | `https://thumly.io/docs/reference/schema/` | Human schema docs |
| `_site/docs/agents/` | `https://thumly.io/docs/agents/` | Agent Skills and MCP |
| `_site/studio/` | `https://thumly.io/studio/` | Studio placeholder, marker `data-svgif-studio=placeholder` |
| `_site/studio/assets/*` | `https://thumly.io/studio/assets/*` | Studio JS and CSS |
| `_site/embed/` | `https://thumly.io/embed/` | Player. Studio is not in the first response |
| `_site/embed/<workId>/` | `https://thumly.io/embed/<workId>/` | Iframe player for one work. [[sot:svgif/external-embed]] |
| `_site/oembed.html` | `https://thumly.io/oembed` | Static oEmbed path. Not a query endpoint. |
| `_site/works/` | `https://thumly.io/works/` | Examples gallery |
| `_site/works/<workId>/` | `https://thumly.io/works/<workId>/` | Work page, oEmbed files, card media. [[sot:svgif/external-embed]] |
| `_site/schema/svgif/v1.json` | `https://thumly.io/schema/svgif/v1.json` | Machine-readable schema. The schema role publishes the file. |
| `_site/CNAME` |  | the single line `thumly.io` |

`docs/_config.yml` sets `url: https://thumly.io` and an empty `baseurl`. Pages are physical directories under `docs/`, so the built files land at the artifact paths above. `docs/CNAME` is the single line `thumly.io`, and the Jekyll build copies it to `_site/CNAME`.

### Library CDN

`SVGIF_CDN_BASE` is unset. This record does not say the CDN is already serving files. Once `SVGIF_CDN_BASE` is set, the origin is `https://cdn.thumly.io/svgif`. jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`. Exact-version URLs are the ones that carry SRI. Alias URLs do not. Studio on Pages uses relative URLs and does not boot from the CDN. CDN object keys `/svgif/<version>/` stay. This package does not rename them.

### How the artifact is built

The Pages workflow does these steps in order. No step calls an encode server.

1. `bundle exec jekyll build` in `docs/`, destination `_site`. `docs/index.md` is the Thumly landing. The app is not shipped. `docs/studio/index.md` is the Studio placeholder whose text contains `data-svgif-studio=placeholder`. `docs/_config.yml` sets `sass.sourcemap` to `never`. After the build, delete every `*.map` under `_site`. The theme gem ships CSS source maps, and those files are not part of the published site. [[sot:svgif/sensitive-content]]
2. `bundle exec modootoday-check` runs against that Jekyll output, before any SPA copy, so the checker never has to parse the SPA.
3. When `apps/studio` exists, build it with Vite `base: './'` and an output directory `apps/studio/dist`.
4. Delete `_site/studio` and copy `apps/studio/dist` to `_site/studio`. The copy is the whole directory, so the placeholder is not what Pages serves.
5. Run `scripts/ci/studio-pages-dod.sh` on `_site`. It is the pre-deploy half of the M8 DoD.
6. `actions/upload-pages-artifact` uploads `_site`. `actions/deploy-pages` publishes it. Only `main` deploys. Pull requests build and run the DoD script but do not deploy.

Until `apps/studio` exists, steps 3–4 are skipped and the script reports that M8 is not active. The placeholder stays live so the path is linked from the docs nav. The milestone is not done while the marker is `placeholder`.

### Base path

Studio uses relative asset URLs (`base: './'`). The document is `/studio/` or `/studio/index.html` on `https://thumly.io`, so `./assets/app.js` resolves to `/studio/assets/app.js` without embedding the repository name in the bundle. Docs links use `{{ '/studio/' | relative_url }}`. An empty `baseurl` leaves that path on the custom-domain root.

### Same-origin assets

Studio bundles `@modootoday/svgif` and `@modootoday/svgif-export` into `/studio/assets`. It does not boot from the CDN. Third-party pages load the library from the CDN. [[sot:svgif/distribution]] Same-origin boot means Studio still opens when the CDN is down, and it does not need Cross-Origin-Resource-Policy headers that Pages cannot set.

### Deep links

The router is a hash router. A project link looks like `https://thumly.io/studio/#/edit/<id>`. Refresh sends the browser to `/studio/`, which exists as a file. Pages is not asked to rewrite unknown paths.

`docs/404.md` stays the documentation 404. Studio does not replace it with `index.html`. A history-mode SPA plus a copied `404.html` is rejected: it would hide missing asset files and would steal the docs 404.

### COOP, COEP, WASM threads

GitHub Pages does not let a repository set `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`. `crossOriginIsolated` stays false, so `SharedArrayBuffer` and threaded WASM do not run.

The required encode path is single-threaded WASM or pure JS, plus a Worker and `OffscreenCanvas` when the browser has them. Those do not need COOP/COEP. The fallback when `OffscreenCanvas` is missing is the same encoder on the main thread. There is no threaded build.

### Language

Docs source is English. [[adr:svgif/20261110120900]] A Korean locale would be `*.ko.md` later, not a second source, and not a substitute for the English Studio shell. Studio UI strings are English in v1.

### Theme tokens

The site uses `jekyll-theme-modootoday` as a remote theme. Tokens are overridden, never forked. Do not copy the theme into this repo. A missing theme feature is an upstream request, not a local fork.

The GitHub README pictures use that palette, including the family orange. The primary call to action uses `--mt-primary` (light `--mt-p-brand-600`, dark `--mt-p-brand-400`). They do not invent a second palette.

### README pictures

`README.md` is the GitHub branding page. The hero and the section pictures are hand-made files in `docs/assets/readme/`. Each file is self-contained: embedded CSS or SMIL, no script, no external reference, and no webfont. Light and dark are `<picture>` variants. After M2, a later package regenerates these pictures with svgif. Until that package, the pictures stay hand-made. Nothing here generates them from the engine.

The css-external limit is the one table in `README.md`. This record does not restate it. The matrix is [[sot:svgif/animation-backends]].

## Why

The owner defined completion as Studio live at `/studio/` on the same Pages host as the theme docs. One artifact, one custom domain, no server rewrites. The library CDN variable stays unset until a later gated upload.

## Verification

M8 in [[plan:svgif/20261110122000]] and [[sot:svgif/roadmap]]. The commands are `scripts/ci/studio-pages-dod.sh` before deploy and a `curl` of the live `https://thumly.io/studio/` URL after deploy. Both must see `data-svgif-studio="app"`. `bash scripts/ci/docs-ia.sh` checks the nav order, the landing action, the retired section, and the unset CDN variable.
