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

## Meta-test inventory (mandatory declaration)

**This plan CREATES TWO structural guards and extends none.** Plan R2 finding 3 was right and the
R1 version of this section was false: it declared "creates none" while Tasks 3 and 3c each create one.
That contradiction is exactly the "the repair's own tidy-up is a defect site" case
(`docs/agents/writing-plans.md:23`), and it is recorded rather than quietly fixed.

| Guard | Created by | What it pins |
| --- | --- | --- |
| the `approvedRows` misnomer guard, under `tests/onboarding/` | Task 3 | no file under `app/` binds the identifier `approvedRows` |
| the progress-transition audit, under `tests/components/admin/` | Task 3c | every conditional render in both progress subtrees is instant |

**Mutation-family closure (mandatory for guard work, `docs/agents/writing-plans.md:34`).** Each guard
enumerates its operator families up front; that enumeration IS the closure set review converges
against, and a reviewer-proposed new family is admissible only with a live escaping mutant.

Misnomer guard, three families: (i) IDENTIFIER REINTRODUCTION — plant `const approvedRows = …` in the
finalize route, expect fail; (ii) EVASION BY LONGER NAME — plant `approvedRowsCount`, expect PASS
(the guard is word-matched by design and this mutant documents that boundary, not a gap); (iii) SCOPE
ESCAPE — plant the identifier in a DIFFERENT file under `app/`, expect fail, which is what makes the
widened scan of finding 5 load-bearing rather than cosmetic.

Transition guard, SIX families. Three came from R2; two more from R3 finding 2; the sixth from R4
finding 1. Each round showed the prior closure incomplete against a mechanism this repository
actually uses, which is why the sixth is a DERIVED cover rather than another enumerated pattern:

(i) ANIMATION PRIMITIVE — plant an `AnimatePresence` wrapper in each progress subtree, expect fail.
(ii) CSS TRANSITION CLASS — plant a `transition-*`/`animate-*` class on a node INSIDE a progress
subtree, expect fail. A framer-marker-only oracle is blind to it.
(iii) NESTED DUPLICATE — plant a second conditional mount one level deeper so two nodes coexist below
the outer mount, expect fail. An outer-child-count check cannot see it.
(iv) STANDALONE `motion.*` — replace an existing element with `motion.div`/`motion.span` carrying
`animate` props, expect fail. This adds NO `AnimatePresence`, NO transition class and NO duplicate
node, so families (i) through (iii) all miss it. Not hypothetical: the repository uses standalone
`motion.*` at `components/diagrams/GalleryLightbox.tsx:622`.
(v) INLINE STYLE ANIMATION — set `style.transition` or `style.animation` on a node in a progress
subtree, expect fail. It changes no class and no node count, so again (i) through (iii) miss it. Also
repo-native: `components/admin/review/ReviewModalShell.tsx:315` manipulates `panel.style.transition`
directly.

(vi) STYLESHEET-DRIVEN ANIMATION — plant a class or data-attribute on a progress node that
`app/globals.css` animates, expect fail. Plan R4 finding 1: `route-enter` (`app/globals.css:660-672`)
animates via `@keyframes` and its NAME matches neither `transition-*` nor `animate-*`, so a
pattern-over-class-names oracle is blind to it. Live siblings in the same class: `.bootstrap-dot`,
`.telemetry-ping`, and attribute-driven selectors such as `[data-rescan-overlay-result]`
(`app/globals.css:1043-1044`, used at `components/admin/RescanSheetButton.tsx:244`).

**Because of (vi) the oracle is a DERIVED COVER, not a list of class-name patterns.** Enumerating
known animating class names re-opens the moment anyone adds one to `app/globals.css` — the exact
shape the class-sweep rule warns against. Instead the guard PARSES `app/globals.css`, extracts every
selector carrying an `animation:` or `transition:` declaration, and asserts no node in a progress
subtree matches any of them. New CSS is then covered by construction rather than by someone
remembering to extend a list, and family (vi) is what proves the derivation discriminates.

So the oracle inspects FOUR things: the rendered subtree's class names, its inline `style` for
`transition`/`animation`, the component source for `motion.` usage in the progress render paths, and
every animating selector derived from `app/globals.css`. A guard checking only the first stays green
while either subtree animates, which is precisely the AC-5c claim it exists to defend.

No OTHER registry applies, and each candidate in `docs/agents/writing-plans.md:21` is declined for a
stated reason: no Supabase call site is added (invariant 9), no advisory lock is acquired or moved
(invariant 2), no `admin_alerts` row is written, no sentinel-in-optional-text is introduced, and no
email normalization is touched.

