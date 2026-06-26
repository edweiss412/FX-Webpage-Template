# PR D — Matrix-shard `unit-suite` to break the ~11m CI floor

**Date:** 2026-06-26
**Scope:** CI infrastructure only. No DB schema, no advisory locks, no UI, no application code, no branch-protection edit.
**Branch:** `chore/ci-speedup-unit-suite-shard` (off `origin/main`; rebased onto post-PR-C `main` before merge).
**Predecessors:** PR A (#107, concurrency/paths/psql/playwright-cache), PR B (#111, vitest two-project split), PR C (#116, `cancel-in-progress` made PR-only). This is the fourth and final tier of the CI-speedup arc.

---

## 1. Problem

`unit-suite` is a **REQUIRED** status check (one of main's 12). After PR B's two-project split it runs in **~11m17s** ≈ **94s Supabase boot + ~560s vitest + ~23s setup**. The ~560s vitest is dominated by the **serial DB project** (`fileParallelism: false`), whose hot files are end-to-end probes against local Supabase that spawn `npx tsx` child processes per case:

| file | approx | DB? | why slow |
|------|-------:|-----|----------|
| `tests/scripts/validation-report-fixtures.test.ts` | ~76s | yes | 42 tests, each spawns ≥1 `npx tsx` (2–4s cold-start) + psql against local Supabase |
| `tests/cross-cutting/validation-check-seed-content-coverage.test.ts` | ~41s | yes | seed-content introspection |
| `tests/cross-cutting/no-global-cursor.test.ts` | ~30s | mixed | repo-wide source scan |
| `tests/scripts/validation-check-seed.test.ts` | ~25s | yes | seed introspection |

These files are **genuinely DB-bound** (they reach Supabase via imported `runPsql`/`mintCombo` helpers — an inline grep misses it) and **mutate shared DB state** (mint + cleanup synthetic-tag rows), so they cannot move into the DB-free parallel project. The serial phase is the structural floor.

## 2. Goal & success criteria

- **Whole-gate wall-clock** (the time before the required `unit-suite` check reports) drops from ~11.3m to **< 9 minutes**, target ~6.5m.
- **Zero coverage loss:** every test file that runs today still runs, exactly once, across the shards combined.
- **No new race:** the serial-DB and fixture-corpus invariants that justify `fileParallelism: false` still hold.
- **No branch-protection change** and **no new required context** — `unit-suite` remains the single required check.
- **No flake risk to the gate:** a structural meta-test pins the sharding topology so a later edit cannot silently break coverage or the aggregator.

## 3. Design

### 3.1 Workflow restructure (`.github/workflows/unit-suite.yml`)

Two jobs replace the single `unit-suite` job:

**`unit-suite-shard`** — the worker, a 2-leg matrix:

```yaml
jobs:
  unit-suite-shard:
    name: unit-suite-shard
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      # ... identical setup to today: checkout, pnpm 10.33.2, node 20 (pnpm cache),
      #     pnpm install --frozen-lockfile, supabase/setup-cli@v1 (2.107.0),
      #     guarded psql install, bash scripts/ci/supabase-local-bootstrap.sh ...
      - name: Run vitest shard ${{ matrix.shard }}/2
        env:
          VITEST_EXCLUDE_ENV_BOUND: "1"
        run: pnpm exec vitest run --shard=${{ matrix.shard }}/2
```

- `fail-fast: false` so one shard's failure does not cancel the other (both verdicts surface in one run).
- Each leg boots its **own isolated** local Supabase on its own runner.
- `--shard=${{ matrix.shard }}/2` is the **only** new vitest flag; `VITEST_EXCLUDE_ENV_BOUND=1` and `pnpm exec vitest run` are unchanged from today.

**`unit-suite`** — the aggregator, preserves the required check-context name:

```yaml
  unit-suite:
    name: unit-suite
    needs: [unit-suite-shard]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Require all shards to have succeeded
        run: |
          result='${{ needs.unit-suite-shard.result }}'
          echo "matrix rollup result: $result"
          test "$result" = "success"
```

For a matrix dependency, `needs.unit-suite-shard.result` is a single rollup that is `success` **only if every leg succeeded** (else `failure`/`cancelled`/`skipped`). This is the GitHub-documented "single additional required job" pattern for matrix checks ([community/discussions/26822](https://github.com/orgs/community/discussions/26822)). `if: always()` forces the aggregator to run even when a shard fails, so the `unit-suite` context reports an explicit **failure** (not a never-reported "skipped" that would block merge ambiguously). `test "$result" = "success"` exits non-zero on anything but success.

**Critical guard — no `continue-on-error` on the shard legs.** A matrix leg with `continue-on-error: true` has its failure **masked as `success`** in the `needs.*.result` rollup ([community/discussions/45546](https://github.com/orgs/community/discussions/45546)), which would let a red shard green the required `unit-suite` aggregator — a silent coverage hole. The shard job MUST NOT set `continue-on-error: true`; the topology meta-test (§4) asserts its absence. (`fail-fast: false` is unrelated and safe — it only prevents a failing leg from cancelling its sibling; it does **not** mask the failure.)

### 3.2 Why this keeps `unit-suite` as the required check (the key safety property)

A GitHub job's check-context name is its `name:`. Today `jobs.unit-suite` → context **`unit-suite`** (required on main). After the restructure, the **aggregator** job is named `unit-suite`, so it still produces the **`unit-suite`** context. The matrix legs produce `unit-suite-shard (1)` / `unit-suite-shard (2)`, which are **not** required. Therefore:

- **No branch-protection edit.** Required list stays at 12 contexts; `unit-suite` is satisfied by the aggregator.
- **No "expected-but-missing" trap.** Renaming a required job would orphan the old context and block *all* PRs (memory: `feedback_ci_pin_and_branch_protection`). We do **not** rename the required context — we re-point it at an aggregator that is green iff both shards are green.
- **No merge-coverage gap.** A PR can only satisfy `unit-suite` when the aggregator passes, which requires both shards to pass. Auto-merge and branch protection gate on exactly that.

This is strictly safer than the naive "two required matrix-leg contexts" (which *would* need a branch-protection edit and would expose the rename trap).

### 3.3 Balancing — `--shard=i/2`, count-based, with an empirical gate

`vitest --shard=i/N` partitions test **files** by count (verified empirically: a `--project=parallel` run split 301 files into 151 + 150 with **zero overlap**; the union is the full set). It is **zero-maintenance** — new files auto-distribute — and is the primary mechanism.

Its known limitation: it balances by **file count, not duration** (the same parallel run showed 1610 vs 1344 *tests* across the two even-file shards). The risk is that the few heavy serial DB files co-locate on one shard.

**Empirical balance gate (implementation-time, mandatory).** After the workflow is wired, measure the real per-shard wall-clock on CI (via `workflow_dispatch`). Acceptance:

- **PASS** if `max(shard1, shard2) < 9m` **and** `< the pre-split unit-suite time`. Ship as-is.
- **FALLBACK** if one leg is heavier than the other by **> 2 minutes** *or* the max exceeds 9m: replace `--shard` with a **curated per-shard include**. Each leg reads a `matrix.shard`-keyed env var (e.g. `VITEST_SHARD_INCLUDE`) selecting a fixed glob bucket; the two buckets are balanced so the two hottest files (`validation-report-fixtures`, `validation-check-seed-content-coverage`) land in **different** buckets, and a meta-test asserts the buckets are a partition of `BASE_INCLUDE` (every file in exactly one bucket — no drop, no double-run). This is a documented contingency, not a coin-flip — the primary path is plain `--shard`.

### 3.4 Correctness — no new race, no coverage loss

- **Serial-DB guarantee holds *within* each shard.** `--shard` only subsets the file list; the two-project structure is unchanged, so the serial project still runs `fileParallelism: false` within each leg. Two serial-DB files that mutate shared state never run concurrently *within* a leg.
- **No cross-shard DB race.** Each leg is a separate runner with its **own** booted Supabase. A serial file on shard 1 and another on shard 2 touch **different** databases — there is no shared mutable DB across shards.
- **No cross-shard filesystem race.** The `fixtures/shows/raw` corpus writer (`tests/sync/dev-routing`) and its readers (`tests/parser/*`, `tests/help/fixture-range-parser`) run on separate runners with separate checkouts; across shards there is no shared FS. *Within* a shard the parallel-phase-before-serial-phase ordering is preserved, so the reader (parallel) never overlaps the writer (serial).
- **No coverage loss.** `--shard` is a partition: every file lands in exactly one shard, union = the full set (empirically verified 151+150=301 with empty intersection). The env-bound excludes (`VITEST_EXCLUDE_ENV_BOUND=1`) apply identically in both legs, so the same three files are skipped as today — and they remain gated elsewhere (x5 etc.).

### 3.5 Boot cost

Accepted: 2× Supabase boot (~94s each), but the legs run **concurrently**, so boot is paid in parallel, not in series. The net is a large wall-clock win despite the duplicated CPU.

## 4. Structural guard (meta-test)

A new structural test `tests/cross-cutting/unit-suite-shard-topology.test.ts` (string-match on the workflow YAML, mirroring `ci-workflow-speedup.test.ts`'s pattern) pins:

1. `unit-suite.yml` defines a `unit-suite-shard` job with `strategy.matrix.shard` listing **exactly** `[1, 2]` and `fail-fast: false`.
2. The shard job runs `vitest ... --shard=${{ matrix.shard }}/N` where **N equals the matrix length** (guards the "shard count drifted from matrix size" bug, which would drop or double-run files).
3. The shard job sets `VITEST_EXCLUDE_ENV_BOUND: "1"` (guards regressing the env-bound-exclude contract) and boots Supabase (`supabase-local-bootstrap.sh`).
4. An **`unit-suite`** job exists with `needs: [unit-suite-shard]`, `if: always()`, and a step that fails unless `needs.unit-suite-shard.result == 'success'` (guards the required-context aggregator — its absence or a wrong `needs` would let a red shard merge).
5. The shard job does **NOT** set `continue-on-error: true` (would mask a failed leg as `success` in the `needs.*.result` rollup → silent coverage hole; see §3.1).
6. **Anti-vacuity:** the test asserts the file was found and the matrix block was actually matched, so a regex that silently matches nothing fails loudly.

The existing `tests/cross-cutting/ci-workflow-speedup.test.ts` (concurrency / paths / psql / playwright-cache) and `tests/cross-cutting/vitest-projects-partition.test.ts` (two-project partition) are **unaffected**: the concurrency block stays at workflow level in PR-only form, and the vitest projects are unchanged. Both must still pass.

## 5. Sequencing & rollout

1. **Land after PR C (#116) merges.** Rebase `chore/ci-speedup-unit-suite-shard` onto post-C `main` so PR D inherits the PR-only `cancel-in-progress`. PR D's edits are to `jobs:`; the concurrency block is written in the final PR-only form to make the rebase conflict-free.
2. **Do not auto-merge** (CI-infra discipline, memory: `feedback_ci_pin_and_branch_protection`). Auto-merge gates only on required checks; here that's the new aggregator, which *would* let the PR merge once green — but we want eyes on the **shard legs** (not required) being green too before merge. Watch `unit-suite-shard (1)`, `unit-suite-shard (2)`, and the `unit-suite` aggregator all green on the PR via `workflow_dispatch` + the PR run, then merge manually with `--merge`.
3. **Real CI green is a separate gate** from local + adversarial-review green (memory: local-passes-CI-fails is its own bug class). Verify on the actual GitHub runner via `workflow_dispatch` before merge.
4. After merge: fast-forward local `main`, confirm `rev-list --left-right --count main...origin/main == 0 0`.

## 6. Out of scope

- The in-place `npx tsx → pnpm exec tsx` cold-start optimization (a separate, complementary lever; not needed to hit < 9m and it touches test helpers — deferred to BACKLOG if balance proves tight).
- Three-or-more shards (diminishing returns vs N× boot; revisit only if 2 shards miss < 9m).
- D10–D12 (Supabase image cache / `.next/cache` / composite action) remain in DEFERRED.md.
- Any change to the vitest project partition itself (PR B's domain).

## 7. Test plan

- **TDD:** the meta-test (`unit-suite-shard-topology.test.ts`) is written first and fails against the pre-change `unit-suite.yml`, then passes after the restructure.
- **Local:** run the new meta-test + the two existing CI-structure meta-tests green; confirm `pnpm exec vitest run --shard=1/2 --project=parallel` and `--shard=2/2 --project=parallel` partition (already verified).
- **Real CI:** `workflow_dispatch` the restructured workflow; record per-shard wall-clock; apply the §3.3 balance gate.
- **Whole-diff adversarial review (Codex)** before merge.
