# The source-mutation shard partition balances modelled child boots; it must balance seconds

**Row:** `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` (BACKLOG.md) · **Branch:** `fix/mutation-shard-weight-seconds` · **Facing:** process

**Every figure in this document is printed by one command.** `scripts/mutation-shard-weight-report.ts` reads the `mutation-records-source-shards-*` and `elapsed-source-shards-*` artifacts the nightly already uploads. Nothing below is retyped from a session transcript.

```
# each run needs the MODELLED boots of its own sha, so dump them from a checkout at that sha
for sha in 9b1bd6715 50ca72a56 2f1071b28; do git worktree add --detach ../bw-$sha $sha; done
gh run download <id> -D <dir>/meas-<id> \
  -p 'mutation-records-source-shards-*' -p 'elapsed-source-shards-*'

pnpm tsx scripts/mutation-shard-weight-report.ts \
  --run <dir>/meas-32822546867:<dir>/modelled-9b1bd6715.json \
  --run <dir>/meas-32703467609:<dir>/modelled-50ca72a56.json \
  --run <dir>/meas-32625602788:<dir>/modelled-50ca72a56.json \
  --run <dir>/meas-32559529251:<dir>/modelled-2f1071b28.json
```

The per-sha dump is not ceremony, and neither is the reconciliation the script runs before printing anything. It compares the record set and the modelled set in BOTH directions and recomputes the whole partition, then **exits non-zero** if a surface is missing from either side or ran on a leg it does not recompute to. Pointed at the 2026-08-24 records with the 2026-08-25 registry it names `controlOutlineResidue` as registry-only and lists 27 leg mismatches, and prints no counterfactual at all. A comparison across two trees is not a weaker measurement; it is a different question, and printing it anyway is how a cross-tree number gets quoted as a fact.

---

## §0 Problem

`weightOf` (`tests/mutation/source/shardPartition.ts:31-37`) returns `mutants.length + accepted.length * (suites - 1) + suites` — a count of modelled child boots. The short-circuit reasoning behind it is sound and is not what this spec disturbs: the per-mutant loop returns at the first suite whose child exits non-zero (`tests/mutation/source/runner.ts:214-224`), so a killed mutant costs one boot and a survivor pays every suite. What the count assumes on top of that is that every boot costs the same, quoted at ~0.75 s at `tests/mutation/source/runner.ts:19-25`.

**A drive-by correction, because this spec rewrites the comment that carries it.** The header at `tests/mutation/source/shardPartition.ts:10` credits the short-circuit to `runAllSuites`, and no such function exists anywhere in the harness. It is `runMutantRecorded`, and the cited line range is stale too. The reasoning was right and the name was not.

Measured on nightly run `32822546867` (sha `9b1bd6715`, all four legs completed):

```
=== meas-32822546867 — 43 surfaces ===
  reconciliation: records and modelled weights agree on all surfaces and all legs
  OBSERVED (the partition CI actually ran)             [5722, 6596, 3435, 4986]  binding 6596s  spread 1.920x
  children explain 97% / 98% / 97% / 97% of each leg's own elapsed.txt (5894 / 6711 / 3544 / 5144s)
    ...its MODELLED loads (what the optimiser balanced) [1241, 1248, 1244, 1246]  binding 1248s  spread 1.006x
  ms per MODELLED boot: min 1328 (citationIntent)  max 24230 (psqlStartupScan)  spread 18.3x
```

The optimiser is solving the wrong problem well. It balances its input to 1.006x and the thing anyone cares about lands 1.920x apart. The binding leg is 6596 s, which is 110 minutes against the 125-minute job ceiling, and the ceiling is what turns a slow leg into a silent one. The ceiling pin from `fix/mutation-shard-ceiling-pin` fixed the censoring; the imbalance that walks a leg toward it is untouched, and this is that repair.

Three earlier nightlies reproduce the shape: binding legs of 6974 s, 7149 s and 6400 s, with modelled loads at 1.008x, 1.008x and 1.006x, and rate spreads of 24.5x, 22.9x and 33.2x.