**Collection and CI wiring, recorded so nobody adds config that is already implicit:** both new files
carry the dot-test extension and so are collected by `BASE_INCLUDE` (`vitest.projects.ts:34`) with no
change; `tests/components/**` is in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:105`) so the transition
guard runs in the parallel project; the unit-suite workflow is unfiltered, so neither needs a
`testMatch` or workflow edit.

Two EXISTING structural guards must keep passing and are named so a regression is attributed rather
than discovered: `tests/docs/_metaInvariant8Closeout.test.ts` (this plan is a UI unit) and
`tests/docs/_metaReviewRoundEconomy.test.ts` (this arc has a filed round-economy record).

## Four-mutant validation for every string-presence assertion (mandatory, `docs/agents/writing-plans.md:16`)

The rule applies to any test asserting "this string appears in this output". Plan R2 finding 4 was
right that the R1 version of this section was not executable: it declared one blanket set of
discriminating parameters that do not exist for three of the tasks. The requirement is therefore
scoped per task, and the tasks it does NOT apply to say so with a reason.

(a) value EMPTIED, (b) expected content plus an APPENDED SUFFIX, (c) content present but NOT LIVE
(commented out, escaped, in an attribute, or behind a false condition), (d) each DISCRIMINATING
PARAMETER varied in turn. Every result is recorded in that task's commit message.

| Task | Applies | Discriminating parameter for (d) |
| --- | --- | --- |
| 1 FinalizeButton copy | YES, per asserted string | `state.phase` batch vs cas; `lastName` null vs set; for the announcer, running vs idle |
| 2 compact tracking copy | YES, per asserted string | same two, on the compact renderer |
| 3 misnomer guard | NO — it is an ABSENCE guard, not a string-presence assertion. Its discriminating power comes from the three mutation families declared above, which is the stronger instrument for this shape. |  |
| 3b applied-parse name | YES, on the emitted `name` | old vs REFRESHED title; rescan reached vs not reached; row succeeded vs failed. (a) is the sharpest here: with the fake's projection unwidened the value is empty, which is precisely the silent-null failure this task exists to prevent. |
| 3c transition guard | NO — an absence guard. Covered by its six mutation families above. |  |
| 4 close-out | NO — its gate is a marker-grammar check, which gets the MUTANT-RED treatment instead (`docs/agents/writing-plans.md:28`): probe it against a constructed malformed marker and confirm non-zero exit. |  |

Mutant (c) matters most for tasks 1 and 2: those assertions read text out of a rendered tree, and an
assertion that would pass against a commented-out string is not testing the render.

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 2 (no lock change), 5 (no new codes), 6 (conventional commits), 8 (UI gate at close-out), 10 (audit sink not on the diff), 11 (worktree-only), 12 (no ledger row owed, bl-orch ruling 2026-08-29).
- No em dash in any new user-visible string. Apostrophes as `&rsquo;`.
- No wire change. `lib/onboarding/finalizeProgress.ts` is not touched, and neither is the route's emit. If a task finds itself editing either, the plan is being exceeded — stop.
- All tests DB-free. The DB slot is needed only for the final full suite, as a named grant from bl-orch.

## Pre-draft verification pass (run 2026-08-29 in this worktree)

- Copy sites: header `components/admin/FinalizeButton.tsx:974` + `components/admin/wizard/Step3ReviewWithFinalize.tsx:257`; subline `FinalizeButton.tsx:1002` + `Step3ReviewWithFinalize.tsx:279`; `liveMessage` `FinalizeButton.tsx:485`; `runningLabel` `FinalizeButton.tsx:493`.
- Accessible names: `components/admin/FinalizeButton.tsx:967` (group) and `components/admin/FinalizeButton.tsx:987` (bar); `components/admin/wizard/Step3ReviewWithFinalize.tsx:249` (group) and `components/admin/wizard/Step3ReviewWithFinalize.tsx:270` (bar). Both groups wrap `state.phase === "batch" ? … : …` (`FinalizeButton.tsx:962-972`, `Step3ReviewWithFinalize.tsx:245-254`), so their label must suit BOTH phases.
- Class-sweep for the publish verb in accessible names returns exactly those four; the other hits are modal Close/dismiss labels, the confirm dialog `aria-labelledby`, the announcer `sr-only`, and two name tooltips.
- The rename target: `const approvedRows = await selectFinishableCleanRows(...)` (`app/api/admin/onboarding/finalize/route.ts:1624`), read at `app/api/admin/onboarding/finalize/route.ts:1659`, `app/api/admin/onboarding/finalize/route.ts:1642`, `app/api/admin/onboarding/finalize/route.ts:1659`, `app/api/admin/onboarding/finalize/route.ts:1677`, `app/api/admin/onboarding/finalize/route.ts:1743`. Five readers, one declaration.
- `controllableNdjson()` is MODULE-LOCAL to the FinalizeButton suite (`tests/components/admin/FinalizeButton.test.tsx:961`), not exported. The Step3 suite holds its running state with a never-resolving fetch (`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:231`) and so receives NO row events — its subline never renders today. T2 extracts the helper to a shared module and imports it in both suites. The panel subline carries `data-testid="wizard-finalize-current"` (`FinalizeButton.tsx:998`); the compact subline has no testid (`Step3ReviewWithFinalize.tsx:273`) and gains one in T2 so the assertion can be scoped.
- House assertion style: derive expected values from the fixture with a comment saying so (`FinalizeButton.test.tsx:1021-1022`).

## Concept-level self-consistency pass (bl-orch condition, run 2026-08-29 23:25 CDT)

Required before the first Stage 3 commit. Every claim re-derived mechanically, not re-read.

**Derived-cover parse over `app/globals.css`** — the oracle Task 3c will implement, run now against
the live stylesheet. It extracts every rule whose body declares `animation:` or `transition:`:
**20 animating selectors**, and it finds all four the R4 reviewer named (`.route-enter`,
`.bootstrap-dot`, `.telemetry-ping`, `[data-rescan-overlay-result]`) plus the modal, warning-flash,
share-link-flash, section-freshness-flash, admin-alert and agenda-chevron families it referred to
collectively. The parse works, so family (vi) is implementable as specified.

**And it settles AC-5c by derivation rather than assertion.** No animating selector matches any
finalize progress surface: `wizard-finalize`, `step3-tracking`, `finalize-progress` and
`wizard-step3` each return none. Note what DOES animate:
`progress[data-testid="wizard-step2-progressbar"]:indeterminate` — the SCAN step's bar, a `progress`
element with a testid, structurally identical to `wizard-finalize-progressbar`. A sibling bar in the
same wizard IS animated, which is what makes the guard's discrimination meaningful and gives Task 3c
a natural positive control: the guard must flag the step2 bar's selector and not the finalize one.

**Every in-plan verification claim, re-run:**

| Claim | Expected | Got |
| --- | --- | --- |
| `aria-label="Publish progress"` instances across both renderers | 4 | 4 |
| `approvedRows` sites in the finalize route (1 declaration + 5 readers) | 6 | 6 |
| `controllableNdjson` defined in the FinalizeButton suite | 1 | 1 |
| ...and NOT exported (hence the extraction Task 2 owes) | 0 | 0 |
| compact subline carries a `data-testid` today | 0 | 0 |
| panel subline carries `wizard-finalize-current` | 1 | 1 |
| `AnimatePresence`/`motion.` in either renderer | 0 | 0 |
| the stale `toMatch(/Publishing/i)` assertion Task 1 must retarget | 1 | 1 |
| source files rendering the batch copy | 2 | 2 |

All green. The pass is keyed to the CONCEPT each claim asserts, not to the sentences a repair round
rewrote — the failure mode that cost this arc two plan rounds.

<!-- tasks: depth=2 -->

## Task 1 — FinalizeButton: every layer of the batch-phase claim
<!-- task: red=`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx` ac=AC-1,AC-2,AC-3,AC-4 -->
RED and GREEN both run BOTH suites, because this task EDITS an assertion in the Step3 suite:
`pnpm vitest run tests/components/admin/FinalizeButton.test.tsx tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx`
Plan R4 finding 3: a command running only the FinalizeButton suite would let this task commit without
ever executing the test it changed. The task that edits a test runs it before committing — invariant
1's obligation, not a courtesy.

RED, four assertions that each fail against current code:
  - batch header reads `Setting up your shows…`
  - the running button label reads `Setting up…`
  - the subline reads `<name>` with NO prefix (spec §2.2: the strongest outcome-neutral form is to assert nothing)
  - the SET of `[aria-label]` values within the batch phase equals `{"Show setup progress"}`
The aria assertion is a SET comparison, not four string checks: that is what makes it catch a fifth
instance someone adds later, which four spot checks would not.
THE SR ANNOUNCER NEEDS ITS OWN ASSERTION, OUTSIDE THE GROUP (plan R1 finding 1). `liveMessage` is
rendered by `FinalizeAnnouncer` as a separate `<span class="sr-only" role="status" aria-live="polite">`
(`components/admin/FinalizeButton.tsx:547-553`), mounted as a SIBLING of the progress panel
(`components/admin/FinalizeButton.tsx:938`). A group-scoped assertion cannot see it, so every other
test in this task can pass while a screen reader still says "Publishing your shows". Assert the
announcer by its `role="status"` node and require its text to be `Setting up your shows`.

Plus a scoped absence assertion: neither `Publishing your shows` nor `Publishing: ` appears anywhere
in the batch-phase subtree. Scope it to the batch subtree, not the document — the CAS branch and the
idle button legitimately contain other copy, and a document-wide grep would either pass vacuously or
fail on unrelated text.
PRESERVATION in the same task: the CAS header still reads `Finishing setup…`. Declared as
preservation, not claimed as failing-first.

**Task 1 ALSO updates the one pre-existing assertion its own change breaks** (plan R3 finding 1).
`runningLabel` lives in `components/admin/FinalizeButton.tsx:493` and is rendered through the trigger
on BOTH surfaces, so changing it reds
`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:252`
(`expect(b.textContent ?? "").toMatch(/Publishing/i)`, in the test named at
`tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx:229`). The R2 ordering
assigned that update to Task 2, which would have left Task 1 committing a knowingly red suite and
started Task 2 red for a stale assertion rather than its own named behavior — a violation of
invariant 1's per-task red-green-commit cycle. The task that BREAKS an assertion owns fixing it.

Retarget it to `/Setting up/i`. This is NOT gate-editing: the subject legitimately changed and the
assertion's strength is preserved — it still pins that the button steps into a disabled, aria-busy
intermediary carrying a specific label, and still fails if that label goes missing or reverts. Say
so in the commit, because "the implementer changed a failing test" is exactly the shape a reviewer
should challenge.
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
GREEN: `components/admin/wizard/Step3ReviewWithFinalize.tsx:257` header, `components/admin/wizard/Step3ReviewWithFinalize.tsx:279` subline, `components/admin/wizard/Step3ReviewWithFinalize.tsx:249` and `components/admin/wizard/Step3ReviewWithFinalize.tsx:270` aria-labels, and a
`data-testid` on the subline at `components/admin/wizard/Step3ReviewWithFinalize.tsx:273` so the assertion can be scoped to it.
COMMIT: `fix(admin): compact tracking reports setup, not publishing`

## Task 3 — the misnomer that started this
<!-- task: red=`pnpm vitest run tests/onboarding/_metaNoApprovedRowsMisnomer.test.ts` ac=AC-5 -->
Plan R1 finding 2 was right and the earlier framing of this task was invalid: it named
`finalizeStream.test.ts` as its `red=` while its own body said that suite passes before and after,
which is the "guard test that passes the moment it is authored" shape rejected at
`docs/agents/writing-plans.md:28`. A behavior-neutral rename still owes a red-then-green on the SAME
command; it just cannot come from a behavioral suite.

RED: a NEW structural guard this task CREATES under `tests/onboarding/`, named
_metaNoApprovedRowsMisnomer, with the usual dot-test-dot-ts extension (spelled out, not written as a
path: it does
not exist yet and `spec:lint` reads a path-shaped token as a citation to a tracked file). It asserts that
no file under `app/` binds the identifier `approvedRows`. It FAILS on the live
tree today (the declaration at `app/api/admin/onboarding/finalize/route.ts:1624` plus five readers)
and PASSES after the rename — same command, observed both ways.

SCOPE, per plan R2 finding 5: the scan covers ALL of `app/`, not just `app/api/admin/onboarding/`,
because that is what AC-5 claims. The live tree has no second occurrence today, so the narrower scan
would have passed while the AC it is marked against went unproven — a guard whose coverage is
smaller than its claim. Mutation family (iii) plants the identifier in a different file under `app/`
precisely to prove the widened scan discriminates.
PREMISE GUARD (`tests/_shared/premise.ts`): assert the walk actually SAW the finalize route file
before asserting anything about its contents, so a mistyped glob cannot report success by scanning
nothing.
The guard matches the identifier as a WORD, not a substring, so `finishableRows` does not satisfy it
by accident and a future `approvedRowsCount` does not evade it.
GREEN: `approvedRows` -> `finishableRows` at `app/api/admin/onboarding/finalize/route.ts:1624` and
its five readers. The new guard passes, and `tests/onboarding/finalizeStream.test.ts` still passes
unchanged — the latter is a PRESERVATION check stated as such, not this task's red.
COMMIT: `refactor(onboarding): name the finishable row set for what the query selects`

## Task 3b — the displayed name must come from the parse that was applied
<!-- task: red=`pnpm vitest run tests/onboarding/finalizeInlineRescan.test.ts` ac=AC-5b -->
Spec §3.1b. `onRow` reads `parsedShowTitle(row.parse_result)` from the OUTER select-time row
(`app/api/admin/onboarding/finalize/route.ts:1744`), but the inline-rescan auto-heal rebinds only
`staged_id`, `staged_modified_time` and `triggered_review_items` and does not even select
`parse_result` (`app/api/admin/onboarding/finalize/route.ts:1064-1073`). A title-only rename stays clean (`lib/onboarding/rescanDecision.ts:35`
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
      (`app/api/admin/onboarding/finalize/route.ts:1735`) carries the new title too.
Case (b) needs a row that re-parses cleanly and THEN fails, so its failure entry is built after the
refreshed parse exists. **There is no fallback.** An earlier draft permitted substituting an assertion
against the "shared source"; plan R4 finding 2 is right that this is not equivalent evidence, since
such a test passes while `app/api/admin/onboarding/finalize/route.ts:1735` still omits or
stale-renders `display_name` — the very output the orchestrator's condition names.

The ordering IS expressible, so the fallback was weaker AND unnecessary:
`tests/onboarding/finalizeInlineRescan.test.ts:69-78` already demonstrates a clean-restamp fake, and
the version gate at `app/api/admin/onboarding/finalize/route.ts:1246-1261` supplies a post-rescan
failure occurring BEFORE `display_name` is constructed. Compose those two.

A stream test where the fake's inline re-scan returns a parse whose TITLE DIFFERS from the
select-time one, asserting the emitted `name` is the new title.
  ANTI-TAUTOLOGY, and this is the whole difficulty of the task: a fixture whose title is stable
  across the re-parse cannot tell the stale source from the fresh one, and every existing fixture is
  stable — which is exactly why the current suite passes. Derive both titles from the fixture and
  assert they DIFFER before asserting which one was emitted, so the test cannot silently degrade
  into comparing a value to itself.
  REACHABILITY IS VERIFIED, so do not re-litigate it: `applyRescanDecisionUnderLock` is an injectable
  dep (`tests/onboarding/_finalizeFake.ts:447` is the demoting example to copy), and `parseResult(title)`
  is exported (`tests/onboarding/_finalizeFake.ts:48`). What IS real harness work, and what the observed
  RED exists to force:
    - `FakeFinalizeDb` returns ALIASED pending-row objects, so mutating the stored parse also mutates
      the outer selected row and the test goes green against the UNFIXED code. Take a DETACHED
      select-time snapshot so the two are genuinely distinct (plan R1, reviewer note).
    - The fake matches the rebind query by PREFIX
      (`normalized.startsWith("select staged_id, staged_modified_time, triggered_review_items")`,
      `tests/onboarding/_finalizeFake.ts:296`). APPEND `parse_result` to that query in the route;
      inserting it earlier breaks the prefix match and the fake falls through to its
      `Unhandled SQL in finalize fake` throw. Loud, and it names the query that stopped matching.
    - Widen the fake's handler to RETURN `parse_result`. Without it the rebind passes undefined to
      `asParseResult`, which THROWS `JsonbCoercionError` (`lib/db/coerceJsonbObject.ts:133`) rather
      than yielding null. This bullet predicted a silent nullification; the coercion makes it loud,
      and the closeout records the correction. The assertion is POSITIVE anyway
      (`name === "New Show"`), because a negative one would pass on a null just as happily.
GREEN: widen the `app/api/admin/onboarding/finalize/route.ts:1064` query to include `parse_result`, rebind it onto the local row with
`asParseResult` (a legacy double-encoded row returns a JSON string scalar; `parsedShowTitle`
decodes that shape itself, `lib/onboarding/blockerDisplayName.ts:14-20`, so the coercion is for
shape parity with the inner path, not because the helper cannot cope). This also repairs the failure `display_name` at `app/api/admin/onboarding/finalize/route.ts:1735`, which reads the same
stale source.
**Advisory-lock topology declaration (invariant 2, mandatory for a plan editing this path).** Task 3b
edits inside `processApprovedRow`, which runs under a held per-show lock, so the holder enumeration is
required rather than the bare "no lock changes" the R2 version offered (plan R3 finding 3).

- **Every existing holder, enumerated:** exactly ONE — the JS-side acquisition in `defaultWithRowTx`,
  `await tx.query("select pg_advisory_xact_lock(hashtext('show:' || $1))", …)` at
  `app/api/admin/onboarding/finalize/route.ts:238`. `adoptShowLockHeld` does not acquire; it adopts
  and asserts the lock already held.
- **Chosen layer:** unchanged. This task acquires NOTHING. It widens an existing SELECT that already
  runs inside that held lock and rebinds one more field from its result. Zero new acquisitions, so the
  single-holder rule is preserved by construction rather than by care.
- **Preservation guard that must stay green, named so a regression is attributed rather than
  discovered:** `tests/auth/advisoryLockRpcDeadlock.test.ts:869`, "finalize §5.6 re-select topology:
  parse_result re-read runs under the existing show: lock with zero new acquisitions". Corrected
  after whole-diff R2 finding 3: it is NOT the oracle for the SELECT this task edits. Its shape arm
  matches `/select parse_result[\s\S]*?from public\.pending_syncs/i`, which is the later
  generation-scoped re-read, not the rebind query whose select list begins `select staged_id, ...`.
  What it DOES pin, and what invariant 2 actually needs here, is its other arm: it counts every
  `pg_advisory_xact_lock(hashtext('show:' || $1))` occurrence in the route source, so a second
  acquisition anywhere fails it. This task adds none — the rebind rides the transaction that already
  holds the lock — and that is the claim the guard settles. Run it in GREEN alongside the stream
  suite, for the acquisition count, not as a shape oracle for the edited query.

SCOPE NOTE for the commit message: this arc's premise was "no route change beyond a rename", and
this is a route change. It is here because §3.2 keeps the NAME claim, and keeping a claim means
owning its truth conditions. Say that in the commit rather than leaving a reviewer to wonder.
COMMIT: `fix(onboarding): report the applied parse title in finalize progress`

## Task 3c — transition audit (mandatory: the spec carries a Transition Inventory)
<!-- task: red=`pnpm vitest run tests/components/admin/finalizeTransitionAudit.test.tsx` ac=AC-5c -->
Required by the writing-plans rule for any component with a Transition Inventory (spec §3.4). Plan R1
finding 4: the existing coverage audits part of `FinalizeButton` only, and covers neither the compact
Step-3 renderer nor the two compound cases the inventory names.

**Its RED is a CONSTRUCTED failing input, not a pre-existing defect.** Plan R2 finding 1 is right
that both components already satisfy every assertion here, so no natural red exists, and a
non-collection failure before the file is written is explicitly not one. This guard therefore takes
the MUTANT-RED treatment `docs/agents/writing-plans.md:28` prescribes for exactly this shape: the RED
step PLANTS each mutation family declared in the inventory section, observes the SAME command exit
non-zero for each, then reverts; the GREEN step is that command passing on the unmutated tree. Both
states are observed on one command, and every planted mutant and its result goes in the commit.

Inventory BOTH components' conditional renders — every `AnimatePresence`, every ternary render, every
conditional block in the batch and CAS branches of `components/admin/FinalizeButton.tsx:962-1030` and
`components/admin/wizard/Step3ReviewWithFinalize.tsx:230-290`. The spec's inventory says ALL are
instant, so the assertion is structural. Plan R2 finding 2 named three holes in the R1 framing, and
each is closed:

- **Not framer markers alone, and not classes alone.** Scan the rendered subtree's classes for
  `transition-*`/`animate-*`, its inline `style` for `transition`/`animation`, AND the component
  source for `motion.` usage in the progress render paths — the three mechanisms families (ii), (v)
  and (iv) plant. A marker-only oracle is blind to a CSS transition.
  SCOPE IT TO THE PROGRESS SUBTREES — `components/admin/wizard/Step3ReviewWithFinalize.tsx:146`
  carries a legitimate `transition-colors duration-fast` hover treatment on the footer's Back button,
  and a file-scoped assertion reds on correct code.
- **Not the outer child count alone.** A duplicate exiting node can coexist at a NESTED conditional
  mount while the outer mount still shows one child. Assert the property at EVERY conditional mount
  in the subtree; mutation family (iii) plants exactly that escape.
- **The one-commit claim is NOT asserted here.** jsdom cannot prove the name, count and bar changed
  in a single React commit, and asserting it in a jsdom file would be theatre. The structural
  property is what this guard pins; the one-commit behavior rests on the code shape — all three are
  written by one `setState` in the row handler (`components/admin/FinalizeButton.tsx:230-234`) — and
  is recorded in the close-out audit rather than pretended as a test.
  `tests/e2e/blocked-row-resolver-transitions.spec.ts` is the real-browser precedent; this task
  deliberately does not copy its behavioral half, because this arc dropped its Playwright task and
  re-adding one to assert an absence that already holds is not worth a browser.

COMPOUND cases from spec §3.4: the batch -> CAS boundary is asserted structurally (the group's
accessible name does NOT change across it, which is what keeps a screen reader from re-announcing the
group mid-run). The name-with-count case is the code-shape claim above.

COMMIT: `test(admin): audit finalize progress transitions across both renderers`

## Task 4 — close-out
<!-- task: red=`grep -qE "^impeccable-gate: critique=RAN" docs/superpowers/plans/2026-08-29-step3-finalize-progress-scope.md` ac=AC-6 -->
The close-out RED greps for its own marker, so the task cannot be marked done before the gate ran
(pattern from `docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md:67`).
Full suite under `pnpm heavy` (DB slot as a named grant from bl-orch), typecheck, eslint,
format:check.

Invariant-8 gate on the diff, run with the canonical v3 setup gates and not as a bare command
(plan R1 finding 6): the skill's context.mjs load, which reads PRODUCT.md and DESIGN.md, then the
register reference read (its brand or product register). Those are impeccable-skill files, not repo
paths, so they are named in prose. Findings dispositioned in the close-out.

**Both halves re-run if the later whole-diff review causes ANY UI repair.** The marker must describe
the diff that SHIPS, not a pre-repair snapshot of it; a gate run before a UI change is a gate run
against different bytes. If the whole-diff review changes nothing under `components/`, the first run
stands.

**The close-out validates the FINAL tree, not the pre-marker one** (plan R2 finding 6). The R1
ordering ran `pnpm heavy` and the invariant-8 guard BEFORE the marker line existed, so the marker
bytes that actually ship never met the grammar guard. Sequence, and the order is the point:

1. gate halves run, findings dispositioned;
2. write the marker line AND the in-plan `## 12` findings-and-dispositions record (required by
   invariant 8 for a flat plan: "flat plans in an in-plan `## 12` section or a stem-named sibling
   closeout file"). The R1 version omitted this record entirely;
