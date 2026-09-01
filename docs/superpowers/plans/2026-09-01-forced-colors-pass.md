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
| AC-1 | Task 3 and Task 4 (the cue), Task 12 (its layout half) |
| AC-2 | Task 4 |
| AC-3 | Task 5, both halves — the idle half is the one §5.3's first draft got backwards |
| AC-4 | Task 6, data-driven over every repair row |
| AC-4b | Task 2 (the census and its two literals), Task 6 (the repairs) |
| AC-4c | Task 2 (Arm 1 emits the CANNOT-DECIDE set; the pin is its exact-count literal) |
| AC-4d | Task 5 (the compound forced-colors + reduced-motion state, both cues) |
| AC-5 | Task 7, pixels in Playwright plus the cross-engine half in the mechanism probe |
| AC-6 | Task 11, the focus pin — no `red=`, validated by four planted defects |
| AC-7 | Tasks 1 and 2 |
| AC-8 | Task 4 |
| AC-9 | Task 10 |

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
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`tests/styles/forcedColorsScan.ts` why=`the module does not exist, so the suite cannot import scanCarrierLoss and every case fails on the missing export` ac=AC-7 -->

Parse the SOURCE `app/globals.css` with postcss (the
`tests/styles/_metaZIndexBands.test.ts:35` mechanism). Two closed criteria, spec §4.1:

- **A2a** — a rule whose SURVIVING carrier set is empty: every declaration that
  could carry the affordance is dropped, forced onto the palette, or a mixture, and
  none is an `outline` or `border` style or width. Requiring a DROPPED member was
  the criterion spec review R1 refuted and plan reviews R1 and R2 each found still
  written here; it silently misses the ten forced-only live rules, among them both
  reduced-motion arms and the three base progress rules.
- **A2b** — a `@keyframes` block whose animated properties are all dropped, or all
  forced, so both endpoints land on one used value.

Source and not compiled, carried as this suite's own case: the same criterion over
compiled output reports an order of magnitude more, every extra one a Tailwind
`.shadow-*` or `.ring-*` utility. Both inventory cases PRINT their rows, so the
spec cites a command rather than a count.

Premise: `premiseHolds` that the parsed source contains
`@keyframes share-link-flash-ring` before any emptiness assertion. A scanner handed
an empty string returns `[]` and every such assertion passes.

Discriminating case, without which the arm could report EVERYTHING and still pass:
a rule with a dropped carrier AND a surviving one is not reported; the same rule
without the surviving one is.

## Task 2 — Arm 1, state collapse, the census, and the cannot-decide set
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`tests/styles/forcedColorsScan.ts` why=`projectPath and findCollisions do not exist, so the case asserting CrewSubNav's two tab paths share a projection fails on the missing export` ac=AC-7,AC-4c -->

`scanInteractiveElements` (`tests/styles/interactiveScanCore.ts:1067`) with
`{ textEntry: true, paintedChildren: true }` and a REQUIRED `onUnresolvedComponent`
sink; the Tailwind design system (`tests/styles/controlOutlineResidue.ts:146`) for
what each token emits, scanning the candidate's own rule after stripping the
`@property` blocks it returns alongside.

The census is the disposition above, transcribed: 25 repair rows and 17 census rows
with their reasons. Two literals pin it — the family sum against the arm's output,
and an exact row count — because a census that silently grows passes a subset
assertion.

The CANNOT-DECIDE set (AC-4c) is the unresolved-component sink plus single-path
elements carrying state variants. Its anti-tautology case: adding a fixture element
with `aria-current:bg-accent` on an unconditional string must make it grow.

