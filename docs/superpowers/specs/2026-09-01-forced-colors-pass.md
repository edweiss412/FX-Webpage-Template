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
| R1 | **Option C.** Property substitution for the affordances a UA drops, plus the three semantic slots the forced palette has a correct answer for. Not a full 34-token swap. The slots were ratified as a token re-point and are shipped PER AFFORDANCE: spec review R1 showed no selected, disabled or link token exists to re-point, and bl-orch approved the mechanism change on 2026-09-01 as C's goal without its plumbing. §3.3 carries the argument. | bl-orch, 2026-09-01, at this arc's pre-implementation pattern gate and again at the R1 repair. The against-argument for the full swap is §3.4. |
| R2 | **A full token mapping is declined, and the reason is that it would have to be invented.** The forced palette has no warning slot and no danger slot (probe limits, `docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md`). Mapping `--color-warning-bg` onto `Mark` is a guess, and a guess in `globals.css` is inherited by every future surface. | Same ruling. This is the row's own "sample of one" fence applied to the token table. |
| R3 | **Colour-only semantic collapse is sole-carrier-only.** A distinction that flattens under forced colors is a defect only where colour was the sole carrier. Where words, an icon, or an ordering also carry it, the flattening is correct behaviour: it is recorded in the Arm 1 census with its reason, and §8 names the CLASS that reason falls into. One mechanism, two readers. The census is machine-checked and per-site; §8 is the human-readable index of why whole families are left alone, and it never carries per-site rows. | Same ruling. Flattening is what the user asked for by turning forced colors on. A first draft made §8 and the census sound like alternative dispositions, which review R2 counted across five sections. |
| R4 | **Whether severity callouts should stay distinguishable under forced colors is a REVISITABLE ruling, queued for Eric, and does not block.** It is CSS-reversible in one block. If he wants distinguishable severities, the repair is additive and lands later. | bl-orch, same message: "queuing the callout-distinguishability question for Eric as a REVISITABLE ruling. It is CSS-reversible, so it does not block; note that in the spec limits." Noted at §8.1. |
| R5 | **Focus is already safe and this pass does not touch it.** `app/globals.css:899` is unlayered, beats Tailwind's `@layer utilities`, and paints an outline that survives forced colors. Measured in both engines. | `docs/superpowers/specs/probes/2026-09-01-forced-colors-mechanism.md`, cascade table. The pass PINS this rather than changing it (§5.6). |
| R6 | **The ~253 `focus-visible:outline-none focus-visible:ring-*` declarations stay.** Only the `outline-none` half is inert; the ring DOES paint in normal mode, alongside the outline (probe cascade rows with forced colors off read `box-shadow=present`). Removing them is a 253-site sweep with a real, unreviewed visual effect. Filed as an Unfixed peer in the PR body, not repaired here. | Probe cascade table. Class-sweep exception (c): the repair spans enough sites to blow the review scope AND changes rendered pixels, so it is its own arc. A first draft of this row said the declarations were inert and that the sweep was zero-pixel; spec review R1 refuted both. |
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
  M1b, M11, M12). `text-shadow` has its own case because §3.1 licenses it as a
  carrier; R1 found the claim riding on `box-shadow`'s measurement, which is an
  inference and not a probe.
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

It is unlayered, so `focus-visible:outline-none` cannot suppress it, and it paints
an OUTLINE, which forced colors keeps. The `ring` half of that idiom is a separate
question and it is NOT suppressed: with forced colors off the probe reads
`box-shadow=present`, so the ring paints in normal mode alongside the outline.
Under forced colors the ring goes and the outline stays, which is the whole of why
focus is safe. It works by accident: it was written for direct-sunlight readability on the venue
floor (`app/globals.css:895-897`), not for this. It is not the only accident of
that kind. §5.3 finds a second, the freshness cue, for the same reason, and both
survive because they are outlines.

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
>    under forced colors: the off state becomes visible. Name the off state
>    explicitly in that block. Where the border's width is load-bearing for
>    layout, because a sibling state declares the same border and varies only its
>    colour, name it by setting the colour to the background system colour. Where
>    the width is not load-bearing, name it with `outline-style: none` or
>    `border-style: none`. Never leave it as a transparent colour, and never
>    remove a width a sibling state depends on.
> 3. Two states of one control that differ ONLY in properties forced colors
>    flattens are the same state under forced colors, UNLESS something outside
>    CSS separates them: a glyph, a different label, an icon. Give one of them a
>    carrier that survives, or record why it does not need one.
> 4. The three semantic slots (§3.3) are applied PER AFFORDANCE, in that block,
>    at the selector that means the thing. They are NOT tokens. This repo has no
>    selected token, no disabled token and no link token, and re-pointing a shared
>    token to reach them recolours every unrelated meaning that token also paints.
> 5. `forced-color-adjust: none` is reserved for content whose colour IS the
>    information. Every use gets a `DESIGN.md` row naming what the colour means.
> 6. Every rule in that block is UNLAYERED. Layered rules lose.
### 3.2 Where the block lives

