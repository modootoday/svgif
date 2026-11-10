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
    - sot:svgif/release-gate
---

# npm and CDN distribution

## Rule

1. The package name is `@modootoday/svgif`. Later packages use the `@modootoday/` scope. Docs, README, and CDN examples use that scoped name. The unscoped npm name `svgif` belongs to an unrelated project created in 2021 and is not an install target.
2. Code objects are immutable: `/svgif/<npm-version>/svgif.mjs`, `svgif.js`, `svgif.css`, `studio.js`, and `studio.css`. A version path is never overwritten. Schema files live at `/svgif/schema/...` and are also never overwritten; a new schema version is a new path.
3. Docs and Studio are served by this repository's GitHub Pages site. The canonical Pages origin is `https://thumly.io` with no `www` hostname. `www.thumly.io` redirects to `https://thumly.io/` and is not a second site. The site root is Thumly. The svgif landing, Studio, guide, and developers pages are the `/svgif/` section. [[adr:svgif/20261110120600]]
4. `cdn.thumly.io` is Thumly's static asset host. It is not the Pages host and it is not `SVGIF_CDN_BASE`. Immutable library objects stay `/svgif/<npm-version>/` on `SVGIF_CDN_BASE`, which is still unset. This record does not set that variable and does not publish a second npm package.
5. npm publish is the release workflow's provenance publish. It does not run on a branch push. [[sot:svgif/release-gate]]
6. Saved HTML pins the same version and carries SRI for the runtime and for Studio. The Pages app at `/svgif/studio/` uses relative URLs and does not boot from the CDN.

## Why

A floating `latest` path would change a file the user already saved. The scoped name avoids the unrelated 2021 package. The canonical Pages origin has no `www` hostname. The library CDN hostname stays unset, so `cdn.thumly.io` is not `SVGIF_CDN_BASE`.

## Verification

`scripts/ci/check-package-name.sh` fails if `docs/` or `README.md` tells a reader to `npm install svgif` without the scope. The release workflow shape check fails if publish is wired to a branch push.
