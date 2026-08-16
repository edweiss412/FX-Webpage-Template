# Probe — per-surface weights and per-run cost decomposition for the source-mutation gate

**Date:** 2026-08-16 · **Arc:** `chore/mutation-gate-sharding` · **Consumer:** `docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md` §2

Recorded because the design's central claim — that the source-mutation gate, not the parser corpus, is what the wall clock grows with, and that per-surface partitioning saturates at four shards — rests entirely on these numbers. Per `docs/agents/spec-self-review.md:23`, a probe whose output feeds a spec's calibration table is itself a spec input and is recorded so a reviewer can re-run it rather than accept it.

Both probes are **read-only**. Probe A generates mutants and discards them without spawning a single child process; Probe B reads finished GitHub Actions logs.

---

## Probe A — per-surface weights (generation only)

Run from the worktree root. It spawns no `vitest` child, so it is not a harness run and takes under a second.

```ts
// probe-weigh-surfaces.ts (untracked scratch; reproduced here in full)
import { readFileSync } from "node:fs";

import { generateMutants } from "./tests/mutation/source/generate";
import { enumerateSites } from "./tests/mutation/source/operators";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";

const rows = GUARD_SURFACES.map((s) => {
  const text = readFileSync(s.sourcePath, "utf8");
  const sites = enumerateSites(s.sourcePath, text, s.operators);
  const { mutants, noOps } = generateMutants(s.sourcePath, text, s.operators, sites);
  return {
    id: s.id, sourcePath: s.sourcePath, sites: sites.length, mutants: mutants.length,
    noOps: noOps.length, suites: s.suitePaths.length, accepted: s.accepted.length,
    floor: s.scoreFloor, ops: s.operators.length,
    maxSuiteRuns: mutants.length * s.suitePaths.length,
  };
});
rows.sort((a, b) => b.mutants - a.mutants);
// ... prints the table below, then the LPT sweep ...
for (const n of [2, 3, 4, 6, 8]) {
  const loads = new Array<number>(n).fill(0);
  for (const r of rows) {
    let best = 0;
    for (let i = 1; i < n; i++) if (loads[i]! < loads[best]!) best = i;
    loads[best] = loads[best]! + r.mutants;
  }
  // report max / ideal / loads
}
```

`maxSuiteRuns` is an **upper** bound on child-vitest boots: `runAllSuites` short-circuits on the first suite that rejects (`tests/mutation/source/runner.ts:216-228`), so a killed mutant usually costs one boot rather than `suitePaths.length`.

The LPT loop above is a deliberate re-implementation of `lptAssign` (`tests/parser/mutation/shardPartition.ts:19`) rather than an import of it, so the sweep measures the packing the design proposes to reuse rather than assuming it.

### Transcript

```
$ pnpm tsx probe-weigh-surfaces.ts
id                       mutants  sites  noOps  suites  maxSuiteRuns  accepted  floor  ops  sourcePath
specLintNumerics             520    520      0       1           520        50   0.9     6  lib/specLint/numerics.ts
interactiveScanCore          272    272      0       3           816        11   0.9     6  tests/styles/interactiveScanCore.ts
destructiveFileAnalysis      237    237      0       1           237         8   0.95    6  tests/db/_destructiveFileAnalysis.ts
redContract                  119    119      0       3           357         7   0.95    6  lib/specLint/redContract.ts
taskContract                 115    115      0       3           345        22   0.95    6  lib/specLint/taskContract.ts
ledgerGit                     99     99      0       2           198         6   0.9     6  scripts/lib/ledger-git.ts
interactionTimingScan         95     95      0       2           190         8   0.95    6  scripts/scan-interaction-timings.ts
popoverOverlayExtract         78     78      0       1            78         2   0.9     6  tests/components/admin/showpage/_popoverOverlayExtract.ts
reviewRoundCorpus             71     71      0       1            71         2   1       6  lib/reviewRounds/corpus.ts
ledgerClaimsCore              63     63      0       2           126         3   0.95    6  scripts/lib/ledger-claims-core.ts
browserRegistry               57     57      0       1            57         0   1       6  tests/mutation/browser/registry.ts
browserMutate                 40     40      0       1            40         1   1       6  tests/mutation/browser/mutate.ts
citationIntent                21     21      0       3            63         0   0.95    6  lib/specLint/citationIntent.ts
renderedTextHaystack          17     17      0       1            17         0   0.9     6  tests/help/_renderedTextHaystack.ts
reviewRoundCount              15     15      0       2            30         0   1       6  lib/reviewRounds/count.ts
pgCronSmokes                  14     14      0       1            14         0   0.95    6  tests/cross-cutting/pgCronSmokes.ts
phantomGapExecuted            13     13      0       1            13         0   1       6  scripts/lib/phantomGapExecuted.mjs
tapTargetScan                  1      1      0       1             1         0   0.9     6  tests/styles/tapTargetScan.ts

surfaces=18 totalMutants=1847 totalMaxSuiteRuns=3173
heaviest=specLintNumerics 520 (28.2% of mutants)
mean=102.6 maxOverMean=5.07
perSurfaceLPT n=2: max=929 ideal=924 maxOverIdeal=1.01 loads=[918,929]
perSurfaceLPT n=3: max=620 ideal=616 maxOverIdeal=1.01 loads=[618,609,620]
perSurfaceLPT n=4: max=520 ideal=462 maxOverIdeal=1.13 loads=[520,439,439,449]
perSurfaceLPT n=6: max=520 ideal=308 maxOverIdeal=1.69 loads=[520,272,267,267,265,256]
perSurfaceLPT n=8: max=520 ideal=231 maxOverIdeal=2.25 loads=[520,272,237,158,169,169,158,164]
```