One `@media (forced-colors: active)` block at the foot of `app/globals.css`,
unlayered, after the last existing rule. One block rather than rules scattered
beside the surfaces they repair, for the reason the row gives: the pattern is
the deliverable, and a pattern spread across fourteen sites is not readable as
one. The block carries a header comment stating §3.1 and pointing here.

### 3.3 The three semantic slots, applied per affordance

Three slots, and only these three. Each is a case where the forced palette has an
exact semantic answer and where flattening destroys information rather than style:

| Repo concept | Forced-palette slot | Why this slot |
| --- | --- | --- |
| selected / active state | `Highlight` + `HighlightText` | The palette's own name for "this one is chosen". Every OS high-contrast theme guarantees the pair contrasts. |
| disabled / de-emphasised | `GrayText` | The palette's only de-emphasis colour, and the one a UA already uses for disabled controls, so it matches the rest of the OS. |
| links | `LinkText` | Same reason. A link that reads as body text is a navigation loss, not a style loss. |

**They are applied at the affordance, not by re-pointing a token, and that is a
correction.** The first draft of this section expressed the mapping by
re-pointing `--color-*-runtime` custom properties inside the block, on the
strength of probe M13 showing the mechanism works. The mechanism does work; the
mapping does not exist to use it. Spec review R1 enumerated why, and it holds for
all three rows:

- There is no selected token. The accent tokens that would be nearest also paint
  primary buttons, progress, icons and borders.
- There is no disabled token. `text-subtle` and `text-faint` are reading-hierarchy
  tokens, and §8's limit 2 says they flatten deliberately.
- There is no link token. Links variously use `text-accent-on-bg`, `text-text`,
  and inheritance, and those same tokens paint plenty that is not a link.

So a token re-point either misses the concept or recolours unrelated meanings,
which is R2's invention problem at a smaller scale. Applying the slot at the
selector that means the thing has neither failure: `Highlight` reaches the
selected tab because the rule is written about the selected tab.

The affordance-rule set is census-derived like everything else in this pass. A
slot is applied where Arm 1 reports a collapse and the census row says the
distinction is selection, disablement, or linkhood; it is not applied from a list
somebody typed.

Everything else keeps its authored value and is flattened by the UA. §8 records
that as deliberate.
### 3.4 Why not a full token swap

Considered and declined under R1/R2. Recording the argument so it is not
re-derived:

A full swap re-points all 34 distinct `--color-*-runtime` tokens onto system
keywords (`grep -oE -- '--color-[a-z-]+-runtime' app/globals.css | sort -u | wc -l`,
34 on `059bd1bd4`). It is tempting because it is one place and the mechanism works.
It fails on two counts. It repairs none of the cue and gradient work in §5.1,
§5.2 and §5.5, because a dropped carrier is a property problem and not a value
problem (M12). The §5.4 state repairs and the §5.5 fill ARE value changes, and a
token swap still does not reach them: they need the right value at the selector
that means the state, which is §3.3's per-affordance point, not a global re-point
of a token those selectors share with everything else. And the forced palette has nine
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
shapes have different evidence. Both arms REPORT candidates; neither decides that
a candidate is a defect, and §4.4 says why that split is load-bearing.

**Arm 1, state collapse (TSX).** For an element with more than one render path,
compute each path's FORCED PROJECTION: the subset of its declarations that
survives forced colors, per the M-table in §2.1. Two distinct paths of one element
whose forced projections are EQUAL are one state under forced colors. It subsumes
transparent-border inversion, background-only selection, and text-colour-only
state, without naming any of them, because all three are the same fact about
projections.

