# Near-miss candidacy: field lists only — plan

**Spec:** `docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md`
**Branch:** `fix/nearmiss-non-field-blocks` (closes `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS`)
**Probe:** `docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-candidacy-probe.ts`, output committed alongside it

## Global constraints

- TDD per task: failing test, minimal implementation, passing test, commit. Never implementation before the test that exercises it.
- The spec is canonical. Its eleven acceptance criteria live there; this plan carries a coverage map rather than declaring ids of its own, which is the posture of the enrolled plans whose criteria sit in a sibling spec.
- No UI surface, no DB, no advisory locks, no new HTTP or server-action surface. Plan-wide invariants 2, 3, 5, 9 and 10 are not engaged; 1, 6, 11 and 12 are.
- impeccable-gate: N/A — no UI surface.

## Acceptance-criteria coverage map

| criterion | discharged by |
| --- | --- |
| AC-1 no near-miss for Room Diagram, Backdrop, Speaker on the RIA fixture | Task 2 |
| AC-2 baseline re-measured and re-ratified at 33 | Task 2 |
| AC-3 surviving 33 byte-identical in all five fields | Task 2 |
| AC-4 a block with wide rows but a narrow minimum stays a candidate | Task 1 (shape), Task 2 (candidacy) |
| AC-5 Timestamp block excluded despite resolving rows and single-column shape | Task 2 |
| AC-6 Console block excluded, premise proving its row would have matched | Task 2 |
| AC-7 matching rule and consumption ledger unchanged | Task 2 (structural) |
| AC-8 mutation surfaces at or above floor, empty unaccepted-survivor set | Gate A |
| AC-9 per-block classification census pinned at candidacy level | Task 2 |
| AC-10 detector bound to the predicate, emits iff admits | Task 2 |
| AC-11 form-dump arm compares NORMALIZED openers, proved by an executed case | Task 2 |

Nine criteria land in Task 2 because they describe one behaviour change and its full consequence set. Round 1 rejected splitting them: the gate reds both suites the moment it works, so any split produces an intermediate red commit and a later task whose red is inherited rather than authored.

AC-11 carries the whole weight of its criterion. Spec rounds 4, 5 and 6 each found a defect in the probe table that used to prove it, so the spec demoted that table to an illustration and moved the proof into the suite (spec §6 item 7). That makes AC-11 the one criterion in this plan whose correctness is not checkable by reading a document, which is the point of moving it.

## Meta-test inventory

- **CREATES:** the per-block census pin (AC-9), the detector-binding pin (AC-10) and the normalized-opener pin (AC-11), all as derived walks inside `tests/parser/fieldNearMiss.test.ts`. None is a new registry-bearing meta-suite.
- **EXTENDS:** `tests/mutation/source/registry.ts` — re-keyed `accepted` rows on two surfaces (`fieldNearMiss`, `rowScanOpener`). No new registry row; both surfaces are already enrolled.
- **INHERITS:** `tests/mutation/_metaPremiseContract.test.ts` enforces the premise contract on registry-enrolled suites, so the new cases are covered without a change there.
- No other candidate registry applies: no Supabase call boundary, no admin alert, no tile sentinel, no advisory-lock topology, no inline email normalization.

## Mutation-family closure set, declared up front

Both surfaces are enrolled with `operators: [...OPERATOR_NAMES]`, so the closure set the review converges against is the registry's FULL operator set, not a subset chosen here. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

## Declared-limit pin: named and left alone, with evidence

`fieldNearMiss` carries an `accepted-gap` row (`relational-boundary:153:27:>>>=`, ref `BL-NEARMISS-EQUAL-SIZE-TOKEN-SUBSET`) whose reason rests on a measured zero: no corpus label produces a type-(b) match whose token-set size equals its entry's. A plan that moves a recognizer under a declared-limit pin must name it and dispose of it.

**Disposition: LEFT ALONE, verified rather than argued.** Excluding blocks can only REDUCE the labels reaching `matchVocabulary`, so a zero over reached labels cannot become non-zero. Run at plan time:

```
labels reaching the matcher: before=7627 after=6847
EQUAL-SIZE type-(b) matches: before=0 after=0
```

The reduction confirms the monotonicity argument rather than assuming it.

## Registry reconciliation, run at plan time

Three `accepted` rows exist across the two surfaces, all line-keyed and therefore drift-prone:

