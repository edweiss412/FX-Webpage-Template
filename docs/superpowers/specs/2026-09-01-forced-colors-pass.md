# Under forced colors, the outline is the only thing that survives

Row: `SHARELINK-CUE-FORCED-COLORS-1` (the repo-root `DEFERRED.md` ›
`SHARELINK-CUE-FORCED-COLORS-1`). Branch
`feat/forced-colors-pass`.

## 1. Purpose

The row is an impeccable-audit P3 about one cue on one admin surface: the
ShareHub crew-link flash is invisible under `forced-colors`, because it animates
`background-color` and `box-shadow` and a UA drops both. It has sat deferred
since 2026-07-25 for a reason that is stated on the row and is correct:

> waits on a repo-wide forced-colors pass to set the pattern; solving it once
> here would pre-commit that pattern from a sample of one.

This spec is that pass. The deliverable is the pattern, derived from a probe and
from a mechanical inventory of the whole `app/` and `components/` tree, with the
share-link cue as its first customer rather than its origin.

`grep -rn "forced-colors\|forced-color-adjust" app components lib DESIGN.md`
returns nothing on `059bd1bd4`. The repo has no forced-colors handling at all,
so every rule in this pass is new and there is no prior art to reconcile with.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | **Option C.** Property substitution for the affordances a UA drops, plus a NARROW token mapping limited to the three slots the forced palette actually has a correct answer for. Not a full 34-token swap. | bl-orch, 2026-09-01, answering this arc's pre-implementation pattern gate. The against-argument is §3.4. |
| R2 | **A full token mapping is declined, and the reason is that it would have to be invented.** The forced palette has no warning slot and no danger slot (probe limits, `docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md`). Mapping `--color-warning-bg` onto `Mark` is a guess, and a guess in `globals.css` is inherited by every future surface. | Same ruling. This is the row's own "sample of one" fence applied to the token table. |
| R3 | **Colour-only semantic collapse is sole-carrier-only.** A distinction that flattens under forced colors is a defect only where colour was the sole carrier. Where words, an icon, or an ordering also carry it, the flattening is correct behaviour and is documented as deliberate in §8, not repaired. | Same ruling. Flattening is what the user asked for by turning forced colors on. |
| R4 | **Whether severity callouts should stay distinguishable under forced colors is a REVISITABLE ruling, queued for Eric, and does not block.** It is CSS-reversible in one block. If he wants distinguishable severities, the repair is additive and lands later. | bl-orch, same message: "queuing the callout-distinguishability question for Eric as a REVISITABLE ruling. It is CSS-reversible, so it does not block; note that in the spec limits." Noted at §8.1. |
| R5 | **Focus is already safe and this pass does not touch it.** `app/globals.css:899` is unlayered, beats Tailwind's `@layer utilities`, and paints an outline that survives forced colors. Measured in both engines. | `docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md`, cascade table. The pass PINS this rather than changing it (§5.6). |
| R6 | **The ~253 `focus-visible:outline-none focus-visible:ring-*` declarations are inert and stay.** They never win the cascade, so removing them is a 253-site sweep with zero rendered-pixel change and no forced-colors effect. Filed as an Unfixed peer in the PR body, not repaired here. | R5's measurement. Class-sweep exception (c): the repair spans enough sites to blow the review scope, and it changes nothing. |
| R7 | **`opacity` is not a forced property.** The brief that opened this arc listed it among the dropped properties. Probe M10 shows it unchanged. The inventory's definition of "fragile" excludes it. | `docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md`, M10, both engines. |
| R8 | **A dropped `box-shadow` cannot be repaired by changing its value.** Re-declaring one inside `@media (forced-colors: active)` is dropped too. Every shadow repair in this pass changes the PROPERTY. | Probe M12, both engines. |
| R9 | **Every forced-colors rule in this pass is UNLAYERED.** A rule inside `@layer base` or `@layer utilities` loses to the unlayered `app/globals.css:899` block already in the file. | Probe cascade table. `app/globals.css` already records the same lesson from the `/help` measure work: "a class in `@layer base`, which CI caught: base loses to utilities". |
| R10 | **The inventory is a derivation, not a list.** §4 states the accept-set structurally. A hand-enumerated site list re-opens the moment someone adds a site, which is the failure the class-sweep rule names. | `AGENTS.md`, class-sweep: "Sweep to a derivation, not a longer list." |
| R11 | **This arc files no new ledger row, of any facing.** Peers it cannot repair go into the PR body under "Unfixed peers" and into the readiness message. bl-orch decides whether a peer gets a row. | Arc-common brief, 2026-08-31. |

