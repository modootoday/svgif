---
id: research:svgif/20261117031713
title: Advanced mode walkthrough
status: active
created: 2026-11-17T03:17:13Z
updated: 2026-11-17T03:17:13Z
rel:
  depends_on: [sot:svgif/studio-ui, research:svgif/20261117015831]
---

# Advanced mode walkthrough

## Question

Can a first-time user understand Advanced mode's menus and labels at a glance, and reach the goals Advanced exists for? The user knows Figma, Canva, or Keynote, but has never seen Studio.

## Method

On 2026-11-17, at `main` commit `2914a37`, `apps/studio/dist/` was built and opened in Chromium.

At 1440×900, a script followed one path and saved a screenshot after each step:
1. First view.
2. Library search for "bounce".
3. Place the first result.
4. Select its layer.
5. Search "fade" and Apply motion.
6. Click a key marker.
7. Press Text in the Inspector.
8. Open the Export panel.
9. Open the Open dialog.

At 390×844 with touch, it captured the first view, the Library, Inspect, and Timeline tabs, and the More menu. It also listed every visible control at the first desktop view, with its text, aria-label, title, and placeholder.

A separate review session ran a cognitive walkthrough on those files only. It did not see the code or this session's notes. It walked eight goals and asked four questions at each step:
- Will the user try the right thing?
- Will they notice the control?
- Will they connect its label to the goal?
- Will they understand the feedback?

This session then checked two of the blockers in the code.

## Findings

| Goal | Result | Where the user stops |
| --- | --- | --- |
| 1. Understand the screen and where to start | partial | Nothing says "add from the Library, then animate". The empty Inspector says "Select a layer to edit its tracks. The artboard stays the default surface." |
| 2. Add an animated element from the Library | partial | Rows have no preview. Every row offers both Place and Apply motion. A placed item lands behind the existing shape |
| 3. Change color, position, or words | partial; words fail | The canvas draws no selection in Advanced. Fill is a hex field with no swatch. A placed text preset has no Text field |
| 4. Apply a motion, then adjust when it happens | fail | The feedback says "node". An entrance hides the element at frame 0. No control moves or stretches an applied motion |
| 5. Edit one key's timing | fail | The key marker is a small button labeled `0`. The Frame, Value, Easing, and Remove editor opens below the 120 to 168 px timeline |
| 6. Reorder or group layers | partial | Down and Up do not say which end is the front. Group and Ungroup sit in the timeline transport, away from the layers |
| 7. Save, then export a video or an image | partial | Export lists encoder notes and a capability table. It has no still image. "embed player", "embed studio", and "SVG backend" are not explained |
| 8. Phone: goals 2 and 3 | partial | The layer list is under the Timeline tab, so selecting and editing need two tabs. A "Sheet 40" button means nothing |

Labels a first-time user cannot read, scored 1 or 2 out of 5:
- Raw track names:
  - `transform.translateX` and `transform.translateY`.
  - `attr.d`.
  - `cubic-bezier(…)`.
  - The `f0` in the clock.
  - "This track value is not a number."
- Abbreviated or unexplained controls:
  - `Lib`, `Ins`, `H`, and `Sheet 40`.
  - `Collapse`, with no object.
  - `Key at frame`.
  - `Label` for a layer's name.
  - `TRACKS`.
  - "Search presets".
- Placement that misleads:
  - `Width` and `Height` are the canvas size but sit above the layer's fields.
  - The insert buttons (Rectangle, Ellipse, Path, Text) sit inside the Inspector.
- Duplicates: two Play buttons, and Theme in both the top bar and Export.

This session checked two blockers in the code:
- A key marker's click handler selects the node that owns that key and moves the playhead. The editor for that key renders below the visible rows of the timeline. The selection change is by design, but the screen does not explain it.
- The Inspector shows a Text field only when the node has an entry in the editor's text record. A preset's words are drawn as path glyphs, so they have no such entry, and the field does not appear.

These worked:
- The three-panel layout.
- The Simple/Advanced switch.
- Library search.
- The places of Save, Open, and Export.
- Fill, X, Y, and Rotate.
- On a phone, the tab bar and the More menu.

## Conclusion

Advanced mode works as a shell, but not yet as a motion editor for someone who has not read its code. The two blockers are key timing and Library previews. Five problems are major:
- No selection on the canvas.
- No words field for placed text.
- No way to move or stretch an applied motion.
- An Export panel written for developers.
- Implementation names in the UI.

## Recommendation

The fixes fall into three batches, smallest first.

1. **Words and placement.** These need no new parts.
   - Plain property names, with the raw name in a tooltip.
   - Plain labels for `Lib`, `Ins`, `H`, `Sheet 40`, `Collapse`, `Key at frame`, `Label`, and `TRACKS`.
   - One Play button.
   - Toasts that name the object and clear on the next action.
   - Inspector order: the selection first, and the canvas settings in a section of their own.
   - Insert tools out of the Inspector.
   - Group, Ungroup, and the order rule in the Layers header.
   - A three-step empty state.
   - Export grouped as Video, Image, and Web, with the capability table behind a disclosure.
2. **Selection and editing.**
   - A selection box and handles on the Advanced canvas.
   - Placed items added on top and selected.
   - A color swatch beside Fill.
   - The key editor opened next to its key.
   - The Layers list in the phone's Inspect tab.
3. **Timeline and Library.** These are new parts, and each needs its own design record.
   - A ruler with one lane per property.
   - Keys drawn at their frame and dragged to retime.
   - An applied motion shown as one clip that can be moved and stretched.
   - Library rows with a looping preview, with Elements and Motions apart.

The timeline height and the shell sizes are fixed in [[adr:svgif/20261110173419]]. A taller timeline would change that decision.

## Verification

Rerun the same path, send the captures to a new review session with the same eight goals, and compare the per-goal results with this table.
