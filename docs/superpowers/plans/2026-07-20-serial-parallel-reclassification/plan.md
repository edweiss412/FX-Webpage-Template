# Serial→parallel reclassification — implementation plan

> **For agentic workers:** implement task-by-task, TDD per task, commit per task.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the 533 committed DB-free files from the serial vitest project to
the parallel project via a committed allowlist, add the standing guards, rebalance
the CI shard topology, and gate merge on a measured CI-wall win.

**Spec:** `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification.md`
(APPROVED, Codex R5).

## Global Constraints

- No UI touched, so no impeccable gate.
- The two committed lists (`tests/probes/db-free-movable.txt` 533,
  `tests/probes/db-touching-serial.txt` 186) are the source of truth; already
  committed. Tasks consume them, do not regenerate them by hand.
- `DB_BINDING_SIGNALS` is ONE shared constant used by both the static-guard
  meta-test and the regeneration sweep (spec §3.2/§3.4).
- Merge gate: `candidate ≤ baseline − 30s` on `mean2` valid `unit-suite` walls
  (spec §4). A regression/sub-margin result is a blocker; do not merge.

## Meta-test inventory (declared)

- **EXTENDS** `tests/cross-cutting/vitest-projects-partition.test.ts` — the
  `parallel.include` equality (line 133) must change; add the well-formed-list
  describe block (7 assertions).
- **CREATES** `tests/cross-cutting/db-free-movable-static-guard.test.ts` — the
  DB-binding source-scan guard.
- **EXTENDS** `tests/cross-cutting/unit-suite-shard-topology.test.ts` — `DB_LEGS`
  / `NODB_LEGS` constants change to the rebalanced counts.
- No advisory-lock / Supabase-call-boundary / admin-alert surfaces touched.

---

### Task 1: Config reads the committed allowlist (`DB_FREE_MOVABLE`)

**Files:**
- Modify: `vitest.projects.ts` (add `DB_FREE_MOVABLE` export)
- Modify: `vitest.config.ts` (replace the `movableList` env block + its two usages)
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts:130-137`

**Interfaces produced:** `export const DB_FREE_MOVABLE: readonly string[]`.

- [ ] **Step 1: Failing test** — update the single-source-of-truth assertion to
  expect the moved files in `parallel.include` and absent from serial. In
  `vitest-projects-partition.test.ts`, change line 133 and add serial-exclude
  coverage:

```ts
import { PARALLEL_TEST_GLOBS, DB_FREE_MOVABLE } from "@/vitest.projects";
// ...
it("parallel.include IS PARALLEL_TEST_GLOBS + DB_FREE_MOVABLE and serial.exclude contains both", () => {
  const { parallel, serial } = projects();
  expect(parallel.include).toEqual([...PARALLEL_TEST_GLOBS, ...DB_FREE_MOVABLE]);
  for (const g of PARALLEL_TEST_GLOBS) expect(serial.exclude).toContain(g);
  for (const f of DB_FREE_MOVABLE) expect(serial.exclude).toContain(f);
});
```

- [ ] **Step 2: Run, expect FAIL** (`DB_FREE_MOVABLE` undefined / include mismatch):
  `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
- [ ] **Step 3: Implement.** In `vitest.projects.ts`, add:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// The committed DB-free allowlist (spec §3.1). Each line is a repo-relative test
// path verified DB-free by the DB-touch instrumentation (spec §1.1). New files
// default SERIAL; a file joins this list only via `pnpm ci:regen-db-free`.
export const DB_FREE_MOVABLE: readonly string[] = readFileSync(
  join(HERE, "tests/probes/db-free-movable.txt"),
  "utf8",
).split("\n").map((l) => l.trim()).filter(Boolean);
```
  In `vitest.config.ts`, delete the `movableList` env block (lines 39-52) and
  replace both usages with `DB_FREE_MOVABLE` (imported from the `vitest.projects` module):
  serial `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS,
  ...DB_FREE_MOVABLE, ...envBoundExcludes, ...nightlyExcludes]`; parallel
  `include: [...PARALLEL_TEST_GLOBS, ...DB_FREE_MOVABLE]`.

- [ ] **Step 4: Run, expect PASS.** Also run the full partition test file.
- [ ] **Step 5: Commit** `feat(infra): config reads committed DB-free allowlist`

---

### Task 2: Well-formed-allowlist assertions (partition meta-test)

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`
- Test data: `tests/probes/db-free-movable.txt`, `tests/probes/db-touching-serial.txt`

