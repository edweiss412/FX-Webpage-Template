# CI unit-suite Phase 2 — serial-set audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 12 protocol-verified DB-free directories (179 files) from the serial vitest project to the parallel project, with the partition meta-test redesigned to three-way membership.

**Architecture:** Config-only + one meta-test redesign. `PARALLEL_TEST_GLOBS` is the single source of truth (parallel include + serial exclude both derive from it); the parallel project gains the nightly exclusion; the partition meta-test gains `projectOf` three-way membership.

**Tech Stack:** vitest 4.1.5 projects, TypeScript strict.

**Spec:** `docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-phase2-serial-audit.md` (APPROVED, 4 adversarial rounds). Section refs below are to that spec.

## Plan pipeline checklist

- [x] Pre-draft code-verification pass (partition test read IN FULL this session: config-entries block :55-103, walker :110-119, mustBeSerial :121-135, mustBeParallel/env-bound :136-175, serialExcludeFor :176-200, harness :202-226; `vitest.config.ts` parallel project :86-92 include-only; `vitest.projects.ts` globs :50-72)
- [x] Snippet typecheck (transcript in self-review notes)
- [x] Self-review
- [ ] Adversarial review (cross-model) — Codex, to APPROVE, before execution
- [ ] Execution (Tasks 1–4; whole-diff review BEFORE push)

## Global Constraints

- Commit per task, conventional-commits, `--no-verify`.
- Serial project keeps `fileParallelism: false`; parallel keeps `true`; two-phase ordering untouched (spec §1.1).
- No workflow changes (8-leg matrix ships as-is from P1).
- Worktree `/Users/ericweiss/FX-worktrees/ci-unit-suite-phase2` (branch `chore/ci-unit-suite-phase2-serial-audit`).

## Meta-test inventory

EXTENDS + partially redesigns `tests/cross-cutting/vitest-projects-partition.test.ts` (spec §3.4/§4). All other meta-tests (balance, topology, P1 pins) unchanged and must stay green. CREATES none.

---

### Task 1: Partition meta-test redesign (failing first) + membership flip

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`
- Modify: `vitest.projects.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts:48`), existing `matchesParallel` (`vitest-projects-partition.test.ts:44-50`), `nightlyExcludes` const (`vitest.config.ts:27`).
- Produces: `projectOf(file)` (test-internal), 12 new glob literals later tasks and CI rely on.

- [ ] **Step 1: Edit the partition meta-test.** All of the following:

(a) After the `matchesParallel` function (line 50), add the three-way membership helper:

```ts
// Three-way membership — mirrors vitest.config.ts's DEFAULT-discovery
// construction (VITEST_EXCLUDE_ENV_BOUND unset — what local `pnpm test`
// sees; the env-bound CI mode is pinned separately by the serialExcludeFor
// block below). Nightly mutation-harness files live in NO default project.
// NIGHTLY_ONLY_EXCLUDES is `**/`-prefixed with an embedded `*`, which the
// prefix matcher above cannot express — convert to anchored regexes (same
// helper as vitest-shard-balance.test.ts).
function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${esc}$`);
}
const nightlyRes = NIGHTLY_ONLY_EXCLUDES.map(globToRegExp);
function projectOf(file: string): "parallel" | "serial" | "none" {
  if (nightlyRes.some((r) => r.test(file))) return "none";
  return matchesParallel(file) ? "parallel" : "serial";
}
```

(b) Replace the exactly-one-project walker test (lines 110–119) with:

```ts
  it("every non-nightly test file is claimed by EXACTLY ONE default project (nightly files by NONE)", () => {
    // By construction (DEFAULT discovery mode): parallel iff a parallel glob
    // matches and the file is not nightly-excluded; serial otherwise; the 9
    // nightly mutation-harness files live in NO default project (their opt-in
    // mutation-project membership is pinned by the env-gated test above).
    const parallelFiles = allTestFiles.filter((f) => projectOf(f) === "parallel");
    const serialFiles = allTestFiles.filter((f) => projectOf(f) === "serial");
    const noneFiles = allTestFiles.filter((f) => projectOf(f) === "none");
    expect(parallelFiles.length + serialFiles.length + noneFiles.length).toBe(allTestFiles.length);
    expect(noneFiles.length, "exactly the 9 nightly harness files live in no default project").toBe(
      9,
    );
    expect(parallelFiles.length, "parallel project must be non-empty").toBeGreaterThan(200);
    expect(serialFiles.length, "serial project must be non-empty").toBeGreaterThan(100);
  });
```

(c) In `mustBeSerial` (lines 121–135): DELETE the line `"tests/parser/parseSheet.test.ts", // a fixture-corpus reader` (deliberate contract change, spec §3.4 — corpus READERS move to parallel; the WRITER `tests/sync/dev-routing.test.ts` and all other rows stay). In the loop that asserts over `mustBeSerial` (the `for (const f of files)` body ending `matchesParallel(f) … toBe(false)`), replace the assertion with:

