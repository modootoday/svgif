---
id: sot:svgif/external-embed
title: External embed on static Pages
status: active
created: 2026-11-10
updated: 2026-11-10
verify: node scripts/ci/render-external-embed.mjs --self-test
tags: [embed, pages, oembed]
rel:
  depends_on:
    - sot:svgif/html-project
    - sot:svgif/docs-site
    - sot:svgif/studio-export
    - adr:svgif/20261110122600
    - adr:svgif/20261110120600
---

# External embed on static Pages

## Rule

A published work can be embedded from another site without a product server. The only source is the project document's `presentation` object plus `composition.width` and `composition.height`. Open Graph tags, the Twitter card, the oEmbed document, and the `/embed/` page are projections of that object. They are not a second payload in the HTML file. [[adr:svgif/20261110122600]]

`presentation` arrives with `schemaRevision` 1. A revision 0 file has no `presentation` and no card tags. `schemaVersion` stays 1. The oEmbed file shape is `schema/embed/v1.schema.json`. That file arrives with the embed work, after HTML, WebP, and MP4 export. Until the file exists, `scripts/ci/render-external-embed.mjs --self-test` is the check.

### Fields

| Field | Use |
| --- | --- |
| `workId` | Path segment. Lowercase letters, digits, and single hyphens. |
| `title` | `og:title`, `twitter:title`, oEmbed `title`, iframe `title`. |
| `description` | `og:description` and `twitter:description`. |
| `canonicalBase` | `https` origin, with no work id and no site section. Absolute URLs are this string plus a path. |
| `card.video` | `none`, `mp4`, or `webm`. `none` selects oEmbed type `rich`. A video value selects type `video`. |
| `card` image | Always the exporter's WebP poster, `card.webp`, from `posterFrame` (default frame 0). |
| `authorName`, `authorUrl` | Optional oEmbed author fields. Omitted when empty. |
| `twitterPlayer` | Default false. |

`oembedType` may be stored only when it equals the value derived from `card.video`. A disagreement is invalid. The CLI command `embed` is still the copy-source fragment in [[sot:svgif/agent-surface]]. It does not emit this bundle.

### Files on Pages

`canonicalBase` for this repository is `https://thumly.io`. `provider_url` is that origin with a trailing slash. The gallery is `/works/`. A work page is `https://thumly.io/works/<workId>/`. The player is `https://thumly.io/embed/<workId>/`. Those paths are real files at the site root. Pages is not asked to rewrite. CDN object keys stay `https://<cdn-host>/svgif/<version>/<file>` and are not site routes.

| File | What it is |
| --- | --- |
| `/works/` | Gallery of published works. |
| `/works/<workId>/` | Work page. Discovery links and the card meta. |
| `/works/<workId>/oembed.json` | oEmbed 1.0 JSON. The static `/oembed` path. |
| `/works/<workId>/oembed.xml` | The same fields as XML. |
| `/works/<workId>/card.webp` | Poster from the exporter. |
| `/works/<workId>/card.mp4` or `card.webm` | Present only when `card.video` says so. |
| `/embed/<workId>/` | The player page loaded by the iframe. |

The work page, and a hosted HTML export, include:

```html
<link rel="alternate" type="application/json+oembed" href="https://thumly.io/works/<workId>/oembed.json" title="...">
<link rel="alternate" type="text/xml+oembed" href="https://thumly.io/works/<workId>/oembed.xml" title="...">
```

The JSON `href` is the static `/oembed` file. There is no `?url=` endpoint. `maxwidth` and `maxheight` cannot be applied. `width` and `height` are the composition's pixel size. The embed page uses CSS `aspect-ratio` so the consumer's iframe box scales the player.

oEmbed `html` is one iframe whose `src` is `https://thumly.io/embed/<workId>/`. `provider_name` is `Thumly`. `provider_url` is `https://thumly.io/`. `thumbnail_url` is the WebP poster.

A consumer that only reads a provider registry will not see this work until a person registers the provider. This repository does not run that registry. [[adr:svgif/20261110122600]]

### Card meta

These tags are emitted from the same fields. `twitter:card` is `summary_large_image`.