- [ ] **Step 1: Failing test** — add a describe block. Each assertion states the
  failure mode it catches (spec §3.2 items 1-7):

```ts
import { DB_FREE_MOVABLE, ENV_BOUND_EXCLUDES, BASE_INCLUDE } from "@/vitest.projects";
const DB_TOUCHING = readFileSync(join(ROOT, "tests/probes/db-touching-serial.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter(Boolean);

describe("db-free-movable list is well-formed and safe", () => {
  it("every file exists and is a real test file (catches a stale/renamed path)", () => {
    for (const f of DB_FREE_MOVABLE) expect(existsSync(join(ROOT, f)), f).toBe(true);
  });
  it("no file is in a PARALLEL_TEST_GLOBS dir (catches a no-op/double-include)", () => {
    for (const f of DB_FREE_MOVABLE) expect(isInParallelGlob(f), f).toBe(false);
  });
  it("sorted + unique (catches an unstable-diff append)", () => {
    expect([...DB_FREE_MOVABLE]).toEqual([...new Set(DB_FREE_MOVABLE)].sort());
  });
  it("disjoint from the DB-touching record (catches a mislabeled DB file)", () => {
    const db = new Set(DB_TOUCHING);
    expect(DB_FREE_MOVABLE.filter((f) => db.has(f))).toEqual([]);
  });
  it("held starver is NOT movable (catches criterion-3 regression)", () => {
    expect(DB_FREE_MOVABLE).not.toContain("tests/cross-cutting/no-global-cursor.test.ts");
  });
  it("disjoint from ENV_BOUND_EXCLUDES (spec R5: env-bound must not survive in parallel)", () => {
    const env = new Set(ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, "")));
    expect(DB_FREE_MOVABLE.filter((f) => env.has(f))).toEqual([]);
  });
});
```
  (`isInParallelGlob` is the existing helper at line 59; `ROOT` is the repo root
  the file already computes.)

