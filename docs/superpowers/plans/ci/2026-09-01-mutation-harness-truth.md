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
| D — `ledgerGit` accepted-gap row | killable where `fileOids` runs, survives where it does not | the row's own measurement, 2026-08-24 |
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
`8710aefc7`:

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
ambient reader, and a checkout with no such ref never executes `fileOids` at all. The archived
entry measured it with one variable changed: 14 calls and a kill against the live worktree, 0 calls
and a survivor against a constructed zero-ref repo. `ledgerClaimsCheck.test.ts:572-578` records the
CI half in its own comment — "CI checks this repository out with zero `refs/remotes/origin/*`".
The row states its own falsifier verbatim: "give any case a constructed repository carrying one
`refs/remotes/origin/*` ref and drive `resolveClaims` through it. One call is enough, and the
mutant is then killable in every environment, at which point this row is wrong and must be deleted
rather than re-reasoned."

**The order is load-bearing and the plan states it because the wrong order reds the nightly.**
Deleting the row first leaves an unaccepted survivor on a `schedule` run, which fails the gate —
the charter inverted. The falsifier lands first, the row goes second.

**What Task 3 does and does not settle.** It makes the mutant killable in every environment, which
is all the row's falsifier claims and all that is needed to retire it. It does NOT make the
surface's COST environment-independent: `ledgerClaimsCheck.test.ts:570` still reads the ambient
checkout, so `fileOids` still runs a variable number of times. Those are two different properties,
and E1's exclusion below turns on the second, not the first.

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

The two 2.x rows are excluded from the recalibration, and the reason is **observed instability, not
a mechanism**. An earlier draft of this plan asserted the cause was `workflow_dispatch` carrying
`refs/remotes/origin/*` refs that a `schedule` checkout lacks, so `fileOids` executes and the suite
costs more. That claim does not survive its own arithmetic: `fileOids` executing makes the
`&&`-site mutant THROW, and a thrown mutant reds its suite at the first case under `bail: 1`, which
is CHEAPER than surviving to the end. The mechanism predicts the dispatch run is faster and it
measured 2.2x slower.

What is established is the instability itself, and that it belongs to the suite rather than to a
runner. Per modelled boot, `ledgerGit` went 2474 ms (run `33404224554`) to 5337 ms (run
`33501574343`) and `ledgerClaimsCore` 3160 to 7370. They sit on different legs, so different
runners, and the one thing they share is `tests/scripts/ledgerClaimsCheck.test.ts` — which #966 did
not touch. **A rate is a prediction of the next run's cost, and a surface observed to double
between two runs has no single rate to declare.** So these two keep their previous rate, are named
as excluded rather than dropped, and the cause is an open question with a scheduled instrument
rather than an answer this plan asserts.

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
| D | no change where `fileOids` never runs; removes a row that is false where it does | — |
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

## Red-command coverage, derived and run at plan time

Rounds 1 and 2 returned thirteen findings and nine of them were one class: **a task's `red=` claims
a verdict its command cannot observe.** Round 1 found it on Tasks 3, 6, 7 and 8; round 2 found it
again on Tasks 5, 6 and 7 — including on repairs written in response to round 1. Patching the named
instance is what let it recur, so this section is the derivation that replaces the patching.

Every file each task edits is assigned to exactly one column:

- **red-observed** — the red command reads it, and the marker's `why=` may claim it moves the verdict.
- **kept-green** — the task edits it so an EXISTING assertion keeps passing. The `why=` claims
  nothing about it; the suite that would red if the edit were missed is named, and it is in the
  task's verification list rather than its red command.

A file in neither column is the defect. Derived by walking each task's `**Files:**` list against
the suite names in its own `red=`:

