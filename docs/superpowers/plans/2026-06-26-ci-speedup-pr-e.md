# PR E — weight-balanced shards + direct-bin tsx — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Balance the two `unit-suite` shard legs (custom weight-aware vitest sequencer) and cut the report-fixtures `npx tsx` cold-start (absolute tsx bin). Target unit-suite ~8.1m → ~6.3m, no extra runner, zero coverage risk.

**Architecture:** A root-level `WeightBalancedSequencer` (vitest 4.1.5 `test.sequence.sequencer`) replaces the default hash-only `--shard` partition with LPT bin-packing over a committed `FILE_WEIGHTS` map, so the two hot serial files no longer both land in shard 1. The report-fixtures harness spawns the repo's `tsx` bin by absolute path instead of `npx tsx`. Spec: `docs/superpowers/specs/2026-06-26-ci-speedup-pr-e-design.md` (APPROVE'd cross-model).

**Tech Stack:** vitest 4.1.5 (`BaseSequencer` from `vitest/node`, `TestSpecification`), Node child_process spawn, tsx ^4.22.3.

## Global Constraints

- `WeightBalancedSequencer` is set at the **ROOT** `test.sequence.sequencer` (ProjectConfig omits `sequencer`). It is a no-op unless `--shard` is passed (vitest gates `shard()` on `config.shard`), so local `pnpm test` and the x-audits' `vitest run <file>` are unaffected.
- `shard()` must be a **clean cover**: every spec in exactly one leg, union = all specs. The serial project stays `fileParallelism:false`; each leg boots its own Supabase (PR D). Determinism across the 2 runners comes from the committed weight map + a **lexical tie-break** in the sort.
- `FILE_WEIGHTS` keys are **repo-relative, forward-slashed** (`tests/...`). The sequencer normalizes `spec.moduleId` to that form before lookup.
- B: spawn the **absolute** `join(REPO_ROOT, "node_modules/.bin/tsx")` (REPO_ROOT = `process.cwd()`), because the harness spawns in a temp cwd with no `node_modules` (the PR-C trap). Args unchanged **after dropping the former `"tsx"` argv item**.
- `unit-suite.yml` and `unit-suite-shard-topology.test.ts` are **UNCHANGED** (2-leg ship; `--shard=i/2` identical).
- TDD per task; commit per task; conventional commits.

---

## File Structure

- **Create** `lib/test/vitest.weights.ts` — `DEFAULT_WEIGHT` + `FILE_WEIGHTS` (the 4 known heavy serial files). Single source of truth, imported by the sequencer + the meta-test.
- **Create** `vitest.sequencer.ts` — pure `lptShard(...)` + `WeightBalancedSequencer extends BaseSequencer`.
- **Create** `tests/cross-cutting/vitest-shard-balance.test.ts` — the balance meta-test.
- **Create** `tests/cross-cutting/no-npx-tsx-spawn.test.ts` — pins the direct-bin convention (lever B guard).
- **Modify** `vitest.config.ts` — wire `sequence: { sequencer: WeightBalancedSequencer }` at root.
- **Modify** `tests/scripts/_report-fixtures-helpers.ts`, `tests/scripts/_cli-helpers.ts`, `tests/scripts/validation-env.test.ts`, `tests/scripts/extract-spec-codes-cli.test.ts` — `npx tsx` → absolute bin.

---

## Task 1: Weight-balanced sequencer (lever C, TDD)

**Files:** Create `lib/test/vitest.weights.ts`, `vitest.sequencer.ts`, `tests/cross-cutting/vitest-shard-balance.test.ts`; Modify `vitest.config.ts`.

- [ ] **Step 1: Create the weight map** `lib/test/vitest.weights.ts`:

