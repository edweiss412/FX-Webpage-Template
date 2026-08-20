# Closeout — spec:lint declared-limit pin collision arm (PR 1)

Spec: `docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md`
Plan: `docs/superpowers/plans/ci/2026-08-19-planlint-declared-limit-pin-collision.md`
Ledger: `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` (archived by this PR)

`impeccable-gate: N/A — no UI surface`

**Every measurement figure lives in ONE place** —
`2026-08-19-planlint-declared-limit-pin-collision-MEASURE.md`, generated from the run's
own output — and this document CITES it rather than restating it. A number correctly
measured once and then re-typed into prose is a number nothing re-derives, which is how a
figure goes stale without anybody editing it.

## 1. How each gate closed

**Absence of a verdict and absence of a process are the same shape on disk**, so a gate
that did not produce its normal artefact records its reason here rather than leaving a
later auditor to read the gap as a skipped gate.

| Stage | Rounds | Findings | How it closed |
| --- | --- | --- | --- |
| spec | 4 under `03953337388b`, 1 under `4e074d3bcbfa` | 21 | **No APPROVE.** A mechanical oracle plus an orchestrator ruling: the fixture-adequacy class was settled by a pass run to a FIXED POINT (iterations 1 then 0), on the measured grounds that the pass found six instances to the reviewers' zero on that question. "Do not buy a round for something you can compute." |
| plan | 5 | 35 | **No APPROVE.** An orchestrator FENCE after round 5, which returned three same-vector recurrences. Red-validity closed by the arc's own cover (six statements enumerated from the document, zero invalid); task-ordering ROUTED to implementation as self-proving under TDD. |
| diff | _(filled at whole-diff review)_ | | |

Every spec and plan finding was accepted; none was refuted. Corpus and per-stage analysis:
`docs/review-rounds/feat/planlint-declared-limit-pin-collision/`.

## 2. The two conditions implementation carried

**A red that cannot exist at its own sequence position is a PLAN DEFECT TO REPORT.** None
was found — every task's red fired at its own position. Three reds were invalid for OTHER
reasons and each was repaired before implementing, never worked around:

| Task | Why the red was invalid | Repair |
| --- | --- | --- |
| 3 | Indexed `findings[0]` before asserting a finding existed, so it failed with a `TypeError` rather than on its assertion — a wrong-reason red that exits non-zero and looks healthy to every did-it-fail check | assert existence, then index |
| 5 | A TYPE ERROR at the new `runLint` parameter, which `writing-plans.md` rules invalid because it goes green when the test file changes rather than when the wiring lands | add the parameter as a stub that accepts and ignores the table, so the red became "the arm is never CALLED" |
| 4 | Named only ONE of the two §2.4 closures, because a `for` loop stops at the first failure | compare as a SET so both appear |

A fourth failed on its **premise** rather than an assertion: Task 7b's subprocess case hit
"the CLI produced output at all", because the CLI infers document kind FROM THE PATH and a
fixture under `tests/` infers neither. The premise said in its own text that it proved
nothing about the code, which is exactly its job. `--kind plan` is the repair, and it is
not a convenience — the alternative, putting the fixture under `docs/superpowers/plans/`
so inference works, would enrol it in the tracked corpus and MOVE the §2.6 set Task 6 pins.

**Every weaker implementation owes a killing check that EXISTS** — §4, reported separately
from the mutation score.

## 3. Two gates, two spaces, neither subsuming the other

A perfect mutation score covers **what the declared operators can express**. The rule-17
killer audit covers **implementations a human would plausibly write that no operator
generates** — a hardcoded-titles scanner, an unanchored whole-line matcher, a
tracking-blind resolver. Neither dominates; both were run and both are reported.

- **Mutation gate** — see the MEASURE record. Enrolment is TWO declarations, both landed,
  with the red-then-green between them observed on the live tree: that ordering is the
  task's own evidence that a registry row alone is not enrolment.
- **Killer audit** — population DERIVED from the spec §6 table, extracted before
  implementation began, never from recall. 18 rows; 15 audited, **15 PROVEN, 0 not
  proven**; the 3 adapter rows were ABSENT pending Task 7b and are reported as absent
  rather than counted as 15 of 15. Method: each weaker implementation was BUILT BY HAND
  and run against the same fixture inputs the shipped suites assert on, requiring
  disagreement on at least one — a variant agreeing everywhere would be a finding, not a
  pass. Re-run against the final source, because a source edit retires the audit exactly
  as it retires a score.

