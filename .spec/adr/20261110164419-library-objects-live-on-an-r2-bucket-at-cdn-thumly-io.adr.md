---
id: adr:svgif/20261110164419
title: Library objects live on an R2 bucket at cdn.thumly.io
status: active
created: 2026-11-10T16:44:19Z
updated: 2026-11-10T16:46:05Z
rel:
  depends_on: [adr:svgif/20261110120600, adr:svgif/20261110154621, sot:svgif/open-questions]
---

# Library objects live on an R2 bucket at cdn.thumly.io

## Context

The docs site and Studio stay on GitHub Pages. [[adr:svgif/20261110120600]] The Pages custom domain is `thumly.io`. [[adr:svgif/20261110154621]] Those records left the library CDN hostname unset. The variable name is `SVGIF_CDN_BASE`. While it is unset, `cdn.thumly.io` is not that value.

Library objects need a host that keeps an exact version forever, serves an alias that moves, and accepts a cache header chosen per object. There is no product server. This decision does not create a bucket, does not upload an object, and does not set the variable.

## Decision

The library origin is an R2 Standard bucket with the custom domain `cdn.thumly.io`, on the same account as the zone. Do not enable the r2.dev development URL. Do not document a CNAME to r2.dev. [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Exact-version paths are immutable and carry SRI. Aliases `/svgif/<major>/` and `/svgif/latest/` use `Cache-Control: public, max-age=300, must-revalidate` and are purged per URL after each upload.

Upload runs only after the release gate, in Environment `cdn-release`, with a least-privilege API token. Official CI OIDC for this upload does not exist. Auth is an API token, not OIDC. [Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/). If Cloudflare later documents CI OIDC for R2, a new ADR replaces the token. Do not add a third-party OIDC broker.

jsDelivr and unpkg are secondary documentation URLs and are never the origin.

`SVGIF_CDN_BASE` stays unset until the first gated release uploads there. The value then is `https://cdn.thumly.io/svgif`.

These alternatives are rejected:

- Workers Static Assets. A deploy is a snapshot, so old version URLs have to be uploaded again with every release. The default cache is `public, max-age=0, must-revalidate`. [Headers](https://developers.cloudflare.com/workers/static-assets/headers/). [Limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
- A separate Cloudflare Pages project. It has the same snapshot limit. Extra cache rules on a custom domain can keep serving the previous asset, and the Pages docs then point at a full purge. A project connected to Git cannot switch to direct upload. The product site is already GitHub Pages. [Serving](https://developers.cloudflare.com/pages/configuration/serving-pages/). [Limits](https://developers.cloudflare.com/pages/platform/limits/).
- jsDelivr or unpkg as the origin, or a proxy in front of them. Exact npm versions can stay immutable on jsDelivr, and SRI belongs only on URLs whose bytes do not change. A branded `cdn.thumly.io` pointed at those hosts is not an official custom-domain setup, and a Worker that rewrites the Host is a supply chain this repo does not control. [jsDelivr SRI](https://www.jsdelivr.com/using-sri-with-dynamic-files). [jsDelivr](https://github.com/jsDelivr/jsDelivr).

## Consequences

Open question 1 is resolved by this ADR. The trademark question stays open. Question 4 stays open.

[[adr:svgif/20261110154621]] stays in force for the Pages host. Its sentence that `cdn.thumly.io` is not `SVGIF_CDN_BASE` described the unset variable. After the first gated upload, the value is `https://cdn.thumly.io/svgif`. Until that upload the variable stays unset. This decision does not edit [[sot:svgif/distribution]] and does not dispatch the release workflow.

[[sot:svgif/package-layout]] records the same unset-until-upload rule. The tier-2 dry-run and the tier-3 URL checks are named in [[plan:svgif/20261110122000]] and stay unchecked until that evidence exists.