- [ ] **Step 2: Run, expect PASS immediately** (the committed list already satisfies
  these; the test's job is to FAIL on a future bad edit). Verify by a temporary
  local mutation (append a dupe) that it fails, then revert.
- [ ] **Step 3: (no impl — data already correct.)**
- [ ] **Step 4: Run full file — PASS.**
- [ ] **Step 5: Commit** `test(infra): well-formed-allowlist assertions for DB-free move`

---

### Task 3: Static DB-binding guard + shared `DB_BINDING_SIGNALS`

**Files:**
- Create: `lib/test/dbBindingSignals.ts` (shared constant + matcher)
- Create: `tests/cross-cutting/db-free-movable-static-guard.test.ts`

- [ ] **Step 1: Failing test** — new file:

```ts
// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DB_FREE_MOVABLE } from "@/vitest.projects";
import { hasDbBindingSignal } from "@/lib/test/dbBindingSignals";

const ROOT = process.cwd();
describe("db-free-movable static DB-binding guard (spec §3.2, primary criterion-4/5)", () => {
  it("no movable file matches a DB-binding signal (catches an edit that adds DB access)", () => {
    const offenders = DB_FREE_MOVABLE.filter((f) => {
      const p = join(ROOT, f);
      return existsSync(p) && hasDbBindingSignal(f, readFileSync(p, "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement** `lib/test/dbBindingSignals.ts` — the single source
  the §3.4 sweep also imports:

```ts
// DB-binding signals (spec §3.2 / §3.4). ONE definition, consumed by the CI
// static guard AND the regeneration sweep, so the tripwire is never narrower
// than the sweep that built the allowlist.
const DRIVER = /from\s+["']postgres["']|require\(\s*["']postgres["']\s*\)/;
const DB_URL_ENV = /process\.env\.[A-Z0-9_]*DATABASE_URL/;
const PG_CLIENT = /\bpostgres\s*\(/;
const LOCAL_URL = /(?:127\.0\.0\.1|localhost):(?:5432|54321|54322)/;
const CP_IMPORT = /from\s+["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\)/;
const DB_TOKEN = /\bpsql\b|databaseUrl|postgres:\/\/|_validation-cleanup-helpers|supabase\s+db/;
const DB_FILENAME = /\.db\.test\.tsx?$|real-?db/;

export function hasDbBindingSignal(relPath: string, src: string): boolean {
  if (DB_FILENAME.test(relPath)) return true;
  if (DRIVER.test(src) || DB_URL_ENV.test(src) || PG_CLIENT.test(src) || LOCAL_URL.test(src)) return true;
  if (CP_IMPORT.test(src) && DB_TOKEN.test(src)) return true;
  return false;
}
```

- [ ] **Step 4: Run — PASS** (committed list is clean).
- [ ] **Step 5: Commit** `test(infra): static DB-binding guard for the DB-free allowlist`

---

### Task 4: Regeneration script + nightly drift workflow

**Files:**
- Create: `scripts/regen-db-free.mjs` (wrap probe + sweep; `--check` mode)
- Modify: `package.json` (add `ci:regen-db-free`)
- Create: `.github/workflows/db-free-drift.yml`

- [ ] **Step 1: Failing test** — a smoke test that `--check` exits 0 on the
  committed lists (a fresh full DB run is out of unit-test scope; assert the
  `--check` DIFF logic against the committed files with the probe step stubbed):

```ts
// tests/cross-cutting/regen-db-free-check.test.ts
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
describe("ci:regen-db-free --check", () => {
  it("exits 0 when committed lists match the (stubbed) freshly-swept lists", () => {
    // REGEN_DB_FREE_STUB points the script at a fixture classification == committed.
    expect(() => execFileSync("node", ["scripts/regen-db-free.mjs", "--check"],
      { env: { ...process.env, REGEN_DB_FREE_STUB: "1" } })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (script missing).
- [ ] **Step 3: Implement** `scripts/regen-db-free.mjs`: default mode re-runs the
  probe + `scripts/movable-serial.mjs` + `hasDbBindingSignal` sweep and REWRITES
  the two lists; `--check` computes the same and `process.exit(1)` on any diff
  from the committed files (printing the diff). `REGEN_DB_FREE_STUB=1` skips the
  DB run and reads a committed fixture classification (so the unit test needs no
  DB). Add `"ci:regen-db-free": "node scripts/regen-db-free.mjs"` to package.json.
  Create `.github/workflows/db-free-drift.yml`: `schedule: cron: '0 7 * * *'` +
  `workflow_dispatch`, boots Supabase via `scripts/ci/supabase-local-bootstrap.sh`,
  runs `pnpm ci:regen-db-free --check`.

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(infra): regen-db-free generator + nightly drift check`

---

### Task 5: CI topology rebalance (db 3 / nodb 5)

**Files:**
- Modify: `.github/workflows/unit-suite.yml` (matrix shard counts + `--shard` denominators + header comment)
- Modify: `tests/cross-cutting/unit-suite-shard-topology.test.ts:34-35`

- [ ] **Step 1: Failing test** — set the new expected counts:

```ts
const DB_LEGS = 3;
const NODB_LEGS = 5;
```

- [ ] **Step 2: Run, expect FAIL** (workflow still 8/3):
  `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
- [ ] **Step 3: Implement** — in `unit-suite.yml`: `unit-suite-db` matrix
  `shard: [1,2,3]` and `--shard=${{ matrix.shard }}/3`; `unit-suite-nodb` matrix
  `shard: [1,2,3,4,5]` and `--shard=${{ matrix.shard }}/5`; update the header
  comment (lines 17-18) to `3 legs` / `5 legs`. Leave `workflow_dispatch:` enabled
  for the §4 measurement.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `perf(infra): rebalance unit-suite to 3 db + 5 nodb shards`

---

### Task 6: Remove the spike-only lever + verify whole diff locally

**Files:**
- Modify: `vitest.config.ts` (ensure no `VITEST_MOVABLE_LIST` residue)
- Modify: spike findings doc lever mention (if any dangling reference)

- [ ] **Step 1:** Grep the tree for `VITEST_MOVABLE_LIST`; remove any residue
  (Task 1 already deleted the config block — confirm zero hits outside the spike
  findings doc, which may keep a historical mention).
- [ ] **Step 2: Full local gate** (spec §4 step 1-2) on a fresh DB:
  `pnpm typecheck && pnpm lint && pnpm format:check`, then
  `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts tests/cross-cutting/db-free-movable-static-guard.test.ts tests/cross-cutting/unit-suite-shard-topology.test.ts`,
  then full `pnpm test` — must match the clean baseline (1 known flake:
  `email-canonicalization`), 0 DB corruption.
- [ ] **Step 3: Commit** any residue cleanup `chore(infra): drop spike-only movable-list lever`.

---

## Post-implementation (Stage 4, not a task)

Whole-diff Codex review → push → measure real CI (spec §4 protocol: 2 valid
baseline runs at the fork-point SHA, 2 valid candidate runs) → merge IFF
`candidate ≤ baseline − 30s` → fast-forward main. A sub-margin/regression result
is a blocker: report and do not merge.
