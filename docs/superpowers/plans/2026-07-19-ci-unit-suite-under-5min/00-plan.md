# CI unit-suite under 5 min — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the REQUIRED `unit-suite` CI check's max leg wall clock below 5 minutes via shard matrix 3→6, a conditional Supabase docker-image cache, and a measured `FILE_WEIGHTS` refresh.

**Architecture:** Config-only. The N-generalized `WeightBalancedSequencer` (PR E) makes the shard bump a workflow + meta-test literal change; the cache is three new workflow steps around the existing bootstrap; the weight refresh is a data update pinned by a new exact-value meta-test assertion.

**Tech Stack:** GitHub Actions (`actions/cache@v4`), vitest 4.1.5 `--shard`, zstd, docker save/load.

**Spec:** `docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md` (APPROVED, 4 adversarial rounds). Section references below are to that spec.

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
  "tests/cross-cutting/no-global-cursor.test.ts": 54000,
  "tests/scripts/validation-report-fixtures.test.ts": 40000,
  "tests/codexGuard/timeouts.test.ts": 28000,
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 23000,
  "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 15000,
  "tests/scripts/validation-check-seed.test.ts": 15000,
  "tests/app/admin/showReviewModalLoader.test.tsx": 11000,
  "tests/parser/blocks/event.test.ts": 8000,
};
```

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
describe("unit-suite Supabase image cache (spec 2026-07-19 §5.2 — delete this block if the lever is reverted per §6.1)", () => {
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
      # AND the topology test's cache describe-block in the same commit).
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
        # `|| true`: a corrupt/failed load degrades to today's behavior
        # (`supabase start` pulls whatever is missing) — never fails the leg.
        run: zstd -d --stdout ~/supabase-images.tar.zst | docker load || true
```

And after the vitest step (end of the shard job):

```yaml
      - name: Save Supabase images for cache (miss only)
        if: steps.supabase-image-cache.outputs.cache-hit != 'true'
        # One braced compound + ONE trailing `|| true`: any failure (apt,
        # enumeration, docker save, zstd, disk) costs only the cache entry,
        # never the leg. pipefail is load-bearing (default `bash -e {0}` takes
        # the PIPELINE status from zstd alone — a mid-stream docker-save death
        # would otherwise publish a truncated archive). tmp-then-mv is
        # load-bearing (the cache post-step uploads whatever sits at the cache
        # path under an IMMUTABLE key — a partial file would hit forever,
        # soft-fail every load, and never regenerate since save is miss-only).
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
- [ ] **Step 3:** `pnpm exec prettier --check .github/workflows/unit-suite.yml tests/cross-cutting/vitest-shard-balance.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts lib/test/vitest.weights.ts docs/superpowers/specs/ci/2026-07-19-ci-unit-suite-under-5min.md docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md` — Expected: clean (run `--write` + amend if not).
- [ ] **Step 4:** Full suite: `pnpm test` — Expected: green (env-bound + e2e files are excluded from `pnpm test` by design; they gate elsewhere).
- [ ] **Step 5:** No commit (nothing should change); if fixes were needed, commit them as `fix(infra): <what>`.

---

### Task 5: PR + empirical accept gate (spec §6, on real CI)

**Files:** none (GitHub operations).

- [ ] **Step 1:** Push branch; open PR titled `infra: CI unit-suite under 5 min — Phase 1 (6-leg shard matrix + conditional image cache + weight refresh)`. Body: spec/plan links, the §3 measured baseline, and a placeholder table for the §6 measurements.
- [ ] **Step 2:** Watch run 1 (cache miss): `gh pr checks <PR#> --watch`. Record per-leg wall clocks + vitest-step durations. Verify all legs + aggregator green.
- [ ] **Step 3:** Trigger run 2 (cache hit — first run after a green run): `gh run rerun <run-1-id>` — a rerun executes on the SAME `refs/pull/N/merge` ref, so it restores the cache run 1 saved. (A `workflow_dispatch` run would execute on `refs/heads/<branch>`, a different cache scope, and always miss — do not use it for this measurement. Fallback if rerun is refused: push an empty commit.) Record the leg-median boot path (restore+load+boot summed).
- [ ] **Step 4:** Apply §6 ordered decision: (1) cache keep iff median boot path ≤56s, else revert commit (3 steps + test describe-block); (2) max leg <5 min on surviving config; (3) vitest-step skew ≤75s, else reweight outlier from the run's own log and re-push; (4) if <5 min misses, predeclared 8-leg bump (matrix, `/6`→`/8`, both meta-test literals) and re-run. Record all measurements + decisions in the PR body.
- [ ] **Step 5:** Cross-model whole-diff review, then merge (pipeline Stage 4 — `gh pr merge --merge` after real CI green; fast-forward local main; verify `0 0`).

---

## Self-review notes

- Spec coverage: §5.1→Task 2; §5.2→Task 3; §5.3→Task 1; §5.4.1→Tasks 2+3; §5.4.2/§5.4.3→Task 1; §6→Task 5; §4.2/§4.5→Task 1. No spec requirement without a task.
- Snippets typechecked mentally against strict tsconfig: `idx[i - 1]!` non-null asserted (noUncheckedIndexedAccess); `key![1]`/`cli![1]` follow the file's existing `m![1]` idiom; `FILE_WEIGHTS[k]` is `number | undefined`, fine for `.toBe(w)`.
- Anti-tautology: the MEASURED_HEAVY anchor asserts against the data source (`FILE_WEIGHTS`), not derived output; failure mode caught = "map refresh skipped or wrong values." The ordering test's failure mode = "cache steps placed where they can't work." The pipefail/`|| true` inventory's failure mode = "a required leg soft-fails or a partial archive poisons the immutable key."
- Layout-dimensions / transition-audit tasks: N/A (no UI).
