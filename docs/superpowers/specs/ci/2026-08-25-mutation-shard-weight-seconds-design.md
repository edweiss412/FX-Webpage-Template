# The source-mutation shard partition balances modelled child boots; it must balance seconds

**Row:** `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` (BACKLOG.md) · **Branch:** `fix/mutation-shard-weight-seconds` · **Facing:** process

**Every figure in this document is printed by one command.** `scripts/mutation-shard-weight-report.ts` reads the `mutation-records-source-shards-*` artifacts the nightly already uploads and prints the observed partition, the modelled loads that produced it, and each counterfactual weight scored against the seconds the run really spent. Nothing below is retyped from a session transcript.

```
gh run download 32822546867 -D <dir>/meas-32822546867 -p 'mutation-records-source-shards-*'
git worktree add --detach <meas> 9b1bd6715029e1a410b2309d6f6606786be34331   # the run's own sha
pnpm tsx scripts/mutation-shard-weight-report.ts <dir>/meas-32822546867

# §1.2 and §1.4 additionally need a second, older run; the FIRST directory is "now"
gh run download 32703467609 -D <dir>/meas-32703467609 -p 'mutation-records-source-shards-*'
pnpm tsx scripts/mutation-shard-weight-report.ts <dir>/meas-32822546867 <dir>/meas-32703467609
```

The worktree step is not ceremony. The modelled half is recomputed from the checked-out registry, so it describes the records only at the sha the records came from. The script reconciles its recomputed partition against the leg each record was observed in and prints `IDENTICAL` or names every mismatch, so a cross-tree reading announces itself rather than passing as a result. At `9b1bd6715` it reports `IDENTICAL` across all 43 surfaces; pointed at the 2026-08-24 run from the same checkout it reports 12 mismatches, which is the instrument refusing a comparison rather than a finding about that run.

---

## §0 Problem

`weightOf` (`tests/mutation/source/shardPartition.ts:31-37`) returns `mutants.length + accepted.length * (suites - 1) + suites` — a count of modelled child boots. The short-circuit reasoning behind it is sound and is not what this spec disturbs: the per-mutant loop returns at the first suite whose child exits non-zero (`tests/mutation/source/runner.ts:214-224`), so a killed mutant costs one boot and a survivor pays every suite. What the count assumes on top of that is that every boot costs the same, quoted at ~0.75 s at `tests/mutation/source/runner.ts:19-25`.

**A drive-by correction, because this spec rewrites the comment that carries it.** The header at `tests/mutation/source/shardPartition.ts:10` credits the short-circuit to `runAllSuites`, and no such function exists anywhere in the harness; the function is `runMutantRecorded`, and its cited line range is stale too. The reasoning was right and the name was not.

Measured on nightly run `32822546867` (sha `9b1bd6715`, all four legs completed):

```
  OBSERVED (the partition CI actually ran)                 [5722, 6596, 3435, 4986]  spread 1.920x  binding 6596s
  reconciliation: recomputed partition vs observed legs — IDENTICAL
    ...its MODELLED loads (what the optimiser balanced)    [1241, 1248, 1244, 1246]  spread 1.006x  binding 1248s
  seconds-per-boot: min 1.52  max 24.54  spread 16.2x
```

The optimiser is solving the wrong problem well. It balances its input to 1.006x and the thing anyone cares about lands 1.920x apart. The floor rate of 1.52 s/boot is itself twice the 0.75 s the comment assumes, so the model is wrong about the cheapest surface before per-suite execution time is considered at all.

The 2026-08-24 run reproduces the shape independently: observed 1.541x, modelled loads 1.008x, seconds-per-boot spread 21.9x.

**The consequence is never a wrong verdict.** A mis-weighted partition still runs every surface exactly once — `surfacesForShard` is total and disjoint over the registry, pinned at `tests/mutation/source/shardPartition.test.ts:47-70`. What it produces is an unbalanced leg: 6596 s is 110 minutes against the 125-minute job ceiling, and the ceiling is what turns a slow leg into a silent one. The ceiling pin from `fix/mutation-shard-ceiling-pin` fixed the censoring; the imbalance that walks a leg toward it is untouched, and this is that repair.

