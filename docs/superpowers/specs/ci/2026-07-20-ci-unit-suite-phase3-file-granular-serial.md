# CI unit-suite Phase 3 — file-granular serial set (spike-directed; per-worker-DB approach KILLED)

**Date:** 2026-07-20
**Program:** Phase 3 of 3 (`2026-07-19-ci-unit-suite-under-5min.md` §2). P1 SHIPPED (#504: 8-leg matrix, max leg 263s). P2 SHIPPED (#507: 12 dirs serial→parallel, max leg 254s).
**Authorization:** all three phases user-authorized autonomous (2026-07-19, in-session).

## 1. Goal

Shrink the serial vitest phase to the files that genuinely need the shared local Supabase DB, by moving the **516 spike-verified DB-free files** currently trapped in mixed directories into the parallel project — at FILE granularity, which P2 deliberately descoped.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Program + autonomy: 3 phases, all pre-authorized | P1 spec §1.1 / §2 |
| **The program's originally-sketched Phase-3 subject — per-worker Postgres databases / schema-per-worker / per-worker Supabase stacks — is KILLED, not deferred.** The mandatory spike (§2) shows it is unnecessary: 516 of the 770 residual serial files never touch the DB at all. Building per-worker DB infrastructure to parallelize files that do not use the DB would be pure cost. Genuinely DB-bound files (254) stay serial | this spec §2, §2.4; program doc §2 explicitly required the spike to "prove or kill" this |
| The spike IS the design authority here (AGENTS.md: "Empirical spike before speccing stateful/race/framework surfaces"; "for design-correctness vectors the comprehensive re-analysis IS the spike") | §2 |
| Membership is decided by MEASURED behavior (closed-port + `fileParallelism:true`, 3 clean repeats), never by marker heuristics alone — the marker scan produced 562 candidates of which 46 actually needed the DB transitively | §2.2 |
| Serial project keeps `fileParallelism: false`; two-phase ordering untouched; no workflow/shard-count change (8-leg ships as-is) | `vitest.config.ts`, P1 §6 |
| `ENV_BOUND_EXCLUDES` / `NIGHTLY_ONLY_EXCLUDES` semantics unchanged; the three env-bound files stay serial-resident | `vitest.projects.ts:36-48` |
| P2's three-way `projectOf` partition-test model stays; this phase extends it, does not replace it | #507 |

## 2. Empirical spike (mandatory, run in-worktree 2026-07-20, before any design prose)

### 2.1 Post-P2 composition

Residual serial project: **770 files** (mutationHarness excluded). Of these only **208 carry a DB/env marker** (`postgres(`, `TEST_DATABASE_URL`, `createClient`, `@supabase/`, `psql`, `spawn`/`execFile`/`child_process`, service-role/secret env names); **562 are marker-free**. Per-leg reality on the shipped 8-leg matrix (run 29720857479, leg 1): serial 69 files / 73s test time; parallel 78 files / 29s test time — the serial phase remains the leg's dominant cost.

### 2.2 Probe A — do the marker-free files actually run without a DB?

All 562 marker-free files, one scratch config, `fileParallelism: true`, every DB/Supabase endpoint pointed at a closed port (TCP port 9, the discard service): **514 passed, 48 failed**. Re-derived precisely from the JSON reporter: **46 files fail** (`db` 27, `reports` 11, `sync` 5, `cross-cutting` 2, `notify` 1) — these reach the DB **transitively** through helpers, which the marker scan cannot see. This is exactly why membership is measured, not inferred (§1.1).

### 2.3 Probe B — is the verified set stable under concurrency?

The 516-file verified set (562 marker-free − 46 measured-DB-bound) was run **four times** with the DB closed and `fileParallelism: true`. First run: 3 transient failures (concurrent with another vitest process finishing). Three consecutive clean repeats afterwards: **0 failures, 0 flakes** (4,920 tests, ~113–118s wall each). The transient trio is attributed to host contention, not the set; CI legs run one vitest process per runner.

### 2.4 Probe C — the residual serial set

The remaining **254 files** (`db` 102, `onboarding` 37, `sync` 36, `notify` 15, `reports` 12, `cross-cutting` 9, `scripts` 8, `auth`/`admin`/`api` 6 each, `codexGuard` 4, `observe` 3, …) were run serially against the live local DB: 235 passed / 15 skipped / 1 failed — the single failure is `validation-check-seed-content-coverage`, the known locally-degraded-DB class that reproduces at merge-base (measured during P2: 45 failures on origin/main config vs 4 on the P2 diff). Conclusion: the residual set is coherent as the serial project.

### 2.5 Structural consequence

Every one of the 19 remaining serial directories is MIXED (`admin`, `agenda`, `api`, `async`, `auth`, `codexGuard`, `cross-cutting`, `data`, `db`, `log`, `notify`, `observe`, `onboarding`, `reports`, `scripts`, `show`, `specLint`, `supabase`, `sync`). No further whole-dir move exists — file granularity is the only remaining lever, which is precisely the P2 descope this phase picks up.

## 3. Design

**Invert the membership model for mixed dirs.** Instead of listing 516 parallel files, list the 254 files that must stay serial. Rationale: the serial list is smaller, it is the security-relevant list (a file wrongly ABSENT from it races the DB), and it shrinks as tests improve, while the parallel list would grow forever.

1. **New module, created by this phase (no such file exists yet, so it is deliberately not cited as tracked code): vitest.serial-files.ts at the repo root** exporting `SERIAL_ONLY_FILES: readonly string[]` — the 254 repo-relative paths from §2.4, each with the reason tag it was classified by (`marker` | `measured-transitive`), sorted, one per line. Generated by a committed script (item 3) so it is reproducible, not hand-maintained.
2. **`vitest.projects.ts`:** add the remaining 19 dirs to `PARALLEL_TEST_GLOBS`. Membership then reads: parallel iff (a parallel glob matches) AND (not in `SERIAL_ONLY_FILES`) AND (not nightly-excluded); serial iff in `SERIAL_ONLY_FILES` (plus anything no glob claims — new dirs still default serial, preserving the safe-by-default contract); none iff nightly.
3. **`vitest.config.ts`:** parallel project `exclude` gains `...SERIAL_ONLY_FILES` (alongside `configDefaults.exclude` and the nightly globs). Serial project `include` becomes `SERIAL_ONLY_FILES` plus `BASE_INCLUDE` minus the parallel globs — i.e., its existing `exclude`-driven construction still holds, with `SERIAL_ONLY_FILES` removed from the parallel-glob subtraction. The exact wiring must keep the partition meta-test's exactly-one-project invariant true by construction, not by coincidence.
4. **New script, created by this phase (not yet tracked): audit-serial-files.mjs under scripts/** (committed): runs the §2.2/§2.3 protocol — closed-port env, `fileParallelism: true`, over every file in a glob-claimed mixed dir — and prints the measured DB-bound set. Re-running that script is how a future contributor re-derives `SERIAL_ONLY_FILES` after adding tests. The spike's scratch configs are NOT committed; this script replaces them.
5. **New-file safety (the one genuinely new hazard):** a NEW test file added to a now-parallel dir lands in the PARALLEL project by default — the inverse of today's safe-by-default. Mitigation, spelled out because it is the class this design trades into: the partition meta-test gains a **staleness guard** asserting that every path in `SERIAL_ONLY_FILES` still exists (a renamed/deleted serial file must not silently become parallel), and `vitest.projects.ts`'s header states the new contract loudly ("files in these dirs are PARALLEL by default. A new DB-touching test MUST be added to SERIAL_ONLY_FILES; run the audit-serial-files script under scripts/ to verify"). CI's own DB tests failing under concurrency is the backstop; the guard makes the common mistake (rename) fail loudly instead of silently.

## 4. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/vitest-projects-partition.test.ts`: (a) `projectOf` gains the `SERIAL_ONLY_FILES` clause (parallel-glob match + serial-list membership → `"serial"`); (b) NEW staleness guard — every `SERIAL_ONLY_FILES` path exists on disk (§3.5); (c) NEW pin — the parallel project's `exclude` contains every `SERIAL_ONLY_FILES` entry (without it the files run in BOTH projects); (d) the existing spot-checks extend: `tests/db/advisory-lock.test.ts` and `tests/sync/dev-routing.test.ts` (the corpus WRITER) must be IN `SERIAL_ONLY_FILES`; (e) anti-vacuity — `SERIAL_ONLY_FILES.length` is within a sane band (≥200) so an emptied list fails loudly. The P1 balance/topology meta-tests and P2's three-way model stay green. CREATES: none (the audit script is tooling, exercised by (b)+(c)).

## 5. Accept criteria (real CI)

1. All 8 legs + aggregator green; local `pnpm test` green modulo the known locally-degraded-DB class (verified against merge-base, as in P2).
2. Measure with P1's `measure()` (`LEGS=8`): record max leg wall + vitest skew vs P2's shipped baseline (**254s / 57s**, run 29720857479). Expected direction: the serial phase drops from ~69 to ~32 files per leg with its DB-free test time moving to multi-worker execution.
3. **Regression floor:** max leg < 300s blocks merge if exceeded (same floor as P2). Improvement magnitude does not gate.
4. Skew ≤ 75s (P1 gate carries over; P1's reweight branch applies if exceeded).

## 6. Out of scope

- Per-worker DB/schema/stack infrastructure — KILLED by the spike (§1.1), not deferred.
- Shard-count or workflow changes; `isolate:false`; weight-model rework (P2 §1.1 rationale stands: measured skew is inside the gate).
- Making the 254 serial files DB-free (test refactoring) — a future opportunity, not this phase.

## 7. Numeric self-consistency register

Residual serial post-P2: 770 files, 208 marker, 562 marker-free (§2.1); probe A 514 passed / 46 measured DB-bound (§2.2); verified set 516, 4 runs, 3 clean repeats, 4,920 tests (§2.3); residual serial 254 files, 235 passed / 15 skipped / 1 known-degraded (§2.4); 19 mixed dirs (§2.5); per-leg serial 69 files / 73s, parallel 78 files / 29s, run 29720857479 leg 1 (§2.1); P2 baseline max leg 254s, skew 57s (§5.2); regression floor 300s (§5.3); skew gate 75s (§5.4); serial-list anti-vacuity band ≥200 (§4e).
