# `spec:lint` red-reason verification: the unprobeable-command silent drop, and five refutations of the row

**Row:** `BL-SPECLINT-RED-REASON-VERIFICATION` · **Branch:** `feat/speclint-red-reason-verification` ·
**Surface:** `lib/specLint/redContract.ts` (enrolled as `redContract`)

The row asks for an arm that checks whether a `red=` failed **for the reason the task named**, not
merely that it exited non-zero. This spec is the measured answer, and the answer is smaller than the
row expected in one direction and sharper in another.

**What ships:** the repair of one silent drop, measured at **15 markers**. `collectionProbePlan`
discards every v2 marker whose command it cannot derive a collection probe from, emitting neither a
finding nor a plan entry. Nine of the fifteen are `pnpm heavy`-wrapped, which is what makes the hole
rule-mandated rather than incidental: AGENTS.md requires that wrapper for every heavy phase, and the
wrapper is precisely what puts the command out of the arm's reach.

**What does NOT ship, and why that is the deliverable rather than a gap:** the reason-classifying
observable itself. Measurement refuted it, and three of the five refutations in §5 land against the
row's own text. They are recorded there so the next author does not re-derive them.

---

## 0. Resolved scope — do not relitigate

Each bullet was settled by a measurement in this document and cites where.

- **The reason-classifying arm is RETIRED by ratified scope decision** (§2, §6). It could only ever
  be advisory, over a live population of two markers, at the cost of owning a summary-line grammar on
  the file that has already burned twenty diff rounds. Retiring it makes two round-2 findings
  unrepresentable rather than answered.
- **Prose matching `why=` against the observed failure was never in scope.** The row states the
  narrower claim itself.
- **`probes === null` is NOT a live defect** (§5.3). Unreachable from the shipped CLI, proven at
  `lib/specLint/run.ts:152`.
- **The row's premise about loader death is false** (§5.1), and its zero-case corollary is false in
  both directions (§5.2).
- **The §1.1 file count is a dated record, deliberately not re-pinned** (§1.1).

A finding that **§2's repair misses a marker inside the fifteen**, or that an acceptance criterion is
satisfiable by an implementation this spec forbids, is welcome. A proposal to revive the retired
observable needs a probe defeating §5.2's measurements.

---

## 1. Measured evidence

### 1.1 The red-marker population — the `PROBE DOMAIN`

Derived through the **shipped parser** (`parseDoc` + `parseMarker` + `deriveCollectionProbe`), not a
grep, over `git ls-files docs/superpowers/specs docs/superpowers/plans`, `.md` only.

**Read the file count as a DATED RECORD.** It moves when this arc's own documents are tracked — 1153
before this spec, 1154 after — so no criterion depends on the literal. Measured at `0a70816d3`:

| quantity                                      | value    |
| --------------------------------------------- | -------- |
| tracked `.md` files scanned                   | **1153** |
| `red=` markers                                | **479**  |
| `red-state=authored`                          | 160      |
| `red-state=live`                              | **2**    |
| v1 markers (no `red-state=` field)            | 317      |
| markers wrapped in `pnpm heavy`               | 25       |
| **v2 markers reaching the `none` drop**       | **15**   |
| …of those, `pnpm heavy`-wrapped               | 9        |
| …of those, other unprobeable commands         | 6        |
| v1 heavy-wrapped markers exiting at line 717  | 16       |

Reproduced by `node --import tsx probe/population.mts`, which aborts on a short read. Its derivation
totals, QUOTED rather than transcribed:

```
-- by derivation (what the collection arm does with it) --
  none: 15
  probe: 147
  v1-no-state: 317
```

The quoting is deliberate and it is this arc's most expensive lesson. Four times a count here was
reported from a subset of an instrument's output instead of the total the instrument printed, and
after the first the instrument was right every time. A number that has been retyped has left the
instrument's custody, so the printed line is what appears in this document.