```ts
        expect(projectOf(f), `${f} must be in the SERIAL project (DB/FS shared state)`).toBe(
          "serial",
        );
```

(d) In the harness test (lines 202–210), replace the per-file assertion with:

```ts
      expect(projectOf(f), `${f} must live in NO default project`).toBe("none");
```

(e) Append two new tests inside the top-level describe:

```ts
  it("Phase-2 verified dirs are in PARALLEL_TEST_GLOBS (exact glob literals)", () => {
    // Protocol-verified 2026-07-19 (spec §2.2: closed-port DB + fileParallelism,
    // 178 passed / 2,745 tests). Bare dir strings can't satisfy the prefix
    // matcher — pin the literal globs.
    const PHASE2_VERIFIED_PARALLEL_DIRS = [
      "parser",
      "drive",
      "cron",
      "dataQuality",
      "appSettings",
      "geocoding",
      "design",
      "dates",
      "showLifecycle",
      "invariants",
      "github",
      "venue",
    ];
    for (const d of PHASE2_VERIFIED_PARALLEL_DIRS) {
      expect(
        PARALLEL_TEST_GLOBS,
        `tests/${d} was protocol-verified DB-free (spec 2026-07-19 §2.2)`,
      ).toContain(`tests/${d}/**/*.test.{ts,tsx}`);
    }
  });

  it("parallel project excludes the nightly harness globs (else ~102k mutants join every PR leg)", () => {
    const parallel = projects.find((p) => p.test.name === "parallel")!.test;
    for (const g of NIGHTLY_ONLY_EXCLUDES) {
      expect(parallel.exclude ?? [], `parallel.exclude must contain ${g}`).toContain(g);
    }
  });
```

(f) Prose surfaces (all four, spec §3.4): file header (:14-19) and walker title/comment — covered by (b); single-source note (:21-23) → "a file is parallel iff it matches a parallel glob and is not nightly-excluded; nightly files live in no default project; serial otherwise." (The `vitest.projects.ts:16-19` header is updated in Step 3.)

- [ ] **Step 2: Run — expect EXACTLY two failures** (the Phase-2 glob-literal anchor and the parallel-exclude pin; everything else, including the reworked walker at the CURRENT membership, passes).

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL — 2 tests; the rest pass.

- [ ] **Step 3: Implement the membership flip.**

`vitest.projects.ts`: append to `PARALLEL_TEST_GLOBS` (before the `"tests/sample.test.ts"` entry):

```ts
  // Phase 2 (spec 2026-07-19-ci-unit-suite-phase2-serial-audit §2): verified
  // via the same closed-port + fileParallelism protocol on 2026-07-19
  // (178 files / 2,745 tests green). tests/parser are fixture-corpus READERS —
  // safe in the parallel phase because the corpus WRITER
  // (tests/sync/dev-routing.test.ts) stays serial and the two phases never
  // overlap. The nightly mutationHarness.* files match tests/parser/** but are
  // excluded from BOTH default projects (see vitest.config.ts).
  "tests/parser/**/*.test.{ts,tsx}",
  "tests/drive/**/*.test.{ts,tsx}",
  "tests/cron/**/*.test.{ts,tsx}",
  "tests/dataQuality/**/*.test.{ts,tsx}",
  "tests/appSettings/**/*.test.{ts,tsx}",
  "tests/geocoding/**/*.test.{ts,tsx}",
  "tests/design/**/*.test.{ts,tsx}",
  "tests/dates/**/*.test.{ts,tsx}",
  "tests/showLifecycle/**/*.test.{ts,tsx}",
  "tests/invariants/**/*.test.{ts,tsx}",
  "tests/github/**/*.test.{ts,tsx}",
  "tests/venue/**/*.test.{ts,tsx}",
```

Header comment (lines 6–19): update the serial-dir example list (drop `tests/parser` from the serial examples; it now reads e.g. "the local Supabase DB (tests/db, tests/admin, tests/api, tests/sync, tests/onboarding, …)"), and update the "pins the invariant that every test file lands in exactly one project" sentence to the three-way rule ("…every non-nightly test file lands in exactly one default project; the nightly mutation-harness files land in none").

`vitest.config.ts`: parallel project (lines 86–92) gains the nightly exclusion:

```ts
      {
        extends: true,
        test: {
          name: "parallel",
          include: PARALLEL_TEST_GLOBS,
          // tests/parser/** became a parallel glob in Phase 2, which would
          // otherwise sweep the nightly mutationHarness shards (~102k mutants)
          // into every unit-suite leg — they live ONLY in the env-gated
          // mutation project below.
          exclude: [...configDefaults.exclude, ...nightlyExcludes],
          fileParallelism: true,
        },
      },
```