## Task 3 — the e2e harness, wired, with the first assertion
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1143` why=`app/globals.css has no forced-colors block, so under emulateMedia forcedColors active the share-link ring computes box-shadow none with no outline and the AC-1 assertion that the cue is visible while flashing fails` ac=AC-1 -->

Creates tests/e2e/forcedColors.spec.ts carrying AC-1, AND adds `forced-colors` to
the `testMatch` alternation of `mobile-safari` (`playwright.config.ts:83`) and
`desktop-chromium` (`playwright.config.ts:97`).

**The wiring is in THIS task and not a later one**, because those `testMatch` values
are explicit allowlist regexes rather than globs: an unwired spec file lists zero
tests and exits 0, so every later task whose `red=` is a Playwright command would
declare a red against a command that collects nothing. Plan review R2 finding 5
counted that across two tasks. Verification, in this commit:

```
pnpm exec playwright test --list tests/e2e/forcedColors.spec.ts
```

which must name cases under BOTH project names.

**Readiness and sampling, stated once here and inherited by every later browser
task.** The cues are timer-gated and one of them remounts, so an assertion that
samples at the wrong moment is flaky in both directions. Every case: waits for the
element by role or test id rather than a timeout; asserts the cue's presence while
the gating attribute is present, using `expect.poll` against the computed style so a
single unlucky frame does not decide; and re-reads the handle after any remount
rather than holding one across it. `fullyParallel: false`
(`playwright.config.ts:35`) already serializes, and `baseURL` is pinned to
`127.0.0.1` (`playwright.config.ts:92`); this task adds no server of its own.

## Task 4 — the forced-colors block, and the two cues that need it
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=live red-target=`app/globals.css:1143` why=`Task 3 committed AC-1 observed-red against the missing block; this task turns the SAME command green by adding the unlayered block with the share-link and step-3 outline substitutions` ac=AC-1,AC-2,AC-8 -->

Spec §5.1 and §5.2. One unlayered block at the foot of `app/globals.css`.

The freshness cue is NOT repaired: spec §5.3 establishes it already survives, and
the repair this task would have applied would have suppressed it. AC-3's two-halves
assertion lands in Task 5 and pins the survival.

The reduced-motion arm is part of this task. `app/globals.css:1157` sets
`animation: none` for the share-link cue, so a base transparent outline would force
opaque and give a reduced-motion user a permanent ring. The block names that off
state.

## Task 5 — AC-3 and AC-4d, the states the transition table got wrong
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1157` why=`the block Task 4 added does not yet name the share-link off state under reduced motion, so the AC-4d assertion that it shows NO outline with both settings active fails while the base outline forces opaque` ac=AC-3,AC-4d -->

Both halves of AC-3 (idle shows no outline, flashing shows one) and both cues under
AC-4d, asserted separately because they differ in that compound state and the
transition table's first draft got both wrong.

## Task 6 — the state-collapse repairs, and AC-4 over every one of them
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`components/crew/CrewSubNav.tsx:93` why=`the active and inactive tab paths compute identical border-color under forced colors, so the AC-4 case fails for that row until the block paints the selected state` ac=AC-4,AC-4b -->

The repair set is the disposition's 25 Repair rows.

**AC-4 is DATA-DRIVEN over those rows, not hand-written per site.** Plan review R2
finding 7: an earlier draft asserted only the spec's five worked examples, leaving
twenty rows repaired and unasserted. The case reads the census's repair rows and,
for each, renders the two colliding paths and requires their computed styles to
differ in at least one surviving property under forced colors. One mechanism over N
rows, so a row added to the census is asserted by existing, which is the
derivation-not-a-list rule applied to the test.

Off-states are named by setting the colour to the background system colour, NOT by
`border-style: none`: both paths declare the border and vary only its colour, so
removing the width would reflow (spec §5.7).