- `fieldNearMiss`: `statement-removal:158:11:break;>(removed)` and `relational-boundary:153:27:>>>=` — both inside `matchVocabulary`'s subset loop.
- `rowScanOpener`: `relational-boundary:47:22:>>>=` — the `cells.length > 0` site inside `scanBlockCells` (`lib/parser/blocks/_rowScan.ts:47`, verified at head).

Expected drift: BOTH `rowScanOpener` rows move, because Task 1 edits `scanBlockCells` and the second row's site sits below it. The two `fieldNearMiss` rows must NOT move, which is why Task 2 places the new predicate AFTER `isCandidateLabel` rather than near the top of the file. Re-key by kind plus mutated text, never by line, and verify siteIds AFTER the commit hooks run, since prettier can reflow a line between measurement and commit.

`tests/parser/fieldNearMiss.test.ts` already contains a registry-enrolment describe including a case asserting both accepted rows are structurally valid "so neither gate runs vacuously". Re-keying must keep that green; it is the existing guard against exactly this drift.

## CI wiring and index obligations

- No new test file. Both suites are already matched by the parallel project glob `tests/parser/**/*.test.{ts,tsx}` (`vitest.projects.ts:132`); the nightly `mutationHarness.*` files are excluded separately (line 98) and are untouched. No `testMatch` entry and no workflow path-filter change is owed.
- `docs/superpowers/specs/parser/README.md` — row ADDED for the spec. That index is a flat per-file catalog.
- `docs/superpowers/plans/README.md` — NO row owed: it is a curated release catalog organized by release era, and recent flat peer plans carry no row in it.
- `docs/superpowers/plans/coverage.md` — NO row owed and no manual edit permitted; it is `@generated by scripts/generate-traceability.ts`.

## Pre-implementation baseline, measured

Both suites are GREEN at the arc head before any implementation lands:

```
pnpm exec vitest run tests/parser/fieldNearMiss.test.ts tests/parser/fieldNearMissBaseline.test.ts
Test Files  2 passed (2)
Tests  64 passed (64)
```

64 is the number Task 2's eight dispositions must keep honest: three assertions move to zero, one test is inverted, and the count otherwise changes only by what Tasks 1, 2, 3 and 3b add. A drop not explained by those eight dispositions means a case was deleted rather than repaired.

## Where the new cases go, and which helpers they reuse

Existing describes, read at plan time: "vocabulary derivation" (line 129), "v3 normalization" (line 198), "row scan" (line 218), "audited true positives fire" (line 240), "block/kind anchor namespace" (line 287), "guard-suppressed and unmatched classes stay silent" (line 319).

New cases go in a NEW `describe("block candidacy")`, placed after the suppression describe so the file reads label-level suppression first, then block-level candidacy, matching the order the detector applies them. They are NOT folded into the existing suppression describe, and the distinction is load-bearing rather than cosmetic: those cases assert a label matches NO vocabulary entry or dies to a LABEL-level guard, whereas these assert a label that matches and clears every label guard is suppressed by its BLOCK. Different mechanism, different premise.

Two existing helpers are reused rather than reinvented, and both already encode the anti-tautology posture:

- **`expectContributesNothing(noise)`** (lines 114-123) runs a control block measured to fire, states a premise that the control DID fire ("so the detector is demonstrably alive"), then asserts the noise contributes zero emissions, with the expected set derived from the control's own run rather than hardcoded. A bare "no Room Diagram emission" assertion passes against a detector that emits nothing at all; this one cannot.
- **The all-caps guard case** (lines 379-395) is the template for the premise chain and, more importantly, for the controlled A/B: it puts `ADDRESS` and `Address` in ONE document differing only in the property the guard keys on, and asserts the fired set equals exactly `["Address"]`. It proves the guard DISCRIMINATES rather than that something went quiet. Its comment also justifies its witness choice, which every new case copies.

## TRAP: selecting the form-dump block by the wrong label

Measured at plan time. `fixtureTable` returns the FIRST table holding a row with the given col0 (line 68, `tables.find(...)`), and `Room Diagram` occurs in TWO blocks of the RIA fixture:

```
fixtureTable(RIA_RAW, "Room Diagram") -> opener "DETAILS"   ns=details    rows=19   <- WRONG
fixtureTable(RIA_RAW, "Backdrop")     -> opener "Timestamp" ns=timestamp  rows=50   <- right
fixtureTable(RIA_RAW, "Speaker")      -> opener "Console"   ns=console    rows=7    <- right
fixtureTable(RIA_RAW, "Timestamp")    -> opener "Timestamp" ns=timestamp  rows=50   <- right
```