**Fifteen is the repair's reach**, and the correction cuts FOR this change rather than against it.
Fifteen is larger than nine: the repair covers MORE than the motivation that produced it. The
`pnpm heavy` blind spot is what made the hole rule-mandated, but the branch was never keyed on the
wrapper, so every unprobeable v2 command had been falling through it all along. Two separate
overclaims were corrected to get here, and both are recorded in §5.4 rather than quietly fixed.

The 16 v1 heavy-wrapped markers are NOT in reach, and **the reason is not the one this section
originally gave.** It said they exit at `lib/specLint/redContract.ts:742`
(`if (state === null) continue; // v1: no declared state to probe against`). Measured at
implementation, by instrumenting `collectionProbePlan` and running the CLI at each of the sixteen
lines: **all sixteen are UNOWNED, and not one of them reaches that exit.** They are dropped by
`if (!owned.has(line)) continue;`, which sits above it — none of the sixteen sits inside a
red-contract region at all.

The CONCLUSION stands and the MECHANISM was wrong, which is the more dangerous half: a documented
limit that names the wrong reason reads as having been checked, and the reviewer who trusts it stops
looking. Recorded rather than quietly corrected, because the correction is what makes the next
paragraph's claim about AC-4 honest.

That exit was at 717 when this section was written and the `none` drop it preceded was at 721; the
exit moved and the drop is gone, for the reason the plan's §0 records.

The reach is 15 rather than 9 because the drop is keyed on `derived.kind`, not on the wrapper. Any v2
command `VITEST_SHAPE` does not match at the anchor lands there. Nine are `pnpm heavy`-wrapped; the
other six are ordinary unprobeable commands, enumerated so the set is closed rather than described:

| marker                                                          | command shape                 |
| --------------------------------------------------------------- | ----------------------------- |
| `docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md:128` | `pnpm exec tsx single-mutant.ts …` |
| `docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md:169` | `pnpm exec tsx single-mutant.ts …` |
| `docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md:188` | `pnpm exec tsx single-mutant.ts …` |
| `docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md:206` | `pnpm exec tsx single-mutant.ts …` |
| `docs/superpowers/plans/2026-08-17-red-verdict-capability.md:135`       | `sh -c "grep -q …"` (`red-state=live`) |
| `docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md:713`     | `pnpm spec:lint <doc>`         |

Every one of the six is genuinely unprobeable: a mutation-checker script, a grep, and the linter
itself. None is a vitest command the shape fails to recognize, so the advisory is truthful for all
fifteen rather than merely conservative for nine of them.

### 1.2 What the CLI emits at those fifteen lines TODAY

§1.1 says which markers reach the drop. This asks the question the acceptance criteria actually
depend on: what does the shipped CLI emit at those lines right now, at the CLI boundary, with
`--exec-red` active. Reproduced by `node --import tsx probe/reach.mts`, which lists the fifteen by
name rather than re-deriving them, so a drift between this design's list and the corpus surfaces as a
changed result instead of being absorbed by a fresh derivation.

| result at the marker's line       | count  |
| --------------------------------- | ------ |
| **SILENT** (no finding at all)     | **12** |
| already carrying a hard finding    | **3**  |

The three that already carry one:

| marker                                                                 | existing finding        |
| ---------------------------------------------------------------------- | ----------------------- |
| `docs/superpowers/plans/2026-08-16-mutation-gate-sharding.md:1237`      | `RED_TARGET_INVALID`    |
| `docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md:235`   | `RED_TARGET_INVALID`    |
| `docs/superpowers/plans/2026-08-17-red-verdict-capability.md:135`       | `RED_ALREADY_GREEN`     |

**Two consequences, and the second is a design decision this spec has to make rather than leave to
the implementer.**

The two `RED_TARGET_INVALID` lines are unrelated: a different arm, a stale `red-target=` citation,
untouched here. They matter only because an acceptance criterion demanding that the finding list at
such a line become exactly one advisory would be false at three of the fifteen. AC-4 asserts the advisory
is **added**, not that it is alone.