**Child seconds explain the leg**, at 97-98% of each leg's own `elapsed.txt` on both runs where the elapsed artifacts were downloaded. Balancing child seconds is therefore balancing the job, and `elapsed.txt` is the artifact the budget check already reads.

---

## §1 The decision

The row's first scheduled step names two candidates. Both were measured before either was argued, and both lose. Two more were measured because the first two lost.

### §1.0 What "better" means, and why it is NOT the spread

Every row below is scored the same way: take the weight under test, LPT-pack the surfaces with it, then add up the seconds those surfaces ACTUALLY took on the run being scored. The weight changes; the seconds are fixed measurements.

**The quantity that matters is the BINDING leg, not the spread.** Spread is `max / min`, and a partition that happens to leave one leg unusually light scores a worse ratio while costing nothing at all. The measured pairs contain exactly that case, so a criterion written on the spread would reject a weight that shortens the longest leg. What breaches a budget and crosses a ceiling is the longest leg, and nothing else.

### §1.1 Resolved scope — do not relitigate

Settled before review opens, each with where it was settled:

- **The short-circuit weighting is correct and stays.** A killed mutant costs one boot, a survivor pays every suite. This spec multiplies that count by a rate; it does not revisit the count.
- **`SOURCE_SHARD_COUNT` stays 4.** Raising it is a different lever with a CI-capacity cost owned by `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`, which measured 16 jobs per harness-touching PR.
- **The job ceiling and its factor over the budget are already shipped** by `fix/mutation-shard-ceiling-pin` and pinned in `tests/mutation/_metaSourceShardIntegrity.test.ts`. That arc fixed the censoring; this one fixes the imbalance that walks a leg toward it.
- **A committed number is accepted, deliberately.** The module header's "NO committed weight table" is a property this spec gives up on purpose, argued in §1.2 through §1.5 and rewritten in §2.2.
- **The drift report does not block a job.** §2.3 argues it from the failure direction. Declined, not overlooked.
- **The rate is calibrated per MODELLED boot, never per observed child.** §2.2. Calibrating against observed children would leave a systematic 1.31x factor between what is measured and what is used.
- **Local runs are unaffected.** No local path partitions by leg (§4 L-4).

### §1.2 Candidate (b), a derived proxy: DECLINED, refuted by measurement

The attraction is that a proxy is self-maintaining. The measurement says no proxy computable without running anything gets close.

```
    ...its MODELLED loads (what the optimiser balanced) [1241, 1248, 1244, 1246]  binding 1248s  spread 1.006x
    static proxy: mutant count alone                   [2550, 6458, 4179, 7553]  binding 7553s  spread 2.962x
```

The shipped model IS the best static proxy already in the building, and it produces the 6596 s binding leg in §0. Mutant count alone is worse. Uniformly scaling modelled boots by one global rate is not a third candidate: LPT is invariant under a positive scale factor, so "boots times one rate" IS the shipped partition.

The reason is structural rather than incidental. Cost per boot is a property of the SUITE — how long that surface's deciding suite takes to run once — and it ranges over 18.3x. No property of the source file predicts it, because the source file is not what runs.

### §1.3 Candidate (a) as normally built, a bolt-on measured table: DECLINED

This is the option the row warns goes stale, and its failure is not gradual decay. A table measured on one nightly has no row for a surface that enrolled after it, and the newest surface is exactly the one it cannot have. Over four nightlies, two of the five surfaces whose boot count moved were arrivals rather than changes: `connectionCensus` and `controlOutlineResidue`, the latter being the corpus's heaviest surface by seconds on the day it arrived.

Whatever a bolt-on table guesses for an unpriced arrival is a guess about the largest single term in the partition. §1.5 removes the guess rather than tuning it.

### §1.4 Candidate (c), measuring at partition time: DECLINED on determinism

Cost is not the objection. One boot of each surface's cheapest suite totals 76 s (64-76 s across the four runs), which is about 1.5% of a balanced leg.

