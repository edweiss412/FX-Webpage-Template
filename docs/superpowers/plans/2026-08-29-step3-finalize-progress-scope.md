# Step-3 finalize progress scope — implementation plan

**Goal:** the batch phase of Step-3 finalize stops claiming it is publishing, and the one claim it keeps (the show's name) is true, in every layer that carries the claim: the visible header, the running button label, the screen-reader live message, the per-row subline, and the four accessible names.

**Architecture:** one branch `fix/step3-publish-progress-scope` off `origin/main`, TDD per task, cross-model diff review, CI-green, READY to bl-orch (this arc does not merge). UI surface under `components/**`, so the invariant-8 gate runs at close-out; the marker line is written by that commit and not before, because a marker naming both halves before the gate runs is malformed and reds `tests/docs/_metaInvariant8Closeout.test.ts`.

**Unit shape:** FLAT plan file (4 tasks; a directory unit with a separate HANDOFF/closeout is not proportionate here). Precedent: `docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md`, which carries its own `impeccable-gate:` marker in-file and whose close-out task greps its own path.

**Date:** 2026-08-29 · **Spec:** `docs/superpowers/specs/2026-08-29-step3-finalize-progress-scope.md` (narrowed 2026-08-29 by owner ruling; §2.1 carries the reversal)

## Ruling carried into this plan (bl-orch, 2026-08-29)

Spec review is CLOSED at 4 rounds (3-2-1-1, decaying; R4 repaired at cause in `d19e235b8`). No spec R5.

- **Condition:** Task 3b carries an explicit red-then-green for the rename-during-inline-rescan case, with the RED **observed** against the pre-repair binding, and the failure `display_name` path covered by that case or its own.
- **Fence:** a spec-shaped defect surfacing at plan stage is repaired IN-ARC and named in the plan review brief. It never reopens a spec round.
- Plan review has its own fresh 4-round budget.

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 2 (no lock change), 5 (no new codes), 6 (conventional commits), 8 (UI gate at close-out), 10 (audit sink not on the diff), 11 (worktree-only), 12 (no ledger row owed, bl-orch ruling 2026-08-29).
- No em dash in any new user-visible string. Apostrophes as `&rsquo;`.
- No wire change. `lib/onboarding/finalizeProgress.ts` is not touched, and neither is the route's emit. If a task finds itself editing either, the plan is being exceeded — stop.
- All tests DB-free. The DB slot is needed only for the final full suite, as a named grant from bl-orch.

## Pre-draft verification pass (run 2026-08-29 in this worktree)

- Copy sites: header `components/admin/FinalizeButton.tsx:974` + `components/admin/wizard/Step3ReviewWithFinalize.tsx:257`; subline `FinalizeButton.tsx:1002` + `Step3ReviewWithFinalize.tsx:274`; `liveMessage` `FinalizeButton.tsx:485`; `runningLabel` `FinalizeButton.tsx:493`.
- Accessible names: `components/admin/FinalizeButton.tsx:967` (group) and `components/admin/FinalizeButton.tsx:983` (bar); `components/admin/wizard/Step3ReviewWithFinalize.tsx:249` (group) and `components/admin/wizard/Step3ReviewWithFinalize.tsx:270` (bar). Both groups wrap `state.phase === "batch" ? … : …` (`FinalizeButton.tsx:962-972`, `Step3ReviewWithFinalize.tsx:245-254`), so their label must suit BOTH phases.
- Class-sweep for the publish verb in accessible names returns exactly those four; the other hits are modal Close/dismiss labels, the confirm dialog `aria-labelledby`, the announcer `sr-only`, and two name tooltips.
- The rename target: `const approvedRows = await selectFinishableCleanRows(...)` (`app/api/admin/onboarding/finalize/route.ts:1593`), read at `app/api/admin/onboarding/finalize/route.ts:1597`, `app/api/admin/onboarding/finalize/route.ts:1611`, `app/api/admin/onboarding/finalize/route.ts:1628`, `app/api/admin/onboarding/finalize/route.ts:1646`, `app/api/admin/onboarding/finalize/route.ts:1712`. Five readers, one declaration.
- `controllableNdjson()` is MODULE-LOCAL to the FinalizeButton suite (`tests/components/admin/FinalizeButton.test.tsx:961`), not exported. The Step3 suite holds its running state with a never-resolving fetch (`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:231`) and so receives NO row events — its subline never renders today. T2 extracts the helper to a shared module and imports it in both suites. The panel subline carries `data-testid="wizard-finalize-current"` (`FinalizeButton.tsx:998`); the compact subline has no testid (`Step3ReviewWithFinalize.tsx:273`) and gains one in T2 so the assertion can be scoped.
- House assertion style: derive expected values from the fixture with a comment saying so (`FinalizeButton.test.tsx:1021-1022`).

<!-- tasks: depth=2 -->

## Task 1 — FinalizeButton: every layer of the batch-phase claim
<!-- task: red=`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx` ac=AC-1,AC-2,AC-3,AC-4 -->
RED, four assertions that each fail against current code:
  - batch header reads `Setting up your shows…`
  - the running button label reads `Setting up…`
  - the subline reads `Processed: <name>` (past tense and outcome-neutral: spec §2.2)
  - the SET of `[aria-label]` values within the batch phase equals `{"Setup progress"}`
The aria assertion is a SET comparison, not four string checks: that is what makes it catch a fifth
instance someone adds later, which four spot checks would not.
Plus a scoped absence assertion: neither `Publishing your shows` nor `Publishing: ` appears anywhere
in the batch-phase subtree. Scope it to the batch subtree, not the document — the CAS branch and the
idle button legitimately contain other copy, and a document-wide grep would either pass vacuously or
fail on unrelated text.
PRESERVATION in the same task: the CAS header still reads `Finishing setup…`. Declared as
preservation, not claimed as failing-first.
GREEN: `components/admin/FinalizeButton.tsx:485` liveMessage, `components/admin/FinalizeButton.tsx:493` runningLabel, `components/admin/FinalizeButton.tsx:967` and `components/admin/FinalizeButton.tsx:983` aria-labels,
`components/admin/FinalizeButton.tsx:974` header, `components/admin/FinalizeButton.tsx:1002` subline.
COMMIT: `fix(admin): batch progress reports setup, not publishing`

## Task 2 — Step3ReviewWithFinalize: the same claim on the second surface
<!-- task: red=`pnpm vitest run tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` ac=AC-1,AC-2,AC-4 -->
RED: the same assertions against the compact tracking. NOT a duplicate of T1 — these are two
components that independently render the same sentence, which is exactly how one surface gets fixed
and the other silently keeps the old copy. That is the regression this task exists to catch.
FIRST, before any assertion: extract `controllableNdjson()` from `tests/components/admin/FinalizeButton.test.tsx:961`
into a shared test module and import it in BOTH suites. Without it the Step3 suite cannot produce a
row event, `state.lastName` stays null, and a subline assertion would pass vacuously against an
element that never renders. Assert `lastName` is actually populated before asserting its text.
GREEN: `components/admin/wizard/Step3ReviewWithFinalize.tsx:257` header, `components/admin/wizard/Step3ReviewWithFinalize.tsx:274` subline, `components/admin/wizard/Step3ReviewWithFinalize.tsx:249` and `components/admin/wizard/Step3ReviewWithFinalize.tsx:270` aria-labels, and a
`data-testid` on the subline at `components/admin/wizard/Step3ReviewWithFinalize.tsx:273` so the assertion can be scoped to it.
COMMIT: `fix(admin): compact tracking reports setup, not publishing`

## Task 3 — the misnomer that started this
<!-- task: red=`pnpm vitest run tests/onboarding/finalizeStream.test.ts` ac=AC-5 -->
This is a behavior-neutral rename, so its RED is the EXISTING suite passing unmodified before and
after. State that honestly rather than inventing a failing test: a rename with no observable
behavior has no honest red, and manufacturing one would be the tautology the spec's own history
warns about.
GREEN: `approvedRows` -> `finishableRows` at `app/api/admin/onboarding/finalize/route.ts:1593` and
its five readers. Verify by `rg -n 'approvedRows' app/` returning nothing, and by the untouched
stream suite passing.
COMMIT: `refactor(onboarding): name the finishable row set for what the query selects`

## Task 3b — the displayed name must come from the parse that was applied
<!-- task: red=`pnpm vitest run tests/onboarding/finalizeStream.test.ts` ac=AC-5b -->
Spec §3.1b. `onRow` reads `parsedShowTitle(row.parse_result)` from the OUTER select-time row
(`app/api/admin/onboarding/finalize/route.ts:1713`), but the inline-rescan auto-heal rebinds only
`staged_id`, `staged_modified_time` and `triggered_review_items` and does not even select
`parse_result` (`app/api/admin/onboarding/finalize/route.ts:1039-1048`). A title-only rename stays clean (`lib/onboarding/rescanDecision.ts:35`
weighs crew invariants and data-gap regressions, not the title), so the sheet is set up as its NEW
title while the stream reports the OLD one, uncorrected.

RED, and bl-orch's ruling makes the OBSERVATION mandatory, not the intent: the failing run is
executed and recorded BEFORE the fix, against the pre-repair binding. A test merely believed to fail
does not discharge this. Record the observed failure (the assertion, expected vs received) in the
task's commit message, because "I wrote a test that would have failed" is the exact claim this
condition exists to stop being taken on trust.

Two cases, both required (bl-orch: "the failure display_name path covered by the same case or its
own"):
  (a) the `row` STREAM EVENT carries the new title after a title-only inline re-scan;
  (b) the terminal `per_row` `display_name` for a FAILED row after the same re-scan
      (`app/api/admin/onboarding/finalize/route.ts:1704`) carries the new title too.
Case (b) needs a row that re-parses cleanly and THEN fails, so its failure entry is built after the
refreshed parse exists. If the fake cannot express that ordering, say so in the plan brief and cover
(b) by asserting the shared source directly, rather than quietly shipping one case as two.

A stream test where the fake's inline re-scan returns a parse whose TITLE DIFFERS from the
select-time one, asserting the emitted `name` is the new title.
  ANTI-TAUTOLOGY, and this is the whole difficulty of the task: a fixture whose title is stable
  across the re-parse cannot tell the stale source from the fresh one, and every existing fixture is
  stable — which is exactly why the current suite passes. Derive both titles from the fixture and
  assert they DIFFER before asserting which one was emitted, so the test cannot silently degrade
  into comparing a value to itself.
  Check first whether `FakeFinalizeDb` can express a re-parse that changes the title; if the
  auto-heal path is not reachable in the fake, that reachability work is part of this task and must
  be done before the assertion, not around it.
GREEN: widen the `app/api/admin/onboarding/finalize/route.ts:1040` query to include `parse_result`, rebind it onto the local row with
`asParseResult` (a legacy double-encoded row returns a JSON string scalar and `parsedShowTitle` must
not receive one). This also repairs the failure `display_name` at `app/api/admin/onboarding/finalize/route.ts:1704`, which reads the same
stale source.
SCOPE NOTE for the commit message: this arc's premise was "no route change beyond a rename", and
this is a route change. It is here because §3.2 keeps the NAME claim, and keeping a claim means
owning its truth conditions. Say that in the commit rather than leaving a reviewer to wonder.
COMMIT: `fix(onboarding): report the applied parse title in finalize progress`

## Task 4 — close-out
<!-- task: red=`grep -qE "^impeccable-gate: critique=RAN" docs/superpowers/plans/2026-08-29-step3-finalize-progress-scope.md` ac=AC-6 -->
The close-out RED greps for its own marker, so the task cannot be marked done before the gate ran
(pattern from `docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md:67`).
Full suite under `pnpm heavy` (DB slot as a named grant from bl-orch), typecheck, eslint,
format:check. Invariant-8 gate on the diff, findings dispositioned. Marker grammar, live example at
`docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md:94`:
`impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`
Then whole-diff Codex review to APPROVE, push, PR, 13 required contexts green, READY to bl-orch.
This arc does not merge.
COMMIT: `docs(plan): close out step3 finalize progress scope`

<!-- tasks: end -->

## Acceptance criteria
- AC-1 the batch header reads `Setting up your shows…` on both surfaces
- AC-2 the batch subline reads `Processed: <name>` on both surfaces
- AC-3 the running button label reads `Setting up…`
- AC-4 every accessible name in the batch phase reads `Setup progress`, on both surfaces
- AC-5 no source file under `app/` refers to `approvedRows`, and the stream suite passes unmodified
- AC-5b the emitted `name` is the title of the parse that was applied, including after an inline re-scan that changed only the title
- AC-6 full suite, typecheck, lint, format green; invariant-8 gate run and dispositioned

## What this plan deliberately does NOT do
Per spec §2.1 (owner ruling 2026-08-29, fenced both directions): no per-row publish claim, no wire
field, no manifest read, no change to the route's emit, and no Playwright task. The geometry test in
an earlier draft existed to protect a trailing destiny label from truncation; with no such label
there is nothing to protect, and the one-line guarantee is an unchanged `truncate` this diff never
touches.

## Implementation trap for the aria SET assertion (T1/T2)

The labelled GROUP is itself one of the four instances (`FinalizeButton.tsx:967` on the element that
carries `data-testid="wizard-finalize-progress"`; `Step3ReviewWithFinalize.tsx:249` on
`wizard-step3-tracking`). `element.querySelectorAll("[aria-label]")` searches DESCENDANTS ONLY, so
the obvious spelling silently drops the group's own label and asserts over 1 of the 2 instances per
surface — passing while half the class is unfixed.

Write it as: take the group element, then collect `[el, ...el.querySelectorAll("[aria-label]")]`,
filter to those carrying the attribute, and compare the resulting SET to `{"Setup progress"}`.
Assert the collected count is >= 2 before comparing, so a selector that matches nothing cannot pass
the set comparison vacuously (an empty set equals an empty set).

Scoping note: both groups wrap `state.phase === "batch" ? … : …`, so when the test has driven the
component into the batch phase, the group subtree IS the batch subtree. No extra wrapper element is
needed for the absence assertions either.

## `Publishing…` is a SHARED string — do not over-reach (verified 2026-08-29)

`Publishing…` appears in tests across the repo, and MOST of it belongs to an unrelated feature: the
ShowsTable / PublishedToggle chip for a finalize-owned show (`tests/components/admin/PublishedToggle.test.tsx:239`, `tests/components/admin/per-show-lifecycle.test.tsx:203`,
`tests/components/admin/Dashboard-archived.test.tsx`, `tests/components/admin/showpage/shareHub.test.tsx:679`,
`tests/components/admin/rowActions/showRowActions.shell.test.tsx:142`,
`tests/admin/fetchDashboardData-archived.test.ts:309`). That chip means a
show is mid-publish, which is TRUE where it is used. NONE of it is this diff's surface and none of it
changes. `tests/components/atoms/AccentButton.test.tsx:172` is also not ours: it passes the string as its own fixture
for a generic atom.

Ours is exactly one pre-existing assertion:
`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:252` asserts
`b.textContent).toMatch(/Publishing/i)` on the running button label. It WILL fail when
`runningLabel` becomes `Setting up…`, so AC-3 already has a failing-first test in the tree; Task 2
retargets it to `/Setting up/i`.

That edit is NOT gate-editing. The assertion's subject legitimately changed and its STRENGTH is
preserved: it still pins that the button steps into a disabled, aria-busy intermediary carrying a
specific label, and it still fails if the label goes missing or reverts. Say so in the commit
message, because "the implementer changed a test that was failing" is exactly the shape a reviewer
should challenge, and the answer needs to be on the record rather than reconstructed.

Consequence for the absence assertions: they MUST be scoped to the batch subtree. A repo-wide or
document-wide "Publishing… appears nowhere" assertion would collide with a correct, unrelated
feature.

## Harness extraction is cheap — verified 2026-08-29 (read-only)

`controllableNdjson()` (`tests/components/admin/FinalizeButton.test.tsx:961-985`) is fully
self-contained: it closes over NOTHING from the suite (no `fetchMock`, no `WIZARD_SESSION_ID`, no
module state). It builds its own `ReadableStream` and returns `{response, push, close, error}`. The
extraction is a straight cut-and-import, not a refactor.

Do NOT also extract `allBatchesDone()` (`tests/components/admin/FinalizeButton.test.tsx:987-993`) — that one DOES close over `WIZARD_SESSION_ID`.
T2 does not need it; the Step3 suite can build its own terminal body.

Destination, following the repo's own precedent: this task CREATES a new module under
`tests/components/admin/`, named finalizeStreamHarness with a leading underscore and no
`.test.` segment. (Spelled out rather than written as a path, because it does not exist yet and
`spec:lint` reads any path-shaped token as a citation to a tracked file.)
The underscore-prefixed, non-`.test.` colocated module is exactly the shape of
`tests/onboarding/_finalizeFake.ts`, the shared fake for the finalize route suites, so vitest will
not collect it as a test file. (`tests/_shared/` is the other convention, for helpers used across
unrelated areas; this one is used by two sibling suites in the same directory.)
