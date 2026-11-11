---
handoff: 1
id: 20261111T011100Z-mockups-ink-done
from: orch
to: owner
wp: WP-PRESET-MOCKUPS-INK
milestone: M6
status: done
branch: cursor/mockups-ink-done-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-112.md
  - .agents/handoff/assignments/H-113.md
  - .agents/handoff/assignments/H-115.md
  - .agents/handoff/assignments/H-116.md
  - .agents/handoff/assignments/H-118.md
  - .agents/handoff/assignments/H-121.md
  - .agents/handoff/assignments/H-123.md
  - .agents/handoff/assignments/H-125.md
  - .agents/handoff/assignments/H-129.md
---

# Handoff 20261111T011100Z-mockups-ink-done

## State

The twelve mockups are on main. Other category goldens are still stale against the current generator.

## Done

- Merged https://github.com/modootoday/svgif/pull/226 at `3c8febb`. H-116 is `done`. Each mockup has an ink path at `#141414` and a 1.5 px `#3a3a38` body outline. The mockups vision review is running.
- H-112, H-113, H-115, H-118, H-121, H-123, and H-125 keep the goldens `--goldens` writes for their own paths. They still restore every other category.
- H-129 is `blocked`. It regenerates every golden in one run after those refixes and the camera follow-up are `done`. A second `--goldens` run must be clean.

## Next

Launch nothing new for mockups. The camera follow-up is still waiting on the replacement tracks.

## Blockers

None for this bookkeeping.

## Links

- Work package: `WP-PRESET-MOCKUPS-INK`
- Branch: `cursor/mockups-ink-done-9f5d`
- Pull request: open this role's pull request against `main`. Do not stack it on another pull request.
