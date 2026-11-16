---
id: adr:svgif/20261116060632
title: Completion milestones M12 through M16
status: active
created: 2026-11-16T06:06:32Z
updated: 2026-11-16T06:06:48Z
rel:
  depends_on: [adr:svgif/20261110122200, adr:svgif/20261110122100, adr:svgif/20261114074819]
---

# Completion milestones M12 through M16

## Context

[[sot:svgif/roadmap]] ended at M11. The final definition of done in [[plan:svgif/20261110122000]] is three tiers on one commit, and no milestone named the work between the feature milestones and that commit. A measurement on 2026-11-16 at commit `eccea34a14c894e790ccaff9f37aab49a2488c30` found the five root gate scripts missing, export coverage under the Tier 1 floor, 136 of 476 v1 catalogue types with a preset, two required checks failing on a Dependabot pull request, and 0 of 55 release-readiness rows with evidence.

## Decision

1. The roadmap gains M12 through M16: root gates run, Tier 1 closed, Tier 2 closed, the scenario matrix, and `v0.1.0`. M0 through M11 keep their numbers and their text.
2. M12 has no predecessor. M13 waits for M12. M14 runs beside both. M15 waits for M8, M10, M11, and M13. M16 waits for M14 and M15 on the same commit.
3. M13 requires a v1 gap of 0 from `node scripts/ci/preset-coverage.mjs`. A type leaves v1 only through a catalogue change by its owner. The gap is not closed by lowering the floor in the script.
4. M14 requires the required checks to pass on a Dependabot pull request. The deny-term secret is added to the Dependabot secrets by the owner. The checks are not relaxed for that actor.
5. M16 is reached only by the release role dispatching `mode=release`. No other session tags, publishes, or dispatches. [[adr:svgif/20261110122200]] [[adr:svgif/20261110122100]]
6. The measured state in the roadmap is a snapshot. A later measurement replaces it and does not need a new decision.

## Consequences

[[sot:svgif/roadmap]] lists M12 through M16, their order, their roles, and the measured state. [[plan:svgif/20261110122000]] points at them from its final definition of done and its traceability table. The org chart gives the roadmap and the plan to `govern`. Work packages for M12 through M16 are assigned one role and one pull request at a time under [[sot:svgif/handoff]]. A session without the release role stops at M15 evidence and reports M16 as not started.