Arm 1 additionally reports, as a separate CANNOT-DECIDE class rather than as a
collapse:

- an element the resolver could not name (the `onUnresolvedComponent` sink), and
- a SINGLE-path element whose one class string carries state variants
  (`aria-*:`, `data-*:`, or a pseudo-class variant). Such an element expresses two
  states in one string, so `paths` has one entry and the projection comparison
  never runs. Arm 1 cannot see those states and says so rather than passing them.

**Arm 2, carrier loss (CSS).** Two closed criteria over the SOURCE
`app/globals.css`, which is where this repo's hand-written rules live:

- **A2a.** A rule whose SURVIVING carrier set is empty: every declaration it makes
  that could carry the affordance is dropped, forced onto the palette, or a
  mixture of the two, and none is an `outline` or `border` style or width. Both
  halves matter and the first draft had only the dropped half, which is why review
  R1 could point at three of this spec's own repairs that condition (a) failed to
  license: the share-link background leg and the step-3 steady fallback are forced
  rather than dropped, and the progress rules are a mixture.
- **A2b.** A `@keyframes` block whose animated properties are all dropped, or all
  forced onto the palette so both endpoints land on one used value. The animation
  then has no visible effect OF ITS OWN.

Neither count is retyped here. Both come from the arm:

```
pnpm vitest run tests/styles/_metaForcedColors.test.ts -t "arm 2 inventory"
```

### 4.2 What the scanner is built on

`tests/styles/interactiveScanCore.ts:1067` already resolves Tailwind class strings
out of TSX with the full `cn()`, template-literal, and ternary handling this arm
needs, and it already returns `paths: string[][]`, the complete set of render
alternatives (`tests/styles/interactiveScanCore.ts:50`). Arm 1 is a projection
over that, exactly as `tests/styles/controlOutlineResidue.ts` is.

**Arm 1 runs it with `{ textEntry: true, paintedChildren: true }` and a required
`onUnresolvedComponent` sink, and the options are load-bearing rather than
tidy.** State-carrying classes commonly sit on a painted CHILD rather than on the
interactive ancestor. The wizard step pill is exactly that shape: its four state
classes are on a `<span>` inside a `<Link>`, so under default options the scanner
reports the `<Link>` with one path and the pill is invisible. Measured at plan
time: default options see it as `paths=1`; with `paintedChildren` it appears as
`paths=4`, which is its state count. An arm blind to painted children is blind to
the shape this pass exists to find.

What a token EMITS is answered by Tailwind's own design system, not by a
hand-written token grammar: `__unstable__loadDesignSystem`
(`tests/styles/controlOutlineResidue.ts:29`, loaded at
`tests/styles/controlOutlineResidue.ts:146`, queried at
`tests/styles/controlOutlineResidue.ts:290-291`). That file's header records that
hand-written token grammars lost three consecutive spec rounds, which is the
mistake this arm would otherwise repeat: `bg-warning-bg` and
`ring-offset-warning-bg` differ by which property they set, and only the compiler
knows.

Arm 2 parses with `postcss`, the mechanism
`tests/styles/_metaZIndexBands.test.ts:35` uses, for the reason its comment gives
at `tests/styles/_metaZIndexBands.test.ts:208-213`: "A CSS parser knows what a
rule's parent is; a regex is guessing."

It parses the SOURCE stylesheet, not the compiled one, and the difference is
measured rather than assumed. Run the same criterion against compiled output and
A2a reports an order of magnitude more, every extra one a Tailwind `.shadow-*` or
`.ring-*` utility that does declare a shadow and nothing else. That is a true
statement about Tailwind and a useless one about this app: a utility is not an
affordance, and whether an ELEMENT wearing `shadow-tile` has a surviving carrier
is Arm 1's question, asked where the rest of its classes are visible. The arm
carries the comparison as an executable case, so it is re-measured on every run:

```
pnpm vitest run tests/styles/_metaForcedColors.test.ts -t "source not compiled"
```

The compiled sheet is still used, for AC-8's unlayered check and for Arm 1's
token oracle.
### 4.3 Premise

The scanner asserts its own reach before it asserts anything about content,
per the repo's guard-premise rule. `premise()` from `tests/_shared/premise.ts:26`
at module scope, on the same `rootDir` the rows resolve against.

### 4.4 Why both arms report rather than decide

