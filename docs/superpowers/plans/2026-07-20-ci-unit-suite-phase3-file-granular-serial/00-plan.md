# CI unit-suite Phase 3 — file-granular serial set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the spike-verified DB-free files (≈516; the audit script's measured output is authoritative) out of the serial vitest project via a new `PARALLEL_EXTRA_FILES` list, with a regeneration script and a resolved-config partition proof.

**Architecture:** Extends the existing single-source membership model with one new entry type — no inversion, no new dir globs, safe-by-default preserved. The partition meta-test's synthetic sum is replaced by evaluation against the projects' real `include`/`exclude` arrays.

**Tech Stack:** vitest 4.1.5 projects, Node ESM script, TypeScript strict.

**Spec:** `docs/superpowers/specs/ci/2026-07-20-ci-unit-suite-phase3-file-granular-serial.md` (APPROVED, 4 adversarial rounds). Section refs are to that spec.

## Plan pipeline checklist

- [x] Pre-draft code-verification pass (partition test read in full post-P2: helper :44-72, config-entry tests :55-127 incl. the `parallel.include` equality at :118-126, walker :133-147, mustBeSerial :149-163, mustBeParallel/env-bound :165-192, serialExcludeFor :193-217, harness :219+; `vitest.projects.ts:50-93` with the exact-file entry at :93; `vitest.config.ts` serial :68-84 / parallel :86-99)
- [x] `pnpm spec:lint` on the spec: 0 hard
- [x] Snippet typecheck: the sentinel `globToRegExp` was executed against a 15-case shape matrix (terminal `/**`, nested node_modules/.git, brace alternation, exact files, leading `**/`, negatives) — 15/15 pass; the pasted test snippets are typechecked in Task 2 Step 1 (`tsc --noEmit`) once written
- [ ] Adversarial review (cross-model) — Codex, to APPROVE, before execution
- [ ] Execution (Tasks 0–4; whole-diff review BEFORE push)

## Global Constraints

- Commit per task, conventional-commits, `--no-verify`.
- No new dir globs for mixed dirs; serial stays `fileParallelism: false`; no workflow/shard change.
- Worktree `/Users/ericweiss/FX-worktrees/ci-unit-suite-phase3` (branch `chore/ci-unit-suite-phase3-db-parallel`).
- A glob matcher is needed for the resolved-config proof. **Decided by inspection this session: `picomatch` is NOT importable from the workspace root (present only as a nested, non-hoisted transitive dep inside the pnpm store, with no @types package), so it is NOT used.** The test implements the conversion locally: the P2 `globToRegExp` extended to handle `{a,b}` brace alternation in addition to `*` and `**`. No new dependency is added by this phase.

## Meta-test inventory

EXTENDS `tests/cross-cutting/vitest-projects-partition.test.ts` (spec §4 a–g). CREATES none. The audit script is tooling, pinned by §4g's `--check` invocation.

---

### Task 0: Generate the list from a committed script (tooling + data; no behavior change)

**Structure:** the script's two behaviors (candidate-population derivation; `--check` validation) are extracted into a PURE, importable core so they get a real failing-test-first cycle here. The I/O shell (spawning vitest, reading reporter JSON, printing) is likewise test-first: Step 3 writes failing CLI tests against the real entry point using an injectable runner seam, Step 4 implements it, and Task 1's §4g pins the `--check` path permanently in CI.

**Files:**
- Create (new, not yet tracked): serialAudit.ts under lib/test/ — the pure core (`deriveCandidatePopulation`, `checkCommittedList`)
- Create (new, not yet tracked): serialAudit.test.ts under tests/cross-cutting/ — its failing-first unit test
- Create (new, not yet tracked): audit-serial-files.mjs under scripts/ — the I/O shell
- Create (new, not yet tracked): vitest.parallel-extra-files.ts at the repo root — the generated list

