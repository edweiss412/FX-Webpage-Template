# Bounding the mutation-harness wall clock — sharding the source-mutation gate across runners

**Arc:** `chore/mutation-gate-sharding` · **Ledger entry:** `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` (`BACKLOG.md`)
**Status:** spec · **Date:** 2026-08-16
**Supersedes:** the deferred limit L-4 / ratification R6 in `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:393` and `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:48` ("Serial execution. Parallelism is deferred, not overlooked… can be lifted if a surface outgrows serial"). This spec is that lift.

impeccable-gate: N/A — no UI surface

---

## 1. Problem

`mutation-harness` (`.github/workflows/mutation-harness.yml`) runs one vitest invocation over ten files: eight LPT-balanced parser shard files, one parser corpus-wide gates file, and `tests/mutation/guardSurfaces.gate.test.ts`, the source-mutation guard gate. The gate runs every enrolled surface serially, one `vitest` child per mutant (`tests/mutation/source/runner.ts:230`, loop at `tests/mutation/source/runner.ts:249`).

The job took **137.3 min** on 2026-08-15 and **166.0 min** on 2026-08-16, and the 2026-08-16 nightly was red. `timeout-minutes` has been raised twice and now stands at 300 (`.github/workflows/mutation-harness.yml:56`), which the workflow's own comment calls "headroom, not a target".

### 1.1 What the measurement shows, and where it corrects the ledger entry

The entry's diagnosis is that the gates file grows monotonically and that lifting the parser harness's sharding to it is the repair. **The first half is measured and correct. The second half, on its own, buys almost nothing**, and §2 is the evidence.

Two facts drive the whole design:

1. **The source gate holds one of three workers for the entire run** — 159.4 min of a 166.0 min job — because `runSurface` is called at module scope inside `describe.each` (`tests/mutation/guardSurfaces.gate.test.ts:169-183`), so its cost is vitest *import* time, not test time. Its reported test duration is 107 s.
2. **The single job is already packed at 97.6% efficiency against its three workers.** Total work is ~486 min; three workers give an ideal makespan of 162.0 min; the job took 166.0. Splitting the gate file into more files *inside the same job* redistributes work among the same three workers and cannot go below ~162 min.

So the binding constraint is **total work against a fixed 4-vCPU runner**, not the indivisibility of one file. The repair has to add CPUs, which on GitHub Actions means adding **jobs**, not files. Sharding the gate is still required — it is what makes the work divisible across jobs — but sharding alone, inside one job, is not the fix.

### 1.2 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| The browser-mutant mode is **out of scope**. It is a separate gate file with its own workflow, its own 60-min budget, and a schedule deliberately offset from this one ("08:17 UTC nightly, offset from mutation-harness.yml’s 07:00 so the two never contend", `.github/workflows/mutation-browser.yml:15`; `timeout-minutes: 60` at `.github/workflows/mutation-browser.yml:60`). It does **not** run in `mutation-harness`, which names its subjects explicitly (`.github/workflows/mutation-harness.yml:76`) precisely so a bare `--project mutation` cannot sweep it in (`.github/workflows/mutation-harness.yml:66-72`). | `.github/workflows/mutation-browser.yml:15`, `.github/workflows/mutation-harness.yml:76` |
| `browserRegistry` and `browserMutate` are **ordinary vitest source surfaces**, not browser mutants. They mutate the browser mode's own two modules (`tests/mutation/source/registry.ts:1165-1167` and `tests/mutation/source/registry.ts:1180-1182`) and cost 97 mutants between them (§2.3). They shard like any other surface. | `tests/mutation/source/registry.ts:1164-1184` |
| Raising `timeout-minutes` again is **not** a candidate. The entry is explicit and 300 is already the second raise. | `BACKLOG.md` (entry); `.github/workflows/mutation-harness.yml:45-56` |
| Serial per-mutant execution *within* a surface is unchanged. This spec partitions across surfaces, not within one. Sub-surface partitioning is a documented limit with a stated trigger (§6, L-2). | §3.1, §6 |
| The gate stays **non-gating** (not a required check). Nothing here puts mutation results on the merge path. | `.github/workflows/mutation-harness.yml:13-14` |
| `MUTANT_TIMEOUT_MS = 180_000` and its `MUTANT_TIMEOUT_EXIT = 124` KILLED verdict are ratified and unchanged (`tests/mutation/source/runner.ts:49` and `tests/mutation/source/runner.ts:60`). | `tests/mutation/source/runner.ts:49-60` |
| `mutation-harness` is **red on `main`** for two pre-existing reasons (§2.7), filed in PR #824 (`docs/mutation-harness-main-red`) and reproduced on two unrelated heads. This arc does not own, fix, or hide them, and the gate is not a required context. A reviewer must not read either failure as caused by this design. | §2.7, §7, AC-9 |
| Worker-process **lifetime** bounding is the sibling arc `BL-HEAVY-ORPHAN-WORKER-LIFETIME` (branch `chore/heavy-orphan-reaper`). As of `origin/chore/heavy-orphan-reaper` at `b9397d094723878a1ef16b6029d56f04ae679f85`, that branch has landed **only** its ledger marker — `git diff --stat origin/main...origin/chore/heavy-orphan-reaper` is `BACKLOG.md \| 2 +-`, one insertion, one deletion — so there is no spec to cite and no reaper decision to duplicate. This spec bounds the **job's** wall clock and takes no position on process lifetime. | probe, §2.6 |

