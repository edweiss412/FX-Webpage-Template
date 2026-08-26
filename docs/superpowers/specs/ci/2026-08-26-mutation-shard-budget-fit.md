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

4. §1.3's OWN table. Round 2 was right that (1)-(3) do not produce it: none of them builds the
   cross-run union, takes the worst figure per surface, derives the per-leg overhead, or prints
   the N sweep. This does, over the run directories (2) downloaded, and its output IS §1.3:

   RUNS="<dir>/meas-A <dir>/meas-B" pnpm tsx -e '
   import {readFileSync,readdirSync} from "node:fs"; import {join} from "node:path";
   import {lptAssign} from "@/tests/parser/mutation/shardPartition";
   import {weightOf} from "@/tests/mutation/source/shardPartition";
   import {SHARD_BUDGET_SECONDS as B} from "@/tests/mutation/source/budget";
   import {GUARD_SURFACES as G} from "@/tests/mutation/source/registry";
   const dirs = (process.env.RUNS ?? "").split(/\s+/).filter(Boolean);
   const per = new Map<string, number[]>(); const over: number[] = [];
   for (const root of dirs) for (const d of readdirSync(root).filter((x) => x.startsWith("mutation-records-source-shards-"))) {
     let legMs = 0;
     for (const f of readdirSync(join(root, d))) {
       const r = JSON.parse(readFileSync(join(root, d, f), "utf8")); let ms = 0;
       for (const o of r.outcomes ?? []) for (const c of o.children ?? []) ms += c.durationMs ?? 0;
       per.set(r.surfaceId, [...(per.get(r.surfaceId) ?? []), ms]); legMs += ms;
     }
     over.push(Number(readFileSync(join(root, `elapsed-source-shards-${d.slice(-1)}`, "elapsed.txt"), "utf8")) - legMs / 1000);
   }
   const OH = Math.max(...over);
   const val = (id: string) => { const v = per.get(id); return v ? Math.max(...v) : weightOf(G.find((s) => s.id === id)!); };
   console.log(`overhead_max=${OH.toFixed(1)}s modelled-only=${G.filter((s)=>!per.has(s.id)).map((s)=>s.id).join(",")}`);
   for (const n of [6,7,8,9,10]) {
     const a = lptAssign(G.map((s) => ({key: s.id, w: weightOf(s)})), n);
     const l = new Array<number>(n).fill(0); for (const s of G) l[a.get(s.id)!] += val(s.id);
     const leg = Math.max(...l)/1000 + OH;
     console.log(`N=${n} leg_elapsed=${leg.toFixed(1)}s margin=${(B-leg).toFixed(1)}s ${(((B-leg)/B)*100).toFixed(1)}% ${leg<=B?"FITS":"OVER"}`);
   }'

§1.3 packs by (1) and scores by (2) through (4). It scores LEG ELAPSED, not child seconds: the
budget check reads elapsed.txt, and the difference is measured rather than assumed away.
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

**The rates under-price.** The shipped drift instrument (`scripts/check-rate-drift.ts`) over the
48 surfaces measured on run `32920754274` reports observed-over-declared ratios spanning 0.99x to
2.19x, **1.1952x in aggregate**. The aggregate is the load-bearing figure and it is what §1.3
acts on.

An earlier draft claimed every surface observes at or above its declared rate. That is false, and
how it got written is worth one sentence because the same mistake is available to anyone reading
this: the report sorts descending, the draft was written from the first forty lines, and the
counter-example is near the bottom. `acCoverage` declares 5006 ms per boot and observed 4974, a
ratio of 0.9936. One surface of 48 runs faster than its declaration. The bias is systematic in
aggregate and heavily one-sided, which is all §1.3 needs; it is not universal, and the spec does
not claim it is.

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

Runs scored: `32822546867` (2026-08-25) and `32920754274` (2026-08-26). Both ran on `main`, and
their TRIGGERS differ, which the first draft got wrong: `gh run view --json event` reports
`schedule` for the first and `workflow_dispatch` for the second. The `source-shards` job is not
gated on the trigger (only `notify` is, at `.github/workflows/mutation-harness.yml:335`), so the
legs are the same work either way; the provenance is stated correctly because combining two runs
into one timing envelope is exactly where a wrong provenance would matter.

Verbatim output of the header's command (4) over both run directories:

```
overhead_max=216.8s modelled-only=mutationWeightRecords,mutationWeightWeights,supabaseRetryingFetch,retryableRpcVolatilityScan
N=6 leg_elapsed=4404.4s margin=-804.4s -22.3% OVER
N=7 leg_elapsed=3838.9s margin=-238.9s -6.6% OVER
N=8 leg_elapsed=3298.6s margin=301.4s 8.4% FITS
N=9 leg_elapsed=3273.7s margin=326.3s 9.1% FITS
N=10 leg_elapsed=3273.7s margin=326.3s 9.1% FITS
```