## 2. What is there now

### 2.1 The mechanism

Settled by probe in Chromium and Firefox, transcript and producer at
`docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md` and
`scripts/probes/forced-colors-mechanism.mjs`. The four rows this spec depends on:

- `box-shadow`, `text-shadow`, and gradient `background-image` are DROPPED, and
  a `box-shadow` re-declared inside a forced-colors block is dropped again (M1,
  M11, M12).
- `color`, `background-color`, `border-color`, and `outline-color` are FORCED
  onto the palette. Two distinct authored backgrounds land on one value (M8/M9).
- `transparent` on a border or outline is forced OPAQUE, so the affordance
  APPEARS rather than disappears (M5, M6).
- Authored system-colour keywords are preserved and mapped (M2, M3, M4), and a
  custom property re-pointed to one inside the block reaches a surviving
  property (M13). `forced-color-adjust: none` preserves author colour (M7).

### 2.2 What already survives

`app/globals.css:899`:

```css
:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

It is unlayered, so it wins over every `focus-visible:outline-none` utility, and
it paints an OUTLINE, which forced colors keeps. It is the only affordance in
the repo that already works under forced colors, and it works by accident: it
was written for direct-sunlight readability on the venue floor
(`app/globals.css:895-897`), not for this.

That accident is the pattern. §3 states it as a rule.

## 3. The pattern

This section is the durable deliverable. It lands in `DESIGN.md` as a new
section (§17, placement in §5.7) and every future surface inherits it.

### 3.1 The rule, as an author follows it

> **Outline is the durable carrier. `transparent` is the trap.**
>
> 1. An affordance whose ONLY carrier is `box-shadow`, `text-shadow`, or a
>    gradient `background-image` has no existence under forced colors. It must
>    gain an outline or border carrier inside the single
>    `@media (forced-colors: active)` block in `app/globals.css`. Changing the
>    shadow's colour does not work and never will.
> 2. An affordance whose OFF state is a transparent border or outline INVERTS
>    under forced colors: the off state becomes visible. Its off state must be
>    named explicitly in that block, as `outline-style: none` or
>    `border-style: none` rather than a transparent colour.
> 3. Two states of one control that differ ONLY in properties forced colors
>    flattens are the same state under forced colors. Give one of them a carrier
>    that survives, or accept the collapse and say so in `DESIGN.md`.
> 4. `forced-color-adjust: none` is reserved for content whose colour IS the
>    information. Every use gets a `DESIGN.md` row naming what the colour means.
> 5. Every rule in that block is UNLAYERED. Layered rules lose.

### 3.2 Where the block lives

One `@media (forced-colors: active)` block at the foot of `app/globals.css`,
unlayered, after the last existing rule. One block rather than rules scattered
beside the surfaces they repair, for the reason the row gives: the pattern is
the deliverable, and a pattern spread across fourteen sites is not readable as
one. The block carries a header comment stating §3.1 and pointing here.

### 3.3 The narrow token mapping

Three slots, and only these three. Each is a case where the forced palette has
an exact semantic answer and where flattening destroys information rather than
style:

| Repo concept | Forced-palette slot | Why this slot |
| --- | --- | --- |
| selected / active state | `Highlight` + `HighlightText` | The palette's own name for "this one is chosen". Every OS high-contrast theme guarantees the pair contrasts. |
| disabled / de-emphasised | `GrayText` | The palette's only de-emphasis colour, and the one a UA already uses for disabled controls, so it matches what the rest of the OS does. |
| links | `LinkText` | Same reason. A link that reads as body text is a navigation loss, not a style loss. |

Everything else keeps its authored value and is flattened by the UA. §8 records
that as deliberate.

The mapping is expressed by re-pointing the existing `--color-*-runtime` custom
properties inside the block, which is the mechanism probe M13 confirms and which
matches the three swap blocks the file already has (the base block at `app/globals.css:365`, the
`prefers-color-scheme: dark` block at `app/globals.css:435`, and the
`[data-theme="dark"]` block at `app/globals.css:487`). A fourth swap is architecturally native.

### 3.4 Why not a full token swap

Considered and declined under R1/R2. Recording the argument so it is not
re-derived:

A full swap re-points all 34 distinct `--color-*-runtime` tokens onto system
keywords (`grep -oE -- '--color-[a-z-]+-runtime' app/globals.css | sort -u | wc -l`,
34 on `059bd1bd4`). It is tempting because it is one place and the mechanism works.
It fails on two counts. It repairs none of §5.1 through §5.5, because those are
property problems and not value problems (M12). And the forced palette has nine
semantic pairs, none of which means "warning" or "danger", so mapping the
severity tokens requires inventing a correspondence. Inventing one in
`globals.css` is exactly the "pre-commit that pattern from a sample of one"
failure the row's own defer note warns about, one level up: not a sample of one
surface, a sample of one guess.

## 4. The derived inventory

The inventory is a mechanical criterion over the live tree, not a list. It ships
as a scanner so that a surface added next month is covered by default.

### 4.1 What the scanner ACCEPTS

Keyed on structure, never on class spelling. Two arms, because the two failure
shapes have different evidence:

**Arm 1, state collapse (TSX).** For an element with more than one render path,
compute each path's FORCED PROJECTION: the subset of its declarations that
survives forced colors, per the M-table in §2.1. Two distinct paths of one
element whose forced projections are EQUAL are one state under forced colors.
That is the finding. It subsumes transparent-border inversion, background-only
selection, and text-colour-only state, without naming any of them, because all
three are the same fact about projections.

**Arm 2, carrier loss (CSS).** For a rule or `@keyframes` in `app/globals.css`,
compute the set of properties it declares that a UA drops entirely. A rule whose
SURVIVING declaration set is empty, or whose animated properties are all dropped
or all forced to one value, paints nothing under forced colors. That is the
finding.

Anything the scanner cannot classify is REPORTED by name, never silently
dropped. An unresolvable class expression is `unresolved`, which is a reported
state and not an accept.

### 4.2 What the scanner is built on

`tests/styles/interactiveScanCore.ts:1067` already resolves Tailwind class
strings out of TSX with the full `cn()`, template-literal, and ternary handling
this arm needs, and it already returns `paths: string[][]`, the complete set of
render alternatives (`tests/styles/interactiveScanCore.ts:50`). Arm 1 is a projection over that, exactly as
`tests/styles/controlOutlineResidue.ts` is.

What a token EMITS is answered by Tailwind's own design system, not by a
hand-written token grammar:
`__unstable__loadDesignSystem` (`tests/styles/controlOutlineResidue.ts:29`,
loaded at `tests/styles/controlOutlineResidue.ts:146`, queried at
`tests/styles/controlOutlineResidue.ts:290-291`). That file's header records that
hand-written token grammars lost three consecutive spec rounds, which is the
mistake this arm would otherwise repeat: `bg-warning-bg` and
`ring-offset-warning-bg` differ by which property they set, and only the
compiler knows.

Arm 2 parses compiled CSS with `postcss`, the mechanism
`tests/styles/_metaZIndexBands.test.ts:35` uses, for the reason its comment gives at
`tests/styles/_metaZIndexBands.test.ts:208-213`: "A CSS parser knows what a rule's parent is; a regex is
guessing."

### 4.3 Premise

The scanner asserts its own reach before it asserts anything about content,
per the repo's guard-premise rule. `premise()` from `tests/_shared/premise.ts:26`
at module scope, on the same `rootDir` the rows resolve against.

## 5. Repairs

Every repair below traces to a probe row. Each is one entry in the §3.2 block
unless stated.

### 5.1 The share-link cue (the row)

`app/globals.css:1134-1160`. `@keyframes share-link-flash-bg` animates
`background-color`; `share-link-flash-ring` animates `box-shadow`. Under forced
colors the shadow is dropped (M1) and both background endpoints land on one
value (M8/M9), so the cue is fully invisible. Arm 2 finding.

Repair: under forced colors the ring leg animates `outline-color` between
`Highlight` and `transparent` instead of `box-shadow`, on a base that declares
`outline: 2px solid transparent` ONLY inside the block, so no phantom outline
exists outside it. The background leg is left to flatten; it carries nothing the
outline does not.

### 5.2 The step-3 warning flash

`app/globals.css:1104-1120`. Animates `background-color` only, and its
reduced-motion fallback is a STEADY `background-color` tint
(`app/globals.css:1116-1119`), so
both the animated and the reduced-motion forms die. Worse than §5.1 in one
respect: this cue marks a jump target the user must locate, so the steady
fallback is load-bearing rather than decorative
(`app/globals.css:1100-1103`).

Repair: same outline substitution, and the reduced-motion arm gets a steady
`outline` rather than a steady tint, preserving the distinction the comment at
`app/globals.css:1121-1132` draws between a jump target and a one-shot change signal.

### 5.3 The section-freshness cue

`app/globals.css:1196-1228`. TWO defects, in opposite directions.

The base rule at `app/globals.css:1214` is `outline: 2px solid transparent`. Under forced
colors that is forced opaque (M6), so every freshness-capable card carries a
PERMANENT 2px outline whether or not anything changed. That is a phantom
affordance, and it is the more serious of the two because it is always on.

The flash itself animates `outline-color` between `--color-accent-edge` and
`transparent` (`app/globals.css:1197-1213`). Both endpoints are forced, and to the same value,
so nothing animates.

Repair: inside the block, the base declares `outline-style: none` (naming the
off state explicitly, §3.1 rule 2), and the two keyframes animate between
`Highlight` and `transparent` where only the first endpoint is forced, so the
flash has two distinguishable ends. The two keyframe bodies stay identical, which
an existing drift pin requires (`app/globals.css:1186-1191`).

### 5.4 State collapse, Arm 1 findings

Five sites on today's tree, all one-line additions under the pattern. Each is an
element whose paths have equal forced projections:

| Site | States | Collapse |
| --- | --- | --- |
| `components/crew/CrewSubNav.tsx:92-93` | active `border-b-2 border-accent`, inactive `border-b-2 border-transparent` | Both borders forced opaque. EVERY TAB READS AS SELECTED. Crew-facing. |
| `components/admin/review/ShowReviewSurface.tsx:846` | active `border-transparent bg-surface-sunken`, inactive `border-text-faint bg-surface` | Both become opaque border on Canvas. The active nav pill is not identifiable. |
| `components/admin/review/ShowReviewSurface.tsx:1027` | same pair | Same. Second instance of one shape, repaired with it per class-sweep. |
| `components/admin/OnboardingWizard.tsx:241-249` | active `border-accent-edge bg-accent`, done `border-text-faint bg-surface`, visited and upcoming both `border-transparent bg-surface-sunken` | All four project equal EXCEPT done, which carries a `<Check>` glyph (`components/admin/OnboardingWizard.tsx:251`). Which step you are on is the indicator's entire job. |
| `components/admin/UndoChangeButton.tsx:47-49` | quiet `border border-transparent bg-transparent`, loud `border border-text-faint bg-surface` | Collapse. The file's own comment at `components/admin/UndoChangeButton.tsx:45-46` says the distinction is load-bearing: "a consequential control must not be a visual twin of the safe one." |

The `OnboardingWizard` done state is worth reading as the pattern's proof rather
than a sixth defect: it survives because it has a non-chromatic carrier. That is
§3.1 rule 3's second clause, already shipped, by someone solving a different
problem (`components/admin/OnboardingWizard.tsx:232-234`, the no-green-token
note).

Repair: each gets a surviving carrier under forced colors. Selected states take
`Highlight` and `HighlightText` per §3.3; the transparent off-states are named
as `border-style: none`.

### 5.5 The indeterminate progress shimmer

`app/globals.css:743` and `app/globals.css:760`. The `-webkit-progress-bar` rule paints
`background-color: var(--color-surface-raised)` under a gradient; the Firefox
rule at `app/globals.css:757-759` deliberately sets `background-color: transparent` so the
shimmer shows instead of a misleading full bar. Under forced colors the gradient
is dropped (M11) and the Firefox variant then has NOTHING left: an indeterminate
progress bar that renders as empty track. "Is it still working" with no answer.
Arm 2 finding.

Repair: under forced colors both rules take a solid `Highlight` fill on a
`ButtonFace` track. An indeterminate bar that is solid rather than shimmering is
a fair trade for one that is invisible; the shimmer is the animation, not the
information.

### 5.6 The focus rule is pinned, not changed

Per R5, `app/globals.css:899` already works. The pass adds a guard that asserts
it EXISTS and WINS THE CASCADE, not merely that the text is present. A
text-presence assertion would stay green if someone moved the rule inside
`@layer base`, which is the exact edit that would break it (cascade table).

The guard is therefore a real-browser assertion: focus an element wearing the
shipped focus idiom, emulate forced colors, and assert a visible outline. It
fails if the rule is deleted, if it is layered, or if it is changed to a
`box-shadow`.

## 5.7 Dimensional invariants

Every repair in §5 is LAYOUT-NEUTRAL, and that is a constraint rather than an
observation. The properties this pass adds are `outline`, `outline-color`,
`outline-offset`, `outline-style`, `border-style`, `border-color`, `color`, and
`background-color`. Of those, only `border-style` can change layout: switching a
side from `none` to `solid` adds its width to the border box and reflows the
element.

| Parent to child relationship | What guarantees it |
| --- | --- |
| A repaired cue must not resize its own box | Cues are repaired with `outline`, never `border`. An outline draws OUTSIDE the border box and takes no space, which `app/globals.css:1182-1184` already relies on for the freshness cue: "An outline is layout-neutral, composes with both, and follows border-radius." |
| A repaired cue must not resize its SIBLINGS | Same property choice. An outline overlaps whatever is beside it rather than displacing it. The freshness cue's scroll container already leaves room for one. |
| A §5.4 off-state named as `border-style: none` must not collapse the element | Every §5.4 site declares the border on BOTH paths and varies only its colour, so the width is already in the box on both. Naming the off state `border-style: none` under forced colors would remove that width and reflow, so §5.4 off-states are named by setting the colour to the background system colour, NOT by removing the border. This is the one place the §3.1 rule 2 wording yields to layout, and it is why the rule says "named explicitly" rather than "removed". |
| The progress-bar fill must not change the track's height | §5.5 changes `background-color` and `background-image` only. No box property is touched. |

Verified by real-browser assertion: for each repaired element,
`getBoundingClientRect()` with forced colors off and on agree to within 0.5px.
jsdom cannot see this, so the assertion is Playwright.

## 6. Transition inventory

The three cues each have four states once forced colors is a dimension. States:
IDLE, FLASHING, REDUCED-MOTION, and FORCED-COLORS, and the last crosses the
first three rather than replacing them, so the table enumerates the crossings.

| Pair | Treatment |
| --- | --- |
| IDLE to FLASHING, normal | Existing 1600ms animation. Unchanged by this pass. |
| FLASHING to IDLE, normal | Existing animation end. Unchanged. |
| IDLE to FLASHING, reduced motion | share-link and section-freshness: no cue, existing. step-3: steady tint today, steady OUTLINE after §5.2 under forced colors only. |
| IDLE to FLASHING, forced colors | Outline-based flash, §5.1, §5.2, §5.3. |
| IDLE to FLASHING, forced colors AND reduced motion | share-link and section-freshness: no cue, matching the normal reduced-motion arm. The reduced-motion decision is about whether a one-shot signal has a correct steady state, and forced colors does not change that answer (`app/globals.css:1129-1132`). step-3: steady outline. |
| FORCED-COLORS toggled while FLASHING | The animation continues; the media query re-evaluates and the surviving leg swaps. No restart, and none is wanted: a cue that restarts because the user changed an OS setting mid-flash would be a false signal. Instant, no animation needed. |
| Theme toggled while FLASHING under forced colors | Instant, no animation needed. Under forced colors the theme tokens are already overridden, so a theme change is a no-op on the cue. |
| IDLE to IDLE across a forced-colors toggle | Instant. This is the §5.3 phantom-outline case: before the repair the card gains a permanent outline at the toggle, after it nothing changes. |

Compound case worth naming because §5.3 has two animations: the freshness cue
alternates `-1` and `-2` keyframe names to restart (`app/globals.css:1218-1223`).
Toggling forced colors between a `-1` and a `-2` flash must not leave one leg
under the old rules. Both keyframe bodies are repaired identically, which the
existing drift pin already requires.

## 7. Acceptance criteria

| AC | Statement | Verified by |
| --- | --- | --- |
| AC-1 | Under `forced-colors: active`, the share-link cue is visible while flashing and leaves no residue when idle. | Real-browser Playwright assertion. |
| AC-2 | Under forced colors, the step-3 warning cue is visible, and visible in its reduced-motion form. | Real-browser. |
| AC-3 | Under forced colors, a freshness-capable card carries NO outline when idle, and a visible one while flashing. | Real-browser. Two assertions, because the phantom is the idle half. |
| AC-4 | Under forced colors, each §5.4 control's states are distinguishable: the selected path's computed style differs from the unselected path's in at least one surviving property. | Real-browser, per site. |
| AC-5 | Under forced colors, the indeterminate progress bar paints a non-empty fill in both engines. | Real-browser. |
| AC-6 | An element wearing the shipped focus idiom has a visible outline under forced colors, and the assertion fails if `app/globals.css:899` is moved into a cascade layer. | Real-browser plus a planted-defect check. |
| AC-7 | The scanner reports zero unresolved-and-unregistered findings on the live tree, and its premise asserts it reached the tree. | Vitest. |
| AC-8 | Every forced-colors rule the pass adds is unlayered. | Compiled-CSS assertion via postcss. |
| AC-9 | `DESIGN.md` carries §3.1 verbatim as its forced-colors section. | Vitest, text pin. |

## 8. Documented limits

Per the row-0 documented-limits discipline. Each of these is a deliberate
non-repair, with the condition that would re-open it.

1. **Severity backgrounds flatten.** `warning-bg`, `danger-bg`, `info-bg`,
   `stale-tint`, and the four `status-*` pairs land on one Canvas value (M8/M9).
   Every one of them sits behind text that states the severity in words, so the
   information survives and only the at-a-glance scan is lost. Not repaired,
   under R3. **Re-open when:** R4's ruling comes back from Eric wanting
   distinguishable severities, or a surface ships where a severity tint is the
   sole carrier.
2. **Emphasis flattens.** `text-subtle`, `text-faint`, and `text-strong` all
   become `CanvasText` outside the three §3.3 slots. This is forced colors
   working as designed. **Re-open when:** a surface uses emphasis alone to mark
   a state rather than to shape a reading hierarchy.
3. **Elevation flattens.** `shadow-tile` (59 occurrences) and `shadow-popover`
   (10) are dropped. Nine of the ten popover sites also carry a border, so they
   keep an edge. Not repaired as a class. **Re-open when:** Arm 2 reports a
   floating surface whose only boundary is its shadow.
4. **Layout-spacer transparent borders are left alone.** Sites where
   `border-transparent` reserves layout beside a bordered peer, rather than
   expressing an off state, gain a phantom edge that changes nothing about what
   the user can tell apart. Arm 1 does not report them, because their paths do
   not collapse. **Re-open when:** one of them acquires a second state.
5. **Safari is out of scope.** WebKit does not implement `forced-colors`. No
   claim in this spec covers it. **Re-open when:** WebKit ships the feature.
6. **The probe measures emulation, not a user's theme.** No assertion in this
   pass may depend on a specific forced colour value; every assertion is about
   whether a property survives and whether two states differ.

### 8.1 The one revisitable ruling

R4 is queued for Eric and is not settled. It is recorded here rather than in the
open queue because it is a decision, not a defect, and because the repair is
additive and CSS-reversible in one block. If the answer is "severities should
stay distinguishable", limit 1 becomes a repair and nothing else in this pass
changes.

## 9. Convergence

**Consequence bound, closed form.** The pass licenses a surface as
forced-colors-correct when all four hold: (a) every affordance whose carrier set
is drawn from the dropped properties has a surviving carrier declared in the
§3.2 block; (b) no rule states an off state as a transparent border or outline
colour without naming that off state in the block; (c) no element has two render
paths with equal forced projections unless §8 records the collapse as
deliberate; (d) every rule the pass adds is unlayered. A finding outside those
four is admissible only with a probe showing a user cannot tell two states apart
while all four hold.

**Probe domain.** The live `app/` and `components/` trees at the branch head,
plus `app/globals.css`. A constructed CSS fixture that appears nowhere in that
tree files to §8, not to a round.

**Threat fence.** Ordinary authoring mistakes by a contributor who has read
§3.1. Adversarial CSS, hand-written `style` attributes that bypass the token
layer, and third-party embedded markup are out of scope and file to §8.