**Per-leg child seconds explain the leg.** Summed child durations are 5722 / 6596 / 3435 / 4986 s against the 5894 / 6711 / 3544 / 5144 s each leg stamped into its own `elapsed.txt` — between 96.9% and 98.3% of the leg, the remainder being checkout, setup and vitest collection. Balancing child seconds is therefore balancing the job, and `elapsed.txt` is the artifact the budget check already reads.

---

## §1 The decision

The row's first scheduled step names two candidates. Both were measured before either was argued, and both lose. A third and a fourth were measured because the first two lost.

### §1.0 What "better" means here

Every row below is scored the same way: take the weight under test, LPT-pack the 43 surfaces with it, then add up the seconds those surfaces ACTUALLY took on run `32822546867`. The weight changes; the seconds are fixed measurements. A weight is better exactly when the legs it produces are closer together.

The corpus is 20740 s, so a perfectly balanced leg is 5185 s. `controlOutlineResidue` alone is 3057 s, which floors every possible partition well below the balanced figure — that bound is not binding here, and it would be at a higher shard count.

### §1.1 Resolved scope — do not relitigate

Settled before review opens, each with where it was settled:

- **The short-circuit weighting is correct and stays.** A killed mutant costs one boot, a survivor pays every suite. This spec multiplies that count by a rate; it does not revisit the count.
- **`SOURCE_SHARD_COUNT` stays 4.** Raising it is a different lever with a CI-capacity cost owned by `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT` (BACKLOG.md), which measured 16 jobs per harness-touching PR.
- **The job ceiling and its factor over the budget are already shipped** by `fix/mutation-shard-ceiling-pin` and are not reopened here. That arc fixed the censoring; this one fixes the imbalance that walks a leg toward it.
- **A committed number is accepted, deliberately.** The module header's "NO committed weight table" is a property this spec gives up on purpose, with §1.1 through §1.3 as the argument and §2.2 as the rewritten comment. Re-raising "but the comment says there is no table" is answered there.
- **The drift report does not block.** §2.3 states the reason from the failure direction; making it red is declined, not overlooked.
- **Local runs are unaffected.** No local path partitions by leg, so nothing about developer experience turns on the rates (§4 L-4).

### §1.1 Candidate (b), a derived proxy: DECLINED, refuted by measurement

The attraction is that a proxy is self-maintaining. The measurement says every cheap proxy is worse than the model it would replace:

```
  LPT over MEASURED SECONDS (the accurate weight)          [5192, 5192, 5177, 5179]  spread 1.003x  binding 5192s
  LPT over boots (count only)                              [2698, 3957, 8462, 5623]  spread 3.137x  binding 8462s
  LPT over mutants (count only)                            [2550, 6458, 4179, 7553]  spread 2.962x  binding 7553s
```

A fourth proxy, boots multiplied by that surface's own cheapest observed boot — the most generous static proxy available, since it needs a measurement to compute at all — reaches 1.815x, still worse than shipping nothing.

The reason is structural rather than incidental. Cost per boot is a property of the SUITE: how long that surface's deciding suite takes to run once. No property of the source file predicts it, because the source file is not what runs. A proxy that never measures the suite cannot recover a 16x spread, and the numbers above are what that looks like.

### §1.2 Candidate (a) as normally built, a bolt-on measured table: DECLINED

This is the option the row warns goes stale, and the measurement is worse than "goes stale". A table measured on the 2026-08-24 nightly, applied to today's registry, depends almost entirely on what it does with the one surface it has never seen:

```
=== a table from meas-32703467609 applied to meas-32822546867 ===
  surfaces the older run never saw: controlOutlineResidue (3057s)
  bolt-on table, unmeasured priced at the heaviest measured surface [5362, 6094, 5103, 4181]  spread 1.458x  binding 6094s
  bolt-on table, unmeasured priced at the median rate x its boots   [5315, 5259, 2434, 7732]  spread 3.177x  binding 7732s
  bolt-on table, unmeasured priced at the MAX rate x its boots      [3124, 6389, 5904, 5322]  spread 2.045x  binding 6389s
```

Two of the three defensible fallback rules are WORSE than the 1.920x shipped today, one day after the table was measured. The median-rate rule — the obvious one, and the one anybody would write first — is 3.177x, because `controlOutlineResidue` charges 12.23 s/boot against a corpus median of 2.14 s/boot and gets priced at roughly a fifth of its real cost.