**Interfaces:**
- Consumes: `BASE_INCLUDE`, `PARALLEL_TEST_GLOBS`, `NIGHTLY_ONLY_EXCLUDES`, `ENV_BOUND_EXCLUDES` (`vitest.projects.ts`), `configDefaults.exclude` (vitest).
- Produces: `PARALLEL_EXTRA_FILES: readonly string[]` consumed by Tasks 1–2.

- [ ] **Step 1: Write the failing unit test** for the pure core, at serialAudit.test.ts under tests/cross-cutting/, against fixture inputs (a small synthetic file list + synthetic glob constants, NOT the live tree, so it is deterministic):
  - `deriveCandidatePopulation(allFiles, {baseInclude, defaultExcludes, nightly, envBound, parallelGlobs})` returns exactly the files matching `baseInclude` minus every other set, where `parallelGlobs` subtraction covers BOTH a dir glob and an exact-file entry (the round-3 spec finding — assert an exact-file entry is subtracted).
  - `checkCommittedList(committed, population, existsOnDisk)` returns a structured result flagging: not-a-subset, unsorted, duplicated, missing-on-disk — one assertion each, including a green case.
  Run it: `pnpm exec vitest run` scoped to that new file → FAIL (module absent).

- [ ] **Step 2: Write the pure core** at serialAudit.ts under lib/test/ (home of the sentinel `globToRegExp`; Task 1's partition test imports it from here rather than redefining it) until the unit test passes. Re-run → PASS.

- [ ] **Step 3: Write the failing CLI test** for the shell (append to the same unit-test file; spawns the script as a child process, so it tests the real entry point):
  - `--check` on a deliberately-bad committed list (unsorted / containing a nonexistent path) exits NON-ZERO and prints the offending paths on stderr; `--check` on a good list exits 0. Both assert the run took no measurable test-execution time and that no scratch config was left behind (the no-test-execution guarantee).
  - `--help`/unknown-flag handling exits non-zero with usage rather than silently measuring.
  - Measure mode is invoked with an injected stub runner (the shell takes its vitest-invoker as an injectable seam, default = real spawn) over a 2-file synthetic population, with the stub returning canned per-repeat JSON: assert the emitted array is the sorted intersection of files green in ALL repeats, and that a file failing any single repeat is excluded. This pins scratch-config construction, closed-port env propagation, repeat handling, JSON parsing, intersection, and sorting WITHOUT running the real suite.
  Run → FAIL (script absent).

- [ ] **Step 4: Write the I/O shell** at audit-serial-files.mjs under scripts/, implementing spec §3.4 exactly on top of the pure core, until Step 3's tests pass — candidate population = `BASE_INCLUDE` matches, minus `configDefaults.exclude`, minus `NIGHTLY_ONLY_EXCLUDES`, minus `ENV_BOUND_EXCLUDES`, minus every path claimed by ANY `PARALLEL_TEST_GLOBS` entry (dir glob or exact file — iterate the constant, do not assume shape). Two modes:
  - default (measure): writes a scratch vitest config over the candidate population with `fileParallelism: true`, runs it `--repeats N` (default 3) with `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`=`http://127.0.0.1:9` and `TEST_DATABASE_URL`/`DATABASE_URL`=`postgresql://postgres:x@127.0.0.1:9/postgres`, collects each run's JSON reporter output, and prints the sorted array body of candidates green in ALL repeats.
  - `--check`: no test execution; re-derives the population and verifies the committed `PARALLEL_EXTRA_FILES` is a subset of it, sorted, unique, all extant. Exit non-zero with the offending paths otherwise.
- [ ] **Step 5: Run measure mode (real, against the live tree)** (`node scripts/audit-serial-files.mjs --repeats 3`), capture the emitted array, and record the run summary (candidate count, per-repeat pass counts) for the PR body.
- [ ] **Step 6: Create the new root module vitest.parallel-extra-files.ts** exporting `PARALLEL_EXTRA_FILES` = the emitted array verbatim, with a header stating: what it is, that it is GENERATED (regenerate via the script, never hand-edit), the measurement contract (closed-port + `fileParallelism:true`, 3 clean repeats), and the spec reference. Expected ≈516 entries (spec §2.3); the exact count is whatever measure mode emits — the spec's number is the expectation, the script is the authority.
- [ ] **Step 7: Publish the symbol** — add `export { PARALLEL_EXTRA_FILES } from "./vitest.parallel-extra-files";` to `vitest.projects.ts`. This is plumbing only: no project's `include`/`exclude` changes here, so membership is unchanged and every meta-test stays green. It lands in THIS task so Task 1's red run resolves the import (a missing export would fail collection instead of the two wiring assertions).
- [ ] **Step 8: Verify** `node scripts/audit-serial-files.mjs --check` exits 0, and `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/serialAudit.test.ts` is green (membership genuinely unchanged).
- [ ] **Step 9: Commit.**

```bash
git add lib/test/serialAudit.ts tests/cross-cutting/serialAudit.test.ts scripts/audit-serial-files.mjs vitest.parallel-extra-files.ts vitest.projects.ts
git commit --no-verify -m "infra: serial-audit pure core + script + generated PARALLEL_EXTRA_FILES (measured DB-free set)"
```

---

### Task 1: Partition proof + wiring (single red -> green -> commit cycle)

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`
- Modify: `vitest.config.ts`, `vitest.projects.ts` (header note only)

**Interfaces:**
- Consumes: Task 0's `PARALLEL_EXTRA_FILES`; the imported `vitestConfig` projects array.
- Produces: the shipped membership change.

**Prerequisite already satisfied by Task 0 Step 6:** `vitest.projects.ts` re-exports `PARALLEL_EXTRA_FILES` from the generated module (plumbing only, membership unchanged), so this task's red run resolves the import and fails on the two wiring assertions rather than on collection. Do NOT inline or append the array into `PARALLEL_TEST_GLOBS`.

- [ ] **Step 1: Import the matcher** from the new serialAudit module under lib/test/ (created in Task 0; single definition, no redefinition here). For reference, its implementation is:

```ts
// Glob -> anchored RegExp for the resolved-config proof. Sentinel-based so
// escaping never re-processes emitted regex (a naive sequential replace turns
// `**/node_modules/**` into a pattern that cannot match nested descendants).
// Verified against 15 cases covering every shape the config uses: `**/x/**`
// default excludes, `tests/x/**/*.test.{ts,tsx}`, exact files, and
// `**/tests/.../x.test.ts`. picomatch is not importable from the workspace
// root (nested transitive dep only), so this stays dependency-free.
function globToRegExp(glob: string): RegExp {
  const DEEP_SUFFIX = "\u0000DEEPSUF\u0000";
  const DEEP = "\u0000DEEP\u0000";
  const STAR = "\u0000STAR\u0000";
  const marked = glob
    .replace(/\/\*\*$/, DEEP_SUFFIX)
    .replace(/\*\*\//g, DEEP)
    .replace(/\*/g, STAR);
  const esc = marked.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = esc
    .replace(/\\\{([^}]*)\\\}/g, (_m, alts: string) => `(?:${alts.split(",").join("|")})`)
    .split(DEEP_SUFFIX)
    .join("(?:/.*)?")
    .split(DEEP)
    .join("(?:.*/)?")
    .split(STAR)
    .join("[^/]*");
  return new RegExp(`^${body}$`);
}
```

A companion unit test in the same file pins the matcher itself (it is now load-bearing infrastructure, not a helper): assert the 15 cases above, including that the default-exclude glob for node_modules matches a nested path under a node_modules directory and does NOT match an ordinary test path.
- [ ] **Step 2: Edit the test.** All of:
  - Import `PARALLEL_EXTRA_FILES`.
  - (§4a) `matchesParallel(file)` → true if ANY `PARALLEL_TEST_GLOBS` entry matches (dir glob or exact file, as today) **or** `PARALLEL_EXTRA_FILES.includes(file)`. Comment it as spot-check shorthand, explicitly NOT the partition proof.
  - (§4b0-i) REPLACE the assertion at `vitest-projects-partition.test.ts` lines 118-126 (`parallel.include` equals `PARALLEL_TEST_GLOBS`) with: `parallel.include` equals `[...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`, and `serial.exclude` contains every entry of that union.
  - (§4b0-ii) NEW: every `PARALLEL_EXTRA_FILES` entry classifies as exactly `"parallel"` under the resolved-config classifier below.
  - (§4b) REPLACE the walker at `vitest-projects-partition.test.ts` lines 133-147 (delete the sum-of-three form) with a resolved-config classifier: `inProject(file, p)` = some `p.include` glob matches AND no `p.exclude` glob matches, read off the imported config objects. For every walked file assert exactly one admitting project, EXCEPT `NIGHTLY_ONLY_EXCLUDES` matches (zero) and, in a `VITEST_EXCLUDE_ENV_BOUND=1` re-import (mirroring the existing `serialExcludeFor` env-stub pattern at `vitest-projects-partition.test.ts` lines 193-217), the three env-bound files (zero).
  - (§4c) NEW list-integrity block, one assertion each: every entry exists on disk; unique; sorted; matches `BASE_INCLUDE`; claimed by NO `PARALLEL_TEST_GLOBS` entry; not nightly; not env-bound; not matched by `configDefaults.exclude`.
  - (§4d) NEW anti-vacuity band: `PARALLEL_EXTRA_FILES.length` within `[400, 600]`, with the comment that the band is re-tuned when measure mode legitimately moves the count.
  - (§4e) `mustBeSerial`: replace the whole-dir rows `tests/onboarding`, `tests/api`, `tests/notify` with these exact DB-bound paths (verified present and DB-marker-bearing this session), keeping `tests/db/advisory-lock.test.ts` and the corpus writer `tests/sync/dev-routing.test.ts`:

```ts
    const mustBeSerial = [
      "tests/db/advisory-lock.test.ts",
      "tests/sync/dev-routing.test.ts", // the fixture-corpus WRITER
      "tests/admin/test-auth-gate.test.ts", // env-bound (x-audits-targeted)
      "tests/cross-cutting/email-canonicalization.test.ts", // env-bound (x5-targeted)
      "tests/cross-cutting/pg-cron-coverage.test.ts", // env-bound
      "tests/onboarding/finalizeGateStaged.db.test.ts",
      "tests/onboarding/rescanWizardSheetFlowB.db.test.ts",
      "tests/api/wizard-approve-route.test.ts",
      "tests/api/show-unpublish-route.realdb.test.ts",
      "tests/notify/monitorDigest.drift.db.test.ts",
      "tests/notify/auto-publish-undo-live-probe-real-db.test.ts",
    ];
```

(The three whole-dir rows are gone because those dirs are now genuinely mixed; every path above is asserted serial by exact path.)
  - (§4f) Keep the env-bound assertion, strengthened: the three paths are absent from `PARALLEL_EXTRA_FILES` and claimed by no `PARALLEL_TEST_GLOBS` entry.
  - (§4g) NEW: spawn `node scripts/audit-serial-files.mjs --check` and assert exit 0.
- [ ] **Step 3: Run — RED.** Confirm the failure set is exactly the wiring assertions, proving they bind:

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL on (§4b0-i) and (§4b0-ii) only — the list exists but is not yet in either project's arrays. List-integrity, band, matcher unit test, and `--check` PASS. Do NOT commit here.

- [ ] **Step 4: Wire it — GREEN.** `vitest.config.ts`: parallel `include: [...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`; serial `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES, ...envBoundExcludes, ...nightlyExcludes]` (preserve the existing conditional env-bound handling verbatim). `vitest.projects.ts`: extend the header with the §3.3 contract note — mixed dirs are NOT parallel globs, so new tests there stay serial by default; a file becomes parallel only via an explicit reviewable `PARALLEL_EXTRA_FILES` line regenerated by the audit script.

- [ ] **Step 5: Run — verify green across the meta-test suite.**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit** (one commit, red and green together — the suite is never committed failing).

```bash
git add tests/cross-cutting/vitest-projects-partition.test.ts vitest.config.ts vitest.projects.ts
git commit --no-verify -m "infra: resolved-config partition proof + wire PARALLEL_EXTRA_FILES into both vitest projects"
```

---

### Task 2: Verification gates

- [ ] **Step 1:** `pnpm exec tsc --noEmit` — clean.
- [ ] **Step 2:** `pnpm exec eslint` on every touched file — clean.
- [ ] **Step 3:** `pnpm exec prettier --check` on every touched file + the spec + this plan; if dirty, `--write` and commit as `style(infra)` (never amend).
- [ ] **Step 4:** Full suite `pnpm test`. The local Supabase has been degraded by repeated runs this session — if DB-class failures appear, run `pnpm validation:reseed --combo all`, re-run, and if they persist, A/B against merge-base (`git stash` the diff or check out origin/main config) and record BOTH counts, as P2 did. Only diff-attributable failures block.
- [ ] **Step 5:** Fixes are their own `fix(infra)` / `style(infra)` commits.

---

### Task 3: Whole-diff cross-model review (BEFORE push)

- [ ] **Step 1:** Dispatch via `node scripts/codex-guard.mjs review`, fresh-eyes, REVIEWER ONLY, do-not-relitigate = spec §1.1 (incl. the withdrawn inverted model) + the spike numbers. Tight file list (every file this phase touches): the new audit script under scripts/, the new pure core under lib/test/ and its unit test under tests/cross-cutting/, the new root parallel-extra-files module, `vitest.config.ts`, `vitest.projects.ts`, `tests/cross-cutting/vitest-projects-partition.test.ts`. Iterate to APPROVE.
- [ ] **Step 2:** Repairs follow the originating task's TDD shape; one commit per finding class.

---

### Task 4: PR + accept criteria (spec §5, real CI)

Reuse P1's `measure()` helper with `LEGS=8` and its MEASURE-LOOP discipline (push → watch → resolve run → measure latest attempt → evaluate).

- [ ] **Step 1:** Push; `gh pr create` titled `infra: CI unit-suite Phase 3 — file-granular serial set (measured DB-free files to parallel)`, body carrying the spike summary, the measure-mode provenance from Task 0 Step 5, and the measurement table.
- [ ] **Step 2:** Watch; `measure <run> <latest attempt>`. Record max_wall + vitest_skew vs P2's baseline (254s / 57s, run 29720857479).
- [ ] **Step 3:** Evaluate in spec order: max_wall < 300s (regression floor — blocks merge if exceeded); vitest_skew ≤ 75s (else P1's reweight branch). Re-enter the loop after any mutation commit.
- [ ] **Step 4:** Record in the PR body; pre-merge guards (clean tree, pushed, `headRefOid` matches, not DIRTY); delta-review any post-APPROVE repair commits.
- [ ] **Step 5:** `gh pr merge <PR#> --merge` in the same turn as CI-green → `cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main` → expect `0	0`. Then the 3-phase program is complete: delete the ship cron and report final program numbers.

---

## Self-review notes

- Spec coverage: §3.1→Task 0 Step 3; §3.2→Task 1 Step 4; §3.3→Task 1 Step 4 header note; §3.4→Task 0 Steps 1-5 (pure core test-first, shell test-first, then the real measurement run); §3.5→Task 1 (§4c); §4a-g→Task 1 Step 2; §5→Task 4. No requirement without a task.
- Ordering rationale: the script precedes the list (regeneration is the contract, not the artifact); the test-then-wire cycle lives INSIDE Task 1 so no commit ever contains a failing suite, and Task 1 Step 3's red state still isolates the wiring defect specifically.
- Anti-tautology: §4b evaluates real config arrays (the round-2/3 finding); §4b0-ii asserts `"parallel"` specifically, which is exactly what an unspread list fails; §4g runs the real script rather than asserting its existence.
- Known risk carried forward: the local DB's degraded state makes the full-suite gate noisy — Task 2 Step 4 prescribes the reseed + A/B protocol that P2 used rather than assuming green.