## 4. What the gate changed, and where I was wrong

Rule 20's ladder is delete, totalise, add a case, argue equivalence last. Most survivors
were dead code, and each deletion carries a proof rather than an assertion: the emission
SORT (the walk is ascending and a Map preserves insertion order, so the comparator could
never reorder anything); the DECLINED-BRANCH push (an enrolled path is always
`PATH_SHAPED`, so a header carrying one is INLINE — the declined branch can never name a
surface); a ternary fallback unreachable because `/^[ \t]*/` matches every string;
`namesPath`'s `at===0` guard, redundant since `charAt(-1)` returns empty.

**Two of my own repairs were wrong and were themselves repaired**, which is the honest
record:

1. **Deleting the numeric decoder was WRONG.** Rung 1 is "delete the site" and applies to
   a DEAD site; that code was UNTESTED, not dead. Deleting it made the arm fall SILENT on
   a class it can reach — two live titles in this repo already carry `\x1b` in a test
   title, on a suite of an enrolled surface. **A decline with no channel is the fail-open
   direction wearing the conservative one's clothes.** Decoding is restored and tested.
2. **Totalising a loop by removing its bound was WRONG.** A bounded counting loop is
   mutation-safe BY CONSTRUCTION — whatever a mutant does to the predicate, the bound
   still ends it, and the worst case is a survivor you can SEE. Remove the bound and the
   worst case is a HANG. Safe forms terminate no matter what a mutant does AND carry no
   comparison to mutate: a regex match, a `for…of` over a finite string, and a walk whose
   ceiling is external to the predicate.

**And my rule-29 audit missed a second hang because it audited the loop's SHAPE.** "A
search loop that advances in its own header" was on my own list of safe forms, so
`namesPath` matched the silhouette and passed. **Shape is not the property.** The property
is that no mutation of the predicate can extend the iteration count, which means tracing
what the UPDATE computes when the GUARD IS INVERTED. Proven from code: guard flipped with
the path absent is non-terminating; guard intact terminates.

That hang hid for two runs for a specific reason worth recording: **`MUTANT_TIMEOUT_MS` is
180s and in the scoring path a TIMEOUT SCORES AS DETECTION.** A hung mutant is counted
KILLED, so the defect costs only wall clock and marks the score nowhere.

**No source was reshaped to make a mutant unrepresentable.** Survivors in `&&` chains were
left alone and given cases. One available deletion was DECLINED: `namesPath` could resume
at `at + path.length`, removing a site outright, but for a self-overlapping path that is a
real behavioural narrowing — correctness is not for sale at the price of a mutation site.

## 5. Five accepted rows, and three of them are ONE invariant

Not three stories. **In LIST form the header line carries no enrolled path**, because a
header naming one is classified INLINE above and every enrolled path is `PATH_SHAPED`. Any
mutant that wrongly enters the list branch still records only the header line, which names
nothing. That invariant was ALREADY load-bearing — it is what made the declined-branch
push deletable — so it has been exercised by something other than the argument that needs
it. If it ever becomes false, all three rows are void at once.

The other two are `namesPath` sites my own rewrite created, and each carries a structural
proof AND a probe with an attributable zero: index 0 is unreachable because every scannable
line opens with `**Files:**`, a list marker, or whitespace (51,061 corpus lines, zero
beginning with an enrolled path, control confirming enrolled paths occur); and the
one-extra-iteration case is unreachable because `startsWith` at `line.length` is true only
for the empty string (107 of 107 enrolled paths non-empty, control confirming the check
discriminates). Their post-hoc origin is stated IN the rows, but the support is the proof
and the probe, never the survival.

**The falsifier is EXECUTABLE, not prose.** `tests/mutation/source/gate.ts` already carries
a `stale-ledger-row` condition, so a site that stops surviving makes its row stale and the
gate REDS. Nobody has to remember to re-check. An earlier `namesPath` row was DELETED
rather than carried forward when the bounded rewrite removed its site — a disposition
keyed to nothing is worse than no disposition.

## 6. The arm is SILENT on this arc's own documents

Measured with `namedSurfaceAnchors` over both documents: **surfaces named = none**, for
TWO INDEPENDENT reasons — either alone would read as an accident. **Shape:** all nine
`**Files:**` headers are followed by a BLANK LINE, which §3.2 and §8 item 14 DECLINE.
**Membership:** independently, none of the paths they name is enrolled.

