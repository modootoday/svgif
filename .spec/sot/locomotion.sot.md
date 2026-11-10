---
id: sot:svgif/locomotion
title: Character locomotion cycles
status: active
created: 2026-11-10T18:32:40Z
updated: 2026-11-10T18:33:52Z
rel:
  depends_on: [sot:svgif/animation-ir, adr:svgif/20261110181452]
tags: [locomotion, animation]
verify: [manual]
---

# Character locomotion cycles

## Rule

`character.biped` and `character.quadruped` are cycles of poses. The numbers below are the cycle. This record does not add an IR property and does not change [[sot:svgif/animation-ir]].

### Biped

`character.biped` poses are contact, down, passing, and up. The opposite foot mirrors them.

| Pose | What the body is doing |
| --- | --- |
| contact | The front heel meets the ground and the back heel is about to lift. The stride is the distance between the feet. |
| down | The front foot is planted and the knee bends under the weight. The body is lowest. |
| passing | The support leg is nearly straight under the body. The free leg passes with a bent knee. The legs cross. |
| up | The support leg pushes to the toe. The body is highest, just before the next contact. |

Frame tables are 1-based. The next frame is not rendered.

| fps | Cycle frames | Contact | Down | Passing | Up | Next, not rendered |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | 12 | 1 and 7 | 3 and 9 | 4 and 10 | 6 and 12 | 13 |
| 24 | 24 | 1 and 13 | 4 and 16 | 7 and 19 | 10 and 22 | 25 |
| 30 | 30 | 1 and 16 | 5 and 20 | 9 and 24 | 13 and 28 | 31 |

At 24 fps the poses are 3 frames apart.

Actions: walk, run, jog, sprint, sneak, tiptoe, limp, march, strut, skip, hop, jump, leap, sit, wave, dance.

Parts: root, pelvis, torso, head, upperArmL, upperArmR, forearmL, forearmR, handL, handR, thighL, thighR, shinL, shinR, footL, footR, hair, cloth.

Pivots: pelvis, neck, shoulder, elbow, wrist, hip, knee, ankle.

Parameters: `gait`, `cycleMs`, `stridePx`, `bouncePx`, `armSwingDeg`, `weight`, `facing`, `inPlace`, `loop`.

### Anti-foot-slide

`groundSpeed = stride / stepTime`. For a biped, `stepTime = cycle / 2`. A planted foot stays fixed in world space until the heel lifts. Root travel over one step equals the stride.

Example: at 24 fps, a 24-frame cycle is 1 second. An 80 px stride has a 0.5 second step and a ground speed of 160 px per second.

### Quadruped

`character.quadruped` gaits are walk, amble, trot, pace, canter, and gallop. Walk, amble, and trot are v1. Pace, canter, and gallop are later.

| Gait | Cycle |
| --- | --- |
| walk | Four-beat. Two or three feet stay on the ground. A hind foot replaces the front foot on the same side. |
| amble | Faster than the walk, with a shorter contact. |
| trot | Two-beat diagonal. The body lifts slightly between contacts. |
| pace | Lateral pairs. Later. |
| canter | Three-beat, with a left or right lead. Later. |
| gallop | Four-beat plus a suspension, with chest and hip offset. Later. |

Skins: dog, cat, horse, cow, deer, bear, pig, sheep, wolf, fox, lion, tiger.

Parts: root, hip, chest, neck, head, frontLegs, hindLegs, tail.

Parameters: `gait`, `lead`, `spineFlex`, `cycleMs`, `stridePx`.

### Bird, fish, snake, and insect

- Bird flight: the downstroke makes lift and thrust. The upstroke folds and reduces area. Do not draw flight as swimming through air.
- Fish: a sine wave that grows from the head to the tail.
- Snake: a lateral wave. Six to twelve segments.
- Insect: an alternating tripod. Left-front travels with right-middle and left-hind, against right-front with left-middle and right-hind.

### Authoring methods

Three methods. Cutout is the v1 standard. Frame swap and path morph are later. Skeletal IK is out of scope. [[adr:svgif/20261110181452]] records that a bone hierarchy is not a package and that the v1 method is a cutout rig.

| Method | When | Rule |
| --- | --- | --- |
| Cutout rig | v1 | Parent-child groups and pivot rotation. The same keys survive a part swap. |
| Frame swap | later | Needs a symbol visibility track. A tempo change increases the drawn set. |
| Path morph | later | Interpolates only when command count, kinds, and order match. |

### Mouth shapes

Mouth shapes are later: rest, A/I, E, O, U, C-class, F/V, L, M/B/P, W/Q.

## Why

A planted foot slides when the root moves at a different speed than the stride, or when a pose frame moves. The tables and `groundSpeed = stride / stepTime` keep the cycle and the travel on the same numbers. The three authoring methods say which path a v1 preset may use.

## Verification

`spec check` resolves this id. The pose tables, the anti-foot-slide example, and the three authoring methods in this record are the acceptance text. [[plan:svgif/20261110122000]] has no checkbox for this work package, so this file does not check a plan row.
