# CI unit-suite under 5 min — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the REQUIRED `unit-suite` CI check's max leg wall clock below 5 minutes via shard matrix 3→6, a conditional Supabase docker-image cache, and a measured `FILE_WEIGHTS` refresh.

**Architecture:** Config-only. The N-generalized `WeightBalancedSequencer` (PR E) makes the shard bump a workflow + meta-test literal change; the cache is three new workflow steps around the existing bootstrap; the weight refresh is a data update pinned by a new exact-value meta-test assertion.

**Tech Stack:** GitHub Actions (`actions/cache@v4`), vitest 4.1.5 `--shard`, zstd, docker save/load.

**Spec:** `docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md` (APPROVED, 4 adversarial rounds). Section references below are to that spec.

## Plan pipeline checklist (AGENTS.md writing-plans additions)

- [x] Pre-draft code-verification pass (both meta-tests read in full; all line refs verified live)
- [x] Self-review (notes at bottom)
- [ ] **Adversarial review (cross-model)** — Codex, iterate to APPROVE, before any execution
- [ ] Execution (Tasks 1–6, in order; whole-diff cross-model review is Task 5, BEFORE push — per the AGENTS.md autonomous pipeline ordering "whole-diff Codex review to APPROVE; push → real CI green → merge")

## Global Constraints

- Commit per task, conventional-commits, `--no-verify` (worktree; shared hooks live in the main checkout).
- The `unit-suite` job name and aggregator topology are a REQUIRED branch-protection context — never rename, never add `continue-on-error: true` (topology test pins both).
- Exactly two `|| true` sites may exist in `unit-suite.yml` (docker load line; save-prep trailing) — spec §5.2 soft-failure inventory.
- No UI, no DB, no migrations, no advisory locks in this diff.
- All work in worktree `/Users/ericweiss/FX-worktrees/ci-unit-suite-5min-phase1` (branch `chore/ci-unit-suite-5min-phase1`).

## Meta-test inventory (mandatory declaration)

EXTENDS: `tests/cross-cutting/unit-suite-shard-topology.test.ts`, `tests/cross-cutting/vitest-shard-balance.test.ts`. CREATES: none. Advisory-lock topology: N/A (no `pg_advisory*` touched). Supabase call-boundary registry: N/A (no Supabase client code touched). Both extended files already have `testMatch`/CI wiring (they run inside the unit-suite vitest gate itself; no workflow path-filter changes needed).

---

### Task 1: Weight refresh + balance meta-test (exact-value anchor, nightly-model fix, N=6)

**Files:**
- Modify: `tests/cross-cutting/vitest-shard-balance.test.ts`
- Modify: `lib/test/vitest.weights.ts`
- Modify: `vitest.sequencer.ts:12` (comment only)

**Interfaces:**
- Consumes: `NIGHTLY_ONLY_EXCLUDES` from `vitest.projects.ts:48` (`["**/tests/parser/mutationHarness.*.test.ts"]`), existing `lptShard(keys, count, weightOf, keyFn)` and `FILE_WEIGHTS`/`DEFAULT_WEIGHT` exports.
- Produces: 8-entry `FILE_WEIGHTS` map (exact values below) that Task 2's 6-leg matrix relies on for balance.

- [ ] **Step 1: Edit the balance meta-test — failing first.** Apply ALL of the following to `tests/cross-cutting/vitest-shard-balance.test.ts`:

(a) Import nightly excludes (line 9):

```ts
import { ENV_BOUND_EXCLUDES, NIGHTLY_ONLY_EXCLUDES } from "@/vitest.projects";
```

(b) Replace the suffix-based exclusion (lines 28–34) with glob-aware exclusion — `NIGHTLY_ONLY_EXCLUDES` contains a `*` wildcard, so plain `endsWith` cannot model it (spec §5.4.3):

