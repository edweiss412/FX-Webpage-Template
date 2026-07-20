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
| Docker image cache is a **conditional** lever: kept only per the §6 decision procedure. A revert of that lever inside this PR is in-spec, not a scope cut | this spec §5.2/§6 |
| `DEFAULT_WEIGHT` stays 1500; only heavy-file entries refresh (§5.3). Wall-model reweighting (per-file overhead constant) is deferred to Phase 2 where the serial set changes anyway | this spec §5.3 |
| Serial-project `fileParallelism: false` guarantee within a leg is untouched (invariant since PR B/D) | `vitest.config.ts:83`, `2026-06-26-ci-unit-suite-matrix-shard-design.md` §3.4 |
| Per-file fork/transform overhead (~560ms/serial file, §3) is Phase 2/3 material (isolation strategy), NOT addressed here | in-session design approval |
| The three env-bound excludes stay excluded via `VITEST_EXCLUDE_ENV_BOUND=1` (each gated elsewhere; `unit-suite.yml` header documents all three) | `unit-suite.yml:24-40` |
| The balance meta-test's file-set model gains the nightly-excludes subtraction (§5.4 item 3) — an in-scope correctness fix to a test this PR already edits, not scope creep | R1 finding 5 |

## 2. Program overview (phases 2–3 are commitments, not designs)

1. **Phase 1 (this PR):** shard matrix 3→6, conditional Supabase-image docker cache, `FILE_WEIGHTS` refresh from measured CI timings, meta-test updates. Expected ≈4.3–4.9 min.
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
- Full suite: 1,309 files completed in that run; the on-disk sequencer-visible set is 1,447 (completed + runtime-skipped — the two counts measure different things and both appear in this spec). File counts are derived dynamically by the meta-tests, never hardcoded.

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

