# The source-mutation partition does not fit its per-leg budget; eight shards make it fit

<!--
Every figure below is printed by commands, not retyped from a transcript. Three of them:

1. the modelled partition at any N, from the live registry
   pnpm tsx -e 'import {lptAssign} from "@/tests/parser/mutation/shardPartition";
     import {weightOf} from "@/tests/mutation/source/shardPartition";
     import {GUARD_SURFACES as G} from "@/tests/mutation/source/registry";
     for (const n of [4,5,6,7,8,9]) { const a = lptAssign(G.map((s)=>({key:s.id,w:weightOf(s)})), n);
       const l = new Array(n).fill(0); for (const s of G) l[a.get(s.id)] += weightOf(s);
       console.log(n, (Math.max(...l)/1000).toFixed(1)); }'

2. the measured per-surface seconds, from a nightly's own artifacts
   gh run download <id> -D <dir>/meas-<id> \
     -p "mutation-records-source-shards-*" -p "elapsed-source-shards-*"

3. the shipped drift report over those records
   RECORDS_DIR=<dir>/meas-<id> DRIFT_ACTIONABLE_AT=20 pnpm tsx scripts/check-rate-drift.ts

The REALIZED makespan in §1.3 is (1) packed by modelled weight, then scored by (2)'s
seconds. That is the scoring method the weight-model spec used on itself
(docs/superpowers/specs/ci/2026-08-25-mutation-shard-weight-seconds-design.md:99).
-->

## §0 Problem

`SOURCE_SHARD_COUNT = 4` (`tests/mutation/source/shardPartition.ts:26`) against
`SHARD_BUDGET_SECONDS = 3600` (`tests/mutation/source/budget.ts:13`). The partition has not
fit that budget for weeks. `mutation-harness` is red on `main` itself, so every arc reads its
own leg against a red baseline and cannot separate a regression from the inherited state.

