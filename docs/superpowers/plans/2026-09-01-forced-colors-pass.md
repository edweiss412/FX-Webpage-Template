# Plan — the forced-colors pass

Spec: `docs/superpowers/specs/2026-09-01-forced-colors-pass.md` (APPROVE at spec
review round 3, zero findings). Branch `feat/forced-colors-pass`. Row
`SHARELINK-CUE-FORCED-COLORS-1` in the repo-root `DEFERRED.md`.

The spec's criteria are declared in its §7 and are covered here by the map below,
not re-declared. Every count in this plan is either a run output pasted under its
command or a command the reader can run; none is retyped from the spec.

<!-- self-reference: checked -->

## Acceptance-criteria coverage map

The criteria are declared in the sibling spec's §7, not here, so this map is how
every one of them is accounted for. Checked mechanically at plan time: the set of
spec-declared ids and the set covered below are equal, neither typed.

| AC | Covered by |
| --- | --- |
| AC-1 | Task 3, which wires the harness and repairs the share-link cue in one task; Task 13 for its layout half |
| AC-2 | Task 4 |
| AC-3 | Task 5, both halves — the idle half is the one §5.3's first draft got backwards |
| AC-4 | Task 6, data-driven over every repair row |
| AC-4b | Task 2 (the census and its two literals), Task 6 (the repairs) |
| AC-4c | Task 2, a characterization task (Arm 1 emits the CANNOT-DECIDE set; the pin is its exact-count literal, with a planted `aria-current:bg-accent` fixture proving it grows) |
| AC-4d | Task 5 (the compound forced-colors + reduced-motion state, both cues) |
| AC-5 | Task 7: pixels in Playwright, and the cross-engine half in the mechanism probe |
| AC-6 | Task 12, the focus pin — no `red=`, validated by four planted defects |
| AC-7 | Tasks 1 and 2 |
| AC-8 | Task 11, a pin: the block is already unlayered when it runs |
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

## Tasks 1 and 2 are characterization, and carry no `red=`

Four review rounds landed findings on RED validity, and round 4 named the shape
rather than another instance: these two tasks derive their red from a module that
does not exist yet, which is the form this repo calls invalid outright — a failure
that comes from an unresolved import goes green when the TEST file changes, not
when an implementation lands.

That is not a defect in how they were written. It is true of every scanner task by
construction: the production surface under test IS the scanner, so there is no
production defect for its own test to fail on. A red-then-green cycle cannot exist
here, and four rounds of trying to phrase one produced four wrong phrasings.

So they sit outside the red-contract region with the pins, and their discriminating
power is established the way the pins' is: by planting the defect each exists to
catch and recording the result in the task's commit. Each task below names its
plants. That closes the vector rather than moving it.

## Task 1 — Arm 2, carrier loss over the source stylesheet
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
`.shadow-*` or `.ring-*` utility. Both inventory cases PRINT their rows, so the spec cites a command rather than a
count. **And a third case ASSERTS**, which the printing ones do not: the live A2a
and A2b sets minus the census are empty. Round 4 finding 4 caught that printing is
not gating — a contributor adding a new carrier-loss rule to `app/globals.css`
would see it reported and nothing would fail. Its plant: add a rule declaring only
`box-shadow`, observe RED.

Premise: `premiseHolds` that the parsed source contains
`@keyframes share-link-flash-ring` before any emptiness assertion. A scanner handed
an empty string returns `[]` and every such assertion passes.

Discriminating case, without which the arm could report EVERYTHING and still pass:
a rule with a dropped carrier AND a surviving one is not reported; the same rule
without the surviving one is.

## Task 2 — Arm 1, state collapse, the census, and the cannot-decide set
`scanInteractiveElements` (`tests/styles/interactiveScanCore.ts:1067`) with
`{ textEntry: true, paintedChildren: true }` and a REQUIRED `onUnresolvedComponent`
sink; the Tailwind design system (`tests/styles/controlOutlineResidue.ts:146`) for
what each token emits, scanning the candidate's own rule after stripping the
`@property` blocks it returns alongside.

The census is the disposition above, transcribed: 12 repair rows and 30 census rows
with their reasons. Two literals pin it — the family sum against the arm's output,
and an exact row count — because a census that silently grows passes a subset
assertion.

The CANNOT-DECIDE set (AC-4c) is the unresolved-component sink plus single-path
elements carrying state variants. Its anti-tautology case: adding a fixture element
with `aria-current:bg-accent` on an unconditional string must make it grow.

