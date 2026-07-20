# CI unit-suite Phase 3 — file-granular serial set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 516 spike-verified DB-free files out of the serial vitest project via a new `PARALLEL_EXTRA_FILES` list, with a regeneration script and a resolved-config partition proof.

**Architecture:** Extends the existing single-source membership model with one new entry type — no inversion, no new dir globs, safe-by-default preserved. The partition meta-test's synthetic sum is replaced by evaluation against the projects' real `include`/`exclude` arrays.

**Tech Stack:** vitest 4.1.5 projects, Node ESM script, TypeScript strict.

**Spec:** `docs/superpowers/specs/ci/2026-07-20-ci-unit-suite-phase3-file-granular-serial.md` (APPROVED, 4 adversarial rounds). Section refs are to that spec.

## Plan pipeline checklist

- [x] Pre-draft code-verification pass (partition test read in full post-P2: helper :44-72, config-entry tests :55-127 incl. the `parallel.include` equality at :118-126, walker :133-147, mustBeSerial :149-163, mustBeParallel/env-bound :165-192, serialExcludeFor :193-217, harness :219+; `vitest.projects.ts:50-93` with the exact-file entry at :93; `vitest.config.ts` serial :68-84 / parallel :86-99)
- [x] `pnpm spec:lint` on the spec: 0 hard
- [ ] Snippet typecheck (Task 0 below produces the transcript)
- [ ] Adversarial review (cross-model) — Codex, to APPROVE, before execution
- [ ] Execution (Tasks 1–5; whole-diff review BEFORE push)

## Global Constraints

- Commit per task, conventional-commits, `--no-verify`.
- No new dir globs for mixed dirs; serial stays `fileParallelism: false`; no workflow/shard change.
- Worktree `/Users/ericweiss/FX-worktrees/ci-unit-suite-phase3` (branch `chore/ci-unit-suite-phase3-db-parallel`).
- A glob matcher is needed for the resolved-config proof. **Decided by inspection this session: `picomatch` is NOT importable from the workspace root (present only as a nested, non-hoisted transitive dep inside the pnpm store, with no @types package), so it is NOT used.** The test implements the conversion locally: the P2 `globToRegExp` extended to handle `{a,b}` brace alternation in addition to `*` and `**`. No new dependency is added by this phase.

## Meta-test inventory

EXTENDS `tests/cross-cutting/vitest-projects-partition.test.ts` (spec §4 a–g). CREATES none. The audit script is tooling, pinned by §4g's `--check` invocation.

---

### Task 0: Regenerate the list from a committed script (script first, list second)

**Files:**
- Create (new, not yet tracked): audit-serial-files.mjs under scripts/
- Create (new, not yet tracked): vitest.parallel-extra-files.ts at the repo root

**Interfaces:**
- Consumes: `BASE_INCLUDE`, `PARALLEL_TEST_GLOBS`, `NIGHTLY_ONLY_EXCLUDES`, `ENV_BOUND_EXCLUDES` (`vitest.projects.ts`), `configDefaults.exclude` (vitest).
- Produces: `PARALLEL_EXTRA_FILES: readonly string[]` consumed by Tasks 1–2.

- [ ] **Step 1: Write the script** implementing spec §3.4 exactly — candidate population = `BASE_INCLUDE` matches, minus `configDefaults.exclude`, minus `NIGHTLY_ONLY_EXCLUDES`, minus `ENV_BOUND_EXCLUDES`, minus every path claimed by ANY `PARALLEL_TEST_GLOBS` entry (dir glob or exact file — iterate the constant, do not assume shape). Two modes:
  - default (measure): writes a scratch vitest config over the candidate population with `fileParallelism: true`, runs it `--repeats N` (default 3) with `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`=`http://127.0.0.1:9` and `TEST_DATABASE_URL`/`DATABASE_URL`=`postgresql://postgres:x@127.0.0.1:9/postgres`, collects each run's JSON reporter output, and prints the sorted array body of candidates green in ALL repeats.
  - `--check`: no test execution; re-derives the population and verifies the committed `PARALLEL_EXTRA_FILES` is a subset of it, sorted, unique, all extant. Exit non-zero with the offending paths otherwise.
- [ ] **Step 2: Run measure mode** (`node scripts/audit-serial-files.mjs --repeats 3`), capture the emitted array, and record the run summary (candidate count, per-repeat pass counts) for the PR body.
- [ ] **Step 3: Create the new root module vitest.parallel-extra-files.ts** exporting `PARALLEL_EXTRA_FILES` = the emitted array verbatim, with a header stating: what it is, that it is GENERATED (regenerate via the script, never hand-edit), the measurement contract (closed-port + `fileParallelism:true`, 3 clean repeats), and the spec reference. Expected ≈516 entries (spec §2.3); the exact count is whatever measure mode emits — the spec's number is the expectation, the script is the authority.
- [ ] **Step 4: Verify** `node scripts/audit-serial-files.mjs --check` exits 0 against the committed list.
- [ ] **Step 5: Commit.**