| N | children on the binding leg | leg elapsed | margin | fits |
| --- | --- | --- | --- | --- |
| 6 | 4,187.6 s | 4,404.4 s | 22.3% over | no |
| 7 | 3,622.2 s | 3,838.9 s | 6.6% over | no |
| 8 | 3,081.8 s | 3,298.6 s | 301.4 s, 8.4% | yes |
| 9 | 3,056.9 s | 3,273.7 s | 326.3 s, 9.1% | yes |
| 10 | 3,056.9 s | 3,273.7 s | 326.3 s, 9.1% | yes |

**N = 8 is RATIFIED.** It is the smallest N that fits. Seven misses by 238.9 s, which no
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

### §2.1 The constant, and the three classes that derive from it

`SOURCE_SHARD_COUNT` goes from 4 to 8 in `tests/mutation/source/shardPartition.ts:26`. Its
comment justifies four on a premise that is now false, that max load is pinned by the heaviest
surface from n=4 onward, so it is rewritten rather than left to mislead.

The sites that derive from the constant fall into three classes with genuinely different failure
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

**That command generates CANDIDATES; it does not classify them.** Its output on this tree is
about thirty lines, most of them "four" in an unrelated sense (four required checks, four
registries, four review rounds), so the members below are the triaged result and the N/A rows are
part of the answer rather than omissions from it. Two members were missed by a hand sweep and
found by review, which is why this is written as command-plus-triage rather than as a list.

Members, repaired by DE-NUMBERING so the same sites cannot rot again at the next change:
`.github/workflows/mutation-harness.yml` lines 8, 150, 198 and 216;
`tests/mutation/source/shardPartition.test.ts:84`;
`tests/mutation/_metaSourceShardIntegrity.test.ts:5`;
`tests/mutation/source/records.test.ts` lines 314 and 323;
`tests/mutation/source/registry.ts:3332` (the `[0, 1, 2, 3]` in that sentence; the `"3600"` beside
it is the budget and stays); `vitest.projects.ts:86`; the root `.gitignore` comments at lines 111
and 126; and `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts:12`.

N/A, and why: the root `.gitignore` at lines 114 and 132 says "four required checks went red",
which is an incident count and not the shard count; `tests/planFences/readCore.test.ts:340` counts
plan-fence source extensions; `tests/mutationWeight/instrument.test.ts:1104` is a self-contained
fixture with its own literal 4 that does not import `SOURCE_SHARD_COUNT`; and the remaining hits
are "four" in prose about review rounds, guards and registries.

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
- **L-2. The declared rates under-price in aggregate, by 1.1952x, and not universally.** §1.2
  owns that measurement, the command that prints it, and the single counter-example (`acCoverage`
  at 0.9936). This is the predecessor arc's surface, its own `check-rate-drift` instrument reports
  it by design, and that report never fails a job because drift is information for whoever
  re-measures.
  The consequence for this spec is bounded and handled: it is why §1.2's table cannot be the
  basis for N, and why §1.3 scores against measured seconds instead.
- **L-3. Run-to-run variance reaches 1.29x on identical work, and its effect on the floor is an
  EXTRAPOLATION.** On the 42 surfaces measured in all three downloaded runs, run `32703467609`
  took 22,949.0 s where the other two took 17,683.2 s and 17,849.0 s. That is a real slow-runner
  event, one occurrence in three observed, and the 8.4% margin at N = 8 does not cover it.
  What is NOT measured, and an earlier draft asserted anyway: that run does not contain
  `controlOutlineResidue` at all, which was enrolled after it, so no observation says the atomic
  floor scales by 1.29x. It says 42 OTHER surfaces did. If the floor scales similarly, a run that
  slow breaches at every N; that conditional is the honest form, and the run that settles it has
  not happened yet.
- **L-5. AC-5's divisible/indivisible test is approximate, and it errs toward INDIVISIBLE.** The
  test asks whether a surface could fit a leg alone, so it adds the whole per-leg overhead to
  that surface's own child seconds, which is right for a surface that would BE alone. What makes
  it approximate is that the overhead figure is measured as a leg's `elapsed.txt` minus the sum
  of its children, so on a leg holding eight surfaces it contains the generation, baseline and
  orchestration time of all eight. Records carry no per-surface share of it: the fields are
  `outcomes`, `passed`, `runId`, `score`, `startedAt` and `surfaceId`, `runSurface` discards the
  baseline child's timing, and `elapsed.txt` gives only the whole-leg total.

  Attributing all of it to one candidate therefore OVERSTATES what that surface would cost alone,
  so the test can call a surface indivisible when a higher N would in fact have fitted it. The
  consequence is an escalation to bl-orch on a breach that raising N might have resolved: a human
  looking at a decision they would otherwise not have seen, which is a cost but not a wrong
  answer, and never a silent one. An earlier draft of this limit described a different test from
  the one AC-5 states and claimed the opposite error direction.
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
  the measured max leg breaches while the model says it fits, the response depends on WHERE the
  breach sits, because "raise N" is not always available and §1.4 and L-1 are why:

  The branch is decided by ONE number the breaching run already reports: the largest single
  surface total on the breaching leg, summed from that surface's own record. Only leg 0 holds one
  surface at N = 8 (the populations are 1, 5, 5, 8, 8, 8, 9, 8), so "is the binding leg the
  atomic one" is not by itself answerable, and this test replaces it:

  - **Divisible.** No single surface on the breaching leg, plus the per-leg overhead, exceeds the
    budget on its own. The leg is over because of what it holds TOGETHER, so a finer partition
    redistributes it. Raise N in this same PR and re-run.
  - **Indivisible.** Some single surface on that leg, plus the overhead, exceeds the budget by
    itself. No N helps, by §1.4, because no shard count places less than one surface on a leg.
    The response is L-1's: split that surface into separately-enrolled parts, or move the budget
    with the ceiling relation moved in lockstep, plus a message to bl-orch, because that is a
    scope decision this arc does not take alone. It is never a filed ledger row (§6).

  L-3's slow run is the indivisible case if the floor scales with it, which L-3 now says is an
  extrapolation rather than a measurement. AC-5 is not satisfiable by raising N when the
  indivisible branch is taken. Saying so is the criterion; pretending otherwise would make AC-5
  unfalsifiable in exactly the situation the spec predicts.

  **The test is approximate near the boundary, and L-5 says by how much.**
