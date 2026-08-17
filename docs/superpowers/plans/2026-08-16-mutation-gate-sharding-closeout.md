# Mutation-gate sharding — closeout

**Arc:** `chore/mutation-gate-sharding` · **Ledger entry:** `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`
**Spec:** `docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md` · **Plan:** `docs/superpowers/plans/2026-08-16-mutation-gate-sharding.md`

impeccable-gate: N/A — no UI surface

---

## 1. What shipped

One `mutation-harness` job became four job families plus a budget job:

| job | legs | subject |
|---|---|---|
| `parser-shards` | 8 (matrix) | `tests/parser/mutationHarness.shard{0..7}.test.ts` |
| `parser-gates` | 1 | `tests/parser/mutationHarness.gates.test.ts` |
| `source-shards` | 4 (matrix) | `tests/mutation/guardSurfaces.shard{0..3}.test.ts` |
| `source-gates` | 1 | `tests/mutation/guardSurfaces.gates.test.ts` |
| `budget` | 1 | `scripts/check-shard-budget.ts` over every leg's elapsed record |

`timeout-minutes` is **90 per leg**, not another raise of the 300 the single job carried. The ledger entry is explicit that raising it again is not a candidate, and it was already the second raise.

The source-mutation gate was split from one monolith into four same-template shard files plus one corpus-wide gates file, each shard filtering `GUARD_SURFACES` through an LPT partition recomputed live from the registry. **No weight table is committed** — the partition is a pure function of the registry and the sources it names, so every runner computes the identical map.

## 2. The entry's second complaint, answered

The entry says the job's wall clock is unbounded. It also says, and this half is easy to skip:

> The job is non-gating by design, so a timeout is silent to everyone except whoever reads the nightly.

Sharding answers the wall clock. **Legibility is answered separately, in `notify`,** and it took two attempts to get right.

`notify` enumerates the run's own jobs (`listJobsForWorkflowRun`, with `actions: read`) and names **every leg by its real name including its matrix index**, with the budget verdict's detail — which leg, how many seconds — republished as a job output and carried into the issue body. The first version reported `needs.<job>.result`, which is only ever the matrix *aggregate*: it said "parser-shards: failure" and told the triager to open the run and find the index. Whole-diff review R1 #2 caught that as missing the arc's own objective, and it was right.

Both branches were also rewritten, not just `needs`. They tested `needs.mutation-harness.result`, and this rewrite deletes that job; a dangling `needs.<job>` **does not error** — it evaluates to empty — so the failure branch would never have fired and the success branch could have auto-closed a standing issue on a red run, with every structural assertion about `needs` still green.

The replacement had its own fail-open, and R1 #1 caught that too: `contains(needs.*.result, 'failure')` and its negation treat **cancelled, skipped and timed_out as green**, so a non-green run could still auto-close the tracking issue. Both branches now read ONE job-level `ALL_GREEN` predicate in opposite directions, and its definition names every non-success conclusion GitHub can report — a closed set, so the cover is derived rather than remembered.

## 3. The regime drift, found by merging `origin/main` before writing code

Spec §2.4 and limit L-1 record `specLintNumerics` (521 boots) pinning the makespan for every `n ≥ 4`, measured over a **16-row** registry. PRs #825 and #828 merged the morning this arc implemented and took `GUARD_SURFACES` to **21 rows**.

Re-measured on the live tree with the boot weight that ships:

```
surfaces: 21   total=2220   heaviest=521 (specLintNumerics)
n=2: max=1116 ideal=1110  n=3: max=741 ideal=740
n=4: max=560  ideal=555  lb=555  max/lb=1.009  loads=[560,560,552,548]
n=5: max=521  ideal=444  lb=521  max/lb=1.000  loads=[521,423,422,433,421]
```

The even split (555) now exceeds the heaviest surface (521), so **the crossover is `n ≥ 5`, not `n ≥ 4`**.

`SOURCE_SHARD_COUNT` **stays 4**, and the reasoning is the design's own: 560 boots × 5.04 s = **47.0 min** against a 3,600 s budget and a 90-min timeout, while a fifth shard would buy 39 boots (≈ 3.3 min) for a whole runner. Raising the count is the sanctioned response to a shard **exceeding its budget** (L-2) — a condition the `budget` job reports — not to a regime change that leaves every shard comfortably inside budget. The addendum on L-1 supersedes the *justification* ("shards past four are empty capacity"), not the count.