3. re-run `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` — the real grammar guard —
   AFTER the marker lands. This is what validates the shipped bytes;
4. only then the full suite and the remaining gates.

**The marker grep gets the mutant-red treatment too.** `grep -qE "^impeccable-gate: critique=RAN"`
accepts any line merely STARTING that way, including a malformed one. Probe it against a constructed
malformed marker (`impeccable-gate: critique=RAN audit=` with no value) and confirm the meta-test in
step 3 rejects what the grep accepts. The grep is a task-completion tripwire; the meta-test is the
grammar authority, and the plan should not confuse the two. Marker grammar, live example at
`docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md:94`:
`impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=<recorded|none>`
Then whole-diff Codex review to APPROVE, push, PR, 13 required contexts green, READY to bl-orch.
This arc does not merge.
COMMIT: `docs(plan): close out step3 finalize progress scope`

<!-- tasks: end -->

## Acceptance criteria
- AC-1 the batch header reads `Setting up your shows…` on both surfaces
- AC-2 the batch subline reads `<name>` with no prefix on both surfaces
- AC-3 the running button label reads `Setting up…`
- AC-4 every accessible name in the batch phase reads `Show setup progress`, on both surfaces
- AC-5 no source file under `app/` refers to `approvedRows`, and the stream suite passes unmodified
- AC-5c every conditional render in both progress renderers is deliberately instant, and both compound transitions from spec §3.4 are covered
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
filter to those carrying the attribute, and compare the resulting SET to `{"Show setup progress"}`.
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
`runningLabel` becomes `Setting up…`, so AC-3 already has a failing-first test in the tree. **TASK 1
retargets it**, because Task 1 is what changes `runningLabel`. An earlier draft assigned it to Task 2,
and plan R4 finding 3 caught that this note still said so after the task bodies had moved it. Recorded
rather than silently edited: it is the second self-consistency miss of this arc's repair rounds.

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