```ts
// What the sequencer sees in the unit-suite CI run: all test files minus the
// env-bound excludes (VITEST_EXCLUDE_ENV_BOUND=1) AND the unconditional
// nightly-only excludes (vitest.config.ts serial-project `exclude`; the
// mutation project is env-gated out of unit-suite discovery). Globs are
// "**/"-prefixed and may contain `*`, so convert to anchored regexes.
function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${esc}$`);
}
const excludeRes = [...ENV_BOUND_EXCLUDES, ...NIGHTLY_ONLY_EXCLUDES].map(globToRegExp);
const allFiles = listTestFiles(join(ROOT, "tests")).filter(
  (f) => !excludeRes.some((r) => r.test(f)),
);
```

(c) In the anti-vacuity test (after line 60's `for (const h of HOT)` loop), add the negative model assertion:

```ts
    // The serial project unconditionally excludes the nightly mutation-harness
    // files (vitest.projects.ts NIGHTLY_ONLY_EXCLUDES) — the sequencer never
    // sees them in a unit-suite run, so neither may this model.
    expect(
      allFiles.some((f) => f.includes("tests/parser/mutationHarness.")),
      "nightly mutationHarness files must be excluded from the modeled set",
    ).toBe(false);
```

(d) Both N loops (lines 64 and 88): `for (const N of [2, 3])` → `for (const N of [2, 3, 6])`.

(e) After the stale-keys test (line 113–116 block), add the exact-value refresh anchor (spec §5.3 — key presence alone would pass with arbitrary weights):

```ts
  // TDD anchor for the Phase-1 weight refresh (spec §5.3): every file measured
  // ≥8s on green run 29710814674 must carry its measured (rounded) weight.
  // Future re-measurements update this literal and FILE_WEIGHTS together.
  const MEASURED_HEAVY: Record<string, number> = {
    "tests/cross-cutting/no-global-cursor.test.ts": 54000,
    "tests/scripts/validation-report-fixtures.test.ts": 40000,
    "tests/codexGuard/timeouts.test.ts": 28000,
    "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 23000,
    "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 15000,
    "tests/scripts/validation-check-seed.test.ts": 15000,
    "tests/app/admin/showReviewModalLoader.test.tsx": 11000,
    "tests/parser/blocks/event.test.ts": 8000,
  };
  it("FILE_WEIGHTS carries the measured 2026-07-20 refresh (exact values)", () => {
    for (const [k, w] of Object.entries(MEASURED_HEAVY)) {
      expect(FILE_WEIGHTS[k], `${k} must be weighted ${w}`).toBe(w);
    }
  });
```

- [ ] **Step 2: Run — verify it fails on the anchor (and ONLY the anchor).**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-shard-balance.test.ts`
Expected: FAIL — `FILE_WEIGHTS carries the measured 2026-07-20 refresh` (4 absent keys / 4 stale values). All other tests (including N=6 cover + 1.25× and the nightly-model assertion) PASS.

- [ ] **Step 3: Refresh the weights map.** Replace the map and threshold comment in `lib/test/vitest.weights.ts` (full new file body):

```ts
// Single source of truth for the weight-balanced shard sequencer (PR E).
// Keys are repo-relative, forward-slashed. ONLY the heavy serial-DB files
// (≥8s measured) need entries; everything else uses DEFAULT_WEIGHT. A heavy
// file left out gets DEFAULT_WEIGHT and can re-cluster — the balance
// meta-test's no-stale-keys + exact-value + 1.25x-mean guards catch
// committed-weight problems, but a NEW unweighted heavy file is caught only
// by the CI per-leg timing (spec §6).
export const DEFAULT_WEIGHT = 1500; // ms, rough light-file proxy

// Measured 2026-07-20 run 29710814674 (per-file vitest test time), rounded
// to the nearest 1,000ms. Pinned exactly by vitest-shard-balance.test.ts's
// MEASURED_HEAVY — update both together when re-measuring.
export const FILE_WEIGHTS: Record<string, number> = {
  "tests/cross-cutting/no-global-cursor.test.ts": 54000, // measured 2026-07-20 run 29710814674
  "tests/scripts/validation-report-fixtures.test.ts": 40000, // measured 2026-07-20 run 29710814674
  "tests/codexGuard/timeouts.test.ts": 28000, // measured 2026-07-20 run 29710814674
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 23000, // measured 2026-07-20 run 29710814674
  "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 15000, // measured 2026-07-20 run 29710814674
  "tests/scripts/validation-check-seed.test.ts": 15000, // measured 2026-07-20 run 29710814674
  "tests/app/admin/showReviewModalLoader.test.tsx": 11000, // measured 2026-07-20 run 29710814674
  "tests/parser/blocks/event.test.ts": 8000, // measured 2026-07-20 run 29710814674
};
```

(The per-row `// measured 2026-07-20 run 29710814674` comment is a spec §5.3 requirement — keep all eight.)