Selecting by `Room Diagram` hands the test the DETAILS block, which the rule ADMITS, so the case would assert an admitted block's row is excluded or pass for an unrelated reason. `Backdrop` is safe only because the DETAILS block spells its counterpart `Backdrop / Scenic` — a collision that does not exist rather than one that was avoided.

**Every case that selects a block by a row label asserts which block it got**, via `premiseHolds` on the anchor namespace, placed immediately above the assertion resting on it.

## `isCandidateHome` is EXPORTED, deliberately

AC-9 and AC-11 call the predicate DIRECTLY, which is what makes them candidacy-level rather than emission-level, and is why they catch defects no emission count can see. So the predicate is exported.

The module's split at head: `normalizeV3` (line 33), `fusedForm` (line 45), `MIN_LEN` (line 72), `DISTINCTIVENESS_MAX` (line 82), `buildVocabulary` (line 103), `tokenDocFrequency` (line 118), `matchVocabulary` (line 134), `anchorNamespace` (line 221) and `detectFieldNearMisses` (line 236) are exported; `tokens` (line 48), `isAllCapsSingle` (line 90), `passesGuards` (line 172) and `isCandidateLabel` (line 184) are private. The precedent is exact: `matchVocabulary`'s header says it is exported "because it is how a suppression test states its premise". `isCandidateHome` is exported for the same reason one level up, and carries a header saying so, so a later reader does not narrow it back on the reasonable-looking ground that nothing in `lib/` calls it from outside.

The asymmetry with `isCandidateLabel` is deliberate: label-level suppression is observable through `matchVocabulary` plus the guards, all already exported, whereas block-level candidacy has no other observable surface.

## Task 2's ledger posture, chosen deliberately

The suite's production-faithful harness is `emissionsFor` (lines 80-88): it runs `parseContacts`, `parseTransportation` and `parseEventDetails` first so the consumption ledger is populated as production populates it, then runs the detector. Every existing case uses it.

The AC-10 and AC-11 cases deliberately do NOT, and the reason is measured rather than assumed. An earlier draft of this plan claimed no block parser would claim `Equipment Storage:`; that is false:

```
doc: "| DETAILS |  |\n| Equipment Storage: | somewhere |"
ledger entries after the block parsers: 1
   "DETAILS\0Equipment Storage:\0somewhere" x1
emits WITH a populated ledger: false
```

`parseEventDetails` consumes that row in a DETAILS-family block and the detector is then correctly silent via consumption draw-down. So under the production harness the injected row would go silent in exactly those blocks whose parser recognizes it, for a reason unrelated to candidacy, producing FALSE disagreements in the ADMIT direction. An empty ledger isolates the gate under test, which is what these two criteria are about.

## Task 1 detail: the field is REQUIRED, not optional

`ScannedRow` and `ScannedBlockRow` have exactly TWO construction sites in the repository, both inside `lib/parser/blocks/_rowScan.ts` — line 47 and line 77. Every other occurrence in `lib/` and `tests/` is a re-export (`lib/parser/fieldNearMiss.ts:69`) or a comment (`lib/parser/blocks/_helpers.ts:40`); consumers destructure `{ cells, opener }` and construct nothing.

So `blockMinValueCells` is declared REQUIRED. Both sites are in the file Task 1 already edits, the compiler enforces that neither is forgotten, and under `exactOptionalPropertyTypes` a required field avoids optional-property friction. An optional field would let a future construction site omit the statistic and read `undefined`, which `>= 6` evaluates as false, silently admitting every block.

## Task sequencing, restructured after plan round 1

Round 1 returned BLOCKING on the previous split, and the diagnosis was structural rather than a set of separate mistakes: **red-then-green ON THE SAME COMMAND cannot hold when a production change reds a suite that a later task repairs.** The gate lands in one task and both suites stay red until every disposition is in, so any intermediate task ends red and any later task's "red" is inherited rather than its own.

Two consequences drive the shape below. First, the behaviour change and ALL of its test dispositions are ONE task: one commit, one command pair, red then green. Second, the two steps that are gates rather than red-green cycles — the mutation score and the ledger graduation — sit OUTSIDE the checked region, next to base re-verification, because neither has a failing case it authors and then fixes.

