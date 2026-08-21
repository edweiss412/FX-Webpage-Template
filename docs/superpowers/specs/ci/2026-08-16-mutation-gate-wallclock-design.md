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
| Raising `timeout-minutes` again is **not** a candidate **as a way to buy wall clock**. The entry is explicit and 300 is already the second raise. **Narrowed 2026-08-21 — see §1.2a; the ceiling's RELATION to the budget is a separate axis this row did not rule on.** | `BACKLOG.md` (entry); `.github/workflows/mutation-harness.yml:45-56`; §1.2a |
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

`maxSuiteRuns` = `mutants × suitePaths.length` is an **upper** bound and is NOT the weight this spec uses — it over-weights a multi-suite surface by up to `suitePaths.length`. `runAllSuites` short-circuits on the first suite that rejects (`tests/mutation/source/runner.ts:216-228`), so the actual child-boot count per surface is:

```
boots = mutants + accepted × (suites − 1) + suites
        └ killed: 1 boot each  └ survivors run every suite  └ the baseline
```

A survivor is a mutant no suite rejects, so it pays every suite; in a **green** run every survivor is a ledgered `accepted` row, because an unaccepted survivor fails the gate by construction (`tests/mutation/guardSurfaces.gate.test.ts:185-191`). `accepted.length` is therefore the survivor count, and the model is computable from the registry alone.

| weight | heaviest surface | n=4 max/ideal |
|---|---|---|
| `mutants` | `specLintNumerics` (520) | 1.13 |
| `mutants × suites` | `interactiveScanCore` (816) | 1.03 |
| **`boots` (used)** | **`specLintNumerics` (521)** | **1.06** |

`mutants × suites` puts `interactiveScanCore` at 816 against a modelled 297 real boots — a 2.7× over-estimate that moves the apparent floor onto the wrong surface. The boot model is the weight §3.1 specifies.

**Calibration.** The 16-surface set that ran on 2026-08-16 excludes `browserRegistry` and `browserMutate` (merged at 13:38 Z that day, after the 07:25 Z run): 1,750 mutants and **1,875 modelled boots** against 9,457 s of measured import — **5.40 s/mutant, 5.04 s per child boot** on a GitHub 4-vCPU runner. The per-boot figure uses the boot model as its denominator, not `maxSuiteRuns`; dividing by an upper bound would understate the true per-boot cost, which is why the earlier draft's 3.07 s figure is withdrawn. The parent spec measures ~0.75 s/mutant locally (`docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md:48`), so CI is ~7× slower per boot.

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

Under the boot weight §3.1 actually specifies, the same sweep gives `n=4: max=521 ideal=494 max/ideal=1.06 loads=[521,479,490,484]`, and `max` is pinned at 521 by `specLintNumerics` for every `n ≥ 4` — the same conclusion, on the weight that ships. The full three-weight comparison is in the probe record.

At the recommended `n=4`, 521 boots × 5.04 s = **43.8 min** for the heaviest shard, against a heaviest parser shard of 46.2 min. The two sides balance without tuning.

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
- **Weight:** `mutants + accepted.length × (suitePaths.length − 1) + suitePaths.length` — the child-boot model derived in §2.3 — computed at shard startup from the live registry by generation only (§2.5). Not committed, not cached. It is a MODEL, not a measurement: §6 L-3 states its failure direction.
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

A NEW file, tests/mutation/guardSurfaces.gates.test.ts, created by this arc — it does not exist yet, which is why it is named in plain text here rather than cited. Near-instant: it spawns exactly ONE child (the timeout premise below), and everything else in it is generation-only. It holds every assertion that ranges over the whole registry and therefore cannot live in a shard, mirroring `tests/parser/mutationHarness.gates.test.ts`:

- **The registry-completeness check moves here verbatim.** `expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(GUARD_SURFACES.map((s) => s.id).sort())` (`tests/mutation/guardSurfaces.gate.test.ts:161-167`) compares against the *whole* registry; duplicated into a shard it would fail in every shard, since each sees a subset. `EXPECTED_LEDGER_KINDS` moves to a module both files import.
- **Partition totality and disjointness over the live registry:** every enrolled surface resolves to exactly one shard index in `0..SOURCE_SHARD_COUNT-1`, and the per-shard counts sum to `GUARD_SURFACES.length` — the analogue of the parser gates file's `(f)`/`(g)` union proof.
- **Balance:** `max/mean` load stays under a stated bound, the analogue of the parser's `(h)`.
- **The live child-timeout premise moves here too.** `describe("the per-mutant config's timeout is in force")` (`tests/mutation/guardSurfaces.gate.test.ts:275-283`) runs a fixture that deliberately sleeps past vitest's 5,000 ms default and asserts the child still exits 0. It is not per-surface, so it belongs in no shard; and it must not be dropped, because without it a mutant that merely runs long is classified KILLED through `tests/mutation/source/runner.ts:223-227`, **silently inflating the score** — a wrong verdict, not a slow one. The static parity check in `tests/mutation/_metaOverlayConfigParity.test.ts` compares configured VALUES and cannot prove one takes effect.

  Consequently the gates file is **not** purely generation-only: it spawns exactly one child, for this case, and its job budget is set accordingly (`timeout-minutes: 15`, against a fixture that sleeps 5.2 s). `tests/mutation/_metaOverlayConfigParity.test.ts:62` maps the fixture `slowTest.fixture.ts` to its owner file and asserts the owner contains the fixture name, so **that OWNERS row is repointed at the gates file in the same commit** or the parity test fails on a missing owner.
- **A surface's `it` count is 7**, pinning the arithmetic §2.2 uses to read enrolment off a run's test count.

**The inventory is exhaustive, and stated as a count so a reviewer can check it.** The current gate file contains exactly **two** file-level `describe` blocks — registry completeness (`tests/mutation/guardSurfaces.gate.test.ts:161-167`) and the timeout premise (`tests/mutation/guardSurfaces.gate.test.ts:275-283`) — and one `describe.each` of seven per-surface `it`s (`tests/mutation/guardSurfaces.gate.test.ts:169-265`). Both file-level blocks move to the gates file; the seven per-surface cases move to the shards; nothing else exists in the file to place.

#### 3.3.1 Five new files must be excluded from the default projects, or they land on the merge path

`PARALLEL_TEST_GLOBS` contains `tests/mutation/**/*.test.{ts,tsx}` (`vitest.projects.ts:143`), and the nightly gate stays out of the default projects only because `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts:93-97`) names it explicitly. **A new shard file that is added to `MUTATION_TEST_GLOBS` but not to `NIGHTLY_ONLY_EXCLUDES` is therefore admitted by the `parallel` project and runs on every pull request** — putting a per-mutant harness, tens of minutes of it, onto the merge path of every PR in the repo.

This is the one failure mode of this change that is both silent at authoring time and severe, so it is pinned rather than remembered. `tests/cross-cutting/vitest-projects-partition.test.ts` already asserts that every discovered test file is admitted by exactly one default project unless it matches `NIGHTLY_ONLY_EXCLUDES` (`tests/cross-cutting/vitest-projects-partition.test.ts:212-227` and `tests/cross-cutting/vitest-projects-partition.test.ts:243-262`), and that every `NIGHTLY_ONLY_EXCLUDES` glob appears in both `serial.exclude` and `parallel.exclude` (`tests/cross-cutting/vitest-projects-partition.test.ts:383-390` and `tests/cross-cutting/vitest-projects-partition.test.ts:471-476`). Those assertions already cover the new files the moment they exist — the task is to add all five to BOTH lists and let the existing guard prove it, not to write a new one.

That suite also carries a hard count — `expect(nightlyCount, "exactly the 11 nightly files …").toBe(11)` (`tests/cross-cutting/vitest-projects-partition.test.ts:265-268`) — which becomes 15 (9 parser + 4 source shards + source gates + browser gate), and whose message text is stale on its face once it changes. Updating that literal and its message is a task step, not an incidental edit.

### 1.2a Amendment (2026-08-21) — the ceiling row ruled on an axis, and there is a second one

The row above stays in force **for the question it was asked**. It is narrowed, not overturned: it
was correct about wall clock and silent about diagnosability, and the distinction is what keeps it
authoritative.

