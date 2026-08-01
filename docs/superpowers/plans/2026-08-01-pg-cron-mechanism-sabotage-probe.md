# pg-cron Mechanism-Sabotage Probes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deletion of the pg-cron suite's query-count mechanism (per-case attribution wiring + aggregate afterAll backstop) impossible to land silently, by adding two execute-the-suite probes to `tests/cross-cutting/pgCronCiVacuity.test.ts`.

**Architecture:** Each probe writes a transient mutant copy of `tests/cross-cutting/pg-cron-coverage.test.ts` (inert live case injected; probe B additionally strips the observe argument), runs it in a child vitest with the same env posture as the existing probe 3, and asserts the child FAILS with the mechanism's specific message. Anchor-validation refuses to cover a refactored suite.

**Tech Stack:** vitest (serial project), node:fs / node:child_process, existing `runSuite` helper.

**Spec:** `docs/superpowers/specs/ci/2026-08-01-pg-cron-mechanism-sabotage-probe-design.md` — adversarially reviewed, R1 NEEDS-ATTENTION (runSuite file-param contradiction, repaired), R2 APPROVE (codex session 019fbf0e…, then R2 run 2026-08-01).

## Global Constraints

- Worktree `/Users/ericweiss/FX-worktrees/pg-cron-mechanism-probe`, branch `test/pg-cron-mechanism-sabotage-probe` (invariant 11; already created, env linked, preflight green).
- Local Supabase must be reachable (127.0.0.1:54322) for every probe run; on any DB-backed failure re-run the file ISOLATED before judging (shared local instance, sibling-contention class).
- Conventional commit per task (invariant 6).
- Do NOT modify: `tests/cross-cutting/pg-cron-coverage.test.ts` (except transient TDD mutations, always restored), `tests/cross-cutting/_liveCaseCounter.ts`, `tests/cross-cutting/liveCaseCounter.test.ts`, workflows, vitest config (spec §5.4).
- Mutation-family closure set = spec §3 matrix; a NEW family needs a live escaping mutant against the shipped set (writing-plans rule).
- Meta-test inventory: none of the candidate registries applies (no auth/DB-write/admin-alert/tile surface). The one registry touched is `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (Task 3, ONE row — the only edit to that orchestrator-owned file).
- No new test file ships (the mutant is transient inside try/finally), so no testMatch/workflow wiring changes; the extended file already runs in serial / `unit-suite-db`.

## Pre-draft verification (run 2026-08-01, tree `0fb6f9efb`)

- Anchors unique in the suite: describe anchor 1×, observe anchor 1×, `"INERT MECHANISM PROBE"` 0× anywhere.
- `runSuite(` 4× in the guard file (1 definition + 3 call sites).
- Serial project `fileParallelism: false` (`vitest.config.ts`); `tests/cross-cutting` not in `PARALLEL_TEST_GLOBS`; serial/parallel phases sequential — transient mutant cannot race a tree walker.
- Escape/catch matrix measured live: MF-1/MF-2/MF-4 escape all 9 guard cases; MF-3 caught by existing probe 3 (spec §1 table).

---

### Task 1: `runSuite` file param + `writeMutant` + probe A (per-case attribution wired)

**Files:**
- Modify: `tests/cross-cutting/pgCronCiVacuity.test.ts` (imports, `runSuite` signature, new constants + helper + describe block with probe A)

**Interfaces:**
- Produces: `runSuite(env, file = SUITE)` (Task 2 reuses); `writeMutant(edits: Array<{ anchor: string; replaceWith: string }>): void`; constants `DESCRIBE_ANCHOR`, `INERT_CASE`, `OBSERVE_ANCHOR`, `MUTANT_REL`, `MUTANT_ABS`.

- [ ] **Step 1: Edit the guard file.** Imports at top (`execFileSync` import already exists):

```ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
```

Change the `runSuite` signature and arg list (three existing call sites unchanged):

```ts
/** Runs a suite file in a child vitest, returning its exit status and output. */
function runSuite(env: Record<string, string | undefined>, file: string = SUITE): Run {
  try {
    const output = execFileSync(
      "pnpm",
      ["exec", "vitest", "run", "--project=serial", "--reporter=verbose", file],
```

Append after the existing describe block:

```ts
// ── Mechanism-sabotage probes ──────────────────────────────────────────────
// Spec: docs/superpowers/specs/ci/2026-08-01-pg-cron-mechanism-sabotage-probe-design.md
//
// The three probes above prove the suite cannot pass VACUOUSLY, but none of
// them protects the query-count mechanism itself: deleting `queryCount`, its
// psql() increment, the observe argument, and the afterAll aggregate branch
// left all nine guard cases green (measured 2026-08-01 — the exact state of
// commit 1c1ae148e). The wrapper's observe parameter is OPTIONAL, so the
// wiring can vanish without a type error. These probes inject an inert live
// case into a transient mutant copy of the suite and assert the mechanism
// notices — by the per-case message (probe A) and, with attribution stripped,
// by the aggregate afterAll message (probe B).

const DESCRIBE_ANCHOR = 'describe("M12.1: pg-cron-coverage (live-DB introspection)", () => {';
const INERT_CASE = 'liveCase("INERT MECHANISM PROBE", () => {});';
const OBSERVE_ANCHOR = "makeLiveCaseCounter(liveDbTest, () => queryCount)";
const MUTANT_REL = "tests/cross-cutting/pg-cron-coverage.mechanism-probe-mutant.test.ts";
const MUTANT_ABS = join(ROOT, MUTANT_REL);

/**
 * Writes a mutant copy of the suite with each edit applied. Every anchor must
 * occur EXACTLY once, and all anchors are validated before the file is
 * written — an anchor miss throws (refuse-to-cover) and leaves no stray file.
 * The mutant lives in the SAME directory so `./_liveCaseCounter` and the `@/`
 * aliases resolve, and keeps a ".test.ts" suffix because vitest treats CLI
 * file args as filters against the project include globs.
 */
function writeMutant(edits: Array<{ anchor: string; replaceWith: string }>): void {
  let source = readFileSync(join(ROOT, SUITE), "utf8");
  for (const { anchor, replaceWith } of edits) {
    const occurrences = source.split(anchor).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `mechanism probe: anchor ${JSON.stringify(anchor)} occurs ${occurrences}x in ${SUITE} — ` +
          "suite refactored; update the probe anchors.",
      );
    }
    source = source.replace(anchor, replaceWith);
  }
  writeFileSync(MUTANT_ABS, source);
}

describe("query-count mechanism cannot be deleted silently", () => {
  it("per-case attribution is wired: an injected inert live case reds the suite BY NAME", () => {
    writeMutant([{ anchor: DESCRIBE_ANCHOR, replaceWith: `${DESCRIBE_ANCHOR}\n  ${INERT_CASE}` }]);
    try {
      const run = runSuite({ CI: "true", PG_CRON_COVERAGE_TARGET: "local" }, MUTANT_REL);
      expect(run.status, "an inert live case must red the suite").not.toBe(0);
      // BY NAME: under observe-arg deletion (MF-2) the child still reds via the
      // aggregate branch, but with the aggregate message — this match is what
      // makes silent attribution regression detectable.
      expect(run.output).toMatch(/live case "INERT MECHANISM PROBE" issued NO database query/);
    } finally {
      unlinkSync(MUTANT_ABS);
    }
  }, 300_000);
});
```

- [ ] **Step 2: Typecheck + healthy-tree GREEN.**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: tsc clean; 4 probes pass.

- [ ] **Step 3: RED under MF-1** (this is the failing-test demonstration — spec §1.1 ratifies mutant red/green as the TDD cycle for guard work). Apply MF-1 to the suite: delete the `let queryCount = 0;` line, the `queryCount += 1;` line, change the observe call to `makeLiveCaseCounter(liveDbTest)`, and delete the 6-line `if (isCi && queryCount < liveCaseCount()) { … }` block in `afterAll` (keep the closing `});`).

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: probe A FAILS with "an inert live case must red the suite" (child exited 0).

Restore: `git checkout -- tests/cross-cutting/pg-cron-coverage.test.ts`

- [ ] **Step 4: RED under MF-2.** Apply only the observe-arg drop:

```bash
perl -0pi -e 's/makeLiveCaseCounter\(liveDbTest, \(\) => queryCount\)/makeLiveCaseCounter(liveDbTest)/' tests/cross-cutting/pg-cron-coverage.test.ts
```

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: probe A FAILS — the child reds via the AGGREGATE message, so the named-message `toMatch` misses.

Restore: `git checkout -- tests/cross-cutting/pg-cron-coverage.test.ts`; verify `git status --porcelain` shows ONLY ` M tests/cross-cutting/pgCronCiVacuity.test.ts` (the in-progress task edit — it is uncommitted until Step 5) and NO `pg-cron-coverage.test.ts` line.

- [ ] **Step 5: Re-run healthy GREEN, commit.**

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: PASS — 4 probes (3 existing + probe A) green on the restored tree.

The two `[observed: …]` lines are runtime-evidence slots: replace each with the actual assertion-failure line from the corresponding red run's output.

```bash
git add tests/cross-cutting/pgCronCiVacuity.test.ts
git commit -F- <<'EOF'
test(ci): probe that per-case query attribution is wired in the pg-cron suite

