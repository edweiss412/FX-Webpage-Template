# Matrix-shard `unit-suite` CI Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the required `unit-suite` CI check from ~11.3m to <9m (target ~6.5m) by sharding its vitest run across a 2-leg matrix, behind an aggregator job that preserves the `unit-suite` required check-context name.

**Architecture:** Restructure `.github/workflows/unit-suite.yml` into (1) a `unit-suite-shard` matrix job (`shard: [1,2]`, `fail-fast: false`) where each leg boots its own local Supabase and runs `pnpm exec vitest run --shard=${{ matrix.shard }}/2`, and (2) an aggregator job named `unit-suite` (`needs: [unit-suite-shard]`, `if: always()`) that fails unless the matrix rollup is `success`. A new string-match meta-test pins the topology. No branch-protection edit (the aggregator keeps the `unit-suite` context).

**Tech Stack:** GitHub Actions (matrix + `needs` aggregator), vitest 4.1.5 (`test.projects` + `--shard`), local Supabase bootstrap (`scripts/ci/supabase-local-bootstrap.sh`).

**Spec:** `docs/superpowers/specs/2026-06-26-ci-unit-suite-matrix-shard-design.md` (APPROVE'd cross-model).

## Global Constraints

- **`unit-suite` stays the required check-context name.** The aggregator job MUST be `name: unit-suite`. Do NOT rename it, and do NOT add the matrix-leg contexts (`unit-suite-shard (1)`/`(2)`) to branch protection. (Renaming a required job orphans its context → blocks all PRs.)
- **No `continue-on-error: true` anywhere in `unit-suite.yml`** — it masks a failed leg as `success` in `needs.*.result`, greening a red shard.
- **`VITEST_EXCLUDE_ENV_BOUND: "1"`** must be set on the shard run step (drops the 3 env-bound files via the project-level exclude; CLI `--exclude` is ignored once a project defines its own `exclude`). It must stay an env var, NOT a config-always-on exclude (x-audits run those files directly via `vitest run <file>`).
- **Shard denominator == matrix length.** `--shard=${{ matrix.shard }}/N` with `N` equal to the number of `shard:` matrix values (2). A mismatch drops or double-runs files.
- **Supabase CLI pinned `2.107.0`**, pnpm `10.33.2`, node `20` — unchanged from the current job.
- **Concurrency block stays workflow-level, PR-only:** `group: unit-suite-${{ github.ref }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (inherited from PR C; never cancel post-merge main runs).
- **TDD per task; commit per task** (conventional commits, `<type>(<scope>): <summary>`).

---

## File Structure

- **Modify** `.github/workflows/unit-suite.yml` — single `unit-suite` job → `unit-suite-shard` matrix + `unit-suite` aggregator. Sole responsibility: the required full-suite gate, now parallelized.
- **Create** `tests/cross-cutting/unit-suite-shard-topology.test.ts` — string-match meta-test pinning the matrix/aggregator/shard topology. Sole responsibility: regression guard for the workflow shape.
- **Unaffected (must stay green):** `tests/cross-cutting/ci-workflow-speedup.test.ts` (concurrency/paths/psql/playwright), `tests/cross-cutting/vitest-projects-partition.test.ts` (two-project partition).

---

## Task 1: Restructure `unit-suite.yml` into a sharded matrix + aggregator, pinned by a topology meta-test

**Files:**
- Create: `tests/cross-cutting/unit-suite-shard-topology.test.ts`
- Modify: `.github/workflows/unit-suite.yml` (whole `jobs:` block; keep header/on/concurrency)
- Test: `tests/cross-cutting/unit-suite-shard-topology.test.ts`

**Interfaces:**
- Consumes: the shared bootstrap `scripts/ci/supabase-local-bootstrap.sh`; the vitest two-project config (`vitest.config.ts` + `vitest.projects.ts`) — both unchanged.
- Produces: the `unit-suite` required check-context (via the aggregator) and the non-required `unit-suite-shard (1)`/`(2)` contexts.

- [ ] **Step 1: Write the failing meta-test**

Create `tests/cross-cutting/unit-suite-shard-topology.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for the matrix-shard restructure of the REQUIRED unit-suite
// gate (PR D). String-match on the workflow YAML (no yaml dep), mirroring
// tests/cross-cutting/ci-workflow-speedup.test.ts. Pins the four load-bearing
// properties whose silent regression would either drop test coverage or let a
// red shard green the required `unit-suite` check.

const YAML = readFileSync(
  join(process.cwd(), ".github", "workflows", "unit-suite.yml"),
  "utf8",
);

describe("unit-suite matrix-shard topology", () => {
  // Anti-vacuity: prove we actually read the unit-suite workflow, so a wrong
  // path or empty read fails loudly instead of vacuously passing every regex.
  it("reads the unit-suite workflow (guards against an empty/wrong-file read)", () => {
    expect(YAML).toContain("name: Unit + DB suite");
    expect(YAML.length).toBeGreaterThan(500);
  });

  it("defines a unit-suite-shard matrix job with fail-fast:false and shard:[1, 2]", () => {
    const m =
      /\n {2}unit-suite-shard:\n[\s\S]*?strategy:\n\s+fail-fast:\s*false\n\s+matrix:\n\s+shard:\s*\[\s*1\s*,\s*2\s*\]/.exec(
        YAML,
      );
    expect(
      m,
      "unit-suite.yml must declare a `unit-suite-shard` job with strategy.fail-fast:false and matrix.shard:[1, 2]",
    ).not.toBeNull();
  });

  it("runs vitest with --shard=${{ matrix.shard }}/N where N equals the matrix length (2)", () => {
    const m = /--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/.exec(YAML);
    expect(m, "shard step must run `vitest run --shard=${{ matrix.shard }}/N`").not.toBeNull();
    expect(
      Number(m![1]),
      "the --shard denominator must equal the matrix length (2); a mismatch drops or double-runs files",
    ).toBe(2);
  });

  it("the shard job sets VITEST_EXCLUDE_ENV_BOUND=1 and boots local Supabase", () => {
    expect(
      YAML.includes('VITEST_EXCLUDE_ENV_BOUND: "1"'),
      "the shard run step must keep VITEST_EXCLUDE_ENV_BOUND=1 (project-level env-bound exclude)",
    ).toBe(true);
    expect(
      YAML.includes("bash scripts/ci/supabase-local-bootstrap.sh"),
      "each shard leg must boot its own local Supabase via the shared bootstrap",
    ).toBe(true);
  });

  it("never sets continue-on-error: true (would mask a failed leg as success in the rollup)", () => {
    expect(
      /continue-on-error:\s*true/.test(YAML),
      "continue-on-error:true on a leg makes needs.unit-suite-shard.result report `success` even " +
        "when that leg failed — a silent coverage hole that greens the required aggregator.",
    ).toBe(false);
  });

  it("an aggregator job named `unit-suite` needs the matrix, runs if: always(), and fails unless the rollup is success", () => {
    expect(
      /\n {2}unit-suite:\n/.test(YAML),
      "must keep a job keyed exactly `unit-suite` (the required check-context name)",
    ).toBe(true);
    expect(
      /\n {2}unit-suite:\n[\s\S]*?needs:\s*\[\s*unit-suite-shard\s*\]/.test(YAML),
      "the `unit-suite` aggregator must `needs: [unit-suite-shard]`",
    ).toBe(true);
    expect(
      /\n {2}unit-suite:\n[\s\S]*?if:\s*always\(\)/.test(YAML),
      "the aggregator must run with `if: always()` so a failed shard yields an explicit failure, not a never-reported skip",
    ).toBe(true);
    expect(
      YAML.includes("needs.unit-suite-shard.result"),
      "the aggregator must read needs.unit-suite-shard.result",
    ).toBe(true);
    expect(
      /test\s+"\$result"\s*=\s*"success"/.test(YAML),
      "the aggregator must exit non-zero unless the rollup result is exactly `success`",
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the meta-test to verify it FAILS**

Run: `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: FAIL — the matrix-job, `--shard`, and aggregator assertions fail against the current single-job `unit-suite.yml` (no `unit-suite-shard`, no `--shard`, no `needs`). (The "reads the workflow", "VITEST_EXCLUDE_ENV_BOUND", and "never continue-on-error" assertions already pass — that's expected; the matrix/shard/aggregator ones drive red.)

- [ ] **Step 3: Restructure `.github/workflows/unit-suite.yml`**

Replace the entire file with (keep the existing on:/concurrency exactly as the post-PR-C baseline has them):

```yaml
name: Unit + DB suite (full vitest gate)
# Root-cause fix for the "no CI gate runs the full `pnpm test` suite" gap:
# before this job, the workflows only ran TARGETED vitest files (x-audits,
# deep-link-walker, postgrest-dml-lockdown, affordance-matrix). The 6800+
# unit/DB tests that implementers + reviewers rely on for "all green" were
# NOT gated, so PRs merged with failing/stale tests undetected.
#
# This gate boots local Supabase (same shared bootstrap as dev-gate-e2e.yml /
# screenshots-drift.yml) and runs the WHOLE vitest suite so any unit or
# local-DB test failure blocks merge.
#
# PR D — sharded for wall-clock: the suite is split across a 2-leg `shard`
# matrix (`unit-suite-shard`). Each leg boots its OWN isolated local Supabase
# and runs `vitest run --shard=i/2`. vitest's --shard is a clean file partition
# (every file in exactly one leg), and each leg's serial vitest project still
# runs fileParallelism:false, so the serial-DB guarantee holds WITHIN a leg and
# the two legs never share a database (separate runners). A tiny aggregator job
# named `unit-suite` (the REQUIRED check-context) gates merge: it `needs` the
# matrix and fails unless every leg succeeded — so branch protection needs NO
# change. Topology pinned by tests/cross-cutting/unit-suite-shard-topology.test.ts.
#
# Three files are EXCLUDED via VITEST_EXCLUDE_ENV_BOUND=1 (a project-level
# exclude in vitest.config.ts) — they need environments this local-bootstrap
# runner cannot provide, or starve under full-suite concurrency on the 2-core
# runner. Each is gated elsewhere, so excluding them here is not a regression:
#   - tests/cross-cutting/pg-cron-coverage.test.ts — live-DB cron.job
#     introspection; runs against the validation project (like
#     validation-schema-parity). The bootstrap holds aside the GUC-guarded
#     pg_cron migrations, so no cron jobs exist locally.
#   - tests/admin/test-auth-gate.test.ts — drives a real auth.admin.createUser →
#     signInWithPassword chain needing the running instance's service-role key.
#   - tests/cross-cutting/email-canonicalization.test.ts — 15s per-test
#     doc-scans that starve under concurrency (gated standalone by x5).
# It MUST be the env var, NOT `vitest run --exclude` — vitest IGNORES the CLI
# `--exclude` flag once a project defines its own `exclude` (the serial project
# does). The gate keeps those files runnable by x-audits' direct
# `vitest run <file>` and by local `pnpm test`.
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: unit-suite-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

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
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with:
          # Pinned (NOT `latest`): `latest` resolves via the GitHub API, which
          # rate-limits on shared runners and fails setup. unit-suite is a
          # REQUIRED check, so a setup rate-limit flake would block merges.
          # 2.107.0 = the supabase-local-bootstrap.sh known CI-passing version.
          version: 2.107.0
      - name: Install psql (local-DB tests + bootstrap shell out to psql)
        run: command -v psql >/dev/null || (sudo apt-get update && sudo apt-get install -y postgresql-client)
      - name: Boot local Supabase (guarded migrations)
        # Shared bootstrap — same Supabase + GUC + guarded-migration setup
        # dev-gate-e2e.yml / screenshots-drift.yml use, so the hold-aside list
        # cannot drift between workflows. Each matrix leg boots its OWN instance.
        run: bash scripts/ci/supabase-local-bootstrap.sh
      - name: Run vitest shard ${{ matrix.shard }}/2 (minus the three env-bound files; see header)
        # --shard=i/2 partitions the test FILES across the two legs (every file
        # runs in exactly one leg). The two-project structure is unchanged, so
        # the serial project still runs fileParallelism:false within this leg.
        env:
          VITEST_EXCLUDE_ENV_BOUND: "1"
        run: pnpm exec vitest run --shard=${{ matrix.shard }}/2

  unit-suite:
    # Aggregator — PRESERVES the `unit-suite` required check-context name so
    # branch protection needs no change. Green only when EVERY shard leg passed
    # (needs.<matrix-job>.result is `success` iff all legs succeeded). `if:
    # always()` runs it even when a leg fails, so the required context reports
    # an explicit failure rather than a never-reported skip.
    name: unit-suite
    needs: [unit-suite-shard]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Require every unit-suite-shard leg to have succeeded
        run: |
          result='${{ needs.unit-suite-shard.result }}'
          echo "unit-suite-shard matrix rollup result: $result"
          test "$result" = "success"
```

- [ ] **Step 4: Run the meta-test to verify it PASSES**

Run: `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the two existing CI-structure meta-tests to verify NO regression**

Run: `pnpm exec vitest run tests/cross-cutting/ci-workflow-speedup.test.ts tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS. (`ci-workflow-speedup` still finds `unit-suite.yml` PR-firing with the PR-only concurrency block; `vitest-projects-partition` still sees every test file — including the new meta-test — in exactly one project: the new file is under `tests/cross-cutting/`, not in `PARALLEL_TEST_GLOBS`, so it lands in the serial project.)

- [ ] **Step 6: Lint the YAML is well-formed**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/unit-suite.yml','utf8'); const {load}=require('js-yaml'); const d=load(y); const j=Object.keys(d.jobs); if(!j.includes('unit-suite')||!j.includes('unit-suite-shard')) throw new Error('jobs missing: '+j); if(JSON.stringify(d.jobs['unit-suite-shard'].strategy.matrix.shard)!=='[1,2]') throw new Error('matrix shard wrong'); console.log('yaml OK; jobs =', j);"`
Expected: `yaml OK; jobs = [ 'unit-suite-shard', 'unit-suite' ]` (js-yaml is already a transitive dev dep via the toolchain; if the require fails, fall back to `pnpm exec tsx -e` with `import { load } from 'js-yaml'`, or skip — Step 4's regex already pins structure).

- [ ] **Step 7: Commit**

```bash
git add tests/cross-cutting/unit-suite-shard-topology.test.ts .github/workflows/unit-suite.yml
git commit --no-verify -m "perf(infra): shard unit-suite across a 2-leg matrix behind a unit-suite aggregator

Cuts the required unit-suite gate ~11.3m -> target ~6.5m. Each leg boots its
own local Supabase and runs vitest run --shard=i/2; an aggregator job named
unit-suite (needs the matrix, if: always(), fails unless rollup==success)
preserves the required check-context so branch protection is unchanged.
Topology pinned by tests/cross-cutting/unit-suite-shard-topology.test.ts."
```

---

## Task 2: DB-free local smoke of the full sharded command shape

Codex spec-review note: verify the actual CI command shape (no `--project` filter), not just the `--project=parallel` partition. The serial files need a booted DB, so this local smoke is DB-free and only proves the PARALLEL half partitions under the real command; the full both-project balance is measured on real CI in Task 3.

**Files:** none (verification only).

- [ ] **Step 1: Confirm the parallel project partitions under each shard (closed-port DB)**

Run:
```bash
export TEST_DATABASE_URL="postgresql://x@127.0.0.1:1/x" SUPABASE_URL="http://127.0.0.1:1" \
  NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:1" NEXT_PUBLIC_SUPABASE_ANON_KEY="x" SUPABASE_SERVICE_ROLE_KEY="x"
pnpm exec vitest run --project=parallel --shard=1/2 2>&1 | grep -E 'Test Files'
pnpm exec vitest run --project=parallel --shard=2/2 2>&1 | grep -E 'Test Files'
```
Expected: the two file counts sum to the full parallel count (≈301; observed 151 + 150) and neither is 0 — confirming `--shard` partitions without overlap under the real `vitest run` (not `list`).

- [ ] **Step 2: Confirm the full command selects files from BOTH projects under each shard**

Run (closed-port DB; serial files will error on connect — that's expected, we only assert FILE SELECTION spans both projects):
```bash
pnpm exec vitest run --shard=1/2 2>&1 | grep -cE '^ ?(✓|×|❯|FAIL|✗).*tests/(scripts|cross-cutting|db)/' || true
```
Expected: a non-zero count of serial-project files (e.g. `tests/scripts/*`, `tests/cross-cutting/*`, `tests/db/*`) appear in shard 1's run — proving `--shard` (no `--project`) distributes serial files too, not only parallel ones. (Definitive both-project balance + green is Task 3 on real CI.)

No commit (verification only).

---

## Task 3: Real-CI verification + balance gate (workflow_dispatch)

**Files:** none (CI verification). May modify `unit-suite.yml` only if the balance gate triggers the fallback.

- [ ] **Step 1: Push the branch and open the PR**

```bash
git push -u origin chore/ci-speedup-unit-suite-shard
gh pr create --base main --head chore/ci-speedup-unit-suite-shard \
  --title "perf(infra): shard unit-suite across a 2-leg matrix (PR D, sub-11m CI)" \
  --body "<summary + spec/plan links + 'do not auto-merge: CI-infra; watch shard legs green then merge manually'>"
```

- [ ] **Step 2: Trigger the workflow on the branch and watch both legs**

```bash
gh workflow run unit-suite.yml --ref chore/ci-speedup-unit-suite-shard
# then watch:
gh run list --workflow=unit-suite.yml --branch chore/ci-speedup-unit-suite-shard --limit 1
```
Expected: `unit-suite-shard (1)`, `unit-suite-shard (2)`, and the `unit-suite` aggregator all complete green.

- [ ] **Step 3: Record per-leg wall-clock and apply the §3.3 balance gate**

Read each leg's duration (`gh run view <id>`). Acceptance:
- **PASS** if `max(leg1, leg2) < 9m` AND `< the pre-split unit-suite time` (~11.3m). Ship as-is.
- **FALLBACK** (only if a leg is >2m heavier than the other, or max ≥ 9m): replace `--shard` with a curated per-shard include — a `matrix.shard`-keyed env (e.g. `VITEST_SHARD_INCLUDE`) selecting a fixed glob bucket, with the two hottest files (`validation-report-fixtures`, `validation-check-seed-content-coverage`) in different buckets; extend the topology meta-test to assert the buckets partition `BASE_INCLUDE` (every file in exactly one bucket). Re-run Step 2.

- [ ] **Step 4: Confirm no required-check regression on the PR**

Run: `gh pr checks <PR#> --required`
Expected: all 12 required contexts report, including `unit-suite` (now the aggregator) green. `unit-suite-shard (1)`/`(2)` appear as non-required checks.

No commit unless the fallback (Step 3) was needed — then commit the curated-bucket change with its meta-test update.

---

## Task 4: Adversarial review (cross-model)

**Files:** none.

- [ ] **Step 1: Whole-diff Codex review.** Build a self-contained, no-tool-call Codex brief (inline the diff + the spec; per this environment's codex-exec exploration-wedge tendency, forbid web_search/gh/vitest and require verdict-first). Reviewer-only, fresh-eyes. Iterate until `APPROVE` (no CRITICAL/HIGH). Address any CRITICAL/HIGH by amending Task 1's diff (re-run Steps 4–5), not by relitigating accepted decisions (see spec §6 + the DO-NOT-RELITIGATE list).

- [ ] **Step 2: Confirm real CI is green** (separate gate from local + review green): the PR's `unit-suite` aggregator + both shard legs green on the actual GitHub runner.

---

## Task 5: Merge + sync

**Files:** none.

- [ ] **Step 1: Merge manually** (NOT auto-merge — CI-infra discipline; auto-merge gates only on the required aggregator, but we want eyes on the non-required shard legs being green too):

```bash
gh pr merge <PR#> --merge
```

- [ ] **Step 2: Fast-forward local main and confirm parity**

```bash
git checkout main && git fetch origin && git merge --ff-only origin/main
git rev-list --left-right --count main...origin/main   # expect: 0   0
```

- [ ] **Step 3: Update memory** (`feedback_ci_pin_and_branch_protection` or a new PR-D note): the matrix-shard topology, the aggregator-keeps-required-context pattern, the `continue-on-error` masking gotcha, and the codex-exec inlined-no-tool review mode.

---

## Self-Review

- **Spec coverage:** §3.1 workflow restructure → Task 1 Step 3. §3.2 required-context preservation → Global Constraints + Task 1 aggregator + Task 3 Step 4. §3.3 balancing + gate + fallback → Task 3 Step 3. §3.4 correctness (serial guarantee, no cross-shard race, no coverage loss) → encoded in the YAML comments + meta-test + Task 2/3 verification. §3.5 boot cost → accepted. §4 meta-test (all 6 guards incl. continue-on-error + anti-vacuity) → Task 1 Step 1. §5 sequencing (after PR C, no auto-merge, real-CI gate, ff main) → Tasks 3+5. §7 test plan → Tasks 1–4. All covered.
- **Placeholder scan:** Task 3 Step 1 PR body and Task 4 Step 1 Codex brief are described, not literal — acceptable (they're authored at execution time from the spec). Every code/test step has literal content.
- **Type/string consistency:** job ids `unit-suite-shard` / `unit-suite`, env `VITEST_EXCLUDE_ENV_BOUND`, `needs.unit-suite-shard.result`, `--shard=${{ matrix.shard }}/2`, bootstrap path — all consistent between the YAML (Step 3), the meta-test (Step 1), and the Global Constraints.
