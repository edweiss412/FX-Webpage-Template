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

2. the measured per-surface seconds AND each leg's own elapsed.txt, from a nightly's artifacts
   gh run download <id> -D <dir>/meas-<id> \
     -p "mutation-records-source-shards-*" -p "elapsed-source-shards-*"

3. the shipped drift report over those records
   RECORDS_DIR=<dir>/meas-<id> DRIFT_ACTIONABLE_AT=20 pnpm tsx scripts/check-rate-drift.ts

§1.3 packs by (1) and scores by (2). It scores LEG ELAPSED, not child seconds: the budget
check reads elapsed.txt, and the difference is measured in §1.3 rather than assumed away.
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

## §1 The decision

### §1.1 Reconciling the three totals, because they are not the same quantity

| figure | what it measures | its own conclusion |
| --- | --- | --- |
| 23,080 s | measured leg wall clock, four legs, boot-count partition, smaller registry (`BACKLOG.md`, `BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER`, routed from `dbconn`) | `n = 8` |
| 18,025 s | modelled priced weight, 48 surfaces (`docs/superpowers/specs/ci/2026-08-25-mutation-shard-weight-seconds-design.md`, via the bl-orch handoff) | `n = 6` |
| 18,651.7 s | modelled priced weight, live registry today | see §1.2 |

All three are correct about their own input. Two are MODELLED and one is MEASURED, and the
model under-prices, which is why the modelled figure alone gives the wrong answer.

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

From N = 8 upward the modelled makespan stops moving, pinned by the single heaviest surface.
On this table alone the answer is six, and that is what the predecessor arc's handoff predicted.

It is wrong for two independent reasons, both of which §1.3 corrects rather than argues around.

**The rates under-price.** The shipped drift instrument (`scripts/check-rate-drift.ts`) reports
per surface on main's latest nightly that EVERY ONE of the 48 surfaces it measured observes at
or above its declared rate, spanning 1.02x to 2.19x, 1.1952x in aggregate. No surface anywhere
in that report runs faster than its declared rate, so this is a systematic bias and not noise.

**The model prices child work; the budget measures the job.** `SHARD_BUDGET_SECONDS` is checked
against each leg's `elapsed.txt`, whose timer is stamped before checkout, the setup action, and
two Playwright install steps (`.github/workflows/mutation-harness.yml`, the `Stamp job start`
step preceding them). Mutant-outcome children do not include any of it. Measured across the two
runs scored below, that gap is 102.5 s to 216.8 s per leg, and every leg pays it, so eight legs
pay it eight times where four legs paid it four.

### §1.3 The realized partition says eight

The instrument: pack by modelled weight, then score each leg as the seconds its surfaces
ACTUALLY took plus the worst per-leg overhead observed, 216.8 s. Per-surface seconds are the
WORST observed across both scored runs, so a surface measured twice contributes its slower
figure. Four surfaces were measured by neither run and fall back to modelled weight; §1.5 sizes
them.

Runs scored: `32822546867` (2026-08-25) and `32920754274` (2026-08-26), both nightly on `main`.

| N | children on the binding leg | leg elapsed | margin | fits |
| --- | --- | --- | --- | --- |
| 6 | 4,187.6 s | 4,404.4 s | 22.3% over | no |
| 7 | 3,622.2 s | 3,839.0 s | 6.6% over | no |
| 8 | 3,081.8 s | 3,298.6 s | 301.4 s, 8.4% | yes |
| 9 | 3,056.9 s | 3,273.7 s | 326.3 s, 9.1% | yes |
| 10 | 3,056.9 s | 3,273.7 s | 326.3 s, 9.1% | yes |

**N = 8 is RATIFIED.** It is the smallest N that fits. Seven misses by 239.0 s, which no
rounding closes.

Margin at N = 8: **301.4 s, or 8.4% of the budget.** That is thin, and it is stated as thin.
§4 L-1 and L-3 say what it does not cover.

### §1.4 Why not a larger N

`controlOutlineResidue` measured 3,056.9 s at worst, on its own. A surface is atomic in this
partition, so no shard count can place less than one surface on a leg. Every N of 9 or more
therefore produces the same leg: 3,056.9 s of children plus 216.8 s of overhead, 3,273.7 s.

Against N = 8's 3,298.6 s that is an improvement of **24.9 s, or 0.7% of the budget**, for at
least one more runner job. The shard count has essentially stopped being the variable.

### §1.5 Robustness of the choice, and what the fallbacks actually are

Four registry surfaces were measured by neither run. Their provenance is not uniform, and it
splits them into two pairs:

- `mutationWeightRecords` and `mutationWeightWeights` did not exist at either run's sha. Probed:
  `git show e381de76e:tests/mutation/source/registry.ts | grep -c 'id: "mutationWeightRecords"'`
  returns 0, and the registry held 43 surfaces at `9b1bd6715`, 50 at `e381de76e`, 52 today.
