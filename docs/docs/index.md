---
title: svgif.js
description: SVG-only animation. Studio is the primary action. The engine is not shipped yet.
lang: en
---

# SVG animation that stays SVG

svgif.js draws frames as SVG. The package is `@modootoday/svgif`. This site is the design introduction. The engine is not shipped. The editor is not built yet.

[Open Studio](/studio/)

## Pages

- [Getting started](/docs/getting-started/)
- [Guide](/docs/guides/)
- [API](/docs/reference/api/)
- [CLI](/docs/reference/cli/)
- [Schema](/docs/reference/schema/)
- [Agents](/docs/agents/)
- [Player](/embed/)
- [Examples](/works/)
- [oEmbed](/oembed)

The machine-readable schema is `/schema/svgif/v1.json`. The schema role publishes that file.

## Library CDN

`SVGIF_CDN_BASE` is unset. This page does not say the CDN is already serving files. Once `SVGIF_CDN_BASE` is set, the origin is `https://cdn.thumly.io/svgif`. jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`. Exact-version URLs are the ones that carry SRI. Alias URLs do not. Studio on Pages uses relative URLs and does not boot from the CDN. CDN object keys `/svgif/<version>/` stay.