**Why the narrowing is legitimate rather than convenient, from this document's own text.** The row's
"300" ties it unambiguously to the MONOLITHIC job's ceiling — §1 records that "`timeout-minutes` has
been raised twice and now stands at 300". This same spec then SHIPS `timeout-minutes: 90` per shard
job in §3.4, and its own comparison table contrasts the two directly: `| timeout-minutes on the
harness | 300 | 90 per shard job |`. A ratified row cannot have frozen a value the same document
introduces two hundred lines later, and the table exists precisely to mark them as different
quantities. Read literally the row makes this spec self-contradictory; read as scoped to the
monolith it makes it coherent.

**What stays declined, on any job, with no exception.** Raising a ceiling to BUY WALL CLOCK — to let
a job that does not fit simply run longer — remains rejected, and §1.1 gives the reason that has not
changed: the binding constraint is total work against a fixed 4-vCPU runner, so the repair adds CPUs
by adding jobs. A future arc that wants more minutes because a leg outgrew its budget is asking the
question this row already answered, and the answer is still no.

**What the row did not consider, and what is now permitted.** The ceiling and `SHARD_BUDGET_SECONDS`
are two constants that RELATE, and nothing related them. They fail in OPPOSITE ways: a leg over the
budget FAILS the budget job, having uploaded its `elapsed.txt` and left a verdict; a leg over the
ceiling is CANCELLED, which uploads nothing and carries no verdict for any surface it holds. So a
ceiling sitting close above the budget silently converts the diagnosable outcome into the
undiagnosable one. Measured on `main` 2026-08-21: source legs at 3310 / 3812 / 4180 / 5172 s against
a 3600 s budget under a 5400 s ceiling — three legs breaching, the worst consuming 87% of the gap,
about 228 s from censoring a quarter of the source gate.

Adjusting the ceiling to preserve that GAP is therefore permitted, and only in that direction. It
buys no wall clock IN THE SENSE THE ROW ABOVE MEANS: total work is unchanged, no leg runs faster, no
leg that fits today is given room to grow, and the budget is untouched — a breaching leg still
fails, it merely fails visibly instead of vanishing.

**It does have an operational cost, and the honest statement of it is bounded rather than absent.**
The ceiling is what a WEDGED leg burns before the runner kills it, so raising it raises that
worst-case. Four job definitions realise 14 measured legs (8 parser shards + parser-gates + 4 source
shards + source-gates), and 90 → 125 minutes adds 35 minutes of worst-case exposure each: up to
**490 additional runner-minutes per fully-wedged run**, and a wedged leg holds its concurrency slot
35 minutes longer. That is the price of the guarantee, it is paid only when something is already
broken, and it is bounded — which is the distinction from raising a ceiling to fit growing work,
where the cost is paid on every healthy run and is unbounded by construction. The requirement is pinned
executably as `ceiling >= 2 x SHARD_BUDGET_SECONDS + a 300 s reporting reserve` (7500 s = 125 min today) in `tests/mutation/_metaSourceShardIntegrity.test.ts`,
stated as a factor over the shared constant rather than as minutes, so the two can never drift back
together and neither can be changed alone. The live value is 120 minutes from
`fix/mutation-shard-ceiling-pin`; the comparison table's "90 per shard job" is left as the record of
what THIS design shipped, not as a current reading.

The underlying imbalance producing those times is NOT repaired by any of this and is filed as
`BL-MUTATION-WEIGHT-MODEL-BOOT-COUNT-ONLY`: `weightOf` prices child boots at a flat rate while
measured per-mutant rates span roughly 1.19 s to 23.45 s. The pin does not remove the imbalance; it
guarantees the imbalance stays diagnosable.

### 3.4 Workflow: a matrix of jobs, which is the part that buys the wall clock

Both harnesses become matrix jobs, so each shard gets its own 4-vCPU runner instead of a third of one:

```yaml
jobs:
  parser-shards:
    strategy: { fail-fast: false, matrix: { shard: [0,1,2,3,4,5,6,7] } }   # == SHARD_COUNT
    timeout-minutes: 90
    run: pnpm exec vitest run --project mutation tests/parser/mutationHarness.shard${{ matrix.shard }}.test.ts
  parser-gates:
    timeout-minutes: 30
    run: pnpm exec vitest run --project mutation tests/parser/mutationHarness.gates.test.ts
  source-shards:
    strategy: { fail-fast: false, matrix: { shard: [0,1,2,3] } }           # == SOURCE_SHARD_COUNT
    timeout-minutes: 90
    run: pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shard${{ matrix.shard }}.test.ts
  source-gates:
    timeout-minutes: 15
    run: pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts
```

