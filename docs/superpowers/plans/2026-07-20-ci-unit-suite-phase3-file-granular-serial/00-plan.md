# CI unit-suite Phase 3 — file-granular serial set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the spike-verified DB-free files (509 (final, after the spec §2.6 eligibility amendment), measured per spec §2) out of the serial vitest project via a new `PARALLEL_EXTRA_FILES` list, proven by a resolved-config partition test. Automating regeneration is descoped to `BL-CI-SERIAL-AUDIT-SCRIPT` (spec §1.0).

**Architecture:** Extends the existing single-source membership model with one new entry type — no inversion, no new dir globs, safe-by-default preserved. The partition meta-test's synthetic sum is replaced by evaluation against the projects' real `include`/`exclude` arrays.

**Tech Stack:** vitest 4.1.5 projects, TypeScript strict.

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

Two files, disjoint ownership. EXTENDS `tests/cross-cutting/vitest-projects-partition.test.ts` — it owns §4a (matchesParallel), §4b0 (wiring), §4b (resolved-config proof), §4e (serial spot-checks), §4f (env-bound). CREATES the serialAudit unit test under tests/cross-cutting/ — it owns the glob-matcher cases plus §4c (list integrity) and §4d (band). §4g is withdrawn by spec §1.0. No assertion lives in both files.

---

### Task 0: Land the measured list (script DESCOPED per spec §1.0)

**Scope note:** the audit script is descoped to backlog (spec §1.0, ratified after 5 plan-review rounds on its test seams). This task lands the measured data and the matcher the meta-test needs — both small, both directly test-covered. No CLI, no adapter, no cross-process seams.

**Files:**
- Create (new, not yet tracked): serialAudit.ts under lib/test/ — exports `globToRegExp` only
- Create (new, not yet tracked): serialAudit.test.ts under tests/cross-cutting/ — its failing-first unit test
- Create (new, not yet tracked): vitest.parallel-extra-files.ts at the repo root — the generated list
- Modify: `vitest.projects.ts` (re-export only)

- [ ] **Step 1: Write the failing matcher test** at serialAudit.test.ts under tests/cross-cutting/. `globToRegExp(glob: string): RegExp` is the only export; the test is a table of exactly these 15 cases, each `[glob, path, expected]`:

```ts
const CASES: ReadonlyArray<readonly [string, string, boolean]> = [
  ["**/node_modules/**", "node_modules/x/y.js", true],
  ["**/node_modules/**", "a/node_modules/x/y.js", true],
  ["**/node_modules/**", "tests/a.test.ts", false],
  ["**/.git/**", ".git/HEAD", true],
  ["**/dist/**", "dist/a/b.js", true],
  ["tests/x/**/*.test.{ts,tsx}", "tests/x/a/b.test.tsx", true],
  ["tests/x/**/*.test.{ts,tsx}", "tests/x/b.test.ts", true],
  ["tests/x/**/*.test.{ts,tsx}", "tests/y/b.test.ts", false],
  ["tests/sample.test.ts", "tests/sample.test.ts", true],
  ["tests/sample.test.ts", "tests/other.test.ts", false],
  ["**/tests/parser/mutationHarness.*.test.ts", "tests/parser/mutationHarness.shard1.test.ts", true],
  ["**/tests/parser/mutationHarness.*.test.ts", "tests/parser/parseSheet.test.ts", false],
  ["**/tests/admin/test-auth-gate.test.ts", "tests/admin/test-auth-gate.test.ts", true],
  ["tests/**/*.test.ts", "tests/a/b/c.test.ts", true],
  ["tests/**/*.test.tsx", "tests/a/b/c.test.ts", false],
];
it.each(CASES)("globToRegExp(%s) vs %s -> %s", (glob, path, expected) => {
  expect(globToRegExp(glob).test(path)).toBe(expected);
});
```

Run → FAIL (module absent).

- [ ] **Step 2: Write the core** at serialAudit.ts under lib/test/ — the sentinel implementation already validated 15/15 this session (the sentinel form: mark trailing /**, then **/, then *, escape, then expand the markers). Re-run → PASS.
- [ ] **Step 3: Write the FAILING list-integrity test** (spec §4c) in the same new test file, importing `PARALLEL_EXTRA_FILES` from `vitest.projects` (i.e. through the re-export, so this test also binds the plumbing Step 5 adds). One assertion each: every entry exists on disk; unique; sorted; matches `BASE_INCLUDE`; claimed by NO `PARALLEL_TEST_GLOBS` entry (dir glob or exact file, via `globToRegExp`); not `NIGHTLY_ONLY_EXCLUDES`; not `ENV_BOUND_EXCLUDES`; not matched by `configDefaults.exclude`; and the §4d band `length` within `[400, 600]`. Run → FAIL (neither the module nor the re-export exists). These assertions move OUT of Task 1 — Task 1 keeps only the config-resolution/wiring proofs (§4a, §4b0, §4b, §4e, §4f).