An A2b hit means the ANIMATION paints nothing. It does not mean the user sees
nothing, and conflating those two shipped a repair in this spec's first draft that
would have suppressed a working cue (§5.3). The gap is that CSS alone cannot say
when a rule applies: the freshness cue's base rule is gated by an attribute React
adds only for the duration of a flash, so the forced opaque outline IS the cue and
the dead animation is irrelevant.

Arm 1 has the mirror-image gap. Equal forced projections mean the CSS cannot tell
two states apart; the USER still can when something outside CSS does it, which is
exactly the wizard's done pill and its `<Check>` glyph
(`components/admin/OnboardingWizard.tsx:251`).

Both gaps have the same shape and the same wrong repair: teach the recognizer to
read React attribute lifetimes and JSX children. That grows the recognizer, and a
wider recognizer is a bigger target for the next round, which is the growth
direction this repo's same-axis rule warns against. So the arms report, and every
report is either repaired or carries a census row whose reason names the carrier
that survives. "Distinguished by a non-CSS carrier" is a legitimate reason. Silence
is not.
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

**And the reduced-motion arm names its off state, which the first version of this
repair did not.** `app/globals.css:1157-1159` sets `animation: none` for
`[data-share-link-flash]` under reduced motion, deliberately: this cue has no
correct steady state (`app/globals.css:1129-1132`). With the animation off, a base
`outline: 2px solid transparent` is all that is left, and M5/M6 force it opaque, so
a reduced-motion user in forced colors would get a PERMANENT outline on the
share-link row. That is the §5.3 defect this pass exists to avoid, reintroduced by
its own repair. Spec review R2 caught it. So inside the block the reduced-motion
arm sets `outline-style: none` for this selector, which is §3.1 rule 2's second
branch: the width is not load-bearing here, because no sibling state declares an
outline.

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

### 5.3 The section-freshness cue survives, and is NOT repaired

This section said the opposite in the first draft, and the correction is the most
important thing spec review R1 produced, so the wrong version is recorded rather
than quietly replaced.

**What the first draft claimed.** `app/globals.css:1214` declares
`outline: 2px solid transparent` on `[data-section-freshness-flash]`. Probe M6
says forced colors makes a transparent outline opaque. The draft concluded that
every freshness-capable card carries a PERMANENT 2px outline under forced colors,
called it the more serious of two defects because it is always on, and specified
`outline-style: none` inside the block to suppress it.

**Why that is wrong.** The attribute is not permanent. Both emitters add it only
for the duration of a flash, spreading it conditionally:
`components/admin/showpage/PublishedReviewModal.tsx:1490` spreads it only when
`bandFresh !== null`, and clears that state after the flash window at
`components/admin/showpage/PublishedReviewModal.tsx:689`;
`components/admin/wizard/step3ReviewSections.tsx:1075` does the same against
`chrome.freshnessFlash`. With no attribute there is no rule, so there is no idle
outline to be permanent.

**What actually happens under forced colors.** While the attribute is present the
base rule applies and its transparent outline is forced opaque, so the card wears
a visible 2px system-coloured outline for the flash duration and then loses it
with the attribute. The keyframes animate `outline-color` between two values that
both force to the same used value, so the FADE is gone. The SIGNAL is not. A
steady outline for 1600ms is a working cue.

So the freshness cue is the SECOND thing in this repo that already survives forced
colors, after the focus outline at `app/globals.css:899` (§2.2), and like it the
cue survives because it is an outline. Two, not three: this sentence said "third"
in the R2 repair and §2.2 said "second" four hundred lines earlier, which is
review R2's finding 5 recurring inside its own fix. That
is the pattern's own evidence, and the draft nearly deleted it: the specified
`outline-style: none` would have left both colour-only keyframes with nothing to
paint, turning the one working cue into no cue at all.

**Repair: none.** §8's limit 7 records the lost fade. The pin that keeps this true
is AC-3, restated: under forced colors a freshness-capable card shows NO outline
when the attribute is absent and a visible one while it is present. Both halves
are asserted, because the first draft got the idle half exactly backwards and only
an assertion on the real DOM would have caught it.
### 5.4 State collapse, Arm 1 findings

WORKED EXAMPLES, not the finding set. The five below were found by reading, and
they are here because they show the two polarities and the safety case. The
AUTHORITATIVE set is whatever Arm 1 reports, dispositioned row by row in the
census, and the plan carries that run.

