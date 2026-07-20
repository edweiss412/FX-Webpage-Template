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
| **The membership model is NOT inverted.** An earlier draft proposed a `SERIAL_ONLY_FILES` list; round-1 review proved it non-constructible in vitest and showed it would trade away safe-by-default. The ratified design keeps today's single-source model and adds `PARALLEL_EXTRA_FILES` (§3). Do not re-propose the inverted model | this spec §3, round-1 finding 1 |

## 2. Empirical spike (mandatory, run in-worktree 2026-07-20, before any design prose)

### 2.1 Post-P2 composition

Residual serial project: **770 files** (mutationHarness excluded). Of these only **208 carry a DB/env marker** (`postgres(`, `TEST_DATABASE_URL`, `createClient`, `@supabase/`, `psql`, `spawn`/`execFile`/`child_process`, service-role/secret env names); **562 are marker-free**. Per-leg reality on the shipped 8-leg matrix (run 29720857479, leg 1): serial 69 files / 73s test time; parallel 78 files / 29s test time — the serial phase remains the leg's dominant cost.

### 2.2 Probe A — do the marker-free files actually run without a DB?

All 562 marker-free files, one scratch config, `fileParallelism: true`, every DB/Supabase endpoint pointed at a closed port (TCP port 9, the discard service). The terminal reporter summarised **514 passed / 48 failed**; the JSON reporter's set of DISTINCT failing paths is **46** (`db` 27, `reports` 11, `sync` 5, `cross-cutting` 2, `notify` 1) — these reach the DB **transitively** through helpers, which the marker scan cannot see. The 2-file discrepancy between the two counts is NOT resolved here and is deliberately not load-bearing: the candidate set was formed conservatively as 562 − 46 = 516 and then independently RE-VALIDATED green three times (§2.3), so the proof of membership is the repeat runs, not this subtraction. This is also why membership is measured, not inferred (§1.1).

### 2.3 Probe B — is the verified set stable under concurrency?

The 516-file verified set (562 marker-free − 46 measured-DB-bound) was run **four times** with the DB closed and `fileParallelism: true`. First run: 3 transient failures (concurrent with another vitest process finishing). Three consecutive clean repeats afterwards: **0 failures, 0 flakes** (4,920 tests, ~113–118s wall each). The transient trio is attributed to host contention, not the set; CI legs run one vitest process per runner.

### 2.4 Probe C — the residual serial set

The remaining **254 files** (`db` 102, `onboarding` 37, `sync` 36, `notify` 15, `reports` 12, `cross-cutting` 9, `scripts` 8, `auth`/`admin`/`api` 6 each, `codexGuard` 4, `observe` 3, …) were run serially against the live local DB, minus the three `ENV_BOUND_EXCLUDES` files (251 executed): 235 passed / 15 skipped / 1 failed — the single failure is `validation-check-seed-content-coverage`, the known locally-degraded-DB class that reproduces at merge-base (measured during P2: 45 failures on origin/main config vs 4 on the P2 diff). Conclusion: the residual set is coherent as the serial project.

### 2.5 Structural consequence

Every one of the 19 remaining serial directories is MIXED (`admin`, `agenda`, `api`, `async`, `auth`, `codexGuard`, `cross-cutting`, `data`, `db`, `log`, `notify`, `observe`, `onboarding`, `reports`, `scripts`, `show`, `specLint`, `supabase`, `sync`). No further whole-dir move exists — file granularity is the only remaining lever, which is precisely the P2 descope this phase picks up.

## 3. Design

**Extend the existing single-source model with an explicit parallel-file list — do NOT invert it.** An earlier draft proposed listing the 254 serial files instead; adversarial review established that model is not constructible in vitest (round 1): the serial project is built as `BASE_INCLUDE` minus the parallel globs, and vitest's `exclude` cannot be un-applied for individual files, so a dir-glob plus per-file exception either drops the exceptions from both projects or admits every non-listed file to both. The constructible design keeps today's mechanism exactly and adds one new entry type to the same single source of truth.

