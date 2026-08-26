# Mutation gate fidelity: stop a leg going silent, score the surface that cannot be scored, and stop taxing the PRs that touch the harness

**Arc:** arc-gatefidelity · **Branch:** `fix/mutation-gate-fidelity` · **Date:** 2026-08-26
**Closes:** `BL-MUTATION-HARNESS-MAIN-RED`, `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT`, `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`
**Files:** `.github/workflows/mutation-harness.yml`, `tests/mutation/source/surfaceCases.ts`, `tests/mutation/source/oracle.ts`, `tests/db/connectionCensus.test.ts`, `tests/mutation/source/spawnBounded.ts`, `BACKLOG.md`, `BACKLOG-archive.md`

**This arc files no new `BL-` or `DEF-` row of any facing** (Eric's directive, 2026-08-25, which overrides the mint freeze's exception clauses). Every finding below is repaired here or recorded as a documented limit on the surface that owns it.

---

## 1. The problem, as measured this morning

Three failures, all read per-annotation, none of them carried from a row.

### 1.1 The nightly on `main` is red, and the failure set has turned over completely

Scheduled run [32943869448](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32943869448), head `9a621a579`, 2026-08-26 07:40 UTC, at `SOURCE_SHARD_COUNT` 4. Exactly two jobs are not `success`, and neither is any failure `BL-MUTATION-HARNESS-MAIN-RED` names:

| job | conclusion | annotation |
| --- | --- | --- |
| `source-shards (3)` | failure | `BaselineNotGreenError: mutation baseline is not green: tests/supabase/_metaRetryableRpcVolatility.test.ts, tests/supabase/_metaRetryableRpcVolatilityWalk.test.ts fails on UNMUTATED source.` |
| `budget` | failure | all four legs over: `6176s`, `5393s`, `3995s`, `4138s` against the 3600 s budget |

Every other leg is `success`. The row's own thesis about itself held: its named set turned over between filing and today.

**Its three named mechanical repairs are already landed on `main`, re-verified on this branch's base.** They are evidence that closes the row, not work:

- The ledger-kind class (`rowScanOpener`, `fieldNearMiss`) is closed by the row's own derivation, re-run at `75b8f7a3e`: **52 surfaces, 0 mismatches.** Landed at `a66f465c7`.
- The `destructiveFileAnalysis` re-key is done: the accepted rows sit at the survivor lines the row quotes, and each resolves against the live `tests/db/_destructiveFileAnalysis.ts`.
- Both `shardBudget` survivors are killed by assertions, not blessed by rows, by `tests/ci/shardBudget.test.ts` `rejects a ZERO budget on the BUDGET check` and `renders the warn band as exactly 75%`, with `expectedLedgerKinds.ts` declaring `shardBudget: {}` and the registry row carrying `accepted: []`.

### 1.2 The current failure set, on the tree this branch actually builds on

The 07:40 nightly predates the merge of #902, which took `SOURCE_SHARD_COUNT` from 4 to 8. The closest measurement of the merged content is run [32958581720](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32958581720), head `929368bf3` — the branch tip that merged as `060f5c7d8`. Read per-annotation:

| job | conclusion | seconds | annotation |
| --- | --- | --- | --- |
| `source-shards (1)` | failure | 2494 | `unaccepted-survivor: 1 survivor(s) with no ledger row: statement-removal:1641:7:withSites.add(record.file);>(removed)` |
| `source-shards (5)` | failure | 2731 | `BaselineNotGreenError` on the `retryableRpcVolatilityScan` pair |
| `budget` | **success** | 25 | six warnings, no failure; binding leg `3260s` |
| every other leg | success | 1720–3267 | — |

So on the merged tree the failure set is **two surfaces**, and the `budget` job is green.

### 1.3 The fan-out, measured on 2026-08-26 alone

`gh run list --workflow mutation-harness.yml` over today, before this branch existed:

| branch | runs | outcome |
| --- | --- | --- |
| `feat/speclint-dispatch-gates` | 5 | 4 cancelled, 1 in flight |
| `fix/mutation-shard-weight-seconds` | 5 | 3 cancelled, 2 failure |
| `fix/supabase-upstream-fault-class` | 3 | 2 cancelled, 1 failure |
| `fix/mutation-shard-budget-six` | 3 | 2 cancelled, 1 failure |