Not repaired by reshaping the Files blocks — that is editing a document to make a test
pass, and the blank-gap shape is house style across the corpus.

**So `0 hard` is NOT evidence the arm ran.** The POSITIVE CONTROL is AC-10 step 2 in
`tests/specLint/declaredLimitPinsCli.test.ts`: the shipped CLI, as a real subprocess, over
a fixture plan naming a REAL enrolled surface with a NON-DECLINING Files declaration,
asserting the advisory by that surface's specific `(suitePath, title)`. Silent here,
demonstrably firing there — both halves, because two absences reinforcing each other give
a reader no evidence the arm works at all.

## 7. Citations invalidated by this plan's own execution

`targetProblem` accepts a bare path only while a file is UNTRACKED, so Tasks 1-4 turned
four `red-target=` values invalid by tracking the files the plan creates. The document went
`0 hard` to `4 hard` with no edit to it. **A plan's citations can be invalidated by the
plan's own EXECUTION.**

The two that already carried line numbers were worse — both still RESOLVED while pointing
at different code (`run.ts:90` where `runLint` is at `:95`; `spec-lint.ts:442` where
`prepareSuiteText` is at `:374`). `RED_TARGET_INVALID` checks that a tracked path has an
IN-RANGE LINE, never what is AT it, so a drifted citation stays green BY DESIGN.
**Resolution is not correctness.** All six re-pointed with lines computed from SYMBOLS at
apply time, and an anchor table now carries BASE and HEAD columns.

## 8. What did NOT run, and what is NOT explained

- **DB-guarded tests SKIP in this worktree.** `pnpm preflight` warns `TEST_DATABASE_URL` is
  NON-LOOPBACK. **A skipped suite is not a passing suite.** No acceptance criterion of this
  arc depends on one — it touches no DB, no advisory lock, no UI surface — but the fact is
  stated rather than left to assumption.
- **Three measurement runs died at exit 143/144.** The events are real. **The mechanism is
  UNEXPLAINED, and detaching the run is a SYMPTOM FIX OF UNKNOWN MECHANISM — not a proven
  remedy.** If the symptom returns, re-diagnose from scratch rather than reaching for the
  same workaround. A duration-threshold theory was proposed and REFUTED by this arc's own
  data: `b99ao3v9o` completed at 1004.31s, 16.7 minutes, exit 0. Nobody is asked to act on
  this.

## 9. Cost note for the next person enrolling a corpus walker

One deciding suite enumerates every tracked plan and reads every enrolled suite, ONCE PER
MUTANT. **The deciding-suite list is a COST decision as much as a coverage one**, and
dropping it would have been faster and wrong: placement outside `suitePaths` buys zero
score, so every mutant only it can catch would survive silently. Coverage wins; budget for
it. Adding the seventh suite measurably lengthened every subsequent run.

## 10. Observation, not filed

`docs/superpowers/plans/ci/README.md` indexes siblings only through 2026-08-17 and is
missing several later arcs including this one. The parity gate walks `SPECS_ROOT` only and
never the plans tree, so nothing is red, and `docs/superpowers/specs/ci/README.md` does
carry this spec's row. Not filed: it is not a defect in this diff, and as a process-facing
row it would need a measured Incident under the mint bar.

## 11. Ledger

Graduated to `BACKLOG-archive.md` with its `IN PROGRESS` marker stripped, as ONE commit
BEFORE whole-diff review, so absence at merge is guaranteed rather than maintained.
Verified by set arithmetic over the FULL population with ids read by SHAPE rather than by
a `BL-`/`DEF-` prefix — DEFERRED uses custom ids, and a prefix-keyed check scored zero for
all 21 of its entries twice while looking complete. Open 109→108, archive 397→398, **union
conserved at 506**, intersection 0, with must-be-PRESENT controls at BOTH id formats. The
conserved union is the load-bearing figure: it proves a MOVE rather than a delete on one
side and an unrelated add on the other.

**Residual hazard, carried deliberately:** four arcs are merging around each other, so any
LATER merge of `origin/main` re-conflicts both ledger files and can reintroduce a row or a
marker. The set arithmetic, the `0 hard` lint and `_metaLedgerInProgress` are re-run after
EVERY subsequent merge, not once.