1. **`vitest.projects.ts` gains `PARALLEL_EXTRA_FILES: readonly string[]`** — the 516 spike-verified exact paths (§2.3), sorted, deduplicated. `PARALLEL_TEST_GLOBS` (dir globs) is unchanged; **no mixed dir is added to it.**
2. **Both projects derive from the union, exactly as today:** parallel `include: [...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`; serial `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES, ...nightlyExcludes, ...envBoundExcludes]`. Membership is therefore still "parallel iff claimed by the union, serial otherwise, none iff nightly" — the P2 three-way model needs only its `matchesParallel` extended with exact-path membership.
3. **Safe-by-default is PRESERVED, and the parallel-by-default hazard never exists.** Because no mixed dir becomes a parallel glob, a NEW test file in `tests/db`, `tests/onboarding`, `tests/sync`, … still lands in SERIAL automatically. This is the decisive advantage over the inverted model and removes that model's entire mitigation burden. The only way a file becomes parallel is an explicit, reviewable line in `PARALLEL_EXTRA_FILES`.
4. **New script, created by this phase (not yet tracked): audit-serial-files.mjs under scripts/** — single reproducibility contract: given the current tests/ tree, it runs the §2.2/§2.3 protocol (closed-port env, `fileParallelism: true`) over every serial-project file and **emits the exact `PARALLEL_EXTRA_FILES` array body** (verified DB-free files), so the committed list is regenerated, never hand-edited. It does not emit a serial list, and it carries no reason tags — the list is a pure measured artifact, and its provenance lives in this spec plus the module header.
5. **List-integrity is enforced structurally, not by convention** (§4): every entry must exist on disk, be unique, be sorted, match `BASE_INCLUDE`, be claimed by NO `PARALLEL_TEST_GLOBS` entry (else it is redundant and the two sources could drift), and not be nightly- or env-bound-excluded.

## 4. Meta-test inventory (mandatory declaration)

EXTENDS `tests/cross-cutting/vitest-projects-partition.test.ts`. CREATES none (the audit script is tooling; item (g) exercises its output contract).

(a) `matchesParallel` extended: a file is parallel-claimed if a dir glob matches **or** it is in `PARALLEL_EXTRA_FILES`; P2's three-way `projectOf` is otherwise unchanged.
(b) **Config-resolution pin (closes the round-1 tautology finding):** assert against the ACTUAL config objects, not only the helper — `parallel.include` equals `[...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`, and `serial.exclude` contains every entry of both lists. This is what proves a listed file is admitted by parallel AND removed from serial (the "excluded from both" hole).
(c) **List integrity** (§3.5), each its own assertion: exists on disk; unique; sorted; matches `BASE_INCLUDE`; NOT claimed by any dir glob; NOT nightly; NOT env-bound.
(d) **Anti-vacuity band with an UPPER bound:** `PARALLEL_EXTRA_FILES.length` in `[400, 600]` — the lower bound catches an emptied list, the upper catches a list that accidentally swallowed the serial set. The band is documented as intentionally re-tuned whenever the audit script legitimately moves the count.
(e) **Spot-checks updated honestly:** the whole-dir `mustBeSerial` rows for `tests/onboarding`, `tests/api`, `tests/notify` become file-level rows naming their DB-bound members (these dirs are now genuinely mixed); `tests/db/advisory-lock.test.ts` and the corpus WRITER `tests/sync/dev-routing.test.ts` are asserted serial by exact path.
(f) **Env-bound assertion preserved:** the three `ENV_BOUND_EXCLUDES` paths must be absent from `PARALLEL_EXTRA_FILES` and claimed by no dir glob — i.e. the existing contract survives verbatim, because no mixed dir became a glob (§3.3).
(g) **Audit-script output contract:** the script's emitted array, when run over the committed tree, equals `PARALLEL_EXTRA_FILES` — pinning regeneration reproducibility rather than merely asserting the script exists. (Executed as a fast static comparison against the committed list; the full closed-port protocol run remains a manual/periodic operation, not a per-PR gate.)

The P1 balance/topology meta-tests and P2's three-way model stay green.

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

Residual serial post-P2: 770 files, 208 marker, 562 marker-free (§2.1); probe A terminal 514 passed / 48 failed vs 46 distinct failing paths, discrepancy explicitly non-load-bearing (§2.2); verified set 516, 4 runs, 3 clean repeats, 4,920 tests (§2.3); residual serial 254 files of which 251 executed (3 env-bound excluded), 235 passed / 15 skipped / 1 known-degraded (§2.4); 19 mixed dirs (§2.5); per-leg serial 69 files / 73s, parallel 78 files / 29s, run 29720857479 leg 1 (§2.1); `PARALLEL_EXTRA_FILES` band [400, 600] (§4d); P2 baseline max leg 254s, skew 57s (§5.2); regression floor 300s (§5.3); skew gate 75s (§5.4).