## 12. Close-out — gate findings and dispositions

impeccable-gate: critique=RAN audit=RAN p0=0 p1=5 dispositions=recorded

**RE-RUN, 2026-08-30 (whole-diff R2 finding 1, P0).** The first run of this gate landed in
`f8c56ab3d`, and `69031be34` then changed `components/admin/FinalizeButton.tsx`. This section
requires both halves to re-run on ANY UI repair, and that commit's message asserted an exemption
for a nonvisual test hook which this plan does not grant — an exemption written by the party the
invariant constrains. The marker above describes the RE-RUN, against the UI diff that ships.

Method: critique ran as two isolated parallel sub-agents (design review; detector evidence), so no
degraded-run banner applies. The audit half ran as a third. Setup gates were run as written:
the skill's context script loaded PRODUCT.md + DESIGN.md, and the register is PRODUCT, so the
product register reference was the one read. Browser visualization was SKIPPED and reported as skipped, not silently omitted:
this worktree forbids starting a dev server or running a build.

Deterministic half: the bundled detector exited 0, zero findings. Zero hardcoded hex. Zero real em-dash
violations — 42 raw hits, every one inside a `//` or block comment rather than JSX text or a string
literal. Four arbitrary Tailwind bracket values were checked against the diff and none is added by
this arc; they live in the untouched confirm-sheet and dot code, so they are recorded as
observed-out-of-scope rather than counted against a marker for work this change did not cause.