## Task 7 — the indeterminate progress shimmer
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:743` why=`the gradient is dropped under forced colors and the Firefox rule sets background-color transparent, so the AC-5 assertion that the bar paints a fill distinguishable from its track fails` ac=AC-5 -->

Spec §5.5. **The assertion samples rendered pixels and must distinguish the FILL
from the TRACK.** A computed-style assertion reads `rgba(0, 0, 0, 0)` for
`-webkit-progress-bar` in Chromium even in normal mode, so it would pass vacuously;
and "some pixel is not the background" is satisfied by the `ButtonFace` track with
the `Highlight` fill entirely absent, which plan review R2 finding 6 named.

Negative controls, both run and recorded in this commit: delete ONLY the
`-webkit-` fill declaration, leave the track, require red; then the same for the
`-moz-` fill. Two controls because they are separate declarations and one says
nothing about the other.

**Firefox is not a Playwright project in this repo** (the two configured browsers
are Chromium and WebKit), so AC-5's cross-engine half cannot be a Playwright case.
It is asserted where both engines already run: `scripts/probes/forced-colors-mechanism.mjs`
gains a progress case, and its transcript is regenerated in this commit. Stated as
a decision rather than left as an omission, because "both engines" was nominal
before plan review R2 finding 6.

## Task 8 — the documented limits that need a row
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`app/globals.css:1224` why=`the freshness reduced-motion arm sets outline-color transparent and no census row records it as a deliberate limit, so the case asserting every A2b row is either repaired or carries a limit row fails on that row` ac=AC-3 -->

Spec §6's transition inventory and §8's limits 7 and 8, as census rows with reasons.

## Task 9 — mutation enrolment
<!-- task: red=`pnpm vitest run tests/mutation/source/registryMembership.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:4273` why=`no GUARD_SURFACES row names tests/styles/forcedColorsScan.ts, so the membership suite does not carry the surface and the case asserting it is enrolled fails` ac=AC-7 -->

Before the first DIFF-stage dispatch, per bl-orch. Run `pnpm heavy:mutation` under
an arbitrated class lock; state score, unaccepted survivors and the operator set in
the round-1 diff brief's GUARD SURFACE line.

**The enrolment is argued, not assumed.** `tests/mutation/source/registry.ts:3027`
declines `subtleInteractiveScan.ts` as a pure filter with no operator sites, on the
grounds that a vacuous row is worse than an honest absence. forcedColorsScan.ts is
on the enrollable side and its sites are nameable now: the projection equality, the
set-size relation deciding a collapse, the multi-path guard's integer literal, the
dropped and forced membership tests, and the surviving-carrier predicate. If the
first run contradicts that reading, the honest move is the `subtleInteractiveScan`
one: state the refutation and do not enrol.

<!-- tasks: end -->

## Execution order, and why every RED is stated against it

Three plan-review findings across two rounds were REDs that could not complete, and
all but one broke the same way: the command was already green when its task ran,
because an earlier task had landed the thing its `why=` said was missing. Two rounds
on one vector is this repo's trigger for comprehensive re-analysis rather than
another per-instance patch, so the order is written down and every `red=` above is
derived from it rather than from the task in isolation.

| After | The tree has | So the next red can rest on |
| --- | --- | --- |
| — | no scanner, no e2e spec, no block, no census | a missing module |
| Task 1 | Arm 2 and its suite | a missing module (Arm 1's) |
| Task 2 | both arms, the census, the cannot-decide set | nothing in CSS yet |
| Task 3 | the e2e spec, WIRED, carrying AC-1 observed red | the missing block |
| Task 4 | the block, share-link and step-3 repaired | the unnamed reduced-motion off state |
| Task 5 | AC-3 and AC-4d green | the unrepaired state collapses |
| Task 6 | the 25 repairs, AC-4 green over all of them | the progress gradient |
| Task 7 | the progress fill | the missing limit rows |
| Task 8 | the limit rows | the unenrolled surface |
| Task 9 | the registry row | — |

Task 3 is the hinge: it wires `testMatch` in its own commit, so every later
Playwright `red=` names a command that actually collects. Task 4 is the only
`red-state=live` marker, and it is the canonical shape — Task 3 committed that exact
command observed red, and Task 4 turns the SAME command green.

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

## Task 10 — DESIGN.md section and the token mapping

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

## Task 11 — pin the focus rule, cascade-sensitively

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

## Task 12 — layout neutrality

Spec §5.7's table, verbatim. `getBoundingClientRect()` with forced colors off and
on, agreeing within 0.5px, for every repaired element.

Same shape: the repairs are DESIGNED not to reflow, so this passes when authored.
Planted defect, recorded: change one cue repair from `outline` to a `border` of
the same width, run, observe RED (the box grows by the border width), revert. That
is the exact mistake §5.7 exists to prevent, and it is the one a future author is
most likely to make, because `border` is the more familiar property.

## Task 13 — pin the spec-to-probe correspondence

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

`pnpm exec tsx scripts/probes/forced-colors-arm1-prototype.mts`:

```
universe (textEntry + paintedChildren): 805
multi-path elements: 79
unresolved components reported: 113
COLLAPSING (oracle projection): 42
```

**42, and it was 39 until the instrument was repaired.** `candidatesToCss()`
returns the candidate's rule PLUS the `@property` definitions its custom properties
depend on, and those declare `syntax`, `inherits` and `initial-value` — none of
which is a forced or dropped property. Scanning the whole returned string therefore
classified `shadow-tile` and every ring utility as SURVIVING, which made paths look
different and HID collapses. Plan review R2 finding 2. The prototype now strips
at-rules and scans the candidate's own rule, and the three sites that were hidden
are `components/admin/DashboardBucketSegmentedControl.tsx:56`,
`components/admin/DashboardBucketSegmentedControl.tsx:76` and
`components/shared/AccentButton.tsx:139`.

The denominator is 805, from the same options the collapse set uses. A first draft
printed 366, the DEFAULT-options universe, which is a different population.

All 42 are dispositioned below, by family, each with the COLLIDING PAIR the
prototype prints — the tokens that differ between the two paths sharing a
projection. The families are exhaustive by construction: 25 + 5 + 5 + 2 + 1 + 2 + 1
+ 1 = 42, and Task 2's suite asserts that sum against the arm's own output, so a
new site cannot land in no family.

### Repair — 25 rows

State carried by background, border or text tone alone, with no other carrier. The
three semantic slots (spec §3.3) apply at these selectors.

| Site | Colliding pair | |
| --- | --- | --- |
| `app/me/meShowSections.tsx:219` | `bg-accent bg-info-bg text-accent-text text-text` | crew-facing |
| `app/me/meShowSections.tsx:278` | `same` | crew-facing |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:249` | `bg-accent bg-surface-sunken text-accent-text text-text-subtle` | crew-facing |
| `components/crew/CrewSubNav.tsx:114` | `border-accent border-transparent text-text-strong text-text-subtle` | crew-facing |
| `components/crew/primitives/RunOfShowList.tsx:93` | `text-text-strong text-text-subtle` | crew-facing |
| `components/admin/OnboardingWizard.tsx:260` | `bg-accent bg-surface border-accent-edge border-text-faint text-accent-text text-text-subtle` | |
| `components/admin/review/ShowReviewSurface.tsx:838` | `bg-surface bg-surface-sunken border-text-faint border-transparent text-text text-text-strong` | |
| `components/admin/review/ShowReviewSurface.tsx:1019` | `same` | |
| `components/admin/review/ShowReviewSurface.tsx:805` | `bg-surface-sunken hover:bg-surface-sunken` | |
| `components/admin/review/ShowReviewSurface.tsx:926` | `same` | |
| `components/admin/review/ShowReviewSurface.tsx:823` | `text-text text-text-strong` | |
| `components/admin/review/ShowReviewSurface.tsx:945` | `same` | |
| `components/admin/UndoChangeButton.tsx:51` | `bg-surface bg-transparent border-text-faint border-transparent` | |
| `components/admin/nav/AdminNav.tsx:236` | `bg-surface-raised text-text-strong text-text-subtle` | |
| `components/admin/nav/AdminNav.tsx:301` | `text-accent-on-bg text-text-subtle` | |
| `components/admin/telemetry/EventFilters.tsx:97` | `bg-text text-bg text-text` | |
| `components/admin/showpage/PublishedReviewModal.tsx:1133` | `bg-surface-sunken bg-warning-bg border-text-faint border-warning-text text-text text-warning-text` | |
| `components/admin/wizard/Step3ReviewModal.tsx:590` | `same` | |
| `components/admin/ShowRowActions.tsx:647` | `bg-surface-sunken text-text-strong text-text-subtle` | |
| `components/admin/wizard/CrewRowActions.tsx:270` | `same` | |
| `components/admin/UseRawControl.tsx:360` | `border-text-strong border-text-subtle` | |
| `components/admin/UseRawControl.tsx:372` | `text-text text-text-strong` | |
| `components/admin/RescanSheetButton.tsx:209` | `border-control-outline-tinted border-text-faint` | |
| `components/admin/DashboardBucketSegmentedControl.tsx:56` | `bg-surface shadow-tile text-text-strong text-text-subtle` | |
| `components/admin/DashboardBucketSegmentedControl.tsx:76` | `same` | |

