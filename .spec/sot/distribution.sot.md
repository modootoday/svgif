---
id: sot:svgif/distribution
title: npm and CDN distribution
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [npm, cdn]
rel:
  depends_on:
    - adr:svgif/20261110121000
    - adr:svgif/20261110122100
    - adr:svgif/20261110164419
    - sot:svgif/release-gate
---

# npm and CDN distribution

## Rule

1. The package name is `@modootoday/svgif`. Later packages use the `@modootoday/` scope. Docs, README, and CDN examples use that scoped name. The unscoped npm name `svgif` belongs to an unrelated project created in 2021 and is not an install target.
2. Code objects are immutable: `/svgif/<npm-version>/svgif.mjs`, `svgif.js`, `svgif.css`, `studio.js`, and `studio.css`. A version path is never overwritten. Schema files live at `/svgif/schema/...` and are also never overwritten; a new schema version is a new path.
3. Docs and Studio are served by this repository's GitHub Pages site. The canonical Pages origin is `https://thumly.io` with no `www` hostname. `www.thumly.io` redirects to `https://thumly.io/` and is not a second site. The site root is Thumly. Studio on Pages is `/studio/`. The docs home is `/docs/`. The machine-readable schema on the site is `/schema/svgif/v1.json`. The old `/svgif/` section is removed. CDN object keys stay `/svgif/<npm-version>/`. [[adr:svgif/20261110120600]]
4. The library origin is an R2 Standard bucket served at the custom domain `cdn.thumly.io`. [[adr:svgif/20261110164419]] There is no product server. `cdn.thumly.io` is not the Pages host. `SVGIF_CDN_BASE` stays unset. It becomes `https://cdn.thumly.io/svgif` only when the first gated release uploads there. This record does not set that variable and does not publish a second npm package.

   Exact version: `/svgif/<x.y.z>/`. Written once. `Cache-Control: public, max-age=31536000, immutable`. SRI is required for the JS and CSS objects. `integrity.json` for that version is immutable and lives on this prefix. The hash algorithm is sha384.

   Aliases: `/svgif/<major>/` and `/svgif/latest/`. `Cache-Control: public, max-age=300, must-revalidate`. No SRI on these URLs.

   Content types set at upload: `.js` and `.mjs` are `application/javascript; charset=utf-8`, `.css` is `text/css; charset=utf-8`, `.svg` is `image/svg+xml; charset=utf-8`, `.json` is `application/json; charset=utf-8`.

   Upload the raw bytes. Do not set `no-transform`. Edge compression is the zone's job. SRI is over the decoded bytes.

   Required response headers, configured by the owner on the zone: `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin`, `Referrer-Policy: no-referrer-when-downgrade`. Do not put a strict Content-Security-Policy on these responses.

   Bucket CORS, the owner-applied policy: `GET` and `HEAD`, allowed origins `*`.

   jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`.

   Public references: [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [default cache](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/), [purge](https://developers.cloudflare.com/cache/how-to/purge-cache/), [compression](https://developers.cloudflare.com/speed/optimization/content/compression/), [transform rules](https://developers.cloudflare.com/rules/transform/), [jsDelivr SRI](https://www.jsdelivr.com/using-sri-with-dynamic-files).
5. npm publish is the release workflow's provenance publish. It does not run on a branch push. [[sot:svgif/release-gate]]
6. Saved HTML pins the same version and carries SRI for the runtime and for Studio. The Pages app at `/studio/` uses relative URLs and does not boot from the CDN.

## Why

A floating `latest` path would change a file the user already saved. The scoped name avoids the unrelated 2021 package. The canonical Pages origin has no `www` hostname. Exact-version keys are written once so a saved file can pin them. Alias keys move, so they do not carry SRI.

## Verification

`scripts/ci/check-package-name.sh` fails if `docs/` or `README.md` tells a reader to `npm install svgif` without the scope. The release workflow shape check fails if publish is wired to a branch push. `bash scripts/ci/check-release-workflow.sh` fails if this record or `release.yml` contradicts those headers, marks an alias immutable, or attaches SRI to an alias URL. jsDelivr and unpkg are not the origin of `cdn.thumly.io`.