Red demonstrations against the live suite:
MF-1 (mechanism deleted): [observed: probe A failure line]
MF-2 (observe arg dropped): [observed: probe A failure line]
Healthy tree: all 4 guard probes green.
EOF
```

### Task 2: Probe B (aggregate afterAll backstop)

**Files:**
- Modify: `tests/cross-cutting/pgCronCiVacuity.test.ts` (one more `it` in the Task-1 describe)

**Interfaces:**
- Consumes: `writeMutant`, `runSuite(env, file)`, constants from Task 1.

- [ ] **Step 1: Add probe B** inside `describe("query-count mechanism cannot be deleted silently", …)`:

```ts
  it("the aggregate afterAll branch backstops when attribution is absent", () => {
    writeMutant([
      { anchor: DESCRIBE_ANCHOR, replaceWith: `${DESCRIBE_ANCHOR}\n  ${INERT_CASE}` },
      { anchor: OBSERVE_ANCHOR, replaceWith: "makeLiveCaseCounter(liveDbTest)" },
    ]);
    try {
      const run = runSuite({ CI: "true", PG_CRON_COVERAGE_TARGET: "local" }, MUTANT_REL);
      expect(run.status, "an uncounted-inert-case run must red the suite").not.toBe(0);
      // Seven counted cases, six queries: only the aggregate branch notices.
      expect(run.output).toMatch(/live cases ran but only \d+ database queries were issued/);
    } finally {
      unlinkSync(MUTANT_ABS);
    }
  }, 300_000);