<!-- tasks: depth=2 red-contract -->

## Task 3 — the e2e harness, wired, and the share-link cue it proves
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1143` why=`app/globals.css has no forced-colors block, so under emulateMedia forcedColors active the share-link ring computes box-shadow none with no outline and the AC-1 case this task writes fails until the same task adds the block` ac=AC-1 -->

Creates tests/e2e/forcedColors.spec.ts carrying AC-1, adds `forced-colors` to the
`testMatch` alternation of `mobile-safari` (`playwright.config.ts:83`) and
`desktop-chromium` (`playwright.config.ts:97`), AND adds the unlayered block with
the share-link outline substitution. **All three in this task, because invariant 1
requires the task to reach green before it commits.** An earlier draft split the
suite from the block so the suite could be committed observed-red; plan review R3
finding 1 caught that a task cannot commit red, and the split was the reason the
next three tasks' reds were also wrong.

**The wiring is here** because those `testMatch` values are explicit allowlist
regexes, not globs: an unwired spec lists zero tests and exits 0, so every later
task naming a Playwright command would declare a red against a command that
collects nothing. Verification, in this commit:

```
pnpm exec playwright test --list tests/e2e/forcedColors.spec.ts
```

which must name cases under BOTH project names.

**And the same gap exists one layer up, in CI.** `playwright.config.ts` decides
which PROJECTS can collect a spec; `.github/workflows/app-e2e.yml` decides which
SPECS the job actually runs, and it is an explicit file list, not a glob. A spec
wired into both projects and absent from that list is collected by nothing in CI,
which is the identical silent-coverage failure at a different altitude. Found while
implementing, after the local server timed out twice on a starved box and the
question "then CI is the oracle" turned into "is it running this at all". The spec
is added to that list in the same task.

**Readiness and sampling, stated once and inherited by every later browser task.**
The cues are timer-gated and one remounts, so an assertion sampling at the wrong
moment is flaky in both directions. Every case waits for the element by role or
test id rather than a timeout, uses `expect.poll` against the computed style so one
unlucky frame does not decide, and re-reads the handle after a remount rather than
holding one across it. `fullyParallel: false` (`playwright.config.ts:35`) already
serializes and `baseURL` is pinned to `127.0.0.1` (`playwright.config.ts:92`); this
task starts no server of its own.

## Task 4 — the step-3 cue
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1104` why=`the step-3 warning flash animates background-color only and its reduced-motion fallback is a steady tint, so under forced colors both forms flatten and the AC-2 case this task writes finds no visible cue` ac=AC-2 -->

Spec §5.2. The step-3 warning flash gains the outline substitution, and its
reduced-motion arm gains a steady OUTLINE rather than a steady tint, preserving the
distinction `app/globals.css:1121-1128` draws between a jump target and a one-shot
change signal.

The freshness cue is NOT repaired: spec §5.3 establishes it already survives, and
the repair an earlier draft specified would have suppressed it.

## Task 5 — the compound states, and the off states they need
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`app/globals.css:1157` why=`the share-link reduced-motion arm sets animation none and names no off state, so with forced colors AND reduced motion the base outline Task 3 added forces opaque and the AC-4d case this task writes sees a permanent ring where it requires none` ac=AC-3,AC-4d -->

Both halves of AC-3 (a freshness-capable card shows no outline while its gating
attribute is absent, and a visible one while it is present) and both cues under
AC-4d, asserted separately because they differ in that compound state and the
transition table's first draft got both wrong.

The repair this task makes is naming the share-link off state in the reduced-motion
arm. Task 3 added the base outline; naming its off state is what stops a
reduced-motion user seeing a permanent ring. The two are deliberately in different
tasks so that this one has a real red: after Task 3 the ring is correct in the
ordinary case and wrong in the compound one, which is exactly what AC-4d measures.

## Task 6 — the state-collapse repairs, and AC-4 over every one of them
<!-- task: red=`pnpm exec playwright test tests/e2e/forcedColors.spec.ts` red-state=authored red-target=`components/crew/CrewSubNav.tsx:93` why=`the active and inactive tab paths compute identical border-color under forced colors, so the AC-4 case fails for that row until the block paints the selected state` ac=AC-4,AC-4b -->

The repair set is the disposition's 12 Repair rows.