| task | red-observed | kept-green (and the suite that would red) |
| --- | --- | --- |
| 1 | `tests/observe/describeClientValue.test.ts`, through the control-verdict probe | — |
| 2 | `tests/mutation/source/runner.ts`, `runner.test.ts`, `surfaceCases.ts` via `surfaceCases.test.ts` | — |
| 3 | `tests/scripts/ledgerClaimsCheck.test.ts`, through the probe's `--mutant` and `--only-case` | — |
| 4 | `registry.ts` and `expectedLedgerKinds.ts` via the two registry metas | `BACKLOG-archive.md` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts`, in the command) |
| 5 | the anchor JSON and its validator via the two anchor metas; the workflow step via `tests/ci/_metaE2eWorkflowCoverage.test.ts` | `tests/mutation/source/registry.ts` (the parity meta, in the command) |
| 6 | `lib/ci/shardBudget.ts` via `tests/ci/shardBudget.test.ts` | `tests/mutation/source/shardPartition.ts` and its suite (`shardPartition.test.ts`, in the command) |
| 7 | `shardPartition.ts`, the workflow, the gitignore range and the shard files via the four metas; `_workflowCoverageScan.ts` via `tests/ci/_metaE2eWorkflowCoverage.test.ts` | the root package.json (`tests/mutation/_metaSourceShardIntegrity.test.ts`, in the command) |
| 8 | `AGENTS.md`, the fixture, the two docs, through the citation probe | `tests/docs/agentsHeavyPhaseRule.test.ts` (itself — the fixture byte-pin at `tests/docs/agentsHeavyPhaseRule.test.ts:442`) |

Two entries above are the round-2 findings made mechanical rather than argued: Task 5's workflow
edit had NO reader in its command at all, and Task 7's `why=` named the workflow-coverage allowlist
while none of its four suites imported that module. Both now appear in a column, or they would not
appear at all.

**The walk cannot see a suite that reads a file by directory glob rather than by name** — the
workflow-coverage meta walks `.github/workflows/` — so those two cells are asserted by reading the
suite, and are marked as such here rather than left to look derived.

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

**Four mutants, run before the review dispatch and recorded in the commit with their outcomes.**
The four in the repo's rule are written for a string-PRESENCE guard; these are the equality-guard
readings of the same four, and the expected direction is stated for each because an earlier draft
of this plan had (a) backwards:

| mutant | expected | what it proves |
| --- | --- | --- |
| (a) the registry's own control applied to the source | RED | the case distinguishes the control, which is the whole point of the task |
| (b) the empty field given a value in the fixture | RED | the case reads the field's EMPTINESS, not merely its presence |
| (c) the expected label with a suffix appended | RED | the assertion is equality, not containment |
| (d) each of `name`, `code`, `message` emptied in turn | GREEN on clean source, RED under (a) | the case does not pass because one particular key is special |

(b) is the one an earlier draft got wrong by writing "must still pass". Giving the empty field a
value changes the expected label, so a case that still passed would be reading something other than
the guard.

### Task 2 — AC-3 asserts observations, not an exit code

<!-- task: red=`pnpm exec vitest run tests/mutation/source/runner.test.ts tests/mutation/source/surfaceCases.test.ts` red-state=authored red-target=`tests/mutation/source/runner.ts:284` why=`runControl returns the child exit code and nothing else, so a child that collected zero tests exits 1 and is indistinguishable from a child that rejected the mutant; the new case drives a suite path matching no file and asserts a no-observations verdict, which cannot be produced until runControl reports test counts, and surfaceCases.test.ts is in the command because AC-3's own registrar is edited in the same task` ac=AC-2,AC-3 -->

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

<!-- task: red=`node --import tsx scripts/probes/2026-09-01-surface-control-verdict.ts --mutant ledgerGit 'logical-connector:259:20:&&>||' --only-case 'a constructed origin ref'` red-state=authored red-target=`scripts/lib/ledger-git.ts:259` why=`no case in either registered suite drives fileOids through a repository carrying a refs/remotes/origin/* ref, so with the && flipped to || and the run filtered to that case name the child collects ZERO tests, which the probe reports as no-observations and exits non-zero; it exits 0 only once the constructed-namespace case exists and that case reds under the mutant` ac=AC-4 -->

**Files:** `tests/scripts/ledgerClaimsCheck.test.ts`, and the control-verdict probe from Task 1
(which gains `--mutant` and `--only-case`).

**Why the obvious RED is not available, stated because round 1 raised it.** The falsifier case
passes against the shipped function the moment it is authored — `fileOids` already returns the
mapping it asserts — so `pnpm exec vitest run tests/scripts/ledgerClaimsCheck.test.ts` is green
before and after. This is a COVERAGE task, not a defect repair, and a coverage task's honest red is
the mutant, not the suite.

**Why the mutant alone is not available either.** In this worktree the mutant is ALREADY killed,
by the ambient reader at `ledgerClaimsCheck.test.ts:570`, because a developer's checkout carries
`refs/remotes/origin/*`. The difference the task makes is visible only where those refs are absent.