```

- [ ] **Step 2: Typecheck + healthy GREEN.**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: 5 probes pass.

- [ ] **Step 3: RED under MF-4.** Delete only the 6-line aggregate `if` block from the suite's `afterAll` (keep `});`).

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: probe B FAILS with "an uncounted-inert-case run must red the suite" (child exited 0). Probe A still GREEN (attribution intact — per spec §3 this is probe B's family).

Restore: `git checkout -- tests/cross-cutting/pg-cron-coverage.test.ts`

- [ ] **Step 4: RED under MF-1** (anchor miss). Apply the full MF-1 mutation to `tests/cross-cutting/pg-cron-coverage.test.ts`: delete the `let queryCount = 0;` line, delete the `queryCount += 1;` line inside `psql()`, change `makeLiveCaseCounter(liveDbTest, () => queryCount)` to `makeLiveCaseCounter(liveDbTest)`, and delete the 6-line `if (isCi && queryCount < liveCaseCount()) { … }` block in `afterAll` (keep the closing `});`).

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: probe B FAILS with the `writeMutant` refuse-to-cover throw ("suite refactored; update the probe anchors" naming `OBSERVE_ANCHOR`); probe A also FAILS (child exits 0). No stray mutant file (`ls tests/cross-cutting/pg-cron-coverage.mechanism-probe-mutant.test.ts` → not found).

Restore: `git checkout -- tests/cross-cutting/pg-cron-coverage.test.ts`; `git status --porcelain` shows ONLY ` M tests/cross-cutting/pgCronCiVacuity.test.ts` and NO `pg-cron-coverage.test.ts` line.

- [ ] **Step 4b: RED under MF-2** (anchor miss — completes the spec §5.2 matrix cell MF-2 × probe B). Apply only the observe-arg drop:

```bash
perl -0pi -e 's/makeLiveCaseCounter\(liveDbTest, \(\) => queryCount\)/makeLiveCaseCounter(liveDbTest)/' tests/cross-cutting/pg-cron-coverage.test.ts
```

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: probe B FAILS via the refuse-to-cover throw (`OBSERVE_ANCHOR` occurs 0x); probe A also FAILS (aggregate message, named match misses — same as Task 1 Step 4).

Restore: `git checkout -- tests/cross-cutting/pg-cron-coverage.test.ts`; `git status --porcelain` shows ONLY ` M tests/cross-cutting/pgCronCiVacuity.test.ts` and NO `pg-cron-coverage.test.ts` line.

- [ ] **Step 5: Healthy GREEN re-run, commit.**

Run: `pnpm exec vitest run tests/cross-cutting/pgCronCiVacuity.test.ts`
Expected: PASS — all 5 probes (3 existing + A + B) green on the restored tree.

The commit body records the COMPLETED closure matrix; the `[observed: …]` entries are runtime-evidence slots — replace each with the actual failure line from that red run.

```bash
git add tests/cross-cutting/pgCronCiVacuity.test.ts
git commit -F- <<'EOF'
test(ci): probe that the aggregate query-count backstop survives attribution loss