**Sixteen full-matrix fan-outs in one day, eleven of them cancelled by the next push before producing any verdict.** At `SOURCE_SHARD_COUNT` 8 the matrix is **20 jobs, 18 of them full test legs** (8 parser shards + parser gates + 8 source shards + source gates + budget + notify).

---

## 1.1 Resolved scope — do not relitigate

Each with its ratification.

| Decision | Ratified at |
| --- | --- |
| **The PR trigger is narrowed.** Full matrix nightly on `main`; a smoke leg on PRs. The reviewer may challenge WHICH leg is the smoke leg and what signal is lost; it may not reopen whether to narrow. | Eric's ruling, 2026-08-26 04:53, carried in the arc brief |
| **No new ledger row, of any facing, with no exception clause.** No `product-blocked`, no `invariant`, no class-sweep exception (a)/(b)/(c). | Eric's directive, 2026-08-25 |
| **`SHARD_BUDGET_SECONDS = 3600` and `timeout-minutes: 125` are the target, not the variable.** The sanctioned response to over-budget is raising `SOURCE_SHARD_COUNT`; `timeout-minutes` is the forbidden one. | `.github/workflows/mutation-harness.yml:426` |
| **arc-shardbudget's `N = 8` and its per-shard budget assertion are settled input, not this arc's subject.** | #902, merged `060f5c7d8` |
| **The `concurrency` block's PR-only `cancel-in-progress` is left exactly as it is.** A scheduled nightly must never cancel another. | `.github/workflows/mutation-harness.yml:64-66`; `BL-MUTATION-HARNESS-PR-TRIGGER-FANOUT` says every candidate direction wants it untouched |
| **The ten `pull_request.paths` globs are left exactly as they are.** Narrowing happens at the job, not the filter — see §3.4 for why this is strictly better. | `tests/mutation/_metaSourceShardIntegrity.test.ts:373-378` pins three of them |
| **The `millisPerBoot` upper bound stays bounded by the BUDGET, not by the mutant ceiling.** Nothing in §3.5 licenses capping that validator. | `tests/mutation/_metaGuardSurfaceRegistry.test.ts:130-140`, whose case deliberately accepts `millisPerBoot: 200_000` |
| **The `GUARD SURFACE:` validator's "plus" refusal in `scripts/codex-guard.mjs` belongs to arc-speclintgates.** This arc writes the comma form and moves on. | arc brief item 7 |
| **`BL-MUTATION-HARNESS-MAIN-RED`'s original failure list is valid as of its filing and superseded by re-measurement, not by disagreement.** Recorded once, in §1.1, and cited thereafter. | §1.1 above |

---

## 2. The class, and why it is not the one it looks like

### 2.1 The obvious reading is wrong

`BaselineNotGreenError` looks like a class of "enrolled surfaces whose deciding suites need an environment the `source-shards` job does not provide," repairable by enumerating which surfaces need what. Two derivations say otherwise.

**Derivation A — project membership over-fires by 77.** `unit-suite-nodb` runs exactly `--project=parallel` with no database (`.github/workflows/unit-suite.yml`, the `No supabase/setup-cli, no psql, no bootstrap` comment above its `--project=parallel` step), so parallel-project membership is a CI-enforced DB-free claim. Sweeping every enrolled `suitePaths` entry against `PARALLEL_TEST_GLOBS`:

```
surfaces = 52
suitePaths OUTSIDE the CI-verified DB-free parallel project: 77
```

Seventy-seven, across more than twenty surfaces that score green today. The serial project means "not yet audited", not "needs a database" — `vitest.projects.ts:18-19` says new directories default to serial deliberately. Membership is sufficient, nowhere near necessary, and a guard built on it would refuse two dozen healthy surfaces.

**Derivation B — lexical environment markers over-fire too, and for an instructive reason.** Scanning each suite and its transitive local imports for `postgres(`, `assertLocalDbUrl`, `LOCAL_TEST_DATABASE_URL`, `TEST_DATABASE_URL` and `psql` flags 16 surfaces. Almost all are false: `tests/db/_connectionCensus.ts` and `tests/db/_destructiveFileAnalysis.ts` are static analyzers **of** connection code, so the marker strings are their subject matter, not their behavior. `connectionCensus` returns real kills and one real survivor on a runner with no database, which settles it empirically.