**AC-4 is data-driven over those rows, and each row carries its own BINDING.** Plan
review R2 finding 7 was that asserting only the spec's five worked examples left the
rest unasserted; plan review R3 finding 3 was that a row holding a site and a token
pair cannot reach a live component, so a data-driven case over those rows could be
satisfied by a generated class-string fixture while the real component went
unasserted. Both are true, and the repair is the same one: the row is the binding.

Every repair row in tests/styles/forcedColorsCensus.ts carries four fields beyond
its site: `route` (the URL the component renders at), `setup` (the seed or fixture
state that puts it on screen), `locator` (a `data-testid` or role query resolving to
the element), and `toggle` (the interaction or seed difference that moves it between
the two colliding states). A row without all four does not compile, so a row cannot
be added without saying how to reach it.

The case then, per row: navigate `route`, apply `setup`, resolve `locator`, read the
computed style under forced colors, apply `toggle`, read again, and require the two
readings to differ in at least one property that survives. Failing to RESOLVE the
locator is a failure, not a skip — that is what stops a fixture standing in for the
component.

**Thirteen of the fourteen already have their locator**, which is the field most
easily faked by a fixture, so the binding work is smaller than it looks. Audited
rather than assumed: `picker-role-chip`; the four
`wizard-step3-card-<dfid>-review-{rail,chip}-item-<id>` ids covering the rail items
and pills and, through them, the two labels; `change-feed-undo`;
`admin-bottom-tab-<item.id>`; `dashboard-bucket-active` and
`dashboard-bucket-archived`; `filter-level-<lvl>`; and `data-section=<id>` on each
tab inside `data-testid="crew-sub-nav"`.

ONE needs a locator added: the DESKTOP nav links at
`components/admin/nav/AdminNav.tsx:236`. Its mobile twin at
`components/admin/nav/AdminNav.tsx:301` already has one. An earlier draft named
`EventFilters` as needing one, and it has carried
`filter-level-<lvl>` at `components/admin/telemetry/EventFilters.tsx:100` all
along; it also named `AdminNav` without saying which of its two nav surfaces. Both
errors came from asserting a fact about live code without grepping it, in the same
commit that claimed every component had been re-read.

Off-states are named by setting the colour to the background system colour, NOT by
`border-style: none`: both paths declare the border and vary only its colour, so
removing the width would reflow (spec §5.7).

## Task 7 — the indeterminate progress shimmer
<!-- task: red=`node scripts/probes/forced-colors-mechanism.mjs` red-state=authored red-target=`app/globals.css:743` why=`AC-5's Gecko half is the only place the missing author repair is observable, and it runs in the probe rather than in Playwright: Firefox is not a Playwright project in this repo, and Blink repaints the bar itself and ignores author pseudo-element styling, so a Chromium case stays green with or without the fix. Deleting the Gecko fill leaves the bar painting its track colour, the probe's AC-5 assertion reports FAIL and sets a non-zero exit` ac=AC-5 -->

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
It is asserted where both engines already run:
`scripts/probes/forced-colors-mechanism.mjs` gains a progress case.

**And that case loads the LIVE COMPILED STYLESHEET and the shipped selectors, not a
copy.** Plan review R3 finding 4: the existing progress prototype hard-codes both
the CSS and the `<progress>` markup, so a typo in the live -moz-progress-bar
selector would coexist with a green case — the probe would be measuring its own
fixture. The mechanism probe already compiles `app/globals.css` for its cascade
arm; the progress case reuses that compiled output and renders a `<progress>`
carrying the shipped `data-testid` values, so the selector under test is the one
that ships. A constructed fixture is excluded as proof of the live tree by this arc's own
probe-domain rule, and that rule applies to the arc's own probes.

**The probe gains an ASSERTION and a non-zero exit, which it does not have today.**
Round 4 finding 4: `scripts/probes/forced-colors-mechanism.mjs` logs observations
and exits 0 whatever it sees, so naming it as AC-5's Firefox owner would leave that
half unguarded — deleting the live -moz-progress-bar fill would keep the Playwright
command green and the probe silent. The progress case requires a fill
distinguishable from the track in BOTH engines and exits non-zero when it is not,
which makes the probe a command this task can be red on. Its plant is the same
fill-only deletion, run per engine.