Closure matrix (spec §3/§5.2), each cell demonstrated live:
MF-1 -> probe A red: [observed] ; probe B red (anchor miss): [observed]
MF-2 -> probe A red (aggregate msg): [observed] ; probe B red (anchor miss): [observed]
MF-4 -> probe B red: [observed]
MF-3 -> existing probe 3 (measured at spec time, every case throws by name)
Healthy tree: all 5 guard probes green.
EOF
```

### Task 3: BACKLOG graduation + registry row

**Files:**
- Modify: `BACKLOG.md` (remove the BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION entry)
- Modify: `BACKLOG-archive.md` (add resolved entry, house style)
- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts` (ONE `BACKLOG_GRADUATED` row)

- [ ] **Step 1: Failing test FIRST — registry row before the move.** In `tests/docs/_metaDeferralLedgerGraduation.test.ts`, add at the top of `BACKLOG_GRADUATED`:

```ts
  // test/pg-cron-mechanism-sabotage-probe (2026-08-01): mechanism-sabotage
  // probes for the pg-cron vacuity guard — an inert-case mutant must red the
  // suite by name (attribution) and via the aggregate branch (backstop).
  { id: "BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION", provenance: "test/pg-cron-mechanism-sabotage-probe" },
```

Run: `pnpm exec vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: FAIL — "every graduated id is archive-only" reds with `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION missing from BACKLOG-archive.md` (and the id still present in BACKLOG.md).

- [ ] **Step 2: Move the entry + fix the section preamble.** Cut the whole `### BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION …` section from `BACKLOG.md` (it runs from that heading to just before `### BL-CI-STALE-BRANCH-PROTECTION-COMMENT`). In the SAME file, the "Descoped from the CI-dark coverage cluster" preamble ends "…the two below remain open." — with this graduation only ONE remains. Replace that clause (layering house style, keep the existing shipped-item chain) with:

```markdown
followed by `BL-CI-VITEST-EXCLUSION-COVERAGE` on `feat/ci-dark-vitest-exclusion` (2026-07-31, PR-B: the runner-as-oracle registry) and `BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION` on `test/pg-cron-mechanism-sabotage-probe` (2026-08-01, mechanism-sabotage probes); the one below remains open.
```

In `BACKLOG-archive.md`, insert after the ledger preamble (before the first existing `##` entry):