`fail-fast: false` is load-bearing: one shard's coverage regression must not cancel the other eleven and hide their results, which is the same reason the gate is non-gating.

#### 3.4.1 The matrix index list is a SECOND copy of the shard count, and it is the design's sharpest failure mode

A GitHub matrix cannot read a TypeScript constant, so `[0,1,2,3]` is a literal that can disagree with `SOURCE_SHARD_COUNT`. **That disagreement is silent and it is exactly the "silently missing verdict" this design must not have:** raise `SOURCE_SHARD_COUNT` to 5 without touching the workflow and the partition assigns surfaces to shard 4, the gates file's totality proof still passes (it proves the *logical* partition is total, and it is), every job that runs is green — and shard 4's surfaces were never executed. A duplicated index would double-run a shard just as quietly.

The repair is a **structural meta-test, not a convention** — a NEW file, tests/mutation/_metaSourceShardIntegrity.test.ts, named in plain text here because this arc creates it. It parses `.github/workflows/mutation-harness.yml` and asserts, for BOTH matrices, that the index list is exactly `[0 .. COUNT-1]` against the TypeScript constant — `SOURCE_SHARD_COUNT` for `source-shards`, and the parser harness's existing `SHARD_COUNT` (`tests/parser/mutation/shardPartition.ts:11`) for `parser-shards`. **The parser matrix carries the identical defect** and is repaired in the same commit; this is a class, not an instance. The same test asserts the shard FILE set matches the same constant, so file set, matrix, and constant are pinned to one another in one place.

**Pinning the index list is not enough, and the gap is the sharper half of this defect.** A correct `[0,1,2,3]` says nothing about what each leg RUNS: every leg could hard-code the shard-0 file and the index assertion, the file-set assertion, and the gates file's logical totality proof would all still pass while three quarters of the surfaces never executed. That is not hypothetical arithmetic — a generation-only probe puts `interactionTimingScan` (whose unaccepted survivor is one of the two live failures, §2.7) in source shard 1, and the drifted parser fingerprints in parser shard 4, so a both-matrices-run-shard-0 workflow would make **both** known failures vanish while looking greener than today.

So the test pins the **realized execution target of every leg**:

- each shard leg's `run:` interpolates `${{ matrix.shard }}` into its test path, and substituting each index in turn yields exactly the shard file for that index — no leg names a fixed index;
- each of the two gates legs names its own gates file, and neither names a shard file;
- the union of the four families' realized targets is exactly the **14** files this workflow owns — 8 parser shards, parser gates, 4 source shards, source gates — each named exactly once. The 15th nightly file, the browser gate, belongs to `.github/workflows/mutation-browser.yml` and must appear in no leg here (`.github/workflows/mutation-harness.yml:66-72`);
- **no matrix carries `include:` or `exclude:` modifiers**, which can add or remove realized legs without changing the asserted index list. A future need for one is a change to this test, made deliberately, rather than a silent widening.

The alternative — deriving the matrix from a job output via `fromJSON` — is deliberately rejected: it moves the count into a runtime value the meta-test can no longer read statically, trading a checkable duplicate for an uncheckable one, and it adds a job to the critical path of every run to compute a number that changes about once a quarter.

Expected wall clock is **max over jobs ≈ 47 min + ~3 min setup ≈ 50 min**, against 166 today. Fourteen jobs each pay checkout + install, so *runner-minutes* rise by roughly 14 × 3 = 42 min while *wall clock* falls by ~116 min. For a nightly that is the right trade, and it is the only trade that stays flat as surfaces enrol: a new surface lands in one shard, and when the heaviest shard nears budget, `SOURCE_SHARD_COUNT` goes up.

`permissions: contents: read` stays on every harness job, and the `notify` job keeps sole ownership of `issues: write` (`.github/workflows/mutation-harness.yml:57-61` and `.github/workflows/mutation-harness.yml:89-91`) — the matrix changes job count, not the privilege split. `notify` gains `needs: [parser-shards, parser-gates, source-shards, source-gates]` and names the failing job(s) in the issue body; its existing schedule/default-branch gate (`.github/workflows/mutation-harness.yml:87`) is unchanged.