Also `vitest.sequencer.ts` line 12: change `// → deterministic across the two separate CI runners.` to `// → deterministic across the N separate CI runners.` (spec §4.5 — leg-count-neutral).

- [ ] **Step 4: Run — verify green.**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS (all; partition test proves project membership untouched).

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/vitest-shard-balance.test.ts lib/test/vitest.weights.ts vitest.sequencer.ts
git commit --no-verify -m "test(infra): refresh FILE_WEIGHTS from measured CI timings; balance meta-test models nightly excludes, pins exact values, adds N=6"
```

---

### Task 2: 6-leg shard matrix (topology test first, then workflow)

**Files:**
- Modify: `tests/cross-cutting/unit-suite-shard-topology.test.ts:22-39`
- Modify: `.github/workflows/unit-suite.yml` (lines 12, 14, 17, 56, 74, 75, 80)

**Interfaces:**
- Consumes: Task 1's balanced 8-entry weight map.
- Produces: the 6-leg matrix Task 3's cache steps land inside.

- [ ] **Step 1: Update the topology test to demand 6 legs.** In `tests/cross-cutting/unit-suite-shard-topology.test.ts`:

Replace the matrix test (lines 22–31) with:

```ts
  it("defines a unit-suite-shard matrix job with fail-fast:false and shard:[1, 2, 3, 4, 5, 6]", () => {
    const m =
      /\n {2}unit-suite-shard:\n[\s\S]*?strategy:\n\s+fail-fast:\s*false\n\s+matrix:\n\s+shard:\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*,\s*6\s*\]/.exec(
        YAML,
      );
    expect(
      m,
      "unit-suite.yml must declare a `unit-suite-shard` job with strategy.fail-fast:false and matrix.shard:[1, 2, 3, 4, 5, 6]",
    ).not.toBeNull();
  });
```

Replace the denominator test (lines 33–40) with:

```ts
  it("runs vitest with --shard=${{ matrix.shard }}/N where N equals the matrix length (6)", () => {
    const m = /--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/.exec(YAML);
    expect(m, "shard step must run `vitest run --shard=${{ matrix.shard }}/N`").not.toBeNull();
    expect(
      Number(m![1]),
      "the --shard denominator must equal the matrix length (6); a mismatch drops or double-runs files",
    ).toBe(6);
  });
```

- [ ] **Step 2: Run — verify both edited tests fail (workflow still 3-leg).**

Run: `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: FAIL — exactly the two edited tests; the other five PASS.

- [ ] **Step 3: Update the workflow.** In `.github/workflows/unit-suite.yml`:
  - Line 56: `shard: [1, 2, 3]` → `shard: [1, 2, 3, 4, 5, 6]`
  - Line 80: `run: pnpm exec vitest run --shard=${{ matrix.shard }}/3` → `.../6`
  - Line 74 step name: `Run vitest shard ${{ matrix.shard }}/3 (minus ...)` → `/6 (minus ...)`
  - Header prose: line 12 `a 3-leg \`shard\`` → `a 6-leg \`shard\``; line 14 `--shard=i/3` → `--shard=i/6`; line 17 `the three legs never share` → `the legs never share`; line 75 comment `across the three legs` → `across the six legs`.

- [ ] **Step 4: Run — verify green.**

Run: `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts tests/cross-cutting/ci-workflow-speedup.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/unit-suite-shard-topology.test.ts .github/workflows/unit-suite.yml
git commit --no-verify -m "infra: unit-suite shard matrix 3 -> 6 legs (topology meta-test updated first)"
```

---

### Task 3: Conditional Supabase image cache (topology pins first, then workflow steps)

**Files:**
- Modify: `tests/cross-cutting/unit-suite-shard-topology.test.ts` (append a new `describe`)
- Modify: `.github/workflows/unit-suite.yml` (3 new steps)

**Interfaces:**
- Consumes: Task 2's 6-leg workflow shape.
- Produces: the cache lever §6's accept gate measures; revertable as one unit (steps + pins) per spec §5.2/§6.1.

- [ ] **Step 1: Append cache pins to the topology test.** Add after the existing `describe` block in `tests/cross-cutting/unit-suite-shard-topology.test.ts`:

```ts
describe("unit-suite Supabase image cache (spec 2026-07-19 §5.2 — if the lever is reverted per §6.1, REPLACE this block with the zero-count guard in plan Task 6 step 4.1)", () => {
  it("restore step declares the exact id its guards reference", () => {
    expect(
      /- name: Restore Supabase image cache\n {8}id: supabase-image-cache\n/.test(YAML),
      "cache-restore must declare `id: supabase-image-cache` — an id/guard mismatch silently disables load AND save",
    ).toBe(true);
  });

  it("cache key embeds the setup-cli version literal (equal) and the config+bootstrap hashFiles", () => {
    const cli = /uses: supabase\/setup-cli@v1\n[\s\S]*?version:\s*(\d+\.\d+\.\d+)/.exec(YAML);
    expect(cli, "pinned supabase/setup-cli version not found").not.toBeNull();
    const key = /key:\s*supabase-images-\$\{\{ runner\.os \}\}-(\d+\.\d+\.\d+)-\$\{\{ hashFiles\('supabase\/config\.toml', 'scripts\/ci\/supabase-local-bootstrap\.sh'\) \}\}/.exec(
      YAML,
    );
    expect(key, "cache key must be supabase-images-<os>-<cli literal>-<hashFiles(config.toml, bootstrap)>").not.toBeNull();
    expect(key![1], "cache-key CLI literal must equal the setup-cli pin (drift = stale images across CLI bumps)").toBe(cli![1]);
  });

  it("step ordering: restore -> load -> boot -> vitest -> save-prep", () => {
    const idx = [
      YAML.indexOf("- name: Restore Supabase image cache"),
      YAML.indexOf("- name: Load cached Supabase images"),
      YAML.indexOf("- name: Boot local Supabase"),
      YAML.indexOf("Run vitest shard"),
      YAML.indexOf("- name: Save Supabase images for cache"),
    ];
    for (const i of idx) expect(i, "every cache/boot/vitest step must exist").toBeGreaterThan(-1);
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i], `step ${i} must come after step ${i - 1}`).toBeGreaterThan(idx[i - 1]!);
    }
  });

  it("load is hit-only, save-prep is miss-only", () => {
    expect(
      /- name: Load cached Supabase images[\s\S]{0,200}?if: steps\.supabase-image-cache\.outputs\.cache-hit == 'true'/.test(YAML),
    ).toBe(true);
    expect(
      /- name: Save Supabase images for cache[\s\S]{0,200}?if: steps\.supabase-image-cache\.outputs\.cache-hit != 'true'/.test(YAML),
    ).toBe(true);
  });

  it("soft-failure inventory: exactly two `|| true` — the load line and the save-prep trailing; pipefail present", () => {
    const soft = YAML.match(/\|\| true/g) ?? [];
    expect(soft, "exactly two `|| true` sites allowed (spec §5.2)").toHaveLength(2);
    expect(/docker load \|\| true/.test(YAML), "one `|| true` must be on the docker-load line").toBe(true);
    expect(/; \} \|\| true/.test(YAML), "one `|| true` must trail the braced save-prep compound").toBe(true);
    expect(
      YAML.includes("set -o pipefail"),
      "save-prep must set pipefail — without it a mid-stream docker-save death publishes a truncated archive",
    ).toBe(true);
    expect(
      /run: bash scripts\/ci\/supabase-local-bootstrap\.sh\n/.test(YAML),
      "the boot step must remain hard-failing (no suffix after the bootstrap invocation)",
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify the new describe fails (5 new tests), old ones pass.**

Run: `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: FAIL — the 5 new cache tests; the original 7 PASS.

- [ ] **Step 3: Add the three workflow steps.** In `.github/workflows/unit-suite.yml`, insert between the `Install psql` step and the `Boot local Supabase` step:

```yaml
      # Conditional image-cache lever (spec 2026-07-19 §5.2; keep-or-revert
      # decided by the §6 accept gate — if reverted, delete these three steps
      # and in the same commit replace the topology test's cache describe-block
      # with the zero-soft-fail guard, which must REMAIN).
      # Key inputs: runner OS/arch; the setup-cli version literal (image tags
      # derive from CLI version — topology test pins the two literals equal);
      # hashFiles over config.toml (db.major_version selects the postgres
      # image) + the bootstrap script (its -x list selects which services'
      # images are needed at all). Caches are immutable per key — every input
      # that can change the image set must be in the key.
      - name: Restore Supabase image cache
        id: supabase-image-cache
        uses: actions/cache@v4
        with:
          path: ~/supabase-images.tar.zst
          key: supabase-images-${{ runner.os }}-2.107.0-${{ hashFiles('supabase/config.toml', 'scripts/ci/supabase-local-bootstrap.sh') }}
      - name: Load cached Supabase images (hit only)
        if: steps.supabase-image-cache.outputs.cache-hit == 'true'
        # Trailing soft-fail operator (NOT repeated in this comment — the
        # topology meta-test counts its occurrences): a corrupt/failed load
        # degrades to today's behavior (`supabase start` pulls whatever is
        # missing) — never fails the leg.
        run: zstd -d --stdout ~/supabase-images.tar.zst | docker load || true
```

And after the vitest step (end of the shard job):

```yaml
      - name: Save Supabase images for cache (miss only)
        if: steps.supabase-image-cache.outputs.cache-hit != 'true'
        # One braced compound with a single trailing soft-fail operator (the
        # literal is NOT repeated in this comment — the topology meta-test
        # counts its occurrences): any failure (apt, enumeration, docker save,
        # zstd, disk) costs only the cache entry, never the leg. pipefail is
        # load-bearing (default `bash -e {0}` takes the PIPELINE status from
        # zstd alone — a mid-stream docker-save death would otherwise publish
        # a truncated archive). tmp-then-mv is load-bearing (the cache
        # post-step uploads whatever sits at the cache path under an IMMUTABLE
        # key — a partial file would hit forever, soft-fail every load, and
        # never regenerate since save is miss-only).
        run: |
          set -o pipefail
          { (command -v zstd || sudo apt-get install -y zstd) \
            && docker save $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'supabase|kong|postgrest') \
               | zstd -T0 -o ~/supabase-images.img.tmp \
            && mv ~/supabase-images.img.tmp ~/supabase-images.tar.zst; } || true
```

- [ ] **Step 4: Run — verify green (all 12 topology tests).**