The objection is that the partition is recomputed independently on four runners, and totality rests on all four computing the identical map. Each shard file calls `surfacesForShard(SOURCE_SHARD)` with no cross-leg coordination (`tests/mutation/guardSurfaces.shard0.test.ts:14` and its three siblings), and the gates file proves the union of the four slices is the registry (`tests/mutation/guardSurfaces.gates.test.ts:28`). A timing measurement is not reproducible across four machines. Two legs that measure differently partition differently, and a surface then runs twice or not at all. Not-at-all is the dangerous one: a surface no leg claims is silently unscored, and the gates file cannot see it, because it recomputes the same non-deterministic function.

A coordinator job measuring once and publishing the partition as an artifact would restore determinism, at the cost of a new job, a `needs:` edge serialising the matrix behind it, and turning the partition from a pure function into a downloaded input. That is a larger change to the harness's CI shape than this row's blast radius licenses. Recorded as limit L-1 rather than declined outright.

### §1.5 RATIFIED: a required per-surface rate, multiplied by freshly derived boots

```
weightOf(surface) = bootsOf(surface) * surface.millisPerBoot
```

`bootsOf` is today's expression, unchanged and still derived from the live source. `millisPerBoot` is a REQUIRED field on `GuardSurface`, measured by the enrolling author from the run they already perform.

**Held out on every consecutive pair of nightlies available**, seeding the rate from one run and scoring on the next, which the seed has never seen:

```
  seed meas-32703467609 -> score meas-32822546867
      seconds-calibrated weight                        [6307, 5320, 3203, 5910]  binding 6307s  spread 1.969x
      shipped modelled-boots weight                    [5722, 6596, 3435, 4986]  binding 6596s  spread 1.920x
    binding leg IMPROVED by 289s; arrivals priced by their author: controlOutlineResidue

  seed meas-32625602788 -> score meas-32703467609
      seconds-calibrated weight                        [5713, 5776, 5677, 5783]  binding 5783s  spread 1.019x
      shipped modelled-boots weight                    [4633, 6974, 4524, 6819]  binding 6974s  spread 1.541x
    binding leg IMPROVED by 1191s; arrivals priced by their author: none

  seed meas-32559529251 -> score meas-32625602788
      seconds-calibrated weight                        [5668, 5534, 5892, 6180]  binding 6180s  spread 1.117x
      shipped modelled-boots weight                    [4613, 7149, 4640, 6871]  binding 7149s  spread 1.550x
    binding leg IMPROVED by 969s; arrivals priced by their author: connectionCensus
```

**The binding leg is shorter on all three pairs — by 289 s, 1191 s and 969 s — and the spread is not.** On the first pair the spread is 1.969x against 1.920x, which is §1.0's point made by the data rather than in the abstract: that weight left one leg at 3203 s, which costs nothing, while shortening the longest leg by five minutes. A criterion on the spread would have rejected the better partition.

Two properties do the work, and they are separable.

**The extensive half stays derived.** Boots is recomputed from the source on every run, so a surface whose source grows gets more mutants, more boots and more weight with no table edit. That half moves: corpus modelled boots went 4386 to 4979 across the four nightlies. Committing total seconds per surface would freeze that growth until someone re-measured. Committing the RATE and deriving the COUNT puts the committed number on the slowly-varying half.

**A new surface can never be missing.** The field is required, so an enrolment without a rate is a TypeScript error, not a silent fallback. This is what removes §1.3's guess entirely, and it is the whole difference between this and a bolt-on table. The marginal cost to an enrolling author is reading one number off a run they already do: enrolment already requires a real run to establish `scoreFloor` and verify the `control` mutant, `.mutation-records/` is written on local runs too, and `--emit-registry` prints the value.

### §1.6 Why the count may stay biased, which the first review round forced into the open

Modelled boots and actual children are not the same number: 4979 against 6532 on the newest run, a factor of 1.31 overall and 4.60x on `paneCompactionCore`. The model prices a killed mutant at one boot, and a mutant killed by the sixth suite really spawned six.

