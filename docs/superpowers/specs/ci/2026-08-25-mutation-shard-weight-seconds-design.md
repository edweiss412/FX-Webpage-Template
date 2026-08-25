# The source-mutation shard partition balances modelled child boots; it must balance seconds

**Row:** `BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` (BACKLOG.md) · **Branch:** `fix/mutation-shard-weight-seconds` · **Facing:** process

**Every figure in this document is printed by one command.** `scripts/mutation-shard-weight-report.ts` reads the `mutation-records-source-shards-*` and `elapsed-source-shards-*` artifacts the nightly already uploads. Nothing below is retyped from a session transcript.

```
# 1. each run needs the MODELLED boots of ITS OWN sha, dumped from a checkout at it
for sha in 9b1bd6715 50ca72a56 2f1071b28; do
  git worktree add --detach ../bw-$sha $sha
  ln -s "$PWD/node_modules" "../bw-$sha/node_modules"
  cat > "../bw-$sha/dump.mts" <<'EOF'
import { writeFileSync } from "node:fs";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
import { weightOf } from "./tests/mutation/source/shardPartition";
const out = {};
for (const s of GUARD_SURFACES) {
  const boots = weightOf(s), suites = s.suitePaths.length;
  out[s.id] = { boots, mutants: boots - s.accepted.length * (suites - 1) - suites,
                accepted: s.accepted.length, suites };
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
EOF
  (cd "../bw-$sha" && ./node_modules/.bin/tsx dump.mts "<dir>/modelled-$sha.json")
done

# 2. the artifacts, newest run first
gh run download <id> -D <dir>/meas-<id> \
  -p 'mutation-records-source-shards-*' -p 'elapsed-source-shards-*'

# 3. the report
pnpm tsx scripts/mutation-shard-weight-report.ts \
  --run <dir>/meas-32822546867:<dir>/modelled-9b1bd6715.json \
  --run <dir>/meas-32703467609:<dir>/modelled-50ca72a56.json \
  --run <dir>/meas-32625602788:<dir>/modelled-50ca72a56.json \
  --run <dir>/meas-32559529251:<dir>/modelled-2f1071b28.json
```

The per-sha dump is not ceremony, and neither is the reconciliation the script runs before printing anything. It **exits non-zero** on any of five disagreements, and prints no counterfactual at all:

| arm | what it catches |
| --- | --- |
| a surface in the records only | the dump predates an enrolment |
| a surface in the registry only | the run predates one, or a leg died holding it |
| a surface on a leg it does not recompute to | the partition itself differs |
| the dump and the records disagree on a surface's MUTANT count | a weight moved WITHOUT moving the partition |
| more than one record for a surface | collapsing them by id silently doubles that surface's seconds |

The mutant-count arm is the one a partition-level check cannot have, and its absence was a blocking review finding: a single surface lands on the same leg whatever it weighs, so membership and legs can both agree while the weight moved. The suite count is compared as a BOUND rather than an equality, because the runner short-circuits at the first rejecting suite: a surface whose every mutant dies in suite one never enters suites two and three, so `citationIntent` running one of three declared suites is ordinary rather than a defect. Only the other direction is impossible on one tree.

A comparison across two trees is not a weaker measurement; it is a different question, and printing it anyway is how a cross-tree number gets quoted as a fact.

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
  seed meas-32703467609 -> score meas-32822546867  (42 surfaces scored)
      seconds-calibrated weight                        [5174, 3394, 3979, 5136]  binding 5174s  spread 1.524x
      shipped modelled-boots weight                    [2247, 6138, 3827, 5471]  binding 6138s  spread 2.732x
    binding leg IMPROVED by 965s; EXCLUDED as unpriceable held-out: controlOutlineResidue (3057s)

  seed meas-32625602788 -> score meas-32703467609  (42 surfaces scored)
      seconds-calibrated weight                        [5713, 5776, 5677, 5783]  binding 5783s  spread 1.019x
      shipped modelled-boots weight                    [4633, 6974, 4524, 6819]  binding 6974s  spread 1.541x
    binding leg IMPROVED by 1191s; EXCLUDED as unpriceable held-out: none

  seed meas-32559529251 -> score meas-32625602788  (41 surfaces scored)
      seconds-calibrated weight                        [4900, 5409, 5208, 5195]  binding 5409s  spread 1.104x
      shipped modelled-boots weight                    [3460, 6532, 6569, 4150]  binding 6569s  spread 1.899x
    binding leg IMPROVED by 1160s; EXCLUDED as unpriceable held-out: connectionCensus (2562s)
