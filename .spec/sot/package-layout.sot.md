---
id: sot:svgif/package-layout
title: Package and directory layout
status: active
created: 2026-11-10
updated: 2026-11-10
verify: manual
tags: [repo]
rel:
  depends_on:
    - sot:svgif/architecture
    - sot:svgif/licensing
---

# Package and directory layout

## Rule

Precedence is [[sot:svgif/conventions-adopted]]: npm, Jekyll, GitHub, JSON Schema, and specfold each keep their own idioms. The design snapshot does not create `packages/` or `apps/` yet. The first implementation work package creates them in this shape.

```
package.json                    private, "workspaces": ["packages/*", "apps/*"]
tsconfig.base.json              shared compilerOptions only
packages/<name>/
  package.json                  "exports", "files": ["dist"], "type": "module"
  tsconfig.json                 extends the root base
  src/                          implementation, one folder per module
  test/                         *.test.ts
  dist/                         build output, not committed
apps/studio/                    same package shape; Vite writes dist/
apps/thumly/                    same package shape; static Thumly product
docs/                           Jekyll source (_config.yml, _data, _layouts, _includes, assets)
schema/                         *.schema.json ($id, $schema)
.spec/                          specfold types
.github/                        workflows, ISSUE_TEMPLATE, CODEOWNERS, dependabot.yml
```

1. Root `workspaces` is the npm field. pnpm and Bun read that field. Do not add `pnpm-workspace.yaml` or a Bun-only workspace file unless the chosen installer cannot see `workspaces`.
2. Each package's `exports` points at `dist` for `import` and `types`. The core package also ships an IIFE build and `svgif.css` (player chrome only). Composition CSS is not `svgif.css`. [[sot:svgif/distribution]]
3. Tests live in `test/`, not in a sibling-specific `__tests__` tree and not beside `src` as loose scripts. The runner may be Vitest.
4. `packages/svgif` holds math, scene, ir, clock, path, project, shade, bake, backend, lower, and player under `src/`. `packages/svgif-export` holds browser encoders. It does not open a socket. [[adr:svgif/20261110121100]] [[sot:svgif/client-runtime]] `packages/svgif-cli` and `packages/svgif-mcp` are adapters and appear with `WP-AGENT`. They do not own a second copy of validate, migrate, compile, or export. [[sot:svgif/agent-surface]]
5. `apps/studio` is the static Studio at `/studio/`. Its `dist/` is copied onto the Jekyll `_site/studio` directory after `jekyll build`. Jekyll's output directory stays `_site`, which is Jekyll's name, not `dist`. [[sot:svgif/docs-site]]
6. `apps/thumly` is the only Thumly app directory. It is the static Thumly product, a sticker studio and playground on the same engine. `apps/studio` is the `/studio/` editor and is not a second Thumly app. [[adr:svgif/20261110154621]] [[adr:svgif/20261110160436]] This document names `apps/studio` and `apps/thumly`. It does not create either tree, and it does not add another Thumly app directory.
7. `schema/` is not a Jekyll collection. Schema `$id` values use `https://thumly.io/schema/svgif/`. The Pages workflow copies `schema/` to `_site/schema` so each `$id` resolves. [[sot:svgif/schema-versioning]]
8. One work package owns one package directory. Two agents do not edit the same package.
9. `SVGIF_CDN_BASE` stays unset until the first gated release uploads the library objects. The value then is `https://cdn.thumly.io/svgif`. This document does not create that bucket and does not set the variable. [[adr:svgif/20261110164419]]
10. Live pages are the Thumly landing at `https://thumly.io/`, Studio at `/studio/`, and the docs home at `/docs/`. The Jekyll `baseurl` stays empty. The old `/svgif/` URLs are removed. Do not add a redirect, a meta refresh, or a `rel=canonical` stub for them. CDN object keys `/svgif/<version>/` are not site routes and stay. [[adr:svgif/20261110154621]]

## Why

`packages/*` and `apps/*` are how npm workspaces separate libraries from applications. `src/`, `test/`, and `dist/` are the directories TypeScript tools already compile and ignore. Jekyll, GitHub, JSON Schema, and specfold keep their own trees so a sibling monorepo's Rust or Go layout cannot rename them.

## Verification

A person checks this tree has no `packages/svgif/src` yet. After `WP-TYPES`, `spec check` plus the package's typecheck script.