A recognizer over either signal is a denylist that accepts whatever it did not model, and both are refuted by probe before a line of it was written.

### 2.2 The class is that a leg dies wholesale, and it is derivable

`evaluateSurface` runs at **module scope inside `describe.each`** (`tests/mutation/source/surfaceCases.ts:88`), which the file's own header calls deliberate and load-bearing. So `runSurface` throwing `BaselineNotGreenError` throws during vitest **collection**, and a collection throw aborts the whole shard file. Every other surface on that leg reports nothing.

That is measurable, and it reproduces exactly. Deriving the partition locally at `75b8f7a3e`:

```
leg 0: 1   leg 1: 5   leg 2: 5   leg 3: 7
leg 4: 8   leg 5: 8  <== holds retryableRpcVolatilityScan
leg 6: 9   leg 7: 9                       total 52
```

Leg 5 is precisely the leg that failed on run 32958581720. **It holds 8 surfaces, so one surface's missing database censored 7 others** — `modal-wait-helper-scan`, `fixtureContract`, `acCoverage`, `rowScanOpener`, `interactiveScanCore`, `executionMethodsDerivation`, `replacementString`. 13.5% of the registry reported nothing, and nothing in the run says so.

**This is the class, and its cover is a derivation over the mechanism rather than over a list of surfaces.** Any surface that throws for any reason — a missing database today, a missing binary tomorrow, a corrupt registry row, a scratch-directory failure — takes its whole leg with it. Repairing the mechanism covers every surface present and future without anyone maintaining an enumeration. That is what §3.1 does.

The consequence bound this arc converges against follows from it: **every enrolled surface is either scored or named in an annotation a triager can act on, and a leg that reports nothing is the only unacceptable outcome.**

---

## 3. Repairs

### 3.1 R1 — per-surface fault isolation in `registerSurfaceCases` (the class cover)

**Today.** `registerSurfaceCases` calls `readFileSync(surface.sourcePath)` and `evaluateSurface(surface, options)` at describe-callback time. Either throwing aborts collection of the entire shard file.

**Change.** Evaluation becomes fallible and per surface. A surface whose evaluation throws registers exactly one failing `it` naming that surface, the error class and the message; every other surface in the slice still evaluates, still emits its notices, and still registers its seven cases.

Shape:

```ts
type SurfaceOutcome =
  | { kind: "evaluated"; before: Buffer; run: RunResult; result: GateResult }
  | { kind: "faulted"; error: unknown };
```

`evaluateSurfaceOutcome(surface, options)` is a pure-in-the-relevant-sense wrapper returning one of the two; `registerSurfaceCases` branches on it. The failing case reads:

```ts
it("evaluates at all; this surface faulted before it could be scored", () => {
  expect.fail(
    `${surface.id} could not be evaluated: ${name}: ${message}\n` +
      `Every other surface on this leg still reported; this one did not run.`,
  );
});
```

**Why the leg still fails.** A faulted surface registers a failing case, so the leg is red and the gate's verdict is unchanged. What changes is that the red is attributable and the other seven surfaces are visible.

**The derived cover, executable.** A fixture suite calls `registerSurfaceCases` with two synthetic surfaces — one whose deciding suite is guaranteed to fail on unmutated source, one inert and healthy — and is run as a child vitest process (the pattern `guardSurfaces.gates.test.ts` already uses via `childRun`/`INERT_TARGET`). The parent asserts, against the child's report, that the healthy surface's cases ran AND that the faulted surface is named. Under today's code the child reports neither, because collection dies. The failure mode it catches, concretely: someone moves the evaluation back outside the wrapper, or catches and swallows instead of registering a case.

**R1 also names the surface in the error.** `BaselineNotGreenError` (`tests/mutation/source/oracle.ts:21-30`) carries only the suite list, so the annotation on run 32958581720 named two test files and no surface — a triager has to re-derive the partition to learn which surface owns them. `assertCleanBaseline` gains the surface id and the message leads with it.

### 3.2 R2 — give the `source-shards` job the database

**Both alternatives are refuted by probe, so this is not a preference.**

*The probe.* With a local database the pair is green in 1.36 s:

```
Test Files  2 passed (2)      Tests  25 passed (25)
```

With the port closed it fails in `beforeAll` and does not skip:

```
FAIL tests/supabase/_metaRetryableRpcVolatility.test.ts
Error: connect ECONNREFUSED 127.0.0.1:1
Test Files  1 failed | 1 passed (2)     Tests  3 passed | 22 skipped (25)
```

The environment is the entire cause. Fail-not-skip is deliberate and ratified in the suite's own header (`tests/supabase/_metaRetryableRpcVolatility.test.ts:17-20`): a skip would leave the retry set unverified while the suite reported pass.

*Why narrowing `suitePaths` to the DB-free walk file is refuted.* `e2ecf639e` already split the DB-free cases into `_metaRetryableRpcVolatilityWalk.test.ts`, so this looks like half-done work. It is not viable: the surface's own control mutant is

```
from: "if (set.has(name) || hasReasonedEntry(exclusions, name)) continue;"
to:   "if (set.has(name) && hasReasonedEntry(exclusions, name)) continue;"
```

which targets `completenessViolations`, a catalog-decided arm. The walk file cannot notice it, so narrowing would destroy the AC-3 overlay-liveness proof — the one assertion that stops a silently-dead overlay reporting a perfect score. Beyond the control, the walk file exercises only `literalsInProductTree`; the rest of the 334-line module is catalog-decided, so the score would crater below its 0.9 floor.

*Why de-enrolment is refused.* The surface guards a live safety property — that every retryable RPC is provably non-writing — and the registry row carries `accepted: []` with a 0.9 floor. Nothing here says the harness cannot express it; only that one job lacks a database.

**Change.** `source-shards` gains the same bring-up `unit-suite-db` uses, as `run:` steps, immediately after `./.github/actions/setup` and alongside the existing chromium pair:

```yaml
- run: pnpm dlx supabase@2.107.0 --version   # CLI on PATH, pinned; see below
- run: command -v psql >/dev/null || (sudo apt-get update && sudo apt-get install -y postgresql-client)
- run: bash scripts/ci/supabase-local-bootstrap.sh
```

**`run:` steps, never `uses:`, and the reason is written at the `run:` steps, not actions comment in `.github/workflows/mutation-harness.yml`** — the chromium precedent chose `run:` so the integrity guard's step accounting is untouched. The same reason applies, plus one this job adds: `tests/mutation/_metaSourceShardIntegrity.test.ts:240-243` asserts that **only the first step writes `$GITHUB_ENV`**, so no bring-up step may export anything.

**The cost, measured rather than feared.** Off a real `unit-suite-db` leg (run 32977168722, job 98210351983): `supabase/setup-cli` 2 s, psql install 0 s, `Boot local Supabase (guarded migrations)` **82 s**. Against source legs of 2494–3267 s that is 2.6–3.4%. The binding leg goes 3267 s → ~3351 s, **93.1% of the 3600 s budget** — inside it, and inside the 7500 s job ceiling with enormous margin. For comparison, the ratified chromium precedent costs 35 s per leg (25 + 10, same run) for exactly one surface; this is the same trade at 2.4× the price.

**Unconditional on every leg, matching the chromium precedent, and the alternative is a documented limit.** A conditional bring-up — compute the leg's slice, bootstrap only if it holds a database-needing surface — would cost ~84 s on one leg instead of eight. It is rejected here because it needs a new declaration on the registry row, a new `$GITHUB_OUTPUT` step, a job-level `if:` on three steps, and a guard to keep the declaration honest; that is a new signal threaded through four files to save eleven minutes of nightly runner time on a workflow this same spec removes from every PR. Recorded as documented limit L-1 with its re-file trigger.

**`source-gates` is untouched.** Its comment at `mutation-harness.yml:176-177` states why: its one child runs an inert fixture and never a deciding suite.

### 3.3 R3 — kill the `connectionCensus` survivor with an assertion

Scope addition from bl-orch, 2026-08-26: no live arc owns it, and PR #899 leaves `connectionCensus` an unmeasured gap because its prior number was co-measured under a reseed.

**The mutant is LIVE, and the argument is from its evaluated output, never from the site's shape** (`BL-MUTATION-HARNESS-MAIN-RED` records an earlier draft getting this exactly backwards).