### 3.5 The margin is asserted, not discovered by crossing it

Partitioning without this leaves the incentive intact, which is the entry's actual complaint.

Each shard job records its elapsed **seconds** and uploads it as an artifact named `elapsed-<job-family>-<shard index>` — **one artifact per matrix leg, uniquely named**. A final `budget` job (`needs:` every harness family, `if: always()`) downloads them and compares against a declared `SHARD_BUDGET_SECONDS = 3600`:

**Seconds, not minutes — amended after plan review R1.** The first draft declared `SHARD_BUDGET_MINUTES = 60` and computed elapsed with integer division. That loses the boundary in the wrong direction: 60m59s records as `60` and slips past an "above 60" comparison, so a shard already over budget reports as exactly at it. The same draft's snippet referenced a `START` variable it never set, which with the variable unset evaluates to epoch minutes and exits 0 — a plausible-looking number measuring nothing. Both are corrected here rather than left for the implementer to rediscover.


- **fails** when any shard's elapsed seconds exceed the budget — a real signal, well below the 90-min job timeout, so the run still produces complete results while reporting that the shape is wrong;
- **warns** (annotation, run still green) above 75 % of budget, which is the "approaching" signal nothing emits today.

The comparison is strictly above in both cases, so a shard at exactly budget passes and a shard one second over fails.

**The transport is fail-closed on completeness, which is the part that is easy to get wrong.** Matrix legs cannot use job *outputs* for this: outputs from matrix children share one name and overwrite each other nondeterministically, so the slow shard is precisely the value that can vanish, and AC-7 would pass on a partial set. Hence artifacts with per-leg names, plus an explicit count check — the `budget` job asserts it received exactly `SHARD_COUNT + SOURCE_SHARD_COUNT + 2` timing records and **fails when any is missing or duplicated**, naming the absent leg. Completeness is checked BEFORE any maximum is taken, and a record that does not parse as a finite number is a failure rather than a zero. A budget job that cannot see every shard reports that it cannot, rather than silently maximising over the shards that did report.

`notify` therefore takes `needs: [parser-shards, parser-gates, source-shards, source-gates, budget]`. Without `budget` in that list a budget-only failure files no tracking issue — the whole point of §3.5 — and worse, `notify`'s green branch could auto-close the standing issue (`.github/workflows/mutation-harness.yml:132-147`) on a run whose budget check had failed. The issue body names the specific failing leg(s) and, for a budget failure, the shard and its elapsed against budget.

`SHARD_BUDGET_SECONDS` and `SOURCE_SHARD_COUNT` are declared once, in one module, and referenced everywhere else (the single-source-of-truth discipline in `docs/agents/spec-self-review.md:14`); §3.4.1 is what stops the workflow's own copies from drifting from them.

This converts "the nightly quietly got slower" into a named failure with a named remedy — raise `SOURCE_SHARD_COUNT` — and it keeps the cost of enrolling a surface at zero, which is the design's own success criterion.

---

## 4. Targets

| Quantity | Today (measured) | Target |
|---|---|---|
| `mutation-harness` wall clock | 166.0 min | ≤ 55 min |
| Heaviest single job | 159.4 min (source gate) | ≤ 47 min |
| Marginal wall clock of enrolling a mean-sized surface (103 mutants; the median is 67) | +9.3 min, on the critical path | ≈ 0 until a shard reaches budget |
| Signal that the job is approaching its ceiling | none | annotation above 75 % of `SHARD_BUDGET_SECONDS`, failure above 100 % |
| `timeout-minutes` on the harness | 300 | 90 per shard job |

---

## 5. Acceptance criteria