```bash
git add scripts/ vitest.parallel-extra-files.ts
git commit --no-verify -m "infra: audit-serial-files script + generated PARALLEL_EXTRA_FILES (measured DB-free set)"
```

---

### Task 1: Partition meta-test — resolved-config proof + wiring pins (failing first)

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`

**Interfaces:**
- Consumes: Task 0's `PARALLEL_EXTRA_FILES`; the imported `vitestConfig` projects array.
- Produces: the failing gate Task 2 satisfies.

- [ ] **Step 1: Add the local glob matcher** (decision already made — see Global Constraints; picomatch is not importable from the root). Extend P2's `globToRegExp` in the test file to support brace alternation:

```ts
// Glob -> anchored RegExp for the resolved-config proof. Handles the three
// shapes the vitest config actually uses: `**/` prefixes, `*` segments, and
// `{ts,tsx}` alternation. picomatch is not importable from the workspace root
// (nested transitive dep only), so this stays dependency-free.
function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\{([^}]+)\}/g, (_m, alts: string) => `(?:${alts.split(",").join("|")})`)
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${esc}$`);
}
```
- [ ] **Step 2: Edit the test.** All of:
  - Import `PARALLEL_EXTRA_FILES`.
  - (§4a) `matchesParallel(file)` → true if ANY `PARALLEL_TEST_GLOBS` entry matches (dir glob or exact file, as today) **or** `PARALLEL_EXTRA_FILES.includes(file)`. Comment it as spot-check shorthand, explicitly NOT the partition proof.
  - (§4b0-i) REPLACE the assertion at `vitest-projects-partition.test.ts` lines 118-126 (`parallel.include` equals `PARALLEL_TEST_GLOBS`) with: `parallel.include` equals `[...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`, and `serial.exclude` contains every entry of that union.
  - (§4b0-ii) NEW: every `PARALLEL_EXTRA_FILES` entry classifies as exactly `"parallel"` under the resolved-config classifier below.
  - (§4b) REPLACE the walker at `vitest-projects-partition.test.ts` lines 133-147 (delete the sum-of-three form) with a resolved-config classifier: `inProject(file, p)` = some `p.include` glob matches AND no `p.exclude` glob matches, read off the imported config objects. For every walked file assert exactly one admitting project, EXCEPT `NIGHTLY_ONLY_EXCLUDES` matches (zero) and, in a `VITEST_EXCLUDE_ENV_BOUND=1` re-import (mirroring the existing `serialExcludeFor` env-stub pattern at `vitest-projects-partition.test.ts` lines 193-217), the three env-bound files (zero).
  - (§4c) NEW list-integrity block, one assertion each: every entry exists on disk; unique; sorted; matches `BASE_INCLUDE`; claimed by NO `PARALLEL_TEST_GLOBS` entry; not nightly; not env-bound; not matched by `configDefaults.exclude`.
  - (§4d) NEW anti-vacuity band: `PARALLEL_EXTRA_FILES.length` within `[400, 600]`, with the comment that the band is re-tuned when measure mode legitimately moves the count.
  - (§4e) `mustBeSerial`: replace the whole-dir rows `tests/onboarding`, `tests/api`, `tests/notify` with exact DB-bound file paths from those dirs (take them from the residual set — e.g. onboarding's `cleanupRecoveryConcurrency.db.test.ts`, api's wizard-approve route test, notify's DB-touching test); keep `tests/db/advisory-lock.test.ts` and `tests/sync/dev-routing.test.ts` as exact paths.
  - (§4f) Keep the env-bound assertion, strengthened: the three paths are absent from `PARALLEL_EXTRA_FILES` and claimed by no `PARALLEL_TEST_GLOBS` entry.
  - (§4g) NEW: spawn `node scripts/audit-serial-files.mjs --check` and assert exit 0.
- [ ] **Step 3: Run — expect failures** in the wiring/classification assertions (list exists but is not yet spread into the config).

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL on (§4b0-i), (§4b0-ii); list-integrity/band/`--check` PASS.

- [ ] **Step 4: Commit the failing test** (TDD boundary — the config change is Task 2).

```bash
git add tests/cross-cutting/vitest-projects-partition.test.ts
git commit --no-verify -m "test(infra): resolved-config partition proof + PARALLEL_EXTRA_FILES wiring pins (failing until wired)"
```

---

### Task 2: Wire the list into both projects

**Files:**
- Modify: `vitest.projects.ts` (re-export or import-and-append), `vitest.config.ts`

- [ ] **Step 1:** `vitest.config.ts`: parallel `include: [...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`; serial `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES, ...envBoundExcludes, ...nightlyExcludes]` (preserve the existing conditional env-bound handling exactly). `vitest.projects.ts` header gains the §3.3 contract note: mixed dirs are NOT parallel globs, so new tests there stay serial by default; a file becomes parallel only via an explicit reviewable `PARALLEL_EXTRA_FILES` line regenerated by the script.
- [ ] **Step 2: Run — expect green.**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: PASS (all).

- [ ] **Step 3: Commit.**

```bash
git add vitest.config.ts vitest.projects.ts
git commit --no-verify -m "infra: wire PARALLEL_EXTRA_FILES into both vitest projects (516 measured DB-free files leave the serial phase)"
```

---

### Task 3: Verification gates

- [ ] **Step 1:** `pnpm exec tsc --noEmit` — clean.
- [ ] **Step 2:** `pnpm exec eslint` on every touched file — clean.
- [ ] **Step 3:** `pnpm exec prettier --check` on every touched file + the spec + this plan; if dirty, `--write` and commit as `style(infra)` (never amend).
- [ ] **Step 4:** Full suite `pnpm test`. The local Supabase has been degraded by repeated runs this session — if DB-class failures appear, run `pnpm validation:reseed --combo all`, re-run, and if they persist, A/B against merge-base (`git stash` the diff or check out origin/main config) and record BOTH counts, as P2 did. Only diff-attributable failures block.
- [ ] **Step 5:** Fixes are their own `fix(infra)` / `style(infra)` commits.

---

### Task 4: Whole-diff cross-model review (BEFORE push)

- [ ] **Step 1:** Dispatch via `node scripts/codex-guard.mjs review`, fresh-eyes, REVIEWER ONLY, do-not-relitigate = spec §1.1 (incl. the withdrawn inverted model) + the spike numbers. Tight file list: the new audit script under scripts/, the new root parallel-extra-files module, `vitest.config.ts`, `vitest.projects.ts`, `tests/cross-cutting/vitest-projects-partition.test.ts`. Iterate to APPROVE.
- [ ] **Step 2:** Repairs follow the originating task's TDD shape; one commit per finding class.

---

### Task 5: PR + accept criteria (spec §5, real CI)

Reuse P1's `measure()` helper with `LEGS=8` and its MEASURE-LOOP discipline (push → watch → resolve run → measure latest attempt → evaluate).

- [ ] **Step 1:** Push; `gh pr create` titled `infra: CI unit-suite Phase 3 — file-granular serial set (516 measured DB-free files to parallel)`, body carrying the spike summary, the measure-mode provenance from Task 0 Step 2, and the measurement table.
- [ ] **Step 2:** Watch; `measure <run> <latest attempt>`. Record max_wall + vitest_skew vs P2's baseline (254s / 57s, run 29720857479).
- [ ] **Step 3:** Evaluate in spec order: max_wall < 300s (regression floor — blocks merge if exceeded); vitest_skew ≤ 75s (else P1's reweight branch). Re-enter the loop after any mutation commit.
- [ ] **Step 4:** Record in the PR body; pre-merge guards (clean tree, pushed, `headRefOid` matches, not DIRTY); delta-review any post-APPROVE repair commits.
- [ ] **Step 5:** `gh pr merge <PR#> --merge` in the same turn as CI-green → `cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main` → expect `0	0`. Then the 3-phase program is complete: delete the ship cron and report final program numbers.

---

## Self-review notes

- Spec coverage: §3.1→Task 0 Step 3; §3.2→Task 2 Step 1; §3.3→Task 2 Step 1 header note; §3.4→Task 0 Steps 1-2; §3.5→Task 1 (§4c); §4a-g→Task 1 Step 2; §5→Task 5. No requirement without a task.
- Ordering rationale: the script precedes the list (regeneration is the contract, not the artifact), and the list precedes the wiring so Task 1's failing test isolates the wiring defect specifically.
- Anti-tautology: §4b evaluates real config arrays (the round-2/3 finding); §4b0-ii asserts `"parallel"` specifically, which is exactly what an unspread list fails; §4g runs the real script rather than asserting its existence.
- Known risk carried forward: the local DB's degraded state makes the full-suite gate noisy — Task 3 Step 4 prescribes the reseed + A/B protocol that P2 used rather than assuming green.