Scores: critique 24/40, audit 14/20. **P0: none. P1: five — one fixed here, four deferred.** (Two were fixed at gate time; whole-diff R3 then showed one of those repairs contradicted the spec and the plan's own ratified rationale, so it was reverted and deferred.)

| P1 | Disposition |
| --- | --- |
| The two renderers told different stories: the compact readout said `1 of 2` where the panel said `1 of 2 shows` | FIXED, then REVERTED, and the revert stands — see whole-diff R3 finding 3 in §15. The plan had already settled the bare form deliberately (the sticky bar's height is load-bearing) and the spec's dimensional proof depends on it, so the repair contradicted both and violated invariant 7. Now DEFERRED as `FINALIZE-COMPACT-COUNT-NOUN-1`, which is where it belonged: it needs a real-browser footer measurement this worktree cannot take. |
| `animate-spin` on the running trigger carried no reduced-motion gate | FIXED. Mechanical, and the repo convention already existed at `components/admin/ReSyncButton.tsx:456` and `components/admin/ShowRowActions.tsx:766`. |
| The CAS phase has no progress affordance: bar and count vanish at the boundary | DEFERRED, `FINALIZE-CAS-PROGRESS-AFFORDANCE-1`. Exception (a) — whether a settled batch line persists and whether an indeterminate bar reassures or misleads are product calls a copy repair should not make. |
| The finalize progress bar has no CSS at all and ships raw UA chrome in both themes | DEFERRED, `FINALIZE-PROGRESSBAR-UNTHEMED-1`. Exception (c) — a visual restyle this PR does not otherwise open, and one this worktree cannot verify: no dev server, no build, so no screenshot. Pre-existing; this arc changed the bar's name, never its styling. |
| Every child of the CAS group is `aria-hidden`, and the sub-phases are never announced | DEFERRED, `FINALIZE-PROGRESS-AT-PERCEIVABILITY-1`. Exception (a) — the live region does announce the phase, so nothing is silent; folding `casPhaseLabel` into `liveMessage` is two lines but takes a screen-reader operator from one utterance per phase to four, and that cadence is a decision about how Doug works. |

**Findings REFUTED with their mechanism, recorded so no later round re-derives them.**

- The critique read three surviving "publish" strings as a missed sweep. Two are correct as
  written: "Some sheets need another look before we can publish" is forward-looking on the
  race-row panel, and "Some sheets are blocking the final publish step" names the CAS phase, which
  genuinely does publish. Changing either would make the copy less accurate. The third was real
  and is fixed: `GENERIC_ERROR` said "The publish step could not complete" and is reached from
  eight BATCH-phase paths, where that is precisely the falsehood this arc removes. It is local
  component copy carrying a `not-subject:M5-D8` comment, not catalog-routed, so no §12.4 lockstep
  applies.
- The audit proposed renaming the bar so the group and bar do not share an accessible name. That
  collides with the ratified acceptance criterion that the SET of `[aria-label]` values in the
  batch phase equals `{"Show setup progress"}` — re-affirmed in R2 finding 7. Not taken.
- Two of R2's own challenges were independently resolved by the audit rather than by argument: no
  competing `aria-labelledby` exists, so the accessible name IS computed from the `aria-label` the
  tests pin; and the announcer keys on kind and phase only, so it emits one utterance per phase and
  never one per row.

### 12.1 The dual gate

Both halves ran on the diff, with the v3 setup gates first (the skill context load, then the product register — this is admin tooling, so design SERVES the product). Critique ran its two assessments as ISOLATED PARALLEL SUB-AGENTS, not inline; an inline run is a degraded run and would have required a banner on the report.

**Critique — 2 P1 findings, both FIXED (commit `081f00570`).**

- **P1 `Processed:` was jargon.** Warehouse vocabulary in a register whose voice is explicitly plain-language, and worse, it READS as success to a non-technical operator even though the code meant it neutrally. So the outcome-neutrality this spec argued for at length was honest in code and invisible to Doug. The critique's argument was better than the spec's: the name sits under a labelled bar and an `N of M` count, so its role is established by position. The prefix is gone. Dropping it removes a word, removes a claim, and returns ~11 characters to a line that truncates on a phone. The assertion is now exact equality, so a prefix creeping back fails it.
- **P2 `Setup progress` was the vaguest of three sibling labels** and the nearest to the wizard stepper's own name. Its neighbours are `Onboarding progress` (`components/admin/OnboardingWizard.tsx:197`) and `Folder scan progress` (`components/admin/wizard/Step2Verify.tsx:487`), each naming a specific noun. Now `Show setup progress`, following the pattern already set.

**Three findings disposed WITHOUT change, with reasons rather than dismissal:**

- the trigger still reads `Publish N shows & finish setup` while the progress says setup. Different SCOPES: the button describes the whole operation, which does end in published shows; the progress narrates the current phase. The button's claim is true of what pressing it accomplishes.
- batch `Setting up your shows…` and CAS `Finishing setup…` are lexically close. They are sequential stages of one setup, read coherently in order, and the CAS sub-label (`Making shows live…`) disambiguates. Renaming the batch verb would break coherence with the wizard's own "finish setup" vocabulary.
- the count reads `N of M shows` in the panel and `N of M` in the compact footer. Deliberate: the compact readout is space-constrained inside a sticky bar whose height is load-bearing.

**Audit — 20/20, 0 P0, 0 P1**, scoped to this diff (not the whole surface).

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | the diff IMPROVES it: four accessible names that contradicted the visible text are corrected, and the live region now announces the truthful phase. Focus management, tap targets and contrast pins all unchanged and passing. |
| 2 | Performance | 4 | no effect, state, render or animation surface added. Text and attributes only. |
| 3 | Theming | 4 | no raw color introduced; token classes throughout. |
| 4 | Responsive | 4 | no fixed width introduced; the one-line `truncate` guarantee is preserved and now pinned by a test, and the shipped copy is SHORTER than what it replaced. |
| 5 | Anti-patterns | 4 | none of the absolute bans present; the bundled detector exits 0 on both files. |

Scope honesty: the audit scores the DIFF. The surrounding surface has pre-existing limits this arc does not address, the sharpest being no cancel once a run is in flight (critique scored heuristic 3 at 2/4 for it). Out of scope here, and not counted against the gate.

### 12.2 What implementation changed about the plan

Three plan claims were wrong on contact with the code, each caught by a RED step rather than by review:

- **Task 1's `runningLabel` assertion was in the wrong suite.** In the FinalizeButton composition the trigger UNMOUNTS while running, so that label is only observable through the wizard's `FinalizeTrigger`. Its real coverage is the pre-existing Step3 assertion Task 1 retargets, which is why that task runs both suites.
- **A `toContain` assertion could not distinguish the shipped copy from an appended suffix.** Mutant (b) escaped it exactly as `docs/agents/writing-plans.md:16` predicts. Tightened to exact equality on a new testid — a testid that exists because a mutant demanded it.
- **Spec §3.1b predicted a silent failure that is actually loud.** An unwidened fake projection does not yield null; `asParseResult` throws `JsonbCoercionError`. The coercion kept as defence in depth converts a silent nullification into an error.

### 12.3 Two ways the test fake modeled reality wrongly

Both repaired in Task 3b; both are the non-discriminating-fixture class (bl-orch, 2026-08-29).

- `selectFinishableCleanRows` returned ALIASED row objects, so a fake core mutating the stored row also mutated the route's already-selected row — Task 3b's test would have passed against unfixed code. A real driver never hands back a reference into a store that later mutates. Detached; 570 pre-existing tests pass unchanged.
- Its inline-rescan rebind handler dropped `parse_result`, so the widened rebind assigned undefined.

A fixture that cannot express the difference a test names reports "no difference" and looks like evidence.

### 12.4 The two guards, and how each is proved

Neither has a natural red — both pin an absence — so both take the mutant-red treatment, every mutant planted, observed failing, and reverted.

| Guard | Families | Notable result |
| --- | --- | --- |
| `approvedRows` misnomer | 3 | planting the identifier in a DIFFERENT file under `app/` fails the guard, proving the app/-wide scan discriminates rather than being cosmetic |
| finalize transition audit | 6 | a BRAND-NEW `app/globals.css` rule targeting `wizard-finalize-progressbar` is caught — CSS that did not exist when the guard was written |

The second is the derived cover earning its place. Four review rounds each found the previous closure blind to one more animation mechanism this repository actually uses; the convergent repair was not a seventh pattern but parsing `app/globals.css` for every rule declaring `animation:` or `transition:`.

### 12.5 Deliberately not asserted

jsdom cannot prove the name, count and bar change in a single React commit. That rests on the code shape — all three are written by one `setState` (`components/admin/FinalizeButton.tsx:230-234`) — and is recorded here rather than dressed up as a test.

## 13. Whole-diff review round 1 — findings and dispositions

BLOCKING, 9 findings, all fixed in-branch; none deferred, none refuted. The reviewer
could not execute anything (Vite `EPERM` in its read-only sandbox), so every finding was
read-derived and every one was verified against the tree before being accepted.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | BLOCKING: the dirty inline-rescan path emits the stale title | Fixed, and swept: the sweep found THREE post-restage early returns, not the one named. The bind moved ahead of all branches. Two tests, two different outcome kinds, both observed RED. |
| 2 | The audit ran one renderer/phase cell | Fixed: all four cells. Proved by a mutant in Step3's CAS branch that fails only that cell. |
| 3 | Six oracle escapes | Four closed (matrix, CSS longhands, bare Tailwind utility, each mutant-proved); two documented as limits with the threat fence, per the repair-direction rule. |
| 4 | The fake's "detached" rows were shallow copies | Fixed: `structuredClone`, and the comment now claims only what it delivers. |
| 5 | The app-wide guard scanned only `.ts`/`.tsx` | Fixed: the JS family. Proved by planting a temporary .js probe under app/ that binds the identifier, then removing it. |
| 6 | Two assertions could pass without their behavior | Fixed: exact label equality, and the CAS header got a testid so its preservation test can scope to the element instead of scanning the panel. |
| 7 | Spec §5 demanded copy the implementation contradicts | Fixed at six sites; amendment recorded with its reason. Invariant 7's acceptance obligation is satisfiable again. |
| 8 | Task 3b's `red=` named a file its tests are not in | Fixed, and the spec's test table carried the same wrong file. |
| 9 | Three false failure claims | Fixed. The prefix-reorder claim was settled by PROBE: the fake throws `Unhandled SQL in finalize fake`, and no demote code appears. |

**Also repaired, found while proving the above.** The `preparedSheetFor` and `pending`
fixtures defaulted to DIFFERENT titles, so any test seeding with one and preparing with
the other silently modelled a rename it never meant to. Harmless until the refreshed parse
became the reported title, at which point a test about demotion codes failed on a name.
Defaults now match.

**Documented limit of the slot-release script** (`scratchpad`, not tracked): limb 1 pinned
a pid captured when the script was authored, so on every later run it asked about a
long-dead process and answered yes whatever was alive. Repaired to derive the pid at run
time by CWD rather than by name, since a name match also hits stale shell wrappers whose
snapshot text contains "vitest". Proving that repair exposed the mirror defect in limb 3:
it queried lsof by directory alone, so long-lived MCP servers sharing the worktree read as
orphans and it returned NOT RELEASED on an idle machine. A limb that always passes and a
limb that never clears are the same defect in opposite directions; both are fixed and both
are proved by a positive and a negative control.

## 14. Whole-diff review round 2 — findings and dispositions

BLOCKING, 7 findings, all verified against the tree before acceptance (this reviewer could not
execute either — Vite `EPERM` in its sandbox), all fixed, none deferred and none refuted.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | P0: the invariant-8 gate was stale — a later commit changed a component after it ran | Dual gate RE-RUN; §12 now describes the diff that ships. Two P1s fixed, three deferred with entries, two findings refuted with mechanism. |
| 2 | The fake projected `parse_result` whether or not the query selected it | Fixed. Proved by deleting the column from the production query and watching the guards raise `JsonbCoercionError` where they had passed. |
| 3 | The named lock guard does not pin the edited SELECT | Claim corrected rather than the guard stretched. Its acquisition-count arm is what invariant 2 needs and does hold. |
| 4 | Declared transition family (iii) was not asserted | Fixed: testids in the subtree must be unique, because a duplicate RAISES the node count and passes a lower bound. |
| 5 | Inline animation longhands escaped the audit | Fixed: the check reads `cssText`. jsdom leaves both shorthands empty while the longhands are set — probed, not assumed. |
| 6 | Three tests read `aria-label` and called it the accessible name | Fixed: each also pins that no `aria-labelledby` overrides it. |
| 7 | A second wrong-suite citation in a table round 1 had already edited | Fixed, and swept as a COLUMN this time; component citations re-anchored where this arc's own edits had shifted them. |

**The pattern worth keeping.** Round 1's sweep grepped the instance; round 2 found the second
instance in the same table. Sweeping the column rather than the string is what closed it, and the
same sweep caught two component citations pointing four and five lines off their constructs.

## 15. Whole-diff review round 3 — findings and dispositions

BLOCKING, 3 findings, down from 9 and 7. All verified against the tree, all fixed, none refuted.
This reviewer could not collect tests either, so every finding was checked by hand as in the two
rounds before it.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | BLOCKING: variant-prefixed Tailwind motion evaded the audit's class check | Fixed. The pattern demanded whitespace immediately before the utility, so `motion-safe:animate-pulse`, `hover:transition-colors` and every compound form escaped — and the stylesheet arm cannot compensate, because Tailwind GENERATES those rules and they never appear in `app/globals.css`. `components/admin/FinalizeButton.tsx` carries three instances of the form today, so this was live, not hypothetical. Proved by planting `motion-safe:animate-pulse` on the CAS phase label. |
| 2 | BLOCKING: the nested-duplicate repair only saw nodes carrying testids | Fixed. Keying identity on `data-testid` left every untagged conditional invisible — the compact count and both compact CAS children have none — so duplicating one raised the descendant count, kept the testid set unique, and passed every motion check. Identity is now a structural signature (tag + testid + own text), which does not depend on the annotation a careless duplicate would omit. Proved by duplicating an untagged CAS span. |
| 3 | P0: the gate's own repair contradicted the canonical spec | REVERTED, and the revert is the fix. |

**Finding 3 is the one worth writing down properly, because it is a process failure and not a
coding one.** The invariant-8 critique called the compact count's missing noun a P1, and that
reasoning was sound on its face. It was repaired without checking whether the question had already
been settled — and it had: the plan records the bare form as deliberate, because the compact
readout sits in a sticky bar whose height is load-bearing, and the spec's dimensional proof of
"footer height, before vs after: identical" rests on the only changed text living inside a
`truncate`d node. That count is not truncated. So a repair meant to remove an ambiguity instead put
the code at odds with two ratified documents and broke invariant 7.

The same round earlier refused two other findings for exactly the right reason — the surviving
"publish" strings were checked against what the code actually does and found correct. The
discipline was available and was not applied to this one. The check is cheap: before repairing a
review finding on a surface with a spec, read what the spec already decided about it.

The ambiguity itself is real and is now filed as `FINALIZE-COMPACT-COUNT-NOUN-1`, where it needs
what it always needed — a real-browser measurement of the footer, and a spec amendment landing in
the same change as the code.