## Task 8 — the documented limits that need a row
<!-- task: red=`pnpm vitest run tests/styles/_metaForcedColors.test.ts` red-state=authored red-target=`app/globals.css:1224` why=`the case names the DISPOSITION, not a disjunction: the freshness reduced-motion arm must be recorded deliberate-flatten specifically. Task 1 already puts every live A2a hit in the census, so an "either repaired or carries a limit row" assertion would pass whichever way Task 1 called it and could never be observed red — that was the first draft of this line and whole-diff R2 was right to call it. Pinning the disposition fails while the row is anything else` ac=AC-3 -->

Spec §6's transition inventory and §8's limits 7 and 8, as census rows with
reasons. The reduced-motion freshness arm is an A2a hit rather than an A2b one, and
an earlier draft called it A2b; round 4 caught that the stated test could not fail
for the stated reason.

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

Three plan-review rounds found REDs that could not complete, and after R2's
execution-order table R3 found three more. The residue was one rule, not one
ordering: **invariant 1 requires every task to reach GREEN before it commits**, and
an earlier draft split the e2e suite from the block so the suite could be committed
observed-red. That split is what made the next three tasks' reds wrong, because
each was written against a tree state the split created and the merge removes.

So no task commits red, and **no task carries `red-state=live`**. Every marker is
the ordinary invariant-1 shape: the task writes a case that fails against today's
production surface, implements, observes green, commits.