Saying so because it is the failure §1.1 R10 names, and this spec committed it in
its own first draft: a hand list presented as a derivation. The number is not
repeated here, because a number typed into prose is the thing this repair exists
to remove. The arm prints it:

```
pnpm vitest run tests/styles/_metaForcedColors.test.ts -t "arm 1 inventory"
```

What that run makes plain is worth stating even without its count: the reading
missed CREW-FACING surfaces. `app/me/meShowSections.tsx` and the share-link
picker interstitial both collapse, and neither is in the table below. Every
crew-facing site in this pass except CrewSubNav's own tab button came from the
derivation rather than from a person looking.

The five, each an element whose paths have equal forced projections:

| Site | States | Collapse |
| --- | --- | --- |
| `components/crew/CrewSubNav.tsx:92-93` | active `border-b-2 border-accent`, inactive `border-b-2 border-transparent` | Both borders forced opaque. EVERY TAB READS AS SELECTED. Crew-facing. |
| `components/admin/review/ShowReviewSurface.tsx:846` | active `border-transparent bg-surface-sunken`, inactive `border-text-faint bg-surface` | Both become opaque border on Canvas. The active nav pill is not identifiable. |
| `components/admin/review/ShowReviewSurface.tsx:1027` | same pair | Same. Second instance of one shape, repaired with it per class-sweep. |
| `components/admin/OnboardingWizard.tsx:241-249` | active `border-accent-edge bg-accent`, done `border-text-faint bg-surface`, visited and upcoming both `border-transparent bg-surface-sunken` | Active, visited and upcoming project equal, so which step you are on is unreadable. DONE is the exception and it is not a defect: `<Check>` at `components/admin/OnboardingWizard.tsx:251` separates it, and no CSS projection can see that. It is a census row reading "distinguished by a non-CSS carrier", per §4.4. |
| `components/admin/UndoChangeButton.tsx:47-49` | quiet `border border-transparent bg-transparent`, loud `border border-text-faint bg-surface` | Collapse. The file's own comment at `components/admin/UndoChangeButton.tsx:45-46` says the distinction is load-bearing: "a consequential control must not be a visual twin of the safe one." |

The wizard's done pill is worth reading as the pattern's proof rather than as a
sixth defect: it survives because it has a non-chromatic carrier, which is §3.1
rule 3's second clause, already shipped by someone solving a different problem
(`components/admin/OnboardingWizard.tsx:232-234`, the no-green-token note).

Repair: each collapsing state gets a surviving carrier under forced colors.
Selected states take `Highlight` and `HighlightText`, applied at the selector that
means selected, per §3.3. The transparent off-states are named by setting the
colour to the background system colour, NOT by `border-style: none`, because every
site here declares the border on BOTH paths and varies only its colour, so removing
the width would reflow. §3.1 rule 2's first branch and §5.7 both say this; the
first draft said `border-style: none` in this paragraph and contradicted its own
§5.7, which review R1 counted across all five sites and six transparent paths.

Every element Arm 1 reports is repaired or gets a census row with a reason, and a
ruled design exemption is a census row rather than a silent pass.
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

### 5.7 Dimensional invariants

Every repair in §5 is LAYOUT-NEUTRAL, and that is a constraint rather than an
observation. The properties this pass adds are `outline`, `outline-color`,
`outline-offset`, `outline-style`, `border-style`, `border-color`, `color`, and
`background-color`. Of those, only `border-style` can change layout: switching a
side from `none` to `solid` adds its width to the border box and reflows the
element.