The cause is not drift in the rows the table does have. The best of the three rules reaches 1.458x precisely because it guesses high about the surface it does not know. **The staleness cost is concentrated almost entirely in the surface with no row**, and that surface is the newest one, which is exactly the surface a bolt-on table cannot have. Over four nightlies, two of the five surfaces whose boot count moved were arrivals rather than changes: `connectionCensus` (333 boots) and `controlOutlineResidue`, which at 250 boots was the corpus's heaviest surface BY SECONDS on the day it arrived.

So the failure mode of a bolt-on table is not gradual decay. It is a cliff at every enrolment, hit hardest by the heaviest new surface, and it is the enrolment seam this row already refuses to land across.

### §1.3 Candidate (c), measuring at partition time: DECLINED on determinism

Cost is not the objection. One boot of each surface's cheapest suite totals 76 s across 43 surfaces, 1.5% of a balanced leg, for the full 1.003x.

The objection is that the partition is recomputed independently on four runners, and totality rests on all four computing the identical map. Each shard file calls `surfacesForShard(SOURCE_SHARD)` with no cross-leg coordination (`tests/mutation/guardSurfaces.shard0.test.ts:14` and its three siblings), and the gates file proves the union of the four slices is the registry by calling `surfacesForShard` once per shard (`tests/mutation/guardSurfaces.gates.test.ts:28`). A timing measurement is not reproducible across four machines. Two legs that measure differently partition differently, and a surface then runs twice or not at all. Not-at-all is the dangerous one: a surface that no leg claims is silently unscored, and the gates file cannot see it, because the gates file recomputes the same non-deterministic function.

A coordinator job measuring once and publishing the partition as an artifact would restore determinism, at the cost of a new job, a `needs:` edge that serialises the matrix behind it, and turning the partition from a pure function into a downloaded input. That is a larger change to the harness's CI shape than this row's blast radius licenses, and CI shape is `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`'s subject, not this one's. Recorded as a documented limit (§4 L-1) rather than declined outright — if the shard count grows and imbalance returns, this is where to go.

### §1.4 RATIFIED: a required per-surface rate, multiplied by freshly derived boots

```
weightOf(surface) = bootsOf(surface) * surface.millisPerBoot
```

`bootsOf` is today's expression, unchanged and still derived from the live source. `millisPerBoot` is a REQUIRED field on `GuardSurface`, measured by the enrolling author from the run they already perform.

Two properties do the work, and they are separable.

**The extensive half stays derived.** Boots is recomputed from the source file on every run, so a surface whose source grows gets more mutants, more boots and more weight with no table edit. That half moves: corpus boots went 5771 → 6532 across four nightlies (+13%), and `paneCompactionCore` alone went 1134 → 1303 without a registry edit. A design that committed total seconds per surface would freeze that growth until someone re-measured. Committing the RATE and deriving the COUNT puts the committed number on the slowly-varying half.

**A new surface can never be missing.** The field is required, so an enrolment without a rate is a TypeScript error, not a silent fallback. This is what removes §1.2's cliff, and it is the whole difference between this and a bolt-on table. The marginal cost to an enrolling author is reading one number off a run they already do: enrolment already requires a real run to establish `scoreFloor` and to verify the `control` mutant, and `.mutation-records/` is written on local runs too, so the report script prints the value from records the author already has.

**Worst case beats the status quo.** Simulating a year of total neglect — every rate left at its 2026-08-24 value, no refresh ever — gives 1.756x, still better than the 1.920x shipped today, because the enrolment cliff is structurally impossible rather than merely unlikely. With a drift alarm firing at 2.0x, three surfaces refreshed in a day, it is 1.087x:

```
  declared rate, drift alarm at 1.25x (7 refreshed)        [5455, 4976, 4899, 5410]  spread 1.113x  binding 5455s
  declared rate, drift alarm at 1.5x (5 refreshed)         [5463, 5202, 4997, 5077]  spread 1.093x  binding 5463s
  declared rate, drift alarm at 2x (3 refreshed)           [5461, 5229, 5024, 5026]  spread 1.087x  binding 5461s
  declared rate, drift alarm at never refreshed (0 refreshed) [5858, 3409, 5487, 5987]  spread 1.756x  binding 5987s
```