**This is the plan's `premise` helper doing its job.** The plan's makespan case asserted `expect(makespan).toBe(heaviest)` behind `premise("the heaviest surface outweighs an even split", heaviest, total/4)`. On the merged tree the premise is false — `Got 521, which does not exceed 555` — so the assertion was refused rather than passing vacuously or failing as though the code were wrong. Had the guard stated its premise in prose instead, the equality would simply have gone red and read as an implementation bug.

The case is split in three rather than deleted:

1. the makespan packs within **1.1×** the optimal lower bound `max(heaviest, total/n)`;
2. that bound is shown to discriminate, against alternatives computed live rather than quoted — LPT **560** (1.009×) vs registry-order round-robin **838** (1.51×), `djb2 % 4` **757** (1.36×), ascending-order greedy **835** (1.50×). The two one-edit mutants of a weighted greedy are "ignore the weights" and "sort the wrong way"; both must lose, and both do, by margins that leave LPT ~9% of headroom for further enrolment;
3. the heaviest-pins **equality** is kept behind its premise, so it re-arms automatically if a heavy surface enrols or lighter ones retire.

## 4. Merge-base failure signatures (AC-9)

`mutation-harness` is red on `main` for two pre-existing reasons the spec fences as out of scope (§7, PR #824). The criterion is set **EQUALITY**, not subset: a signature on the branch and not here is a regression of this diff; a signature here and not on the branch is **a disappearance to explain, not a win**. Shard index is not part of a signature.

Merge-base set as of `e3fc2e8d3`, from run `31933821808`, in full — twelve signatures:

```
interactionTimingScan | unaccepted-survivor | logical-connector:330:39:&&>||
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L35:Xgap0|wrong|401f04fc41a0246f
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L36:Xgap1|wrong|610fa6e15ac305a8
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L37:Xgap2|wrong|6105380d595eb4de
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L38:Xgap3|wrong|efadbb9936687297
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L39:Xgap4|wrong|c8a9337291b07365
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L40:Xgap5|wrong|10097e68698678ca
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L41:Xgap6|wrong|4cf6fd6c0e5587a5
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L42:Xgap7|wrong|72bae9df9aab27f4
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L43:Xgap8|wrong|ce41539565fccaf5
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L44:Xgap9|wrong|a95dc5defc287693
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L45:Xgap10|wrong|378444153e9f3fe3
```

**Branch comparison:** owed on the first post-merge nightly — see §7.3 for why this closeout does not wait, and §7.4 for the expectation stated in advance.

## 5. Execution completeness (AC-9b)

Asserted positively and independently of any failure comparison, because a failure comparison alone cannot tell "nothing failed" from "nothing ran".

**Branch result:** §7.5. The `budget` job now enforces this on every run rather than it being checked once at close-out.

## 6. Guard-surface enrolment (mutation-family closure)

Both guard surfaces this arc ships are enrolled **before** the whole-diff review dispatch, so the convergence criterion is a mutation score plus an empty unaccepted-survivor set — both machine-computed — rather than reviewer imagination.

| surface | first run | survivors | disposition |
|---|---|---|---|
| `shardBudget` | 29 mutants, 24 killed, **0.828** (floor 0.9) | 5 | all repaid with tests |
| `sourceShardPartition` | 6 mutants, 3 killed, **0.500** (floor 0.9) | 3 | all repaid with a second deciding suite |

Both landed **below floor** on their first run, which is the enrolment doing its job.
Every survivor was a real coverage gap; **none was blessed**, and both ledgers are empty,
so a row appearing in either later is a coverage regression rather than a number to bump.

`sourceShardPartition`'s three were one shape and the most instructive of the arc: mutants
of `SOURCE_SHARD_COUNT` and both halves of `SHARD_BUDGET_SECONDS`. The unit suite can
never kill them, because it **reads those constants to build its own expectations** — a
mutated constant is self-consistent with every assertion derived from it. This is exactly
the "expected value derived from the thing under test" shape the arc's own round-economy
filing names as its dominant mechanizable class, and the gate found it in shipped code
rather than a reviewer finding it in a later round.

The kill is a **second deciding suite**, not a cleverer assertion:
`tests/mutation/_metaSourceShardIntegrity.test.ts` compares both constants against the
workflow's hard-coded `[0, 1, 2, 3]` and `"3600"`, which no mutant of the partition module
can move.

`shardBudget`'s five: four repaid with cases naming the mutant each kills; the fifth, the
NaN branch's `continue`, was genuinely equivalent (`NaN > x` is false for every x, so
falling through pushes nothing). It was **not blessed — the mechanism was removed**. The
loop is an if/else chain, so no statement remains whose removal changes nothing.