- **AC-1** Every enrolled surface resolves to exactly one shard index in `0..SOURCE_SHARD_COUNT-1`; per-shard counts sum to `GUARD_SURFACES.length`. Asserted over the live registry in the gates file.
- **AC-2** Shard assignment is a pure function of the registry and the sources it names: two invocations in the same tree produce identical maps, and no weight table is committed.
- **AC-3** The union of the shards' per-surface `it`s equals what `guardSurfaces.gate.test.ts` ran before the split — same seven cases per surface, same gate conditions, for every enrolled surface. (Written as "all 18 surfaces"; the registry was 21 rows when the arc implemented, and 23 after this arc's own two enrolments. The criterion is `GUARD_SURFACES.length`, which the gates file's totality assertion reads live — a literal here would have gone stale before the branch merged, as this one did.)
- **AC-4** Shard files are the same template: byte-identical to shard 0 after normalising the shard literal and the filename comment; each file's literal matches its filename; the file set is exactly `0..SOURCE_SHARD_COUNT-1`, with no monolith left behind.
- **AC-5** The registry-completeness assertion exists in exactly one place and fails when a surface is enrolled without an `EXPECTED_LEDGER_KINDS` row — the fail-by-default property at `guardSurfaces.gate.test.ts:161-167` survives the move.
- **AC-6** A red shard does not cancel its siblings (`fail-fast: false`), and the tracking issue names which job failed.
- **AC-6a** For BOTH matrices, the new integrity meta-test asserts the workflow's index list equals exactly `0..COUNT-1` for its TypeScript constant (`SOURCE_SHARD_COUNT`; `SHARD_COUNT` at `tests/parser/mutation/shardPartition.ts:11`), and the shard FILE set equals the same range. Raising either constant without updating its matrix fails this test — the executable form of §3.4.1. Fails by default: the test derives the expected range from the constant, so it cannot be satisfied by a stale literal.
- **AC-6b** The same test pins each leg's REALIZED EXECUTION TARGET, not only its declaration: every shard leg interpolates `${{ matrix.shard }}` rather than a fixed index, substituting each index yields exactly that index's shard file, each gates leg names its own gates file and no shard file, the union of realized targets is the 14 files this workflow owns with no duplicate, and no matrix carries `include:`/`exclude:`. **Falsification test for this AC:** a workflow whose every leg runs shard 0 must FAIL it — index lists and file sets alone do not catch that, and it would hide both failures currently live on `main`.
- **AC-6c** The `budget` job receives exactly one timing record per harness leg and **fails naming the absent leg** when any is missing or duplicated; it never maximises over a partial set. `notify` lists `budget` in `needs`, so a budget-only failure files a tracking issue and cannot be auto-closed by a green sibling.
- **AC-7** A shard whose elapsed seconds exceed `SHARD_BUDGET_SECONDS` fails the budget job; a shard above 75 % emits an annotation and stays green; a shard at exactly budget passes. The budget check is an importable function with its own unit suite, not a terminal CLI script — a script that cannot be imported cannot be tested. Verified against a CONSTRUCTED over-budget record, not only against a live run — a budget check that has never been observed failing is not known to fail.
- **AC-8** `permissions: contents: read` on every harness job; `issues: write` only on `notify`.
- **AC-9** Real CI on the implementing branch via the existing path-filtered `pull_request` trigger (`.github/workflows/mutation-harness.yml:27-36`) — per the "local-passes-CI-fails is its own bug class" rule in `AGENTS.md`, local green is necessary and not sufficient. **Green is measured against the merge-base, not against zero**, because `mutation-harness` is red on `main` for two pre-existing reasons unrelated to this arc (§2.7).

  **The comparison is over FAILURE SIGNATURES, never job identity.** Job identity cannot be the key: the merge-base has one `mutation-harness` job (`.github/workflows/mutation-harness.yml:43`) and the branch has four families plus matrix children, so "the same job failed" is not expressible and a subset relation over job names is vacuous. A signature is the pair *(assertion site, failing item)*, normalised so it is invariant to which shard ran it:

  | failure class | signature |
  |---|---|
  | source-mutation gate condition | `<surfaceId>` + gate condition + the offending `siteId` — e.g. `interactionTimingScan` / `unaccepted-survivor` / `logical-connector:330:39:&&>||` |
  | parser ledger reconciliation | the bucket (`NEW` / `FIXED` / `DRIFTED`) + each `siteId|kind|fingerprint` row — e.g. the 11 `blank-row:inject:…` rows |
  | anything else | the test file path with its shard index stripped, plus the `it(...)` title |

  The criterion is **set EQUALITY, not subset**, and the direction matters in both directions. Subset alone is satisfied by the empty set: a branch on which almost nothing ran would show no failures at all and pass, which is precisely the silent-omission failure §3.4.1 exists to prevent — and it would pass *because* the two known failures disappeared, in direct contradiction of §1.2's "does not own, fix, or hide them". Since this arc changes no coverage, the honest expectation is that **the same failures reappear**:

  - a signature present on the branch and absent from the merge-base is a **regression of this diff** — even if it lands in the same file or shard as a pre-existing one;
  - a signature present on the merge-base and absent from the branch is a **disappearance to explain, not a win** — either something stopped executing (the §3.4.1 failure mode), or someone fixed it, and which of those is true must be stated;
  - shard index is never part of a signature, so a failure legitimately moving between shards is not a difference.

