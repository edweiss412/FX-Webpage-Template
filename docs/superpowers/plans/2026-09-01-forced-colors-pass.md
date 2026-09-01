# Plan — the forced-colors pass

Spec: `docs/superpowers/specs/2026-09-01-forced-colors-pass.md` (APPROVE at spec
review round 3, zero findings). Branch `feat/forced-colors-pass`. Row
`SHARELINK-CUE-FORCED-COLORS-1` in the repo-root `DEFERRED.md`.

The spec's criteria are declared in its §7 and are covered here by the map below,
not re-declared. Every count in this plan is either a run output pasted under its
command or a command the reader can run; none is retyped from the spec.

## Acceptance-criteria coverage map

The criteria are declared in the sibling spec's §7, not here, so this map is how
every one of them is accounted for. Checked mechanically at plan time: the set of
spec-declared ids and the set covered below are equal, neither typed.

| AC | Covered by |
| --- | --- |
| AC-1 | Task 6 (cue assertions), Task 11 (its layout half) |
| AC-2 | Task 6 |
| AC-3 | Task 6, both halves — the idle half is the one §5.3's first draft got backwards |
| AC-4 | Task 4 |
| AC-4b | Task 4 (census rows + the exact-count literal) |
| AC-4c | Task 2 (Arm 1 emits the CANNOT-DECIDE set; the pin is its exact-count literal) |
| AC-4d | Task 6 (the compound forced-colors + reduced-motion state, both cues) |
| AC-5 | Task 5 |
| AC-6 | Task 10, the focus pin — no `red=`, validated by four planted defects |
| AC-7 | Tasks 1 and 2 |
| AC-8 | Task 3 |
| AC-9 | Task 9 |

AC-4c and AC-6 sit on tasks outside the red-contract region, which is why they
carry no `ac=` marker and appear only here. That is the point of the map: a
criterion covered by a pin is still covered, and the absence of a marker must not
read as an absence of coverage.

## Meta-test inventory

CREATES: tests/styles/_metaForcedColors.test.ts (both scanner arms, premise-stated).
CREATES: tests/e2e/forcedColors.spec.ts (real-browser assertions, AC-1 through AC-6, layout neutrality).
EXTENDS: `playwright.config.ts` — `forced-colors` is added to the `testMatch` alternation of BOTH
`mobile-safari` (`playwright.config.ts:83`) and `desktop-chromium` (`playwright.config.ts:97`).
This is a wiring step and not a formality: those `testMatch` values are EXPLICIT
ALLOWLIST regexes, not globs, so a new spec file matches nothing and would be
committed, reviewed, and never executed while this plan and the PR both claim its
coverage. Plan review R1 finding 5. Both projects, because the repaired surfaces
span admin (the cues, the review pills, the nav) and crew (CrewSubNav, `app/me`,
the picker interstitial), so a single-project entry leaves half the pass unasserted.
Contrast vitest, which IS glob-based: `tests/styles/**/*.test.{ts,tsx}` is already in
`PARALLEL_TEST_GLOBS` (`vitest.projects.ts:113`), so the scanner suite needs no wiring.

**Firefox is not a Playwright project in this repo**, and the pass needs it: the
mechanism probe measures Gecko and Blink separately because they differ (the
progress fill is confirmed in Firefox and unmeasurable by `getComputedStyle` in
Chromium). Rather than add a Firefox project to `playwright.config.ts`, which
changes the CI matrix for every existing suite, the cross-engine claims stay where
they already live and already run: `scripts/probes/forced-colors-mechanism.mjs`,
which drives both engines directly and whose transcript is regenerated on every
repair commit. The e2e spec asserts the SHIPPED surfaces in the two configured
projects; the probe asserts the MECHANISM in both engines. Stated so the split is a
decision rather than an omission.

Server and readiness are inherited, not re-invented: the config's `webServer`
starts the app, `fullyParallel: false` serializes (`playwright.config.ts:35`), and
the projects pin `baseURL` to `127.0.0.1` rather than `localhost`
(`playwright.config.ts:92`) to avoid the dual-stack mismatch. The new spec adds no
server of its own and starts nothing.
EXTENDS: `tests/mutation/source/registry.ts` (one row, the scanner; enrolment BEFORE the first diff dispatch per bl-orch Q3).
EXTENDS: nothing else. Advisory-lock topology: N/A, the diff touches no `pg_advisory*` path.
Supabase call boundaries: N/A, no Supabase client call in the diff.