Also `vitest.config.ts:42`: reword `~300` count-neutrally: "…and a PARALLEL project for the verified DB-free files (see vitest.projects.ts)."

- [ ] **Step 4: Run — verify green across the partition + balance + topology meta-tests.**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/vitest-projects-partition.test.ts vitest.projects.ts vitest.config.ts
git commit --no-verify -m "infra: move 12 protocol-verified DB-free dirs to the parallel vitest project (partition meta-test three-way redesign first)"
```

---

### Task 2: Verification gates

**Files:** none (fix-forward commits only if needed).

- [ ] **Step 1:** `pnpm exec tsc --noEmit` — clean.
- [ ] **Step 2:** `pnpm exec eslint tests/cross-cutting/vitest-projects-partition.test.ts vitest.projects.ts vitest.config.ts` — clean.
- [ ] **Step 3:** `pnpm exec prettier --check tests/cross-cutting/vitest-projects-partition.test.ts vitest.projects.ts vitest.config.ts docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-phase2-serial-audit.md docs/superpowers/plans/2026-07-19-ci-unit-suite-phase2-serial-audit/00-plan.md` — clean; if not, `--write` + separate `style(infra)` commit.
- [ ] **Step 4:** Full suite `pnpm test` (plain `vitest run`, both phases with the flipped membership, env-bound files included locally; budget ~15–20 min) — green. Watch that the parallel phase now includes parser files and the serial phase no longer does (visible in the reporter's project tags).
- [ ] **Step 5:** Fixes (if any) are their own `fix(infra)`/`style(infra)` commits.

---

### Task 3: Whole-diff cross-model review (BEFORE push)

- [ ] **Step 1:** Dispatch via `node scripts/codex-guard.mjs review` — fresh-eyes, REVIEWER ONLY, do-not-relitigate = spec §1.1 + spec-review history. Iterate to APPROVE.
- [ ] **Step 2:** Repairs follow the originating task's TDD shape; one commit per finding class.
- [ ] **Step 3:** Only on APPROVE proceed to Task 4.

---

### Task 4: PR + accept criteria (spec §5, real CI)

**Files:** conditional — `lib/test/vitest.weights.ts` + balance test `MEASURED_HEAVY` (only on the reweight branch).

Reuse P1's `measure()` helper verbatim (P1 plan `docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md`, "Measurement helper") with `LEGS=8`, and its MEASURE-LOOP discipline: every mutation commit → push → watch → measure latest attempt → evaluate.

- [ ] **Step 1:** Push; `gh pr create` titled `infra: CI unit-suite Phase 2 — move 12 verified DB-free dirs (179 files) to the parallel project` with spec/plan links + a measurement table template.
- [ ] **Step 2:** `gh pr checks <PR#> --watch`; resolve run id; `measure <run> 1`. Record max_wall + vitest_skew vs the P1 baseline (263s / 52s, run 29716763290).
- [ ] **Step 3:** Evaluate: (a) regression floor — max_wall must be <300s, else BLOCK and investigate before any merge; (b) skew ≤75s — if exceeded, the P1 reweight branch applies (extract outlier per-file times from that leg's log; update `MEASURED_HEAVY` + `FILE_WEIGHTS` test-first; commit `test(infra): reweight <file> …`; push; re-measure; repeat until ≤75).
- [ ] **Step 4:** Record measurements in the PR body. Pre-merge guards: clean tree, `git push` no-op, `headRefOid` == local HEAD, `mergeStateStatus` not DIRTY. If repair commits landed post-APPROVE, delta-review them to APPROVE.
- [ ] **Step 5:** `gh pr merge <PR#> --merge` in the same turn as CI-green confirmation → `cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main` → expect `0	0`.

---

## Self-review notes

- Spec coverage: §3.1→Task 1 Step 3; §3.2→Step 3 prose; §3.3→Step 3 config + Step 1(e) pin; §3.4→Step 1(a-d,f); §3.5→Step 1(e); §3.6→no-op (asserted green in Task 1 Step 4); §3.7→Step 3; §5→Task 4. No requirement without a task.
- **Snippet typecheck transcript (run 2026-07-19):** Task 1's snippets (globToRegExp/projectOf, walker, both new tests) assembled with real imports into `.claude/snippet-check/partition-snippets.ts` and typechecked via `pnpm exec tsc --noEmit -p .claude/snippet-check/tsconfig.json` (extends repo strict tsconfig): **exit 0**. Harness deleted after.
- TDD honesty: Step 2's two expected failures verified in reasoning — the reworked walker/mustBeSerial/harness assertions all pass against CURRENT membership (nightly→none holds today; parseSheet row deleted, not asserted-parallel), so only the two anchors fail before Step 3.
- Anti-tautology: the glob-literal anchor pins the source list (not derived state); the parallel-exclude pin reads the actual config object (`projects` import), failure mode = "nightly shards silently join PR legs"; the walker's `noneFiles.length === 9` derives from the real tree.