`statement-removal:1641:7` deletes `withSites.add(record.file);` from `reconcileValidationEnv` (`tests/db/_connectionCensus.ts:1636-1651`). `withSites` then stays empty, and

```ts
stale: allow.map((row) => row.file).filter((file) => !withSites.has(file)),
```

reports **every** allow row as stale — including rows whose file genuinely still holds a `validation-env` site. That is an observable output change on the arm whose entire job is telling a live allowance from a dead one. Not equivalent; a ledger row would bless a real defect.

**Why it survives.** The `reconcileValidationEnv` describe block (`tests/db/connectionCensus.test.ts:2464-2536`) tests `stale` in both directions that make it non-empty — a file whose site is gone, and a row naming a file absent from the walk — and never once asserts `stale` is EMPTY for a row whose file still has a site. The nearest case, `the same site in an allowlisted file is NOT reported`, asserts only `.unallowed`.

**The killing case.** Records carrying a `validation-env` site in file F, allow naming F with a reason, assert `stale` is `[]`. Clean: `[]`. Mutant: `[F]`. It fails for the deleted line and for nothing test-local — the fixture is the same `classifyFile` + `ALLOW` pair the neighbouring cases already use, so the RED comes from production behavior, not from a helper the test writes.

### 3.4 R4 — narrow the PR trigger to a smoke leg

**The mechanism is a job-level `if:`, not an edit to the trigger, and that is strictly better than editing the filter.**

```yaml
if: github.event_name != 'pull_request'
```

on `parser-shards`, `source-shards` and `budget`. `notify` already excludes pull requests (`mutation-harness.yml:332`).

**Why not narrow the ten globs, which is where the row points.** The globs are not loose by accident — each covers a path whose edit can change a verdict, and `_metaSourceShardIntegrity.test.ts:373-378` pins three of them by name. Removing entries would trade a capacity problem for a coverage hole and fight a guard that exists for good reason. Gating the jobs keeps every glob's coverage of the structural signal while removing the long legs, so the class of ten globs is resolved without editing any of them.

**What the smoke leg is.** `parser-gates` and `source-gates`, the two corpus-wide gates jobs. Measured on run 32958581720: **333 s and 38 s.**

**What signal a harness-touching PR PRESERVES.** Both gates files are generation-only and structural: `guardSurfaces.gates.test.ts` asserts `EXPECTED_LEDGER_KINDS` declares every enrolled surface, that the union of shard slices is exactly the registry, and that no surface lands in two slices; `mutationHarness.gates.test.ts` carries the parser harness's generation and structural gates. Every defect class an ordinary harness-touching PR introduces — a surface enrolled without a ledger declaration, a partition that drops or duplicates a surface, a shard file wired to the wrong slice — still reds at PR time in under six minutes.

**What signal it LOSES, named plainly because it does lose one.** The mutation SCORES. A PR that weakens a deciding suite so a guard stops pinning what it claims will no longer red at PR time; it reds on the next nightly, after merge. That is the whole content of this trade, and pretending otherwise would be dishonest.

**The escape, stated in the workflow so the next arc does not rediscover it.** `workflow_dispatch` at `mutation-harness.yml:33` gives any branch a real full run on demand: `gh workflow run mutation-harness.yml --ref <branch>`. A comment above the gated jobs says so.

**Measured effect.** A harness-touching PR goes from **20 jobs (18 test legs) to 2 jobs**. Against today's sixteen fan-outs, eleven cancelled mid-flight, that is the whole of the capacity this arc returns — and it dwarfs R2's eleven added nightly minutes.

**`budget` must be gated too, and its skipping is correct rather than a loss.** It `needs:` the four harness jobs with `if: always()`, and `scripts/check-shard-budget.ts` checks completeness before any maximum — "an absent record must not read as ‘that shard was fast’" (`mutation-harness.yml:255-256`). With sixteen shard legs skipped it would fail on sixteen missing records, which is a true statement about a run that measured nothing and a useless one to put on a PR. Its subject is the legs, and on a PR there are none.

### 3.5 R5 — the 180 s mutant ceiling: the proposed direction is refuted, and the measurement is recorded

