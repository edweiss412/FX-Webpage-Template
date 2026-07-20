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

### Task 0: Generate the list from a committed script (pure core test-first; shell holds no logic)

**Structure (restructured after 4 review rounds on test seams — the fix is architectural, not more prose).** Every decision the tool makes lives in a PURE, in-process-testable core. The `.mjs` entry point is a logic-free adapter: it reads `process.argv`, calls core functions, performs I/O (spawn, read, write, print), and exits with the code the core returns. Because the shell branches on nothing, it needs no cross-process fixture protocol, no injectable-runner seam, and no timing proxies — the seams the previous rounds kept asking me to invent are deleted rather than specified.

**Files:**
- Create (new, not yet tracked): serialAudit.ts under lib/test/ — the pure core
- Create (new, not yet tracked): serialAudit.test.ts under tests/cross-cutting/ — its failing-first unit test
- Create (new, not yet tracked): audit-serial-files.mjs under scripts/ — the logic-free adapter
- Create (new, not yet tracked): vitest.parallel-extra-files.ts at the repo root — the generated list

**Core API (exact, so the test and the adapter agree):**

```ts
export function globToRegExp(glob: string): RegExp;
export function deriveCandidatePopulation(
  allFiles: readonly string[],
  cfg: { baseInclude: readonly string[]; defaultExcludes: readonly string[]; nightly: readonly string[]; envBound: readonly string[]; parallelEntries: readonly string[] },
): string[];
export function intersectGreenAcrossRepeats(repeats: readonly (readonly string[])[]): string[];
export function checkCommittedList(
  committed: readonly string[],
  population: readonly string[],
  existsOnDisk: (p: string) => boolean,
): { ok: boolean; notInPopulation: string[]; unsorted: boolean; duplicates: string[]; missing: string[] };
export function parseArgs(argv: readonly string[]): { mode: "measure" | "check"; repeats: number } | { error: string };
export function buildScratchConfig(files: readonly string[], rootDir: string): string; // returns config SOURCE text
export const CLOSED_PORT_ENV: Readonly<Record<string, string>>; // the four closed-port vars
```

- [ ] **Step 1: Write the failing unit test** at serialAudit.test.ts under tests/cross-cutting/, covering every core behavior with deterministic synthetic inputs (no live tree, no child processes):
  - `globToRegExp`: the full 15-case matrix — terminal `/**` matching nested descendants (`**/node_modules/**` vs a nested path, and NOT an ordinary test path), `**/.git/**`, `tests/x/**/*.test.{ts,tsx}` (nested and flat, plus a wrong-dir negative), an exact file (match + negative), `**/tests/.../x.test.ts`, and a ts-versus-tsx extension negative (a tsx-only glob must not match a ts file).
  - `deriveCandidatePopulation`: subtracts defaults, nightly, env-bound, AND both a dir-glob entry and an EXACT-FILE entry of `parallelEntries` (the round-3 spec finding).
  - `intersectGreenAcrossRepeats`: returns the sorted intersection; a file green in 2 of 3 repeats is excluded; empty repeats list yields empty.
  - `checkCommittedList`: one assertion each for green, not-in-population, unsorted, duplicate, missing-on-disk (with an injected `existsOnDisk` predicate — a pure function parameter, not a process seam).
  - `parseArgs`: `[]` → measure/3; `["--repeats","5"]` → measure/5; `["--check"]` → check; `["--bogus"]` → `{error}`; `["--repeats","x"]` → `{error}`.
  - `buildScratchConfig`: the returned source contains `fileParallelism: true`, every given file, and no others.
  - `CLOSED_PORT_ENV`: exactly the four documented vars, all pointing at port 9.
  Run → FAIL (module absent).