The rate is therefore calibrated per MODELLED boot, `seconds * 1000 / bootsOf(surface)`, so that the product is a prediction of the surface's seconds. Any systematic bias in the count is absorbed into the rate, which is why the count only has to be PROPORTIONAL to cost as a source grows and never accurate in absolute terms. Calibrating against observed children instead would leave that 1.31x sitting between what was measured and what is used — and would make `boots * rate` reproduce the very seconds it was derived from, which is a tautology rather than a measurement.

---

## §2 Design

### §2.1 `GuardSurface.millisPerBoot`

A required integer field on the registry row, in milliseconds of wall clock per MODELLED boot, measured.

Every out-of-range input is named, because a weight that silently degrades is the defect this spec exists to remove:

| input | behavior |
| --- | --- |
| absent | TypeScript error at the registry literal. Required, not optional-with-default. |
| `0` or negative | Rejected by `validateSurface`, by surface id. A weightless surface is invisible to LPT and lands wherever the tie-break puts it, which is §1.3's guess in a new costume. |
| `NaN` | Rejected. `NaN` poisons every comparison in `lptAssign`, so one makes the whole partition arbitrary rather than one surface wrong. |
| non-integer | Rejected. The integer property (AC-6) is why milliseconds were chosen. |
| above `MUTANT_TIMEOUT_MS` | Rejected: no child can outlast the timeout bounding it, so such a value is a typo rather than a measurement. |

The guard extends `validateSurface` (`tests/mutation/source/registry.ts:56-82`), which already returns a problems list and already range-guards `scoreFloor` in exactly this shape, and which `tests/mutation/_metaGuardSurfaceRegistry.test.ts:41` already runs over every surface. It runs over the whole registry, so a surface enrolled later is covered without an edit.

### §2.2 `weightOf` and `bootsOf`

`bootsOf` is extracted from today's `weightOf` body verbatim and exported, because the drift report and the seeding emitter both need the count without the rate. `weightOf` becomes the product. `sourceShardAssignment`, `shardOfSurface` and `surfacesForShard` are untouched: the partition stays a pure function of the registry and the sources it names, computed identically on every runner.

The module header at `tests/mutation/source/shardPartition.ts:9-17` claims there is "NO committed weight table". That stops being true, and the comment is rewritten rather than left to mislead: there is now a committed COEFFICIENT per surface, the extensive quantity stays derived, and being wrong about a coefficient costs balance and never a verdict.

**Milliseconds, not seconds, and the reason is a live comment.** `lptAssign` documents itself as "Integer arithmetic + lexicographic ties only", and on that basis as "platform-independent" (`tests/parser/mutation/shardPartition.ts:17-19`). A float rate would falsify that sentence for the source harness while leaving it true for the parser one.

### §2.3 The freshness report, in the job that already reports cost

The `budget` job (`.github/workflows/mutation-harness.yml:241-280`) exists to report what the harness cost and is not a required check. It gains the records artifact alongside the elapsed one, and `scripts/check-shard-budget.ts` gains a second report.

**It names EVERY surface, not only the drifted ones.** The consequence bound in §3 promises that a misdeclared rate is named, and a report that speaks only above a threshold leaves every ratio inside that threshold unnamed while the promise still stands — which the first review round demonstrated with a 1.5x slowdown that no threshold report would have mentioned. So the report lists every surface with its declared rate, its observed rate and their ratio, ranked; a `2.0x` threshold marks which are ACTIONABLE. The threshold decides what is loud. It does not decide what is visible.

```
=== DRIFT of a meas-32703467609 table against meas-32822546867 — every surface, ranked ===
  ACTIONABLE ledgerGit                    declared  22272ms  observed   2675ms  8.33x
  ACTIONABLE reviewRoundCorpus            declared   5877ms  observed   1643ms  3.58x
  ACTIONABLE premiseScan                  declared   6887ms  observed   3347ms  2.06x
             fieldNearMiss                declared   4508ms  observed   2702ms  1.67x
             rowScanOpener                declared   5236ms  observed   3281ms  1.60x
```