## Ordering, and why

The scanner comes FIRST, before any repair. It is what turns "five sites I found
by reading" into "every site of this shape", and running it before the repairs
means the repair list is derived rather than trusted. It also gives every later
task its RED.

<!-- tasks: depth=2 red-contract -->

## Task 1 — Arm 2, carrier loss over the source stylesheet
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`tests/styles/forcedColorsScan.ts` why=`the module does not exist, so the suite cannot import computeCarrierLoss and the case that asserts the share-link ring is reported fails on the missing export` ac=AC-7 -->

Parse the SOURCE `app/globals.css` with postcss (the
`tests/styles/_metaZIndexBands.test.ts:35` mechanism). Two closed criteria, per
spec §4.1 as repaired:

- A2a: a rule declaring at least one dropped carrier (`box-shadow`, `text-shadow`,
  gradient `background-image`) and no surviving carrier (`outline`/`border` style
  or width) in the same rule.
- A2b: a `@keyframes` block whose animated properties are all dropped, or all
  forced onto the palette.

Source, not compiled, and the arm carries that as its own case: run against
compiled output the same criterion reports an order of magnitude more, every extra
one a Tailwind `.shadow-*`/`.ring-*` utility. Measured at plan time via
`scripts/probes/forced-colors-arm2-prototype.mjs`; the shipped case re-measures it.

The two inventory cases PRINT their rows (`-t "arm 2 inventory"`,
`-t "source not compiled"`), because the spec cites the command rather than
pasting a count.

Premise: assert the parse reached a known member before asserting about content.
`premiseHolds("the parsed source contains the share-link keyframes", ...)`.

Anti-tautology: the expected finding set is derived from the parsed stylesheet,
never a hardcoded list of selector names. A test that hardcodes
`[data-share-link-flash]` proves the literal is present, not that the arm found it.

## Task 2 — Arm 1, state collapse over the TSX tree
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`tests/styles/forcedColorsScan.ts` why=`forcedProjection is not implemented, so the case asserting CrewSubNav's two paths collapse cannot compute a projection and fails` ac=AC-7,AC-4c -->

Build on `scanInteractiveElements` (`tests/styles/interactiveScanCore.ts:1067`)
for path resolution and on the Tailwind design-system oracle
(`tests/styles/controlOutlineResidue.ts:146`) for what each token EMITS. Do not
write a token grammar; that file's header records three consecutive spec rounds
lost to one.

For each element with more than one path, compute each path's forced projection
and report the element when two distinct paths project equal.

The finding set is LARGER than the spec's five worked examples; a plan-time
prototype (`scripts/probes/forced-colors-arm1-prototype.mts`) reported several times five over
a 366-element universe. Every reported element is either repaired in Task 4 or
carries a census row with a reason. Three known census rows are switch tracks
whose ruled exemption is `DESIGN.md` §1.2a and the `switch-track` category at
`tests/styles/controlOutlineResidue.ts:873`; each row cites its ruling, so a
reviewer reads coverage rather than a miscount.

The inventory case PRINTS its rows (`-t "arm 1 inventory"`).

Arm 1 also reports a CANNOT-DECIDE set, pinned by AC-4c with an exact literal:
elements the resolver could not name (the `onUnresolvedComponent` sink), and
single-path elements whose one class string carries state variants (`aria-*:`,
`data-*:`, a pseudo-class). Spec §8 limit 6 is the documented limit; the pin is
what makes it loud instead of silent. Anti-tautology for this case: it must fail
when a fixture element with `aria-current:bg-accent` on an unconditional string is
added, which is the exact shape the limit describes.

Premise: `premise("scanner reaches the component tree", UNIVERSE.length, 200)`,
module scope, same `rootDir` the rows resolve against
(`tests/styles/_metaControlOutlineFill.test.ts:46-54` records why the two must match).

Census: accepted collapses live in tests/styles/forcedColorsCensus.ts, content-keyed
per `residueKey` (`tests/styles/controlOutlineResidue.ts:436`), never line-keyed.
Plus the anti-vacuity literal: an exact row count.

