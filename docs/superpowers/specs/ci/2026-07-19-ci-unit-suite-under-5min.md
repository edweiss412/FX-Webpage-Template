# CI unit-suite under 5 minutes — program + Phase 1 (config levers)

**Date:** 2026-07-19
**Status:** Phase 1 spec (this document). Phases 2–3 are program commitments that get their own specs.
**Predecessors:** PR A (#107 concurrency/paths), PR B (#111 two-project split), PR C (#116 PR-only cancel), PR D (#121 2-leg shard matrix), PR E (weight-balanced sequencer + 3rd leg). See `docs/superpowers/specs/ci/README.md`.
**Authorization:** user approved the full 3-phase program for autonomous shipping (2026-07-19, in-session). Phase 1 = this PR.

## 1. Goal

The REQUIRED `unit-suite` check is the CI wall-clock long pole: **~9.1 min average** over the last 40 runs (max healthy leg 8 min; every other workflow ≤5.7 min and runs in parallel). Target: **max shard-leg wall clock < 5 min** on real CI, without dropping any test coverage.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| 3-phase program, all phases pre-authorized autonomous; each phase = own spec + plan + PR, sequential | user, in-session 2026-07-19 ("all phases can ship autonomously") |
| Phase 1 = config levers only: shard count, image caching, weight refresh. NO test-file moves (Phase 2), NO DB-test parallelization (Phase 3) | in-session design approval |
| Shard count 6 primary, 8 as the predeclared in-PR fallback if the accept gate misses (§6) — not relitigated per-round | this spec §5.1 |
| node_modules-cache and psql-install levers are DEAD — measured already-free (§3, setup=17s, psql=0s). Do not re-propose | measured run 29710814674 |
| Docker image cache is a **conditional** lever: kept only if the measured cache-hit boot saving is ≥15s (§5.2). A revert of that lever inside this PR is in-spec, not a scope cut | this spec §5.2 |
| `DEFAULT_WEIGHT` stays 1500; only heavy-file entries refresh (§5.3). Wall-model reweighting (per-file overhead constant) is deferred to Phase 2 where the serial set changes anyway | this spec §5.3 |
| Serial-project `fileParallelism: false` guarantee within a leg is untouched (invariant since PR B/D) | `vitest.config.ts:83`, `2026-06-26-ci-unit-suite-matrix-shard-design.md` §3.4 |
| Per-file fork/transform overhead (~560ms/serial file, §3) is Phase 2/3 material (isolation strategy), NOT addressed here | in-session design approval |
| The three env-bound excludes stay excluded via `VITEST_EXCLUDE_ENV_BOUND=1` (each gated elsewhere; `unit-suite.yml` header documents all three) | `unit-suite.yml:24-40` |

## 2. Program overview (phases 2–3 are commitments, not designs)

1. **Phase 1 (this PR):** shard matrix 3→6, conditional Supabase-image docker cache, `FILE_WEIGHTS` refresh from measured CI timings, meta-test updates. Expected ≈4.3–4.7 min.
2. **Phase 2 (own spec):** serial-set audit — the serial project is the default bucket (`vitest.config.ts:75-76` "New dirs default here"); audit which files are actually DB-bound, move DB-free files to the parallel project, and revisit the weight model (per-file overhead constant, §3). Input: Phase 1's measured per-leg timings.
3. **Phase 3 (own spec + mandatory empirical spike):** DB-test parallelization. Spike compares per-worker Postgres databases (+ per-worker PostgREST exposure), per-worker Supabase stacks, and shard-count escalation as the control. Known risk to prove/kill in the spike, not in prose: schema-per-worker behind one PostgREST conflicts with `public`-pinned SECURITY DEFINER functions and search_path pins. Per AGENTS.md ("Empirical spike before speccing stateful/race/framework surfaces"), no Phase 3 prose design before the spike runs.

Each later phase starts from the predecessor's measured CI numbers; none of this document constrains their design beyond the do-not-relitigate rows above.

## 3. Measured baseline (spike data, run 29710814674, 2026-07-20, green)

Per-leg step durations (leg 1; legs 2/3 within noise):

| Step | Duration |
| --- | --- |
| checkout | 1s |
| `./.github/actions/setup` (pnpm via warm `cache: pnpm`) | **17s** |
| `supabase/setup-cli@v1` (pinned 2.107.0) | 2s |
| Install psql (guarded `command -v psql \|\|`) | **0s** (preinstalled on ubuntu-latest) |
| Boot local Supabase (`scripts/ci/supabase-local-bootstrap.sh`) | **71s** = ~38s docker pull (first `Pulling` 01:22:22 → last `Pulled` 01:23:00) + ~32s start/schema/migrations/health |
| vitest (`--shard=1/3`) | **383s** (legs: 325 / 383 / 399; sum 1107s) |

Inside the vitest step (log-timestamp analysis, ANSI-stripped `✓ <project> <file> (n tests) <ms>` lines):

- **Projects run sequentially** (parallel first, then serial — vitest phases per project).
- Parallel project: 488 files total across legs (~162/leg), ~107s wall per leg, 51–68s summed test time (multi-worker).
- Serial project: 821 files total (~260–283/leg), 217–290s wall per leg, 83–130s summed test time. The gap is **~560ms per-file** fork/transform/setup overhead — about half the serial wall is isolation cost, not tests. (Phase 2/3 material; see §1.1.)
- Full suite: 1,309 completed files + a handful of env-skips. File counts are derived dynamically by the meta-tests, never hardcoded.

Heavy files measured (test-time ms, threshold ≥8,000ms) vs the committed `lib/test/vitest.weights.ts:9-14` map:

| File | Measured | Committed weight |
| --- | --- | --- |
| `tests/cross-cutting/no-global-cursor.test.ts` | 54,320 | 30,000 (stale, −45%) |
| `tests/scripts/validation-report-fixtures.test.ts` | 39,671 | 76,000 (stale, +92% — PR E lever B shrank the file after the weight was set) |
| `tests/codexGuard/timeouts.test.ts` | 27,861 | **absent** (new with PR #502) |
| `tests/cross-cutting/validation-check-seed-content-coverage.test.ts` | 22,579 | 41,000 (stale) |
| `tests/components/admin/wizard/Step3ReviewModal.test.tsx` | 15,357 | **absent** |
| `tests/scripts/validation-check-seed.test.ts` | 14,952 | 25,000 (stale) |
| `tests/app/admin/showReviewModalLoader.test.tsx` | 10,724 | **absent** |
| `tests/parser/blocks/event.test.ts` | 8,312 | **absent** |

### 3.1 Why 6 shards alone was not enough at the old overhead estimate — and is now

Earlier design arithmetic assumed ~2.2 min fixed overhead per leg; measurement shows **~95s** (17+2+0+71+~5s job setup). Projection at 6 legs: vitest ≈ parallel ~55–60s + serial ~(137 files × 0.56s + ~60s test time) ≈ 195–200s; leg ≈ 95 + 200 ≈ **~4.9 min** uncached, **~4.4–4.6 min** with a working image cache. Hence the conditional cache lever and the 8-leg fallback.

## 4. What changes (Phase 1 diff surface)

1. `.github/workflows/unit-suite.yml` — matrix `[1..6]`, `--shard=i/6`, image-cache steps (§5.2).
2. `lib/test/vitest.weights.ts` — `FILE_WEIGHTS` refresh (§5.3).
3. `tests/cross-cutting/unit-suite-shard-topology.test.ts` — regex updates: matrix literal + denominator `3` → `6` (`unit-suite-shard-topology.test.ts:22-39`), plus new cache-step pins (§5.4).
4. `tests/cross-cutting/vitest-shard-balance.test.ts` — extend both `for (const N of [2, 3])` loops (`vitest-shard-balance.test.ts:64,88`) to `[2, 3, 6]`.
5. No source-code changes. No UI (invariant 8 N/A). No DB/migrations (validation-parity N/A). No `pg_advisory*` (lock topology N/A).

## 5. Design

### 5.1 Shard count 3 → 6

- `matrix: shard: [1, 2, 3, 4, 5, 6]` and `--shard=${{ matrix.shard }}/6` in `unit-suite.yml:56,80`. The `WeightBalancedSequencer` already reads `count` from `config.shard` (`vitest.sequencer.ts:57`, generalized N per PR E §3.1) — **no sequencer code change**.
- Aggregator (`unit-suite` required context, `unit-suite.yml:82-100`) unchanged: `needs.unit-suite-shard.result` rolls up any matrix size. Branch protection untouched.
- Serial-DB guarantee: unchanged — each leg boots its own Supabase on its own runner; `--shard` selects files, never changes project membership or intra-leg order (PR E §3.1 "Serial-DB guarantee preserved").
- Runner-minutes cost: ~6×5 = 30 min/run vs current ~3×8 = 24. Accepted (in-session).
- **Fallback (predeclared, in-PR):** if §6's gate misses at 6, bump to 8 (`[1..8]`, `/8`, topology-test literals, balance-test N) in the same PR. 8 is the cap for this phase; beyond that is Phase 2's problem.

### 5.2 Conditional lever — Supabase docker-image cache

Pull is ~38s of the 71s boot. Mechanism:

- `actions/cache@v4` step before boot: `path: ~/supabase-images.tar.zst`, `key: supabase-images-${{ runner.os }}-<CLI version literal>` (image tags derive from the pinned CLI version — `unit-suite.yml:66` pins `2.107.0`; the key embeds the same literal so a CLI bump rolls the cache).
- On cache hit: `zstd -d --stdout ~/supabase-images.tar.zst | docker load` before the bootstrap (zstd is preinstalled on ubuntu-latest).
- On miss: after the bootstrap succeeds, `docker save $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'supabase|kong|postgrest') | zstd -T0 > ~/supabase-images.tar.zst`; the cache action's post-step uploads it.
- The bootstrap script (`scripts/ci/supabase-local-bootstrap.sh:87`, `supabase start -x imgproxy,mailpit,studio,postgres-meta,edge-runtime,vector,logflare`) is **unchanged**: `supabase start` skips pulling images already present. Note: the `-x` list in the script is the source of truth; this spec does not restate it normatively.
- **Keep-or-revert gate:** on the PR's first cache-hit run, compare the boot step against the 71s baseline. Saving ≥15s → keep. Saving <15s (docker load can cost what pull cost) → revert the cache steps in the same PR and record the measurement in the PR body. Either outcome is in-spec (§1.1).
- Risk bound: `docker load` failure or corrupt cache must not fail the leg — the load step is `continue-on-error`-free but written defensively (`|| true` on the load; a failed load just means `supabase start` pulls as today). **This is the only permitted soft-failure**: the topology meta-test continues to assert no `continue-on-error: true` anywhere in the workflow (`unit-suite-shard-topology.test.ts:53-58`), and the `|| true` is scoped to the load command line only, never the boot or vitest steps.

### 5.3 `FILE_WEIGHTS` refresh

Replace the 4-entry map (`lib/test/vitest.weights.ts:9-14`) with the 8 measured entries from §3 (values = measured ms, rounded to the nearest 1,000). Comment each row `// measured 2026-07-20 run 29710814674`. `DEFAULT_WEIGHT` stays `1500` (§1.1). The existing balance meta-test guards (no stale keys, ≤1.25× mean bin weight — `vitest-shard-balance.test.ts:73,113`) apply unchanged at the new N.

Balance floor check at N=6: heaviest single file 54s ≪ per-bin mean (~2,300k ms total weight / 6 ≈ 390k), so LPT balance is not floor-limited.

### 5.4 Meta-test updates (inventory — mandatory declaration)

This phase **extends** two existing structural meta-tests; it creates none:

- `tests/cross-cutting/unit-suite-shard-topology.test.ts` — matrix literal `[1, 2, 3]` → `[1, 2, 3, 4, 5, 6]`; denominator assertion `3` → `6`; NEW pins: (a) the cache step's `key` contains the same CLI version literal as the `supabase/setup-cli` step (drift = stale images silently reused across CLI bumps), (b) if the cache steps are reverted per §5.2, pin (a) is dropped in the same commit (the test never asserts steps that don't exist).
- `tests/cross-cutting/vitest-shard-balance.test.ts` — N loops `[2, 3]` → `[2, 3, 6]` (both `:64` and `:88`); all existing guards (clean cover, 1.25× mean, stale keys, sequencer wiring) run at N=6 automatically.
- Unaffected and must stay green: `tests/cross-cutting/vitest-projects-partition.test.ts` (project membership untouched), `tests/cross-cutting/ci-workflow-speedup.test.ts` (`ci-workflow-speedup.test.ts:34` pins `unit-suite.yml` in `PR_FIRING_WORKFLOWS` — still true).

## 6. Accept gate (real CI, authoritative — PR-D empirical-gate pattern)

On the PR's Actions runs (the second run gives the cache-hit measurement):

1. All 6 legs green, aggregator green, and **max leg wall clock < 5 min** on a cache-hit run.
2. Legs within ~75s of each other (balance sanity; if skew exceeds this, re-estimate the outlier file's weight from the run's own log and re-push — still within this PR).
3. Cache lever keep-or-revert decided per §5.2's ≥15s rule, measurement recorded in the PR body.
4. If (1) misses at 6 legs with the cache decision applied: execute the predeclared 8-leg fallback (§5.1) and re-measure. If it STILL misses at 8, merge whatever configuration measured fastest (it strictly dominates baseline) and record the residual gap as Phase 2's opening number — the 5-min target then rides on Phase 2, which was always the plan for the serial-overhead half of the wall.

Local `pnpm test` / x-audits `vitest run <file>` behavior: unchanged — the sequencer's `shard()` only runs under `--shard` (`vitest.sequencer.ts` / PR E §3.1), and no vitest project or exclude changes ship in this phase.

## 7. Out of scope

- Serial-set membership changes, `isolate:false`, weight-model rework — Phase 2.
- Any DB-parallelization mechanism — Phase 3 (spike first).
- Larger GitHub runners (cost decision, not needed per §3.1 projection).
- Other workflows (all already ≤5.7 min and parallel; `x-audits`, `Quality`, e2e workflows untouched).
- The `SUPABASE_START_ATTEMPTS` retry loop and the bootstrap's held-migration/GUC mechanics (`scripts/ci/supabase-local-bootstrap.sh`) — untouched.

## 8. Numeric self-consistency register

Single sources of truth for numbers repeated in this document: baseline avg 9.1 min (§1); leg overhead 95s and per-file serial overhead ~560ms (§3); pull 38s / start 32s / boot 71s (§3); vitest legs 325/383/399 sum 1107s (§3); projection ~4.9 uncached / 4.4–4.6 cached (§3.1); heavy-file table 8 rows ≥8,000ms (§3); cache keep threshold 15s (§5.2); skew tolerance 75s (§6); shard counts 3→6, fallback 8 (§5.1).
