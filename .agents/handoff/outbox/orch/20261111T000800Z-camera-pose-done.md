---
handoff: 1
id: 20261111T000800Z-camera-pose-done
from: orch
to: owner
wp: WP-CAMERA-POSE-MAP
milestone: M6
status: done
branch: cursor/camera-pose-done-9f5d
pr: ""
paths:
  - .agents/handoff/assignments/H-104.md
  - .agents/handoff/assignments/H-106.md
  - .agents/handoff/assignments/H-110.md
---

# Handoff 20261111T000800Z-camera-pose-done

## State

H-109 and H-104 are both on main.

## Done

- H-109 is merged at `c085b26` in https://github.com/modootoday/svgif/pull/197.
- H-104 is merged at `83a6109` in https://github.com/modootoday/svgif/pull/199. Zoom ends at 42.91px from 34.60px with centre drift under 1px. The cut scale measures 1.46. Ken Burns grows the subject by 14 percent and moves it 46.76px. Parallax far/near travel is 0.40. The diff is `scripts/ci/check-presets.mjs` and the schema outbox. No preset file was edited.
- H-106 is `assigned`. `presets/camera/` is free.
- H-110 is `assigned`. It includes the ink path, the stroke width, and the ordered artwork layers. H-111 waits for it.

## Next

Launch the H-106 studio session and the H-110 schema session.

## Blockers

None for this bookkeeping.

## Links

- Work package: `WP-CAMERA-POSE-MAP`
- Branch: `cursor/camera-pose-done-9f5d`
- Pull request: open this role's pull request against `main`. Do not stack it on another pull request.