### The complete disposition set: EIGHT cases, not four

Round 1 found that the previous draft named four. Read at plan time, the full set is:

**`tests/parser/fieldNearMissBaseline.test.ts`**

1. line 44 / line 167 `EXPECTED_TOTAL` 65 to 33.
2. lines 188-190 `n("Backdrop")`, `n("Room Diagram")`, `n("Speaker")` to 0 — asserted explicitly, not deleted, so the keys stay in the partition and red if they return.
3. lines 194-197 the partition cover keeps working unchanged: 32 + 0 + 0 + 0 + 1 = 33. It is what catches a NEW key appearing anywhere.
4. lines 205-215 `it("every Room Diagram row sits in a Timestamp block")` loses its subject and fails by construction, as its own comment predicts. INVERT it: no `Room Diagram` row survives in any namespace, with a premise that the frozen baseline still contains the 15 it is asserting the absence of. Deleting it would drop a real ledger-regression guard as cleanup.
5. line 498 `it("a Timestamp-block row resolves null against an anchor set that has no Timestamp block")` carries `premiseHolds("the baseline carries a Timestamp-block row", row !== undefined)`, which dies when timestamp emissions reach zero. RETIRE it, and record why in the same commit: the case pins anchor resolution for a namespace the detector no longer emits into, so its subject is gone rather than its claim being wrong. `tests/drive/unknownFieldAnchors.test.ts` continues to pin Timestamp-row anchoring in its own workbook, which its comment already names as the live home of that behaviour.

**`tests/parser/fieldNearMiss.test.ts`**

6. line 542 `it("the Timestamp-block Google-Forms echo fires")` asserts `emissionFor(fixtureTable(CONSULTANTS_RAW, "Timestamp"), "Room Diagram")` has kind `timestamp`. This arc removes exactly that emission, so `emissionFor` throws. INVERT: the same block now contributes nothing, asserted differentially so "nothing fired" cannot mean "the detector never ran".
7. line 549 `it("Speaker fires against Virtual Speaker")` asserts the Console-block emission this arc removes. INVERT the same way.
8. line 853 the registry-validity case reds from `siteId` drift once Task 1 edits `_rowScan.ts`.

Cases 6 and 7 sit in `describe("calibrated residual classes fire exactly as baselined")`. That describe's whole subject is the residual set this arc narrows, so the two cases are not incidental casualties: they are the previous calibration, and inverting them is how this arc records that the calibration moved.

### Registry: FOUR accepted rows, not three

Round 1 corrected the count. `rowScanOpener` carries TWO rows, not one:

- `fieldNearMiss`: `statement-removal:158:11:break;>(removed)`, `relational-boundary:153:27:>>>=` — inside `matchVocabulary`'s subset loop, which nothing here edits, so neither should drift.
- `rowScanOpener`: `relational-boundary:47:22:>>>=` (the `cells.length > 0` site in `scanBlockCells`) and `statement-removal:115:7:opener = "";>(removed)` (`tests/mutation/source/registry.ts:2603`, a site in `openerByLine`). Task 1 adds lines inside `scanBlockCells`, so BOTH shift.

Re-keying therefore belongs in Task 1, the task that causes the drift, not in a later scoring step. Re-key by kind plus mutated text, and verify siteIds AFTER the commit hooks run.

### Task 0 (setup, outside the checked region): fresh base + anchor re-verification

Run the committed probe and diff against `…-probe.out.txt`. Any difference means another arc moved the corpus or the baseline, and every number in the spec must be re-derived before implementation starts.

<!-- tasks: depth=3 red-contract -->

### Task 1: block shape in the scanner, with its registry re-key

<!-- task: red=`pnpm vitest run tests/parser/fieldNearMiss.test.ts` red-state=authored red-target=`lib/parser/blocks/_rowScan.ts:40` why=`the task lands blockMinValueCells as a skeleton returning 0 on both ScannedRow construction sites FIRST, so imports resolve and the observed RED is behavioral: the shape cases assert a two-column list reports 1, a uniform grid reports its true minimum and a mixed block reports the NARROW row, none of which a constant 0 satisfies, and the registry-validity case at :853 reds alongside them once the edit shifts both rowScanOpener siteIds; the SAME command greens when the real minimum lands and both rows are re-keyed` ac=AC-4 -->

