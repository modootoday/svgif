---
handoff: 1
id: H-OVERLAY-PRESETS
from: orch
to: orch
wp: WP-OVERLAY-PRESETS
milestone: M6
status: done
branch: cursor/overlay-presets-9f5d
pr: "https://github.com/modootoday/svgif/pull/46"
paths:
  - .agents/handoff/assignments/H-035.md
  - .agents/handoff/assignments/H-036.md
  - .agents/handoff/assignments/H-037.md
  - .agents/handoff/assignments/H-038.md
  - .agents/handoff/assignments/H-039.md
  - .agents/handoff/assignments/H-040.md
  - .agents/handoff/outbox/orch/H-OVERLAY-PRESETS.md
---

# Handoff H-OVERLAY-PRESETS

## State

Owner directive, 2026-11-11. Studio overlays elements on the artboard, and component presets are an unbounded registry under `presets/`. Commit `2aa2ad6`. H-016 is running. H-031 through H-034 are filed and not merged. None of these new packages are ready to start.

## Done

Filed six packages. H-035 (`govern`) writes the ADR, the org-chart grants, the license rule, and the plan rows. H-036 (`schema`) adds `schema/preset/` and the registry record. H-037 (`studio`) generates the preset index and records overlay editing. H-038 (`animation`) records an optional motion preset on one node's tracks. H-039 (`release`) lists the five preset checks on the release gate without changing the evidence-pair count. H-040 (`security`) scans `presets/`.

The catalogue and the engine-gap packages are not filed. Each design record leaves a `Catalogue and engine gaps` section empty of those behaviors.

## Next

Start none of H-035 through H-040 until the named blocker is merged. Each pull request opens against `main`.

## Blockers

None for this filing.

## Links

- Work package: `WP-OVERLAY-PRESETS`
- Pull request: https://github.com/modootoday/svgif/pull/46

## DoD

- [x] Predecessor work packages are `done` in their outbox files
- [x] The diff touches only paths owned by `to` in the org chart
- [x] The checklist in the plan for this work package is checked
- [ ] `spec check` is green
