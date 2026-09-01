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
CREATES: tests/e2e/forcedColors.spec.ts (real-browser assertions, AC-1..AC-6, layout neutrality).
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
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`app/globals.css:1143` why=`app/globals.css has no forced-colors block, so Arm 2 (landed in Task 1) reports the three cue rules and the case asserting its finding set is empty fails` ac=AC-8 -->

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
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`components/crew/CrewSubNav.tsx:93` why=`the collapsing sites carry no forced-colors treatment, so Arm 1 (landed in Task 2) reports every one of them and the case asserting its unregistered finding set is empty fails` ac=AC-4,AC-4b -->

Spec §5.4. Off-states named by setting the colour to the background system colour,
NOT by `border-style: none`, because both paths declare the border and vary only
its colour, so removing the width would reflow (spec §5.7).

The repair set is whatever Arm 1 reports, not the spec's five. Each reported
element is repaired here or gets a tests/styles/forcedColorsCensus.ts row with
its reason and, for a ruled exemption, its citation. Anti-vacuity: the census
count is pinned by an exact literal, because a census that silently grows passes
a subset assertion (`tests/styles/_metaControlOutlineFill.test.ts:117` calls its
equivalent "the single most important case in the file").

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
tautological guard the anti-tautology rule names. So: screenshot the element and
require a non-background pixel, with a negative control (the same page with the
forced-colors block removed) proving the assertion discriminates rather than
passing on any render at all.

## Task 6 — real-browser forced-colors assertions
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1152` why=`the forced-colors block does not exist, so the cue assertions see no outline under emulateMedia forcedColors active` ac=AC-1,AC-2,AC-3,AC-4d -->

Four states per cue, not one: forced colors on and off, crossed with reduced motion
on and off. AC-4d lives here and it is the case the transition table got wrong for
BOTH cues in its first draft, so it asserts them separately rather than together:
share-link shows NO outline at any point in the compound state, freshness shows one
only while its gating attribute is present. A single shared assertion over "the
cues" would have passed the wrong table.

## Task 7 — transition audit
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`app/globals.css:1196` why=`the forced-colors keyframe bodies do not exist` ac=AC-3 -->

Spec §6's table, verbatim, including the compound case: the freshness cue's `-1`
and `-2` bodies stay identical after repair, which the existing drift pin requires.

## Task 8 — mutation enrolment
<!-- task: red=`pnpm vitest run tests/mutation/source/registry.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:4273` why=`no row names tests/styles/forcedColorsScan.ts, and the control string it will declare does not occur in a tracked source` ac=AC-7 -->

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