---

## 2. Probe results (measured before design, per `docs/agents/spec-self-review.md:21` and `docs/agents/spec-self-review.md:23`)

Every number below is from a read-only probe. No figure is carried over from the ledger entry without re-derivation; where they differ, §2.2 says so.

### 2.1 The cost decomposition, which is exact

Source: `gh run view <id> --log` for the two most recent **scheduled** runs. Vitest's summary line reports `import` and `tests` separately, and per-file completion lines give each file's test duration.

Run **31933821808** (2026-08-16, `schedule`, **failure**), 07:25:33 → 10:11:33 = **166.0 min**:

```
Test Files  2 failed | 8 passed (10)
Tests       2 failed | 166 passed (168)
Duration  9960.08s (transform 1.61s, setup 365ms, import 9519.18s, tests 19699.33s, environment 1ms)
```

| File | completed | reported test duration |
|---|---|---|
| `tests/parser/mutationHarness.gates.test.ts` | 07:32:40 | 365,914 ms (6.1 min) |
| `tests/parser/mutationHarness.shard0.test.ts` | 08:09:50 | 2,655,530 ms (44.3 min) |
| `tests/parser/mutationHarness.shard1.test.ts` | 08:11:13 | 2,312,491 ms (38.5 min) |
| `tests/parser/mutationHarness.shard3.test.ts` | 08:50:44 | 2,370,921 ms (39.5 min) |
| `tests/parser/mutationHarness.shard2.test.ts` | 08:52:43 | 2,572,844 ms (42.9 min) |
| `tests/parser/mutationHarness.shard4.test.ts` | 09:29:09 | 2,304,803 ms (38.4 min) |
| `tests/parser/mutationHarness.shard5.test.ts` | 09:38:56 | 2,772,192 ms (46.2 min) |
| **`tests/mutation/guardSurfaces.gate.test.ts`** | **10:04:58** | **107,466 ms (1.8 min)** |
| `tests/parser/mutationHarness.shard6.test.ts` | 10:07:10 | 2,279,948 ms (38.0 min) |
| `tests/parser/mutationHarness.shard7.test.ts` | 10:11:33 | 1,957,224 ms (32.6 min) |

**The decomposition closes to the millisecond**, which is why it can be relied on rather than estimated:

- parser shards 19,225.953 s + parser gates 365.914 s + source gate `it` bodies 107.466 s = **19,699.333 s**, against a reported `tests 19699.33s`.
- The source gate therefore contributes **107 s of `tests`** and the remainder of its cost is `import`. Three files start at 07:25:33 (three workers); the source gate is one of them and finishes at 10:04:58, so it occupied a worker for **9,565 s = 159.4 min**, of which 9,457 s is import. Total run import is 9,519.18 s, so the source gate is **99.3 % of all import time in the run**.

The same structure holds on the previous night. Run **31871859884** (2026-08-15, `schedule`, success), 07:24:45 → 09:42:05 = **137.3 min**:

```
Test Files  10 passed (10)
Duration  8239.91s (transform 2.22s, setup 392ms, import 4504.94s, tests 18785.47s, environment 1ms)
```

parser shards 18,331.429 s + parser gates 364.665 s + source gate 89.374 s = **18,785.468 s** against a reported `18785.47s`. The source gate finished 08:40:16, holding a worker for 4,531 s = **75.5 min**, of which 4,442 s is import — **98.6 %** of that run's 4,504.94 s import total.

### 2.2 Growth, and why the entry's counts are already stale

| | 2026-08-15 | 2026-08-16 | change |
|---|---|---|---|
| enrolled surfaces (from `(tests − 2) ÷ 7`; the gate emits 7 `it`s per surface plus 2 file-level cases) | 9 | 16 | +78 % |
| source-gate worker occupancy | 75.5 min | 159.4 min | **+111 %** |
| source-gate import | 4,442 s | 9,457 s | +113 % |
| parser-side `tests` total | 18,696 s | 19,592 s | +4.8 % (runner variance) |
| job wall clock | 137.3 min | 166.0 min | +20.9 % |

**The gate more than doubled in 24 hours while the parser side was flat.** Enrolment is the driver, exactly as the entry argues — and enrolment is what `AGENTS.md`'s convergence rule asks arcs to do *before* their first review dispatch, which is the perverse incentive this arc exists to remove.

The entry's own figures are pre-#807 and already superseded: it cites **519** gate mutants, and the arc brief cites **26** registry rows. Measured today (§2.3) the registry holds **18** surfaces and **1,847** mutants. The entry's "+207 for `interactiveScanCore`" is likewise stale — that surface now generates **272**.

### 2.3 Per-surface weights (probe: generation only, no child spawned)

Probe imports `GUARD_SURFACES`, `enumerateSites` and `generateMutants` and counts; it runs no mutant, so it costs nothing and measures exactly the quantity a partition needs.

```
id                       mutants  suites  maxSuiteRuns  floor   sourcePath
specLintNumerics             520       1           520   0.9    lib/specLint/numerics.ts
interactiveScanCore          272       3           816   0.9    tests/styles/interactiveScanCore.ts
destructiveFileAnalysis      237       1           237   0.95   tests/db/_destructiveFileAnalysis.ts
redContract                  119       3           357   0.95   lib/specLint/redContract.ts
taskContract                 115       3           345   0.95   lib/specLint/taskContract.ts
ledgerGit                     99       2           198   0.9    scripts/lib/ledger-git.ts
interactionTimingScan         95       2           190   0.95   scripts/scan-interaction-timings.ts
popoverOverlayExtract         78       1            78   0.9    tests/components/admin/showpage/_popoverOverlayExtract.ts
reviewRoundCorpus             71       1            71   1      lib/reviewRounds/corpus.ts
ledgerClaimsCore              63       2           126   0.95   scripts/lib/ledger-claims-core.ts
browserRegistry               57       1            57   1      tests/mutation/browser/registry.ts
browserMutate                 40       1            40   1      tests/mutation/browser/mutate.ts
citationIntent                21       3            63   0.95   lib/specLint/citationIntent.ts
renderedTextHaystack          17       1            17   0.9    tests/help/_renderedTextHaystack.ts
reviewRoundCount              15       2            30   1      lib/reviewRounds/count.ts
pgCronSmokes                  14       1            14   0.95   tests/cross-cutting/pgCronSmokes.ts
phantomGapExecuted            13       1            13   1      scripts/lib/phantomGapExecuted.mjs
tapTargetScan                  1       1             1   0.9    tests/styles/tapTargetScan.ts

surfaces=18  totalMutants=1847  totalMaxSuiteRuns=3173
heaviest=specLintNumerics 520 (28.2% of mutants)   mean=102.6   max/mean=5.07
```

`maxSuiteRuns` = `mutants × suitePaths.length`, an **upper** bound: `runAllSuites` short-circuits on the first suite that rejects (`tests/mutation/source/runner.ts:216-228`), so a killed mutant usually costs one child boot, not all of them.