**So the red is the mutant under a case filter, and Task 2 is what makes it readable.** The probe
applies the named mutant, runs the suite filtered by `-t` to the new case's name, and reads the
JSON report rather than the exit code. Today that filter matches nothing: the child collects zero
tests and exits 0, which is the `-t`-matches-nothing trap the repo already records, and reading
the report is exactly what separates it from a pass. The probe reports `no-observations` and exits
non-zero. Once the case exists it collects one test, that test reds under the mutant, and the probe
exits 0. Same command, red then green, and it is the mutant that moves rather than the fixture.

GREEN: a case built with the suite's existing `throwawayRepo()` and `atRepo()` helpers
(`tests/scripts/ledgerClaimsCheck.test.ts:777` and `tests/scripts/ledgerClaimsCheck.test.ts:797`), carrying exactly one
`refs/remotes/origin/*` ref, driving `resolveClaims` through it and asserting what `fileOids`
returns for that ref. `atRepo` sets `LEDGER_GIT_ROOT`, which `gitRoot()` honours under vitest
(`scripts/lib/ledger-git.ts:27-30`), so the case constructs its own environment and cannot read
differently on a full clone than in CI's zero-ref checkout.

Premise: the case asserts that its constructed repository actually carries the ref before
asserting on `fileOids`, so a construction that silently produced none cannot pass by returning an
empty map from a function that never ran.

### Task 4 — the row goes, and the backlog entry with it

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts tests/mutation/_metaLedgerKindsDeclarationParity.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:295` why=`this line declares ledgerGit as carrying one accepted-gap row, the row Task 4 deletes, so the parity assertion reds the moment the row leaves the registry and passes only once the declaration follows it` ac=AC-5 -->

**Files:** `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts`,
`BACKLOG-archive.md`.

Delete the `logical-connector:259:20:&&>||` accepted-gap row and follow the kind counts at
`tests/mutation/source/expectedLedgerKinds.ts:295`. Not before Task 3 is green.

`BL-LEDGERGIT-FILEOIDS-AMBIENT-REF-VERDICT` is ALREADY in `BACKLOG-archive.md:12419`,
carrying `**Status:** OPEN` — an open row living in the archive file, which is the state on the
merge base and not something this arc created. `grep -c` on `BACKLOG.md` returns 0. So there is no
move to perform: the edit is `**Status:** RESOLVED` plus the falsifier that retired it, in place.
No row is created, and none is deleted.

### Task 5 — the rates say what the newest run measured

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaDeclaredRatesMatchAnchor.test.ts tests/mutation/figuresAnchorReconciliation.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`scripts/probes/2026-09-01-mutation-shard-figures-input.json:59` why=`this line records psqlStartupScan at 1349908 ms from run 33404224554 and the file holds that run only, so once the recalibration block lands and the parity test is pointed at it, 48 surfaces declare a rate the block disagrees with and the assertion reds naming them; the same command also carries the workflow-coverage suite, which reds on the ref-count instrument step this task adds until its allowlist row exists` ac=AC-6,AC-7 -->

**Files:** `scripts/probes/2026-09-01-mutation-shard-figures-input.json`,
`scripts/probes/2026-09-01-mutation-shard-figures-anchor.ts`,
`tests/mutation/_metaDeclaredRatesMatchAnchor.test.ts`, `tests/mutation/source/registry.ts`,
`.github/workflows/mutation-harness.yml`, `tests/ci/_workflowCoverageScan.ts`.

**The order inside this task, because the obvious one has no honest red.** Pointing the parity test
at a block that does not exist fails to parse, which is not the marker's reason. So: (1) the
`recalibration` block lands as DATA, with no test reading it yet; (2) the parity test is pointed at
it, and 48 surfaces now declare a rate the block disagrees with — the assertion reds, naming them,
which is exactly the marker's `why=`; (3) the registry's 48 rates follow, and it greens. Same
command, red for the stated reason, green on the same command.

The anchor keeps its run-`33404224554` body: `splitSurfaceOperatorMs` prices the split against a
surface that no longer exists as one row, so regenerating it would destroy the record that
licensed the split. It gains a `recalibration` block naming run `33501574343` — `runId`,
`runHeadSha`, `dateISO`, per-leg `elapsedS` and `childMs`, `surfaceMs`, `bootsAtRun`, and
`observedPerBoot` per surface — judged by the same whole-anchor gate: contiguous legs, every
figure positive and finite, and the legs' child milliseconds equal to the per-surface total.

**The rate relation is `observedPerBoot === Math.round(surfaceMs / bootsAtRun)`, not an exact
product.** `observedPerBoot` is an integer, `surfaceMs` is a measurement, and exact multiplication
rejects ordinary rounding: probing the committed anchor's own 60 rows finds 56 where
`observedPerBoot * bootsAtRun !== surfaceMs` — `reportDraftStore` at product 34326 against 34321,
`redContract` at 683800 against 683779. The relation the recalibration block is judged by is the
one the anchor already satisfies.

`ledgerGit` and `ledgerClaimsCore` are RECORDED in the block and listed in a `rateExcluded` field
with the reason, not omitted from it. **The reason is measured instability, not a mechanism** — see
the E section above for why the ambient-ref explanation fails its own arithmetic. Per modelled boot
they went 2474 to 5337 ms and 3160 to 7370 ms between the two runs, they sit on different legs, and
the one thing they share is a suite neither run changed.

**Re-measure trigger, and the instrument that makes it reachable.** The archived entry names the
probe that settles the cause and records that it has never run: print `git for-each-ref
refs/remotes/origin` under each trigger type. This task adds that one line to the `source-shards`
job's setup, so every future run of either kind records its own ambient ref count in its log. The
two rates are re-derivable, and this exclusion retired, from any two runs of the SAME trigger type
whose ref counts agree. That is a condition a future run satisfies on its own; "after Task 3 lands"
is not, because Task 3 leaves the ambient reader at `ledgerClaimsCheck.test.ts:570` in place.

48 of the 61 declared rates move. The parity test's uncovered-surface list moves from the two split
halves to the two excluded ledger surfaces, which is the deliberate edit that test asks for.

### Task 6 — the floor is a named prediction, not a crossed budget

<!-- task: red=`pnpm exec vitest run tests/ci/shardBudget.test.ts tests/mutation/source/shardPartition.test.ts` red-state=authored red-target=`lib/ci/shardBudget.ts:69` why=`checkBudget returns a BudgetVerdict computed from recorded elapsed values alone, so a call carrying a modelled makespan of 3500 s and a 205 s per-leg overhead against a 3600 s budget reports no makespan problem at all; the new case asserts that problem is present and fails on the verdict's CONTENT, not on an unresolved import` ac=AC-8,AC-9 -->