## Task 3 — the forced-colors block, and the two cues that need it
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts --project=desktop-chromium` red-state=authored red-target=`app/globals.css:1143` why=`under emulateMedia forcedColors active the share-link ring computes box-shadow none and no outline, so the AC-1 assertion that the cue is visible while flashing fails until this task adds the block` ac=AC-8 -->

Spec §5.1 (share-link) and §5.2 (step-3). One unlayered block at the foot of
`app/globals.css`.

**The reduced-motion arm is part of this task, not an afterthought.** Spec review
R2 found that the share-link repair, as first written, gives a reduced-motion user
a PERMANENT ring under forced colors: `animation: none` leaves the base
`outline: 2px solid transparent`, and forced colors makes it opaque. The block
names that off state (`outline-style: none`, scoped to the reduced-motion arm for
this selector). Writing the base outline without the off state is the defect, so
they land in the same commit and AC-4d is what proves it.

The freshness cue is NOT here. Spec review R1 established that it already survives
(§5.3), and the repair this task would have applied to it would have suppressed it.
Its coverage is AC-3's two-halves assertion in Task 6, which pins the survival
rather than changing anything.

## Task 4 — the state-collapse repairs, and the census for the rest
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts --project=desktop-chromium` red-state=authored red-target=`components/crew/CrewSubNav.tsx:93` why=`under emulateMedia forcedColors active the active and inactive tab paths compute identical border-color, so the assertion that a selected control differs from an unselected one in at least one surviving property fails until the forced-colors block paints the selected state` ac=AC-4,AC-4b -->

Spec §5.4, and the repair set is the "Repair" family in the Arm 1 disposition
above, not the spec's five worked examples.

**The gate is the BROWSER, not Arm 1, and that is a correction.** The first draft
made this task's `red=` the Arm 1 vitest suite. Arm 1's projection is computed from
TSX class strings and the CSS those tokens emit; a repair that adds unlayered
selectors to `app/globals.css` changes NO element's class list, so its projection
is identical before and after and the command could never go green from its own
repair. Plan review R1 finding 3, and it is a defect in the plan's gate design
rather than in its wording.

Worse, the projection treats a token that compiles to nothing as surviving, so
adding a meaningless state class would make a collapse disappear without painting
anything. A guard that a no-op class satisfies is not a guard.

So the division is: **Arm 1 is inventory, the browser is the gate.** Arm 1 answers
"which elements state themselves only in properties forced colors flattens", which
is a question about the source and is correctly answered from the source. Whether
the repair WORKS is a question about rendered output, and only a browser can
answer it. AC-4 is asserted in Task 6's spec file; this task's `red=` names that
command because that is the command its repair turns green.

Off-states are named by setting the colour to the background system colour, NOT by
`border-style: none`, because both paths declare the border and vary only its
colour, so removing the width would reflow (spec §5.7).

