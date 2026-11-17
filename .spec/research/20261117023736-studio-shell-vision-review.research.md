---
id: research:svgif/20261117023736
title: Studio shell vision review
status: active
created: 2026-11-17T02:37:36Z
updated: 2026-11-17T02:37:36Z
rel:
  depends_on: [sot:svgif/studio-ui, sot:svgif/release-gate, research:svgif/20261117015831]
---

# Studio shell vision review

## Question

Does the Studio shell pass the vision review that [[sot:svgif/studio-ui]] and [[sot:svgif/release-gate]] require? The criteria are layout fit with no page scroll, alignment, contrast, spacing, and motion smoothness. They are judged at 1440×900, 1024×768, 390×844, and 360×640.

## Method

The launcher built `apps/studio/dist/` and captured these states at each of the four viewports, in the light and dark themes:
- Simple mode on a first visit.
- Simple mode after the Sale start, the headline `Sale 50%`, and the Slide up entrance.
- Advanced mode.

At 1440×900 and 390×844 it also captured five frames about 120 ms apart while Play ran the entrance. The two smaller viewports used touch.

Each capture went to a separate review session that did not see the code or this session's notes. The reviewer was the designated vision review model chosen by the launcher. It judged the screenshots only, measured contrast from their pixels, and returned one row per viewport.

A failed round was fixed, captured again, and sent to a new session.

## Findings

| Round | Commit | Verdict | Fails |
| --- | --- | --- | --- |
| 1 | `3af6323` (`main`) | fail | Contrast at every viewport in the dark theme. Fit at 1440 and 1024. Spacing at 1024, 390, and 360 |
| 2 | `e222e23` | fail | Alignment at 1440 and 390. Spacing at 1440 and 1024. Fit at 1024 |
| 3 | `b00f353` | pass | None |

Round 1 findings, and what fixed each one:
- The Headline placeholder measured 3.3:1 on its dark field. Placeholders now use the muted ink, at 6.4:1 in light and 8.0:1 in dark.
- The scrolling panels showed no scrollbar, so cut rows read as clipped. Those panels now draw a thin scrollbar.
- At 1024, the zoom bar sat 3 px above the picture. The picture now starts below the zoom bar.
- On a phone, the pinned Undo and Download rows had no edge. They now have a border and a shadow.
- On a phone, the message covered the top of the picture. It now sits at the foot of the artboard.
- On a phone, the top bar and zoom buttons were about 32 px. They are now 44 px.
- Keyboard hints showed on touch screens. They are now hidden there.

Round 2 findings, and what fixed each one:
- Play and Pause had different widths, so the clock moved when Play started. Both now keep one width.
- The track property list cut its own text. It is now wider.
- At 1024, the 120 px timeline showed half a row of controls. It now shows one full row.
- At 1024, the hint covered the foot of the picture. The picture now leaves room for it.

Round 3, by viewport:

| Viewport | Fit | Alignment | Contrast | Spacing | Motion |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | pass | pass | pass | pass | pass |
| 1024×768 | pass | pass | pass | pass | n/a |
| 390×844 | pass | pass | pass | pass | pass |
| 360×640 | pass | pass | pass | pass | n/a |

Round 3 measured the faintest text at 6.2:1 or better. Phone controls measured 42 to 44 px. The entrance moved 23, 6, 3, and 0 px between frames at 1440, with no jump, flash, or disappearance.

The review also left notes that are not fails:
- Simple mode on a phone has no Theme button.
- The applied motion's marker is hard to see while Play runs.
- The Library and Inspector headers differ by 4 px at 1440.
- The timeline labels are hidden at 1024.
- The phone clock shows only the time.
- On a phone, scrolled rows sit right under the pinned Undo row.

## Conclusion

The Studio shell passes the vision review at the four viewports on `b00f353`. The Studio UI row and the Studio shell review row in [[plan:svgif/20261110122000]] need a vision review, and this round is it. A later change to the shell needs a new round.

## Verification

Capture the same states at the same viewports, send them to a new review session with the five criteria, and record its table here or in a later record.