**Files:** `lib/ci/shardBudget.ts`, `tests/ci/shardBudget.test.ts`,
`tests/mutation/source/shardPartition.ts`, `tests/mutation/source/shardPartition.test.ts`.

**Round 1 established that the two assertions are green before implementation** — with the live
registry, `makespan + overhead` and `floor + overhead` are both 3240 s against a 3600 s budget, so
a task that only added them would ship a guard that passes the moment it is written. That is
rejected statically by this repo's own rule, and rightly.

**Round 2 then rejected the first repair, and was right about that too.** Putting the decision in a
new `legFitProblems` export makes the RED an unresolved import, which `docs/agents/writing-plans.md`
rejects: no constructed case executes, so nothing is observed failing.

So the decision goes into `checkBudget`, which already exists and is already imported by the suite,
as a fourth optional argument. The RED is then an assertion on the verdict's CONTENT:

```ts
// today: no makespan problem is reported, because checkBudget has no modelled input at all
const v = checkBudget(records, legs, 3600, {
  makespanSeconds: 3500,
  floorSeconds: 1000,
  floorSurface: "synthetic",
  overheadSeconds: 205,
});
expect(v.failures.filter((f) => /makespan/.test(f))).toHaveLength(1);
```

The extra argument is ignored by the shipped three-parameter function, so the call runs, the
verdict comes back without the problem, and the assertion fails on what it contains. `pnpm
typecheck` also reds on the arity until the parameter lands, which is the ordinary TDD
intermediate state and not the red this marker names.

The constructed cases, each naming the failure it catches:

| input | expected | the defect it catches |
| --- | --- | --- |
| makespan 3500, floor 1000, overhead 205, budget 3600 | one problem, naming the makespan | the shipped comparison passes this: 3500 <= 3600 in child seconds, while the leg costs 3705 |
| makespan 3390, floor 3390, overhead 205, budget 3600 | one problem, naming the floor SURFACE | a surface heavier than a leg, which no shard count repairs |
| makespan 3395, floor 3395, overhead 205, budget 3600 | reports the surface NAME, not just a number | a message that says "over budget" sends the reader to the count, which is the wrong repair |
| makespan 3000, floor 1000, overhead 205, budget 3600 | no problems | a guard that reds on correct input is broken rather than stricter |
| overhead 0 | the makespan case above reports NOTHING | the overhead is load-bearing and not decoration |

The first row is the defect in one line: it is the case the shipped
`tests/mutation/source/shardPartition.test.ts:259` comparison admits, because it compares child
milliseconds against a budget denominated in elapsed seconds.

`shardPartition.test.ts` then calls `checkBudget` with the live registry's makespan, its floor and
the derived overhead, and asserts no problems. That call site is a REGRESSION check on the shipped
partition; the discrimination is proven by the constructed cases above. It is in the red command
because this task edits that file, not because it is red first.

`legOverhead` is the median of the recalibration block's per-leg `elapsedS - childMs/1000`, derived
in code from the block rather than typed as a literal. Premise: the derivation asserts the block
holds legs at all, so an empty block cannot yield a median of zero and make every fit trivially
pass.

### Task 7 — the shard count buys runway, and says so

<!-- task: red=`pnpm exec vitest run tests/mutation/source/shardPartition.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts tests/mutation/_metaShardRangeTracked.test.ts tests/cross-cutting/vitest-projects-partition.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:49` why=`this line declares SOURCE_SHARD_COUNT = 10, whose runway against the recalibrated registry is 11.8 days, so the runway assertion this task adds fails at ten and passes only once the count reaches twelve and every follower that carries the number as DATA follows it: the two new shard files, the workflow matrix, the workflow env literal, the package.json mutation:guards file list, the workflow-coverage allowlist value, and the gitignore scratch range` ac=AC-10,AC-11 -->

**Files:** `tests/mutation/source/shardPartition.ts`, two new shard files shard10 and shard11 under
`tests/mutation/`, the root gitignore, `.github/workflows/mutation-harness.yml`, the root
package.json, `tests/ci/_workflowCoverageScan.ts`.

`runwayDays(SOURCE_SHARD_COUNT) >= 21`, one-sided, with growth derived from the anchor's two
committed points. Twelve is the smallest count that satisfies it.

The two new shard files are the same template, byte-identical but for the literal and the filename,
which `_metaSourceShardIntegrity` already pins.

**The `.gitignore` rule is the trap this task must not walk into.** Line 137 of the root gitignore matches
guardSurfaces.shard1[0-9].test.ts under `tests/mutation/`, so shard10 and shard11 are IGNORED
TODAY. Add
them without narrowing that range to `shard1[2-9]` and `git add` skips them without a word, every
local run stays green because the files are on disk, and a fresh checkout is missing them.
`_metaShardRangeTracked` exists because that has already happened once — four required checks red
on a fresh checkout while every local run looked normal.

**Six followers carry the count as DATA and do not derive it.** Round 1 found two of them that the
first sweep missed, both by grepping outside the subtree list it used:

| site | what it holds | how it was found |
| --- | --- | --- |
| `.github/workflows/mutation-harness.yml:221` | the matrix list `[0..9]` | first sweep |
| `.github/workflows/mutation-harness.yml:397` | the literal `SOURCE_SHARD_COUNT: "10"` | first sweep |
| the root gitignore, line 137 | the scratch range | first sweep |
| the root package.json, line 58 | `mutation:guards`, an explicit ten-file list | round 1 |
| `tests/ci/_workflowCoverageScan.ts:1649` | the allowlist's exact value `"10"` | round 1 |
| `tests/ci/_workflowCoverageScan.ts:1650-1657` | that row's `reason`, which asserts ten is the last useful count | round 1 |

The `mutation:guards` script is the one that would have made this task's own RED command unsatisfiable:
`_metaSourceShardIntegrity` derives the expected `mutation:guards` file list from
`SOURCE_SHARD_COUNT`, so the suite cannot go green while the script names ten files.