- **AC-6.** The twelve required checks green: `quality`, `unit-suite`, `x1-catalog-parity`,
  `x2-no-raw-codes`, `x3-trust-domain`, `x4-no-global-cursor`, `x5-email-canonicalization`,
  `x6-pg-cron-pivot`, `validation-schema-parity`, `affordance-matrix-parity`,
  `postgrest-dml-lockdown`, `traceability-audit`.
- **AC-7.** The tracked shard range is DERIVED from `SOURCE_SHARD_COUNT`, not a literal: a guard
  asserts that every index below the count is a path the ignore rules do not match, and that the
  first index at or above it is. Both halves are required; half one alone passes against a
  `.gitignore` that ignores nothing, which is the failure the scratch rule was written for.

  **The guard invokes `git check-ignore --no-index` and decides on the EXIT STATUS of that
  command with no `-v`.** Both halves of that sentence are load-bearing, and each closes a
  different fail-open that review found in a previous draft of this criterion.

  `--no-index`, because git suppresses the answer for a TRACKED path. Without the flag, half one
  would report "not ignored" for shard0 through shard7 whatever the ignore rules say, which is a
  guard that cannot fail for exactly the files it protects. Probed with an excludes file that
  DOES match a tracked shard:

  ```
  $ git -c core.excludesFile=<file naming shard0> check-ignore -v tests/mutation/guardSurfaces.shard0.test.ts
  exit=1                                    # "not ignored", though the pattern matches
  $ git -c core.excludesFile=<same> check-ignore -v --no-index tests/mutation/guardSurfaces.shard0.test.ts
  <file>:1:tests/mutation/guardSurfaces.shard0.test.ts	tests/mutation/guardSurfaces.shard0.test.ts
  exit=0
  ```

  No `-v` when deciding, because `-v` exits 0 whenever it has a rule to REPORT, and a negating
  rule is a rule. A path un-ignored by a later `!` line is therefore reported with exit 0 while
  not being ignored at all, so an exit-code-only implementation that passes `-v` reads "ignored"
  for a path that is not. Probed in a clean repository so no other ignore source competes:

  ```
  $ printf 'foo/bar.ts\n!foo/bar.ts\n' > .gitignore
  $ git check-ignore --no-index foo/bar.ts        ; echo exit=$?
  exit=1                                          # correct: the ! line un-ignores it
  $ git check-ignore -v --no-index foo/bar.ts     ; echo exit=$?
  .gitignore:2:!foo/bar.ts	foo/bar.ts
  exit=0                                          # the NEGATING rule, reported, exit 0
  ```

  `-v` may be used to build the failure message. It may not be used to decide.

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
| no shard slice is empty | ALREADY PINNED by `surfacesForShard` at `tests/mutation/source/records.test.ts:413`, which loops over `SOURCE_SHARD_COUNT` and so covers eight without an edit |

An earlier draft of this section listed the non-empty property as NEW and justified it with a
failure mode that does not exist. Both halves were wrong and both are worth recording, because
the mistake was to reason about vitest's behaviour instead of checking it. `records.test.ts:413`
already asserts every slice is non-empty, in a case titled `is LICENSED to error, because every
shard really does run a surface`, and its comment gives the same reasoning this spec was about to
give: a registry that shrank below the shard count would let an empty shard red a leg that did
nothing wrong. And an empty
shard file would not pass quietly in any case: `passWithNoTests` is not set anywhere in
`vitest.config.ts` or `vitest.projects.ts`, so it defaults false and vitest fails a file
containing no suites. Adding a second case would have been a duplicate that could not start red.

## §8 Ledger graduation

`BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER` is archived, not carried forward. The archive entry
records the decision (N = 8), the arithmetic (§1.2 and §1.3), and the residual: the incoming
231-site surface the row warned about has LANDED, it is `controlOutlineResidue`, and it is now
the floor L-1 describes at 90.9% of a leg. The row asked for the shard-count decision to be
taken as a fleet item rather than a unilateral edit. It was, by bl-orch, and this arc is it.
