# CI unit-suite Phase 2 — serial-set audit (move verified DB-free dirs to the parallel project)

**Date:** 2026-07-19
**Program:** Phase 2 of 3 (`2026-07-19-ci-unit-suite-under-5min.md` §2). Phase 1 SHIPPED (PR #504: 8-leg matrix, max leg 263s, image-cache lever reverted on measurement).
**Authorization:** all three phases user-authorized autonomous (2026-07-19, in-session; recorded in the P1 spec header).

## 1. Goal

Shrink the serial vitest project — the unit-suite's dominant cost center (~50% of its wall is ~560ms/file fork/transform isolation overhead, P1 spec §3) — by moving every WHOLE directory that passes the ratified PR-B verification protocol into the parallel project. Direct wins: smaller serial phase per CI leg, faster local `pnpm test`, and a smaller residual surface for Phase 3.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Program + autonomy: 3 phases, all pre-authorized; P2 = serial-set audit only | P1 spec §1.1 row 1 / §2 |
| **Directory granularity only.** `PARALLEL_TEST_GLOBS` is dir-glob-shaped and its own contract says "add to this list ONLY after verifying the dir is DB-free" (`vitest.projects.ts:17-18`). Mixed dirs (e.g. `tests/sync` 130/161 marker-free, `tests/admin` 80/86) are NOT split file-by-file in this phase — file-granular globs are brittle and the protocol unit is the dir. Their residual is Phase 3 input | this spec; audit §2 |
| The 12 candidate dirs are exactly those with ZERO DB-marker hits in the §2 scan AND a green protocol run (§2.2). No dir ships without both | this spec §2 |
| Weight-model rework (per-file overhead constant, serial-vs-parallel default weights) is DESCOPED: P1's shipped configuration measures skew 52s against the ≤75s gate — there is no active balance problem to fix. Revisit only if a future measured skew exceeds the gate | P1 measurements (run 29716763290); P1 spec §1.1 DEFAULT_WEIGHT row |
| The serial-phase guarantee (`fileParallelism: false` within the serial project) and the two-phase project ordering are untouched | `vitest.config.ts:83`, `vitest.projects.ts:12-16` |
| No workflow changes: the 8-leg matrix, aggregator, and topology meta-test ship as-is from P1 | P1 §6 accept gate outcome |
| `ENV_BOUND_EXCLUDES` / `NIGHTLY_ONLY_EXCLUDES` semantics unchanged | `vitest.projects.ts:36-48` |

## 2. Empirical audit (run in-worktree, 2026-07-19)

### 2.1 Marker scan

All 940 serial test files scanned for DB/env/child-process markers (`postgres(`, `TEST_DATABASE_URL`, `createClient`, `@supabase/`, `psql`, `spawn`/`execFile`/`child_process`, service-role/secret env names). Result: 734 marker-free files; **12 dirs are 100% marker-free**:

| Dir | Files |
| --- | --- |
| `tests/parser` | 120 (excl. the 9 nightly `mutationHarness.*` files, which stay in NO default project per `vitest.projects.ts:41-48`) |
| `tests/drive` | 28 |
| `tests/cron` | 10 |
| `tests/dataQuality` | 8 |
| `tests/appSettings` | 5 |
| `tests/geocoding` | 2 |
| `tests/design`, `tests/dates`, `tests/showLifecycle`, `tests/invariants`, `tests/github`, `tests/venue` | 1 each |

Total: **179 files**. Terminology note: the "940 serial files" scan population is the `!matchesParallel` complement, which includes the 9 nightly-only files that at runtime live in NO default project — runtime serial membership is 931. `tests/sample.test.ts` looked root-serial in the raw scan but is already a parallel exact-file glob (`vitest.projects.ts:71`) — no action.

Skip accounting (not a pinned claim): `tests/drive` holds two env-gated live-smoke files — `realDriveMarkdownSmoke.test.ts` (needs Drive credentials + spreadsheet id) and `embeddedObjectsLiveSmoke.test.ts` (needs `FXAV_LIVE_SHEETS`). In the §2.2 spike shell exactly one skipped; in any given environment 0–2 of them may skip. The protocol claim is "zero FAILURES with endpoints closed," not a fixed skip count.

### 2.2 Protocol run (the PR-B ratified bar, `vitest.projects.ts:6-9`)

All 12 dirs together, in one scratch vitest config with `fileParallelism: true` and every Supabase/DB endpoint pointed at a closed port (`SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` → `http://127.0.0.1:9`, `TEST_DATABASE_URL`/`DATABASE_URL` → port 9): **178 passed | 1 skipped, 2,745 tests, 11.85s wall**. Zero failures proves (a) DB-freeness (nothing reached a live endpoint) and (b) intra-set concurrency safety.

### 2.3 Corpus-race check (the one known shared-FS hazard)

`vitest.projects.ts:12-16` documents the hazard: `tests/parser` readers share the `fixtures/shows/raw` corpus with the `tests/sync/dev-routing.test.ts` writer. The protection is PHASE ordering, not project membership: vitest runs the parallel project and serial project in separate sequential phases, so parser readers in the parallel project never overlap the serial writer. Moving parser to parallel preserves exactly the already-documented safe shape ("a fixture-corpus reader in the parallel set … never races the serial writer" — `vitest.projects.ts:14-16`). Parser files racing EACH OTHER is a pure-reader race: safe, and empirically exercised by §2.2.

## 3. Design

1. **`vitest.projects.ts`:** append 12 dir globs to `PARALLEL_TEST_GLOBS` (`tests/parser/**/*.test.{ts,tsx}`, `tests/drive/…`, `tests/cron/…`, `tests/dataQuality/…`, `tests/appSettings/…`, `tests/geocoding/…`, `tests/design/…`, `tests/dates/…`, `tests/showLifecycle/…`, `tests/invariants/…`, `tests/github/…`, `tests/venue/…`). The serial project's `exclude` and the parallel project's `include` are both built from this list (`vitest.config.ts:77-91`), so membership flips atomically. Note: the serial project ALSO unconditionally excludes the nightly mutationHarness files; the parallel project's include must NOT capture them — `tests/parser/**` WOULD, so the parallel project gains the same `NIGHTLY_ONLY_EXCLUDES` exclusion (see §3.3).
2. **Prose:** update the `vitest.projects.ts` header comment's serial-dir examples (it names `tests/parser` as serial — stale after this change) and record the 2026-07-19 protocol run alongside the original PR-B verification note.
3. **Mutation-harness guard (load-bearing):** the parallel project currently has NO exclude (`vitest.config.ts:86-92` — include-only). Adding `tests/parser/**` would pull the 9 `mutationHarness.*` files into every unit-suite leg (~102k mutants — the exact thing `NIGHTLY_ONLY_EXCLUDES` exists to prevent, `vitest.projects.ts:41-48`). The parallel project gains `exclude: [...configDefaults.exclude, ...NIGHTLY_ONLY_EXCLUDES]`, and a new partition-test assertion pins that exclude's presence (§4).
4. **Partition meta-test redesign (REQUIRED — the current test cannot survive this change as-is; R1 finding 1):** `matchesParallel` (`vitest-projects-partition.test.ts:44-50`) is glob-only, so with `tests/parser/**` added it would misclassify the 9 nightly files as parallel, breaking three existing assertions and one prose claim. The redesign, in full:
   - Introduce a three-way membership function `projectOf(file): "parallel" | "serial" | "none"` — `"none"` for `NIGHTLY_ONLY_EXCLUDES` matches (they live in no default project), `"parallel"` for `matchesParallel` matches, `"serial"` otherwise. This mirrors the exact construction `vitest.config.ts` uses (serial exclude = parallel globs + nightly; parallel include = globs, exclude = nightly).
   - The exactly-one-project walker (`:110-119`) partitions over `projectOf`: every non-nightly file in exactly one of parallel/serial; every nightly file in `"none"` (and, when `VITEST_INCLUDE_MUTATION_HARNESS=1`, the mutation project — the existing env-gated assertion at `:213+` keeps covering that).
   - The `mustBeSerial` spot-check (`:121-135`) DELIBERATELY changes: `tests/parser/parseSheet.test.ts` (a corpus READER) moves out of the list — its serial placement is exactly what this phase retires, protocol-verified (§2.2/§2.3). The WRITER `tests/sync/dev-routing.test.ts` and all DB/env-bound rows stay.
   - The harness not-in-parallel assertion (`:202-210`) asserts `projectOf(f) === "none"` instead of `matchesParallel(f) === false`.
   - The single-source-of-truth prose (`:21-23`, "a file is parallel iff it matches a parallel glob and serial otherwise") is updated to the three-way rule.
5. **TDD anchor:** the partition test gains a `PHASE2_VERIFIED_PARALLEL_DIRS` literal (the 12 dirs) asserting, for each dir `d`, that the exact glob literal `tests/<d>/**/*.test.{ts,tsx}` is present in `PARALLEL_TEST_GLOBS` (literal containment — bare dir strings do not satisfy the prefix matcher, so the anchor pins the glob list itself). Fails before the glob additions, passes after.
6. **`FILE_WEIGHTS` unchanged:** weights are project-agnostic (keyed by path; the sequencer shards the union). `tests/parser/blocks/event.test.ts` (8000) simply becomes a parallel-phase cost. Balance meta-test unaffected (its file-set model already subtracts both exclude sets).
7. **Stale live comment:** `vitest.config.ts:42` describes the parallel project as "~300 verified DB-free render/unit files" — reword count-neutrally ("the verified DB-free files; see vitest.projects.ts") so the number can never rot again.

## 4. Meta-test inventory (mandatory declaration)

EXTENDS + PARTIALLY REDESIGNS `tests/cross-cutting/vitest-projects-partition.test.ts` (§3.4 enumerates every touched assertion): (a) the `PHASE2_VERIFIED_PARALLEL_DIRS` glob-literal anchor (§3.5); (b) a pin that the parallel project entry's `exclude` contains every `NIGHTLY_ONLY_EXCLUDES` glob (§3.3 — without it, a future removal silently puts ~102k mutants into every PR leg); (c) the `projectOf` three-way membership rework with the walker, `mustBeSerial`, and harness assertions updated per §3.4. The P1 balance/topology meta-tests run unchanged and must stay green. CREATES none. No advisory locks, no Supabase call boundaries, no UI, no DB.

## 5. Accept criteria (real CI)

1. All 8 legs + aggregator green on the PR run; full local `pnpm test` green (both phases, membership flipped).
2. Measure the PR's qualifying run with the P1 `measure()` procedure (8 legs): record max leg wall + vitest skew in the PR body against the P1 baseline (263s / 52s, run 29716763290). Expected direction: ~179/8 ≈ 22 candidate files leave each leg's serial phase (~22 × 0.56s ≈ 12s isolation overhead) and their test time moves to the multi-worker parallel phase — expected net **~15–40s per leg**; modest, structural. **No hard wall target** — P1 already met the <5 min gate; a wall-clock REGRESSION beyond noise (max leg >300s) blocks merge and triggers investigation, but improvement magnitude does not gate.
3. Balance: vitest skew ≤75s (the P1 gate carries over; the reweight branch from P1's plan applies if exceeded).

## 6. Out of scope

- File-granular moves inside mixed dirs (`tests/sync`, `tests/admin`, `tests/db`-adjacent clean files, …) — Phase 3 input (§1.1).
- Weight-model rework (§1.1 rationale).
- Any workflow/shard-count change; any `isolate:false` experiment; DB-test parallelization (Phase 3, spike-first per program doc).

## 7. Numeric self-consistency register

940 scan population (= `!matchesParallel` complement; runtime serial = 931) / 734 marker-free / 12 zero-marker dirs / 179 candidate files (§2); spike shell observed 178 passed + 1 skip, skip count 0–2 by env, not pinned (§2.1/§2.2); protocol run 2,745 tests, 11.85s (§2.2); per-leg projection ~22 files ≈ 12s overhead, net 15–40s (§5.2); P1 baseline max leg 263s, skew 52s, run 29716763290 (§5); mutation harness 9 files ~102k mutants (§3.3); regression floor 300s (§5.2); skew gate 75s (§5.3).
