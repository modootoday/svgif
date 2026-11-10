---
id: adr:svgif/20261110154621
title: Thumly.io is the Pages host
status: active
created: 2026-11-10T15:46:21Z
updated: 2026-11-10T15:49:06Z
rel:
  depends_on: [adr:svgif/20261110120600]
---

# Thumly.io is the Pages host

## Context

svgif.js stays the open-source engine. The repository is `modootoday/svgif`. The package is `@modootoday/svgif`. The license stays MIT OR Apache-2.0. [[adr:svgif/20261110120800]] [[adr:svgif/20261110122100]]

The docs site is GitHub Pages, not Cloudflare. [[adr:svgif/20261110120600]] That decision left the public origin as the project Pages site `https://modootoday.github.io/svgif` with Jekyll `baseurl: /svgif`, and left a custom domain open.

Thumly, at `thumly.io`, is the live product: a static-only animated SVG sticker studio and playground built on svgif. It has no product server. Its source directory is `apps/thumly`. This decision does not create that directory, and the engine is still not shipped.

## Decision

The GitHub Pages site for this repository uses the custom domain `thumly.io` (CNAME). `https://thumly.io/` is the Thumly root. The svgif landing, Studio, the guide, and the developers pages are the `/svgif/` section of that same site.

This replaces the project-pages origin `https://modootoday.github.io/svgif` and its Jekyll `baseurl: /svgif`. The site is served at the domain root, with an empty `baseurl`. `/svgif/` is a section path on that site, not a project-pages baseurl.

`cdn.thumly.io` is Thumly's asset CDN. It is not `SVGIF_CDN_BASE` and it is not the Pages host. The library CDN hostname stays unset.

Milestone 0 schema `$id` values use `https://thumly.io/svgif/schema/`. The schema role records that in [[sot:svgif/schema-versioning]]. This decision does not edit that file.

Cloudflare remains the library CDN only. It is not the docs host and not an encoder. This decision does not reverse [[adr:svgif/20261110120600]] beyond the public host and the project-pages base path.

## Consequences

Open question 2 is resolved: the Pages custom domain is `thumly.io`. Open question 1 stays the unset library CDN hostname. Schema `$id` values are not left on `modootoday.github.io`.

The Thumly app and any live replacement of the `/svgif/` section placeholder start only after M0 has merged. The host change itself is not a milestone gate in front of M0.

[[adr:svgif/20261110120600]] stays in force for Pages rather than Cloudflare. This record depends on it and replaces only the public host and the project-pages `baseurl`.