**Calibration.** The 16-surface set that ran on 2026-08-16 excludes `browserRegistry` and `browserMutate` (merged at 13:38 Z that day, after the 07:25 Z run), giving 1,750 mutants and 3,076 max suite-runs against 9,457 s of measured import: **5.40 s/mutant, or 3.07 s per child-vitest boot** on a GitHub 4-vCPU runner. The parent spec measures ~0.75 s/mutant locally (`2026-08-04-source-mutation-guard-gate.md:48`), so CI is ~4× slower per boot — consistent, and the boot figure is the more stable unit because it absorbs the 1–3 suite spread.

### 2.4 What a per-surface partition can and cannot achieve

The probe runs the same LPT packing the parser harness uses (`tests/parser/mutation/shardPartition.ts:19`) over per-surface mutant weights:

```
perSurfaceLPT n=2: max=929 ideal=924 max/ideal=1.01  loads=[918,929]
perSurfaceLPT n=3: max=620 ideal=616 max/ideal=1.01  loads=[618,609,620]
perSurfaceLPT n=4: max=520 ideal=462 max/ideal=1.13  loads=[520,439,439,449]
perSurfaceLPT n=6: max=520 ideal=308 max/ideal=1.69  loads=[520,272,267,267,265,256]
perSurfaceLPT n=8: max=520 ideal=231 max/ideal=2.25  loads=[520,272,237,158,169,169,158,164]
```

**A surface is indivisible under this partition, so the heaviest surface is a hard floor on the makespan.** `specLintNumerics` at 520 mutants pins `max` from `n=4` onward; every shard past four is empty capacity. This is the measured answer to the first question the arc brief poses (“a surface, or a surface’s mutants?”): **per surface, with a useful ceiling of four shards**, and sub-surface partitioning filed as a limit with an explicit trigger rather than built now (§6, L-2).

At the recommended `n=4`, 520 mutants × 5.40 s = **46.8 min** for the heaviest shard, which lands almost exactly on the heaviest parser shard (46.2 min). The two sides balance without tuning.

### 2.5 Weight computation is free

Computing every surface's weight — read the source, enumerate sites, generate mutants, discard them — for all 18 surfaces, including `tsx` startup, measured twice on this machine:

```
real 0.84
real 0.87
```

**0.85 s.** So each shard recomputes the identical partition at startup and **no weight table is committed**, preserving the property the parser partition was built for: `Pure function of the committed fixtures + operators / every consumer recomputes the identical map, so there is NO committed weight table to go stale (the class this arc repairs)` (`tests/parser/mutation/shardPartition.ts:5-8`). This answers the brief's second question — a stale weight file is not a failure mode this design can have, because there is no file.

### 2.6 The sibling arc has landed nothing to coordinate against

```
$ git diff --stat origin/main...origin/chore/heavy-orphan-reaper
 BACKLOG.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

`BL-HEAVY-ORPHAN-WORKER-LIFETIME` has marked its ledger row in progress and nothing else. No reaper decision exists to duplicate or contradict.

### 2.7 The silence is real, but it is not the timeout

The 2026-08-16 nightly failed at **169.7 min against a 300-min ceiling** — it was *not* a timeout. Its two failures were substantive:

```
AssertionError: gate failures: expected 'unaccepted-survivor: 1 survivor(s) wi…' to be ''
+ unaccepted-survivor: 1 survivor(s) with no ledger row: logical-connector:330:39:&&>||
 ❯ tests/mutation/guardSurfaces.gate.test.ts:178:9

AssertionError: DRIFTED fingerprints … (11 rows)
 ❯ tests/parser/mutationHarness.shard4.test.ts:63:7
