# Plan — the mutation harness reports what it measured

Successor to `2026-09-01-mutation-harness-main-schedule.md` (PR #966), which repaired the budget
breach and the parser ledger and proved three peers out of its scope. No sibling spec; the arc
brief is untracked, and everything it asserted has been re-probed below rather than carried over.

impeccable-gate: N/A — no UI surface

## The done condition is external

The scheduled `mutation-harness` run on `main`, green, with zero known-red legs. Not a property of
this diff. Each repair below is a step toward that number and is stated with what it is worth.

## What is red, and what is a timer

Read from the jobs API on 2026-09-01, after #966 merged at 08:00:19 CDT.

| item | state | evidence |
| --- | --- | --- |
| B — `source-shards (2)` AC-3 | RED on the last completed nightly | run `33404224554`, job `99527677140` |
| D — `ledgerGit` accepted-gap row | stale under `workflow_dispatch`, valid under `schedule` | the row's own measurement, 2026-08-24 |
| E — leg balance | green tonight, 293 s of headroom | anchor's second documented limit |
| citation — heavy-phase rule | stale line number | #967 item 11 |

### B — the failing leg, and it is not what the message says

```
gh api repos/edweiss412/FX-Webpage-Template/check-runs/99527677140/annotations
```

```
failure tests/mutation/source/surfaceCases.ts 266
AssertionError: the suite did not notice this surface's control mutant: expected +0 not to be +0
```

The surface is `describeClientValue`, named in the job log at line 1809 of
`gh api repos/.../actions/jobs/99527677140/logs`:

```
FAIL mutation tests/mutation/guardSurfaces.shard2.test.ts > source-mutation gate — describeClientValue > kills THIS surface's own control mutant, proving the overlay is live (AC-3)
```

**The overlay is live and the control row is false.** Both halves probed, in the worktree, on
`34d8d0a12`:

```
# control mutant from the registry row, run through the harness's own overlay config
MUTATION_ROOT=$PWD MUTATION_TARGET=$PWD/lib/observe/describeClientValue.ts \
MUTATION_MUTANT=<control> MUTATION_SUITE=tests/observe/describeClientValue.test.ts \
pnpm exec vitest run --config tests/mutation/source/mutantOverlay.config.ts
  ->  Test Files 1 passed (1)   Tests 60 passed (60)   exit 0

# positive control: same overlay, the return replaced with a literal
  ->  Test Files 1 failed (1)   Tests 1 failed (60)    exit 1
```

The mutant applies (`tests/mutation/source/registry.ts`'s `control.from` occurs exactly once, and AC-3's own
`broken !== source` assertion passes before the failing one). The overlay serves it. The deciding
suite simply does not distinguish it.

Why: the control drops the empty-string guard at `lib/observe/describeClientValue.ts:129`,

```ts
if (typeof v === "string" && v !== "") parts.push(v);
```

so an OBJECT carrying an empty-string `name`, `code` or `message` starts joining that empty field
into the label. `tests/observe/describeClientValue.test.ts` has no such case. Its only empty-string
row is `["an empty string", "", "(no message)"]` at :42, and a bare `""` is a primitive that
returns at :110 without ever reaching the `parts` loop. The registry comment at `tests/mutation/source/registry.ts:4345`
claims "The suite pins the exact message for that case"; it does not.

### B, second half — the exit code cannot tell three states apart

`runControl` (`tests/mutation/source/runner.ts:284`) returns the child's exit code and AC-3 asserts
it is not 0. Three distinct outcomes reach that one number, and the third was measured, not
imagined:

```
# a suite that ran and rejected the mutant
numTotalTests 60  numFailedTests 1   exit 1
# a suite that ran and did not notice
numTotalTests 60  numFailedTests 0   exit 0
# a child that ran NOTHING (suite path that matches no file)
numTotalTests  0  numFailedTests 0   exit 1
```

The third is the fail-open: **a child that never ran a test exits non-zero and AC-3 reads it as
"the suite noticed"**, so a dead overlay, a mistyped `suitePaths` entry, a collection failure or an
OOM all certify liveness the run never earned. The second is the misdiagnosis: exit 0 is reported
as "the suite did not notice", which reads as "the overlay is dead" and sent the last two nights of
triage at the wrong surface.

### D — the accepted-gap row's own falsifier, in order

`tests/mutation/source/registry.ts` `ledgerGit`, row `logical-connector:259:20:&&>||`, kind
`accepted-gap`, ref `BL-LEDGERGIT-FILEOIDS-AMBIENT-REF-VERDICT`. Its premise is the workflow event:
`fileOids` runs once per `refs/remotes/origin/*` ref, `ledgerClaimsCheck.test.ts:570` is the only
ambient reader, and a `schedule` checkout carries no such ref while a `workflow_dispatch` one does.
The row states its own falsifier verbatim: "give any case a constructed repository carrying one
`refs/remotes/origin/*` ref and drive `resolveClaims` through it. One call is enough, and the
mutant is then killable in every environment, at which point this row is wrong and must be deleted
rather than re-reasoned."

**The order is load-bearing and the plan states it because the wrong order reds the nightly.**
Deleting the row first leaves an unaccepted survivor on a `schedule` run, which fails the gate —
the charter inverted. The falsifier lands first, the row goes second.

The same premise is independently visible in the cost table below: `ledgerGit` and
`ledgerClaimsCore` are the two surfaces whose measured cost under `workflow_dispatch` is 2.2x and
2.3x their declared rate, and they are the only two. That is one mechanism showing up in two places.

### E — the balance gap is not a balance problem

The anchor's second documented limit
(`scripts/probes/2026-09-01-mutation-shard-figures-anchor.ts:35-57`) records that the model expects
every leg within 235 s and run `33501574343` landed them within 1042 s, the binding leg at 3307 s
against a predicted 2695 s. This plan re-derived that from the run's own artifacts — ten
`mutation-records-source-shards-*` and ten `elapsed-source-shards-*` — and the elapsed table
reproduces the anchor's exactly:

```
leg      0     1     2     3     4     5     6     7     8     9
elapsed 3236  2306  2957  2465  3307  2504  2791  2265  2785  2481
```

Three findings the anchor's limit does not carry, each of which changes the repair:

**1. Perfect balance is worth 67 seconds.** Re-running `lptAssign` on the MEASURED per-surface
weights and evaluating the result at measured cost gives legs of
`3035 2456 2450 2456 2456 2454 2451 2453 2453 2456` child seconds: a makespan of 3035 s, about
3240 s elapsed. Against the shipped partition's measured 3307 s. The spread is real and it is not
the binding term.

**2. The binding term is one surface, and no count moves it.** The floor is the heaviest single
surface, `controlOutlineResidueBoundaries` at 3035 s measured. At N = 10, 11, 12, 14 and 16 the
makespan is 3035 s in every case. `tests/mutation/source/shardPartition.ts:34-39` already names this class — "a future
over-budget leg is NOT a count problem: it is a surface that outgrew a leg".

**3. The 1.227x is one mis-priced surface.** About thirty surfaces measure within 0.05% of their
declared rate, so the rates are per-surface stable run to run. Leg 4's entire 814 s residual is
`psqlStartupScan`, declared 16462 ms/boot and measured 25952:

| surface | declared | measured | ratio | leg |
| --- | --- | --- | --- | --- |
| `psqlStartupScan` | 1350 s | 2128 s | 1.577 | 4 (binding) |
| `controlOutlineResidueBoundaries` | 2490 s | 3035 s | 1.219 | 0 |
| `controlOutlineResidueRewrites` | 1923 s | 2311 s | 1.202 | 2 |
| `ledgerClaimsCore` | 215 s | 501 s | 2.332 | 8 |
| `ledgerGit` | 267 s | 576 s | 2.157 | 7 |
| `interactionTimingScan` | 963 s | 620 s | 0.644 | 7 |
| `modal-wait-helper-scan` | 607 s | 483 s | 0.796 | 7 |

The last two rows of the 2.x group are D's mechanism, not a rate defect, and are excluded from the
recalibration for that reason.

**What N is actually a lever for.** `tests/mutation/source/shardPartition.ts:26-46` says ten is "finished as a lever"
because eleven and twelve give the same makespan. True of today's makespan, and it is the wrong
reading. Once the binding leg holds a SINGLE surface, enrolment growth does not land on it: LPT
gives that leg no company until every other leg reaches the floor. So the fuse is not
headroom-over-growth, it is **when the average leg reaches the floor**, and N buys exactly that.

Growth is derived from the anchor's own two committed points rather than retyped:
`(24616 - 22158) / 5 days = 491.6 s/day` across the whole matrix.

| N | makespan | elapsed | runway (N x floor - total) | runway days |
| --- | --- | --- | --- | --- |
| 8 | 3070 s | 3275 s | -245 s | -0.5 |
| 10 | 3035 s | 3240 s | 5825 s | 11.8 |
| 12 | 3035 s | 3240 s | 11895 s | 24.2 |
| 13 | 3035 s | 3240 s | 14930 s | 30.4 |

N = 12 is the smallest count whose runway reaches three weeks, which is the low end of the ruled
target range. It is derived, not chosen: the assertion this plan ships is one-sided
(`runwayDays(SOURCE_SHARD_COUNT) >= 21`), so a larger count is permitted and a smaller one is a red.

## What each repair is worth against the done condition

| repair | tonight's nightly | the timer |
| --- | --- | --- |
| B1 suite case | turns `source-shards (2)` green | — |
| B2 observations | no change tonight; closes the fail-open that would hide the next one | — |
| D | no change under `schedule`; removes a row that is false under `workflow_dispatch` | — |
| E1 rates | binding leg 3307 s -> ~3240 s | stops LPT packing around a 778 s under-price |
| E2 floor gate | none | makes "a surface outgrew a leg" a named red instead of a crossed budget |
| E3 N = 12 | none | runway 11.8 -> 24.2 days |
| citation | none | — |

## Meta-test inventory

CREATES: none. EXTENDS: `tests/mutation/_metaDeclaredRatesMatchAnchor.test.ts` (reads the
recalibration block; its uncovered-surface assertion moves to the two excluded ledger surfaces),
`tests/mutation/figuresAnchorReconciliation.test.ts` (the recalibration block is judged by the same
whole-anchor gate), `tests/mutation/source/shardPartition.test.ts` (the overhead-corrected makespan
assertion and the new floor and runway assertions), `tests/mutation/_metaSourceShardIntegrity.test.ts`
and `tests/mutation/_metaShardRangeTracked.test.ts` (both already derive from `SOURCE_SHARD_COUNT`
and follow it without edits; named here because the count moves under them).

No advisory-lock surface, no Supabase call boundary, no admin alert, no tile rendering. Layout and
transition tasks are N/A — no UI surface.

## Mutation enrolment

Enrolled `sourcePath`s this diff touches, from `grep -n sourcePath tests/mutation/source/registry.ts`:

| file | surface | why it is in the diff |
| --- | --- | --- |
| `lib/observe/describeClientValue.ts` | `describeClientValue` | NOT edited; its deciding suite gains a case (B1) |
| `scripts/lib/ledger-git.ts` | `ledgerGit` | NOT edited; its deciding suite gains a case, and its ledger loses a row (D) |
| `scripts/lib/ledger-claims-core.ts` | `ledgerClaimsCore` | NOT edited; shares the suite D extends |
| `lib/ci/shardBudget.ts` | `shardBudget` | edited (E2) |
| `tests/mutation/source/shardPartition.ts` | `sourceShardPartition` | edited (E2, E3) |

Every one of the five is re-scored at the shipping head under the class lock, because a suite file
in `suitePaths` moving is as much a re-score trigger as the source moving.

## Acceptance criteria

- AC-1 `describeClientValue`'s declared control is killed by its declared suite. (discharged by Task 1)
- AC-2 a control child that produces no observations is a distinct, loud verdict from one that ran and found nothing. (discharged by Task 2)
- AC-3 AC-3 in `surfaceCases.ts` cannot pass on a non-zero exit that carries no failed test. (discharged by Task 2)
- AC-4 `fileOids` is driven through a constructed `refs/remotes/origin/*` ref by a registered suite. (discharged by Task 3)
- AC-5 the `ledgerGit` accepted-gap row and its backlog entry are gone, and the kind counts follow. (discharged by Task 4)
- AC-6 every declared rate equals what the newest measurement records, or is named as excluded with its reason. (discharged by Task 5)
- AC-7 the recalibration block is judged whole, by the same gate the anchor is. (discharged by Task 5)
- AC-8 the modelled makespan is compared against the budget in the same units the budget is in. (discharged by Task 6)
- AC-9 a surface heavier than one leg is a red that names the surface. (discharged by Task 6)
- AC-10 the shard count carries at least three weeks of runway against derived growth. (discharged by Task 7)
- AC-11 the count, the shard files, the gitignore range and the workflow matrix agree. (discharged by Task 7)
- AC-12 the heavy-phase rule's four citation sites name the line the call is on. (discharged by Task 8)
- AC-13 the scheduled `mutation-harness` run on `main` is green with zero known-red legs. (RETIRED: superseded by the closeout)

## Sweeps, run at plan time

**Every enrolled `sourcePath` this diff touches**, so no surface is re-scored by accident or missed:

```
grep -n "sourcePath" tests/mutation/source/registry.ts
```

61 rows. The five in the table above are the intersection with this diff's file list; the other 56
are untouched, and none of their `suitePaths` appears in it.

**Every citation of the moved lines**, so Task 8 is a derivation rather than #967's list retyped:

```
grep -rn "share-link-flash-adversary-matrix" AGENTS.md tests/ docs/
```

Fourteen hits. Seven carry a line number and are Task 8's site list above. The other seven are
prose or path-only mentions and need no edit: `AGENTS.md:277` and the fixture also name the script
without a line, `agentsHeavyPhaseRule.test.ts:153` and `tests/docs/agentsHeavyPhaseRule.test.ts:991` pin the path-only form, and
`docs/superpowers/plans/2026-08-24-replacement-string-class-sweep.md:421`, its spec twin at `docs/superpowers/specs/2026-08-24-replacement-string-class-sweep.md:333`,
and `docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count.md:212` all cite line 876,
a different construct this arc does not touch.

**Every reader of `SOURCE_SHARD_COUNT`**, so Task 7 misses no follower:

```
grep -rn "SOURCE_SHARD_COUNT" tests/ scripts/ lib/ .github/ .gitignore
```

Every TypeScript reader derives from the constant and follows it without an edit:
`vitest-projects-partition.test.ts:264`, `_metaShardRangeTracked.test.ts:94`,
`tests/mutation/_metaSourceShardIntegrity.test.ts:78` and its four siblings, `guardSurfaces.gates.test.ts:28`,
`records.test.ts:476`, `shardPartition.test.ts` throughout, and
`scripts/mutation-shard-weight-report.ts:54`. Three sites carry the number as DATA and are in
Task 7's file list:

| site | what it holds |
| --- | --- |
| `.github/workflows/mutation-harness.yml:221` | the matrix list `[0..9]` |
| `.github/workflows/mutation-harness.yml:397` | the literal `SOURCE_SHARD_COUNT: "10"` passed to the budget job |
| `.gitignore` | the scratch range, starting one past the count |

And three carry PROSE the count invalidates, which is the half a constant-follows-constant sweep
cannot see:

| site | the claim, and why it moves |
| --- | --- |
| `.github/workflows/mutation-harness.yml:196` | "went 8 -> 10 on 2026-09-01" and the three job-count figures above it |
| `.github/workflows/mutation-harness.yml:253` | "the leg COUNT below moved 8 -> 10" |
| `.github/workflows/mutation-harness.yml:527` | the `notify` job's triage guidance: "SOURCE_SHARD_COUNT reached its floor at 10 ... 11 and 12 give the same number" |

The `notify` guidance is the one that matters. It tells whoever opens a red-nightly issue that the count is
finished as a lever, which is true of the makespan and false of the runway, and it is the sentence
this arc's finding contradicts. It is corrected in Task 7 alongside `tests/mutation/source/shardPartition.ts:26-46`,
which says the same thing.

Outputs and per-hit dispositions land in the commit for each task, since all three sweeps name
files this diff edits.

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1 — the control describeClientValue declares is actually killed

<!-- task: red=`node --import tsx scripts/probes/2026-09-01-surface-control-verdict.ts describeClientValue` red-state=authored red-target=`tests/observe/describeClientValue.test.ts:42` why=`this is the suite's only empty-string row and its value is a bare primitive, which returns at lib/observe/describeClientValue.ts:110 without ever reaching the parts loop the registry control mutates, so no case in the file distinguishes that control and the probe reports zero failed tests until the object-with-an-empty-field case exists` ac=AC-1 -->
**Files:** `tests/observe/describeClientValue.test.ts`, and a new control-verdict probe under
`scripts/probes/`.

RED: the control-verdict probe takes surface ids, builds each one's
declared control mutant, runs each declared suite under the harness's own overlay config with
`--reporter=json`, and exits non-zero unless some suite reports at least one FAILED test. It reads
the report rather than the exit code deliberately, so it stays a valid check across Task 2, which
changes what `runControl` returns. It reports zero failed tests for `describeClientValue` today,
which is the defect: the harness's own AC-3 reads that as a dead overlay.

GREEN: add cases pinning the empty-field behaviour, derived from the fixture rather than written as
literals — an object whose `code` is `""` and whose `message` is set must label as the message
alone, and an object whose only field is an empty `message` must label `(no message)`. Both are
what the shipped function does; the control mutant changes both.

The four string-presence mutants, run before the review dispatch and recorded in the commit:
(a) the empty field given a value — the case must still pass, proving it is not asserting on
emptiness alone; (b) the expected label with a suffix appended — must fail; (c) the guard present
but not live, `v !== ""` moved into a comment — must fail; (d) each of `name`, `code` and `message`
emptied in turn, so the case does not pass because one particular key is special.

### Task 2 — AC-3 asserts observations, not an exit code

<!-- task: red=`pnpm exec vitest run tests/mutation/source/runner.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:284` why=`runControl returns the child exit code and nothing else, so a child that collected zero tests exits 1 and is indistinguishable from a child that rejected the mutant; the new case drives a suite path matching no file and asserts a no-observations verdict, which cannot be produced until runControl reports test counts` ac=AC-2,AC-3 -->

**Files:** `tests/mutation/source/runner.ts`, `tests/mutation/source/runner.test.ts`,
`tests/mutation/source/surfaceCases.ts`.

RED: a case in `runner.test.ts` driving the control path at a `MUTATION_SUITE` matching no file,
asserting the verdict names it as producing no observations. Fails today because the only value the
path returns is an exit code, and that code is 1.

GREEN: `runControl` gains a JSON report per suite child (`--reporter=json --outputFile=<scratch>`,
on the control path only, so the per-mutant path's argv and cost are unchanged) and returns a
discriminated verdict:

- `noticed` — a suite reported at least one failed test.
- `ran-clean` — every suite ran at least one test and none failed.
- `no-observations` — a suite produced no readable report, or reported zero total tests.

AC-3 in `surfaceCases.ts` then asserts `noticed`, with a distinct message per other kind:
`ran-clean` says the control row is wrong or the suite lacks the case, `no-observations` says the
child never ran and names the suite. The three shapes are the measured ones quoted above, not
invented ones.

Premise: the case asserts a `no-observations` verdict against a constructed suite path, so the
condition it rests on is built by the test rather than read from the ambient environment.

### Task 3 — the ledgerGit gap's falsifier, before the row moves

<!-- task: red=`pnpm exec vitest run tests/scripts/ledgerClaimsCheck.test.ts` red-state=authored red-target=`scripts/lib/ledger-git.ts:259` why=`no case in either registered suite drives fileOids through a repository carrying a refs/remotes/origin/* ref, so the && at this line is unreachable from a zero-ref checkout and the new constructed-namespace case fails until it exists` ac=AC-4 -->

**Files:** `tests/scripts/ledgerClaimsCheck.test.ts`.

RED: a case building a repository that carries exactly one `refs/remotes/origin/*` ref and driving
`resolveClaims` through it, asserting on what `fileOids` returns for that ref. The row's own
FALSIFIER text names this construction; one call is enough.

GREEN: the case passes against the shipped function, and the `&&` at `ledger-git.ts:259` is then
killable from a zero-ref checkout.

Verification the mutant is killed, run and recorded in the commit before Task 4 touches the ledger:
apply `&&` -> `||` at that site through the overlay config and confirm the suite reds.

### Task 4 — the row goes, and the backlog entry with it

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:295` why=`this line declares ledgerGit as carrying one accepted-gap row, the row Task 4 deletes, so the parity assertion reds the moment the row leaves the registry and passes only once the declaration follows it` ac=AC-5 -->

**Files:** `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts`,
`BACKLOG.md`, `BACKLOG-archive.md`.

Delete the `logical-connector:259:20:&&>||` accepted-gap row, follow the kind counts, and archive
`BL-LEDGERGIT-FILEOIDS-AMBIENT-REF-VERDICT` with the falsifier that retired it. Not before Task 3
is green.

### Task 5 — the rates say what the newest run measured

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaDeclaredRatesMatchAnchor.test.ts tests/mutation/figuresAnchorReconciliation.test.ts` red-state=authored red-target=`scripts/probes/2026-09-01-mutation-shard-figures-input.json:59` why=`this line records psqlStartupScan at 1349908 ms from run 33404224554, and the anchor holds that run only, so once the registry declares the rates run 33501574343 measured, the declared-equals-anchor assertion reds against the old numbers and passes only once the recalibration block exists and the parity test reads it` ac=AC-6,AC-7 -->

**Files:** `scripts/probes/2026-09-01-mutation-shard-figures-input.json`,
`scripts/probes/2026-09-01-mutation-shard-figures-anchor.ts`,
`tests/mutation/_metaDeclaredRatesMatchAnchor.test.ts`, `tests/mutation/source/registry.ts`.

The anchor keeps its run-`33404224554` body: `splitSurfaceOperatorMs` prices the split against a
surface that no longer exists as one row, so regenerating it would destroy the record that
licensed the split. It gains a `recalibration` block naming run `33501574343` — `runId`,
`runHeadSha`, `dateISO`, per-leg `elapsedS` and `childMs`, `surfaceMs`, `bootsAtRun`, and
`observedPerBoot` per surface — judged by the same whole-anchor gate: contiguous legs, every
figure positive and finite, the legs' child milliseconds equal to the per-surface total, and
`observedPerBoot * bootsAtRun == surfaceMs` per surface.

`ledgerGit` and `ledgerClaimsCore` are RECORDED in the block and listed in a `rateExcluded` field
with the reason, not omitted from it: run `33501574343` is a `workflow_dispatch` run, whose
checkout carries the `refs/remotes/origin/*` refs that make `ledgerClaimsCheck.test.ts` cost 2.2x
to 2.3x what it costs under `schedule`. **Re-measure trigger:** their schedule-event rate is
measurable only from a `schedule` run at a head where Task 3 has landed, because Task 3 is what
removes the event dependence.

48 of the 61 declared rates move. The parity test's uncovered-surface list moves from the two split
halves to the two excluded ledger surfaces, which is the deliberate edit that test asks for.

### Task 6 — the floor is a named prediction, not a crossed budget

<!-- task: red=`pnpm exec vitest run tests/mutation/source/shardPartition.test.ts lib/ci/shardBudget.test.ts tests/ci/shardBudget.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.test.ts:259` why=`this assertion compares a CHILD-millisecond makespan against a budget on ELAPSED seconds, so it permits a partition whose legs exceed the budget by the per-leg overhead; the overhead-corrected case and the floor case both fail against the uncorrected comparison` ac=AC-8,AC-9 -->

**Files:** `lib/ci/shardBudget.ts`, `tests/mutation/source/shardPartition.ts`,
`tests/mutation/source/shardPartition.test.ts`, and the shardBudget deciding suite.

Two assertions, both derived from the live registry with no committed second copy of any number:

1. `makespan + legOverhead <= SHARD_BUDGET_SECONDS`. Strictly stronger than what ships, which
   compares child milliseconds against an elapsed budget and is short by the overhead.
2. `floor + legOverhead <= SHARD_BUDGET_SECONDS`, where `floor` is the heaviest single surface's
   modelled cost, with a message naming that surface and saying it outgrew a leg. This is the
   anchor's re-measure trigger mechanized: today it is the difference between a red that names the
   cause and a budget crossed months later.

`legOverhead` is the median of the recalibration block's per-leg `elapsedS - childMs/1000`, derived
in code from the block rather than typed as a literal.

### Task 7 — the shard count buys runway, and says so

<!-- task: red=`pnpm exec vitest run tests/mutation/source/shardPartition.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts tests/mutation/_metaShardRangeTracked.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:47` why=`this line declares SOURCE_SHARD_COUNT = 10, whose runway against the recalibrated registry is 11.8 days, so the runway assertion this task adds fails at ten and passes only once the count reaches twelve and the two new shard files, the workflow matrix and the gitignore range follow it` ac=AC-10,AC-11 -->

**Files:** `tests/mutation/source/shardPartition.ts`, two new shard files shard10 and shard11 under
`tests/mutation/`, `.gitignore`, `.github/workflows/mutation-harness.yml`.

`runwayDays(SOURCE_SHARD_COUNT) >= 21`, one-sided, with growth derived from the anchor's two
committed points. Twelve is the smallest count that satisfies it.

The two new shard files are the same template, byte-identical but for the literal and the filename,
which `_metaSourceShardIntegrity` already pins. The `.gitignore` scratch range starts one past the
count, and `_metaShardRangeTracked` already pins that relation — its comment records the exact
failure of raising the count without it, four required checks red on a fresh checkout while every
local run looked normal. The workflow's matrix and the three job-count figures in the
`source-shards` comment follow the count; that comment already records being left at the old count
once and caught in review.

Correct `tests/mutation/source/shardPartition.ts:26-46` to say what N levers: not the makespan, which the floor pins, but
the number of enrolments before the average leg reaches the floor.

### Task 8 — the heavy-phase rule cites the lines the calls are on

<!-- task: red=`node --import tsx scripts/probes/2026-09-01-heavy-rule-citations.ts` red-state=live why=`AGENTS.md's heavy-phase paragraph cites scripts/share-link-flash-adversary-matrix.mjs:1014 for a playwright invocation that sits at :1017 and line 1215 for a --quick guard that sits at :1218, and the probe reports both as resolving to unrelated text` ac=AC-12 -->

**Files:** `AGENTS.md`, `tests/docs/fixtures/agents-heavy-phase-rule.md`,
`tests/docs/agentsHeavyPhaseRule.test.ts`,
`docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md`,
`docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md`, and a new citation probe under
`scripts/probes/`.

#967 item 11 enumerated four sites and gave the target as line 1042. Neither survives verification
against `main` at `34d8d0a12`. The sweep below is the derivation that replaces the list.

**Both cited lines are stale, by exactly three, and #967 named only one of them:**

```
sed -n '1014p;1017p;1215p;1218p' scripts/share-link-flash-adversary-matrix.mjs
1014      );
1017      execFileSync("pnpm", ["test:e2e:share-link-flash", "--reporter=json"], {
1215        continue;
1218      const browserRows = QUICK ? [] : runBrowser();
```

The paragraph cites 1014 for the invocation, which is at 1017, and 1215 for the `--quick` guard
that suppresses it, which is at 1218. Line 1042 is `);` too — it is where the invocation sits with
#967's +25 lines applied, and #967 has not merged, so citing it against `main` would be a third
wrong number.

**Seven sites, from the sweep rather than from a list:**

| site | what it carries |
| --- | --- |
| `AGENTS.md:277` | both stale numbers, in the shipped rule |
| `tests/docs/fixtures/agents-heavy-phase-rule.md:9` | a byte-pin of that paragraph (`agentsHeavyPhaseRule.test.ts:32`, asserted at :442) |
| `tests/docs/agentsHeavyPhaseRule.test.ts:154` | the `must`-side literal |
| `tests/docs/agentsHeavyPhaseRule.test.ts:221` | the transitive-member regex |
| `tests/docs/agentsHeavyPhaseRule.test.ts:992` | the `editRule` mutant's replacement text |
| `docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md:433` | the spec's own citation |
| `docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md:14` | the plan's R10 F1 verification note |

The last two record a verification that WAS true when written. They move too: a citation is a
promise that the reader can follow it, and a record whose pointer no longer resolves records
nothing. Each keeps its original prose and gains only the corrected number.

RED: the new probe reads every line-form citation of that script out of the seven sites, resolves each against the live script, and exits non-zero naming
any whose line does not hold the construct the surrounding prose claims — the `execFileSync` of
`test:e2e:share-link-flash` for the invocation, the `QUICK ?` ternary for the `--quick` guard. It
exits non-zero today on `main`. GREEN: it exits 0.

The probe is the point. A citation repair verified by reading is the same defect one iteration
later, and this paragraph has now been repaired twice by hand.

**#967 collision, stated so it is absorbed rather than discovered:** #967 moves these lines by +25.
Whichever of the two merges second re-runs the probe after absorbing `origin/main` and follows the
new numbers. The probe is what makes that a mechanical step.