1. `.github/workflows/unit-suite.yml` — matrix `[1..6]`, `--shard=i/6`, image-cache steps (§5.2), AND every prose/label reference to the 3-leg topology: header comment lines 12 ("3-leg"), 14 (`--shard=i/3`), 17 ("three legs"), step name line 74 (`shard ${{ matrix.shard }}/3`), step comment line 75 ("across the three legs"), run line 80 (`--shard=${{ matrix.shard }}/3`), matrix line 56.
2. `lib/test/vitest.weights.ts` — `FILE_WEIGHTS` refresh (§5.3) + header-comment threshold alignment (the current `>~10s` note at `vitest.weights.ts:3` becomes `≥8s` to match §3's threshold).
3. `tests/cross-cutting/unit-suite-shard-topology.test.ts` — matrix + denominator updates (test titles and regexes at lines 22, 24, 29, 33, 38, 39) and new cache-step pins (§5.4).
4. `tests/cross-cutting/vitest-shard-balance.test.ts` — N loops `[2, 3]` → `[2, 3, 6]` (`vitest-shard-balance.test.ts:64,88`); file-set model fix (§5.4 item 3); measured-heavy-set assertion (§5.4 item 2).
5. `vitest.sequencer.ts:12` comment "the two separate CI runners" — stale since the 3rd leg; update to leg-count-neutral wording ("the N separate CI runners") so it can never drift again.
6. No source-code behavior changes. No UI (invariant 8 N/A). No DB/migrations (validation-parity N/A). No `pg_advisory*` (lock topology N/A).

Historical documents (predecessor specs, `DEFERRED-archive.md`) are records, not live pins — deliberately untouched.

## 5. Design

### 5.1 Shard count 3 → 6

- `matrix: shard: [1, 2, 3, 4, 5, 6]` and `--shard=${{ matrix.shard }}/6` in `unit-suite.yml:56,80`. The `WeightBalancedSequencer` already reads `count` from `config.shard` (`vitest.sequencer.ts:57`, generalized N per PR E §3.1) — **no sequencer code change** (comment wording only, §4.5).
- Aggregator (`unit-suite` required context, `unit-suite.yml:82-100`) unchanged: `needs.unit-suite-shard.result` rolls up any matrix size. Branch protection untouched.
- Serial-DB guarantee: unchanged — each leg boots its own Supabase on its own runner; `--shard` selects files, never changes project membership or intra-leg order (PR E §3.1 "Serial-DB guarantee preserved").
- Runner-minutes cost: ~6×5 = 30 min/run vs current ~3×8 = 24. Accepted (in-session).
- **Fallback (predeclared, in-PR):** if §6's gate misses at 6, bump to 8 (`[1..8]`, `/8`, topology-test literals, balance-test N) in the same PR. 8 is the cap for this phase; beyond that is Phase 2's problem.

### 5.2 Conditional lever — Supabase docker-image cache

Pull is ~38s of the 71s boot. Mechanism (three new steps around the boot step):

1. **Restore** (`actions/cache@v4`, before boot, **`id: supabase-image-cache`** — the id the guards below reference; the topology meta-test pins it): `path: ~/supabase-images.tar.zst`, `key: supabase-images-${{ runner.os }}-2.107.0-${{ hashFiles('supabase/config.toml', 'scripts/ci/supabase-local-bootstrap.sh') }}`. Key inputs and why each is there: `runner.os` (arch/OS); the CLI version **literal** duplicated from the `supabase/setup-cli` pin at `unit-suite.yml:66` (image tags derive from CLI version; topology meta-test pins the two literals equal, §5.4); `hashFiles` over `supabase/config.toml` (covers `db.major_version` — `supabase/config.toml:36` — and service enablement, which select images independently of CLI version) and over the bootstrap script (covers the `-x` exclude list at `supabase-local-bootstrap.sh:87`, which determines which images are needed at all). GitHub caches are immutable per key, so every input that can change the required image set must be in the key — a stale entry cannot heal in place.
2. **Load** (plain step, cache-hit only via `if: steps.supabase-image-cache.outputs.cache-hit == 'true'`): `zstd -d --stdout ~/supabase-images.tar.zst | docker load || true`. The `|| true` makes a corrupt/failed load degrade to today's behavior (`supabase start` pulls whatever is missing) instead of failing a required check.
3. **Save-prep** (after the vitest step, miss-only via `if: steps.supabase-image-cache.outputs.cache-hit != 'true'`), a single command so ONE trailing `|| true` soft-fails the whole thing — including the zstd guarded-install (zstd ships on current ubuntu-latest but the image rolls weekly; if the runner image someday drops zstd the LOAD side would fail too, which its own `|| true` degrades to a plain pull):

   ```
   set -o pipefail
   { (command -v zstd || sudo apt-get install -y zstd) \
     && docker save $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'supabase|kong|postgrest') \
        | zstd -T0 -o ~/supabase-images.img.tmp \
     && mv ~/supabase-images.img.tmp ~/supabase-images.tar.zst; } || true
   ```

   Any failure (apt, enumeration, disk, docker save, zstd) costs only the cache entry, never the leg. Two shapes are load-bearing:

   - **`set -o pipefail`** — GitHub's default `run:` shell is `bash -e {0}` WITHOUT pipefail, so without it the `docker save | zstd` pipeline's status is zstd's alone: a mid-stream `docker save` death (or an empty `grep` making `docker save` error after zstd already opened its output) would let `mv` publish a truncated archive. With pipefail, any upstream failure fails the pipeline and skips the `mv`.
   - **tmp-then-`mv`** — a save that dies mid-stream must not leave a partial file at the cache path, because the `actions/cache` post-step uploads whatever exists there under an immutable key — a poisoned entry would then hit forever, soft-fail every load, and never regenerate (save-prep is miss-only). With tmp-then-`mv`, a failed save leaves nothing at the cache path, the post-step uploads nothing, and the next run retries the save.

- The bootstrap script itself is **unchanged**; `supabase start` skips pulling images already present, and the `SUPABASE_START_ATTEMPTS` retry loop is unaffected.
- **Soft-failure inventory (exhaustive):** exactly two `|| true` sites — the load command (step 2) and the single trailing `|| true` on the save-prep compound command (step 3). The boot step and the vitest step carry none. The topology meta-test enforces this inventory (§5.4), alongside the existing no-`continue-on-error` guard (`unit-suite-shard-topology.test.ts:53-58`).
- **Cache-save timing caveat:** a cache entry is uploaded only when the job completes; the first fully-green run with these steps creates the entry, and the next run on the same PR restores it (GitHub scopes PR caches to the PR's merge ref with fallback to base). So the cache-hit measurement run is "the first run after a green run," not unconditionally "run 2."
- The keep-or-revert decision and its measurement definition live in §6 (single source of truth — no threshold is restated here).

### 5.3 `FILE_WEIGHTS` refresh

Replace the 4-entry map (`lib/test/vitest.weights.ts:9-14`) with the 8 measured entries from §3 (values = measured ms, rounded to the nearest 1,000). Comment each row `// measured 2026-07-20 run 29710814674`. `DEFAULT_WEIGHT` stays `1500` (§1.1). Update the file's header comment so the entry threshold reads ≥8s (§4.2).

**TDD anchor (this is the failing-test-first hook for the refresh):** the balance meta-test gains a `MEASURED_HEAVY` literal — a `Record<path, weight>` of all 8 §3 rows with their rounded values — and asserts `FILE_WEIGHTS[path] === weight` for every entry (exact values, not mere key presence — key presence alone would pass with arbitrary weights and stale rows retained). This fails against the committed 4-entry map and passes only with the full §3 refresh. Trade-off accepted deliberately: future re-measurements must update the test literal and the map together — that is the structural-pin philosophy, and the pair lives one grep apart. Without this anchor, no existing guard notices the refresh at all: with the stale map, N=6 LPT already balances to ~1.0015× mean, far inside the 1.25× guard (verified this session by running greedy LPT over the live 1,447-file list with the stale 4-entry map; same figure at N=8), so `[2, 3, 6]` alone is not a failing test.

Balance floor check at N=6 and N=8: heaviest single file 54s ≪ per-bin mean (~2,300k ms total weight / 6 ≈ 390k), so LPT balance is not floor-limited at either count.

### 5.4 Meta-test updates (inventory — mandatory declaration)

This phase **extends** two existing structural meta-tests; it creates none:

1. `tests/cross-cutting/unit-suite-shard-topology.test.ts` —
   - matrix literal `[1, 2, 3]` → `[1, 2, 3, 4, 5, 6]` and denominator `3` → `6` (titles + regexes, §4.3);
   - NEW pin: the cache-restore step declares `id: supabase-image-cache` (the exact id the load/save guards reference — an id/guard mismatch silently disables both), and its `key` expression contains BOTH the same CLI version literal as the `supabase/setup-cli` step (extract both via regex, assert equal — drift = stale images silently reused across CLI bumps) AND `hashFiles('supabase/config.toml', 'scripts/ci/supabase-local-bootstrap.sh')`;
   - NEW pin: step ordering — restore before load, load (with its `cache-hit == 'true'` guard) before the boot step, save-prep (with its `cache-hit != 'true'` guard) after the vitest step;
   - NEW pin: soft-failure inventory — `|| true` appears exactly twice in the workflow: on the `docker load` line, and as the single trailing `|| true` after the save-prep compound command's closing brace (i.e., after the `mv`, covering install+save+mv as one unit); the save-prep body also contains `set -o pipefail` (without it a mid-stream `docker save` failure publishes a truncated archive, §5.2.3); the boot and vitest `run:` blocks contain no `|| true` (closes the gap where the existing no-`continue-on-error` guard would accept `bootstrap || true`);
   - if the cache lever is reverted per §6, these cache pins are dropped in the same commit (the test never asserts steps that don't exist; the `[1..6]`/`/6` and soft-failure-count-zero forms remain).
2. `tests/cross-cutting/vitest-shard-balance.test.ts` — N loops `[2, 3]` → `[2, 3, 6]` (`:64`, `:88`); NEW `MEASURED_HEAVY ⊆ FILE_WEIGHTS` assertion (§5.3).
3. `tests/cross-cutting/vitest-shard-balance.test.ts` file-set model fix (R1 finding 5): the derivation at `vitest-shard-balance.test.ts:28-34` subtracts only `ENV_BOUND_EXCLUDES`, but the serial project ALSO unconditionally excludes `NIGHTLY_ONLY_EXCLUDES` (`vitest.config.ts:77-82`, `vitest.projects.ts:48` — the 9 `tests/parser/mutationHarness.*.test.ts` files), so the test models 9 files the unit-suite sequencer never sees. Fix: subtract `NIGHTLY_ONLY_EXCLUDES` the same way `ENV_BOUND_EXCLUDES` is subtracted. Exhaustive sweep of other set-model gaps (R1 class-sweep): the mutation project is env-gated out of unit-suite discovery (`vitest.config.ts:98`), and the parallel project is include-only — no other unconditional excludes exist in `vitest.config.ts`/`vitest.projects.ts`.
4. Unaffected and must stay green: `tests/cross-cutting/vitest-projects-partition.test.ts` (project membership untouched), `tests/cross-cutting/ci-workflow-speedup.test.ts` (`ci-workflow-speedup.test.ts:34` pins `unit-suite.yml` in `PR_FIRING_WORKFLOWS` — still true).

## 6. Accept gate (real CI, authoritative — PR-D empirical-gate pattern)

Definitions used below:

- **Leg wall clock** = the GitHub job duration (startedAt→completedAt) of a `unit-suite-shard` leg, excluding queue time.
- **Boot path** = the summed durations of the cache-restore step + load step + boot step on a leg (comparable to the 71s baseline boot step, which had no restore/load).
- **Leg median** = median across all legs of the current matrix on one run (6 legs, or 8 after the fallback — every criterion below is written against "the current matrix," so the fallback re-runs them unchanged).

Ordered decision procedure:

1. **Cache decision (first):** on the first cache-hit run (= first run after a green run, §5.2), compute the leg-median boot path. **Keep** the lever iff it is ≤56s (i.e., ≥15s better than the 71s baseline). Otherwise revert the three cache steps (and their meta-test pins) in the same PR. Record the measurement and decision in the PR body either way.
2. **Wall-clock criterion (on the final configuration):** max leg wall clock < 5 min, measured on a run of the surviving configuration — a cache-hit run if kept, a plain run if reverted. All matrix legs and the aggregator green.
3. **Balance criterion:** max−min **vitest-step** duration across the matrix legs ≤ 75s. (Vitest-step, not job: bootstrap/cache variance is not a file-balance signal.) If exceeded: re-estimate the outlier file's weight from that run's own per-file log and re-push — still within this PR.
4. **Fallback:** if criterion 2 misses at 6 legs, execute the predeclared 8-leg bump (§5.1) and re-run steps 2–3. If it still misses at 8: merge the configuration with the lower measured max leg wall clock (6 vs 8, each from its step-2 measurement run) **provided** that value beats the 3-leg baseline's 8-minute max leg — which every projection clears by minutes — and record the residual gap as Phase 2's opening number. The 5-min target then rides on Phase 2, which was always the plan for the serial-overhead half of the wall. No repeated-measurement protocol: one qualifying run per configuration decides; a run failed by unrelated flake (e.g. a docker-pull retry) is re-run, not counted.

Local `pnpm test` / x-audits `vitest run <file>` behavior: unchanged — the sequencer's `shard()` only runs under `--shard` (`vitest.sequencer.ts` / PR E §3.1), and no vitest project or exclude changes ship in this phase.

## 7. Out of scope

- Serial-set membership changes, `isolate:false`, weight-model rework — Phase 2.
- Any DB-parallelization mechanism — Phase 3 (spike first).
- Larger GitHub runners (cost decision, not needed per §3.1 projection).
- Other workflows (all already ≤5.7 min and parallel; `x-audits`, `Quality`, e2e workflows untouched).
- The `SUPABASE_START_ATTEMPTS` retry loop and the bootstrap's held-migration/GUC mechanics (`scripts/ci/supabase-local-bootstrap.sh`) — untouched.

## 8. Numeric self-consistency register

Single sources of truth for numbers repeated in this document: baseline avg 9.1 min (§1); leg overhead 95s and per-file serial overhead ~560ms (§3); pull 38s / start 32s / boot 71s (§3); vitest legs 325/383/399 sum 1107s (§3); heavy-file table 8 rows, threshold ≥8,000ms (§3); projection ~4.9 uncached / 4.4–4.6 cached (§3.1); cache keep rule median boot path ≤56s = 71−15 (§6.1, sole statement of the threshold); balance skew ≤75s on vitest-step durations (§6.3); shard counts 3→6, fallback 8 (§5.1); soft-failure count exactly 2 (§5.2/§5.4); nightly-excluded mutation files 9 (§5.4.3).