- [ ] **Step 4: Create the new root module vitest.parallel-extra-files.ts** exporting `PARALLEL_EXTRA_FILES` — the measured array from the spike (spec §2.3; 509 (final, after the spec §2.6 eligibility amendment) paths, sorted, deduplicated). Header states: what it is; how it was measured (closed-port env with the four DB/Supabase vars at port 9, `fileParallelism: true`, green in 3 consecutive repeats); that regeneration follows spec §3.4's documented procedure; and that `BL-CI-SERIAL-AUDIT-SCRIPT` tracks automating it.
- [ ] **Step 5: Publish the symbol** — add `export { PARALLEL_EXTRA_FILES } from "./vitest.parallel-extra-files";` to `vitest.projects.ts`. Plumbing only: no project's `include`/`exclude` changes here, so membership is unchanged, and Task 1's red run resolves the import instead of failing collection. Re-run the Step 3 test → PASS (this is the green half of Steps 3-5).
- [ ] **Step 6: Verify** membership is genuinely unchanged: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/serialAudit.test.ts` → green (the partition test still passes because no project's arrays changed).
- [ ] **Step 7: Add the backlog row** to `BACKLOG.md`: `## BL-CI-SERIAL-AUDIT-SCRIPT — automate PARALLEL_EXTRA_FILES regeneration`, citing spec §3.4 as the procedure and §1.0 for why it was descoped.
- [ ] **Step 8: Commit.**

```bash
git add lib/test/serialAudit.ts tests/cross-cutting/serialAudit.test.ts vitest.parallel-extra-files.ts vitest.projects.ts BACKLOG.md
git commit --no-verify -m "infra: measured PARALLEL_EXTRA_FILES + glob matcher (audit script descoped to BL-CI-SERIAL-AUDIT-SCRIPT)"
```

---