```ts
// Single source of truth for the weight-balanced shard sequencer (PR E).
// Keys are repo-relative, forward-slashed. ONLY the heavy serial-DB files
// (>~10s) need entries; everything else uses DEFAULT_WEIGHT. A heavy file left
// out gets DEFAULT_WEIGHT and can re-cluster — the balance meta-test's
// no-stale-keys + 1.25x-mean guards catch committed-weight problems, but a NEW
// unweighted heavy file is caught only by the CI per-leg timing (spec §5).
export const DEFAULT_WEIGHT = 1500; // ms, rough light-file proxy

export const FILE_WEIGHTS: Record<string, number> = {
  "tests/scripts/validation-report-fixtures.test.ts": 76000, // measured
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts": 41000, // measured
  "tests/cross-cutting/no-global-cursor.test.ts": 30000, // estimated
  "tests/scripts/validation-check-seed.test.ts": 25000, // estimated
};
```

- [ ] **Step 2: Write the failing balance meta-test** `tests/cross-cutting/vitest-shard-balance.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { ENV_BOUND_EXCLUDES } from "@/vitest.projects";
import { DEFAULT_WEIGHT, FILE_WEIGHTS } from "@/lib/test/vitest.weights";
import { lptShard } from "@/vitest.sequencer";

// Structural guard for the weight-balanced shard partition (PR E). Exercises the
// REAL lptShard over the REAL test-file set (derived, not hardcoded) so a broken
// partition (drop/dup) or a re-clustered hot file fails CI. Mirrors
// vitest-projects-partition.test.ts's readdirSync discovery.
const ROOT = process.cwd();

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listTestFiles(full));
    else if (/\.test\.tsx?$/.test(ent.name)) out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

// What the sequencer sees in the unit-suite CI run: all test files minus the
// env-bound excludes (VITEST_EXCLUDE_ENV_BOUND=1). ENV_BOUND_EXCLUDES are
// "**/tests/.../x.test.ts" globs → reduce to the suffix for matching.
const envBoundSuffixes = ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, ""));
const allFiles = listTestFiles(join(ROOT, "tests")).filter(
  (f) => !envBoundSuffixes.some((s) => f.endsWith(s)),
);
const weightOf = (k: string) => FILE_WEIGHTS[k] ?? DEFAULT_WEIGHT;

const HOT = [
  "tests/scripts/validation-report-fixtures.test.ts",
  "tests/cross-cutting/validation-check-seed-content-coverage.test.ts",
];

describe("PR E weight-balanced shard partition", () => {
  it("discovers a non-trivial file set (anti-vacuity)", () => {
    expect(allFiles.length).toBeGreaterThan(400);
    for (const h of HOT) expect(allFiles, `${h} must be in the resolved set`).toContain(h);
  });

  for (const N of [2, 3]) {
    it(`N=${N}: bins are a clean cover of every file (no drop, no dup)`, () => {
      const bins = lptShard(allFiles, weightOf, N);
      expect(bins).toHaveLength(N);
      const flat = bins.flat();
      expect(flat).toHaveLength(allFiles.length); // no dup
      expect(new Set(flat)).toEqual(new Set(allFiles)); // exact cover
    });

    it(`N=${N}: no bin exceeds 1.25x the mean committed weight`, () => {
      const bins = lptShard(allFiles, weightOf, N);
      const loads = bins.map((b) => b.reduce((s, k) => s + weightOf(k), 0));
      const mean = loads.reduce((a, b) => a + b, 0) / N;
      for (const l of loads) expect(l).toBeLessThanOrEqual(mean * 1.25);
    });
  }

  it("N=2: the two hot files land in DIFFERENT legs", () => {
    const bins = lptShard(allFiles, weightOf, 2);
    const legOf = (f: string) => bins.findIndex((b) => b.includes(f));
    expect(legOf(HOT[0])).not.toBe(legOf(HOT[1]));
  });

  it("every FILE_WEIGHTS key maps to an existing test file (no stale keys)", () => {
    for (const k of Object.keys(FILE_WEIGHTS)) expect(allFiles, `stale weight key ${k}`).toContain(k);
  });

  it("vitest.config.ts wires the WeightBalancedSequencer at root", () => {
    const cfg = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    expect(/sequence:\s*\{[^}]*sequencer:\s*WeightBalancedSequencer/.test(cfg)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the meta-test to verify it FAILS**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-shard-balance.test.ts`
