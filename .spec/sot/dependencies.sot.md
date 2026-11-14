---
id: sot:svgif/dependencies
title: Dependency inventory
status: active
created: 2026-11-10
updated: 2026-11-14
verify: manual
tags: [license, dependencies]
rel:
  depends_on:
    - sot:svgif/licensing
    - adr:svgif/20261110121700
---

# Dependency inventory

## Rule

Nothing in this table is installed in the design snapshot. Versions were read from the public npm registry on 2026-11-10. A later bump updates this table in the same pull request as the lockfile. Every adopted library must be redistributable on the CDN under MIT OR Apache-2.0 plus its own notice. GPL and LGPL are rejected. Deprecated packages are rejected. Adoption, the advisory clock, and the lockfile scan are [[sot:svgif/supply-chain]]. This table is the inventory.

| Library | Version checked | License | Role | Decision |
| --- | --- | --- | --- | --- |
| `mediabunny` | 1.65.2 | MPL-2.0 | Mux MP4 (AVC from WebCodecs) and WebM in the browser. Pure TypeScript, no native ffmpeg. Considered in place of `mp4-muxer` 5.2.2 and `webm-muxer` 5.1.4, both MIT and both marked deprecated by the author. | Not adopted. WebM and MP4 are muxed by `webm.ts` and `mp4.ts` in the export package. Picture tracks come from the browser `VideoEncoder`. |
| `gifenc` | 1.0.3 | MIT | Pure-JS GIF, small. | Optional exporter `gif`. Not required for M8. |
| `@jsquash/webp` | 1.5.0 | Apache-2.0 | Animated WebP via libwebp (BSD-3) compiled to single-threaded WASM. | Not adopted. Animated WebP is the pure TypeScript VP8L writer in `packages/svgif-export/src/webp.ts`. There is no WebP wasm. |
| `fflate` | 0.8.3 | MIT | Unzip a local project `.zip` and zip a `css-external` pair. A few kilobytes. | Not adopted. The css-external zip is written in the package. JSON and HTML open do not need it. |
| Editor frameworks (React, Vue, Svelte, and similar) | — | — | Would ship inside `studio.js` and inside any embed-studio file. | Do not adopt. Studio UI is DOM and CSS in the studio package. |
| `mp4-muxer`, `webm-muxer` | 5.2.2 / 5.1.4 | MIT | Superseded. | Do not adopt. |
| ffmpeg, GPL or LGPL builds | — | GPL or LGPL | Server or WASM encode. | Do not adopt. |
| `@mediabunny/aac-encoder` | — | MPL-2.0 wrapping LGPL ffmpeg AAC | Audio. | Do not adopt. v1 exports have no audio track, so no AAC encoder is required. |

`MediaRecorder` and `VideoEncoder` are browser APIs, not dependencies. H.264 (`avc1`) through `VideoEncoder` is the MP4 path. A missing AVC encoder throws `ExportCapabilityError` with `codec-unsupported` and writes no file. It does not try `MediaRecorder`. It does not send frames to a server.

Bundle rule: `svgif.mjs` (player) stays free of mediabunny, gifenc, jsquash, and fflate. `studio.js` may contain the export package. Sizes are checked when the bundles exist: the player gzip budget is 80 KB and the studio gzip budget is 400 KB. There is no WebP wasm, so the studio gzip budget does not exclude one.

## Why

WebM and MP4 are muxed in the export package. Animated WebP is a pure TypeScript VP8L writer in that package. The css-external zip is written in the package. `mediabunny`, `@jsquash/webp`, and `fflate` are not adopted. Deprecated muxers stay rejected. A UI framework does not earn its weight in the file users re-save.

## Verification

Before the export package's first lockfile, a person re-checks the npm license field against this table. `scripts/ci/export-gate.sh` later fails if `packages/svgif/package.json` depends on any row marked "Do not adopt".