`blockMinValueCells` computed once in `scanBlockCells`, over cleaned cells after column 0, taken across the KEPT rows only — alignment rows are dropped above it and every number in the spec was measured post-drop.

**Two passes, and no empty-block constant.** Each row is currently constructed inside the `forEach`, before the block minimum is known, so the shape is: collect kept rows, compute the minimum, then construct. The empty case is handled by an early `return []` rather than by choosing a value: if there are no kept rows the function emits nothing, so any constant would be unobservable, and an unobservable difference is an EQUIVALENT MUTANT the harness plants, cannot kill, and charges as a new accepted row. Handling the empty case by not having one is what keeps the score clean.

The field is REQUIRED, not optional. Both construction sites are in this file (line 47, line 77), the compiler enforces that neither is forgotten, and an optional field would let a future site read `undefined`, which `>= 6` evaluates as false, silently admitting every block.

Cases: a two-column field list reports 1; a uniformly wide grid reports its true minimum; **a block mixing wide and narrow rows reports the NARROW one**, which fails against a max or a mean. Expectations derive from each fixture's measured shape. The `clean` case uses a CONSTRUCTED cell with a premise that the construction differs under the two definitions, because no corpus input distinguishes them (measured: 0 of 44,446 value cells).

### Task 2: the candidacy gate, with every disposition it forces

<!-- task: red=`pnpm vitest run tests/parser/fieldNearMiss.test.ts tests/parser/fieldNearMissBaseline.test.ts` red-state=authored red-target=`lib/parser/fieldNearMiss.ts:184` why=`the task lands isCandidateHome as a skeleton returning true FIRST, so the observed RED is behavioral rather than a missing symbol: a predicate admitting everything IS the pre-change detector, so the new candidacy, census, binding and normalized-opener cases all fail while the client positive control already passes; the SAME command greens only when the two 3.1 arms land AND all eight dispositions are in, which is why they are one task rather than several` ac=AC-1,AC-2,AC-3,AC-5,AC-6,AC-7,AC-9,AC-10,AC-11 -->

One task because one behaviour change: the gate reds both suites the instant it works, and only the full disposition set returns them to green. Splitting it produces an intermediate red commit and a later task whose red is inherited rather than authored, which is exactly what round 1 rejected.

**The gate.** `isCandidateHome` placed after `isCandidateLabel`, exported with a header saying why, and called at the TOP of the row loop. Early placement is correct and the reason is not obvious: the loop MUTATES via the consumption draw-down (`remaining.set`, `lib/parser/fieldNearMiss.ts:259`), so an early gate means excluded blocks never draw down. That is safe ONLY because `consumptionKey` (`lib/parser/warnings.ts:46-48`) leads with the block opener, so no admitted row can ever produce an excluded block's key. Anyone who later flattens that key breaks this placement, and nothing in the suite would say so, which is why the dependency is written here.

**New cases**, each with a premise on its own inputs and a control it can lose:

- **AC-5** the `Timestamp` block, selected by its OPENER: `fixtureTable(RIA_RAW, "Room Diagram")` returns the DETAILS block, because the label occurs in both and the helper takes the first. Every case that selects a block by a row label asserts which block it got.
- **AC-6** the `Console` block, premise that `Speaker` matches `Virtual Speaker` and clears the guards.
- **AC-4** the positive control: a `client` block whose MINIMUM is 0 while it holds a row at 8 value cells. Nine corpus blocks qualify, and the sharpest witness is one where the FIRING row is itself wide, so a per-row matrix rule suppresses the exact row the assertion needs.
- **AC-9** the per-block census, premise that the walk saw 21 `venue`, 13 `details`, 4 `console` blocks, asserting both directions.
- **AC-10** the detector binding, with its positive, ambiguity and shape-invariance controls.
- **AC-11** the normalized-opener case, rebuilding a real form-dump block and asserting the reparsed opener DIFFERS from the source, which is what makes a rebuild a rebuild.
- **AC-7** structural: matching rule and consumption ledger unchanged.

**AC-10 and AC-11 run on an EMPTY ledger, deliberately.** `parseEventDetails` consumes `Equipment Storage:` in a DETAILS block, so under the suite's production-faithful `emissionsFor` harness the injected row would go silent in exactly the blocks whose parser recognizes it, for a reason unrelated to candidacy, producing false disagreements in the ADMIT direction.