| Parent to child relationship | What guarantees it |
| --- | --- |
| A repaired cue must not resize its own box | The two repaired cues (§5.1, §5.2) are repaired with `outline`, never `border`. An outline draws OUTSIDE the border box and takes no space, which `app/globals.css:1182-1184` already relies on for the freshness cue: "An outline is layout-neutral, composes with both, and follows border-radius." That the untouched cue was already built this way is the reason it survives at all (§5.3). |
| A repaired cue must not resize its SIBLINGS | Same property choice. An outline overlaps whatever is beside it rather than displacing it. The freshness cue's scroll container already leaves room for one. |
| A §5.4 off-state named as `border-style: none` must not collapse the element | Every §5.4 site declares the border on BOTH paths and varies only its colour, so the width is already in the box on both. Naming the off state `border-style: none` under forced colors would remove that width and reflow, so §5.4 off-states are named by setting the colour to the background system colour, NOT by removing the border. §3.1 rule 2's first branch says this directly, so this row is the layout consequence of that rule rather than an exception to it. The first draft had rule 2 mandating `border-style: none` and this row forbidding it, a contradiction review R1 counted across all five sites and six transparent render paths. |
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
| IDLE to FLASHING, forced colors | Outline-based flash for share-link (§5.1) and step-3 (§5.2). The freshness cue is UNCHANGED: its gating attribute arrives, its already-outline base rule forces opaque, and the outline is simply present rather than fading (§5.3). |
| IDLE to FLASHING, forced colors AND reduced motion | The three cues differ here and the first draft of this row said they did not. **share-link:** no cue, because §5.1's repair names its off state in this arm; without that naming the base transparent outline would force opaque and give a reduced-motion user a permanent ring. **section-freshness:** a steady outline, NOT no cue: its arm sets `outline-color: transparent` (`app/globals.css:1224-1227`) and M6 forces that opaque. Measured in both engines, and left as §8 limit 8 rather than repaired. **step-3:** steady outline. |
| FORCED-COLORS toggled while FLASHING | The animation continues; the media query re-evaluates and the surviving leg swaps. No restart, and none is wanted: a cue that restarts because the user changed an OS setting mid-flash would be a false signal. Instant, no animation needed. |
| Theme toggled while FLASHING under forced colors | Instant, no animation needed. Under forced colors the theme tokens are already overridden, so a theme change is a no-op on the cue. |
| IDLE to IDLE across a forced-colors toggle | Instant, and nothing paints. This row asserted the opposite in the first draft, on the §5.3 phantom-outline claim the overturn removed: an idle card carries no freshness attribute, so no rule applies and the toggle changes nothing about it. AC-3's idle half is the assertion that keeps this true. |

Compound case worth naming because the freshness cue alternates `-1` and `-2`
keyframe names to restart (`app/globals.css:1218-1223`). Neither body is touched by
this pass, so the existing drift pin keeping them identical is undisturbed, and
toggling forced colors between a `-1` and a `-2` flash cannot leave one leg under
different rules than the other.

## 7. Acceptance criteria

| AC | Statement | Verified by |
| --- | --- | --- |
| AC-1 | Under `forced-colors: active`, the share-link cue is visible while flashing and leaves no residue when idle. | Real-browser Playwright assertion. |
| AC-2 | Under forced colors, the step-3 warning cue is visible, and visible in its reduced-motion form. | Real-browser. |
| AC-3 | Under forced colors, a freshness-capable card shows NO outline while its gating attribute is absent, and a visible one while it is present. | Real-browser, both halves. The idle half is the one §5.3's first draft got backwards. |
| AC-4 | Under forced colors, each §5.4 worked example's states are distinguishable: the selected path's computed style differs from the unselected path's in at least one surviving property. | Real-browser Playwright assertion. |
| AC-4b | Every element Arm 1 reports is either repaired or carries a census row with a reason, and the census row count is pinned by an exact literal. | Vitest. The literal is the anti-vacuity case: a census that silently grows passes a subset assertion. |
| AC-4c | Arm 1's CANNOT-DECIDE set (unresolvable components, and single-path elements carrying state variants) is pinned by an exact literal, so a new member fails loudly rather than passing unseen. | Vitest. This is §4.1's "reported by name, never silently dropped" made executable. |
| AC-4d | Under forced colors AND reduced motion, the share-link row shows NO outline at any point, and a freshness-capable card shows one only while its gating attribute is present. Both are asserted because the two cues differ in this compound state, which is the state the transition table's first draft got wrong for both of them. | Real-browser, `emulateMedia` with both settings. |
| AC-5 | Under forced colors, the indeterminate progress bar paints a non-empty fill in both engines. | Real-browser. |
| AC-6 | An element wearing the shipped focus idiom has a visible outline under forced colors, and the assertion fails if `app/globals.css:899` is moved into a cascade layer. | Real-browser plus a planted-defect check. |
| AC-7 | Arm 2 reports no rule outside the census on the live tree, and its premise asserts it parsed a known member. | Vitest. |
| AC-8 | Every forced-colors rule the pass adds is unlayered. | Compiled-CSS assertion via postcss. |
| AC-9 | `DESIGN.md` carries §3.1 verbatim as its forced-colors section, including rule 4's per-affordance statement. | Vitest, text pin. |
## 8. Documented limits