**Three sites carry PROSE the count invalidates**, which a constant-follows-constant sweep cannot
see: the workflow comment at `.github/workflows/mutation-harness.yml:196` and
`.github/workflows/mutation-harness.yml:253`, and the `notify` job's triage guidance at
`.github/workflows/mutation-harness.yml:527`.
The allowlist `reason` above is a fourth. All four say some version of "ten is the last time the
count moves usefully", which is true of the makespan and false of the runway.

Correct `tests/mutation/source/shardPartition.ts:26-46` to say what N levers: not the makespan, which the floor pins, but
the number of enrolments before the average leg reaches the floor.

### Task 8 — the heavy-phase rule cites the lines the calls are on

<!-- task: red=`node --import tsx scripts/probes/2026-09-01-heavy-rule-citations.ts` red-state=authored red-target=`tests/docs/fixtures/agents-heavy-phase-rule.md:9` why=`this line is the byte-pin of the AGENTS.md heavy-phase paragraph and carries its two citations verbatim; it cites scripts/share-link-flash-adversary-matrix.mjs:1014 for the playwright invocation that sits at 1042 and line 1215 for the --quick guard that sits at 1243, so both citations resolve to a bare closing paren and a continue; the probe this task adds resolves each against the live script and exits non-zero until they name the constructs their prose claims` ac=AC-12 -->

**Files:** `AGENTS.md`, `tests/docs/fixtures/agents-heavy-phase-rule.md`,
`tests/docs/agentsHeavyPhaseRule.test.ts`,
`docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md`,
`docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md`, and a new citation probe under
`scripts/probes/`.

**The numbers moved twice, which is the argument for the probe.** #967 item 11 enumerated four
sites and gave the target as 1042. At merge base `34d8d0a12` that was wrong — the call was at 1017.
#967 then merged (`8710aefc7`) and its +25 lines made 1042 right after all. A repair verified by
reading is a repair that is correct until the next merge; this task ships the check instead.

Re-derived against the current merge base, not carried over:

```
grep -n 'execFileSync("pnpm", \["test:e2e:share-link-flash"' scripts/share-link-flash-adversary-matrix.mjs
1042:    execFileSync("pnpm", ["test:e2e:share-link-flash", "--reporter=json"], {
grep -n 'QUICK ? \[\] : runBrowser' scripts/share-link-flash-adversary-matrix.mjs
1243:    const browserRows = QUICK ? [] : runBrowser();
```

**#967 named ONE stale citation; there are two, and they were stale by the same three lines before
its merge.** The rule's sentence cites 1014 for the invocation and 1215 for the `--quick` guard
that suppresses it, and it calls the second "load-bearing" — a mode claim resting on a line that
holds `continue;`.

**Seven sites, from the sweep rather than from a list:**

| site | what it carries |
| --- | --- |
| `AGENTS.md:277` | both stale numbers, in the shipped rule |
| `tests/docs/fixtures/agents-heavy-phase-rule.md:9` | a byte-pin of that paragraph (`tests/docs/agentsHeavyPhaseRule.test.ts:32`, asserted at `tests/docs/agentsHeavyPhaseRule.test.ts:442`) |
| `tests/docs/agentsHeavyPhaseRule.test.ts:154` | the `must`-side literal |
| `tests/docs/agentsHeavyPhaseRule.test.ts:221` | the transitive-member regex |
| `tests/docs/agentsHeavyPhaseRule.test.ts:992` | the `editRule` mutant's replacement text |
| `docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md:433` | the spec's own citation |
| `docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md:14` | the plan's R10 F1 verification note |

The fixture is not optional: `agentsHeavyPhaseRule.test.ts` asserts `AGENTS.md`'s paragraph is
byte-identical to it, so editing one without the other reds that suite.

The last two record a verification that WAS true when written. They move too: a citation is a
promise the reader can follow it, and a record whose pointer no longer resolves records nothing.
Each keeps its original prose and gains only the corrected number.

RED: the new probe reads every line-form citation of that script out of the seven sites, resolves
each against the live file, and exits non-zero naming any whose line does not hold the construct
the surrounding prose claims — the `execFileSync` of `test:e2e:share-link-flash` for the
invocation, the `QUICK ?` ternary for the `--quick` guard. It reports both as unresolved today.
GREEN: it exits 0.

Premise: the probe asserts it FOUND citations to check before reporting a clean, so a regex that
matched nothing cannot pass as "every citation resolves".