**AC-1 and the baseline.** `UPDATE_NEAR_MISS_BASELINE=1`, `EXPECTED_TOTAL` 65 to 33, the note gains a line naming this spec, and all five baseline dispositions land. AC-1's premise is CORPUS-scoped, never RIA-scoped: both RIA fixtures go to ZERO rows, since every emission either produces today is one of the three this arc removes. So the case asserts the RIA fixtures emit nothing at all, on a premise that the corpus still emits 33.

Finally re-run the probe and confirm TABLE-J reports frozen 65 / live 33 / delta -32 while TABLE-A through TABLE-I are UNCHANGED, since they read the frozen input.

## Gate A (outside the checked region): mutation score

Run `pnpm heavy:mutation pnpm mutation:guards`, after requesting the class lock from bl-orch. The child command is REQUIRED: the `heavy:mutation` script definition ends in `--`, so the bare form passes no command and exits 2 on usage text — a failure invariant across every implementation, which can therefore never turn green and never prove anything.

This is a GATE, not a red-green cycle: it has no failing case it authors and then repairs, and its verdict is a score plus an empty unaccepted-survivor set. The previous draft's bare `pnpm heavy:mutation` was `LIM-AUTHORED-RED` occurring inside this very plan: a declared red that could not be red for its stated reason, since its exit 2 is invariant across every implementation and registry change. That is the class the corpus has named six times, and it is why the repair is structural rather than a corrected command string — a gate misfiled as a TDD cycle will keep producing unfireable reds however carefully the command is written. Both surfaces must sit at or above their 0.95 floor. The diff round-1 brief carries score, survivors and the `OPERATORS:` tail on one conforming `GUARD SURFACE:` line. (AC-8)

## Gate B (closeout, outside the checked region): ledger graduation

Strip the `**Status:** IN PROGRESS · **Branch:**` marker from `BACKLOG.md:56` in the PR's LAST commit, per plan-wide invariant 12, so it never reaches main. `tests/docs/_metaLedgerInProgress.test.ts` requires an in-progress entry's branch to exist on origin, and the merge deletes that branch.

Outside the region deliberately: no production surface, no acceptance criterion, and a red that exists only after a merge this arc never performs.

## Marker command validation, run at plan time

Every `red=` command was parse-checked with `sh -nc` and collection-checked with `vitest list` before dispatch, because a command the shell cannot parse expresses no verdict in either direction while the classifier reads its non-zero exit as "red observed", and a vitest-shaped command that cannot COLLECT its tests exits non-zero for a reason unrelated to the behaviour under test.

```
pnpm vitest run tests/parser/fieldNearMiss.test.ts                          PARSE-OK
pnpm vitest run tests/parser/fieldNearMissBaseline.test.ts                  PARSE-OK
```

`vitest list` collects both suites. No `-t` name filter appears anywhere in this plan: one that matches nothing exits 0 and reports green from the moment it is written.

Every red is `red-state=authored` — each task writes its own failing case — so none is executed at plan time. Each names instead the production surface whose absence or defect makes it fail, and Tasks 2, 3 and 3b follow the house skeleton-first pattern so the observed RED is BEHAVIORAL rather than a missing symbol.

**Every `red-target` cites a line my own edits cannot move.** Path-only would be the safer-looking choice against drift, but `spec:lint` refuses it outright ("cite the defective line instead of the bare path"), so the question is not whether to cite a line but which line survives the task that cites it. The documented limit of `RED_TARGET_INVALID` is that it checks a tracked path has an IN-RANGE line, never what is AT that line, so a drifted citation resolves green while pointing at unrelated code — and the drift is usually caused by the citing task's own implementation.

Both citations are chosen to be stable under exactly that pressure:

- `lib/parser/blocks/_rowScan.ts:40` is `scanBlockCells`'s signature line. Task 1 adds lines INSIDE its body, below 40, so the signature does not move.
- `lib/parser/fieldNearMiss.ts:184` is `isCandidateLabel`'s signature line. Task 2 inserts `isCandidateHome` AFTER that function ends at 190, so 184 does not move either.

Neither task inserts above its own citation, which is the only property that makes a line-form target survive its task. Closeout re-verification is still by READING each cited line and matching it to the symbol its `why=` names: confirming a citation merely RESOLVES establishes nothing.

## Verification (whole-arc)

`pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, `pnpm spec:lint` on both documents, and the committed probe diffed against its regenerated output.

## 12. Closeout

impeccable-gate: N/A — no UI surface