| After | The tree has | So the next task's own new case can fail on |
| --- | --- | --- |
| — | no scanner, no e2e spec, no block, no census | a missing module |
| Task 1 | Arm 2 and its suite, green | a missing module (Arm 1's) |
| Task 2 | both arms, the census, the cannot-decide set, green | no forced-colors block at all |
| Task 3 | the e2e spec WIRED, the block, the share-link cue, green | the step-3 cue, still flattening |
| Task 4 | the step-3 cue repaired, green | the share-link off state, unnamed under reduced motion |
| Task 5 | the compound states correct, green | 12 unrepaired state collapses |
| Task 6 | the 12 repairs and AC-4 over all of them, green | the progress gradient |
| Task 7 | the progress fill, green | no assertion that the block is unlayered |
| Task 11 | AC-8 asserted, green | the missing documented-limit rows |
| Task 8 | the limit rows, green | the unenrolled surface |
| Task 9 | the registry row, green | — |

Task 3 is the hinge and does three things at once for one reason: the wiring must
land with the first Playwright case or that case collects nothing, and the block
must land with it or the task commits red.

`pnpm spec:lint --exec-red` has no `red-state=live` command to run here, which is
stated rather than left to inference: silence from that arm is not a certificate.

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

## Task 11 — AC-8, every rule the pass adds is unlayered
AC-8 had no described assertion for three rounds: the coverage map named Task 4,
which only instructs the implementer to place the block. Plan review R3 finding 5.
Placing it correctly is not verifying it, and the cascade table is the reason this
matters — a layered rule loses silently and renders exactly like a missing one.

The case compiles `app/globals.css` (the `tests/styles/_metaZIndexBands.test.ts:164`
shell-out, which honours the `@source not` exclusions) and parses the result with
postcss, asserting that every rule inside a `forced-colors` at-rule has no `@layer`
ancestor.

**It carries no `red=` for the reason it states.** The block is already unlayered
when this task runs, so the case passes the moment it is authored — a
characterization pin, not a red-then-green cycle. Round 4 named the mismatch
between that admission and a `red-state=authored` marker.

Planted defects, run and recorded in this commit: wrap the block in `@layer base`
and observe RED; unwrap and observe green. Then add a SECOND unlayered
`@media (forced-colors: active)` block elsewhere in the file and observe RED, which
is the condition below.

**And it asserts the SINGLE-block half of the consequence bound.** Round 4 finding
5: checking that forced-colors rules are unlayered says nothing about how many such
blocks exist, so a contributor could add a second one and every assertion stay
green. The case requires exactly one `@media (forced-colors: active)` at-rule in
the compiled output, and that it is the last top-level at-rule in the source.

## Three pins, and why they carry no `red=`

Tasks 12 to 14 are pins over behaviour that is ALREADY correct, so no red exists to
declare. An earlier draft gave them `red=` commands whose `why=` was "the spec file
does not exist", which is a red that goes green when the TEST changes rather than
when an implementation lands.

They sit outside every task region deliberately: a region requires a `red=` on each
task it owns, and inventing one for a pin is the fake red this section removes. The
multi-region design makes headings between regions unchecked, which is this case.
Each is validated by a recorded planted defect instead.

## Task 12 — pin the focus rule, cascade-sensitively

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

## Task 13 — layout neutrality

Spec §5.7's table, verbatim. `getBoundingClientRect()` with forced colors off and
on, agreeing within 0.5px, for every repaired element.

Same shape: the repairs are DESIGNED not to reflow, so this passes when authored.
Planted defect, recorded: change one cue repair from `outline` to a `border` of
the same width, run, observe RED (the box grows by the border width), revert. That
is the exact mistake §5.7 exists to prevent, and it is the one a future author is
most likely to make, because `border` is the more familiar property.

## Task 14 — pin the spec-to-probe correspondence

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

### The rule the disposition applies, stated before the rows

**A surviving carrier must be VISUALLY PERCEIVABLE.** Forced colors is used by
SIGHTED people who need contrast, so an accessibility-tree attribute is not a
carrier for them: `aria-current="page"` on a nav link renders nothing. Both
carrier audits reached this independently and it moved six rows.

The corollary is subtler and moved four more. A carrier that is itself painted in
a forced property does not survive either, however geometric it looks. The review
rail's active indicator is positioned by `transform` and sized by `height`, which
reads like a shape carrier, but it is a `w-1` span whose only paint is `bg-accent`
(`components/admin/review/ShowReviewSurface.tsx:895`). Under forced colors that
background and the rail behind it both force to the same system colour, so the
indicator is invisible and its geometry carries nothing.

So a carrier survives when it is one of: rendered TEXT that differs, a glyph or
mark that differs in SHAPE, a difference in border or outline WIDTH, a padding or
size difference, a font-weight change, an element that is present in one state and
absent in the other. Not colour, not `box-shadow`, not ARIA alone, and not a
coloured shape whose colour is the only thing distinguishing it from its ground.

**Method: read what the component RENDERS.** Plan review R3 found ten
misdispositions in this section, and every one came from diffing class strings
instead. The tell was censusing `ShareHub` for `aria-expanded` plus a visible popup
while repairing `ShowRowActions` for the identical shape.

### Repair — 12 rows

Colour is the sole VISUAL carrier. The three semantic slots (spec §3.3) apply.

| Site | What was checked and found absent |
| --- | --- |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:249` | crew-facing. Both paths render the same `{c.role}`; no glyph, no aria, no size or weight difference |
| `components/crew/CrewSubNav.tsx:114` | crew-facing. `border-b-2` on BOTH paths, so the width is shared and only its colour differs; the icon is the same component either way; `aria-current` toggles nothing rendered |
| `components/admin/review/ShowReviewSurface.tsx:838` | `border` in the shared base, so both are 1px; icon tint is unconditional; label unchanged |
| `components/admin/review/ShowReviewSurface.tsx:1019` | same; the sr-only text and the dot are status-derived, not active-derived |
| `components/admin/review/ShowReviewSurface.tsx:805` | active fills at rest and inactive only on hover, so there IS an at-rest difference and it is a background; the rail indicator does not rescue it (see the rule above) |
| `components/admin/review/ShowReviewSurface.tsx:926` | same; `railCount` and the dot are data-derived |
| `components/admin/UndoChangeButton.tsx:51` | `border` on both branches, so no width change; children are keyed on `pending`, not on `quiet`; the file's comment at `components/admin/UndoChangeButton.tsx:46` claims differentiation is by weight, and the classes do not bear that out |
| `components/admin/nav/AdminNav.tsx:236` | `aria-current` only; icon and label render unchanged in both states |
| `components/admin/nav/AdminNav.tsx:301` | `aria-current` only; the attention badge is keyed on `showBadge`, not on `active` |
| `components/admin/telemetry/EventFilters.tsx:97` | `aria-pressed` only; the visible text is the level either way |
| `components/admin/DashboardBucketSegmentedControl.tsx:56` | `aria-current` only, and `shadow-tile` is dropped so it cannot carry it either. The component documents `aria-current` AS its selection mechanism (`components/admin/DashboardBucketSegmentedControl.tsx:11`), which is correct for a screen reader and insufficient for this user |
| `components/admin/DashboardBucketSegmentedControl.tsx:76` | same; the `({archivedCount})` count is data-derived, and the disabled branch is a different element type, neither of which carries SELECTION |

Two are crew-facing and neither was found by reading class strings.

### Census — a rendered carrier that survives (11 rows)

| Site | The carrier |
| --- | --- |
| `app/me/meShowSections.tsx:219` | the same value picks the tone AND renders the words: `relativeDayChip` returns "Today", "Tomorrow", "In N days" (`lib/time/relative.ts:31`) and `chipToneClass` derives the tone from that string |
| `app/me/meShowSections.tsx:278` | same |
| `components/crew/primitives/RunOfShowList.tsx:93` | the ancestor gains `border-l border-border pl-2` on a synthetic entry (`components/crew/primitives/RunOfShowList.tsx:78`): a border WIDTH and an indent, both of which survive |
| `components/admin/OnboardingWizard.tsx:260` | done swaps the number for a `<Check>` glyph (`components/admin/OnboardingWizard.tsx:251`) and active adds `font-semibold` plus visibility below `sm` (`components/admin/OnboardingWizard.tsx:277`). See the limit below |
| `components/admin/ShowRowActions.tsx:647` | `aria-expanded` AND an open menu that is rendered |
| `components/admin/wizard/CrewRowActions.tsx:270` | same |
| `components/admin/showpage/PublishedReviewModal.tsx:1133` | the states differ by filled, triangular and hollow MARKS (`components/admin/review/attentionMark.ts:76`), which is shape |
| `components/admin/wizard/Step3ReviewModal.tsx:590` | same |
| `components/admin/UseRawControl.tsx:360` | the checked row renders "In use" or "Selected" plus a dot (`components/admin/UseRawControl.tsx:368`) |
| `components/admin/UseRawControl.tsx:372` | same |
| `components/admin/RescanSheetButton.tsx:209` | not two states at all: the two paths are one button on two surrounding plates (`components/admin/RescanSheetButton.tsx:222`) |

**Limit inside the wizard row.** `OnboardingWizard.tsx:260` carries ACTIVE and DONE
non-chromatically, and that is the question the indicator exists to answer. VISITED
against UNREACHED differs only in text tone, so those two flatten together. Not
repaired: both are non-current steps, the distinction is affordance rather than
position, and tabbability still separates them. Recorded here rather than left
unstated, because a reader checking this row against the source would find it.

### Census — switch tracks, ruled exemption (5 rows)

`bg-accent`/`bg-surface-sunken` with `border-accent-edge`/`border-border-strong`,
whose contrast treatment is already ruled (`DESIGN.md` §1.2a,
`tests/styles/controlOutlineResidue.ts:873`). Re-deciding a ratified visual
treatment is not this pass's to make.

| Site |
| --- |
| `components/admin/PublishedToggle.tsx:517` |
| `components/admin/settings/AutoPublishToggle.tsx:123` |
| `components/admin/settings/NotifyToggle.tsx:131` |
| `components/admin/settings/DeveloperToggleButton.tsx:93` |
| `components/admin/telemetry/AutoRefreshControl.tsx:105` |

FIVE, where the spec's §8 limit 5 says three. The census is the authority and the
spec cites the command rather than a count.

### Census — a child whose tone moves with a carrier that survives (7 rows)

Whole-diff R2's second finding: the two rail LABELS were listed as repairs while
their sibling icons, inside the same repaired rail item, were listed here. Nothing
distinguished them, and the shipped census had already classified all four the same
way. The plan is what was stale. The family is named for a child rather than an icon
because it now holds both.

| Site | The carrier |
| --- | --- |
| `components/admin/review/ShowReviewSurface.tsx:819` | an icon inside a rail item this pass repairs, so it inherits a repaired state |
| `components/admin/review/ShowReviewSurface.tsx:939` | same, in the second rail item |
| `components/admin/review/ShowReviewSurface.tsx:823` | a label inside the rail item at `components/admin/review/ShowReviewSurface.tsx:805`, whose `aria-current` the selected-state fill repairs |
| `components/admin/review/ShowReviewSurface.tsx:945` | same, inside the rail item at `components/admin/review/ShowReviewSurface.tsx:926` |
| `components/admin/showpage/PublishedReviewModal.tsx:1376` | a chevron that also ROTATES |
| `components/admin/wizard/Step3ReviewModal.tsx:729` | same |
| `components/crew/CrewSubNav.tsx:125` | sits inside the tab button this pass repairs |

### Census — state carried by ARIA and a rendered element (2 rows)

| Site | The carrier |
| --- | --- |
| `components/admin/UseRawControl.tsx:334` | `role="radio"` with `aria-checked`, AND a rendered dot |
| `components/admin/showpage/ShareHub.tsx:828` | `aria-expanded`, AND when true a popup is on screen |

ARIA alone would not qualify under the rule above; the rendered element is what does.

### Census — focus-ring offset colour only (1 row)

| Site | Why |
| --- | --- |
| `components/admin/PerShowActionableWarnings.tsx:458` | the pair differs only in `focus-visible:ring-offset-*`; the ring is not this repo's focus indicator (spec §2.2) and an offset colour is invisible under forced colors either way |

### Census — emphasis opacity variants of one token (2 rows)

| Site | Why |
| --- | --- |
| `components/admin/showpage/PublishedReviewModal.tsx:1327` | `text-warning-text/80` against a sibling tone; both force to `CanvasText` |
| `components/admin/wizard/Step3ReviewModal.tsx:662` | same |

The distinction is emphasis, which spec §8 limit 2 flattens deliberately.

### Census — elevation only (1 row)

| Site | Why |
| --- | --- |
| `components/shared/AccentButton.tsx:139` | sixteen paths colliding on `shadow-tile` alone, a raised variant against a flat one; spec §8 limit 3 |

### Census — not a collapse (1 row)

| Site | Why |
| --- | --- |
| `components/admin/NeedsAttentionSummaryCard.tsx:36` | its pair prints `(identical)`: two render paths resolving to the same class string, so nothing differs |

Kept as a named artifact rather than filtered, since a filter would also hide a
real duplicate.

### The sum

12 repair + 11 + 5 + 7 + 2 + 1 + 2 + 1 + 1 = 42. Task 2's suite asserts that sum
against the arm's own output, so a new site cannot land in no family.

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
- The registry-array diff for Task 9.
- The four string-presence mutants for every text-pin assertion (Task 10's DESIGN.md pin).


## Task 15 — the invariant-8 UI quality gate

**This plan omitted the gate for three review rounds and that was a hard error.**
Plan review R3 finding 6. The arc changes `app/globals.css` and `DESIGN.md`, and
AGENTS.md invariant 8 makes both UI surfaces, so the dual gate is non-negotiable
and runs BEFORE the whole-diff cross-model review rather than after it.

In one commit:

1. Run the dual gate from AGENTS.md invariant 8 over the whole UI diff, with the
   canonical v3 setup gates: the skill's context load (PRODUCT.md + DESIGN.md),
   then the register reference read. The UI diff is `app/globals.css`, `DESIGN.md`,
   and every component this pass repairs.
2. Fix every P0 and P1, or defer one with a `DEFERRED.md` entry naming why. No
   third option.
3. Write the §12 closeout section with both halves' results and their dispositions,
   and the `impeccable-gate:` marker line.

**Why the marker is written HERE and not at plan time.** The marker grammar admits
exactly two forms: a RAN form carrying real results, and `N/A — no UI surface`
(`tests/docs/_invariant8Closeout.ts:44-48`). There is no pending form. A plan
committed before the gate runs therefore cannot carry an honest marker, and the
guard treats any unit naming both gate halves as one that MUST carry a valid marker
(`tests/docs/_invariant8Closeout.ts:109-118`). So the two land together, in this
task's commit, which is the only point at which both are true. Writing a marker
earlier would mean writing a result that had not happened.

Pre-code mechanical checklist, run BEFORE the UI tasks rather than discovered by
the gate afterwards: no em dashes in user-visible copy, 44px tap targets, canonical
type and token classes, apostrophe literals. This pass adds no user-visible copy,
so the live items are the token classes the repairs use.

## 12. Closeout

impeccable-gate: critique=RAN audit=RAN p0=1 p1=2 dispositions=recorded

Run 2026-09-01 against the whole UI diff: `app/globals.css`, `DESIGN.md`,
`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`,
`components/admin/UndoChangeButton.tsx`,
`components/admin/telemetry/AutoRefreshControl.tsx`. Canonical v3 setup gates: the
skill's context load (PRODUCT.md + DESIGN.md), then the register reference read
(the skill's product register: app UI, design SERVES the product).

### critique — Assessment A and B as isolated sub-agents, NOT degraded

`detect.mjs --json app/show components/admin/UndoChangeButton.tsx` returned `[]`,
exit 0: zero deterministic findings. Everything below is design review and
measurement. (A first assessment pair died to a five-hour machine sleep; both
transcripts were scraped before re-dispatch and held nothing recoverable.)

| # | Finding | Sev | Disposition |
|---|---|---|---|
| 1 | `[data-lead]` collided with a shipped hook. `components/crew/primitives/PersonRow.tsx:156` has emitted `data-lead="true"` on every department-lead row all along, so an unscoped rule painted a crew surface this pass never examined — on a row whose state is already carried by a rendered "Lead" chip and which by rule 3 needs no repair. | **P0** | FIXED. Both new hooks namespaced `data-fc-*`; the block records why the prefix is load-bearing. |
| 2 | The selected rule was unscoped, reaching 18 emission sites in 13 files where the pass audited eight: a bare `<li aria-current="page">` breadcrumb, a `<div>` jump-highlight, a `<span>` picker marker, and a 44px tap box wrapping a 34×20 switch. | **P1** | FIXED. The selector requires an interactive element, excluding the first three by construction; `AutoRefreshControl` takes the new `[data-fc-skip]`, because its state is already a ruled deliberate flatten and the stylesheet should defer to the census rather than contradict it. |
| 3 | Selected (`-2px`) and freshly-changed (`+2px`) differed only in the sign of an offset; an element that was both drew two concentric rings 4px apart. | **P1** | FIXED with #4. Selection is a fill, the transient cue is the only ring, so the states differ in kind. |
| 4 | `outline-offset: -2px` was cramped against a flattened border, and DESIGN.md §17.3 promised a `Highlight` + `HighlightText` pair that no rule delivered. | **P2** | FIXED. Selection is `background-color: Highlight; color: HighlightText`. Measurement supports it: the engines' emulated palettes are near-inverses (Highlight vs Canvas 19.04:1 Chromium, 2.94:1 Firefox), so a ring's contrast is theme-dependent where the pair is not. |
| 5 | §17.4 names the review rail's indicator as broken and stops without stating its repair. | **P2** | ACCEPTED. The section explains why a geometric-looking carrier is not one; the repair is §17.3's fill. Naming a per-site repair inside a rule's rationale is the sample-of-one shape this pass avoids. |
| 6 | `data-lead=""` vs `data-lead="true"` disagreed on value shape. | **P3** | MOOT after the rename; the `data-fc-*` attributes are empty-valued, matching `data-share-link-flash`. |

**Refuted, recorded so a later round does not re-derive it.** Assessment B flagged four
`ShowReviewSurface` sites and `components/admin/review/AttentionBanner.tsx:259` as deep-link
jump targets given a persistent ring. Half right: the four `ShowReviewSurface` sites
carry `aria-current` on the SAME button that opens at
`components/admin/review/ShowReviewSurface.tsx:805` and its three siblings,
with `isActive` and an `onClick` — selection within a set, correctly in scope.
`AttentionBanner.tsx:259` is genuinely transient and is a `<div>`, which the
interactive scoping already excludes.

### audit — five dimensions

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Focus on a SELECTED control computed the same colour as its fill in Chromium (both `rgba(5, 0, 73, 0.8)`), separated only by the 2px offset. Discernible, since the ring's outer edge meets Canvas at 19:1, but it read as one thick shape with a hairline gap. FIXED with a `HighlightText` ring at `-4px`, which is the palette answering its own question. Firefox did not collide, so no single-engine check would have found it. |
| 2 | Performance | 4 | The block declares no layout property, no filter, no transform, and adds no animation; the two cues it repairs set `animation: none`. |
| 3 | Theming | 4 | Zero hex literals. Every value is a system keyword (`Highlight`, `HighlightText`, `Canvas`, `ButtonFace`), which is the only correct vocabulary in this mode. |
| 4 | Responsive | 4 | No sizing, no breakpoint, no tap-target declaration. The only nested media query is the reduced-motion arm, which is a state and not a viewport. |
| 5 | Anti-patterns | 4 | Clean against every shared absolute ban: no side-stripe border, no gradient text, no glassmorphism, no bounce easing, no `!important`. No em dash in added user-visible copy. |
| **Total** | | **19/20** | Excellent (minor polish). |

Pre-code mechanical checklist: no em dashes in user-visible copy (0 in the added
`.tsx` lines), no tap-target change, canonical token classes only, no new
apostrophe literals.

### What neither half caught, and CI must

The local Playwright `webServer` timed out at 300s twice on this box, so AC-4 has
not been observed green since the fill replaced the ring. That is the gate
amendment's case exactly: CI is the oracle. `tests/e2e/forcedColors.spec.ts` was
wired into both browser projects and into NO CI job — `.github/workflows/app-e2e.yml`
runs an explicit spec list, the same silent-coverage failure one altitude up — and
is in that list now.