The `RED_ALREADY_GREEN` line is the live `sh -c` grep, and it sits on the exact hazard
`synthesizeCollectionFindings` warns about in its own comment, which says of a red that exited 0 that
it already has its own finding from `synthesizeExecFindings`, and that consulting a probe here would
mint a second verdict `--exec-red` never earned.
**The advisory is still added there, and the comment does not forbid it.**
What that gate protects against is reading a PROBE RESULT to judge a live red. No probe runs for a
declined derivation, so there is no result to read and no verdict to mint. The advisory says only that
collection capability was never checked, which is true independently of the exit code. The shipped
`skipped` branch already behaves exactly this way for live entries, emitting before the live gate, so
this is existing behavior extended to one more decline reason rather than a new position.

### 1.3 The failure-shape table

Every shape built as a real vitest fixture, run, and read. **Exit code is 1 in all of them**, which is
why exit code discriminates nothing.

| # | shape                                          | cases | rendered                                          |
| - | ---------------------------------------------- | ----- | ------------------------------------------------- |
| A | missing named **export**, read as a value      | 1 failed | `AssertionError: expected undefined to be N`   |
| B | missing/private **symbol**, called             | 1 failed | `TypeError: privateFn is not a function`       |
| C | missing **module**                             | none  | `Error: Cannot find module` + `Tests  no tests`   |
| D | genuine assertion failure (**control**)        | 1 failed | `AssertionError: expected 1 to be N`           |
| E | test file does not exist                       | none  | `No test files found` — **and no summary line**   |
| F | namespace-import form (**the ratified repair**)| 1 failed | `AssertionError: expected undefined to be N`   |
| G | syntax / transform error                       | none  | `Error: Transform failed … [PARSE_ERROR]`         |
| H | file with zero `it()` cases                    | none  | `Error: No test found in suite <path>`            |
| P | **module-scope `premise()` failure**           | none  | `(0 test)` + `Error: premise not met: …`          |

**Shape P is the one that killed the design.** It is an HONEST red — an assertion ran and failed —
that executes zero cases. §5.2 has the consequence.

---

## 2. What ships: the unprobeable-command silent drop

**The code in this section is the PRE-CHANGE state**, quoted because it is the defect this spec
exists to describe. Neither the member nor the branch survives the repair, for the reason recorded at
the end of the section.

`deriveCollectionProbe` returned `{ kind: "none" }` for any command that is not vitest-shaped
(`VITEST_SHAPE`, `lib/specLint/redContract.ts:580`), and `collectionProbePlan` then dropped the entry
entirely:

```
if (derived.kind === "none") continue;
```

No FAIL, no advisory, no plan entry. `VITEST_SHAPE` cannot match a `pnpm heavy`-prefixed command, and
**AGENTS.md mandates `pnpm heavy` for every heavy phase**, so the arm is structurally blind to exactly
the class the repo requires wrapping. A silent hole with a rule pointing into it. The shape's own
comment already names this branch as forbidden: "That is the silent branch §1.1 item 9 forbids."

**The repair, and it adds no mechanism.** `deriveCollectionProbe` already has a shipped decline path.
A `{ kind: "skipped" }` derivation carries a reason and a detail, `collectionProbePlan` records it as
an entry, and `synthesizeCollectionFindings` emits `RED_PROBE_UNVERIFIED` for it. The `none` branch is
the one derivation that returns without a reason and is therefore dropped. So `none` gains a third
`skipped` reason (`"not-vitest-shaped"`) and rides the existing path: one union member, one detail
string, no new finding code, no new predicate, no new severity decision.

**And the reasonless member GOES, rather than being left declared and unproduced.** Once the only
`return { kind: "none" }` becomes a decline with a reason, both that union member and the
`continue` above are unreachable. A statement-removal mutant over an unreachable `continue` changes
no behaviour and survives, which would owe an eighth `equivalent` row and move
`tests/mutation/source/expectedLedgerKinds.ts:137` off `{ equivalent: 7 }` — the value the plan's
Task 2 pins UNCHANGED. So the subtractive form is not a preference here; the acceptance criterion
selects it. The type is left saying something true of the shipped module: every derivation carries
either a probe or a reason there is none.