- `supabaseRetryingFetch` and `retryableRpcVolatilityScan` DID exist at `e381de76e` (the same
  probe returns 1 for each). They are absent from that run's records because the leg holding
  them was censored: its `elapsed.txt` reads 7,511 s against a 7,500 s job ceiling. Their
  absence is therefore not "enrolled later" and could correlate with being slow, which is the
  reason it is written down rather than smoothed over.

Their combined modelled weight is 333.8 s. Inflating all four by the worst under-pricing
observed anywhere in the corpus, 2.19x, moves the N = 8 binding leg to 3,344.7 s, still inside
the budget. The choice does not turn on them.

Using the worst-observed figure per surface is what makes this robust to the older run's
sparser coverage: run `32822546867` measured 43 surfaces, so scored alone it would fall back on
nine, and inflating those nine by 2.19x breaches at N = 8. Scored against the union, only the
four above ever fall back.

## §2 Design

### §2.1 The constant, and the two classes that derive from it

`SOURCE_SHARD_COUNT` goes from 4 to 8 in `tests/mutation/source/shardPartition.ts:26`. Its
comment justifies four on a premise that is now false, that max load is pinned by the heaviest
surface from n=4 onward, so it is rewritten rather than left to mislead.

The sites that derive from the constant fall into two classes with genuinely different failure
behaviour, and conflating them is what made the first draft of this section wrong.

**Class A, sites that fail loudly.** Anything importing the constant follows automatically
(`tests/mutation/guardSurfaces.gates.test.ts`, `tests/mutation/source/records.test.ts`, the
family-count assertion at `tests/mutation/_metaSourceShardIntegrity.test.ts:137`). Anything
reading it from the environment follows once the workflow's value moves;
`scripts/check-shard-budget.ts` already derives its expected leg-name set from the count. The
remainder restate the number as text outside TypeScript's reach and are pinned by `toBe`, so
they fail at assert time:

| site | today | becomes |
| --- | --- | --- |
| `tests/mutation/source/shardPartition.ts:26` | `= 4` | `= 8` |
| `.github/workflows/mutation-harness.yml:158` | `shard: [0, 1, 2, 3]` | `shard: [0, 1, 2, 3, 4, 5, 6, 7]` |
| `.github/workflows/mutation-harness.yml:296` | `SOURCE_SHARD_COUNT: "4"` | `"8"` |
| `tests/ci/_workflowCoverageScan.ts:1542` | `values: [{ text: "4", …}]` | `text: "8"` |
| `package.json`, the `mutation:guards` script (line 58 today) | shard0..shard3 named literally | shard0..shard7 |

**Class B, prose that fails silently.** Comments and case titles spelling the count as a word or
a digit compile and assert exactly as before while saying something false. Nothing catches them,
which is precisely why they are enumerated by a re-runnable command rather than by memory. The
sweep is

```
rg -n -i '\bfour\b|4 LPT|\[0, ?1, ?2, ?3\]|shard0\.\.shard3' \
  .github/workflows/mutation-harness.yml tests/mutation tests/ci vitest.projects.ts .gitignore package.json
```

and its members are repaired by DE-NUMBERING, so the same sites cannot rot again at the next
change: `.github/workflows/mutation-harness.yml` lines 8, 150, 198 and 216;
`tests/mutation/source/shardPartition.test.ts:84`;
`tests/mutation/_metaSourceShardIntegrity.test.ts:5`;
`tests/mutation/source/records.test.ts` lines 314 and 323;
`tests/mutation/source/registry.ts:3332`; `vitest.projects.ts:86`; and the root `.gitignore`
comment at line 126.

**Class C, one site that fails silently AND breaks the build.** The root `.gitignore` carries
a scratch rule at line 137:

```
tests/mutation/guardSurfaces.shard[4-9].test.ts
```

Every shard file this change adds falls inside that range, so `git add` skips all four without a
word, every local run stays green because the files are on disk, and a fresh checkout is missing
four shard files. Probed:

```
$ git check-ignore -v tests/mutation/guardSurfaces.shard4.test.ts
.gitignore:137:tests/mutation/guardSurfaces.shard[4-9].test.ts	tests/mutation/guardSurfaces.shard4.test.ts
```

and 5, 6 and 7 report identically. The comment above that rule records this exact failure
happening once already: four required checks red on a fresh checkout while every local run
looked normal. The range narrows to cover 8 and 9 only, which keeps the scratch convention the
rule exists for. Nothing in the repo relates that range to the constant today, and §5 AC-7 is
the guard that makes it derived.

### §2.2 The new shard files

