---
title: API
description: API reference. The engine is not shipped yet.
lang: en
---

# API

This page is the developer guide entry. The engine is not shipped, so this page does not list callable functions.

The package is `@modootoday/svgif`. Render output is SVG. Timelines sample integer frames. Playback and export run in the browser. There is no product server and no server-side encode.

Embed snippets, when a release exists, pin an exact version and carry subresource integrity. Exact-version URLs are the ones that carry SRI. Alias URLs do not. `SVGIF_CDN_BASE` is unset. Once `SVGIF_CDN_BASE` is set, the origin is `https://cdn.thumly.io/svgif`. jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`. Studio on Pages uses relative URLs and does not boot from the CDN. CDN object keys `/svgif/<version>/` stay.

Related pages: [CLI](/docs/reference/cli/), [Schema](/docs/reference/schema/), [Agents](/docs/agents/).

Releases follow `.github/RELEASING.md`. A docs change does not cut a version.
