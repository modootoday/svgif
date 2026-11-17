---
id: research:svgif/20261117015831
title: Studio journey audit
status: active
created: 2026-11-17T01:58:31Z
updated: 2026-11-17T01:58:31Z
rel:
  depends_on: [sot:svgif/studio-ui, adr:svgif/20261114074819]
---

# Studio journey audit

## Question

Can a person who has never used Studio go from a first visit to a downloaded animation without help? Each finding is a place where a step is missing, is out of order, or looks broken. The question covers both modes at 1440×900, 390×844, and 360×640, in the light and dark themes.

## Method

On 2026-11-17, at `main` commit `cc99f20`, `apps/studio/dist/` was built and served from a local HTTP server. A Chromium script followed one path at three settings: 1440×900 with a mouse in the light theme, the same size in the dark theme, and 390×844 with touch. A separate probe ran at 360×640 with touch.

The path was:
1. Open the page.
2. Pick a start.
3. Type `Sale 50%`.
4. Pick the second color.
5. Open the Motion menu and pick Slide up.
6. Press Play.
7. Scroll to Length and then Download.
8. Press Save.
9. Switch to Advanced.

At each step the script saved a screenshot and read the layout with the DOM geometry APIs. The step counts in [[adr:svgif/20261114074819]] were counted against that run.

## Findings

| # | Where | Finding | Measured |
| --- | --- | --- | --- |
| 1 | Simple, Start | One start is offered, named Sale. There is no way back to a blank page, and no start shows what it looks like. | `#template-choices` holds one button |
| 2 | Simple, Picture | Picture is a paragraph of instructions. Simple mode cannot add words, a shape, or an icon, and cannot remove an element. The ADR task *blank page, add a title and an icon, animate them in* cannot be done in Simple mode. | 0 add or remove controls |
| 3 | Simple, order | The panel order is Start, Words, Download, Picture, Motion, Length, Undo. Download comes before the steps that change the result. Undo is the last block, so on a phone it is about three panel heights below the field it undoes. | Panel content is 1006 px in an 852 px column, and 784 px in a 258 px sheet on the phone |
| 4 | Simple, selection | The panel does not say what is selected. The Motion note says *the selected shape* when nothing is selected or when words are selected. With nothing selected, Motion and Headline stay enabled, and the menu fails with *Select a shape first.* | `#motion-menu` and `#headline` are enabled with an empty selection |
| 5 | Simple, Loop | The Loop switch is a native checkbox drawn at 44 by 44 px. Unchecked, it is an empty square with no sign that it is a switch. | `appearance: auto` |
| 6 | Simple, messages | After Save, the status says *Saved HTML. Export HTML writes the same bytes.* Simple mode has no Export HTML control. After a motion, it says *The entrance is on the shape.* even when the element is words. | Status text on screen |
| 7 | Advanced, phone | The top bar is wider than the screen. At 360 px, Save and Export are cut off at the right edge and Theme is not reachable. | Top bar `scrollWidth` 429, `clientWidth` 360 |
| 8 | Advanced, Library | Each row shows the category and the id cut to *animals / ch…*, beside two buttons. Rows cannot be told apart. | Every visible row starts with the same 12 characters |
| 9 | Advanced, Inspector | Position fields show the raw float, for example `219.55681037902832`. The selected node's internal id (`S-N-5`) is shown above Label. | Inspector text |
| 10 | Both, phone | In Simple mode on a phone, the artboard takes 58% of the height. The sheet shows about one block at a time, and Download scrolls out of view while the person edits. | Sheet 249 px of 640 at 360×640 |

These held at every size and theme:
- No page error.
- No page-level scroll in either mode.
- Every simple control is at least 44 by 44 px.
- Undo and Redo worked.
- The text selected after a start was the headline.
- Play ran the entrance.

Dark mode kept the contrast floor that `studio-shell.sh` checks.

### Step counts against the ADR

| Task | ADR target | Today |
| --- | --- | --- |
| Sale badge, change the words and the color, export | 5 | 4: start, type, color, Download image |
| Blank page, add a title and an icon, animate them in | 6 | Cannot be done in Simple mode (finding 2) |
| Change the length and whether it loops | 2 | 2 |
| Move and resize on the canvas | 2 | 2 |

## Conclusion

Simple mode meets three of the four tasks. It fails the second task outright, because it has no way to add words or an icon. The rest of the friction is order and feedback:
- The panel puts Download in the middle.
- The panel never names the selection.
- The Loop control does not look like a switch.

Advanced mode is complete on the desktop. On a phone it loses the file actions off the right edge.

## Recommendation

[[sot:svgif/studio-ui]] should record one journey order for the simple panel and the controls that close finding 2. The order is:
1. Start.
2. Picture.
3. Words and color.
4. Motion.
5. Length.
6. Download.

The record should also hold the fixes for findings 3 to 10:
- A Blank start, and a picture of each start.
- Add words, Add shape, Add icon, and Remove in Picture.
- A line that names the selection.
- Motion disabled with a plain reason when nothing is selected.
- A drawn switch for Loop.
- Download pinned at the foot of the panel.
- Undo and Redo pinned at its head.
- Plain status sentences.
- A More menu for the file actions on a phone in Advanced.
- Library rows that show the preset name on its own line.
- Rounded inspector numbers.

More starts are an extension and stay data files under `apps/studio/templates/`.

## Verification

Rerun the same path after the change. Check that:
- The second ADR task is 6 actions or fewer in Simple mode.
- The Advanced top bar has `scrollWidth` at most `clientWidth` at 360×640.

`bash scripts/ci/studio-shell.sh` holds both.