Every element Arm 1 reports is repaired here or carries a
tests/styles/forcedColorsCensus.ts row with its reason, and the disposition above is
that decision already made rather than deferred to the implementer. Anti-vacuity:
the census count is pinned by an exact literal, because a census that silently
grows passes a subset assertion
(`tests/styles/_metaControlOutlineFill.test.ts:117` calls its equivalent "the
single most important case in the file").

## Task 5 — the indeterminate progress shimmer
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`app/globals.css:743` why=`app/globals.css:743 and :760 declare gradients with no forced-colors fallback, so Arm 2 reports both progress rules` ac=AC-5 -->

**The assertion is on rendered pixels, and that is forced by a measurement rather
than a preference.** Probed at plan time (`scripts/probes/forced-colors-progress-prototype.mjs`):
Firefox confirms a system-colour fill applies to the -moz-progress-bar pseudo-element under
forced colors and replaces the dropped gradient. Chromium is NOT measured by
`getComputedStyle`, which returns `rgba(0, 0, 0, 0)` for the -webkit-progress-bar pseudo-element
even in NORMAL mode where the author rule sets `#eee` — the API does not see that
UA shadow pseudo-element, so its forced-colors reading says nothing in either
direction.

A computed-style assertion here would therefore read the same empty value in every
Chromium mode and either fail confusingly or pass vacuously, which is the
tautological guard the anti-tautology rule names. So the assertion samples rendered
pixels.

**And the negative control is a FILL-ONLY deletion, not the whole block.** Plan
review R1 finding 6: the repair paints a `ButtonFace` track as well as a `Highlight`
fill, so "at least one non-background pixel" is satisfied by the track alone and
passes with the fill entirely absent. Removing the whole forced-colors block as the
control does not discriminate either, because it removes the track too and the
assertion fails for the wrong reason.

The discriminating mutant is: delete ONLY the fill declaration, leave the track
rule intact, and require the assertion to go red. Run for both engines' fill
selectors, since they are separate declarations and a control that exercises one
says nothing about the other. The assertion itself therefore cannot be "some pixel
is not the background"; it must distinguish the fill's colour from the track's,
which is what the mutant forces it to do.

## Task 6 — real-browser forced-colors assertions
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1157` why=`the reduced-motion arm names no off state, so under forced colors AND reduced motion the share-link base outline forces opaque and the AC-4d assertion that it shows NO outline in that compound state fails` ac=AC-1,AC-2,AC-3,AC-4d -->

Four states per cue, not one: forced colors on and off, crossed with reduced motion
on and off. AC-4d lives here and it is the case the transition table got wrong for
BOTH cues in its first draft, so it asserts them separately rather than together:
share-link shows NO outline at any point in the compound state, freshness shows one
only while its gating attribute is present. A single shared assertion over "the
cues" would have passed the wrong table.

**The wiring lands in this task's commit, not later.** Add `forced-colors` to the
`testMatch` alternation of `mobile-safari` (`playwright.config.ts:83`) and
`desktop-chromium` (`playwright.config.ts:97`). Verification step, run in the same
commit and recorded in it:

```
pnpm exec playwright test --list tests/e2e/forcedColors.spec.ts
```

A spec file that matches no project lists ZERO tests and exits 0, which is the
failure this step exists to catch: green, silent, and claiming coverage it does not
have. The step passes only when the listing names cases under BOTH project names.



## Task 7 — transition audit
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`app/globals.css:1224` why=`the freshness reduced-motion arm sets outline-color transparent, so the transition-inventory case asserting that arm is recorded as a documented limit rather than a repair has no matching row until this task writes it` ac=AC-3 -->

Spec §6's table, verbatim, including the compound case: the freshness cue's `-1`
and `-2` bodies stay identical after repair, which the existing drift pin requires.

## Task 8 — mutation enrolment
<!-- task: red=`pnpm vitest run tests/mutation/source/registryMembership.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:4273` why=`no GUARD_SURFACES row names tests/styles/forcedColorsScan.ts, so the membership suite reports the surface as unenrolled until this task adds the row` ac=AC-7 -->

Before the first DIFF-stage dispatch, per bl-orch Q3. Run `pnpm heavy:mutation`
under an arbitrated class lock; state score, unaccepted survivors, and the
operator set in the round-1 diff brief's GUARD SURFACE line.

**The enrolment is argued, not assumed, because the registry rejects a vacuous
row.** `tests/mutation/source/registry.ts:3027-3034` declines
`subtleInteractiveScan.ts` on the grounds that it is a pure filter over
`interactiveScanCore` with no relational, equality or logical operator and no
integer literal, so its row would be vacuous and "a vacuous row is worse than an
honest absence". `controlOutlineScan` was enrolled only after an attempt refuted
that same analogy for it.

forcedColorsScan.ts is on the enrollable side, and the sites are nameable in
advance: the projection equality comparison, the set-size relation that decides a
collapse (`projections.size < paths.size`), the multi-path guard's integer
literal, the dropped/forced property-set membership tests, and the surviving-carrier
predicate. Mutating any one of them changes which elements are reported, which the
inventory cases observe. If the first `pnpm mutation:guards` run contradicts that
reading, the honest move is the `subtleInteractiveScan` one: state the refutation
and do not enrol, rather than enrol symbolically because a brief expects a score.

<!-- tasks: end -->

## Two pins, and why they carry no `red=`

Tasks 6 and 8 in the first draft declared `red=` commands whose `why=` was "the
spec file does not exist". That is the invalid-RED shape: the failure comes from
the test file's own absence, so the command goes green when the TEST changes
rather than when an implementation lands. Removing the fake red rather than
rewording it, because both are pins over behaviour that is ALREADY correct and
neither has an observable pre-implementation red to declare.

They sit outside EVERY task region, deliberately. A region requires a `red=` on
every task it owns, and inventing one for a pin is the fake red this section
exists to remove; the multi-region design makes headings between regions
unchecked, which is exactly this case. Each is validated by a recorded planted
defect instead.

## Task 9 — DESIGN.md section and the token mapping

Spec §3.1 verbatim, including rule 4's statement that the three slots apply PER
AFFORDANCE and are not tokens. bl-orch made that a condition of approving the
mechanism change, for a concrete reason: a future author who reads "selected takes
Highlight" and goes looking for a selected token will not find one, and the next
thing they try is re-pointing a shared token, which is the failure §3.3 records.

Four pre-dispatch mutants for this text pin, per the string-presence rule: (a) the
DESIGN.md section emptied; (b) the section present plus an appended suffix; (c) the
text present but commented out or inside a fenced block, so it exists but not where
the assertion claims; (d) rule 4 specifically deleted while the rest stays, since a
whole-section pin that passes without rule 4 does not pin bl-orch's condition.

**No `red=` marker, and the reason is the marker grammar rather than the work.**
This task's defective surface is `DESIGN.md`, which has no forced-colors section.
A `red-target=` is classified bare when its path contains no `/`
(`lib/specLint/citations.ts:55`), and a bare target is rejected outright
(`lib/specLint/redContract.ts:164`), so no legal marker can name a repo-root file.
Pointing the field at some other path would satisfy the gate with a value that is
not the defective surface, which is worse than an honest absence.

So it sits with the pins, and its red is observed the same way theirs are: the
RED step runs the AC-9 case against today's `DESIGN.md` and records the failure
before the section is written. The four string-presence mutants below still apply.

## Task 10 — pin the focus rule, cascade-sensitively

Spec §5.6, AC-6. `app/globals.css:899` is correct today, so this is a
characterization pin and it would pass the moment it is authored. Its value is
entirely in what it catches later, so its validity is established by planting the
defect it exists for and recording the result in the commit:

1. Move `app/globals.css:899` into `@layer base`. Run. Observe RED. This is the assertion's
   whole point: a text-presence check stays green through this edit, and the
   cascade table says a layered rule loses.
2. Restore. Run. Observe GREEN.
3. Delete the rule outright. Run. Observe RED.
4. Replace the outline with an equivalent `box-shadow`. Run. Observe RED.

Four planted defects rather than one, because a pin that only catches deletion is
a pin against the edit nobody makes.

## Task 11 — layout neutrality

Spec §5.7's table, verbatim. `getBoundingClientRect()` with forced colors off and
on, agreeing within 0.5px, for every repaired element.

Same shape: the repairs are DESIGNED not to reflow, so this passes when authored.
Planted defect, recorded: change one cue repair from `outline` to a `border` of
the same width, run, observe RED (the box grows by the border width), revert. That
is the exact mistake §5.7 exists to prevent, and it is the one a future author is
most likely to make, because `border` is the more familiar property.

## Task 12 — pin the spec-to-probe correspondence

Spec review R1 finding 4 was that the spec licensed `text-shadow` as a measured
dropped property while the probe never set or read it. The instance is repaired.
The CLASS is "the spec cites an M-row the probe does not measure", and a one-time
grep closes it until the next person adds a claim.

So it becomes an assertion, in tests/styles/_metaForcedColors.test.ts:

- Extract every `M<n>` token the spec cites, from the spec.
- Extract every case id the producer defines, from `scripts/probes/forced-colors-mechanism.mjs`.
- Assert the cited set is a SUBSET of the defined set, and report by name any
  cited row with no case.

Derived on both sides, so neither list is typed. Run at plan time, both directions
already agree: cited = {M1, M1b, M2..M13}, defined = the same fourteen.

Anti-tautology: the case must fail when the spec cites a nonexistent `M14`, and it
must fail when a defined case is deleted while a citation remains. Both mutants run
before the diff dispatch, results in the commit. A subset assertion alone would
pass if the spec cited nothing at all, so the case also premises that the cited set
is non-empty.

## Disposed criteria

None yet. Every AC-1..AC-9 is claimed above.

## Arm 1 sweep, RUN and DISPOSITIONED at plan time

`pnpm exec tsx scripts/probes/forced-colors-arm1-prototype.mts`, at `a5b5537a0`:

```
universe (textEntry + paintedChildren): 805
multi-path elements: 79
unresolved components reported: 113
COLLAPSING (oracle projection): 39
```

The denominator is 805 and not 366. A first draft of this plan reported 366, which
is the DEFAULT-options universe, beside a collapse set computed with
`paintedChildren` on: two numbers about two different populations. Plan review R1
finding 2. The prototype now prints its own denominator so the pair cannot drift
apart again.

All 39 are dispositioned here, by FAMILY rather than as a 39-row hand list, because
a list re-opens the moment someone adds a site and a family rule does not. The
prototype prints the COLLIDING PAIR per element, which is what makes the family
assignment mechanical: the tokens that differ between the two paths that share a
projection.

### Repair (the three semantic slots apply, per spec §3.3)

Selection or state carried by background, border and text tone alone. Under forced
colors all three force to one value and the state is unreadable.

| Site | Colliding pair |
| --- | --- |
| `app/me/meShowSections.tsx:219` | `bg-accent bg-info-bg text-accent-text text-text` |
| `app/me/meShowSections.tsx:278` | same |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:249` | `bg-accent bg-surface-sunken text-accent-text text-text-subtle` |
| `components/admin/OnboardingWizard.tsx:260` | `bg-accent bg-surface border-accent-edge border-text-faint text-accent-text text-text-subtle` |
| `components/crew/CrewSubNav.tsx:114` | `border-accent border-transparent text-text-strong text-text-subtle` |
| `components/admin/review/ShowReviewSurface.tsx:838` | `bg-surface bg-surface-sunken border-text-faint border-transparent text-text text-text-strong` |
| `components/admin/review/ShowReviewSurface.tsx:1019` | same |
| `components/admin/UndoChangeButton.tsx:51` | `bg-surface bg-transparent border-text-faint border-transparent` |
| `components/admin/nav/AdminNav.tsx:236` | `bg-surface-raised text-text-strong text-text-subtle` |
| `components/admin/nav/AdminNav.tsx:301` | `text-accent-on-bg text-text-subtle` |
| `components/admin/telemetry/EventFilters.tsx:97` | `bg-text text-bg text-text` |
| `components/admin/showpage/PublishedReviewModal.tsx:1133` | `bg-surface-sunken bg-warning-bg border-text-faint border-warning-text text-text text-warning-text` |
| `components/admin/wizard/Step3ReviewModal.tsx:590` | same |
| `components/admin/ShowRowActions.tsx:647` | `bg-surface-sunken text-text-strong text-text-subtle` |
| `components/admin/wizard/CrewRowActions.tsx:270` | same |
| `components/admin/UseRawControl.tsx:360` | `border-text-strong border-text-subtle` |
| `components/admin/UseRawControl.tsx:372` | `text-text text-text-strong` |
| `components/admin/review/ShowReviewSurface.tsx:823` | `text-text text-text-strong` |
| `components/admin/review/ShowReviewSurface.tsx:945` | same |
| `components/admin/RescanSheetButton.tsx:209` | `border-control-outline-tinted border-text-faint` |

Three of these are crew-facing and none was found by reading: `app/me` twice and
the picker interstitial. That is the argument for a derived inventory in one line.

### Census: switch tracks (ruled exemption)

`bg-accent`/`bg-surface-sunken` with `border-accent-edge`/`border-border-strong`,
the switch-track recipe whose contrast treatment is already ruled (`DESIGN.md`
§1.2a, `tests/styles/controlOutlineResidue.ts:873`).

`components/admin/PublishedToggle.tsx:517`,
`components/admin/settings/AutoPublishToggle.tsx:123`,
`components/admin/settings/NotifyToggle.tsx:131`,
`components/admin/settings/DeveloperToggleButton.tsx:93`,
`components/admin/telemetry/AutoRefreshControl.tsx:105`.

FIVE, not the three the spec's §8 limit 5 says. The spec's number came from a
partial reading before the arm ran; the census is the authority and the spec cites
the command rather than a count, so nothing there needs re-typing. Recorded here
because a reader comparing the two would otherwise find a discrepancy and no note.

### Census: an icon whose colour changes beside a label that also changes

The icon is not the sole carrier — the adjacent text tone moves with it, and in
two cases the chevron also rotates, which survives forced colors outright.

`components/admin/review/ShowReviewSurface.tsx:819` and
`components/admin/review/ShowReviewSurface.tsx:939`,
`components/admin/showpage/PublishedReviewModal.tsx:1376`,
`components/admin/wizard/Step3ReviewModal.tsx:729`.

### Census: no state distinction at rest

The colliding pair differs only in a `hover:` token or in nothing a user reads
while not pointing at the control.

`components/admin/review/ShowReviewSurface.tsx:805` and
`components/admin/review/ShowReviewSurface.tsx:926`
(`bg-surface-sunken hover:bg-surface-sunken`),
`components/admin/UseRawControl.tsx:334` (`bg-surface-sunken`),
`components/admin/showpage/ShareHub.tsx:828` (`bg-surface-sunken bg-transparent`).

### Census: focus-ring offset colour only

`components/admin/PerShowActionableWarnings.tsx:458`, whose pair differs only in
`focus-visible:ring-offset-*`. The ring is not the focus indicator in this repo
(spec §2.2), and an offset colour is invisible under forced colors either way.

### Census: text opacity variants of one token

`components/admin/showpage/PublishedReviewModal.tsx:1327` and
`components/admin/wizard/Step3ReviewModal.tsx:662`, whose pair differs by
`text-warning-text/80` against a sibling tone. Both force to `CanvasText`; the
distinction is emphasis, which spec §8 limit 2 flattens deliberately.

### Census: not a collapse at all

`components/admin/NeedsAttentionSummaryCard.tsx:36`, whose colliding pair prints
`(identical)`: two render paths that resolve to the same class string. Nothing
differs, so nothing collapses. It is reported because the arm compares path COUNT
before projections, and it stays in the census as a named artifact rather than
being silently filtered, since a filter here would also hide a real duplicate.

## Arm 2 sweep, RUN at plan time

`scripts/probes/forced-colors-arm2-prototype.mjs`, the repaired A2a (surviving carrier set
empty, whether the members are dropped, forced, or mixed) over `app/globals.css`:

```
progress[...wizard-step2-progressbar]::-webkit-progress-*      [background-color]   x2
progress[...wizard-step2-progressbar]::-moz-progress-*         [background-color]
progress[...wizard-step2-progressbar]:indeterminate::*         [background-color,gradient]  x2
html                                                            [background-color,color]
@media (prefers-reduced-motion) > [data-step3-warning-flash]    [background-color]
@media (prefers-reduced-motion) > [data-section-freshness-flash][outline-color]
@layer base > .help-prose > h1 / h2 / h3                        [color]              x3
@media (max-width: 480px) > .help-prose table .th-label         [color]
total: 12
```

Two things this run establishes, and both are why it was run rather than described:

1. **The F2 repair works.** The step-3 steady reduced-motion fallback appears.
   Round 1 named it as a rule the first draft's A2a could not see, because its
   carrier is forced rather than dropped. It is now caught.
2. **A2a reports non-affordances, and that is the design rather than a defect.**
   `html`, the three `.help-prose` headings and the stacked-table label carry a
   reading colour, not an affordance. They are census rows reading "base reading
   colour, deliberate flatten, spec §8 limit 2". Narrowing the criterion to
   exclude colour-only rules would hide a real defect (status text carried by
   colour alone), so the criterion stays broad and the census dispositions it,
   which is spec §4.4's report-do-not-decide rule doing its job on its first
   customer.

Per-hit disposition for all 12 lands in tests/styles/forcedColorsCensus.ts
during Task 1, each row carrying its reason.

## Sweeps to author AND run at plan time

- The Arm 1 and Arm 2 finding sets on the live tree, pasted, with a per-hit disposition.
- The registry-array diff for Task 8.
- The four string-presence mutants for every text-pin assertion (Task 9's DESIGN.md pin).

## RED-validity note

Tasks 3, 4 and 5 were drafted `red-state=live` and corrected to `authored` during
plan self-review. Their command names a suite Tasks 1 and 2 create, so on today's
tree it fails because the FILE is absent, not because the finding exists. That is
the invalid-RED shape: it would go green when the test file changes rather than
when the implementation lands. Each now names the production surface whose defect
makes the case fail, verified defective on the live tree.

No task in this plan carries `red-state=live`, so `pnpm spec:lint --exec-red` has
no live command to run here. That is stated rather than left to inference: silence
from the arm is not a certificate.