**The alternative was NARROWER in reach and WIDER in mechanism, and is declined.** Restricting the
advisory to the nine `pnpm heavy`-wrapped markers requires teaching the module to recognize that
wrapper. This surface's entire defect history is recognizer growth. Adding a predicate to shrink a
reach is the wrong direction here, and the reach it would buy is not more correct: the advisory is
true of all fifteen. Reviving the narrowed form needs a probe showing a false advisory among the six,
which §1.1 enumerates precisely so that probe is cheap.

**Reachability, stated because round 2 killed a sibling repair for lacking it.** This path is reached
only under `--exec-red`: `lib/specLint/run.ts:152` calls `synthesizeCollectionFindings` only when
probes are non-null, and the adapter builds them only when the flag is active. Any acceptance
criterion here therefore runs the CLI **with the flag**, or it passes while proving nothing.

**Severity: ADVISORY, and not as a compromise.** The arm cannot know whether an unprobeable command
would have collected anything; the honest report is that its capability is unverified. A hard code
here would assert something unmeasured — the direction §3 forbids.

---

## 3. Consequence bound, domain, fence

**Consequence bound.** The acceptance posture, stated as one sentence:

**Every `red=` the arm examines is correct or signaled, never silently wrong.**

On the LIVE tracked spec+plan corpus the arm draws **ZERO false hard findings** — trivially, because
this change adds **no hard code at all**. The two forbidden directions, named so neither is traded
for the other: **false certification** (a red accepted as observed when nothing was) and **wrong
attribution** (a finding against a red that is honest). A conservative over-report is permitted only
through the advisory channel.

**`PROBE DOMAIN:`** `git ls-files 'docs/superpowers/specs' 'docs/superpowers/plans'`, `.md` only —
whatever that command returns at the time, narrowed for this change to the **fifteen** v2 markers
§1.1 enumerates, plus the two `fix/mutation-browser-child-lifetime` plan-round incidents. A probe
outside the domain, or more than one ordinary edit from an input in it, files to §6.

**Threat fence.** Ordinary authoring mistakes by a contributor writing a task's red. Adversarial
obfuscation is out of scope and files to §6.

**The closed criterion, so it outlives the brief that carried it.** Three statements, none a matter
of opinion, all machine-checked by `probe/reach.mts` (committed):

1. Each of the fifteen v2 markers §1.1 names GAINS `RED_PROBE_UNVERIFIED`.
2. The sixteen v1 heavy-wrapped markers §1.1 names do not. They are UNOWNED and never reach the v1
   exit, so what this half of the oracle pins is that those lines stay SILENT — not that the v1 exit
   holds. The v1 exit is pinned by the fixture instead, and §4 says which.
3. No hard finding is added, asserted over the real population rather than over fixtures.

**Score.** `redContract` is already enrolled. `pnpm mutation:guards` runs before the first
`--stage diff` dispatch, and its seven `equivalent` rows are re-derived against this arc's source
change rather than inherited.

---

## 4. Acceptance criteria