Expected: FAIL — `@/vitest.sequencer` has no `lptShard` export (module-resolve / undefined) and `vitest.config.ts` isn't wired yet.

- [ ] **Step 4: Implement the sequencer** `vitest.sequencer.ts`:

```ts
import { relative } from "node:path";

import { BaseSequencer } from "vitest/node";
import type { TestSpecification } from "vitest/node";

import { DEFAULT_WEIGHT, FILE_WEIGHTS } from "./lib/test/vitest.weights";

// LPT (longest-processing-time) greedy bin-packing. Pure + exported so the
// balance meta-test can exercise the real algorithm without a Vitest ctx.
// Total order via lexical tie-break → deterministic across the 2 CI runners.
export function lptShard(
  keys: string[],
  weightOf: (k: string) => number,
  count: number,
): string[][] {
  const sorted = [...keys].sort(
    (a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const bins = Array.from({ length: count }, () => ({ load: 0, keys: [] as string[] }));
  for (const k of sorted) {
    let t = 0;
    for (let i = 1; i < count; i++) if (bins[i].load < bins[t].load) t = i;
    bins[t].load += weightOf(k);
    bins[t].keys.push(k);
  }
  return bins.map((b) => b.keys);
}

export class WeightBalancedSequencer extends BaseSequencer {
  async shard(specs: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!; // only set under --shard
    const root = this.ctx.config.root;
    const keyFor = (s: TestSpecification) => relative(root, s.moduleId).split("\\").join("/");
    const byKey = new Map(specs.map((s) => [keyFor(s), s]));
    const bins = lptShard([...byKey.keys()], (k) => FILE_WEIGHTS[k] ?? DEFAULT_WEIGHT, count);
    return bins[index - 1].map((k) => byKey.get(k)!);
  }
  // sort() inherited from BaseSequencer (project grouping + fileParallelism:false untouched).
}
```

- [ ] **Step 5: Wire the sequencer** in `vitest.config.ts` — add to the **root** `test` block (sibling of `environment`/`projects`), and import it:

```ts
import { WeightBalancedSequencer } from "./vitest.sequencer";
// ...
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["tests/setup.ts"],
    sequence: { sequencer: WeightBalancedSequencer },
    projects: [ /* unchanged */ ],
  },
```