```markdown
## BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION — ✅ RESOLVED (2026-08-01, `test/pg-cron-mechanism-sabotage-probe`)

**Resolution:** the remaining sound direction from the entry — a probe that sabotages the query-count mechanism and asserts the guard notices — shipped as two execute-the-suite probes in `tests/cross-cutting/pgCronCiVacuity.test.ts`: an injected inert live case must red the mutant suite BY NAME (per-case attribution wired), and with the observe argument stripped it must red via the aggregate afterAll message (backstop present). Mutation-family closure measured live: MF-1 whole-mechanism deletion (the `1c1ae148e` state), MF-2 observe-arg drop, and MF-4 aggregate-branch deletion all escaped every prior guard and are now each caught; MF-3 increment-drop was already caught by the existing reachable-DB probe. The meaningfulness proxy stays fenced OFF (a `psql("SELECT 1")` body still passes — reviewer territory by four-round ratification). Spec: `docs/superpowers/specs/ci/2026-08-01-pg-cron-mechanism-sabotage-probe-design.md`. Original entry below.

### BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION — the vacuity guard counts queries in aggregate, not per case

**Status:** OPEN · **Severity:** LOW (guard completeness; no live defect) · **Class:** CI coverage integrity · **Filed:** 2026-07-26 (PR3 of the CI-dark cluster, adversarial R4)

**Do not re-derive this analysis.** Four adversarial rounds converged here; measurements below.

`tests/cross-cutting/pg-cron-coverage.test.ts` refuses a CI run where fewer live queries were issued than live cases ran. That closes the MEASURED defect — the suite previously reported exit 0 with "2 passed | 6 skipped", asserting nothing — and it catches an emptied case body (verified: emptying one body while keeping its name yields "6 live cases ran but only 5 database queries were issued").

**Per-case attribution SHIPPED in the same round.** The counter is snapshotted around each case, and a case issuing no query throws by name. Verified against R4's exact reproduction — six queries in one case with the next one empty now reds, naming the empty case — so the first of its two reproductions is closed.

**The gap that remains:** replacing every body with `psql("SELECT 1")` satisfies attribution while asserting nothing about pg_cron.

**Why THAT is not patched:** each round defeated the next proxy — source patterns (rewrite the predicate), case names (keep names, empty bodies), aggregate queries (front-load one case). Proving assertions are _meaningful_ is equivalent to reviewing them, which is a reviewer's job, not a meta-guard's. A fifth proxy would be the same shape.

**Also open (same round):** the executable vacuity guard does not protect the query-count mechanism itself — deleting `queryCount` and its `afterAll` branch leaves all three probe cases green. Exactly demonstrated by commit `1c1ae148e`, which had the executable guard without query counting and was green.

**If picked up:** the remaining sound direction is a probe that sabotages the mechanism and asserts the guard notices — the per-case attribution half is done, and its delta enforcement is covered behaviourally by `tests/cross-cutting/liveCaseCounter.test.ts`.
```

(The `### …` block above is the original entry, embedded verbatim; the heading demotes from `###` to stay under the new `##` archive heading, matching the archive's nested-provenance house style.)

- [ ] **Step 3: Verify GREEN + commit.**

Run: `pnpm exec vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: PASS (the Step-1 red flips green: id archive-only, provenance named in the section).

```bash
git add BACKLOG.md BACKLOG-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit -m "docs: graduate BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION to the archive"
```

### Task 4: Gates + ship

- [ ] **Step 1: Full gates.** `pnpm exec tsc --noEmit` · `pnpm exec eslint tests/cross-cutting/pgCronCiVacuity.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` · `pnpm format:check` (prettier-fix + amend if needed) · FULL `pnpm test` (isolated re-run before judging any DB-backed failure).
- [ ] **Step 2: Whole-diff Codex review** via codex-guard (REVIEWER ONLY + verdict line; scope = the four changed files; finding-admissibility contract; iterate to APPROVE).
- [ ] **Step 3: Ship.** Push; `gh pr create`; real CI green; `gh pr merge --merge`; ff-sync the main checkout (`git pull --ff-only`, verify `git rev-list --left-right --count main...origin/main` = `0  0`); CronDelete the nudge; clear pane label; mark ship-state `done`.