| AC   | claim                                                                              | proved by |
| ---- | ---------------------------------------------------------------------------------- | --------- |
| AC-1 | a `pnpm heavy`-wrapped v2 marker draws `RED_PROBE_UNVERIFIED` instead of silence    | fixture plan whose `red=` is heavy-wrapped, run through the CLI **under `--exec-red`**; asserts the code by name |
| AC-2 | a marker the arm CAN probe is unaffected                                            | the existing `exec-genuine-red.md` and `exec-collects-nothing.md` fixtures re-run unchanged, verdicts identical |
| AC-3 | the change adds **no hard finding**, over the real population rather than fixtures  | the probe runs the shipped `collectionProbePlan` + `synthesizeCollectionFindings` across the whole tracked corpus and asserts that EVERY finding at a `none`-derived line has severity `advisory`; separately, the count of `fail(` construction sites in `lib/specLint/redContract.ts` is unchanged at 11, derived by `grep -c` rather than stated |
| AC-4 | the **fifteen** v2 markers each GAIN the advisory, and the **sixteen** v1 markers do not | `probe/reach.mts` holds BOTH named sets, all thirty-one lines, and ASSERTS rather than prints: `EXPECT_ADVISORY=1` demands the advisory at every v2 line and its absence at every v1 line, and any difference exits non-zero. The three v2 lines already holding a hard finding must hold it STILL, alongside the advisory (§1.2). A named line that stops holding a task marker fails as `MARKER_DRIFT` instead of quietly reading as silent |
| AC-5 | §1.1 and §1.2 are both reproducible **as dated records**                            | `probe/population.mts` and `probe/reach.mts`, both committed. Run them as `node --import tsx <probe>`: `pnpm tsx` needs an IPC socket a review sandbox may deny, and `reach.mts` uses the same invocation for its CHILD process, since using `pnpm exec tsx` there recreated the denial the outer command avoided. `reach.mts` runs the CLI once per document and takes roughly three minutes; its structural checks report BEFORE that loop, so a drift or reconciliation fault fails in seconds |

**AC-4 is the load-bearing one, and the two halves of it carry DIFFERENT weight than this section
first claimed.** It is the criterion that fails under an implementation that repaired the drop by
moving the v1 exit as well, a wider change that looks like a more thorough fix.

**But the corpus oracle cannot see that change, and the FIXTURE is what catches it.** Proven by
perturbation: moving the v1 exit leaves `probe/reach.mts` reporting OK on all sixteen v1 lines,
because those lines are unowned and never reach the exit. The same perturbation reds exactly one
case, the heavy-wrapped v1 FIXTURE, which is owned and carries `redState=null` and is therefore
dropped by that exit and by nothing else. The corpus has no owned v1 heavy-wrapped marker to pin it
with, so no oracle over the corpus could ever have done this job.

**It became load-bearing at round 4 and was not before.** The first version of the oracle listed only
the fifteen and PRINTED a table, so moving the v1 exit was invisible, narrowing to nine still exited
zero, and its own reconciliation compared two tallies incremented in the same loop and therefore
could not fail. Both named sets are now present and every difference exits non-zero. The three
mutations that prove it: demanding the post-change state today fails on all fifteen v2 lines, moving
one row's line by one fails as `MARKER_DRIFT`, and deleting one v1 row fails the reconciliation.

**AC-4 asserts a gain, not an equality**, because §1.2 measured three of the fifteen already carrying
a hard finding from an unrelated arm. A criterion written as "the line now holds exactly one advisory"
would be false at those three and would push an implementer toward suppressing a finding that has
nothing to do with this change.

**AC-3 deliberately does not range over fixtures.** A fixture corpus cannot exclude a hard branch on a
command shape the fixtures never contain, which is the objection that produced this criterion. Running
the shipped functions over the real 1153-file population closes that: the population is where the
untested shapes actually live.

---

## 5. Documented limits: five measured refutations

**5.1 The row's premise about loader death is FALSE.** The row and the incident's round-1 finding both
state that an unresolved import fails before any assertion runs. Under this repo's Vite SSR
transform a missing **named export** binds `undefined`, the case **runs**, and the failure is an
ordinary `AssertionError` (shape A). Only a missing **module** dies at the loader (shape C).

**5.2 Zero executed cases does NOT imply that no assertion ran — in both directions, and this is what
retired the arm.** The repo had already measured both, one spec over
(`docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md` §2.7 and §2.9, executable at
`tests/specLint/fixtureCli.test.ts:127`):

- A module-scope `premise()` throws during collection, so vitest reports **zero cases while an
  assertion ran and failed** (shape P). Hard-failing that is a false finding against an honest red,
  and §2.9 names a LIVE corpus instance at
  `docs/superpowers/plans/2026-08-04-guard-premise-reachability.md:1174`.
- Conversely a `beforeEach` throw yields **failed test entries whose bodies never executed**, so a
  count of at least one executed case does not imply an assertion was observed either.

