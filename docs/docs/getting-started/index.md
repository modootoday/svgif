---
layout: doc
title: Getting started
description: How to open Studio and install the package when a release exists.
lang: en
---

# Getting started

The engine is not shipped. Studio is not built. These steps name the intended path. They do not describe a running library. The library is a scene graph and cameras, with frame-exact timelines and compositions. The render stays SVG.

[Open Studio](/studio/)

When a release exists, install the scoped package:

```
npm install @modootoday/svgif
```

Do not install the unscoped npm package `svgif`.

`SVGIF_CDN_BASE` is unset. Once `SVGIF_CDN_BASE` is set, the origin is `https://cdn.thumly.io/svgif`. Until that upload, do not load the library from a CDN URL. jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`. Exact-version URLs are the ones that carry SRI. Alias URLs do not.

The user guide is [Guide](/docs/guides/).
