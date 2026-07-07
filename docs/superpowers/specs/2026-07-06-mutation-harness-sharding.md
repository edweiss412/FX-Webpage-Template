# Mutation-Harness Sharded Parallelization + Progress Observability + Ledger HEAD Refresh

**Date:** 2026-07-06 · **Status:** draft → adversarial review · **Scope:** test-only + CI-infra (zero product-source change) · **Branch:** `feat/mutation-harness` (pre-merge repair + optimization of PR #338)

## 1. Context and motivating failure

The nightly/PR mutation-harness run 28834940241 (HEAD `8265fedc`) ran the full 101,795-mutant corpus to completion in ~167 min on `ubuntu-latest` and failed the bidirectional ledger reconciliation with **83 newAlarms**, all confined to fixture `2025-03-dci-rpas-central`, blocks B4/B9 (the `RPAS BREAKOUT 2 / LASALLE B` and `RPAS BREAKOUT 1 / LASALLE A` blocks), operators `ref-sub` (40), `blank-row:inject` (22), `unicode-inject` (20), `column-shift` (1).

**Root cause (verified, not hypothesized):** stale-baseline class, NOT platform divergence. A local single-fixture recompute at HEAD (macOS arm64; transient session script, results recorded here — the numbers below ARE the evidence of record) reproduced the CI alarm set **exactly** — 83 newAlarms, 0 staleRows, fixture slice 380 actual alarms vs 297 ledgered. Timeline: the 92-min ledger collection ran on a pre-rebase base; parser commits `7a5e9725` (dims-only BO-venue-header rooms, 12:35), `fe80f658` (show-prefixed BREAKOUT N headers, 13:24), `8fbdaf52` (BO-block termination, 13:41) landed on `origin/main` during the arc; the branch was later rebased on top; the R3 fingerprint re-baseline recomputed fingerprints only for **existing alarm sites**, so sites whose **verdict flipped** under the new BREAKOUT parsing were invisible locally. CI recomputed ground truth at HEAD and caught it — the harness worked as designed.

**Residual unknown:** the CI assertion short-circuited at `newAlarms` (`tests/parser/mutationHarness.test.ts:113`) before evaluating `staleRows` (`:114`), so a *fixed* hole in any other fixture is not yet ruled out. Only a full-corpus recompute settles it.

**Why this spec exists:** (a) the ledger must be regenerated from a full HEAD recompute; (b) a ~92-167 min serial recompute is why the stale-ledger class happened at all — nobody re-runs a 3-hour job after every rebase; (c) the run was a black box for 167 minutes (single vitest test, output only at the end; the user could not distinguish "slow" from "hung"). Sharding + progress logging fix (b) and (c) structurally; the regen fixes (a) using the sharded runner itself.

## 2. Design decision (user-ratified 2026-07-06)

**Approach B — shard test files + vitest's own worker pool.** Ratified over (A) manual `worker_threads` pool and (C) CI matrix jobs:

- Speedup identical to A (both bounded by cores; vitest already runs test files in parallel worker processes — default `pool: "forks"` in the installed vitest 4.1.5).
- A requires a TS-loader bootstrap inside raw workers (vite-node transform does not extend to hand-spawned threads) — the fragile class this repo already fought (tsx-subprocess / pinned-esbuild bundles, `reference_step3_modal_realbrowser_harnesses`). B gets worker spawning, TS loading, and error propagation from vitest for free.
- C speeds up only CI (local stays serial) and multiplies runner billing.
- B's shard-level isolation gives per-shard progress lines, per-shard failure attribution, and single-shard local reruns.

## 3. Architecture

### 3.1 Partition function (new: `tests/parser/mutation/shardPartition.ts`)

**Weighted, not hashed.** Hashing `(op, slug)` pairs balances pair *count*, not mutant *count* — and the weight distribution is heavy-tailed. Measured on the live corpus (2026-07-06, generation-only): djb2 % 8 → max shard 21,012 mutants = **1.65× mean**; djb2 % 16 is worse (2.79× mean). Since local wall-clock is bounded by the heaviest shard, the partition is instead a **deterministic LPT (longest-processing-time) assignment over runtime generation counts**:

```ts
export const SHARD_COUNT = 8;
export type ShardAssignment = ReadonlyMap<string, number>; // "<op>:<slug>" → shard index

/** Deterministic LPT: weigh every OPERATOR_NAMES × FIXTURES pair by its generated mutant
 *  count (streamed via boundedMutants — generation only, NO parse; measured 17.6 s for the
 *  full 153-pair corpus), sort by (weight desc, key asc), greedily assign each pair to the
 *  currently-least-loaded shard (tie → lowest index). Pure function of the committed
 *  fixtures + operators: every consumer that computes it in the same tree gets the
 *  identical map — no committed weight table to go stale. */
export function computeShardAssignment(): ShardAssignment;

/** Resolve a siteId's shard under a given assignment. siteIds are
 *  "<op>:<slug>:B..:L..:X.." where <op> itself may contain a colon ("blank-row:inject") —
 *  so op CANNOT be recovered by naive split(":"). Resolve the op by longest-prefix match
 *  over OPERATOR_NAMES (same discipline as findingFor,
 *  tests/parser/mutation/knownHoles.ts:48-51), then the slug is the next segment. Throws
 *  on an unresolvable siteId or a pair absent from the assignment (a NEW operator/fixture
 *  must be registered before its rows can land in the ledger). */
export function shardOfSiteId(siteId: string, assignment: ShardAssignment): number;
```

Measured result on the live corpus: shards of **12,721–12,729 mutants (max/mean 1.000)** vs 21,012 (1.65×) under hashing.

Properties (each pinned by a meta-test, §5):

- **Total:** every `(op, slug)` pair maps to exactly one shard in `[0, SHARD_COUNT)`; every well-formed siteId resolves under the assignment.
- **Consistent:** `shardOfSiteId(s, A)` for an alarm generated by pair `(op, slug)` equals `A.get("<op>:<slug>")` — alarms and ledger rows land in the same slice, so per-shard reconciliation unions to exactly the full reconciliation (slices are disjoint + jointly exhaustive).
- **Deterministic:** pure integer counts + lexicographic tie-breaks; no locale, no Intl, no float, no randomness. The SAME tree always yields the SAME assignment on every platform. When operators/fixtures change, the assignment shifts — that is safe because every consumer (all 8 shard files, the gates file, the regen collector) recomputes it identically at runtime; ledger rows carry no shard identity (sharding is pure routing).

Corpus shape: 17 fixtures (`tests/parser/mutation/fixtures.ts:6-27`: 7 xlsx + 10 raw) × 9 operator keys (`OPERATOR_NAMES`, `tests/parser/mutation/operators.ts`) = **153 pairs**. `SHARD_COUNT` is a one-line knob; LPT keeps balance near-perfect at any count.

Cost accounting: each of the 9 harness files (8 shards + gates) pays the ~18 s generation pass in its own worker before parsing — ≈ 2.6 min of extra CPU total, ~1 min of wall-clock across 3 CI workers, noise against the ~55 min parse makespan.

### 3.2 Shared shard runner (new: `tests/parser/mutation/runShard.ts`)

Extract the current `runAll()` loop (`tests/parser/mutationHarness.test.ts:30-73`) into:

```ts
export async function runShard(shardIndex: number): Promise<{
  alarms: Alarm[]; allSiteIds: string[]; cosmeticViolations: string[]; noOps: string[];
}>
```

Identical classification logic with three changes:

1. **Slice filter:** computes `const A = computeShardAssignment()` once, then the `(fixture, operator)` double loop skips pairs where `A.get(`${op}:${f.slug}`) !== shardIndex`. Baseline `capture(md, ...)` is computed once per fixture that has ≥1 pair in the shard (not per pair).
2. **Async with periodic yields (Codex spec-R1 #1):** a fully synchronous multi-minute `beforeAll` never yields, and vitest's console interception can defer flushes through a microtask — so sync `console.log` lines could all flush only when the shard finishes, defeating live progress. `runShard` is therefore `async` and yields the event loop every 5,000 parsed mutants via `await new Promise(r => setImmediate(r))`; each yield lets the interceptor flush the just-emitted progress line. The acceptance test for liveness is observational (AC-4): progress lines MUST appear incrementally in the Actions live log, not as an end-of-run block.
3. **Progress logging:** at each 5,000-mutant yield and at completion:
   `[mutation shard <i>/<SHARD_COUNT>] <n>/<sliceTotal> parsed, <m.m>m elapsed, ~<x>ms/parse` and
   `[mutation shard <i>/<SHARD_COUNT>] DONE <n> mutants <m.m>m — alarms=<a> cosmeticViolations=<c> noOps=<o>`.
   (`sliceTotal` is known up front from the assignment's generation counts.) On any future timeout the last line pinpoints where and how fast it was moving — the observability the 167-min black-box run lacked.

Alarm classification, `withSlug` siteId prefixing (`tests/parser/mutationHarness.test.ts:17-20`), cosmetic-bucket handling, and the per-(op,fixture) `boundedMutants` budget guard are byte-for-byte the same semantics. The per-shard global guard `++n > MUTANT_BUDGET` is kept per shard (a shard is a subset of the corpus, so `MUTANT_BUDGET` remains a valid ceiling); the **corpus-total** budget assertion moves to the gates file (§3.3), which already streams full-corpus generation counts without parsing.

**Optional collector (for §4 regen):** when `process.env.COLLECT_MUTATION_ALARMS` is set to a directory, `runShard` writes `alarms-shard<i>.json` (`{ alarms: Alarm[] }`) there after the loop. Test assertions still run. This replaces the ad-hoc `/tmp/refp.json` single-run collection.

### 3.3 File split

| File | Content | Corpus cost |
| --- | --- | --- |
| `tests/parser/mutationHarness.shard<0..7>.test.ts` (8 new files) | One `describe("mutation harness shard <i>/8 — ledger slice")` each: `beforeAll(async () => { R = await runShard(<i>) }, 3_600_000)`; slice versions of the 5 current corpus tests (`tests/parser/mutationHarness.test.ts:92-115`): budget (`allSiteIds.length ≤ MUTANT_BUDGET`; the `> 0` floor moves corpus-wide per §6), no byte-identical no-ops, siteId uniqueness within the shard, cosmetic invisibility, and bidirectional reconcile of `alarms` vs the ledger slice `KNOWN_SILENT_HOLES.filter(h => shardOfSiteId(h.siteId, A) === i)` (computing `A = computeShardAssignment()` in the test — identical by determinism to the one `runShard` used). Each file is generated from the same template with only the literal shard index differing; a meta-test (§5) pins file-count === `SHARD_COUNT` and index integrity. | ~1/8 corpus parse each + ~18 s generation |
| `tests/parser/mutationHarness.gates.test.ts` (renamed remainder) | The generation-only/structural describes currently at `tests/parser/mutationHarness.test.ts:118-273`: classifier parity (`:129-149`), coverage floor + COUNT-level audit agreement (`:151-205`), skippedInapplicable parity (`:221-241`), coverage legibility (`:243-273`). The coverage-legibility test already streams the FULL corpus generation (no parse) and computes `total` — add `expect(total).toBeLessThanOrEqual(MUTANT_BUDGET)` there as the corpus-total budget home. Additionally add a global siteId-uniqueness gate: cross-shard uniqueness follows from partition disjointness + per-shard uniqueness, but the gates file asserts full-corpus siteId uniqueness directly via a generation-only streaming pass (cheap, ~19 s, mirrors `:182-197`'s pattern). | generation only (seconds) |
| `tests/parser/mutationHarness.test.ts` | **Deleted** (contents relocated above). | — |

### 3.4 Vitest project wiring

Current state: the harness file is excluded from the `serial` project unless `VITEST_INCLUDE_MUTATION_HARNESS=1` (`vitest.projects.ts:41-48` `NIGHTLY_ONLY_EXCLUDES`; `vitest.config.ts` `nightlyExcludes` spread into the serial exclude at `:84`) — which means the nightly run executed it **inside the `fileParallelism: false` serial project**: that is precisely why CI ran the corpus serially.

New state:

- `NIGHTLY_ONLY_EXCLUDES` glob widens to `["**/tests/parser/mutationHarness.*.test.ts"]` and is applied to the serial project exclude **unconditionally** (no longer env-gated) — the harness files never run in `serial` under any env. (`tests/parser/**` is not in `PARALLEL_TEST_GLOBS`, `vitest.projects.ts:50-72`, so the parallel project never sees them either.)
- A **third project** is appended to the `projects` array in `vitest.config.ts` only when the env flag is set (conditional spread — avoids an empty-include project entirely):

```ts
...(process.env.VITEST_INCLUDE_MUTATION_HARNESS === "1"
  ? [{
      extends: true as const,
      test: {
        name: "mutation",
        include: ["tests/parser/mutationHarness.*.test.ts"],
        fileParallelism: true,
      },
    }]
  : []),
```

- Worker count (Codex spec-R1 #3, verified in the installed vitest 4.1.5): default pool is **forks** (child processes — `resolved.pool ??= "forks"`), and run-mode default `maxWorkers` is **`availableParallelism() − 1`** (`node_modules/vitest/dist/chunks/cli-api.Cjt90eJu.js:2343-2344`) → **3 workers on the 4-vCPU `ubuntu-latest` runner**, so 8 shards run in ~3 waves with dynamic file pickup. No override — local machines get `cores − 1` automatically.
- The partition meta-test `tests/cross-cutting/vitest-projects-partition.test.ts` (13 tests, 3 of them harness-gating from Task 12) is updated: harness files live in NO project by default; in the `mutation` project (and only there) when the flag is set; and the workflow-trigger assertions are UPDATED to pin the new run command and the widened `pull_request` path filter (§3.5).

### 3.5 Workflow update (`.github/workflows/mutation-harness.yml`)

- Run step becomes: `pnpm exec vitest run --project mutation` (env `VITEST_INCLUDE_MUTATION_HARNESS: "1"` unchanged). `--project mutation` makes the selection explicit and skips collecting the other projects.
- **Path filter widened (Codex spec-R1 #2):** the live `pull_request.paths` entry `tests/parser/mutationHarness.test.ts` (a single-file literal, `.github/workflows/mutation-harness.yml:23`) matches NONE of the new files — a future shard/gates-only PR would silently not trigger the workflow. It is replaced with the glob `tests/parser/mutationHarness.*.test.ts` (matches all 8 shard files + the gates file); `tests/parser/mutation/**` and the workflow-file path stay. The partition meta-test's trigger assertions pin the new path set.
- `timeout-minutes: 180` **unchanged** (user constraint: no blind raise). Expected wall-clock at 3 forks-pool workers and the measured ~98 ms/parse CI rate: makespan ≈ 101,795/3 × 98 ms ≈ 55 min of parse + ~1 min generation waves + setup ≈ **60-75 min**, still >2× headroom under 180.
- Comment block updated: "~92 min serial" figures → sharded figures; note the live per-shard progress lines.

## 4. Ledger HEAD refresh (the actual repair)

1. Land §3 (sharding) first — all shard/gates/meta tests green except the shard files owning the drifted RPAS `(op, slug)` slices (83 rows across 4 operators × 1 slug = up to 4 distinct pairs → up to 4 red shards; this failure is the TDD red state for the regen).
2. Full-corpus recompute at HEAD using the sharded runner: `COLLECT_MUTATION_ALARMS=<scratch> VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation` locally (~12-15 min on an 8+-core dev machine: heaviest shard 12,729 × ~54 ms/parse ≈ 11.5 min, all 8 shards concurrent at `cores − 1 ≥ 8` workers, plus the ~18 s generation waves).
3. Merge the 8 `alarms-shard<i>.json` files; regenerate `tests/parser/mutation/knownHoles.ts` via the regen script (updated to read the merged set; same sort, same pipe-delimited `RAW_HOLES` template-literal format, same `OPERATOR_FINDING_MAP` resolution — all operators in the new rows are already mapped, so no new findings/BACKLOG entries are required).
4. Expected delta: **+83 rows** (7,885 → 7,968), all in `2025-03-dci-rpas-central`, IF AND ONLY IF no other fixture drifted. The recompute is the authority: if other fixtures show new/stale rows (the staleRows direction CI never evaluated), they are included and reported in the PR body with their operator/fixture breakdown.
5. Re-run the mutation project locally with no collector — must be fully green (bidirectional, all 8 shards).
6. The ledger-count figures quoted in the harness spec/plan docs (`7885`) are updated to the post-refresh count in the same commit (numeric-sweep discipline).

**Class defense (why this doesn't recur):** the structural fix is the ~15-min local full recompute — cheap enough to re-run after every rebase that touches `lib/parser/**`. Add that as an explicit rule to the harness section of the plan close-out doc: *"if `git log <old-base>..<new-base> -- lib/parser` is non-empty after a rebase, re-run the mutation project locally before pushing."* The path-filtered `pull_request` trigger remains the CI backstop that caught this one.

## 5. Meta-test inventory (project rule: declared before tasks)

Extends/creates:

- **Creates** `tests/parser/mutation/shardPartition.test.ts` (merge-gating, FAST — no corpus generation): the LPT algorithm is factored so its core (`lptAssign(weights: {key,w}[], shardCount)`) is testable on synthetic inputs. Tests: (a) determinism — same synthetic weights (including ties in weight AND key ordering) → identical assignment across two calls; (b) totality — every input key assigned exactly once into `[0, shardCount)`; (c) balance — for a synthetic heavy-tailed weight set, `max load ≤ 4/3 × optimal-ish bound` (LPT's classical guarantee shape; assert max/mean below a generous literal); (d) `shardOfSiteId` op-resolution — two-colon operators (`blank-row:inject`) resolve by longest prefix, malformed siteIds throw, a pair missing from the assignment throws; (e) shard-file integrity — filesystem walk finds exactly `SHARD_COUNT` files matching `mutationHarness.shard<i>.test.ts` with indices `0..SHARD_COUNT-1`, each containing `runShard(<its own index>)` exactly once (anti-copy-paste-drift; static read, no execution).
- **Extends** `tests/parser/mutationHarness.gates.test.ts` (nightly, corpus-scale generation only): (f) assignment covers all 153 live `OPERATOR_NAMES × FIXTURES` pairs; (g) disjoint-exhaustive over the ledger — the sum of per-shard ledger-slice sizes equals `KNOWN_SILENT_HOLES.length` and every committed row's `shardOfSiteId` resolves; (h) the measured shard-load spread stays sane (`max/mean < 1.2` — LPT measured 1.000; a regression here means the weight source broke).
- **Extends** `tests/cross-cutting/vitest-projects-partition.test.ts`: harness glob excluded from serial unconditionally; `mutation` project present iff env flag; workflow still runs `--project mutation`.
- **Not extended:** `tests/auth/_metaInfraContract.test.ts`, advisory-lock, email-canonicalization registries — no Supabase call, no lock, no email surface is touched (test-only parser harness). Declared N/A explicitly per the writing-plans rule.

## 6. Guard conditions / edge cases

- `shardOfSiteId` on a malformed siteId (no operator prefix match) or a pair absent from the assignment: **throws** — same fail-loud posture as `findingFor` (`tests/parser/mutation/knownHoles.ts:48-51`). A ledger row that can't be sharded is corrupt data, not a skippable row.
- `SHARD_COUNT` change: shard-file integrity test (e) forces the file set to match; LPT rebalances automatically (no literals to maintain); ledger content is unaffected (rows carry no shard identity — sharding is pure routing).
- Operator/fixture set change: the assignment shifts. Safe by construction — every consumer recomputes the identical assignment at runtime from the same tree; nothing shard-related is committed. (Contrast: a committed weight table would be a second stale-baseline vector — rejected for exactly the class this spec repairs.)
- Empty shard slice (impossible under LPT while pairs ≥ SHARD_COUNT, but defensive): `runShard` returns empty arrays; the per-shard "corpus size" assertion is `allSiteIds.length >= 0` with the meaningful `> 0` floor asserted corpus-wide in the gates file. The DONE progress line is emitted even for an empty slice, so "no output from shard i" stays unambiguous.
- Collector env set but directory missing: `mkdir -p` equivalent (`mkdirSync(..., { recursive: true })`) — a regen run must not fail on a fresh scratch dir.
- Progress logging cadence at 5,000: a shard slice is ~12,700 mutants → 2-3 lines per shard; DONE line always emitted (even for tiny slices) so "no output from shard i" is unambiguous.

## 7. Acceptance criteria

- **AC-1:** `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation` runs 8 shard files + 1 gates file in the `mutation` project with `fileParallelism: true`, and NOTHING from the harness runs in `serial`/`parallel` projects under any env.
- **AC-2:** Default `pnpm test` (no env flag) discovers zero harness files (parity with today's behavior; pinned by the partition meta-test).
- **AC-3:** Union of per-shard reconciliations ≡ full reconciliation — pinned by partition meta-tests (a)-(c), not by re-running the corpus twice.
- **AC-4:** Live progress: every shard emits `[mutation shard i/8]` lines at ≤5,000-mutant intervals plus a DONE summary, and they appear **incrementally** in the Actions live log during the run (verified by observing the in-progress run, not just the final log) — not as an end-of-run block. `runShard`'s `setImmediate` yields are the mechanism.
- **AC-5:** Ledger refreshed from a full HEAD recompute; the previously-failing CI reconciliation (83 RPAS newAlarms) is green locally across all 8 shards; any additional drift found by the full recompute is included + reported.
- **AC-6:** Workflow `timeout-minutes` stays 180; the real-Actions run on the PR branch (path-filtered `pull_request` trigger, path set widened per §3.5) completes green in materially less wall-clock than the 167-min serial run (expected 60-75 min at 3 workers; no hard AC threshold — the AC is green-within-existing-timeout).
- **AC-7:** Zero product-source change: diff touches only `tests/**`, `vitest.config.ts`, `vitest.projects.ts`, `.github/workflows/mutation-harness.yml`, and docs. The regen script stays a local scratchpad tool (NOT committed under `scripts/`); the committed artifacts are the ledger + tests only.
- **AC-8:** Full merge-gating suite (`pnpm test`), typecheck, eslint, `pnpm format:check` all green before push (per feedback ledger: full-suite-before-push, typecheck-before-push, eslint-before-push, format-check-before-push).

## 8. Explicitly out of scope

- Parser fixes for any of the 83 new holes (they are ledgered reality; fixing them shrinks the ledger later — the ratchet's job).
- Changing operators, oracle, verdict semantics, fingerprint redaction, or `MUTANT_BUDGET` (150,000).
- CI matrix sharding, `workflow_dispatch` semantics, nightly cron schedule, or making the harness merge-gating.
- Any `lib/**` or `app/**` change.

## 9. Self-review checklist notes (project spec-review additions)

- **Numeric sweep:** 101,795 mutants · 153 pairs (17 fixtures × 9 operator keys) · 8 shards · LPT loads 12,721–12,729 (max/mean 1.000; djb2 hash rejected at 1.65×/8 and 2.79×/16) · generation pass 17.6 s · budget 150,000 · ledger 7,885 → expected 7,968 (+83) pending full recompute · serial CI measured 167 min (~98 ms/parse) · sharded CI expected 60-75 min at 3 forks workers (`availableParallelism − 1` on 4 vCPU) · hookTimeout per shard 3,600,000 ms (60 min) · progress cadence 5,000 · CI-observed drift: ref-sub 40 / blank-row:inject 22 / unicode-inject 20 / column-shift 1 = 83. All figures single-sourced here; the plan references this section.
- **Live-code citations verified this session:** `runAll` loop `tests/parser/mutationHarness.test.ts:30-73`; `withSlug` `:17-20`; corpus describes `:86-116`; gates describes `:118-273`; `NIGHTLY_ONLY_EXCLUDES` `vitest.projects.ts:48`; serial exclude spread + `fileParallelism` `vitest.config.ts:84,92`; `FIXTURES` `tests/parser/mutation/fixtures.ts:6-27`; `findingFor` longest-prefix precedent `tests/parser/mutation/knownHoles.ts:48-51`; reconcile assertions `tests/parser/mutationHarness.test.ts:111-115`; workflow single-file path literal `.github/workflows/mutation-harness.yml:23`; vitest forks/maxWorkers defaults `node_modules/vitest/dist/chunks/cli-api.Cjt90eJu.js:2343-2344` + `coverage.DM_a_rWm.js:180`.
- **Flag lifecycle:** `VITEST_INCLUDE_MUTATION_HARNESS` — storage: env only; write: workflow env + local regen invocations; read: `vitest.config.ts` conditional project spread (was: serial-exclude gate); effect: mutation project exists/absent. No zombie state. `COLLECT_MUTATION_ALARMS` — env only; read in `runShard`; effect: JSON dump side-channel; unset in CI (workflow does not set it).
- **Tier×domain / CHECK-enum matrices:** N/A — no DB surface.
- **Transition inventory / dimensional invariants:** N/A — no UI surface.