Measured here as well: shape P renders `(0 test)` with its premise error, and shape C renders
`Tests  no tests` with a module error. **No separation was established between them**, and none is
claimed — the two shapes were not shown to be mechanically distinguishable, which is precisely why
the observable does not ship.

**5.3 The row's SECOND blind spot is not a live defect.** It names
`synthesizeCollectionFindings`'s `probes === null` early return as a silent drop; that is true of the
function in isolation and false of the pipeline. `lib/specLint/run.ts:152` gates the call, the adapter
always builds a non-null `ProbeResults` under `--exec-red` even with zero probes, and the only
production `runLint` caller is `scripts/spec-lint.ts:761`. The neighbouring per-entry silence is
deliberate: `probesToSpawn` (`redContract.ts:930`) skips a LIVE entry whose red did not authorize a
probe, because such a red already carries its own `synthesizeExecFindings` finding.

**5.4 The reach was reported as 25, then 10, then 9, and it is 15.** Only the last was derived
correctly, and the sequence is recorded rather than tidied because both errors have the same shape:
reading a subset as the total.

The first three came from counting `pnpm heavy`-wrapped markers by eye. Deriving them mechanically
gave 9, because 16 of the 25 are v1 and exit at line 717 before the drop. That correction was right
about the v1 exit and wrong about the reach, because it answered how many HEAVY-WRAPPED markers reach
the drop when the drop is not keyed on the wrapper at all. The population probe printed `none: 15`
in its derivation totals; the heavy-wrapped subset was read instead. The repair's reach is every v2
marker reaching the branch, which is 15.

The generalizable lesson, since this arc paid for it twice: when a change sits on a branch, its reach
is everything that arrives at that branch, not the subset that motivated the change.

**5.5 Non-vitest commands still draw no COLLECTION verdict, only a declaration that none was
reached.** The advisory says the arm could not verify the command's collection capability. It does not
say the command is wrong, and no criterion here claims otherwise. Closing that gap needs a per-runner
summary grammar, the growth this surface has already paid twenty diff rounds for, and it is out of
scope in both directions.

---

## 6. The retirement, as a ratified scope decision

The reason-classifying observable is retired, and the reasoning is recorded because a later reader
will otherwise re-propose it:

- **It cannot be hard.** §5.2's shape P is an honest red with zero executed cases.
- **Advisory-only, its live population is TWO markers** (§1.1), which is speculative design by the
  round-economy definition.
- **Keeping it means owning a grammar.** `VITEST_SHAPE` admits `--reporter=json`, under which the
  default summary line is absent entirely, so the arm would owe a specified branch for the
  no-readable-summary case, a parsing surface on the file with the worst round history in the repo.
- **Retiring it makes those questions UNREPRESENTABLE rather than answered**, which is the narrowing
  direction this repo's repair rule prescribes.

Re-proposing it needs a probe that defeats §5.2 on the sibling spec's own executable cases.

---

## 7. Self-application

This arm runs on this arc's own plan, and `pnpm spec:lint` is run against the plan before every
dispatch with the result reported. A plan whose reds fail the arm being built is the mechanism
working: the reds get fixed, the arm does not get weakened.

It already fired on this spec repeatedly, and every repair went to the spec: a malformed citation
committed twice, the second time inside the sentence describing the first; a missing resolved-scope
section; a line-number citation re-pointed to a symbol; and `COPY_UNPAIRED_QUOTE` defects
from quoted phrases split across a line break.

Current standing is **produced by the command, not typed here**:

```
pnpm exec tsx scripts/spec-lint.ts --json docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md
```

Round 4 found this section describing a standing it no longer had, naming one code while omitting
fourteen live findings. The repair names the surviving CLASSES and leaves the counting to the command
above. A count written here invalidates itself: adding this very paragraph moved the
`NUMERIC_NOUN_MISMATCH` total, which is how the first version went stale.

**`NUMERIC_NOUN_MISMATCH`,** over nouns this document uses for genuinely different quantities,
plus artifacts of section references where the arm reads the digits of a `§` reference as a number
against the following noun. These STAND rather than being reworded. Usefulness is not the criterion,
correct attribution is, and rewording out of a matcher is silencing rather than answering.