- [ ] **Step 6: Run the meta-test to verify it PASSES**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-shard-balance.test.ts`
Expected: PASS (all cases — clean cover for N=2 & N=3, hot files split, ≤1.25× mean, no stale keys, config wired).

- [ ] **Step 7: Run the existing CI-structure meta-tests (no regression)**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts tests/cross-cutting/ci-workflow-speedup.test.ts`
Expected: PASS. (The sequencer doesn't change project membership, so partition holds; YAML unchanged, so topology + ci-workflow-speedup hold.)

- [ ] **Step 8: Empirically confirm the sequencer partitions a real run** (parallel project only, DB-free) — proves `shard()` clean-covers under an actual `vitest run`, not just `lptShard` in isolation:

```bash
export TEST_DATABASE_URL="postgresql://x@127.0.0.1:1/x" SUPABASE_URL="http://127.0.0.1:1" \
  NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:1" NEXT_PUBLIC_SUPABASE_ANON_KEY="x" SUPABASE_SERVICE_ROLE_KEY="x"
pnpm exec vitest run --project=parallel --shard=1/2 2>&1 | grep 'Test Files'
pnpm exec vitest run --project=parallel --shard=2/2 2>&1 | grep 'Test Files'
```
Expected: the two counts sum to the full parallel count with neither 0 (clean partition under the new sequencer). (Full both-project balance is the CI gate, Task 4.)

- [ ] **Step 9: tsc + prettier + eslint** on the new/changed files:

Run: `pnpm exec tsc --noEmit && pnpm exec prettier --check . && pnpm exec eslint vitest.sequencer.ts lib/test/vitest.weights.ts tests/cross-cutting/vitest-shard-balance.test.ts`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add lib/test/vitest.weights.ts vitest.sequencer.ts vitest.config.ts tests/cross-cutting/vitest-shard-balance.test.ts
git commit --no-verify -m "perf(infra): weight-balanced vitest shard sequencer (split the 2 hot serial files)"
```

---

## Task 2: Direct-bin tsx (lever B, TDD)

**Files:** Create `tests/cross-cutting/no-npx-tsx-spawn.test.ts`; Modify `tests/scripts/_report-fixtures-helpers.ts`, `_cli-helpers.ts`, `validation-env.test.ts`, `extract-spec-codes-cli.test.ts`.

- [ ] **Step 1: Write the failing convention guard** `tests/cross-cutting/no-npx-tsx-spawn.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// PR E lever B: the report-fixtures + cli harnesses spawn tsx in a hot path.
// Pin the direct-bin convention so a regression back to `npx tsx` (npx resolver
// cold-start ~0.25-0.5s/spawn × 42-66 spawns) can't silently creep in.
const SCRIPTS_DIR = join(process.cwd(), "tests", "scripts");

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe("no `npx tsx` spawns in tests/scripts (use the absolute tsx bin)", () => {
  it.each(tsFiles(SCRIPTS_DIR))("%s spawns tsx via the bin, not npx", (file) => {
    const src = readFileSync(file, "utf8");
    // a spawn whose command is the literal "npx" with a "tsx" arg
    expect(/["']npx["']\s*,\s*\[\s*["']tsx["']/.test(src), `${file} still spawns \`npx tsx\``).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `pnpm exec vitest run tests/cross-cutting/no-npx-tsx-spawn.test.ts`
Expected: FAIL on `_report-fixtures-helpers.ts`, `_cli-helpers.ts`, `validation-env.test.ts`, `extract-spec-codes-cli.test.ts` (they spawn `"npx", ["tsx", ...]`).

- [ ] **Step 3: Add a shared `TSX_BIN` + swap the spawns.** In `tests/scripts/_report-fixtures-helpers.ts`, near `REPO_ROOT` (line ~18), add and export:

```ts
export const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
```

Then at each site replace `"npx", ["tsx", ...rest]` with `TSX_BIN, [...rest]` (drop the `"tsx"` arg; the rest — `"--tsconfig", TSCONFIG_PATH, <script>, ...` — is unchanged):
- `_report-fixtures-helpers.ts:89` → `spawnSync(TSX_BIN, ["--tsconfig", TSCONFIG_PATH, REPORT_FIXTURES_SCRIPT, ...args, "--allow-local-override"], { cwd, ... })`
- `_cli-helpers.ts:46` → import `TSX_BIN` from `./_report-fixtures-helpers`, replace `"npx", ["tsx", ...x]` with `TSX_BIN, [...x]`.
- `validation-env.test.ts:48,147,179,211` → same (these resolve their own `REPO_ROOT`/abs script paths already; reuse `TSX_BIN` or build `join(process.cwd(), "node_modules/.bin/tsx")` locally).
- `extract-spec-codes-cli.test.ts:51` → same.

(Verify each site's args after the `"tsx"` item are absolute paths or cwd-independent, per the spec — they are: `--tsconfig`/script are abs constants.)

- [ ] **Step 4: Run the guard to verify it PASSES**

Run: `pnpm exec vitest run tests/cross-cutting/no-npx-tsx-spawn.test.ts`
Expected: PASS.

- [ ] **Step 5: Sanity — the swapped helpers still execute** (needs local Supabase; if unavailable locally, defer this exact check to the CI run in Task 4, which runs the report-fixtures file): run `pnpm exec vitest run tests/scripts/extract-spec-codes-cli.test.ts` (the lightest tsx-spawn file, DB-free) and confirm it passes with the direct bin.

Run: `pnpm exec vitest run tests/scripts/extract-spec-codes-cli.test.ts`
Expected: PASS (proves the absolute-bin spawn works from the test's cwd).

- [ ] **Step 6: tsc + prettier + commit**

```bash
pnpm exec tsc --noEmit && pnpm exec prettier --check .
git add tests/cross-cutting/no-npx-tsx-spawn.test.ts tests/scripts/_report-fixtures-helpers.ts tests/scripts/_cli-helpers.ts tests/scripts/validation-env.test.ts tests/scripts/extract-spec-codes-cli.test.ts
git commit --no-verify -m "perf(infra): spawn tsx via the absolute bin (drop npx resolver cold-start in report-fixtures)"
```

---

## Task 3: Push, open PR, real-CI balance gate (measure-then-tune)

**Files:** none unless tuning is needed (then `lib/test/vitest.weights.ts`).

- [ ] **Step 1:** push `chore/ci-speedup-pr-e`, open the PR (body: scope = C+B; PR F = supabase-x; "do not auto-merge until the two shard legs are confirmed balanced").
- [ ] **Step 2:** the `pull_request` run exercises the new sequencer + the direct-bin spawns on real CI. Watch `unit-suite-shard (1)` / `(2)` + the `unit-suite` aggregator.
- [ ] **Step 3: Measure-then-tune (spec §5).** Read both leg wall-clocks (`gh run view <id> --json jobs`). **Accept** if both green AND `max(leg) < pre-PR-E long pole (~8.1m)` AND legs within **~60s**. **If skew >60s:** update `FILE_WEIGHTS` from the measured timing (e.g. lower the report-fixtures weight to its post-lever-B value; raise an under-weighted file), re-run the balance meta-test + push, re-measure. (The legs being green is non-negotiable; balance is best-effort.)
- [ ] **Step 4:** confirm all 12 required checks green; `unit-suite-shard (1)/(2)` appear as non-required.

---

## Task 4: Adversarial review (cross-model)

- [ ] **Step 1:** whole-diff Codex review (inlined/no-tool, verdict-first — per `feedback_codex_exec_inlined_no_tool_review`). Iterate to APPROVE. Address CRITICAL/HIGH by amending the diff (re-run Tasks 1–2 verifications), not by relitigating the spec's accepted decisions.
- [ ] **Step 2:** confirm real CI green (separate gate from local + review green).

---

## Task 5: Merge + sync + queue PR F

- [ ] **Step 1:** merge (`gh pr merge --merge`; auto-merge OK now that all 12 required checks are substantive, but watch the shard legs green first). Handle the merge-race per `feedback_deferred_md_conflict_and_prettier_after_resolution` (push at a main-quiet gap; full tsc+prettier+eslint locally before each push).
- [ ] **Step 2:** fast-forward local main; confirm `rev-list --left-right --count main...origin/main == 0 0`.
- [ ] **Step 3:** start **PR F** (`supabase start -x imgproxy,mailpit,studio,postgres-meta,edge-runtime` in `scripts/ci/supabase-local-bootstrap.sh`) with its own `workflow_dispatch` verification of crew-e2e / screenshots-drift / help-affordances.

---

## Self-Review

- **Spec coverage:** §3.1 sequencer → Task 1 (weights/sequencer/config/meta-test). §3.2 lever B → Task 2. §4 meta-tests → Tasks 1–2 (balance + no-npx guards; partition/topology/ci-workflow-speedup unaffected, asserted in Task 1 Step 7). §5 measure-then-tune → Task 3 Step 3. §6 PR-F split → Task 5 Step 3. Covered.
- **Placeholder scan:** PR body / review brief authored at execution time (acceptable); all code steps have literal content.
- **Type/name consistency:** `lptShard(keys, weightOf, count): string[][]`, `WeightBalancedSequencer`, `FILE_WEIGHTS`/`DEFAULT_WEIGHT`, `TSX_BIN`, `sequence: { sequencer: WeightBalancedSequencer }` — consistent across the sequencer, the config wiring, and both meta-tests.