The budget checker's decision logic and its CLI are **separate files** deliberately. The registry records what the combined shape costs: `phantomGapExecuted` "enrolled as one file with its CLI main block inline it scored 0.27, 18 of 19 survivors sitting in code the referring suite can never execute through an import". A guard that cannot be imported cannot be enrolled, and enrolment precedes review.

## 7. Run records

### 7.1 The PR run is NOT the wall-clock measurement, and this matters

The §4 targets (≤55 min total, ≤47 min heaviest job) are about the **nightly**, which runs
at 07:00 UTC with no competing pull-request CI. The PR run cannot measure them, for a
quantitative reason rather than as a caveat:

- the run declares **14 legs** (8 `parser-shards` + 4 `source-shards` + `parser-gates` +
  `source-gates`), plus `budget` and `notify` gated behind them;
- at the same moment, **14 workflow runs were in flight repo-wide** — this PR alone
  declares ~40 checks;
- observed concurrency for the run was **2–3 legs at a time**, the rest `queued`.

GitHub's concurrency allowance is per account and shared across every workflow, so on a PR
the matrix queues behind the rest of CI. Sharding still converts one 166-minute serial job
into 14 independently schedulable legs — that is what makes the work divisible — but the
wall-clock *benefit* is realised only when runners are available, which is the nightly's
situation and not a PR's. **Recording this rather than quoting a PR-run number as if it
measured the target.**

What the PR run DOES establish, and what it was for:

- the workflow parses and every leg is scheduled as its own job on real Actions;
- `source-gates` completed in **8.68 s** (job 95222548558), confirming the corpus-wide file
  is generation-only and cheap — the premise for giving it its own leg;
- `elapsed-source-gates` was uploaded with exactly the name `expectedLegNames` derives,
  confirming the budget job's artifact wiring end-to-end on real CI;
- per-leg failure signatures for the AC-9 comparison.

### 7.2 Merge-base baseline provenance (AC-9)

The twelve-signature set in §4 comes from run `31933821808` at `9e949297f`. **That commit
is two merges older than this branch's merge base** (`daa53759a`): `9e949297f` → #825
(`serializeErrorStructure`) → #828 (`psqlStartupScan`) → `daa53759a`. The true merge base
has never had a nightly run.

The plan sanctions transcribing from `31933821808` explicitly, and the gap is accounted for
rather than ignored: both intervening merges *enrolled* a surface, and each shipped with a
clean ledger per its own arc (`serializeErrorStructure` 65/65 empty ledger; `psqlStartupScan`
18 equivalents, no accepted gap). Neither contributes a failure signature at the merge base,
so the baseline set is unchanged by the gap. If either produces a signature on this branch's
run, that is a regression to explain — and "it could not have come from this diff" is not a
defence.

### 7.3 Per-leg results, and why this closeout does not wait for them

**The branch's harness runs did not complete before merge, and not waiting is the arc's own thesis applied to itself.**

| run | head | outcome |
|---|---|---|
| `31970670895` | `04e0a27bd` | `source-gates` **success in 8.68 s**; the rest cancelled by `cancel-in-progress` when the review repairs were pushed |
| `31972093025` | `f890b388b` | 13 of 14 legs cancelled by the closeout push; **`budget` ran anyway and FAILED, naming all 13** |

### 7.3.1 The budget job proved itself on real CI, by failing