Reporting rather than blocking follows the failure direction. A stale rate produces a slower leg, which the budget half of the same job already reports on its own terms. Making drift red would let a timing measurement — the one genuinely noisy input on this harness — fail a run whose verdicts are all correct.

Absent records are not silence: a surface with no record is reported as unmeasured, distinct from measured-and-agreeing, for the same reason the budget check separates "no elapsed record" from "under budget". The list is uncapped and needs no truncation rule: it is bounded above by the registry, and a run where most surfaces drifted is a report worth reading in full.

### §2.4 Seeding the existing rates

Seeded by `scripts/mutation-shard-weight-report.ts --emit-registry` from the MOST RECENT run in which each surface appears. Median applies only across records of one sha, where it filters noise rather than averaging over time.

**Most recent, and not an average over time, because the average was measured and it loses.** A median of the three prior nightlies applied to the newest scores essentially the same binding leg as shipping nothing: an average re-imports exactly the staleness this design exists to remove. `--emit-registry` exits non-zero naming any enrolled surface it cannot price, rather than emitting a table with a hole in it.

### §2.5 The instrument is a spec input and is built as one

`lib/mutationWeight/{records,weights}.ts` holds the logic and `scripts/mutation-shard-weight-report.ts` is a thin CLI adapter, mirroring `lib/observe/query/**` and `scripts/observe.ts`. A terminal CLI script cannot be enrolled in the source-mutation registry, and this module's defect class is precisely "reports OK while the output moved", so it is authored importable and enrolled before the first diff dispatch.

Its own arm is the reconciliation described at the top of this document, proven in both directions: a cross-tree invocation exits 1 and prints no counterfactual, a same-tree invocation exits 0.

### §2.6 What is deliberately not touched

- `SOURCE_SHARD_COUNT` stays 4; `SHARD_BUDGET_SECONDS` stays 3600; the ceiling factor pinned by `_metaSourceShardIntegrity` stays as `fix/mutation-shard-ceiling-pin` left it.
- No mutant, operator, suite, ledger row or score floor changes. Verdict neutrality (AC-1) is meaningless if this spec touches the things that decide verdicts.

---

## §3 Convergence criterion for this spec's own reviews

**Consequence bound.** Every enrolled surface is scored exactly once under the new weight, with the same verdict it had under the old one. A mis-declared rate produces a longer leg and a named entry in the budget report — named for ANY ratio other than exactly 1, per §2.3 — never a wrong or missing verdict. A rate that is merely inaccurate, with the imbalance reported, is a DOCUMENTED LIMIT and not a finding.

**Probe domain.** The live registry (`tests/mutation/source/registry.ts`), the `mutation-records-source-shards-*` and `elapsed-source-shards-*` artifacts of main's nightly `mutation-harness` runs, and the partition code (`tests/mutation/source/shardPartition.ts`, `tests/parser/mutation/shardPartition.ts`). A probe outside that set, or more than one ordinary edit away from an input in it, files to documented limits.

**Threat-model fence.** Cost and balance fidelity against ORDINARY drift: a suite that gets slower, a source that grows, a surface that enrols. NOT verdict correctness, and NOT an adversary choosing a hostile `millisPerBoot` — a contributor who can edit that field can already edit `accepted`, `scoreFloor` and the suite list, so a malicious registry edit is out of scope and always was.

**Score.** `sourceShardPartition` is already enrolled and `lib/mutationWeight/*` is enrolled by this arc, so the diff-stage criterion is their mutation score plus an empty unaccepted-survivor set, stated with the operator set it ranges over.

---

## §4 Documented limits

