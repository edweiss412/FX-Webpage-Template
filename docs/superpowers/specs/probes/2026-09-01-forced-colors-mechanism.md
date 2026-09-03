# Forced-colors mechanism probe — 2026-09-01

Spec input for [`../2026-09-01-forced-colors-pass.md`](../2026-09-01-forced-colors-pass.md).
Producer: `scripts/probes/forced-colors-mechanism.mjs`. Re-run with
`node scripts/probes/forced-colors-mechanism.mjs`.

Captured 2026-09-01 on `feat/forced-colors-pass`, base `059bd1bd4`, against
`app/globals.css` compiled by `@tailwindcss/cli` 4.2.4 (`package.json:123`).

## Why this probe exists

The pass's design turns on which properties a UA drops, flattens, or leaves
alone under `forced-colors: active`, and on whether an author rule can reach an
element through Tailwind's `@layer utilities`. Both are UA behaviour questions.
Reasoning from the compiled stylesheet alone produced a wrong answer on this
arc, and it is worth recording which one, because the shape recurs:

The shipped focus idiom is `focus-visible:outline-none focus-visible:ring-2
focus-visible:ring-focus-ring` at roughly 253 sites. Tailwind v4's
`.outline-none` emits `outline-style: none` (v3's transparent-outline trick
moved to `outline-hidden`), and `.ring-2` is pure `box-shadow`, which
forced-colors drops. Read that far, every keyboard focus indicator in the app
dies in forced colors, which would be a WCAG 2.4.7 failure across the whole
product.

It is not true, and the correction has a second half that a first draft of this
document got wrong. `app/globals.css:899` carries an unlayered
`:focus-visible { outline: 3px solid var(--color-focus-ring); outline-offset: 2px }`.
Unlayered beats `@layer utilities`, so `outline-none` cannot suppress it, and the
outline survives forced colors. Focus was already safe.

What is NOT true is that the ring declarations are inert. The cascade rows with
forced colors OFF read `box-shadow=present`: the ring paints in normal mode,
alongside the outline. Only `outline-none` loses. Round 1 of the spec review
caught the overreach, and it matters beyond wording, because "inert" was the
stated reason for leaving 253 declarations in place. The honest reason is that
removing them is a large sweep whose visual effect is real and unreviewed, not
that it would change nothing.

## Reading the tables

Each mechanism row is one element measured twice, forced colors off then on, so
every line is a before/after on a single input. `CHANGED` and `same` compare
those two computed values.

## Mechanism — findings

| Case | Declaration under test | Result |
| --- | --- | --- |
| M1 | `box-shadow: 0 0 0 2px #e06000` | dropped to `none` |
| M1b | `text-shadow: 0 1px 2px #e06000` | dropped to `none` |
| M2 | `color: Highlight` | preserved, mapped to the forced palette |
| M3 | `background-color: Canvas; color: CanvasText` | preserved unchanged |
| M4 | `outline: 2px solid Highlight` | preserved, mapped |
| M5 | `border: 2px solid transparent` | forced OPAQUE — a border APPEARS |
| M6 | `outline: 2px solid transparent` | forced OPAQUE — an outline APPEARS |
| M7 | `forced-color-adjust: none` + brand colours | author colours preserved exactly |
| M8 | `background-color: #fff3d6` (warning) | flattened to the Canvas white |
| M9 | `background-color: #fbeae8` (danger) | flattened to the SAME Canvas white |
| M10 | `opacity: 0.4` | unchanged — opacity is NOT a forced property |
| M11 | `background-image: linear-gradient(...)` | dropped to `none` |
| M12 | `box-shadow` re-declared INSIDE `@media (forced-colors: active)` | still `none` — UNRECOVERABLE |
| M13 | custom property re-pointed to a system keyword inside the block | reaches `outline-color`; works |

Chromium and Firefox agree on every row. The two consequences the pattern rests
on are M12 and the M5/M6 pair: a dropped shadow cannot be repaired by changing
its value, only by changing the property; and `transparent` is not a way to say
"no border here", it is a way to say "a border, colour to be forced later".

M8 against M9 is the flattening case. Two different severities land on one
colour, which is what forced colors is FOR — the user asked for the palette.
It is a defect only where the colour was the sole carrier of the distinction.

## Cascade — findings

Same question in both engines: with the real compiled stylesheet loaded, does a
candidate author rule reach an element wearing the shipped focus idiom?

| Candidate | Reaches the element? |
| --- | --- |
| no author rule (control) | `app/globals.css:899` paints `solid 3px` in a system colour |
| unlayered | YES — wins, paints `solid 2px` |
| inside `@layer base` | no — loses to the unlayered `:899` |
| inside `@layer utilities` | no — loses to the unlayered `:899` |

Every row shows `box-shadow=none` under forced colors and a visible outline
regardless, which is the focus finding stated again from the other side.