The threshold is chosen at **2.0x** because the result is insensitive to it — 1.087x at 2.0x against 1.113x at 1.25x — so the loosest one buys the same balance for the fewest alarms. A knob whose settings do not matter should be set where it is quietest.

**Milliseconds, not seconds, and the reason is a live comment.** `lptAssign` documents itself as "Integer arithmetic + lexicographic ties only", and on that basis as "platform-independent" (`tests/parser/mutation/shardPartition.ts:17-19`). A float rate would falsify that sentence for the source harness while leaving it true for the parser one. An integer millisecond rate keeps every weight an integer and the claim intact.

---

## §2 Design

### §2.1 `GuardSurface.millisPerBoot`

A required integer field on the registry row, in milliseconds of wall clock per child boot, measured.

Every out-of-range input is named, because a weight that silently degrades is the defect this spec exists to remove:

| input | behavior |
| --- | --- |
| absent | TypeScript error at the registry literal. The field is required, not optional-with-default. |
| `0` or negative | Rejected by a registry guard, by surface id. A weightless surface is invisible to LPT and lands wherever the tie-break puts it, which is the enrolment cliff in a new costume. |
| `NaN` | Rejected by the same guard. `NaN` poisons every comparison in `lptAssign`, so a single one makes the whole partition arbitrary rather than making one surface wrong. |
| non-integer | Rejected. The integer property (AC-6) is the point of choosing milliseconds. |
| above `MUTANT_TIMEOUT_MS` | Rejected: no child can outlast the timeout that bounds it, so such a value is a typo rather than a measurement. |

The guard runs over the whole registry, not over a list of names, so a surface added later is covered without an edit.

### §2.2 `weightOf` and `bootsOf`

`bootsOf` is extracted from today's `weightOf` body verbatim and exported, because the drift report and the seeding script both need the count without the rate. `weightOf` becomes the product. `sourceShardAssignment`, `shardOfSurface` and `surfacesForShard` are untouched: the partition stays a pure function of the registry and the sources it names, computed identically on every runner.

The module header comment at `tests/mutation/source/shardPartition.ts:9-17` currently claims there is "NO committed weight table". That stops being true and the comment is rewritten rather than left to mislead: there is now a committed COEFFICIENT per surface, the extensive quantity stays derived, and being wrong about a coefficient costs balance and never a verdict.

### §2.3 The freshness report, in the job that already reports cost

The `budget` job (`.github/workflows/mutation-harness.yml:241-280`) exists to report what the harness cost and is not a required check. It gains the records artifact alongside the elapsed one, and `scripts/check-shard-budget.ts` gains a second report: for every surface whose observed seconds-per-boot differs from its declared `millisPerBoot` by more than 2.0x in either direction, name the surface, both figures, and the registry line to edit.

Reporting rather than blocking is deliberate and follows the failure direction. A stale rate produces a slower leg, which the budget half of the same job already reports on its own terms. Making drift red would let a timing measurement — the one input on this harness that is genuinely noisy — fail a run whose verdicts are all correct.

Absent records are not silence: a surface with no record in the artifact set is reported as unmeasured, distinct from measured-and-agreeing, for the same reason the budget check separates "no elapsed record" from "under budget".

The drift list is uncapped and needs no truncation rule: it is bounded above by the registry, every entry names a distinct surface, and a run in which most surfaces drifted is a report worth reading in full.

### §2.4 Seeding the 43 existing rates

Seeded from the nightly records by `scripts/mutation-shard-weight-report.ts --emit-registry`, using the MEDIAN observed rate across every downloaded nightly in which a surface appears, and the single observation where it appears once. The median is not decoration: `ledgerGit` moved 8.25x between two consecutive nightlies when a sibling arc's timeout repair landed, and a mean would carry that anomaly into the seed.

The seeding run and its inputs are recorded in the plan, so the committed values name the runs they came from.

**The instrument is a spec input and is treated as one.** `scripts/mutation-shard-weight-report.ts` produces every number above, so a defect in it is a defect in this document. Its own arm is the reconciliation line: it recomputes the partition and compares it against the leg each record was observed in, so the one error that would corrupt every figure — reading records from one tree against weights from another — fails loudly rather than printing a plausible table. That arm found its first customer immediately, refusing the 2026-08-24 records against a 2026-08-25 checkout with 12 named mismatches. It gets executable coverage in the plan rather than resting on having been run once.