The brief carries a measurement on `connectionCensus`: eight `TIMEOUT-KILL`s at the ceiling, all non-terminating, costing 24 of that run's 107 minutes, with 325 non-timeout kills at median 1586 ms, p95 2102 ms, max 3691 ms and **nothing between 10 s and 180 s** — a bimodal distribution whose empty gulf argues the lever is a SMALLER ceiling, around 30 s.

**Pooled across all 52 surfaces that is false, and lowering the ceiling would corrupt the gate's verdict.** The measurement is this section's own, produced by the command beside it over every record the run uploaded:

```
gh run download 32958581720 -p 'mutation-records-source-shards-*'
# 50 records, one per evaluated surface; 6961 non-timeout children; 16 timeouts
```

```
pooled median 1519 ms   p95 4523 ms   max 103143 ms
children in the 10s..180s "gulf": 215
children >30s: 128        timeouts: connectionCensus 8, sendAuthScan 4, four others 1 each
```

The gulf is not empty; it holds 215 genuine kills. The surface `psqlStartupScan` has a **median of 31,054 ms**, so its whole distribution sits above a 30 s ceiling. So a 30 s ceiling would convert at least 128 genuine kills into `TIMEOUT-KILL`s, and `tests/mutation/source/gate.ts` says exactly what that costs, in the `TIMEOUT-KILL` notice it emits: a timeout "scores KILLED, which is the standard verdict, but it is NOT evidence the suite rejected the mutant." The ceiling drop would inflate the apparent kill count while hollowing out its meaning, which is the precise opposite of this arc's purpose.

**The ceiling stays at 180 s.** By the derivation shape `tests/mutation/browser/timeout.test.ts:34-38` uses — a multiple of the pooled measured healthy maximum — 180,000 ms against a pooled max of 103,143 ms is **1.75×**, well under the browser side's 10×. If the source ceiling is wrong it is wrong by being tight, not loose, and moving it in either direction is a different arc with a different measurement.

**Recorded, not filed.** The pooled distribution, the 1.75× margin and the refutation go into the derivation comment at `tests/mutation/source/spawnBounded.ts:55-66`, which is the constant's own justification and the place a reader looks. That is the brief's instruction for the not-touching case, and it is what Eric's directive requires of a finding this arc does not repair. Documented limit L-2 carries the re-file trigger.

---

## 4. Documented limits

| id | limit | re-file trigger |
| --- | --- | --- |
| **L-1** | The database bring-up runs on all eight source legs for one surface, costing ~84 s each (~11 min nightly) where a conditional bring-up would cost it once. Rejected as more machinery than the saving is worth, and as a new declaration to keep honest. | The binding leg exceeding 95% of `SHARD_BUDGET_SECONDS` with the bring-up as the marginal cause, or a second database-needing surface enrolling. Recorded in the workflow comment beside the bring-up steps. |
| **L-2** | `MUTANT_TIMEOUT_MS` is 1.75× the pooled measured healthy maximum (103,143 ms at `929368bf3`), where the browser-side constant is pinned at ≥10×. The source side has no executable derivation pin, only `tests/mutation/source/childRun.test.ts` asserting `opts.timeout` is above zero. | A `TIMEOUT-KILL` on a surface whose non-timeout children are all under 10 s, or the pooled max crossing 180,000 ms. Recorded at `spawnBounded.ts:55-66`. |
| **L-3** | Sixteen non-terminating mutants per nightly (8 on `connectionCensus`, 4 on `sendAuthScan`, 4 elsewhere) each burn the full 180 s. The cheap lever would be recognizing a removed sole loop advance at generation time, which is a generator change this arc does not make. | The timeout count exceeding 25 in one run, or timeouts exceeding 10% of a leg's elapsed seconds. Recorded at `spawnBounded.ts:55-66`. |
| **L-4** | A harness-touching PR no longer sees mutation scores; a suite weakened so a guard stops pinning what it claims reds on the next nightly, after merge, not at PR time. `workflow_dispatch` is the escape. | Named in §3.4 and in the workflow comment above the gated jobs. This is the ratified trade, not a defect. |
| **L-5** | `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`'s residue: the weight model rebalances modelled BOOTS while the budget bounds SECONDS. Measured spread at `c5518dfab` was 3.8× (1.4 s/boot against 5.3 s/boot). `N = 8` cleared the breach without touching that miscalibration. | Recorded in the row's archive entry with its subsumption arithmetic. |