- **L-1 — a fully accurate weight is reachable and this design does not reach it.** Measuring at partition time gets it for 76 s of pre-pass and is declined only because four runners cannot agree on a timing measurement (§1.4). If the shard count grows or imbalance returns, a coordinator job publishing one partition is the next design, not a tighter rate table.
- **L-2 — a rate is one number for a surface whose mutants are not uniform.** The declared rate is their average, so a surface with a bimodal cost profile is priced at its mean and still misbalances. Sub-surface partitioning is the archived row's own deferred L-2 and stays deferred.
- **L-3 — the drift report is only as fresh as the last nightly.** A surface that slows down today is reported tomorrow morning at the earliest, and only if the leg holding it completed.
- **L-4 — the rates measure GitHub-hosted `ubuntu-latest` runners.** They balance legs on those runners and mean nothing on a developer machine. No local path partitions by leg, so local runs are unaffected.
- **L-5 — a rate is not always a property of the code, and one surface proves it.** `ledgerGit`'s deciding suite `tests/scripts/ledgerClaimsCheck.test.ts` had a median child of 27046 ms on 2026-08-24 and 2521 ms on 2026-08-25 (8.33x on the rate), while its sibling suite sat at 1518 ms on both days and its mutant count was 99 on both. Zero children recorded `kind: "timeout"` either night, so this is not the spurious-kill class. **The cause is not established and this limit is deliberately written as the measurement rather than as a theory.** Some deciding suites spawn real `tsx` children (`tests/scripts/ledgerClaimsCheck.test.ts:25-31`), so their cost can depend on machine state rather than on the code under mutation, and no committed rate can track that. It is the single reason the 08-24 pair improves by 289 s where the others improve by about a thousand, and it is the drift report's first customer. Chasing its root cause belongs in its own row, not here.

---

## §5 Acceptance criteria

- **AC-1 — verdict neutrality over the full surface set.** The same mutant set produces the same verdicts under the old weight and the new one. The population is ALL enrolled surfaces by construction, re-derived from the registry at claim time rather than carried from when this line was written, and stated with the count and the ref it was derived at. Proven by two routes with authority assigned by tree BEFORE either lands: the full CI matrix on this PR is authoritative for the branch tree; a scoped local run is authoritative only for the tree it ran on and triages, never certifies. The old-weight side is `workflow_dispatch` run `32844208485` on `main` at `300a9f937`, which is this branch's merge base.

  **The bar is sharp because it was measured first**, by the same script, from the same records:

  ```
  === VERDICTS across consecutive runs — the bar AC-1 has to clear ===
    meas-32703467609 -> meas-32822546867: 1 of 4328 shared siteIds moved across 42 shared surfaces — ledgerGit logical-connector:259:20:&&>|| KILLED->SURVIVED
    meas-32625602788 -> meas-32703467609: 0 of 4360 shared siteIds moved across 42 shared surfaces
    meas-32559529251 -> meas-32625602788: 0 of 3692 shared siteIds moved across 41 shared surfaces
  ```

  The single mover is already attributed to another arc and inherited here. Anything else is this arc's to answer.

  **A verdict CAN move for a reason that is not this weight, and the difference is decidable.** Repacking changes which surfaces share a leg, and co-tenancy has moved a verdict before. That is a determinism defect owned by `BL-MUTATION-HARNESS-MAIN-RED`, which this spec neither causes nor repairs. Any mover is re-run with its surface ALONE on a leg: green alone and red beside a neighbour is a co-tenancy finding filed there; red alone is this arc's. Recording which it was is part of satisfying this AC.

- **AC-2 — the partition stays total and disjoint.** The union of the four slices is exactly the registry and no surface appears twice, under the new weight, at whatever registry size is live at merge.

- **AC-3 — the binding leg, held out, with its failure direction.** For each committed pair of dated fixtures (rates seeded from one run, seconds from a LATER one), the binding leg under the seconds-calibrated weight is at or below the binding leg the shipped model produces ON THE SAME TARGET. Measured margins on the three available pairs are 289 s, 1191 s and 969 s. The criterion is stated as a comparison against the shipped model rather than as an absolute, because an absolute would be met or missed by how heavy the corpus happened to be that week.

  Seeding from a run and asserting against that same run is forbidden: the weight would be reproducing its own measurement. If rates drift and nobody refreshes them, the margin shrinks toward zero and the drift report names the surfaces responsible; it does not shrink toward a wrong verdict.