The operative rule for the pass: **a forced-colors rule in `app/globals.css`
must be UNLAYERED to reach the elements it is aimed at.** The same conclusion
was reached independently, and the hard way, by the `/help` measure work —
`app/globals.css` already records "a class in `@layer base`, which CI caught:
base loses to utilities" and settles on `DELIBERATELY UNLAYERED`.

## Limits of this probe

- **WebKit is absent, deliberately.** Safari does not implement
  `forced-colors`; it exposes `-apple-system` increased-contrast settings
  instead, which is a different feature with a different property set. A WebKit
  row would measure the absence of the feature, not the behaviour under it.
  Nothing in this pass claims Safari coverage.
- **Emulation, not a real high-contrast OS theme.** Playwright's
  `emulateMedia({ forcedColors: "active" })` drives the same code path the UA
  uses under Windows High Contrast, but the palette it substitutes is the
  engine's default forced palette rather than a user's chosen theme. The probe
  therefore establishes WHICH properties are forced and whether authored system
  keywords are honoured. It does not establish any specific colour value, and
  no assertion downstream of it may depend on one.
- **The palette has no severity slots.** The forced palette's semantic pairs
  are Canvas/CanvasText, ButtonFace/ButtonText/ButtonBorder, Field/FieldText,
  Highlight/HighlightText, SelectedItem/SelectedItemText, Mark/MarkText,
  LinkText/VisitedText, GrayText, and AccentColor/AccentColorText. There is no
  warning slot and no danger slot. This is why the pass declines a full token
  mapping: the mapping would have to be invented.

## Raw transcript