`tests/mutation/guardSurfaces.shard{4,5,6,7}.test.ts`, from the `shard0` template,
byte-identical modulo the filename in line 1 and the `SOURCE_SHARD` literal in line 12. That
identity is not a convention, it is pinned: `_metaSourceShardIntegrity.test.ts:167-205` compares
every shard file against the template byte for byte. They self-register with vitest, whose
include is a glob (`vitest.projects.ts:90`).

### §2.3 The flipped assertion

`tests/mutation/source/shardPartition.test.ts` currently holds
`it("RECORDS that the live partition does not fit the budget, and by how much")`. Its author
wrote the replacement into its own comment: when the binding leg drops under budget the case
fails, and that is the moment to delete it and assert the budget instead.

It is replaced by a case asserting the binding leg is at or under `SHARD_BUDGET_SECONDS`,
derived from the live registry through `sourceShardAssignment` and `weightOf`, with no hardcoded
second count.

The replacement asserts the MODELLED makespan, which is what the code can compute in-process. It
is therefore a weaker claim than §1.3's realized figure, and deliberately so: §5 AC-5 carries the
realized claim and is settled by a real run.

### §2.4 A case that re-arms itself

`shardPartition.test.ts:203` branches on whether the heaviest surface outweighs an even split.
At four shards it takes the early-return branch and asserts almost nothing. At eight it takes the
`premise(...)` branch and asserts `makespan === heaviest` as an exact equality. Probed at both
counts:

```
n=4 makespan_ms=4666275 heaviest_ms=2443987 equal=false heaviest>evenSplit=false
n=8 makespan_ms=2443987 heaviest_ms=2443987 equal=true  heaviest>evenSplit=true
```

Raising the count re-arms a dormant case, which is what its author built it to do. Its comment
describes the four-shard regime and is rewritten to describe the one the count now sits in.

## §3 Convergence criterion for this spec's own reviews

- **Consequence bound.** Every Class A site is updated correctly or fails at parse or assert
  time. Class B sites cannot fail loudly by construction, so the bound over them is that the
  §2.1 sweep command is re-run rather than trusted, and Class C is closed by AC-7's derived
  guard. A conservative over-provision, an N larger than strictly needed, plus a stated margin,
  is a documented limit and not a finding.
- **PROBE DOMAIN.** The enrolled registry `tests/mutation/source/registry.ts` and the workflow
  matrix in `.github/workflows/mutation-harness.yml`. A probe outside those two, or more than one
  ordinary edit away from an input in them, files to documented limits and not to a round. A
  hypothetical registry holding a surface heavier than any that exists is outside the domain.
- **Threat fence.** Accidental authoring mistakes by an ordinary contributor editing the shard
  count or enrolling a surface. Adversarial construction of a pathological weight distribution is
  out of scope.

## §4 Documented limits

- **L-1. The partition is floor-bound by one surface, and no shard count can help.**
  `controlOutlineResidue` measured 3,056.9 s at worst, which with per-leg overhead is 3,273.7 s,
  **90.9% of a 3,600 s leg, alone**. If it grows by about 10%, or a run is about 10% slower, it
  breaches on its own at any N. Two repairs exist at that point and re-rating is NOT one of them:
  `millisPerBoot` decides only where `lptAssign` places a surface, never how long `runSurface`
  takes to execute it, and at N = 8 the surface is already alone on its leg, so re-rating moves
  nothing. What remains is splitting the surface into separately-enrolled parts, or moving the
  budget with the ceiling relation at `tests/mutation/_metaSourceShardIntegrity.test.ts:503-554`
  moved in lockstep. Neither is a shard-count change, which is why this is recorded here rather
  than deferred to a future N.
- **L-2. The declared rates systematically under-price.** §1.2 owns that measurement and the
  command that prints it; the drift report finds no surface anywhere below its declared rate.
  This is the predecessor arc's surface, its own `check-rate-drift` instrument reports it by
  design, and that report never fails a job because drift is information for whoever re-measures.
  The consequence for this spec is bounded and handled: it is why §1.2's table cannot be the
  basis for N, and why §1.3 scores against measured seconds instead.
- **L-3. Run-to-run variance reaches 1.29x on identical work.** On the 42 surfaces measured in
  all three downloaded runs, run `32703467609` took 22,949.0 s where the other two took
  17,683.2 s and 17,849.0 s. That is a real slow-runner event, one occurrence in three observed.
  A run that slow breaches the budget at EVERY N, because L-1's floor scales with it. The 8.4%
  margin at N = 8 does not cover a 1.29x run and is not claimed to.