| Tag | Source |
| --- | --- |
| `og:title`, `twitter:title`, `svgif:title` | `presentation.title` |
| `og:description`, `twitter:description`, `svgif:description` | `presentation.description` |
| `svgif:work` | `presentation.workId` |
| `og:image`, `twitter:image` | `card.webp` |
| `og:video` and `og:video:type` | The mp4 or webm file, only when `card.video` is not `none` |
| `twitter:player` | The embed page URL, only when `twitterPlayer` is true |

`twitter:player` needs a separate approval from X before that site shows a player. The tag is optional. A missing approval does not fail the card. The release row checks `summary_large_image` and does not require the player tag. Open Graph is specified at <https://ogp.me/>. oEmbed is specified at <https://oembed.com/>.

### Embed page

`/embed/<workId>/` is a player document. The first response does not load `studio.js`. An Edit control, or the hash `#edit`, follows the same lazy Studio load as a saved HTML file. [[sot:svgif/html-project]]

The page is responsive: the player box uses the composition `aspect-ratio` and `width: min(100%, <width>px)`. It is safe to place in an iframe. A `<meta http-equiv="Content-Security-Policy">` sets `default-src 'none'`, images from `'self'` and `data:`, inline styles, and scripts from `'self'`. The document does not include `frame-ancestors`. That directive is ignored in a meta policy, and GitHub Pages cannot set response headers, so the page cannot restrict which sites frame it. Consumers may sandbox the iframe with `allow-scripts`. Combining `allow-scripts` with `allow-same-origin` removes the sandbox boundary. Do not document that pair as a lock.

### CDN snippet

An embed snippet that loads the library is a script element. The player page at `/embed/<workId>/` stays a document of its own and does not include this script. [[sot:svgif/html-project]] already requires subresource integrity on a pinned CDN runtime. The same rule applies to this snippet.

The script `src` is an exact-version URL: `https://<cdn-host>/svgif/<version>/<file>`. `<version>` is `major.minor.patch`, with an optional prerelease or build. The element sets `integrity` to the sha384 digest of those bytes and `crossorigin="anonymous"`.

A snippet must not set `integrity` on `/svgif/latest/` or `/svgif/<major>/`. Those paths are aliases. A later response can return different bytes, so a digest stored on the snippet would be wrong.

The library origin is `cdn.thumly.io` once `SVGIF_CDN_BASE` is set. That variable stays unset. This record does not claim the CDN objects are already uploaded. The generator does not read `SVGIF_CDN_BASE` and does not fill in `cdn.thumly.io`.

jsDelivr (`https://cdn.jsdelivr.net/npm/@modootoday/svgif`) and unpkg (`https://unpkg.com/@modootoday/svgif`) may be named only as secondary documentation URLs. They are not the origin for `cdn.thumly.io`.

The generator rejects an exact-version snippet that lacks `integrity`, and it rejects an alias URL that carries `integrity`.

### Who writes the bytes

1. Studio save and Export HTML store `presentation` in the project JSON. The `svgif:title`, `svgif:description`, and `svgif:work` meta tags must match. Absolute card tags are written when `canonicalBase` is set. [[sot:svgif/html-project]]
2. The poster and the optional video are the existing in-browser exporter. The generator does not encode.
3. `node scripts/ci/render-external-embed.mjs` reads one project and writes the oEmbed JSON, the XML twin, the card meta list, and the embed page. It fails if `canonicalBase` is not `https`. The same script checks a CDN snippet: an exact version requires a sha384 `integrity` and `crossorigin="anonymous"`, and an alias path must not carry `integrity`. The Pages build copies those files onto `_site` after Jekyll. No step calls an encode server.

The role `export` owns the generator and the evidence. The role `schema` owns `schema/embed/`. The role `studio` owns the Save control that fills `presentation`. The role `docs` owns the URL rows on [[sot:svgif/docs-site]] and does not own the generator.

## Why

A static host can ship a file per work. It cannot answer `?url=` and it cannot set `frame-ancestors`. Naming those limits in the contract keeps a later page from inventing a server.

## Verification

`node scripts/ci/render-external-embed.mjs --self-test`. That self-test fails if a generated URL still uses `https://thumly.io/svgif/works/` or `https://thumly.io/svgif/embed/`. It also fails if an exact-version snippet lacks `integrity`, or if an alias URL carries `integrity`. Milestone M11 in [[sot:svgif/roadmap]]. Release rows `oembed-json`, `social-card`, and `embed-player` in [[sot:svgif/release-gate]].