Per the row-0 documented-limits discipline. Each is a deliberate non-repair, with
the condition that would re-open it.

1. **Severity backgrounds flatten.** `warning-bg`, `danger-bg`, `info-bg`,
   `stale-tint`, and the four `status-*` pairs land on one Canvas value (M8/M9).
   Every one sits behind text that states the severity in words, so the
   information survives and only the at-a-glance scan is lost. Not repaired, under
   R3. **Re-open when:** R4's ruling comes back from the owner wanting
   distinguishable severities, or a surface ships where a severity tint is the
   sole carrier.
2. **Emphasis flattens.** `text-subtle`, `text-faint`, and `text-strong` all
   become `CanvasText` outside the three §3.3 slots. This is forced colors working
   as designed. **Re-open when:** a surface uses emphasis alone to mark a state
   rather than to shape a reading hierarchy.

   **One such surface exists and is accepted here rather than left to trip that
   trigger.** The onboarding step pill separates ACTIVE and DONE non-chromatically
   — a `<Check>` glyph replaces the number, and the active label gains
   `font-semibold` plus visibility below `sm`
   (`components/admin/OnboardingWizard.tsx:251`,
   `components/admin/OnboardingWizard.tsx:277`) — but VISITED and UNREACHED differ
   only in text tone. Both are non-current steps, and which step you are on, the
   question the indicator exists to answer, survives. Tabbability still separates
   them, which is not a visual carrier and is not offered as one. Accepted as a
   deliberate collapse under condition (c), so the plan's census row for that site
   records a limit rather than an unrepaired defect. **Re-open when:** the wizard
   gains an affordance that depends on telling a visited step from an unreached
   one at a glance.
3. **Elevation flattens.** `shadow-tile` and `shadow-popover` are dropped. Nine of
   the ten popover sites also carry a border, so they keep an edge. Not repaired
   as a class.

   **Neither arm can raise this, and saying so is part of the limit.** Arm 2 reads
   `app/globals.css` only, and a Tailwind shadow carrier lives in TSX.
   `components/admin/BellPanel.tsx:1279` is a live instance, and the precise form
   is worth keeping: it wears `shadow-popover` unconditionally and `sm:border`
   only from 640px, so BELOW the `sm` breakpoint its shadow is its only boundary.
   On a phone, in forced colors, that panel has no edge. This is a mobile-first
   product, so that is the interesting half of the example rather than a caveat
   on it.
   Arm 1 reads TSX but compares PATHS, so a single-path floating surface with one
   unconditional `shadow-popover` and no border never reaches its comparison. A
   first draft of this limit said "re-open when Arm 2 reports" one, a trigger that
   could never fire; spec review R2 caught it, and the honest repair is to state
   the blind spot rather than point at an arm that cannot see it.
   **Re-open when:** a person observes a floating surface whose only boundary is
   its shadow, or the pass gains a third arm that reads shadow carriers at the
   element. The second is the real fix and it is deliberately not in this pass: it
   is a different question (does this element have a boundary at all) from the two
   this pass answers, and bolting it onto either arm widens a recognizer §4.4
   keeps narrow.
4. **Layout-spacer transparent borders are left alone.** Sites where
   `border-transparent` reserves layout beside a bordered peer, rather than
   expressing an off state, gain a phantom edge that changes nothing about what
   the user can tell apart. Arm 1 does not report them, because their paths do not
   collapse. **Re-open when:** one of them acquires a second state.
5. **A ruled design exemption stays exempt, as a census row.** Switch tracks whose
   on and off differ by fill collapse under forced colors, and their contrast
   treatment is already ruled (`DESIGN.md` §1.2a, and the `switch-track` category
   at `tests/styles/controlOutlineResidue.ts:873`). They are recorded in the Arm 1
   census citing that ruling rather than repaired here, because re-deciding a
   ratified visual treatment is not this pass's to make. **Re-open when:** the
   §1.2a ruling changes, or a probe shows a switch's state is unreadable rather
   than merely low-contrast under forced colors.
