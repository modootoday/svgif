---
id: research:svgif/20261117193735
title: Build cache and size
status: active
created: 2026-11-17T19:37:35Z
updated: 2026-11-17T19:37:35Z
rel:
  depends_on: [sot:svgif/supply-chain]
---

# Build cache and size

## Question

What does each CI run download again, and which caches would pay for themselves? A pull request must never write a cache. Are build outputs or installed packages tracked or cached? How large have the repository and the preset goldens grown?

## Method

On 2026-11-17, at `main` commit `4cd2c72`:
- Read every workflow under `.github/workflows/` for cache steps and install steps.
- Read the log of the CI job `E2E rehearsal (Chromium, local build)`, job 133800473883, for download sizes and timings.
- Measured the tracked tree with `git ls-files`, the pack with `git count-objects -vH`, and the repository with the GitHub repository API.
- Ran `npx playwright install --dry-run` with the locked Playwright 1.65.0.

This session's proxy refuses the Actions cache API. The cache totals per repository, and the cache on the owner's computer, are in a separate survey.

## Findings

### CI downloads

| Item | Per run before | Note |
| --- | --- | --- |
| Playwright Chrome for Testing 158 | 197.8 MiB | The runners launch headless. Headless Chromium is the headless shell, so this download is not used |
| Playwright Chromium headless shell 158 | 125.9 MiB | Used |
| Playwright FFmpeg | 2.2 MiB | Used |
| Playwright Firefox and WebKit (`e2e.yml` only) | downloaded each dispatch | Used |
| `npm ci` | 7 packages in 0.8 s | A cache would save under a second |
| System packages from `--with-deps` | about 22 MB of fonts, from the runner's mirror | Not cacheable with the action, and small |

No workflow cached the Playwright browsers, so every CI run on a pull request or on `main` downloaded 326 MiB.

Two `actions/setup-node` steps left the action's own package cache on:
- Published artifacts in `ci.yml`.
- The audit step in `supply-chain.yml`.

That cache saves from every event, pull requests included. Every other step had already turned it off.

`oven-sh/setup-bun` restores a 32 MB cache of the Bun binary. That cache is keyed by the Bun version, so a pull request reads the copy `main` wrote.

### Tracked files

- No `node_modules/`, `dist/`, coverage, browser download, or generated site is tracked. `.gitignore` names each of them.
- The largest tracked file is `scripts/ci/check-presets.mjs`, at 342 KiB. No tracked file is over 1 MiB.
- `apps/studio/src/player-bundle.ts`, at 78 KiB, is the one generated file that is tracked. The type check and the tests read it without a build. It had gone stale on `main` once, before H-318.
- `.agents/handoff/assignments/catalogue-components.v1.json` repeats `schema/catalogue/components.v1.json`. Git stores one blob for both, so the copy costs no space.

### Size

| Measure | Value |
| --- | --- |
| Repository on GitHub | 5.2 MB |
| Tracked files in the working tree | 16.9 MB |
| `presets/` | 10.9 MB in 1,064 files |
| Preset documents | 532 files, 6.9 MiB |
| Golden SVGs | 532 files, 3.8 MiB |
| `.agents/` | 2.7 MB |

Each preset document and each golden already has its own byte budget in [[sot:svgif/preset-registry]], at 64 KiB and 32 KiB. The registry is unbounded by decision. The goldens are plain SVG text, and they compress well in the pack.

## Conclusion

The waste is the browser download, not the repository.
- Most of the 326 MiB a run downloads can be cached.
- 198 MiB of it is not needed at all.

The npm cache is not worth its storage. The repository is small, and its growth is set by per-file budgets that already hold.

## Recommendation

[[sot:svgif/supply-chain]] records the cache rules:
- Restore the Playwright browsers in every run, and save them only from `main`. The key is the runner OS, the locked Playwright version, and the browser set.
- Install Chromium with `--only-shell`.
- Turn off the `setup-node` package cache in the two steps that still had it.
- Use no Actions cache in the release and Pages workflows.
- Fail the supply-chain check when the combined `actions/cache` step is used, or when a save step is not limited to `main`.

The supply-chain check also fails in these cases:
- A build output or an installed tree is tracked.
- A tracked file is over 1 MiB.
- The committed player bundle differs from a fresh build. The rule is in [[sot:svgif/supply-chain]], and the step that enforces it is in CI.

The check prints the registry's size on every run, so its growth is visible without a cap.

## Verification

`bash scripts/ci/check-supply-chain.sh --self-test` and the same command without the flag. `actionlint` and `zizmor --offline .github/workflows` report nothing. On the first run on `main` after the change, the rehearsal job logs a cache save, and the next pull request run logs a cache hit with no browser download.