- **L-4. Measured seconds carry two kinds of staleness, and only one was checkable.** The runs
  scored are at shas before the predecessor arc merged. Per-surface seconds are
  partition-independent, which is the only property §1.3 uses, and OUTCOME-count staleness was
  checked per surface by comparing each record against the mutants today's tree generates: one
  surface differs, `sourceShardPartition`, which measured 43.7 s. But a deciding suite can change
  without moving any outcome count while changing every child's DURATION, and that is not
  checkable from the records. Derived rather than asserted: of the surfaces measured by the newer
  run, four have a changed source or deciding suite since its sha (`premiseScan`,
  `modal-wait-helper-scan`, `modal-wait-disposition`, `sourceShardPartition`), together 1,586.5 s
  of measured work; for the older run it is nineteen surfaces and 15,105.5 s, which is why the
  newer run is the primary and the older one is used only for the worst-case union. §5 AC-5 is
  the answer to this limit: the model is evidence, the run adjudicates.

## §5 Acceptance criteria

- **AC-1.** `SOURCE_SHARD_COUNT === 8`, and the modelled binding leg computed from the live
  registry is at or under `SHARD_BUDGET_SECONDS`. Asserted by the replacement case in §2.3,
  derived, with no committed second count.
- **AC-2.** The four new shard files are byte-identical to `shard0` modulo filename and index,
  and the existing template case at `_metaSourceShardIntegrity.test.ts:167-205` passes over
  eight files rather than four without being edited to accommodate them.
- **AC-3.** Every Class A site in §2.1 carries 8, and the meta-tests pinning them by `toBe` pass.
- **AC-4.** The breach-recording case from the predecessor arc is DELETED, not skipped and not
  weakened. Its absence is what proves the budget claim is live.
- **AC-5. The run adjudicates.** One real `mutation-harness` run on this branch, with the
  `budget` job green and every source leg's `elapsed.txt` under 3,600 s. The PR fires it by path
  filter (`pull_request.paths` covers `tests/mutation/**`), so no manual dispatch is required;
  `gh workflow run mutation-harness.yml --ref fix/mutation-shard-budget-six` is the fallback. If
  the measured max leg breaches while the model says it fits, N is raised again in this same PR
  and re-run.
- **AC-6.** The twelve required checks green: `quality`, `unit-suite`, `x1-catalog-parity`,
  `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`,
  `x6-pg-cron-pivot`, `validation-schema-parity`, `affordance-matrix-parity`,
  `postgrest-dml-lockdown`, `traceability-audit`.
- **AC-7.** The tracked shard range is DERIVED from `SOURCE_SHARD_COUNT`, not a literal: a guard
  asserts that every index below the count is a path `git check-ignore` does not match, and that
  the first index at or above it does (the root `.gitignore` scratch rule, §2.1 Class C). Both halves are required; half one alone passes against a
  `.gitignore` that ignores nothing, which is the failure the scratch rule was written for.

## §6 Resolved scope — do not relitigate, out of scope, and N/A declarations

- **No new ledger row, of any facing, with no exception.** Binding directive for this arc,
  stronger than the mint freeze's own exception clauses. Everything found here is repaired in
  this PR or recorded in §4.
- **`SHARD_BUDGET_SECONDS = 3600` and `timeout-minutes: 125` do not move.** The budget is the
  target, not the variable. The notify copy at `.github/workflows/mutation-harness.yml:393` names
  a raised shard count as the sanctioned response and a raised timeout as the forbidden one, and
  the ceiling case at `tests/mutation/_metaSourceShardIntegrity.test.ts:503-554` requires
  `timeout-minutes >= 2 * SHARD_BUDGET_SECONDS + 300 s`, which at 125 minutes is exactly
  satisfied. Raising N does not move that requirement; raising the budget would.
- **The priced weight model is the predecessor arc's**, reviewed and settled, and is this spec's
  input. Its under-pricing is measured in §1.2 and recorded in L-2, not repaired here.
- **`lptAssign` is imported from the parser harness and reused as-is.** A second implementation
  is forbidden, and `tests/mutation/source/shardPartition.ts:5-7` says why.
- **There is no committed weight table.** Every shard recomputes the identical map on its own
  runner.
- **The parser harness's `SHARD_COUNT = 8` is untouched.** A different corpus with a different
  partition; `PARSER_SHARD_COUNT: "8"` being the same number is a coincidence, not a coupling.
- **impeccable-gate: N/A — no UI surface.**

## §7 Meta-test inventory

One new case, and the rest is already pinned:

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
| the tracked shard range follows the count | NEW, AC-7 (§2.1 Class C) |
| no shard slice is empty | NEW: `registerSurfaceCases` wraps `describe.each`, so an empty slice registers zero cases and its shard file reports green having asserted nothing |

## §8 Ledger graduation

`BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER` is archived, not carried forward. The archive entry
records the decision (N = 8), the arithmetic (§1.2 and §1.3), and the residual: the incoming
231-site surface the row warned about has LANDED, it is `controlOutlineResidue`, and it is now
the floor L-1 describes at 90.9% of a leg. The row asked for the shard-count decision to be
taken as a fleet item rather than a unilateral edit. It was, by bl-orch, and this arc is it.