### Task 1: Partition proof + wiring (single red -> green -> commit cycle)

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`
- Modify: `vitest.config.ts`, `vitest.projects.ts` (header note only)

**Interfaces:**
- Consumes: Task 0's `PARALLEL_EXTRA_FILES`; the imported `vitestConfig` projects array.
- Produces: the shipped membership change.

**Prerequisite already satisfied by Task 0 Step 5 (the re-export):** `vitest.projects.ts` re-exports `PARALLEL_EXTRA_FILES` from the generated module (plumbing only, membership unchanged), so this task's red run resolves the import and fails on the two wiring assertions rather than on collection. Do NOT inline or append the array into `PARALLEL_TEST_GLOBS`.

- [ ] **Step 1: Import the matcher.** `import { globToRegExp } from "@/lib/test/serialAudit";` — it is the Task-0 core's sole export (Task 0 Steps 1-2) and is already covered there by the 15-case matrix. Do not redefine or re-test it here.

- [ ] **Step 2: Edit the test.** All of:
  - Import `PARALLEL_EXTRA_FILES`.
  - (§4a) `matchesParallel(file)` → true if ANY `PARALLEL_TEST_GLOBS` entry matches (dir glob or exact file, as today) **or** `PARALLEL_EXTRA_FILES.includes(file)`. Comment it as spot-check shorthand, explicitly NOT the partition proof.
  - (§4b0-i) REPLACE the assertion at `vitest-projects-partition.test.ts` lines 118-126 (`parallel.include` equals `PARALLEL_TEST_GLOBS`) with: `parallel.include` equals `[...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`, and `serial.exclude` contains every entry of that union.
  - (§4b0-ii) NEW: every `PARALLEL_EXTRA_FILES` entry classifies as exactly `"parallel"` under the resolved-config classifier below.
  - (§4b) REPLACE the walker at `vitest-projects-partition.test.ts` lines 133-147 (delete the sum-of-three form) with a resolved-config classifier: `inProject(file, p)` = some `p.include` glob matches AND no `p.exclude` glob matches, read off the imported config objects. For every walked file assert exactly one admitting project, EXCEPT `NIGHTLY_ONLY_EXCLUDES` matches (zero) and, in a `VITEST_EXCLUDE_ENV_BOUND=1` re-import (mirroring the existing `serialExcludeFor` env-stub pattern at `vitest-projects-partition.test.ts` lines 193-217), the three env-bound files (zero).
  - (§4c, §4d) NOT here — landed test-first in Task 0 Steps 3-5.
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
  - (§4g is WITHDRAWN by spec §1.0 along with the script — do not add a script invocation here. §4c's list-integrity assertions are the guard.)
- [ ] **Step 3: Run — RED.** Confirm the failure set is exactly the wiring assertions, proving they bind:

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL on (§4b0-i) and (§4b0-ii) only — the list exists and is imported, but is not yet in either project's arrays. Every other assertion in this file passes. (The matcher and list-integrity tests live in the Task-0 file and are not selected by this command; run them too if you want the full picture.) Do NOT commit here.

- [ ] **Step 4: Wire it — GREEN.** `vitest.config.ts`: parallel `include: [...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES]`; serial `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...PARALLEL_EXTRA_FILES, ...envBoundExcludes, ...nightlyExcludes]` (preserve the existing conditional env-bound handling verbatim). `vitest.projects.ts`: extend the header with the §3.3 contract note — mixed dirs are NOT parallel globs, so new tests there stay serial by default; a file becomes parallel only via an explicit reviewable `PARALLEL_EXTRA_FILES` line regenerated by the documented procedure in spec §3.4 (automation tracked by BL-CI-SERIAL-AUDIT-SCRIPT).

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

- [ ] **Step 1:** Dispatch via `node scripts/codex-guard.mjs review`, fresh-eyes, REVIEWER ONLY, do-not-relitigate = spec §1.1 (incl. the withdrawn inverted model) + the spike numbers. Tight file list (every file this phase touches): the new matcher core under lib/test/ and its unit test under tests/cross-cutting/, the new root parallel-extra-files module, `BACKLOG.md`, `vitest.config.ts`, `vitest.projects.ts`, `tests/cross-cutting/vitest-projects-partition.test.ts`. Iterate to APPROVE.
- [ ] **Step 2:** Repairs follow the originating task's TDD shape; one commit per finding class.

---

### Task 4: PR + accept criteria (spec §5, real CI)

Reuse P1's `measure()` helper with `LEGS=8` and its MEASURE-LOOP discipline (push → watch → resolve run → measure latest attempt → evaluate).

- [ ] **Step 1:** Push; `gh pr create` titled `infra: CI unit-suite Phase 3 — file-granular serial set (measured DB-free files to parallel)`, body carrying the spike summary, the spike's measurement provenance (spec §2.2/§2.3), and the measurement table.
- [ ] **Step 2:** Watch; `measure <run> <latest attempt>`. Record max_wall + vitest_skew vs P2's baseline (254s / 57s, run 29720857479).
- [ ] **Step 3:** Evaluate in spec order: max_wall < 300s (regression floor — blocks merge if exceeded); vitest_skew ≤ 75s (else P1's reweight branch). Re-enter the loop after any mutation commit.
- [ ] **Step 4:** Record in the PR body; pre-merge guards (clean tree, pushed, `headRefOid` matches, not DIRTY); delta-review any post-APPROVE repair commits.
- [ ] **Step 5:** `gh pr merge <PR#> --merge` in the same turn as CI-green → `cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main` → expect `0	0`. Then the 3-phase program is complete: delete the ship cron and report final program numbers.

---

## Self-review notes

- Spec coverage: §3.1→Task 0 Step 4; §3.2→Task 1 Step 4; §3.3→Task 1 Step 4 header note; §3.4→retained as the documented regeneration PROCEDURE (spec §1.0 descope), referenced from the generated module's header in Task 0 Step 4; §3.5→Task 0 Step 3 (the §4c assertions); §4a/§4b0/§4b/§4e/§4f→Task 1 Step 2; §4c/§4d→Task 0 Step 3; §4g withdrawn by spec §1.0; §5→Task 4. No requirement without a task.
- Ordering rationale: Task 0 lands the matcher and the list, each test-first (matcher Steps 1-2; list + re-export Steps 3-5); Task 1's test-then-wire cycle lives inside one task so no commit ever contains a failing suite, and its red state isolates the wiring defect specifically.
- Anti-tautology: §4b evaluates real config arrays (the round-2/3 finding); §4b0-ii asserts `"parallel"` specifically, which is exactly what an unspread list fails; §4c asserts the list against the live tree and the real config constants rather than restating it.
- Known risk carried forward: the local DB's degraded state makes the full-suite gate noisy — Task 2 Step 4 prescribes the reseed + A/B protocol that P2 used rather than assuming green.