---

## 5. Subsumption arithmetic for `BL-MUTATION-SOURCE-SHARD-BUDGET-BREACH`

The row is closed by #902, and the arithmetic is written out rather than asserted.

At `N = 4`, run 32943869448: four legs at 6176 + 5393 + 3995 + 4138 = **19,702 s**, every one over the 3600 s budget, `budget` job FAILED.

At `N = 8`, run 32958581720: eight legs at 3165 + 2494 + 1720 + 3260 + 2873 + 2726 + 2807 + 3113 = **22,158 s**, binding leg **3260 s = 90.6% of budget**, `budget` job **SUCCESS** with six warn-band warnings and zero failures.

Total seconds rose ~12.5% because each additional leg pays its own setup and boot; makespan fell 47%, which is the number the budget bounds. Adding R2's 84 s puts the binding leg at ~3344 s = **92.9%**, still inside.

**The residue, stated as a documented limit rather than a row** (L-5): six of eight legs sit in the warn band, so the margin is ~340 s on the binding leg. The mechanism `N` does not touch is the one the row itself names — boots rebalanced, seconds bounded. Its re-file trigger is a `budget` FAILURE on a scheduled `main` run, which is self-reporting by construction.

---

## 6. Acceptance criteria

| id | criterion | how it is proved |
| --- | --- | --- |
| **AC-1** | A surface that faults during evaluation registers one failing case naming it, and every other surface on its leg still evaluates, emits notices and registers its cases. | Child-vitest fixture suite (§3.1). Red on today's tree because collection dies. |
| **AC-2** | `BaselineNotGreenError` names the surface id, not only the suite paths. | Unit case on `assertCleanBaseline`. |
| **AC-3** | `retryableRpcVolatilityScan` scores on a `source-shards` leg, with no `BaselineNotGreenError` in any annotation. | `workflow_dispatch` run on this branch; per-annotation read. |
| **AC-4** | `reconcileValidationEnv` reports `stale: []` for an allow row whose file still holds a `validation-env` site; `connectionCensus` has zero unaccepted survivors. | The killing case (§3.3) plus a scored `pnpm heavy:mutation` run. |
| **AC-5** | A harness-touching pull request enqueues exactly 2 jobs; `schedule` and `workflow_dispatch` still enqueue 20. | Job count on this branch's own PR, against the measured 20. |
| **AC-6** | The bring-up steps are `run:` steps and none writes `$GITHUB_ENV`. | `tests/mutation/_metaSourceShardIntegrity.test.ts` stays green. |
| **AC-7** | Every enrolled surface this diff touches carries a stated `GUARD SURFACE:` score with zero unaccepted survivors. | Scored runs under `pnpm heavy:mutation` with the class lock taken. |
| **AC-8** | The next scheduled nightly on `main` after the merge is green on every leg, `source-gates`, both parser jobs and `budget`. | The adjudicating observation. It lands after the merge, and this arc does not merge. |

---

## 7. Invariants in play

- **1 (TDD per task):** every repair is failing test → implementation → passing test → commit.
- **11, 12:** worktree off the `origin/main` containing #902; all three rows marked IN PROGRESS and pushed before the first edit; markers removed in the PR's last commit.
- **2, 3, 4, 5, 9, 10:** no advisory-lock, email, cursor, user-visible-code, Supabase-call-boundary or mutation-surface change here. N/A, declared.
- **8:** `impeccable-gate: N/A - no UI surface`.
- **Class-sweep at round 1, docs included:** §2 sweeps to a derivation over the mechanism, not to a list of surfaces; §3.4 resolves the ten-glob class without editing a glob.

## 8. Meta-test inventory

- **CREATES:** the child-vitest fixture proving per-surface fault isolation (§3.1).
- **EXTENDS:** `tests/db/connectionCensus.test.ts` (§3.3).
- **UNTOUCHED, declared:** `_metaSourceShardIntegrity.test.ts`, `_metaGuardSurfaceRegistry.test.ts`, `_metaSpawnDisposition.test.ts` — no new or renamed ceiling constant, no matrix or step-accounting change beyond `run:` steps and a job-level `if:`, and no `millisPerBoot` bound change.