**`CITATION_SYMBOL_ABSENT`,** at the §1.2 table rows citing
`2026-08-16-mutation-gate-sharding.md:1237` and `2026-08-16-server-action-origin-sweep.md:235`. Both
cited lines hold a task marker, which is an HTML comment carrying no identifier the citation arm can
match. The citation is correct and the arm is right that it cannot verify it. Also STANDS, for the
same reason.

**`COPY_UNPAIRED_QUOTE` was REPAIRED, not described**, at every occurrence. Every one was a quoted phrase broken
across a line by a reformat. That is the fourth appearance of this class on this document, and the
third time it landed inside a sentence describing an earlier instance, so the repair this time was to
stop quoting short phrases inline where a reformat can split them.

---

## 8. Disposition: the spec stage closed by RULING, not by an APPROVE verdict

Four counted rounds, twelve findings, **none refuted**. No round returned APPROVE. The orchestrator
closed the stage DISPOSITIONED-not-CONVERGED at the cap, and the reasoning of record is a
classification rather than a rate: the finding count did not decay (3, 4, 2, 3), but the last three
rounds found defects in this document's DESCRIPTION of a repair whose MECHANISM has been stable since
round 2, and round 4 explicitly confirmed all four design claims it was pointed at.

**Three repairs ship without a review round having read them**, recorded here so nobody mistakes the
close for coverage:

| repair | what verifies it instead |
| ------ | ------------------------ |
| the reach oracle converted from printer to asserter, both named sets, two modes, `MARKER_DRIFT` | three mutations that kill it (§4), which is the convergence criterion this repo already uses for a guard surface |
| the twelve `COPY_UNPAIRED_QUOTE` repairs and §7's rewrite | `spec:lint` itself, re-run and reported in §7 |
| §1.1's verbatim instrument quoting and the closed criterion moved into §3 | additive, and neither changes a claim a round examined |

The first is the one that matters, and the argument for accepting it without a fifth round is that a
guard's soundness is settled by mutation, not by opinion. Each residue TYPE has its terminal verifier:
the one judgment in the document got its read at round 4, and the instrument that remained is a
fact-instrument.

---

## 9. Review record: what each round could and could not check

**Round 1 — NEEDS-ATTENTION, 3 findings, all real, all accepted.** Head `712f9d5678`. An AC that never
exercised the arm; a repair proved unreachable (now §5.3); a file count already stale.

**Round 2 — BLOCKING, 4 findings, all real, all accepted.** Head `30ecf0ead2`. The blocking one
refuted the observable's central premise from the repo's own prior measurements (§5.2) and retired
the arm. The others: an unspecified `--reporter=json` branch, an AC-3 whose sentinel fixture is a
`printf` command rather than a vitest-shaped one so it never exercised the path it claimed, and the
reach overclaim (§5.4). Three of the four are the same class — **a criterion that does not exercise
the thing it names** — and retiring the observable removes the class rather than repairing three
instances.

**Round 3 - BLOCKING, 2 findings, both real, both accepted.** Head `65e11414d7`. The blocking one
corrected the reach from 9 to 15 by probing task ownership, a dimension the population probe reported
but this spec had not read (§5.4). The second showed AC-3 proving less than it claimed: an
emitted-code set over fixtures cannot exclude a hard branch on a command shape the fixtures never
contain, and the six newly-found markers were exactly such shapes. AC-3 now ranges over the real
population instead.

Worth recording: the reviewer reached the correct number by crossing marker ownership with derivation
kind. The same crossing was available in this repo's own probe output, printed two lines above the
block that was read. The defect was in the reading, not the instrument.

**Every round was bounded by sandbox capability and said so** rather than reporting clean runs: the
tsx IPC socket was denied and Vitest could not create its temp directory, so both verdicts are static
plus read-only probing, not executable verification. Recorded because a verdict token does not carry
its own scope.