- [ ] **Step 2: Write the pure core** at serialAudit.ts under lib/test/ until Step 1 is green. Re-run → PASS. This is where the sentinel `globToRegExp` lives; nothing redefines it.
- [ ] **Step 3: Write the logic-free adapter** at audit-serial-files.mjs under scripts/: `parseArgs(process.argv.slice(2))` → on `{error}` print usage to stderr and `process.exit(2)`; walk the tree, call `deriveCandidatePopulation`; in check mode call `checkCommittedList` against the committed module and exit 0/1 printing offenders; in measure mode write `buildScratchConfig(...)` to a temp path, spawn vitest with `CLOSED_PORT_ENV` once per repeat collecting each run's green files, call `intersectGreenAcrossRepeats`, print the array body, and remove the temp config. No conditionals beyond those calls — anything you are tempted to branch on belongs in the core with a test.
- [ ] **Step 4: Run measure mode for real** (`node scripts/audit-serial-files.mjs --repeats 3`) against the live tree; capture the emitted array and the run summary (candidate count, per-repeat pass counts) for the PR body.
- [ ] **Step 5: Create the new root module vitest.parallel-extra-files.ts** exporting `PARALLEL_EXTRA_FILES` = the emitted array verbatim, with a header stating: what it is, that it is GENERATED (regenerate via the script, never hand-edit), the measurement contract (closed-port + `fileParallelism:true`, 3 clean repeats), and the spec reference. Expected ≈516 entries (spec §2.3); the script's output is authoritative if it differs.
- [ ] **Step 6: Publish the symbol** — add `export { PARALLEL_EXTRA_FILES } from "./vitest.parallel-extra-files";` to `vitest.projects.ts`. Plumbing only: no project's `include`/`exclude` changes here, so membership is unchanged. It lands in THIS task so Task 1's red run resolves the import (a missing export would fail collection instead of the two wiring assertions).
- [ ] **Step 7: Verify** `node scripts/audit-serial-files.mjs --check` exits 0, and `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts` plus the new core test are green (membership genuinely unchanged).
- [ ] **Step 8: Commit.**

```bash
git add lib/test/serialAudit.ts tests/cross-cutting/serialAudit.test.ts scripts/audit-serial-files.mjs vitest.parallel-extra-files.ts vitest.projects.ts
git commit --no-verify -m "infra: serial-audit pure core + adapter + generated PARALLEL_EXTRA_FILES (measured DB-free set)"
```

---

### Task 1: Partition proof + wiring (single red -> green -> commit cycle)

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`
- Modify: `vitest.config.ts`, `vitest.projects.ts` (header note only)

**Interfaces:**
- Consumes: Task 0's `PARALLEL_EXTRA_FILES`; the imported `vitestConfig` projects array.
- Produces: the shipped membership change.

**Prerequisite already satisfied by Task 0 Step 6 (the re-export):** `vitest.projects.ts` re-exports `PARALLEL_EXTRA_FILES` from the generated module (plumbing only, membership unchanged), so this task's red run resolves the import and fails on the two wiring assertions rather than on collection. Do NOT inline or append the array into `PARALLEL_TEST_GLOBS`.

- [ ] **Step 1: Import the matcher.** `import { globToRegExp } from "@/lib/test/serialAudit";` — it is an EXPORTED member of the Task-0 core (see that task's Core API block) and is already covered there by the 15-case matrix. Do not redefine or re-test it here.

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

- [ ] **Step 1:** Push; `gh pr create` titled `infra: CI unit-suite Phase 3 — file-granular serial set (measured DB-free files to parallel)`, body carrying the spike summary, the measure-mode provenance from Task 0 Step 4, and the measurement table.
- [ ] **Step 2:** Watch; `measure <run> <latest attempt>`. Record max_wall + vitest_skew vs P2's baseline (254s / 57s, run 29720857479).
- [ ] **Step 3:** Evaluate in spec order: max_wall < 300s (regression floor — blocks merge if exceeded); vitest_skew ≤ 75s (else P1's reweight branch). Re-enter the loop after any mutation commit.
- [ ] **Step 4:** Record in the PR body; pre-merge guards (clean tree, pushed, `headRefOid` matches, not DIRTY); delta-review any post-APPROVE repair commits.
- [ ] **Step 5:** `gh pr merge <PR#> --merge` in the same turn as CI-green → `cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main` → expect `0	0`. Then the 3-phase program is complete: delete the ship cron and report final program numbers.

---

## Self-review notes

- Spec coverage: §3.1→Task 0 Step 3; §3.2→Task 1 Step 4; §3.3→Task 1 Step 4 header note; §3.4→Task 0 Steps 1-4 (pure core test-first, logic-free adapter, then the real measurement run); §3.5→Task 1 (§4c); §4a-g→Task 1 Step 2; §5→Task 4. No requirement without a task.
- Ordering rationale: the script precedes the list (regeneration is the contract, not the artifact); the test-then-wire cycle lives INSIDE Task 1 so no commit ever contains a failing suite, and Task 1 Step 3's red state still isolates the wiring defect specifically.
- Anti-tautology: §4b evaluates real config arrays (the round-2/3 finding); §4b0-ii asserts `"parallel"` specifically, which is exactly what an unspread list fails; §4g runs the real script rather than asserting its existence.
- Known risk carried forward: the local DB's degraded state makes the full-suite gate noisy — Task 2 Step 4 prescribes the reseed + A/B protocol that P2 used rather than assuming green.