Five are crew-facing and NONE was found by reading: both `app/me` chips, the picker
interstitial's role chip, and the run-of-show title tone. `CrewSubNav.tsx:114` was
read; its siblings were not.

### Census — switch tracks, ruled exemption (5 rows)

`bg-accent`/`bg-surface-sunken` with `border-accent-edge`/`border-border-strong`:
the switch-track recipe whose contrast treatment is already ruled (`DESIGN.md`
§1.2a, `tests/styles/controlOutlineResidue.ts:873`). Re-deciding a ratified visual
treatment is not this pass's to make.

`components/admin/PublishedToggle.tsx:517`,
`components/admin/settings/AutoPublishToggle.tsx:123`,
`components/admin/settings/NotifyToggle.tsx:131`,
`components/admin/settings/DeveloperToggleButton.tsx:93`,
`components/admin/telemetry/AutoRefreshControl.tsx:105`.

FIVE, where the spec's §8 limit 5 says three. The spec's number came from a partial
reading before the arm ran; the census is the authority and the spec cites the
command rather than a count, so nothing there needs re-typing. Recorded because a
reader comparing the two would otherwise find a discrepancy and no note.

### Census — an icon whose tone moves with a label that also moves (5 rows)

The icon is not the sole carrier: the adjacent text tone changes with it, two of the
chevrons also rotate (which survives outright), and `CrewSubNav.tsx:125` sits inside
`CrewSubNav.tsx:114`, which this pass REPAIRS, so the icon inherits a repaired state.