6. **Arm 1 cannot see a state expressed as a variant inside ONE class string.**
   `aria-current:bg-accent` on an otherwise unconditional string gives `paths`
   one entry, so the projection comparison never runs. Review R1 raised this and
   it is one ordinary edit from the cited sites. It is a limit and not a repair
   because closing it means teaching the arm to evaluate variant selectors, which
   grows the recognizer in the direction §4.4 declines. What ships instead is
   REPORTING: such elements land in the CANNOT-DECIDE set, pinned by AC-4c, so a
   new one is loud rather than silent. **Re-open when:** the cannot-decide set
   grows past the point where a person can read it, at which point the answer is
   probably a variant-aware projection rather than a bigger list.
7. **The freshness cue loses its fade, and keeps its signal.** Under forced colors
   both keyframe endpoints force to one value, so the 1600ms fade does not
   animate; the outline is simply present for the flash window and then gone with
   its gating attribute (§5.3). Not repaired. A one-shot cue's job is to say
   "this changed", and a steady outline for the same window says it.
   **Re-open when:** a surface needs to distinguish two simultaneous freshness
   cues by their phase, which the fade would carry and a steady outline does not.
8. **A reduced-motion user sees the freshness cue under forced colors, and in
   normal mode would see nothing.** `app/globals.css:1224-1227` sets
   `outline-color: transparent` in that arm, and M6 forces it opaque. Measured in
   both engines: with reduced motion and forced colors the outline reads
   `solid 2px` in a system colour, against `rgba(0,0,0,0)` with forced colors off.
   Not repaired, and the reason is symmetry rather than cost. Under forced colors
   the fade is gone for EVERY user (limit 7), so the cue is steady-or-nothing for
   everyone; the reduced-motion rationale, that a one-shot signal has no correct
   steady state, then applies identically to both groups, and suppressing it for
   only one of them is the inconsistent branch. The repair is available and scoped
   (`outline-style: none` in that arm) if the owner decides otherwise, which makes
   this a product decision and not a defect. Ratified as revisitable by bl-orch,
   2026-09-01. **Re-open when:** the owner rules that reduced-motion users should
   see no cue under forced colors either.

   The share-link cue is NOT in this limit. Its reduced-motion arm declares no
   outline at all today, and §5.1's repair names its off state explicitly, so it
   shows nothing in that compound state in both modes. That difference is the
   whole content of §3.1 rule 2: a cue that names its off state behaves under
   forced colors, and one that leaves it `transparent` does not.
9. **Safari is out of scope.** WebKit does not implement `forced-colors`. No claim
   in this spec covers it. **Re-open when:** WebKit ships the feature.
10. **The probe measures emulation, not a user's theme.** No assertion in this pass
   may depend on a specific forced colour value; every assertion is about whether
   a property survives and whether two states differ.
## 9. Convergence

**Consequence bound, closed form.** The pass licenses a surface as
forced-colors-correct when all four hold: (a) every affordance whose SURVIVING
carrier set is empty under the §2.1 M-table has a surviving carrier declared in
the §3.2 block, where a carrier set is empty whether its members are dropped,
forced onto the palette, or a mixture of the two; (b) no rule states an off state
as a transparent border or outline colour without naming that off state in the
block; (c) no element has two render paths with equal forced projections unless it is
repaired or the Arm 1 census records the collapse with a reason, a non-CSS carrier
being a sufficient reason, and §8 names the class that reason belongs to; (d) every rule the pass adds is unlayered. A finding
outside those four is admissible only with a probe showing a user cannot tell two
states apart while all four hold. The acceptance posture is that every affordance
the pass touches is either carried correctly under forced colors or recorded as a
deliberate flatten in the census under a class §8 names, never silently wrong, so a worst case of a conservative
flatten plus a documented limit is a documented limit and not a finding.

Condition (a) said "drawn from the dropped properties" in the first draft, which
failed to license three of this spec's own repairs, because the share-link
background leg and the step-3 steady fallback are FORCED rather than dropped and
the progress rules are a mixture. Review R1 named all three.

**Probe domain.** The live `app/` and `components/` trees at the branch head, plus
`app/globals.css`. A constructed CSS fixture that appears nowhere in that tree
files to §8, not to a round.

**Threat fence.** Ordinary authoring mistakes by a contributor who has read §3.1.
Adversarial CSS, hand-written `style` attributes that bypass the token layer, and
third-party embedded markup are out of scope and file to §8.
