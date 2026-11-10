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
3. The CDN is for those artifacts only. Docs and Studio hosting are GitHub Pages. [[adr:svgif/20261110120600]]
4. npm publish is the release workflow's provenance publish. It does not run on a branch push. [[sot:svgif/release-gate]]
5. Saved HTML pins the same version and carries SRI for the runtime and for Studio. The Pages app at `/studio/` uses relative URLs and does not boot from the CDN.

## Why

A floating `latest` path would change a file the user already saved. The scoped name avoids the unrelated 2021 package.

## Verification

`scripts/ci/check-package-name.sh` fails if `docs/` or `README.md` tells a reader to `npm install svgif` without the scope. The release workflow shape check fails if publish is wired to a branch push.