### §2.5 What is deliberately not touched

- `SOURCE_SHARD_COUNT` stays 4. Rebalancing is the repair; raising the count is a different lever with a CI-capacity cost that belongs to `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`.
- `SHARD_BUDGET_SECONDS` stays 3600, and the ceiling factor pinned by `_metaSourceShardIntegrity` stays as `fix/mutation-shard-ceiling-pin` left it.
- No mutant, operator, suite, ledger row or score floor changes. Verdict neutrality (§5 AC-1) is meaningless if this spec touches the things that decide verdicts.

---

## §3 Convergence criterion for this spec's own reviews

**Consequence bound.** Every enrolled surface is scored exactly once under the new weight, with the same verdict it had under the old one; a mis-declared rate produces an unbalanced leg and a named entry in the budget report, never a wrong or missing verdict. A rate that is merely inaccurate, with the imbalance reported, is a DOCUMENTED LIMIT and not a finding.

**Probe domain.** The live registry (`tests/mutation/source/registry.ts`), the `mutation-records-source-shards-*` and `elapsed-source-shards-*` artifacts of main's nightly `mutation-harness` runs, and the partition code (`tests/mutation/source/shardPartition.ts`, `tests/parser/mutation/shardPartition.ts`). A probe outside that set, or more than one ordinary edit away from an input in it, files to documented limits.

**Threat fence.** Cost and balance fidelity against ordinary drift — a suite that gets slower, a source that grows, a surface that enrols. NOT verdict correctness, and NOT an adversary choosing a rate to break the partition: a contributor who can edit `millisPerBoot` can already edit `accepted`, `scoreFloor` and the suite list, so a hostile registry edit is out of scope here and always was.

**Score.** `sourceShardPartition` is enrolled in the source-mutation registry, so the diff-stage criterion is its mutation score plus an empty unaccepted-survivor set, stated with the operator set it ranges over. Measured and stated in the round-1 diff brief per the AGENTS.md enrolment-precedes-review rule.

---

## §4 Documented limits

- **L-1 — 1.003x is reachable and this design does not reach it.** Measuring at partition time gets the full balance for 76 s of pre-pass, and is declined only because four runners cannot agree on a timing measurement (§1.3). If the shard count grows or imbalance returns, a coordinator job publishing one partition is the next design, not a tighter rate table.
- **L-2 — a rate is one number for a surface whose mutants are not uniform.** Boots within one surface vary; the declared rate is their average. A surface with a bimodal cost profile is priced at its mean and will still misbalance. Sub-surface partitioning is the archived row's own deferred L-2 and stays deferred.
- **L-3 — the drift report is only as fresh as the last nightly.** A surface whose suite slows down today is reported tomorrow morning at the earliest, and only if the leg holding it completed. A cancelled leg reports nothing for the surfaces it held, which is the ceiling-pin row's subject.
- **L-4 — the seeded rates are a measurement of GitHub-hosted `ubuntu-latest` runners.** They are used to balance legs on those runners and mean nothing on a developer machine. Local runs are unaffected: no local path partitions by leg.

---

## §5 Acceptance criteria

- **AC-1 — verdict neutrality over the full surface set.** The same mutant set produces the same verdicts under the old weight and the new one. The population is ALL enrolled surfaces by construction, re-derived from the registry at claim time rather than carried from when this line was written, and stated with the count and the ref it was derived at. Proven by two routes with authority assigned by tree BEFORE either lands: the full CI matrix on this PR is authoritative for the branch tree; a scoped local run is authoritative only for the tree it ran on and is used to triage, never to certify.

  **A verdict CAN move for a reason that is not this weight, and the difference is decidable.** Repacking changes which surfaces share a leg, and co-tenancy has been observed to move a verdict before: one surface scored RED on a PR and GREEN on main the same day, with identical source, operators and suites, after an unrelated enrolment repacked the partition. That is a determinism defect in the harness, owned by `BL-MUTATION-HARNESS-MAIN-RED`, and this spec neither causes nor repairs it. It is distinguished rather than assumed away: a verdict that moves is re-run with the surface ALONE on a leg, and a surface that is green in isolation and red beside a neighbour is a co-tenancy finding filed there, while a surface that is red in isolation is this arc's to answer. Recording which of the two it was is part of satisfying this AC, not an aside.