The predecessor arc (`fix/mutation-shard-weight-seconds`, PR #896) replaced the weight model
outright, from a boot COUNT to a priced `bootsOf(surface) * surface.millisPerBoot`, and left
the breach standing as an executable documented limit: a case in
`tests/mutation/source/shardPartition.test.ts` that asserts the partition does NOT fit and
says in its own comment that the moment the binding leg drops under budget, the case should be
deleted and the budget asserted instead. This spec is that moment.

Three separate figures for "how far over" are in circulation, from three different
measurements, and §1.1 reconciles them before anything is derived from any of them.

## §1 The decision

### §1.1 Reconciling the three figures, because they are not the same quantity

| figure | what it measures | its own conclusion |
| --- | --- | --- |
| 23,080 s | measured leg wall clock, four legs, boot-count partition, smaller registry (`BACKLOG.md`, `BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER`, routed from `dbconn`) | `n = 8` |
| 18,025 s | modelled priced weight, 48 surfaces (`docs/superpowers/specs/ci/2026-08-25-mutation-shard-weight-seconds-design.md`, via the bl-orch handoff) | `n = 6` |
| 18,651.7 s | modelled priced weight, live registry today | see §1.2 |

All three are correct about their own input. They differ because two of them are MODELLED and
one is MEASURED, and the model under-prices. That gap is the whole content of this section, and
it is why the answer is not the one the modelled figure suggests.

The row's `n = 8` is superseded by re-derivation rather than by disagreement, per the arc's
terms. It is worth recording that re-derivation lands on the same number by a different route.

### §1.2 The modelled partition says six, and six is wrong

Packing the live registry's priced weights with `lptAssign`:

| N | modelled makespan | fits the 3,600 s budget |
| --- | --- | --- |
| 4 | 4,666.3 s | no, 29.6% over |
| 5 | 3,732.9 s | no, 3.7% over |
| 6 | 3,112.7 s | yes, 13.5% margin |
| 7 | 2,667.5 s | yes, 25.9% margin |
| 8 | 2,444.0 s | yes, 32.1% margin |

From N = 8 upward the modelled makespan stops moving, because it is pinned by the single
heaviest surface. On this table alone the answer is six, and that is what the predecessor arc's
handoff predicted.

It is wrong because `weightOf` systematically under-predicts what a surface actually costs. The
shipped drift instrument (`scripts/check-rate-drift.ts`) says so per surface on main's latest
nightly: of the 48 surfaces it measured, EVERY ONE has an observed rate at or above its declared
rate, spanning 1.02x to 2.19x. In aggregate on that run, measured child seconds are 1.1952x
modelled seconds.

Three nightly runs on `main` were downloaded. Child seconds explain 96.9% to 97.6% of each run's
own summed `elapsed.txt`, which is the premise the weight model rests on and it holds: balancing
child seconds is balancing the job.

### §1.3 The realized partition says eight

Pack by modelled weight, then sum the seconds those surfaces ACTUALLY took:

| N | realized, run 32822546867 | realized, run 32920754274 | fits both |
| --- | --- | --- | --- |
| 4 | 5,884.8 s | 5,842.5 s | no |
| 5 | 4,536.6 s | 4,649.1 s | no |
| 6 | 4,010.4 s | 4,173.0 s | no, 11% and 16% over |
| 7 | 3,402.9 s | 3,619.9 s | no, one run over by 19.9 s |
| 8 | 3,056.9 s | 3,079.5 s | yes |

**N = 8 is RATIFIED.** It is the smallest N that fits on both runs. Seven fits on one and misses
on the other by 19.9 s, which is not a margin, it is a coin flip.

Margin at N = 8, against the worse of the two runs: **520.5 s, or 14.5% of the budget.**

The per-leg breakdown at N = 8 on that run, modelled against realized:

| leg | surfaces | modelled | realized |
| --- | --- | --- | --- |
| 0 | 1 | 2,444.0 s | 3,018.9 s |
| 1 | 5 | 2,318.5 s | 2,551.5 s |
| 2 | 5 | 2,320.6 s | 2,346.8 s |
| 3 | 8 | 2,320.0 s | 3,079.5 s |
| 4 | 8 | 2,311.8 s | 2,713.5 s |
| 5 | 8 | 2,310.2 s | 2,888.1 s |
| 6 | 9 | 2,316.3 s | 2,693.0 s |
| 7 | 8 | 2,310.3 s | 2,936.9 s |

Leg 0 holds ONE surface. That is `lptAssign` doing the right thing with a surface it cannot
split, and it is also the ceiling on this whole exercise, which §4 states as a limit.

### §1.4 Why not a larger N

`controlOutlineResidue` measured 3,018.9 s and 3,056.9 s on the two runs, on its own. A surface
is atomic in this partition, so no shard count can place less than one surface on a leg. Every
N of 9 or more therefore produces a makespan of 3,018.9 s, which is 60.6 s better than N = 8 and
costs at least one more runner job. N = 8 captures the headroom that exists; nothing above it
buys more than 1.7% of the budget.

### §1.5 Robustness of the choice

Four registry surfaces have no record in the newest run, having been enrolled after it
(`mutationWeightRecords`, `mutationWeightWeights`, `supabaseRetryingFetch`,
`retryableRpcVolatilityScan`). They are substituted at their modelled weight, which under-prices,
so the realized makespan above is a LOWER BOUND. Their combined modelled weight is small, and
inflating all four by the worst under-pricing observed anywhere in the corpus (2.19x) moves the
binding leg to 3,127.8 s, a margin of 472.2 s or 13.1%. The choice does not turn on them.

One surface's record is stale against today's tree: `sourceShardPartition`, whose source this
predecessor arc edited (record has 6 outcomes, the tree now generates 4). It measured 43.7 s.
It does not turn on that either.

### §1.6 Resolved scope, do not relitigate

- `SHARD_BUDGET_SECONDS = 3600` and `timeout-minutes: 125` do not move. The budget is the
  target, not the variable. The notify copy at `.github/workflows/mutation-harness.yml:393` names
  a raised shard count as the sanctioned response and a raised timeout as the forbidden one, and
  the ceiling case at `tests/mutation/_metaSourceShardIntegrity.test.ts:503-554` requires
  `timeout-minutes >= 2 * SHARD_BUDGET_SECONDS + 300 s`, which at 125 minutes is 7,500 against
  7,500 exactly. Raising N does not move that requirement. Raising the budget would.
- The priced weight model is the predecessor arc's, reviewed and settled, and is this spec's
  input. Its under-pricing is measured in §1.2 and recorded as a limit in §4, not repaired here.
- `lptAssign` is imported from the parser harness and reused as-is. A second implementation is
  forbidden, and `tests/mutation/source/shardPartition.ts:5-7` says why.
- There is no committed weight table. Every shard recomputes the identical map on its own runner.

## §2 Design

### §2.1 The constant, and everything derived from it

`SOURCE_SHARD_COUNT` goes from 4 to 8 in `tests/mutation/source/shardPartition.ts:26`. Its
comment currently justifies four on a premise that is now false, that max load is pinned by the
heaviest surface from n=4 onward. It is rewritten rather than left to mislead: the max load is
pinned by the heaviest surface from n=8 on, which is exactly why eight is the number.

The sites that derive from the constant are one class. The class is swept to a derivation rather
than to a list, because a list needs maintaining and a derivation does not:

- Anything importing `SOURCE_SHARD_COUNT` follows automatically. That covers
  `tests/mutation/guardSurfaces.gates.test.ts`, `tests/mutation/source/records.test.ts`, and
  the family-count assertion at `tests/mutation/_metaSourceShardIntegrity.test.ts:137`.
- Anything reading it from the environment follows once the workflow's value moves.
  `scripts/check-shard-budget.ts` already derives its expected leg-name set from the count
  rather than listing legs.
- The sites that must change by hand are exactly the ones that restate the number as text
  outside TypeScript's reach, which is a finite set the meta-tests already pin:

| site | today | becomes |
| --- | --- | --- |
| `tests/mutation/source/shardPartition.ts:26` | `= 4` | `= 8` |
| `.github/workflows/mutation-harness.yml:158` | `shard: [0, 1, 2, 3]` | `shard: [0, 1, 2, 3, 4, 5, 6, 7]` |
| `.github/workflows/mutation-harness.yml:296` | `SOURCE_SHARD_COUNT: "4"` | `"8"` |
| `tests/ci/_workflowCoverageScan.ts:1542` | `values: [{ text: "4", …}]` | `text: "8"` |
| `package.json`, the `mutation:guards` script (line 58 today) | shard0..shard3 named literally | shard0..shard7 |

### §2.2 The new shard files

`tests/mutation/guardSurfaces.shard{4,5,6,7}.test.ts`, from the `shard0` template,
byte-identical modulo the filename in line 1 and the `SOURCE_SHARD` literal in line 12. That
identity is not a convention, it is pinned: `_metaSourceShardIntegrity.test.ts:167-205` compares
every shard file against the template byte for byte.

### §2.3 The flipped assertion

`tests/mutation/source/shardPartition.test.ts` currently holds
`it("RECORDS that the live partition does not fit the budget, and by how much")`, asserting the
lower bound over budget, the makespan over budget, and the required shard count above the
configured one. Its author wrote the replacement into its own comment: when the binding leg drops
under budget the case fails, and that is the moment to delete it and assert the budget instead.

It is replaced by a case asserting the binding leg is at or under `SHARD_BUDGET_SECONDS`, derived
from the live registry through `sourceShardAssignment` and `weightOf`. No hardcoded second count,
because a committed number here rots exactly as the deleted case's numbers would have.

The replacement asserts the MODELLED makespan, which is what the code can compute. It is
therefore a weaker claim than §1.3's realized figure, and §5 carries the realized claim as an
acceptance criterion settled by a real run instead.

## §3 Convergence criterion for this spec's own reviews

- **Consequence bound.** Every site deriving from the shard count is either updated correctly or
  fails loudly at parse time or assert time. A conservative over-provision, an N larger than
  strictly needed, plus a stated margin, is a documented limit and not a finding.
- **PROBE DOMAIN.** The enrolled registry `tests/mutation/source/registry.ts` and the workflow
  matrix in `.github/workflows/mutation-harness.yml`. A probe outside those two, or more than one
  ordinary edit away from an input in them, files to documented limits and not to a round. A
  hypothetical registry holding a surface heavier than any that exists is outside the domain.
- **Threat fence.** Accidental authoring mistakes by an ordinary contributor editing the shard
  count or enrolling a surface. Adversarial construction of a pathological weight distribution is
  out of scope.

## §4 Documented limits

- **L-1. The partition is now floor-bound by one surface, and no shard count can help.**
  `controlOutlineResidue` measured 3,018.9 s and 3,056.9 s, which is 83.9% and 84.9% of a
  3,600 s leg, alone. If it grows by about 18%, or if a run is about 18% slower than the two
  consistent runs measured here, it breaches the budget on its own at any N. The repairs
  available at that point are splitting the surface, re-rating it, or moving the budget with the
  ceiling relation moved in lockstep. None of them is a shard-count change, which is why this is
  recorded here rather than deferred to a future N.
- **L-2. The declared rates systematically under-price.** §1.2 owns that measurement and the
  command that prints it; the drift report finds no surface anywhere below its declared rate. This is
  the predecessor arc's surface, its own `check-rate-drift` instrument reports it by design, and
  that report never fails a job because drift is information for whoever re-measures. The
  consequence for this spec is bounded and already handled: it is why the modelled table in §1.2
  cannot be the basis for N, and why §1.3 scores against measured seconds instead.
- **L-3. Run-to-run variance reaches 1.29x on identical work.** On the 42 surfaces measured in
  all three downloaded runs, run 32703467609 took 22,949.0 s where the other two took 17,683.2 s
  and 17,849.0 s. That is a real slow-runner event, not a coverage artifact, and one occurrence
  in three observed. A run that slow breaches the budget at EVERY N, because L-1's floor scales
  with it. The 14.5% margin at N = 8 does not cover a 1.29x run and is not claimed to.
- **L-4. The realized figures come from runs at an older sha.** Measured seconds are from nightly
  runs at shas before the predecessor arc merged, so they were produced under the boot-count
  partition. Leg ASSIGNMENT therefore differs from today's, which is why the shipped
  `mutation-shard-weight-report.ts` refuses to reconcile them without a modelled dump at each
  run's own sha. Per-surface seconds are partition-independent, which is the only property §1.3
  uses. Staleness was checked per surface by comparing each record's outcome count against the
  mutants today's tree generates: one surface differs, named in §1.5.

## §5 Acceptance criteria

- **AC-1.** `SOURCE_SHARD_COUNT === 8`, and the modelled binding leg computed from the live
  registry is at or under `SHARD_BUDGET_SECONDS`. Asserted by the replacement case in §2.3,
  derived, with no committed second count.
- **AC-2.** The four new shard files are byte-identical to `shard0` modulo filename and index,
  and the existing template case at `_metaSourceShardIntegrity.test.ts:167-205` passes over
  eight files rather than four without being edited to accommodate them.
- **AC-3.** Every site in §2.1's table carries 8, and the meta-tests that pin them by `toBe`
  pass. `tests/ci/_workflowCoverageScan.ts` and `_metaSourceShardIntegrity.test.ts:274-278` are
  the pins.
- **AC-4.** The breach-recording case from the predecessor arc is DELETED, not skipped and not
  weakened. Its absence is what proves the budget claim is now live.
- **AC-5. The run adjudicates.** One real `mutation-harness` run on this branch, dispatched with
  `gh workflow run mutation-harness.yml --ref fix/mutation-shard-budget-six`, with the `budget`
  job green and every source leg's `elapsed.txt` under 3,600 s. The model is evidence; this is
  the verdict. If the measured max leg breaches while the model says it fits, N is raised again
  in this same PR and re-run.
- **AC-6.** The twelve required checks green: `quality`, `unit-suite`, `x1-catalog-parity`,
  `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`,
  `x6-pg-cron-pivot`, `validation-schema-parity`, `affordance-matrix-parity`,
  `postgrest-dml-lockdown`, `traceability-audit`.

## §6 Out of scope and N/A declarations

- **No new ledger row, of any facing, with no exception.** Binding directive for this arc,
  stronger than the mint freeze's own exception clauses. Everything found here is repaired in
  this PR or recorded in §4.
- **The parser harness's `SHARD_COUNT = 8` is untouched.** It is a different corpus with a
  different partition, and `PARSER_SHARD_COUNT: "8"` in the workflow is coincidentally the same
  number, which is not a reason to couple them.
- **Re-measuring the declared rates is not in scope.** L-2 is the predecessor arc's surface.
- **impeccable-gate: N/A - no UI surface.**

## §7 Meta-test inventory

No new meta-test. Every property this change could break is already pinned, and that is the
result of the predecessor arcs rather than an omission here:

| property | pinned by |
| --- | --- |
| shard files byte-identical to the template | `_metaSourceShardIntegrity.test.ts:167-205` |
| one shard file per shard, no more, no fewer | `_metaSourceShardIntegrity.test.ts:167-205` |
| the workflow matrix equals the constant | `_metaSourceShardIntegrity.test.ts:274-278` |
| the budget step's env equals the constant | `_metaSourceShardIntegrity.test.ts:274-278` |
| `timeout-minutes >= 2 * budget + 300 s` | `_metaSourceShardIntegrity.test.ts:503-554` |
| the vitest family count | `_metaSourceShardIntegrity.test.ts:137` |
| the workflow's value text | `tests/ci/_workflowCoverageScan.ts:1542` |
| the partition is total and disjoint | `tests/mutation/guardSurfaces.gates.test.ts` |
| the binding leg fits the budget | NEW, replacing the deleted breach case (§2.3) |

## §8 Ledger graduation

`BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER` is archived, not carried forward. The archive entry
records the decision (N = 8), the arithmetic (§1.2 and §1.3), and the residual: the incoming
231-site surface the row warned about has LANDED, it is `controlOutlineResidue`, and it is now
the floor L-1 describes. The row asked for the shard-count decision to be taken as a fleet item
rather than a unilateral edit. It was, by bl-orch, and this arc is it.