- **AC-4 — a surface cannot enrol without a rate.** Omitting `millisPerBoot` fails to compile; a non-positive, `NaN`, non-integer, or above-timeout value fails a test by name.

- **AC-5 — the drift report names every measured surface**, marks which are actionable, distinguishes unmeasured from agreeing, and leaves every job's exit status unchanged.

- **AC-6 — integer arithmetic is preserved.** Every weight `sourceShardAssignment` hands `lptAssign` is an integer, so the platform-independence the packer documents stays true.

- **AC-7 — no verdict-deciding input moves.** The diff touches no operator, mutant generator, suite path, ledger row or score floor.

Every guard added for these carries both arms: the passing case and a deliberately broken input that makes it fail, including the ordering and position variants where the guard reads a list.

---

## §6 Out of scope and N/A declarations

**Not applicable, declared rather than omitted.** No UI surface: nothing under `app/` or `components/` is touched, so the invariant-8 impeccable pair is `N/A` and there are no dimensional invariants, transition inventory, mode boundaries or rendered-versus-conceptual questions. No database surface: no migration, CHECK, enum, RPC or trigger, so the tier-by-domain and CHECK-migration matrices are `N/A`. No feature flag or env gate is introduced, so there is no flag lifecycle table and no build-versus-runtime gate moment — `millisPerBoot` is read at partition time in every environment, with no gate around it.

- `SOURCE_SHARD_COUNT`, the PR trigger's fan-out and the workflow's `concurrency` behavior — `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`.
- The nightly's coverage red and the inherited surviving mutant — `BL-MUTATION-HARNESS-MAIN-RED`.
- The root cause of L-5's instability — its own row if anyone wants it explained.
- The parser harness's eight-way partition. It weighs generated mutant counts over committed fixtures, where the boot-cost assumption has not been measured to fail.

## §7 Meta-test and registry inventory

| Surface | Guard | New or existing |
| --- | --- | --- |
| `readRun`, `rateOf`, `lpt`, `legSeconds` | a new suite under `tests/mutationWeight/`, created by the plan | new |
| `reconcile` is total both ways and fails | same new suite directory | new |
| `seedRates` takes most-recent, not an average | same new suite directory | new |
| `weightOf` returns boots × rate; weights are integers | `tests/mutation/source/shardPartition.test.ts` | existing case rewritten, integrality new |
| rate range and required-ness (AC-4) | `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | existing `reject(patch)` harness extended |
| binding-leg margin against held-out fixtures (AC-3) | a new suite beside `tests/mutation/source/shardPartition.test.ts` | new, with fixtures |
| drift report content and exit neutrality (AC-5) | a new suite under `tests/ci/` | new |
| budget job downloads the records artifact | `tests/mutation/_metaSourceShardIntegrity.test.ts` | existing pattern extended |
| totality and disjointness (AC-2) | `tests/mutation/source/shardPartition.test.ts:47-70` | existing, unchanged |
| `lib/mutationWeight/*` enrolled in the mutation registry | `tests/mutation/source/registry.ts` | new row |

## §8 Ledger graduation

`BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` graduates on merge. Its `**Status:** IN PROGRESS` marker comes off in this PR's last commit, before the merge, in the same commit that archives the entry.

**The merge is a fleet seam and is named as one.** Measured by the report script with a held-out seed, **29 of 43 surfaces (67%) change leg** under the new weight. Every in-flight arc's shard assignment changes the moment this lands, and any leg number quoted in an order, a handoff or a review brief written before it is stale. Landing is coordinated through `bl-orch` and does not happen while another arc holds an unlanded registry edit. `fix/admin-loader-ci-transient` (PR #882) enrols two surfaces and is that arc today.