```

**The binding leg is shorter on all three pairs — by 965 s, 1191 s and 1160 s — and the spread is shorter on all three as well.**

**A surface the seed run never saw is EXCLUDED from both sides, not priced.** This is the correction that produced the numbers above, and the reason matters more than the numbers. An earlier version fell back to the LATER run's own rate for such a surface, which makes `boots x rate` reproduce that run's seconds exactly: the surface scored itself, and two of the three pairs were quietly part in-sample. There is no honest synthetic rate for a surface nobody has measured yet — in production its enrolling author measures it, and that measurement is not reconstructible after the fact. So it leaves the comparison, on both sides equally, and is named with its seconds so nothing is hidden. Excluding the heaviest surface makes the shipped model look worse, because that surface was doing balancing work by accident; that is a true statement about the shipped model on that population, not a thumb on the scale.

Two properties do the work, and they are separable.

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

The `budget` job (`.github/workflows/mutation-harness.yml:241-280`) exists to report what the harness cost and is not a required check. It gains the records artifact alongside the elapsed one, and a SECOND STEP running a new drift-check script, added by the plan under `scripts/` beside the budget checker.

**A new script, not an extension of `scripts/check-shard-budget.ts`, and that file's own header says why.** That file states it "DECIDES NOTHING" and that every decision lives in `lib/ci/shardBudget.ts`, "because a guard with its CLI main inline cannot be imported and therefore cannot be enrolled in the source-mutation registry" — and it takes ENVIRONMENT rather than argv as the class-level repair for three consecutive rounds in which three successive argv guards each accepted a spelling they had not modelled. The new script mirrors both properties exactly: env-driven, no defaults, exit 2 on a missing variable, decisions in `lib/mutationWeight/weights.ts`. Extending the existing CLI would put a second concern inside a file whose whole design is having one.

The registry read stays out of `lib/`: no file under `lib/` imports `tests/`, and `driftReport` already takes the declared rates as a plain map rather than importing the registry, so the script reads the registry and the library decides.

**It names EVERY surface, not only the drifted ones**, and it distinguishes THREE states rather than two. The consequence bound in §3 promises that a misdeclared rate is named, and a report that speaks only above a threshold leaves every ratio inside that threshold unnamed while the promise still stands — which review demonstrated with a 1.5x slowdown no threshold report would mention. So every surface appears with its declared rate, its observed rate and their ratio, ranked; a `2.0x` threshold only marks which are ACTIONABLE. The threshold decides what is loud, never what is visible.

| state | meaning |
| --- | --- |
| ranked, with both rates | it ran and it has a declared rate |
| **declared but unmeasured** | the rate exists and nothing ran it — a leg died, or the surface was skipped |
| **measured but undeclared** | it ran and carries no rate — the arrival shape |

The third state is not a formality. An earlier version skipped a measured surface with no declared rate, so a newly enrolled surface — the one case where a missing rate matters most — appeared in no list at all while the report still claimed to name everything.

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

Seeded by `scripts/mutation-shard-weight-report.ts --emit-registry`, which for each surface finds the NEWEST sha that measured it and takes the median across every run at THAT sha. Runs at older shas are ignored entirely rather than blended in.

**Most recent, and not an average over time — and the honest margin is narrower than it first looks.** Measured on the same target and the same population, a median across ALL prior runs produces a binding leg of 5157 s against most-recent's 5174 s. On the binding leg they tie; the two separate on spread, 2.202x against 1.524x.

So the case for most-recent is not that the average collapses. It is that an average over time carries a REGIME CHANGE for as many runs as the window is long: when `ledgerGit`'s rate moved 8.33x overnight (L-5), a median of three washes that out over three nightlies while most-recent takes it immediately, and the drift report is built to make exactly that correction visible the next morning. Choosing the rule that responds fastest to a measured step change is the point; the tie on the binding leg says the choice is cheap, not that it is arbitrary.

A median WITHIN one sha is a different operation with a different justification — a noise filter over repeated measurements of one program — and it is reachable in practice, since the 2026-08-23 and 2026-08-24 nightlies both ran at `50ca72a56`.

`--emit-registry` checks completeness BEFORE it emits anything and exits non-zero naming any enrolled surface it cannot price. Order matters: writing and then failing leaves on disk the exact partial table this refuses to produce, and the next reader cannot tell it from a complete one. It writes to stdout rather than to a file, so it cannot dirty whatever directory the caller happened to be in.

### §2.4.1 Where an author's FIRST rate comes from

A required field removes the guess only if there is somewhere to get the number. Read carelessly there is a loop — the runner runs what the registry lists, so a surface has no measurement until it is enrolled — and an author who hits that loop will commit a guess, which is the exact failure the required field exists to prevent. The loop is not real:

1. Add the row in the WORKING TREE with any placeholder rate. Nothing is committed.
2. Run the surface. `.mutation-records/` is written on local runs as well as CI, so the record lands on disk.
3. Read the rate off that record, replace the placeholder, commit.

The placeholder exists for exactly one uncommitted step, and the committed row has never carried a guess. The author's number is measured on the author's machine while the seeds this arc commits were measured on GitHub-hosted runners (L-4), so the first nightly after an enrolment is EXPECTED to move that surface's rate. Saying so here is what stops it reading as a defect the first time it happens.

### §2.5 The instrument is a spec input and is built as one

`lib/mutationWeight/{records,weights}.ts` holds the logic and `scripts/mutation-shard-weight-report.ts` is a thin CLI adapter, mirroring `lib/observe/query/**` and `scripts/observe.ts`. A terminal CLI script cannot be enrolled in the source-mutation registry, and this module's defect class is precisely "reports OK while the output moved", so it is authored importable and enrolled before the first diff dispatch.

Its own arm is the reconciliation described at the top of this document, proven in both directions: a cross-tree invocation exits 1 and prints no counterfactual, a same-tree invocation exits 0.

**The tests and the enrolment ship WITH the modules, not with the plan.** Deferring them to a later document would leave implementation-without-tests standing on the branch, which plan-wide invariant 1 classifies as a P0 no later plan can cure. `tests/mutationWeight/instrument.test.ts` carries 28 cases; `scripts/mutation-weight-plant.mjs` plants fifteen named defects into a copy and requires the suite to go red on each, reporting ANCHOR-FAIL when nothing was planted and BROKEN-PLANT when the mutant did not compile, so neither can read as a pass. Building it exposed three defects in the suite it was meant to certify — a tie-break fixture that could not express the difference it named, a boolean assertion that threw and masked every check after it, and one plant that never compiled — each of which would otherwise have shipped as a passing test proving nothing.

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

- **L-6 — the absorption argument holds while the MIX holds, and the mix is measured.** §1.6 says a systematic bias in the count is absorbed by the rate, so the count need only be PROPORTIONAL to cost as a source grows. That is true while the kill-position mix is stable and false when it moves: `bootsOf` prices every killed mutant at one boot, so new mutants killed by the first suite grow both counts about equally, while new mutants killed by the LAST suite grow real boots by up to the suite count and modelled boots by one.

  Probed rather than reasoned. The per-surface `observed / modelled` boot ratio on 2026-08-25 across 43 surfaces is **min 0.50, median 0.99, max 4.60** (`paneCompactionCore`) — right for the typical surface, wrong in a long tail. And it is STABLE: across four nightlies **only 1 of 43 surfaces moved its ratio by more than 5%**, that one going 4.08 to 4.60. So the mechanism is real, slow, and small over the window measured, its consequence is the usual longer-leg-named-in-the-report, and the drift report is its detector. (The 0.50 floor is the same effect inverted: a surface runs FEWER children than modelled when ledgered `accepted` rows name mutants the suite actually kills, so they never pay every suite.)

  This is a DIFFERENT limit from L-2. L-2 is cost variance between the mutants of one surface at a fixed mix; L-6 is the count model's bias changing when the mix moves.

- **L-7 — a surface whose deciding suite SKIPS reads as almost free.** If a suite is env-gated and skips in the run a seed is taken from, the observed seconds collapse and the emitted rate is tiny but positive, so the `> 0` guard passes. The surface is under-weighted until the next nightly ranks it at the top of the drift report. Same consequence, named rather than silent.

---

## §5 Acceptance criteria

- **AC-1 — verdict neutrality, over three populations that are NOT one population.** "The same mutant set produces the same verdicts" is unachievable as a single claim, and review was right to say so: this arc enrols two new surfaces that have no prior verdict at all, and edits the source of an already-enrolled one, which changes that surface's mutant set by construction. Stating it as one claim over "ALL enrolled surfaces" would be a promise no evidence could keep. The population is therefore partitioned at claim time, re-derived from the diff rather than carried from when this line was written, and each part gets the claim it can actually support:

  | population | derived by | the claim |
  | --- | --- | --- |
  | (i) surfaces whose `sourcePath` this diff does not touch | the diff, at claim time | the mutant set is identical and EVERY verdict matches the old-weight baseline |
  | (ii) `sourceShardPartition`, whose source this diff edits | named, and it is the only one | its mutant set moves; the claim is that no survivor is left unaccepted |
  | (iii) `mutationWeightRecords`, `mutationWeightWeights`, newly enrolled | named | no prior verdict exists; the claim is the score floor with an empty unaccepted-survivor set |

  Only (i) is verdict neutrality. (ii) and (iii) are ordinary gate obligations and are stated separately so neither can be mistaken for it.

  The old-weight side of (i) is `workflow_dispatch` run `32844208485` on `main` at `300a9f937`, this branch's merge base. Authority is assigned by tree BEFORE either lands: the full CI matrix on this PR is authoritative for the branch tree; a scoped local run is authoritative only for the tree it ran on, and triages rather than certifies.

  **The bar for (i) is sharp because it was measured first**, by the same script, from the same records:

  ```
  === VERDICTS across consecutive runs — the bar AC-1 has to clear ===
    meas-32703467609 -> meas-32822546867: 1 of 4328 shared siteIds moved across 42 shared surfaces — ledgerGit logical-connector:259:20:&&>|| KILLED->SURVIVED
    meas-32625602788 -> meas-32703467609: 0 of 4360 shared siteIds moved across 42 shared surfaces
    meas-32559529251 -> meas-32625602788: 0 of 3692 shared siteIds moved across 41 shared surfaces
  ```

  The single mover is already attributed to another arc and inherited here.

  **A verdict CAN move for a reason that is not this weight, and the difference is decidable.** Repacking changes which surfaces share a leg, and co-tenancy has moved a verdict before. That is a determinism defect owned by `BL-MUTATION-HARNESS-MAIN-RED`, which this spec neither causes nor repairs. Any mover in population (i) is re-run with its surface ALONE on a leg: green alone and red beside a neighbour is a co-tenancy finding filed there; red alone is this arc's. Recording which it was is part of satisfying this AC.

- **AC-2 — the partition stays total and disjoint.** The union of the four slices is exactly the registry and no surface appears twice, under the new weight, at whatever registry size is live at merge.

- **AC-3 — the binding leg, held out, with its failure direction.** For each committed pair of dated fixtures (rates seeded from one run, seconds from a LATER one), the binding leg under the seconds-calibrated weight is at or below the binding leg the shipped model produces ON THE SAME TARGET and over the SAME scored population. Measured margins on the three available pairs are 965 s, 1191 s and 1160 s. The criterion is a comparison against the shipped model rather than an absolute, because an absolute would be met or missed by how heavy the corpus happened to be that week.

  Two constructions are forbidden and the test pins both. Seeding from a run and asserting against that same run is the weight reproducing its own measurement. Pricing a surface the seed never saw from the SCORED run's own rate is the same tautology wearing a fallback's clothes, and it silently contaminated two of these three pairs before review caught it — such surfaces are excluded from both sides and named.

  Three consecutive pairs is what the artifacts allow and is not a claim of generality; the margin is a measurement of this corpus over four days. If rates drift and nobody refreshes them the margin shrinks toward zero and the drift report names the surfaces responsible. It does not shrink toward a wrong verdict.

- **AC-4 — a surface cannot enrol without a rate.** Omitting `millisPerBoot` fails to compile; a non-positive, `NaN`, non-integer, or above-timeout value fails a test by name.

- **AC-5 — the drift report names every measured surface**, marks which are actionable, keeps declared-but-unmeasured and measured-but-undeclared as two distinct states neither of which is "agreeing", and leaves every job's exit status unchanged.

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
| `readRun`, `ratePerModelledBoot`, `lpt`, `legSeconds`, `bindingLeg`, `verdictDelta`, `seamMagnitude` | `tests/mutationWeight/instrument.test.ts` | shipped with this arc, 28 cases |
| `reconcile` is total in both directions, checks the weight's parts, and fails | same suite | shipped |
| `seedRates` takes the newest sha and medians within it | same suite | shipped |
| the suite DISCRIMINATES on every claim it makes | `scripts/mutation-weight-plant.mjs` | shipped, 15 planted defects, 15 caught |
| `lib/mutationWeight/*` enrolled and scored | `tests/mutation/source/registry.ts` rows `mutationWeightRecords`, `mutationWeightWeights` | shipped |
| `weightOf` returns boots × rate; weights are integers | `tests/mutation/source/shardPartition.test.ts` | existing case rewritten, integrality new |
| rate range and required-ness (AC-4) | `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | existing `reject(patch)` harness extended |
| binding-leg margin against held-out fixtures (AC-3) | a new suite beside `tests/mutation/source/shardPartition.test.ts` | new, with fixtures |
| drift report content and exit neutrality (AC-5) | a new suite under `tests/ci/` | new |
| budget job downloads the records artifact | `tests/mutation/_metaSourceShardIntegrity.test.ts` | existing pattern extended |
| totality and disjointness (AC-2) | `tests/mutation/source/shardPartition.test.ts:47-70` | existing, unchanged |


## §8 Ledger graduation

`BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY` graduates on merge. Its `**Status:** IN PROGRESS` marker comes off in this PR's last commit, before the merge, in the same commit that archives the entry.

**The merge is a fleet seam and is named as one.** Measured by the report script with a held-out seed, **29 of 43 surfaces (67%) change leg** under the new weight. Every in-flight arc's shard assignment changes the moment this lands, and any leg number quoted in an order, a handoff or a review brief written before it is stale. Landing is coordinated through `bl-orch` and does not happen while another arc holds an unlanded registry edit. `fix/admin-loader-ci-transient` (PR #882) enrols two surfaces and is that arc today.