- **AC-9b** Execution completeness is asserted **positively and independently of any failure comparison**, because AC-9 alone cannot distinguish "nothing failed" from "nothing ran". The run reports the number of surfaces scored, and it equals `GUARD_SURFACES.length`; the `budget` job's per-leg completeness check (AC-6c) supplies the same property at the job level. A run that scored fewer surfaces than the registry holds fails, whatever its failure set looks like.

  **Procedure shared by AC-9 and AC-9b.** The implementer captures the merge-base signature set FIRST — from the two runs already recorded in §2.7, or a fresh `workflow_dispatch` on the merge-base — and pastes it into the closeout before triaging any red. The harness is not a required context and does not block the merge.
- **AC-9a** All five new files appear in BOTH `MUTATION_TEST_GLOBS` and `NIGHTLY_ONLY_EXCLUDES`, and `tests/cross-cutting/vitest-projects-partition.test.ts` is green — so no shard file is admitted by the `serial` or `parallel` project and none reaches a pull-request leg (§3.3.1).
- **AC-10** `pnpm mutation:guards` (the repo-root `package.json`, `"mutation:guards"` at line 55) still runs the whole gate locally, unsharded, so enrolling a surface needs no shard arithmetic by hand.

---

## 6. Documented limits (carried from round 0)

| id | limit | argument |
|---|---|---|
| **L-1** | Wall clock is bounded by the heaviest **single surface**, not by `SOURCE_SHARD_COUNT`. `specLintNumerics` (521 boots ≈ 43.8 min) pins the makespan from `n=4` on (§2.4). | Measured. Shards past four are empty capacity, which is why the count is 4 and not 8. **Addendum, 2026-08-16, implementation:** the registry left this regime before the arc merged. PRs #825 and #828 took `GUARD_SURFACES` from 16 rows to 21, so total boot weight is 2,220 and an even split is 555 — above `specLintNumerics`'s 521. Re-measured on the live tree with the shipped boot weight: `n=4: max=560 lb=555 (1.009×)`, `n=5: max=521 (pinned)`. The crossover is therefore `n ≥ 5`, not `n ≥ 4`. **The design decision is unchanged and `SOURCE_SHARD_COUNT` stays 4**: 560 boots × 5.04 s = 47.0 min against a 3,600 s budget and a 90-min timeout, while a fifth shard would buy 39 boots (≈ 3.3 min) for a whole runner. Raising the count remains the sanctioned response to a shard *exceeding its budget* (L-2), which is a condition the `budget` job reports; it is not a response to a regime change that leaves every shard inside budget. What this supersedes is the *justification* "shards past four are empty capacity", not the count. |
| **L-2** | **Sub-surface partitioning is deferred, not overlooked** — the same posture R6 took toward this spec. Trigger, stated so it is not a judgement call: when the heaviest single surface's projected cost exceeds `SHARD_BUDGET_MINUTES`, per-surface partitioning can no longer meet the budget and the unit must become the mutant. That requires cross-shard aggregation, because `evaluateGate` scores a surface as a whole. | The budget job (§3.5) is what detects the trigger, so the limit is self-reporting rather than remembered. |
| **L-3** | The weight is a **model** (§2.3), not a measurement. It assumes a killed mutant costs one boot and a survivor costs every suite; a surface whose mutants are killed only by a LATER suite is under-weighted, and one whose real survivors exceed its ledgered `accepted` rows is too — though that second case fails the gate anyway, so it cannot persist. Consequence is shard imbalance only: the partition stays total and disjoint, so no verdict changes (§3.1). Re-deriving the model against per-surface timings, once any exist, is a cheap future refinement and needs no design change — the weight is recomputed live. | Short-circuit at `tests/mutation/source/runner.ts:216-228`; three-weight comparison in the probe record. |
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