```
compiled app/globals.css: 144242 bytes

## Mechanism — chromium

### M1-boxshadow-ring
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  CHANGED  boxShadow: rgb(224, 96, 0) 0px 0px 0px 2px  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M1b-textshadow
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  CHANGED  textShadow: rgb(224, 96, 0) 0px 1px 2px  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M2-system-keyword-color
  CHANGED  color: rgba(128, 188, 254, 0.6)  =>  rgba(5, 0, 73, 0.8)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgba(128, 188, 254, 0.6)  =>  none 3px rgba(5, 0, 73, 0.8)
  CHANGED  border: none 0px rgba(128, 188, 254, 0.6)  =>  none 0px rgba(5, 0, 73, 0.8)
  same     opacity: 1  =>  1
### M3-system-keyword-pair
  same     color: rgb(0, 0, 0)  =>  rgb(0, 0, 0)
  same     background: rgb(255, 255, 255)  =>  rgb(255, 255, 255)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  same     outline: none 3px rgb(0, 0, 0)  =>  none 3px rgb(0, 0, 0)
  same     border: none 0px rgb(0, 0, 0)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M4-system-keyword-outline
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: solid 2px rgba(128, 188, 254, 0.6)  =>  solid 2px rgba(5, 0, 73, 0.8)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M5-transparent-border
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: solid 2px rgba(0, 0, 0, 0)  =>  solid 2px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M6-transparent-outline
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: solid 2px rgba(0, 0, 0, 0)  =>  solid 2px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M7-forced-color-adjust-none
  same     color: rgb(14, 15, 18)  =>  rgb(14, 15, 18)
  same     background: rgb(255, 140, 26)  =>  rgb(255, 140, 26)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  same     outline: none 3px rgb(14, 15, 18)  =>  none 3px rgb(14, 15, 18)
  same     border: none 0px rgb(14, 15, 18)  =>  none 0px rgb(14, 15, 18)
  same     opacity: 1  =>  1
### M8-warning-background
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgb(255, 243, 214)  =>  rgb(255, 255, 255)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M9-danger-background
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgb(251, 234, 232)  =>  rgb(255, 255, 255)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M10-opacity
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 0.4  =>  0.4
### M11-gradient
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  CHANGED  backgroundImage: linear-gradient(rgb(255, 140, 26), rgb(230, 122, 14))  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M12-boxshadow-inside-forced
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  CHANGED  boxShadow: rgb(224, 96, 0) 0px 0px 0px 2px  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M13-token-repoint
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgba(0, 0, 0, 0)  =>  rgba(255, 255, 255, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: solid 2px rgb(122, 61, 0)  =>  solid 2px rgba(5, 0, 73, 0.8)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1

## Cascade — chromium

Does an author rule reach an element wearing the shipped focus idiom, under forced colors?

  no author rule (control)     forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  no author rule (control)     forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  no author rule (control)     forced=true  #native     outline=solid 3px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  no author rule (control)     forced=true  #synthetic  outline=solid 3px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  unlayered author rule        forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  unlayered author rule        forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  unlayered author rule        forced=true  #native     outline=solid 2px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  unlayered author rule        forced=true  #synthetic  outline=solid 2px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  rule inside @layer base      forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer base      forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer base      forced=true  #native     outline=solid 3px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  rule inside @layer base      forced=true  #synthetic  outline=solid 3px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  rule inside @layer utilities forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer utilities forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer utilities forced=true  #native     outline=solid 3px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none
  rule inside @layer utilities forced=true  #synthetic  outline=solid 3px rgba(5, 0, 73, 0.8) offset=2px box-shadow=none

## Mechanism — firefox

### M1-boxshadow-ring
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  CHANGED  boxShadow: rgb(224, 96, 0) 0px 0px 0px 2px  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M1b-textshadow
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  CHANGED  textShadow: rgb(224, 96, 0) 0px 1px 2px  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M2-system-keyword-color
  same     color: rgb(51, 153, 255)  =>  rgb(51, 153, 255)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  same     outline: none 3px rgb(51, 153, 255)  =>  none 3px rgb(51, 153, 255)
  same     border: none 0px rgb(51, 153, 255)  =>  none 0px rgb(51, 153, 255)
  same     opacity: 1  =>  1
### M3-system-keyword-pair
  same     color: rgb(0, 0, 0)  =>  rgb(0, 0, 0)
  same     background: rgb(255, 255, 255)  =>  rgb(255, 255, 255)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  same     outline: none 3px rgb(0, 0, 0)  =>  none 3px rgb(0, 0, 0)
  same     border: none 0px rgb(0, 0, 0)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M4-system-keyword-outline
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  same     outline: solid 2px rgb(51, 153, 255)  =>  solid 2px rgb(51, 153, 255)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M5-transparent-border
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: solid 2px rgba(0, 0, 0, 0)  =>  solid 2px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M6-transparent-outline
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: solid 2px rgba(0, 0, 0, 0)  =>  solid 2px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M7-forced-color-adjust-none
  same     color: rgb(14, 15, 18)  =>  rgb(14, 15, 18)
  same     background: rgb(255, 140, 26)  =>  rgb(255, 140, 26)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  same     outline: none 3px rgb(14, 15, 18)  =>  none 3px rgb(14, 15, 18)
  same     border: none 0px rgb(14, 15, 18)  =>  none 0px rgb(14, 15, 18)
  same     opacity: 1  =>  1
### M8-warning-background
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgb(255, 243, 214)  =>  rgb(255, 255, 255)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M9-danger-background
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  CHANGED  background: rgb(251, 234, 232)  =>  rgb(255, 255, 255)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M10-opacity
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 0.4  =>  0.4
### M11-gradient
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  CHANGED  backgroundImage: linear-gradient(rgb(255, 140, 26), rgb(230, 122, 14))  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M12-boxshadow-inside-forced
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  CHANGED  boxShadow: rgb(224, 96, 0) 0px 0px 0px 2px  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: none 3px rgb(26, 27, 31)  =>  none 3px rgb(0, 0, 0)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1
### M13-token-repoint
  CHANGED  color: rgb(26, 27, 31)  =>  rgb(0, 0, 0)
  same     background: rgba(0, 0, 0, 0)  =>  rgba(0, 0, 0, 0)
  same     backgroundImage: none  =>  none
  same     boxShadow: none  =>  none
  same     textShadow: none  =>  none
  CHANGED  outline: solid 2px rgb(122, 61, 0)  =>  solid 2px rgb(51, 153, 255)
  CHANGED  border: none 0px rgb(26, 27, 31)  =>  none 0px rgb(0, 0, 0)
  same     opacity: 1  =>  1

## Cascade — firefox

Does an author rule reach an element wearing the shipped focus idiom, under forced colors?

  no author rule (control)     forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  no author rule (control)     forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  no author rule (control)     forced=true  #native     outline=solid 3px rgb(0, 0, 0) offset=2px box-shadow=none
  no author rule (control)     forced=true  #synthetic  outline=solid 3px rgb(0, 0, 0) offset=2px box-shadow=none
  unlayered author rule        forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  unlayered author rule        forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  unlayered author rule        forced=true  #native     outline=solid 2px rgb(51, 153, 255) offset=2px box-shadow=none
  unlayered author rule        forced=true  #synthetic  outline=solid 2px rgb(51, 153, 255) offset=2px box-shadow=none
  rule inside @layer base      forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer base      forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer base      forced=true  #native     outline=solid 3px rgb(0, 0, 0) offset=2px box-shadow=none
  rule inside @layer base      forced=true  #synthetic  outline=solid 3px rgb(0, 0, 0) offset=2px box-shadow=none
  rule inside @layer utilities forced=false #native     outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer utilities forced=false #synthetic  outline=solid 3px rgb(224, 96, 0) offset=2px box-shadow=present
  rule inside @layer utilities forced=true  #native     outline=solid 3px rgb(0, 0, 0) offset=2px box-shadow=none
  rule inside @layer utilities forced=true  #synthetic  outline=solid 3px rgb(0, 0, 0) offset=2px box-shadow=none

## AC-5, Gecko

  fill asserted
```