Run: `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit.**

```bash
git add tests/cross-cutting/unit-suite-shard-topology.test.ts .github/workflows/unit-suite.yml
git commit --no-verify -m "infra: conditional Supabase image cache on unit-suite legs (restore/load/save-prep, structurally pinned)"
```

---

### Task 4: Pre-push verification gates

**Files:** none (verification only; fix-forward commits if anything fails).

- [ ] **Step 1:** `pnpm exec tsc --noEmit` — Expected: clean (vitest strips types; typecheck is a separate gate).
- [ ] **Step 2:** `pnpm exec eslint tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts lib/test/vitest.weights.ts vitest.sequencer.ts` — Expected: clean.
- [ ] **Step 3:** `pnpm exec prettier --check .github/workflows/unit-suite.yml tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts lib/test/vitest.weights.ts docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md` — Expected: clean. If not: `prettier --write` the offenders and commit them as their own `style(infra): prettier formatting` commit (NEVER amend — commit-per-change).
- [ ] **Step 4:** Full suite: `pnpm test` — this is plain `vitest run` (package.json:44), so the env-bound files DO run locally (they need the preflight-verified local Supabase + `.env.local`; `email-canonicalization` alone takes minutes — budget ~15–20 min). e2e specs are separate (`pnpm test:e2e`, not run here; they gate in their own workflows). Expected: green.
- [ ] **Step 5:** No commit if nothing changed; any fix is its own `fix(infra): <what>` or `style(infra): ...` commit.

---

### Task 5: Whole-diff cross-model review (BEFORE push — AGENTS.md pipeline ordering)

**Files:** none (review dispatch; fix-forward commits only if findings land).

- [ ] **Step 1:** Dispatch the whole-diff Codex review via `node scripts/codex-guard.mjs review` (fresh-eyes posture, REVIEWER ONLY, do-not-relitigate list = spec §1.1 + both review histories). Iterate to APPROVE, no round budget.
- [ ] **Step 2:** Any repair commits follow the same shape as their originating task (test edit first if a test is wrong, then implementation, then targeted vitest run, then commit `fix(infra): <what>` — one commit per finding class).
- [ ] **Step 3:** Only on APPROVE proceed to Task 6.

---

### Task 6: PR + empirical accept gate (spec §6, on real CI)

**Files:** conditional — `.github/workflows/unit-suite.yml`, both meta-tests, `lib/test/vitest.weights.ts`, `BACKLOG.md` (only on the revert / reweight / 8-leg / residual-gap branches below).

**Measurement helper (used by every step below).** GitHub reruns KEEP the run's database ID and increment its `attempt` — a rerun never creates a new run ID. Always measure an explicit attempt via the attempts API (snake_case fields). The helper SELF-VALIDATES: an attempt-scoped jobs listing contains only the jobs that ran IN that attempt, so a `--failed` rerun produces a partial attempt — the helper hard-errors on leg-count mismatch or any non-green leg instead of silently aggregating a subset:

```bash
LEGS=6   # update to 8 if the §6.4 fallback fires
measure() { # usage: measure <run-id> <attempt>   (uses $LEGS)
  gh api "repos/{owner}/{repo}/actions/runs/$1/attempts/$2/jobs" --paginate --jq "
    [.jobs[] | select(.name|startswith(\"unit-suite-shard\"))] as \$legs |
    if (\$legs|length) != $LEGS then error(\"partial attempt: \(\$legs|length)/$LEGS legs — measure only FULL attempts (never a --failed rerun's attempt)\")
    elif ([\$legs[]|select(.conclusion != \"success\")]|length) > 0 then error(\"non-green leg — not a qualifying attempt\")
    else [\$legs[] | {
      leg: .name,
      wall_s: ((.completed_at|fromdate)-(.started_at|fromdate)),
      boot_path_s: ([.steps[]|select(.name|test(\"Restore Supabase|Load cached|Boot local\"))|((.completed_at|fromdate)-(.started_at|fromdate))]|add),
      vitest_s: ([.steps[]|select(.name|test(\"Run vitest shard\"))|((.completed_at|fromdate)-(.started_at|fromdate))]|add)
    }] |
    { legs: .,
      max_wall: ([.[].wall_s]|max),
      boot_median: ([.[].boot_path_s]|sort|if length%2==1 then .[length/2|floor] else ((.[length/2-1]+.[length/2])/2) end),
      vitest_skew: (([.[].vitest_s]|max)-([.[].vitest_s]|min)) }
    end"
}
```

(`boot_median` is a true median — even-length lists average the two middle values; a pick-upper-middle index would misdecide the ≤56s boundary. `vitest_skew`/`max_wall` are the §6.2/§6.3 inputs.)

**Canonical measurement loop (structural fix after 3 review rounds on this vector — EVERY branch below re-enters this loop; no branch ever ends at a commit):**

```bash
# MEASURE-LOOP: run after EVERY mutation commit, and to (re)evaluate criteria.
git push                                   # no-op if nothing local; NEVER skip
gh pr checks <PR#> --watch                 # wait for the pushed run
RUN=$(gh run list --workflow unit-suite.yml --branch chore/ci-unit-suite-5min-phase1 --limit 1 --json databaseId --jq '.[0].databaseId')
measure $RUN 1                             # errors loudly if not a full green attempt
# Evaluate IN ORDER on this output:
#   (3) vitest_skew <= 75 ?  no → reweight branch → MEASURE-LOOP
#   (2) max_wall   <  300 ?  no → 8-leg fallback (once) → MEASURE-LOOP; at 8 already → keep-fastest branch → MEASURE-LOOP
# Loop exits ONLY when the latest measure output satisfies (2) and (3), or the
# keep-fastest floor branch has confirmed its configuration on a measured run.
```

Flake rule: `gh run rerun $RUN --failed` is fine for turning the CHECK green, but its attempt is partial by construction and `measure` will refuse it — for a measurement, always use a FULL attempt (a fresh pushed run, or a full `gh run rerun $RUN` whose new attempt reruns all legs).

- [ ] **Step 1: Push + PR.**

```bash
git push -u origin chore/ci-unit-suite-5min-phase1
gh pr create --title "infra: CI unit-suite under 5 min — Phase 1 (6-leg shard matrix + conditional image cache + weight refresh)" --body "<spec/plan links, §3 baseline table, empty §6 measurement table>"
```

- [ ] **Step 2: Run 1 (cache miss) — watch and measure attempt 1.**

```bash
gh pr checks <PR#> --watch
RUN1=$(gh run list --workflow unit-suite.yml --branch chore/ci-unit-suite-5min-phase1 --limit 1 --json databaseId --jq '.[0].databaseId')
measure $RUN1 1
```

Expected: all legs + aggregator green; each leg's restore ~0s (miss) and load skipped. Verify `gh pr view <PR#> --json mergeStateStatus` is not DIRTY. On unrelated flake: `gh run rerun $RUN1 --failed` turns the check green, but that attempt is partial and `measure` will refuse it — for the measurement, follow with a FULL `gh run rerun $RUN1`, `gh run watch $RUN1 --exit-status`, `ATTEMPT=$(gh run view $RUN1 --json attempt --jq .attempt)`, `measure $RUN1 $ATTEMPT`.

- [ ] **Step 3: Run 2 (cache hit) — rerun the SAME run id, measure the new attempt.**

```bash
gh run rerun $RUN1        # same run id, same refs/pull/N/merge ref → restores attempt 1's cache
gh run watch $RUN1 --exit-status
ATTEMPT=$(gh run view $RUN1 --json attempt --jq .attempt)
measure $RUN1 $ATTEMPT    # boot_median here is the §6.1 input
```

(A `workflow_dispatch` run would execute on `refs/heads/<branch>` — a different cache scope, always a miss; never use it here. If `gh run rerun` is refused:

```bash
git commit --allow-empty --no-verify -m "chore: retrigger PR CI for cache-hit measurement (spec §6.1)"
git push
gh pr checks <PR#> --watch
RUNH=$(gh run list --workflow unit-suite.yml --branch chore/ci-unit-suite-5min-phase1 --limit 1 --json databaseId --jq '.[0].databaseId')
measure $RUNH 1    # this new run's attempt 1 is the cache-hit measurement
```

)

- [ ] **Step 4: §6 ordered decision (each conditional mutation is TDD'd + committed like Tasks 1–3):**

  **(1) Cache decision:** keep iff Step-3 `boot_median` ≤56. If REVERT: first edit the topology test — replace the entire cache `describe` block with the zero-count guard the spec requires to REMAIN after reversion (spec §5.4.1 "the soft-failure-count-zero form remains"):

  ```ts
  describe("unit-suite has no cache lever (reverted per spec 2026-07-19 §6.1)", () => {
    it("no soft-failed commands and no cache steps remain", () => {
      expect(YAML.match(/\|\| true/g) ?? [], "a reverted cache lever must leave zero soft-fail sites").toHaveLength(0);
      expect(YAML.includes("supabase-image-cache"), "no cache step may remain after reversion").toBe(false);
    });
  });
  ```

  Run `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts` — expect FAIL (steps still present); delete the three workflow steps; run again — expect PASS; commit `infra: revert image-cache lever (measured saving <15s, spec §6.1)` with the measurement in the body. **→ MEASURE-LOOP** (its measure output is the surviving cacheless configuration's §6.2/§6.3 input).

  **(2) Wall-clock criterion:** `max_wall < 300` on the LATEST measure output for the surviving configuration (Step-3 measure if cache kept unchanged; otherwise whatever the most recent MEASURE-LOOP pass produced). Record.

  **(3) Balance criterion:** `vitest_skew ≤ 75` on the SAME (latest) measure output as (2) — the two criteria are always evaluated together on one output, never on outputs from different configurations. If exceeded: extract the outlier leg's per-file times from its log (`gh run view <run-id> --log | grep "unit-suite-shard (<n>)" | perl -pe 's/\x1b\[[0-9;]*m//g' | grep -oE "✓ +(serial|parallel) +tests/[^ ]+ \([0-9]+ tests[^)]*\) [0-9]+ms"`), update BOTH the `MEASURED_HEAVY` literal and `FILE_WEIGHTS` for the mis-weighted file (test first: edit `MEASURED_HEAVY`, run balance test → FAIL, edit map, → PASS), commit `test(infra): reweight <file> from run <id> per-leg log (spec §6.3)`. **→ MEASURE-LOOP** (re-evaluate (3) AND (2) on the new output; repeat this branch until both hold or (2) triggers (4)).

  **(4) 8-leg fallback** (only if (2) misses at 6): test-first edits — topology matrix literal test to `[1, 2, 3, 4, 5, 6, 7, 8]` + denominator `.toBe(8)`, balance loops `[2, 3, 6]` → `[2, 3, 8]` in BOTH loops; run both meta-tests → FAIL; workflow `shard: [1, 2, 3, 4, 5, 6, 7, 8]`, `--shard=${{ matrix.shard }}/8`, step name `/8`, header prose `6-leg`→`8-leg` / `i/6`→`i/8` / `six legs`→`eight legs`; run both meta-tests → PASS; commit `infra: 8-leg fallback per spec §6.4 (6-leg max leg <measured>s ≥300s)`; set `LEGS=8`. **→ MEASURE-LOOP** (re-evaluate (3) then (2)).

  **Keep-fastest floor branch (only if (2) STILL misses at 8):** compare `max_wall` of the 6-leg and 8-leg qualifying measure outputs (if reweighting happened at 8 legs only, the old 6-leg number is stale — note that in the comparison; a stale-vs-fresh comparison favoring the stale side requires a fresh 6-leg measurement via the revert below before deciding). If 8 won: keep it, no edits. If 6 won: revert to 6 test-first — topology matrix test back to `[1, 2, 3, 4, 5, 6]` + `.toBe(6)`, balance loops back to `[2, 3, 6]`, run both meta-tests → FAIL; workflow matrix/denominator/prose back to 6-leg forms; meta-tests → PASS; commit `infra: revert to 6-leg matrix (8-leg measured slower, spec §6.4)`; set `LEGS=6`; **→ MEASURE-LOOP** (confirms the reverted configuration on a fresh measured run). Then, on the kept configuration's latest measure output: verify `max_wall` beats the 3-leg baseline's 480s max leg (every projection clears this by minutes — if somehow not, STOP and escalate, do not merge); append the residual gap to `BACKLOG.md` as `## BL-CI-UNIT-SUITE-PHASE2 — Phase-1 residual: max leg <measured>s vs 300s target`; commit `docs: BACKLOG — record Phase-1 residual wall-clock gap (spec §6.4)`; **→ MEASURE-LOOP** (pushes the BACKLOG commit and confirms the final tree green — docs-only, so the measure numbers are unchanged but the merge ref must contain every commit).

- [ ] **Step 5: Record + merge.** All measurements + decisions in the PR body (§6 table filled). Pre-merge guards, in order:

```bash
test -z "$(git -C /Users/ericweiss/FX-worktrees/ci-unit-suite-5min-phase1 status --porcelain)"   # no uncommitted work
git -C /Users/ericweiss/FX-worktrees/ci-unit-suite-5min-phase1 push                              # no unpushed commits (no-op if clean)
gh pr view <PR#> --json headRefOid,mergeStateStatus                                              # headRefOid == local HEAD; status not DIRTY
```

If any repair commits landed after Task 5's APPROVE, re-dispatch a delta cross-model review of those commits to APPROVE. Then: real CI green on the final configuration (the run the last MEASURE-LOOP pass watched) → `gh pr merge <PR#> --merge` in the same turn → `cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main` → expect `0	0`.

---

## Self-review notes

- Spec coverage: §5.1→Task 2; §5.2→Task 3; §5.3→Task 1; §5.4.1→Tasks 2+3; §5.4.2/§5.4.3→Task 1; §6→Task 6; whole-diff review ordering→Task 5. No spec requirement without a task.
- **Snippet typecheck transcript (actually run, 2026-07-19):** every pasted test snippet (Task 1 b/c/e, Task 2 both tests, Task 3 all five cache pins, Task 6 revert guard) was assembled into `.claude/snippet-check/{balance,topology}-snippets.ts` with the real imports and run through `pnpm exec tsc --noEmit -p .claude/snippet-check/tsconfig.json` (extends the repo strict tsconfig — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Result: **exit 0, zero diagnostics**. Harness files deleted after the check (`.claude/` is gitignored). Strictness notes: `idx[i - 1]!` non-null asserted; `key![1]`/`cli![1]` follow the file's existing `m![1]` idiom; `FILE_WEIGHTS[k]` is `number | undefined`, fine for `.toBe(w)`.
- Anti-tautology: the MEASURED_HEAVY anchor asserts against the data source (`FILE_WEIGHTS`), not derived output; failure mode caught = "map refresh skipped or wrong values." The ordering test's failure mode = "cache steps placed where they can't work." The pipefail/`|| true` inventory's failure mode = "a required leg soft-fails or a partial archive poisons the immutable key."
- Layout-dimensions / transition-audit tasks: N/A (no UI).