`components/admin/review/ShowReviewSurface.tsx:819`,
`components/admin/review/ShowReviewSurface.tsx:939`,
`components/admin/showpage/PublishedReviewModal.tsx:1376`,
`components/admin/wizard/Step3ReviewModal.tsx:729`,
`components/crew/CrewSubNav.tsx:125`.

### Census — state carried by ARIA and a rendered element (2 rows)

Plan review R2 finding 4 refuted an earlier "no distinction at rest" family here:
both sites DO differ at rest. Their surviving carrier is not the background.

- `components/admin/UseRawControl.tsx:334` — `role="radio"` with `aria-checked`
  (`components/admin/UseRawControl.tsx:340`), and the checked row renders a dot. The
  background is decoration on top of a state the accessibility tree and a rendered
  mark both carry.
- `components/admin/showpage/ShareHub.tsx:828` — the kebab's `aria-expanded`
  (`components/admin/showpage/ShareHub.tsx:834`), and when it is true a popup is on
  screen. The open state is the popup, not the button's fill.

### Census — focus-ring offset colour only (1 row)

`components/admin/PerShowActionableWarnings.tsx:458`, whose pair differs only in
`focus-visible:ring-offset-*`. The ring is not this repo's focus indicator
(spec §2.2) and an offset colour is invisible under forced colors either way.

### Census — emphasis opacity variants of one token (2 rows)

`components/admin/showpage/PublishedReviewModal.tsx:1327` and
`components/admin/wizard/Step3ReviewModal.tsx:662`, differing by
`text-warning-text/80` against a sibling tone. Both force to `CanvasText`; the
distinction is emphasis, which spec §8 limit 2 flattens deliberately.

### Census — elevation only (1 row)

`components/shared/AccentButton.tsx:139`, whose sixteen paths collide on
`shadow-tile` alone: a raised variant against a flat one, with no colour or state
difference. Spec §8 limit 3, elevation flattens. It surfaced only after the
instrument repair, because `shadow-tile` used to read as surviving.

### Census — not a collapse (1 row)

`components/admin/NeedsAttentionSummaryCard.tsx:36`, whose pair prints
`(identical)`: two render paths resolving to the same class string. Nothing differs.
It is reported because the arm compares path COUNT before projections, and it stays
in the census as a named artifact rather than being filtered, since a filter here
would also hide a real duplicate.

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