```

Both failures are **pre-existing main-side state, not a property of any one branch**: they reproduce identically on two unrelated heads and are filed in PR #824 (`docs/mutation-harness-main-red`). They are cited here as evidence about *signal*, not as work this arc adopts (§7).

The `notify` job does file a tracking issue for a red **scheduled** run (`.github/workflows/mutation-harness.yml:85-131`), so a timeout on the nightly is not literally invisible. What *is* invisible is **approach**: nothing reports that the job went 137 → 166 min, because a run under the ceiling is simply green (or red for an unrelated reason) and the duration is not asserted anywhere. Growth is only ever discovered by crossing the ceiling, at which point the run is already worthless. §3.5 makes the margin an asserted, reported quantity.

---

## 3. Mechanism

### 3.1 Partition unit and weight

- **Unit:** one enrolled surface (`GuardSurface`, `tests/mutation/source/registry.ts:12`). Indivisible.
- **Weight:** `mutants × suitePaths.length`, computed at shard startup from the live registry by generation only (§2.5). Not committed, not cached.
- **Assignment:** the existing `lptAssign` (`tests/parser/mutation/shardPartition.ts:19`), reused as-is — sort by (weight desc, key asc), assign to the least-loaded shard, ties to the lowest index. Integer arithmetic and lexicographic ties only, so every shard on every runner computes a byte-identical map.
- **Shard count:** `SOURCE_SHARD_COUNT = 4` (§2.4).

**Failure direction, stated explicitly.** A weight that misestimates a surface produces **imbalance, never incorrectness**: the partition remains total and disjoint by construction (every surface id maps to exactly one index), so every surface still runs exactly once and every gate condition is still evaluated against that surface's complete result. The worst case is one shard finishing later than another.

### 3.2 Shard files

`tests/mutation/guardSurfaces.shard{0..3}.test.ts`, each the same template with only the shard literal and filename differing, filtering the registry before `describe.each`:

```ts
const SOURCE_SHARD = 0;
const surfaces = GUARD_SURFACES.filter(
  (s) => shardOfSurface(s.id, sourceShardAssignment()) === SOURCE_SHARD,
);
describe.each(surfaces.map((s) => [s.id, s] as const))(GATE_TITLE, /* seven its, unchanged */);
```

The seven per-surface `it`s move unchanged. Because `runSurface` is called at module scope, filtering before `describe.each` is what actually prevents the work — a `describe.skip` or a filtered `it` would still pay the full run during collection.

**The integrity meta-test does not inherit the parser's two gaps.** The parser's shard-file integrity block (`tests/parser/mutation/shardPartition.test.ts:86-107`) proves the file set is exactly `0..SHARD_COUNT-1` (`tests/parser/mutation/shardPartition.test.ts:91`) and that each file calls `runShard(<its own index>)` once (`tests/parser/mutation/shardPartition.test.ts:96`), but it does **not** assert that the files are the same template modulo the shard literal, and it does **not** check that each file's `const SHARD = N` matches its filename — even though `SHARD` is what the ledger-slice filter consumes. This spec's meta-test asserts all four: the file set, the literal-vs-filename match, the single filtered `describe.each` per file, and byte-equality of every shard file to shard 0 after normalising the shard literal and the filename comment.

### 3.3 The corpus-wide gates file

A NEW file, tests/mutation/guardSurfaces.gates.test.ts, created by this arc — it does not exist yet, which is why it is named in plain text here rather than cited. Generation-only, no child spawned, seconds to run. It holds every assertion that ranges over the whole registry and therefore cannot live in a shard, mirroring `tests/parser/mutationHarness.gates.test.ts`:

- **The registry-completeness check moves here verbatim.** `expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(GUARD_SURFACES.map((s) => s.id).sort())` (`tests/mutation/guardSurfaces.gate.test.ts:161-167`) compares against the *whole* registry; duplicated into a shard it would fail in every shard, since each sees a subset. `EXPECTED_LEDGER_KINDS` moves to a module both files import.
- **Partition totality and disjointness over the live registry:** every enrolled surface resolves to exactly one shard index in `0..SOURCE_SHARD_COUNT-1`, and the per-shard counts sum to `GUARD_SURFACES.length` — the analogue of the parser gates file's `(f)`/`(g)` union proof.
- **Balance:** `max/mean` load stays under a stated bound, the analogue of the parser's `(h)`.
- **A surface's `it` count is 7**, pinning the arithmetic §2.2 uses to read enrolment off a run's test count.

### 3.4 Workflow: a matrix of jobs, which is the part that buys the wall clock

Both harnesses become matrix jobs, so each shard gets its own 4-vCPU runner instead of a third of one:

```yaml
jobs:
  parser-shards:
    strategy: { fail-fast: false, matrix: { shard: [0,1,2,3,4,5,6,7] } }
    timeout-minutes: 90
    run: pnpm exec vitest run --project mutation tests/parser/mutationHarness.shard${{ matrix.shard }}.test.ts
  parser-gates:
    timeout-minutes: 30
    run: pnpm exec vitest run --project mutation tests/parser/mutationHarness.gates.test.ts
  source-shards:
    strategy: { fail-fast: false, matrix: { shard: [0,1,2,3] } }
    timeout-minutes: 90
    run: pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shard${{ matrix.shard }}.test.ts
  source-gates:
    timeout-minutes: 15
    run: pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts
```

`fail-fast: false` is load-bearing: one shard's coverage regression must not cancel the other eleven and hide their results, which is the same reason the gate is non-gating.

Expected wall clock is **max over jobs ≈ 47 min + ~3 min setup ≈ 50 min**, against 166 today. Fourteen jobs each pay checkout + install, so *runner-minutes* rise by roughly 14 × 3 = 42 min while *wall clock* falls by ~116 min. For a nightly that is the right trade, and it is the only trade that stays flat as surfaces enrol: a new surface lands in one shard, and when the heaviest shard nears budget, `SOURCE_SHARD_COUNT` goes up.

`permissions: contents: read` stays on every harness job, and the `notify` job keeps sole ownership of `issues: write` (`.github/workflows/mutation-harness.yml:57-61` and `.github/workflows/mutation-harness.yml:89-91`) — the matrix changes job count, not the privilege split. `notify` gains `needs: [parser-shards, parser-gates, source-shards, source-gates]` and names the failing job(s) in the issue body; its existing schedule/default-branch gate (`.github/workflows/mutation-harness.yml:87`) is unchanged.

### 3.5 The margin is asserted, not discovered by crossing it

Partitioning without this leaves the incentive intact, which is the entry's actual complaint.

Each shard job emits its own elapsed time, and a final `budget` job (`if: always()`) compares the **maximum** shard elapsed against a declared `SHARD_BUDGET_MINUTES = 60` and:

- **fails** when any shard exceeds the budget — a real signal, well below the 90-min job timeout, so the run still produces complete results while reporting that the shape is wrong;
- **warns** (annotation, run still green) above 75 % of budget, which is the "approaching" signal nothing emits today.

`SHARD_BUDGET_MINUTES` and `SOURCE_SHARD_COUNT` are declared once, in one module, and referenced everywhere else (the single-source-of-truth discipline in `docs/agents/spec-self-review.md:14`).

This converts "the nightly quietly got slower" into a named failure with a named remedy — raise `SOURCE_SHARD_COUNT` — and it keeps the cost of enrolling a surface at zero, which is the design's own success criterion.

---

## 4. Targets

| Quantity | Today (measured) | Target |
|---|---|---|
| `mutation-harness` wall clock | 166.0 min | ≤ 55 min |
| Heaviest single job | 159.4 min (source gate) | ≤ 47 min |
| Marginal wall clock of enrolling a mean-sized surface (103 mutants; the median is 67) | +9.3 min, on the critical path | ≈ 0 until a shard reaches budget |
| Signal that the job is approaching its ceiling | none | annotation at 75 % of `SHARD_BUDGET_MINUTES`, failure at 100 % |
| `timeout-minutes` on the harness | 300 | 90 per shard job |

---

## 5. Acceptance criteria

- **AC-1** Every enrolled surface resolves to exactly one shard index in `0..SOURCE_SHARD_COUNT-1`; per-shard counts sum to `GUARD_SURFACES.length`. Asserted over the live registry in the gates file.
- **AC-2** Shard assignment is a pure function of the registry and the sources it names: two invocations in the same tree produce identical maps, and no weight table is committed.
- **AC-3** The union of the shards' per-surface `it`s equals what `guardSurfaces.gate.test.ts` ran before the split — same seven cases per surface, same gate conditions, for all 18 surfaces.
- **AC-4** Shard files are the same template: byte-identical to shard 0 after normalising the shard literal and the filename comment; each file's literal matches its filename; the file set is exactly `0..SOURCE_SHARD_COUNT-1`, with no monolith left behind.
- **AC-5** The registry-completeness assertion exists in exactly one place and fails when a surface is enrolled without an `EXPECTED_LEDGER_KINDS` row — the fail-by-default property at `guardSurfaces.gate.test.ts:161-167` survives the move.
- **AC-6** A red shard does not cancel its siblings (`fail-fast: false`), and the tracking issue names which job failed.
- **AC-7** A shard exceeding `SHARD_BUDGET_MINUTES` fails the budget job; a shard above 75 % emits an annotation and stays green.
- **AC-8** `permissions: contents: read` on every harness job; `issues: write` only on `notify`.
- **AC-9** Real CI on the implementing branch via the existing path-filtered `pull_request` trigger (`.github/workflows/mutation-harness.yml:27-36`) — per the "local-passes-CI-fails is its own bug class" rule in `AGENTS.md`, local green is necessary and not sufficient. **Green is measured against the merge-base, not against zero.** `mutation-harness` is red on `main` for two pre-existing reasons unrelated to this arc (§2.7, filed in PR #824 / `docs/mutation-harness-main-red`, reproduced identically on two unrelated heads). The criterion is therefore: every job the arc introduces or reshapes is green, **and** the failing set is a subset of the merge-base's failing set. The implementer records the merge-base failure set before triaging any red, and does not treat a pre-existing failure as a regression of this diff. The harness is not a required context and does not block the merge.
- **AC-10** `pnpm mutation:guards` (the repo-root `package.json`, `"mutation:guards"` at line 55) still runs the whole gate locally, unsharded, so enrolling a surface needs no shard arithmetic by hand.

---

## 6. Documented limits (carried from round 0)

| id | limit | argument |
|---|---|---|
| **L-1** | Wall clock is bounded by the heaviest **single surface**, not by `SOURCE_SHARD_COUNT`. `specLintNumerics` (520 mutants ≈ 47 min) pins the makespan from `n=4` on (§2.4). | Measured. Shards past four are empty capacity, which is why the count is 4 and not 8. |
| **L-2** | **Sub-surface partitioning is deferred, not overlooked** — the same posture R6 took toward this spec. Trigger, stated so it is not a judgement call: when the heaviest single surface's projected cost exceeds `SHARD_BUDGET_MINUTES`, per-surface partitioning can no longer meet the budget and the unit must become the mutant. That requires cross-shard aggregation, because `evaluateGate` scores a surface as a whole. | The budget job (§3.5) is what detects the trigger, so the limit is self-reporting rather than remembered. |
| **L-3** | Weights are an upper bound (`maxSuiteRuns`), so a surface whose mutants are mostly killed by its first suite is over-weighted. Consequence is imbalance only (§3.1). | Short-circuit at `runner.ts:216-228`. |
| **L-4** | Runner-minutes rise ~42 min/run for the per-job setup tax. Accepted: this is a nightly, and wall clock is the constrained resource. | §3.4. |
| **L-5** | A GitHub-hosted 4-vCPU runner yields three vitest workers; nothing here assumes more. If runner size changes, shard counts want re-deriving, not the design. | `.github/workflows/mutation-harness.yml:2-10`; confirmed by three files starting concurrently at 07:25:33 (§2.1). |

---

## 7. Out of scope

- The browser-mutant mode and `.github/workflows/mutation-browser.yml` (§1.2).
- Worker-process lifetime / orphan reaping — `BL-HEAVY-ORPHAN-WORKER-LIFETIME` (§2.6).
- Reducing the parser corpus, changing its 8-way split, or its ledger.
- Making the harness merge-gating.
- The two substantive failures in the 2026-08-16 nightly (§2.7): the `interactionTimingScan` `logical-connector:330:39:&&>||` unaccepted survivor and the 11 drifted `blank-row:inject` parser fingerprints in shard 4. Both are **pre-existing on `main`**, reproduced on two unrelated heads, and filed in PR #824 (`docs/mutation-harness-main-red`). They are coverage/ledger work triaged on their own; this arc neither fixes nor hides them, and AC-9 measures green against the merge-base so they cannot be misread as a regression of this diff.
- Changing operators, oracle, overlay, or the accepted-survivor ledger format.
