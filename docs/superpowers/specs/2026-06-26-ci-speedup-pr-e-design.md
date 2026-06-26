# PR E — balance the unit-suite shards + cut the report-fixtures spawn cost

**Date:** 2026-06-26
**Scope:** CI / test-infra only. No DB schema, no advisory locks, no UI, no app code, no branch-protection edit, **no shared-bootstrap edit** (the `supabase start -x` lever is split to PR F).
**Branch:** `chore/ci-speedup-pr-e` (off `origin/main`).
**Predecessor:** PR D (#121) made `unit-suite` a 2-leg `vitest --shard=i/2` matrix behind a `unit-suite` aggregator. A measured audit (5 agents, durations across 6 runs) found two free wins this PR ships.

---

## 1. Problem (measured)

After PR D, `unit-suite` (~8.1–8.8m) is the **sole** merge-critical check (quality 1.9m, x-audits all <1m). Two measured inefficiencies in the critical path:

1. **The two shard legs are persistently imbalanced (~2 min).** vitest 4.1.5 `BaseSequencer.shard()` partitions purely by `sha1(repo-relative-path)` — file **count** is even (395/394) but **weight** is not: the two hot serial-DB files `tests/scripts/validation-report-fixtures.test.ts` (~76s) and `tests/cross-cutting/validation-check-seed-content-coverage.test.ts` (~41s) hash-sort adjacent (indices 241, 235) and **both land in shard 1**, making it ~117s heavier on every run. PR D's "balance was fine (78s)" was one lucky run; across 6 runs shard-1 is always the long leg, spread 105–186s. (Evidence: `node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js:35-45` hash-only shard; replicated hashing over 789 files.)
2. **`validation-report-fixtures.test.ts` (~76s) spawns 42–66 `npx tsx` children**, each paying npx's resolver cold-start (~0.25–0.5s vs the direct bin). This file is an unsplittable serial floor, so its cost dominates whichever leg holds it.

## 2. Goal

- **Balance the two legs** so the gate ≈ the balanced half (~8.1m → ~7.0m), with no extra runner and no behavior change.
- **Cut the report-fixtures spawn overhead** (~12–25s off the 76s floor file).
- Combined target: unit-suite **~8.1m → ~6.3m**, zero correctness/coverage risk.
- **Generalize the balancer to N legs** (so a future 3-leg ship needs no sequencer-code change).

Out of scope (PR F): `supabase start -x` boot trimming (shared bootstrap, 6 consumers, needs e2e `workflow_dispatch` verification). Out of scope (deferred): D11 `.next/cache`, the analytics-config Tier-2 boot trim, the 3rd shard leg itself.

## 3. Design

### 3.1 Lever C — weight-balanced shard sequencer

vitest 4.1.5 supports a custom `test.sequence.sequencer` (a **root-level** option — `ProjectConfig` omits `sequencer`, confirmed `reporters.d...d.ts:3591`). vitest constructs it **once** and calls `shard(Array.from(specs))` **once** with the **union** of specs across both projects, BEFORE `sort()`/`groupSpecs()` regroup by project (`cli-api.Cjt90eJu.js:3598-3605`). Crucially, `shard()` is called **only when `config.shard` is set** (`cli-api...js:3603 if (ctx.config.shard)`), so it is a no-op for local `pnpm test` and the x-audits' `vitest run <file>` — zero collateral.

**New files:**

- **`lib/test/vitest.weights.ts`** — single source of truth, importable by the meta-test:
  ```ts
  export const DEFAULT_WEIGHT = 1500; // ms, ~median light file
  export const FILE_WEIGHTS: Record<string, number> = {
    // ALL currently-known heavy serial-DB files (>~10s), not just the top 2 —
    // a heavy file left out gets DEFAULT_WEIGHT and can re-cluster (the meta-test
    // weight guard would NOT catch its real wall-clock cost; only the CI per-leg
    // timing does). Top 2 are measured (audit run 28261021871); the ~30s/~25s
    // are estimates — exact value matters less than relative ordering for LPT.
    "tests/scripts/validation-report-fixtures.test.ts": 76000, // measured
    "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 41000, // measured
    "tests/cross-cutting/no-global-cursor.test.ts": 30000, // estimated (repo-wide source scan)
    "tests/scripts/validation-check-seed.test.ts": 25000, // estimated
  };
  // keys repo-relative, forward-slashed; add the next-tier serial files (and
  // re-measure) when going to 3 legs, or if CI per-leg timing still skews.
  ```
  Weight source is **committed measured durations, NOT a file-size proxy** — size does not correlate with runtime (the 41s file is only 285 lines; the largest files by lines are DB-free fast parallel tests).

- **`vitest.sequencer.ts`** — exports a **pure** `lptShard(keys: string[], weightOf: (k) => number, count: number): string[][]` (LPT — longest-processing-time greedy bin-packing: sort keys by weight desc with a **lexical tie-break** for a total order; place each into the currently-lightest of `count` bins; return the `count` bins of keys) AND `WeightBalancedSequencer extends BaseSequencer` (from `vitest/node`) whose `shard(specs)` computes each spec's repo-relative forward-slashed key, calls `lptShard(keys, k => FILE_WEIGHTS[k] ?? DEFAULT_WEIGHT, count)`, and returns the specs whose key is in `bins[index-1]`. `index`/`count` come from `this.ctx.config.shard` (1-based; only ever set under `--shard`). `sort()` is **inherited unchanged** from BaseSequencer, so project grouping / `fileParallelism:false` / isolation are untouched. Splitting `lptShard` out as a pure function lets the balance meta-test exercise the real algorithm without a vitest `Vitest` ctx.

- **`vitest.config.ts`** — add `sequence: { sequencer: WeightBalancedSequencer }` to the **root** `test` config (not per-project).

**Correctness invariants (all structurally guaranteed + meta-tested):**
- **Clean cover:** LPT assigns each spec to exactly one bin; `∪ bins` = all specs, disjoint; returning `bins[index-1]` for `index ∈ 1..count` is a partition. No drop, no double-run.
- **Determinism across the two separate CI runners:** the only inputs are the spec set (identical — same commit, same globs) and the committed weight map (identical). The `moduleId` tie-break makes the sort a total order independent of filesystem/glob ordering. (vitest's own duration cache is local/uncommitted/per-runner → useless across runners, hence the committed map.)
- **Serial-DB guarantee preserved:** `shard()` only SELECTS which specs run on this leg; it does not change project membership or intra-leg ordering. The serial project still runs `fileParallelism:false` within the leg; each leg still boots its own Supabase (separate runners → no cross-shard DB race), exactly as PR D.
- **Hot-file split:** LPT places 76s → bin0, then 41s → bin1 (now the lighter bin) → the two hot files land on **different** legs.

**Unchanged for the 2-leg ship:** `unit-suite.yml` (still `--shard=${{ matrix.shard }}/2`) and `tests/cross-cutting/unit-suite-shard-topology.test.ts` (the CLI invocation is identical; only the partition algorithm changes). Every existing topology assertion still holds.

**3-leg generalization (future, no sequencer change):** flip the matrix to `[1,2,3]` + `--shard=i/3`, relax the topology test's `[1, 2]` regex, add the next ~6 serial-DB files to `FILE_WEIGHTS`, run the balance meta-test at N=3. The sequencer reads `count` from `config.shard`, so it already handles it.

### 3.2 Lever B — direct-bin tsx (no `npx` cold-start)

The report-fixtures harness spawns `npx tsx --tsconfig <abs> <abs-script> …` with a **custom temp `cwd`** (`makeSharedCwd()` — for `.env.local` + snapshot persistence). That cwd has no `node_modules`, so a **relative** `./node_modules/.bin/tsx` would not resolve (the PR-C temp-cwd trap). Fix: reference the repo's tsx bin by **absolute path** — `join(REPO_ROOT, "node_modules/.bin/tsx")` — which resolves regardless of spawn cwd. `tsx` is a direct devDependency (`^4.22.3`), so the bin exists.

**Edit sites** (all spawn `npx tsx …`; replace command `"npx"` + arg `"tsx"` with the absolute bin path as the command, args unchanged):
- `tests/scripts/_report-fixtures-helpers.ts:89` (the 42–66-spawn hot path — the bulk of the win)
- `tests/scripts/_cli-helpers.ts:46`
- `tests/scripts/validation-env.test.ts:48,147,179,211`
- `tests/scripts/extract-spec-codes-cli.test.ts:51`

A shared helper (e.g. `TSX_BIN = join(REPO_ROOT, "node_modules/.bin/tsx")` in `_report-fixtures-helpers.ts`, reused where these files already import from it) keeps it DRY. Behavior is identical (same tsx, same args) minus the npx resolution.

## 4. Structural guards (meta-tests)

- **New `tests/cross-cutting/vitest-shard-balance.test.ts`** — imports `WeightBalancedSequencer` (or the shared LPT function it delegates to) + `FILE_WEIGHTS`, reconstructs the full `.test.{ts,tsx}` file list by **mirroring `vitest-projects-partition.test.ts`'s `readdirSync` recursion** (no glob lib; derive — do **not** hardcode 789) minus `ENV_BOUND_EXCLUDES`, runs the same LPT, and asserts for **N=2** (and N=3): (a) **clean cover** — concat of all N bins equals the full set, no dupes/drops (set equality + length); (b) the two **measured** hot files land in **different** bins; (c) **no bin's total weight exceeds ~1.25× the mean** — note this guards *weight*-balance (a proxy); a NEW heavy file missing from `FILE_WEIGHTS` weighs `DEFAULT_WEIGHT` and passes this guard but skews real wall-clock — the **CI per-leg timing (§5) is the authoritative wall-clock check**; (d) every `FILE_WEIGHTS` key maps to an **existing** file (catches a renamed/deleted heavy test silently losing its weight); (e) `vitest.config.ts` string-matches `sequence:` wiring `WeightBalancedSequencer` (the sequencer can't be silently dropped). Build the bins by invoking the real LPT so the assertion is non-tautological. Note: to be importable by a node-env meta-test, the LPT bin-packing should live in a **pure exported function** (e.g. `lptShard(keys, weights, count)`) that the sequencer's `shard()` wraps — so the test exercises the real algorithm without constructing a vitest `Vitest` ctx.
- **Unaffected (must stay green):** `tests/cross-cutting/vitest-projects-partition.test.ts` (every file in exactly one project — the sequencer doesn't change project membership), `tests/cross-cutting/unit-suite-shard-topology.test.ts` (YAML unchanged), `tests/cross-cutting/ci-workflow-speedup.test.ts`.

## 5. Verification

- **Local:** the new balance meta-test green; `vitest-projects-partition` + topology + ci-workflow-speedup green; tsc + prettier + eslint green. Run the report-fixtures file locally (needs local Supabase) to confirm the direct-bin spawns still work from the temp cwd.
- **Real CI (authoritative) — measure then tune (PR-D empirical-gate pattern):** `FILE_WEIGHTS` is a *first cut* and two things make it approximate: (i) LPT can't perfectly balance because the 76s file alone exceeds the other three combined-then-split, so the best 2-way heavy-split is `{76}` vs `{41,30,25}≈96` (~20s residual *before* the light tail equalizes total weight); (ii) **lever B shrinks the report-fixtures file**, so its real post-B duration (~55–64s) drifts from the 76000 weight. On the PR run, record both `unit-suite-shard` leg wall-clocks. **Accept** if `max(leg1,leg2) < the pre-PR-E long pole` AND legs are within **~60s**. **If skew >60s:** re-estimate `FILE_WEIGHTS` from the measured per-leg/per-file timing (e.g. lower the report-fixtures weight to its post-B value, raise any under-weighted file) and re-run — still within this PR. The two legs being green is non-negotiable; perfect balance is best-effort.
- **Whole-diff Codex review** (inlined/no-tool mode) before merge.

## 6. Out of scope / sequencing

- **PR F:** `supabase start -x imgproxy,mailpit,studio,postgres-meta,edge-runtime` in the shared `scripts/ci/supabase-local-bootstrap.sh` (Tier-1, ~15–22s/boot). Separate because it touches 6 workflows and needs `workflow_dispatch` verification of crew-e2e / screenshots-drift / help-affordances (dev-gate-e2e is independently red — out of scope to fix here).
- **Deferred:** the 3rd shard leg (this PR makes it a config-only change later); the analytics-config Tier-2 boot trim; D11 `.next/cache`.