Run `31972093025` produced the single most valuable piece of evidence in this closeout, and it was an accident. The closeout push cancelled the run mid-flight. Thirteen legs died before recording anything; exactly one — `source-shards-1`, which had started 95 s earlier — reached its `if: always()` step and uploaded `elapsed-source-shards-1` (the run's only artifact). Then `budget` ran:

```
##[error]leg parser-shards-0 reported no elapsed record
##[error]leg parser-shards-1 reported no elapsed record
... (11 more)
##[error]leg source-gates reported no elapsed record
check-shard-budget: 13 failure(s)
```

**A maximum over the reported set would have PASSED**, comfortably: one leg, ~95 s, against a 3,600 s budget. That is precisely the failure AC-6c names — "never maximises over a partial set" — and here it is, exercised against a real partial set on a real runner rather than a constructed fixture. Completeness-before-maximum is the whole design of `lib/ci/shardBudget.ts`, and this is it working where it matters.

It also confirms end-to-end, on real Actions: the artifact naming (`elapsed-source-shards-1` is exactly what `expectedLegNames` derives), the `download-artifact` `pattern: elapsed-*` layout the CLI parses, and the `if: always()` recording step surviving a job cancellation.

The ledger entry that opened this arc says the failure mode is that a **non-gating job is silent to everyone except whoever reads the nightly**, and the brief that commissioned the work recorded the consequence: four separate arcs in one day parked for hours polling `mutation-harness` as if it gated their merge. It does not. It is not a required context, it is red on `main` for two pre-existing reasons this arc does not own, and the plan says in AC-9's own words that it "does not block the merge."

Blocking this merge on a queued non-gating job would have reproduced, inside the arc that exists to stop it, the exact behaviour it was commissioned to end. So the merge proceeds on **required** CI, and the AC-9 comparison is settled by the **first nightly after merge** — which runs at 07:00 UTC against an idle runner pool, is the configuration §4's targets were always about, and is the run whose numbers actually mean something.

**What the branch runs did establish**, which is the part that could not wait:

- the workflow parses and all 14 legs schedule as independent jobs on real Actions — the structural half of AC-6a/AC-6b, and the thing a local run cannot prove;
- `source-gates` **succeeded in 8.68 s** in its own leg, confirming the corpus-wide file is generation-only and cheap;
- `elapsed-source-gates` uploaded with exactly the name `expectedLegNames` derives, confirming the budget job's artifact wiring end-to-end.

### 7.4 Signature comparison against §4 — OWED, and how it is settled

Set EQUALITY against the twelve transcribed signatures, both directions, on the first post-merge nightly. **The expectation is stated in advance so the comparison cannot be rationalised after the fact:** this arc changes no coverage, so the same twelve signatures should reappear. A thirteenth is a regression of this diff. A missing one is a disappearance to explain — most likely something stopped executing — and not a win.

If the nightly instead shows a heaviest leg over its 3,600 s budget, the `budget` job says so by name, and the response is raising `SOURCE_SHARD_COUNT` (§3, L-2) — never `timeout-minutes`.

### 7.5 Execution completeness (AC-9b)

Also settled on that nightly: surfaces scored across the four source shards must equal `GUARD_SURFACES.length` (23), and `budget` must receive one record per leg. The `budget` job is the mechanism — it fails naming any absent leg rather than maximising over a partial set — so this property is now **enforced on every run** rather than checked once at close-out. That is the more durable form of the criterion, and it is why the job exists.

## 8. Guard falsification

Every guard this arc ships was falsified against mutants that were applied, run, observed, and reverted. A guard never observed failing is not known to fail.

**Weight formula** (3):

| mutant | observed |
|---|---|
| drop the `accepted` term | delta assertion `4` becomes `2` — FAIL |
| `mutants.length` alone | delta assertion `4` becomes `0` — FAIL |
| reverted | 9 passed |

**Integrity meta-test** (11), each red the intended case:

| # | mutation | red case |
|---|---|---|
| a | every `source-shards` leg runs the shard-0 file | interpolation + union |
| b | `matrix: {shard: [0,1,2]}` | index-list |
| c | `include: [{shard: 9}]` | no-modifier |
| d | `source-gates` names a shard file | gates-leg + union |
| e | a shard leg gains a SECOND target | exact-target + union |
| f | shard-2's body filters shard 1 | template-equality + registration |
| g | drop `runShard(N)` from `indexSites` | template-equality, on the LIVE and CORRECT parser family |
| h | stamp moved below checkout | stamp-position |
| i | budget `env` `3600` → `3600.5` | canonical-constants |
| j | budget job loses its setup step | step-order |
| k | `notify` drops `budget` from `needs` | fail-fast/needs |

Mutant **(g)** is the one that matters most, and it is in the table because an earlier draft of this normalizer omitted `runShard(N)` and therefore rejected the eight live parser shard files, which are correct. **A guard that reds on correct input is not stricter, it is broken**, and only that mutant tells the two apart.

**Budget CLI** (10 probes): over-budget names the leg (exit 1); a removed artifact names the **absent** leg (exit 1); an unexpected leg names it (exit 1); all legs at 100 s is exit 0 with no annotation; one leg at 2,881 s (80%) is exit **0** with a `::warning::` naming it; `SHARD_BUDGET_SECONDS` unset, `PARSER_SHARD_COUNT` unset, `SHARD_BUDGET_SECONDS=3600.5` and a missing `ELAPSED_DIR` are each usage errors (exit **2**); `SHARD_BUDGET_SECONDS=36000` against a 3,601 s record passes, confirming the script READS the variable rather than an internal value; an artifact uploaded with no record inside reports `NaN`, not `0`.

A genuine duplicate leg is **unreachable through the CLI** — `download-artifact` lays one directory down per leg name and the filesystem makes it unique — so it is covered at the module level, where the input shape allows it. Recorded rather than claimed as a CLI probe.

**Whole-diff review repairs** (5), added after R1:

| mutation | red case |
|---|---|
| `ALL_GREEN` reverted to failure-only | single-predicate |
| both branches point the same way | single-predicate |
| `notify` loses `actions: read` | per-leg naming |
| the jobs-API call removed | per-leg naming |
| the budget output unwired | per-leg naming |

**Browser-wiring assertions** (2): adding a bare `--project mutation` step FAILs; adding a step naming a `tests/mutation/browser/` file FAILs; reverted, 10 passed.

## 9. Merge reconciliation

`origin/main` was merged **before** any code was written, per the pre-brief instruction, and two things had moved under the branch:

- **The registry grew to 21 rows** (#825 `serializeErrorStructure`, #828 `psqlStartupScan`), which is what surfaced §3's regime drift. All three of #807's, #825's and #828's surfaces are preserved.
- **The round-economy filing stopped complying.** The enforcement-pair arc landed on `main` the same day and requires a `Mechanizable` entry to cite a `BL-`/`DEF-` id or record `declined: <reason>`. This arc's filing is not in the grandfather set — it was authored on this branch after the rule shipped — so `_metaReviewRoundEconomy` correctly reported `mechanizable_untracked`. The filing had already declined in prose ("none exists today, and I am not proposing one"); only the **form** was missing, and the structural `declined:` states why a row would be worse than none. No analysis changed.

A fan-out the plan did not enumerate also surfaced: enrolling a surface requires an `EXPECTED_ENV_TOUCHING` row per suite in `tests/mutation/_metaPremiseContract.test.ts`, which fails by default (`expected +0 to be undefined`) exactly as designed. `sourceShardPartition`'s row is a **scanner-rule 0 and a known under-count**, recorded rather than papered over: the suite imports no member of `ENVIRONMENT_SOURCES` directly, which is what the scanner classifies on, but every case reaches the filesystem transitively through `weightOf`.

## 10. Documented limits carried forward

- **L-1** is amended, not retired: the heaviest single surface still bounds wall clock; the arithmetic that made `n=4` the ceiling no longer holds at 21 surfaces, and the count stays 4 on budget grounds (§3).
- **L-2** (sub-surface partitioning) is unchanged and remains self-reporting: the `budget` job is what detects its trigger.
- **L-3** (the weight is a model, not a measurement) is unchanged. Consequence is shard imbalance only — the partition stays total and disjoint, so no verdict changes.

## 11. Review-round economy

Spec converged at 3 counted rounds, under the threshold of 4. The plan ran 10 and its filing is at `docs/review-rounds/chore/mutation-gate-sharding/e3fc2e8d36dd.md`.

The merge moved the merge-base from `e3fc2e8d3` to `daa53759a`, so diff-stage rounds open a new corpus file under the new base sha. If the diff stage reaches 4 counted rounds, the filing is owed there.

**Diff stage: 2 counted rounds, under the threshold of 4 — no filing owed.**

| round | status | verdict | findings |
|---|---|---|---|
| 1 | `no_verdict` | — | — |
| 1 | `no_verdict` | — | — |
| 1 | verdict | BLOCKING | 3 |
| 2 | verdict | APPROVE | 0 |

The two `no_verdict` rows are **infrastructure faults, kept as honest evidence** rather than
deleted, and neither consumes a round — only a row carrying a real verdict counts. The first
was an account-wide Codex usage limit ("try again at Aug 22nd"); the second recorded
`failureReason: interrupted` at 0 s while its transcript showed the reviewer actively
probing `notify`'s result matrices. The reaper's log shows no kill at that time, so the
cause was turn-boundary teardown of a `nohup`'d wrapper, not the documented reaper class.
The third dispatch ran under harness-tracked background and returned a verdict.

**All three R1 findings were real, and all three were fail-open** — each let a bad state read
as a good one, which is the single defect class this arc exists to remove. That is the
strongest argument available for the cross-model gate: the arc had already falsified its own
guards with 14 mutants and 10 CLI probes, and still shipped three fail-opens into review.

The class sweep on R1 #3 found a **fourth** instance the finding did not name (negative
elapsed seconds), which is the implementer-side half of the sweep rule working as written.

## 12. Gate dispositions

impeccable-gate: N/A — no UI surface

No file under `app/`, `components/`, `app/globals.css`, `DESIGN.md` or a Tailwind config is touched.

Declared N/A for this diff: advisory-lock topology (no `pg_advisory*`); Supabase call-boundary registry (no Supabase client calls); admin-alert catalog; §12.4 error-code catalog; migration→validation parity (no `supabase/migrations/**`); mutation-surface observability (no mutating route or `"use server"` action).