- **AC-2 — the partition stays total and disjoint.** The union of the four slices is exactly the registry and no surface appears twice, under the new weight, at whatever registry size is live at merge.
- **AC-3 — balance, stated as a bound with its failure direction.** LPT over the seeded rates, scored against a committed per-surface seconds fixture, produces a leg spread at or below 1.15x and a binding leg at or below 5600 s, against 1.920x and 6596 s shipped. The fixture is the per-surface child seconds of run `32822546867` at sha `9b1bd6715`, committed as a DATED historical measurement and labelled as one: it certifies the weight model against a tree that existed, and it is never refreshed to track main, because a fixture that moves with the registry would let the bound be met by editing the fixture. If rates drift and nobody refreshes them, the bound degrades toward 1.756x, which is still below the shipped 1.920x; it does not degrade toward a wrong verdict.
- **AC-4 — a surface cannot enrol without a rate.** Omitting `millisPerBoot` fails to compile; a non-positive value or one above the mutant timeout fails a test by name.
- **AC-5 — the drift report names surfaces, both figures and the file to edit**, distinguishes unmeasured from agreeing, and does not change any job's pass or fail.
- **AC-6 — integer arithmetic is preserved.** Every weight `sourceShardAssignment` hands `lptAssign` is an integer, so the platform-independence the packer documents stays true.
- **AC-7 — no verdict-deciding input moves.** The diff touches no operator, mutant generator, suite path, ledger row or score floor.

Every guard added for these carries both arms: the passing case and a deliberately broken input that makes it fail, including the ordering and position variants where the guard reads a list.

---

## §6 Out of scope and N/A declarations

**Not applicable, declared rather than omitted.** No UI surface: nothing under `app/` or `components/` is touched, so the invariant-8 impeccable pair is `N/A` and there are no dimensional invariants, transition inventory, mode boundaries or rendered-versus-conceptual questions to state. No database surface: no migration, CHECK, enum, RPC or trigger, so the tier-by-domain and CHECK-migration matrices are `N/A`. No feature flag or env gate is introduced, so there is no flag lifecycle table and no build-versus-runtime gate moment to pin — `millisPerBoot` is read at partition time in every environment, with no gate around it.

- `SOURCE_SHARD_COUNT`, the PR trigger's fan-out, and the workflow's `concurrency` behavior — `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`.
- The nightly's current coverage red and the inherited surviving mutant — `BL-MUTATION-HARNESS-MAIN-RED`.
- The job ceiling and its factor over the budget — `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`, already shipped.
- The parser harness's own eight-way partition. It weighs generated mutant counts over committed fixtures, where the boot-cost assumption has not been measured to fail.

## §7 Meta-test and registry inventory

| Surface | Guard | New or existing |
| --- | --- | --- |
| `weightOf` returns boots × rate | `tests/mutation/source/shardPartition.test.ts` | existing case rewritten |
| every weight is an integer (AC-6) | `tests/mutation/source/shardPartition.test.ts` | new |
| rate range and required-ness (AC-4) | `tests/mutation/source/registry` guard | new |
| balance bound against the seconds fixture (AC-3) | `tests/mutation/source/shardPartition.test.ts` | new, with fixture |
| drift report content and neutrality (AC-5) | `tests/ci` budget-checker suite | new |
| budget job downloads the records artifact | `tests/mutation/_metaSourceShardIntegrity.test.ts` | existing pattern extended |
| totality and disjointness (AC-2) | `tests/mutation/source/shardPartition.test.ts:47-70` | existing, unchanged |

## §8 Ledger graduation

`BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` graduates on merge. Its `**Status:** IN PROGRESS` marker comes off in this PR's last commit, before the merge, in the same commit that archives the entry.

**The merge is a fleet seam and is named as one.** A weight change re-partitions every enrolled surface at once, so every in-flight arc's shard assignment changes the moment this lands, and any leg number quoted in an order, a handoff or a review brief written before it is stale. Landing is coordinated through `bl-orch` and does not happen while another arc holds an unlanded registry edit. `fix/admin-loader-ci-transient` (PR #882) enrols two surfaces and is that arc today.