**Reading.** `max` stops falling at 520 from `n=4` onward because a surface is indivisible under a per-surface partition, so the heaviest surface is a hard floor on the makespan. Shards past four are empty capacity. This is the whole argument for `SOURCE_SHARD_COUNT = 4` and for filing sub-surface partitioning as a limit with a trigger instead of building it now.

### Cost of computing the weights

```
$ for i in 1 2; do /usr/bin/time -p pnpm tsx probe-weigh-surfaces.ts > /dev/null; done
real 0.84
real 0.87
```

0.85 s including `tsx` startup, for all 18 surfaces. This is why every shard recomputes the identical partition at startup and no weight table is committed — the property `tests/parser/mutation/shardPartition.ts:5-8` was built for.

---

## Probe B — where the 166 minutes actually go

```
$ gh run list --workflow=mutation-harness.yml --limit 60 --json ... --event schedule
31933821808  failure   169.7min  2026-08-16T07:25:07Z
31871859884  success   138.0min  2026-08-15T07:24:17Z
```

Per-file completion lines and the summary line, both runs:

| | run 31871859884 (08-15) | run 31933821808 (08-16) |
|---|---|---|
| wall clock | 07:24:45 → 09:42:05 = 137.3 min | 07:25:33 → 10:11:33 = 166.0 min |
| `import` | 4,504.94 s | 9,519.18 s |
| `tests` | 18,785.47 s | 19,699.33 s |
| source gate finished | 08:40:16 | 10:04:58 |
| source gate reported test duration | 89,374 ms | 107,466 ms |
| source gate `it` count | 65 | 114 |

**The decomposition closes to the millisecond, which is what makes it evidence rather than estimate.**

- 08-15: parser shards 18,331.429 s + parser gates 364.665 s + source gate 89.374 s = **18,785.468 s** vs reported `18785.47s`.
- 08-16: parser shards 19,225.953 s + parser gates 365.914 s + source gate 107.466 s = **19,699.333 s** vs reported `19699.33s`.

Since the source gate calls `runSurface` at module scope (`tests/mutation/guardSurfaces.gate.test.ts:169-183`), its real cost is vitest **import**, not **tests**. Three files start at job start (three workers on a 4-vCPU runner); the source gate is one of them:

- 08-15: 07:24:45 → 08:40:16 = 4,531 s occupancy, minus 89 s of tests = 4,442 s import, against a run total of 4,504.94 s — **98.6 %** of all import.
- 08-16: 07:25:33 → 10:04:58 = 9,565 s occupancy, minus 107 s of tests = 9,457 s import, against a run total of 9,519.18 s — **99.3 %** of all import.

**Growth in 24 h:** source gate 75.5 → 159.4 min (**+111 %**); parser side 18,696 → 19,592 s (+4.8 %, runner variance). Enrolment, not the parser corpus, is the driver.

**Enrolment from test count.** The gate emits 7 `it`s per surface plus 2 file-level cases, so surfaces = (tests − 2) ÷ 7: (65 − 2) ÷ 7 = **9** on 08-15, (114 − 2) ÷ 7 = **16** on 08-16. Probe A measures **18** today, the two extra being `browserRegistry` and `browserMutate`, merged at 13:38 Z on 08-16 (`e3fc2e8d3`) after that morning's run.

**Calibration.** The 16-surface set is 1,847 − 57 − 40 = 1,750 mutants and 3,173 − 57 − 40 = 3,076 max suite-runs against 9,457 s: **5.40 s/mutant, 3.07 s per child boot** on a GitHub 4-vCPU runner, against ~0.75 s/mutant measured locally in the parent spec (`docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:48`).

**Packing efficiency, which is the finding that redirects the design.** Parser 326.5 min + source gate 159.4 min = 485.9 min of work; three workers give an ideal makespan of 162.0 min; the job took 166.0 min — **97.6 % efficient**. The single job is already near-optimally packed, so splitting the gate into more files *within the same job* cannot help. Only adding runners can, which is why the design is a job matrix rather than only a file split.

## Limits of these probes

- Probe A's weights are an upper bound (§ `maxSuiteRuns`); real cost is lower where mutants die on the first suite. Consequence is shard imbalance, never a wrong verdict.
- Probe B's per-file durations are vitest's own reporting; the occupancy figures are derived from wall-clock completion timestamps plus the first-wave assumption, which the arithmetic above independently corroborates (predicted finish 07:25:33 + 9,565 s = 10:04:58, observed 10:04:58).
- Two scheduled runs is a small sample. The 08-15/08-16 pair is used for the growth *direction* and the cost *decomposition*, both of which are structural; the absolute s/mutant figure carries runner variance and the design does not depend on it (weights are recomputed live).
