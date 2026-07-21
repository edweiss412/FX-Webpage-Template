# Serial to parallel reclassification — implementation plan

> **For agentic workers:** implement task-by-task, TDD per task, commit per task.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the 532 committed DB-free files from the serial vitest project to
the parallel project via a committed allowlist, add the standing guards, rebalance
the CI shard topology, and gate merge on a measured CI-wall win.

**Spec:** `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification.md`
(APPROVED, Codex R5).

**Shape:** 5 TDD tasks (each red, green, commit) + 1 verification STAGE (Task 6,
not TDD; a gate that runs the full local suite and commits only cleanup, if any).

## Global Constraints

- No UI touched, so no impeccable gate.
- The two committed lists (`tests/probes/db-free-movable.txt` 532,
  `tests/probes/db-touching-serial.txt` 186) are the source of truth; already
  committed. Tasks consume them.
- `DB_BINDING_SIGNALS` is ONE exported constant (an array of named regex signals)
  in `lib/test/dbBindingSignals.ts`, consumed by BOTH the static-guard meta-test
  AND the regeneration sweep (spec §3.2/§3.4). `hasDbBindingSignal` is a thin
  wrapper over it. Both are exported from the same module.
- Any `.mjs` script that consumes TypeScript (the matcher, `vitest.projects.ts`)
  is invoked via the repo's local `tsx` (precedent: `scripts/movable-serial.mjs`).
  Never `npx tsx` (pinned by `tests/cross-cutting/no-npx-tsx-spawn.test.ts`).
- Merge gate: `candidate ≤ baseline − 30s` on `mean2` valid `unit-suite` walls
  (spec §4). A regression/sub-margin result is a blocker; do not merge.

## Meta-test inventory (declared)

- **EXTENDS** `tests/cross-cutting/vitest-projects-partition.test.ts` — the
  `parallel.include` equality (line 133) changes; add the well-formed-list block
  (7 assertions).
- **CREATES** `lib/test/dbBindingSignals.ts` + its behavioral test
  `tests/cross-cutting/dbBindingSignals.test.ts` (table-driven positive/negative).
- **CREATES** `tests/cross-cutting/db-free-movable-static-guard.test.ts`.
- **CREATES** `scripts/regen-db-free.mjs` + `tests/cross-cutting/regen-db-free-check.test.ts`.
- **CREATES** `.github/workflows/db-free-drift.yml` + a structural wiring test.
- **EXTENDS** `tests/cross-cutting/unit-suite-shard-topology.test.ts` — `DB_LEGS`
  / `NODB_LEGS`.
- No advisory-lock / Supabase-call-boundary / admin-alert surfaces touched.

---

### Task 1: Config reads the committed allowlist (`DB_FREE_MOVABLE`)

**Files:**
- Modify: `vitest.projects.ts` (add `DB_FREE_MOVABLE` export)
- Modify: `vitest.config.ts` (replace the `movableList` env block + its two usages)
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts` (line 133 assertion)

**Interfaces produced:** `export const DB_FREE_MOVABLE: readonly string[]`.

- [ ] **Step 1: Failing test** — update the single-source-of-truth assertion:

```ts
import { PARALLEL_TEST_GLOBS, DB_FREE_MOVABLE } from "@/vitest.projects";
it("parallel.include IS PARALLEL_TEST_GLOBS + DB_FREE_MOVABLE and serial.exclude contains both", () => {
  const { parallel, serial } = projects();
  expect(parallel.include).toEqual([...PARALLEL_TEST_GLOBS, ...DB_FREE_MOVABLE]);
  for (const g of PARALLEL_TEST_GLOBS) expect(serial.exclude).toContain(g);
  for (const f of DB_FREE_MOVABLE) expect(serial.exclude).toContain(f);
});
```

- [ ] **Step 2: Run, expect FAIL** (`DB_FREE_MOVABLE` undefined / include mismatch):
  `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
- [ ] **Step 3: Implement.** In `vitest.projects.ts`:

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
  In `vitest.config.ts`, delete the `movableList` env block and replace both
  usages with `DB_FREE_MOVABLE` (imported from the `vitest.projects` module):
  serial `exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS,
  ...DB_FREE_MOVABLE, ...envBoundExcludes, ...nightlyExcludes]`; parallel
  `include: [...PARALLEL_TEST_GLOBS, ...DB_FREE_MOVABLE]`.

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(infra): config reads committed DB-free allowlist`

---

### Task 2: Well-formed-allowlist assertions (partition meta-test)

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`

- [ ] **Step 1: Write the 7 assertions AND stage a deliberate RED first**
  (Codex plan R5, observe failure before green). Before running, append ONE
  temporary duplicate line to `tests/probes/db-free-movable.txt` locally so the
  sorted+unique assertion is guaranteed to fail on first run:

```ts
import { DB_FREE_MOVABLE, ENV_BOUND_EXCLUDES, BASE_INCLUDE, TEST_FAST_DEFERRED } from "@/vitest.projects";
import { globToRegExp as globRe } from "@/lib/test/serialAudit";
const DB_TOUCHING = readFileSync(join(ROOT, "tests/probes/db-touching-serial.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter(Boolean);
const matchesBaseInclude = (f: string) => BASE_INCLUDE.some((g) => globRe(g).test(f));

describe("db-free-movable list is well-formed and safe", () => {
  it("A1 every entry is a real test file matching BASE_INCLUDE (Codex R4)", () => {
    for (const f of DB_FREE_MOVABLE) {
      expect(existsSync(join(ROOT, f)), `${f} missing`).toBe(true);
      expect(matchesBaseInclude(f), `${f} not a BASE_INCLUDE test`).toBe(true);
    }
  });
  it("A2 no entry is in a PARALLEL_TEST_GLOBS dir (no-op/double-include)", () => {
    for (const f of DB_FREE_MOVABLE) expect(isInParallelGlob(f), f).toBe(false);
  });
  it("A3 sorted + unique (unstable-diff append)", () => {
    expect([...DB_FREE_MOVABLE]).toEqual([...new Set(DB_FREE_MOVABLE)].sort());
  });
  it("A4 disjoint from the DB-touching record (mislabeled DB file)", () => {
    const db = new Set(DB_TOUCHING);
    expect(DB_FREE_MOVABLE.filter((f) => db.has(f))).toEqual([]);
  });
  it("A5 held starver is NOT movable (criterion-3 regression)", () => {
    expect(DB_FREE_MOVABLE).not.toContain("tests/cross-cutting/no-global-cursor.test.ts");
  });
  it("A6 disjoint from ENV_BOUND_EXCLUDES (spec R5)", () => {
    const env = new Set(ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, "")));
    expect(DB_FREE_MOVABLE.filter((f) => env.has(f))).toEqual([]);
  });
  it("A7 disjoint from TEST_FAST_DEFERRED (no test:fast project-selection clash)", () => {
    const tf = new Set(TEST_FAST_DEFERRED);
    expect(DB_FREE_MOVABLE.filter((f) => tf.has(f))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run with the temporary duplicate present, expect FAIL** (A3):
  `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
- [ ] **Step 3: Revert the temporary duplicate** (`git checkout tests/probes/db-free-movable.txt`).
- [ ] **Step 4: Run, expect PASS** (the committed list satisfies all 7).
- [ ] **Step 5: Commit** `test(infra): well-formed-allowlist assertions for DB-free move`

---

### Task 3: Shared `DB_BINDING_SIGNALS` + behavioral matcher tests

**Files:**
- Create: `lib/test/dbBindingSignals.ts` (exports `DB_BINDING_SIGNALS` + `hasDbBindingSignal`)
- Create: `tests/cross-cutting/dbBindingSignals.test.ts` (table-driven behavior)

**Interfaces produced:**
`export const DB_BINDING_SIGNALS: readonly { name: string; test: (relPath: string, src: string) => boolean }[]`
and `export function hasDbBindingSignal(relPath: string, src: string): boolean`.

- [ ] **Step 1: Failing behavioral test** (Codex plan R3, anti-tautology; the
  matcher must catch positives, not just pass the 532):

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hasDbBindingSignal } from "@/lib/test/dbBindingSignals";

const POSITIVE: [string, string, string][] = [
  ["driver from-import", "a.test.ts", `import postgres from "postgres";`],
  ["driver require", "a.test.ts", `const p = require("postgres");`],
  ["driver dynamic import", "a.test.ts", `await import("postgres");`],
  ["DATABASE_URL dotted", "a.test.ts", `const u = process.env.TEST_DATABASE_URL;`],
  ["DATABASE_URL bracket", "a.test.ts", `const u = process.env["VALIDATION_DATABASE_URL"];`],
  ["postgres() call", "a.test.ts", `const sql = postgres(url);`],
  ["local pg url literal", "a.test.ts", `const u = "127.0.0.1:54322";`],
  ["child_process node: + token", "a.test.ts", `import { execFileSync } from "node:child_process"; execFileSync("psql", []);`],
  ["child_process bare + token", "a.test.ts", `import { execFileSync } from "child_process"; run("psql");`],
  ["child_process/promises + token", "a.test.ts", `import { execFile } from "node:child_process/promises"; run("psql");`],
  ["db filename", "x.db.test.ts", `export {};`],
  ["real-db filename", "foo.real-db.test.ts", `export {};`],
];
const NEGATIVE: [string, string, string][] = [
  ["pure unit test", "a.test.ts", `import { render } from "@testing-library/react";`],
  ["mocked supabase, no driver", "a.test.ts", `vi.mock("@/lib/supabase/server"); createClient();`],
  ["non-DB port in an assertion string", "a.test.ts", `expect(row).toEqual(["127.0.0.1:9999"]);`],
  ["child_process WITHOUT a db token", "a.test.ts", `import { spawn } from "node:child_process"; spawn("git", ["log"]);`],
  ["DATABASE_URL only inside a comment", "a.test.ts", `// process.env.TEST_DATABASE_URL read elsewhere\nexport {};`],
];

describe("hasDbBindingSignal", () => {
  it.each(POSITIVE)("flags %s", (_n, p, src) => expect(hasDbBindingSignal(p, src)).toBe(true));
  it.each(NEGATIVE)("does NOT flag %s", (_n, p, src) => expect(hasDbBindingSignal(p, src)).toBe(false));
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement** `lib/test/dbBindingSignals.ts`. Strip comments before
  matching (avoids the comment false-positive); driver covers dynamic import; env
  covers bracket form; child_process covers bare + `/promises`; a bare port
  literal counts only with a DB port (5432/54321/54322):

```ts
const stripComments = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

export const DB_BINDING_SIGNALS: readonly { name: string; test: (relPath: string, src: string) => boolean }[] = [
  { name: "db-filename", test: (p) => /\.db\.test\.tsx?$|real-?db/.test(p) },
  { name: "postgres-driver", test: (_p, s) => /(?:from|import)\s*\(?\s*["']postgres["']|require\(\s*["']postgres["']\s*\)/.test(s) },
  { name: "database-url-env", test: (_p, s) => /process\.env\.[A-Z0-9_]*DATABASE_URL|process\.env\[\s*["'][A-Z0-9_]*DATABASE_URL["']\s*\]/.test(s) },
  { name: "postgres-client-call", test: (_p, s) => /\bpostgres\s*\(/.test(s) },
  { name: "local-pg-url", test: (_p, s) => /(?:127\.0\.0\.1|localhost):(?:5432|54321|54322)\b/.test(s) },
  { name: "subprocess-db", test: (_p, s) =>
      /(?:from|import)\s*\(?\s*["'](?:node:)?child_process(?:\/promises)?["']|require\(\s*["'](?:node:)?child_process(?:\/promises)?["']\s*\)/.test(s)
      && /\bpsql\b|databaseUrl|postgres:\/\/|_validation-cleanup-helpers|supabase\s+db/.test(s) },
];

export function hasDbBindingSignal(relPath: string, rawSrc: string): boolean {
  const src = stripComments(rawSrc);
  return DB_BINDING_SIGNALS.some((sig) => sig.test(relPath, src));
}
```

- [ ] **Step 4: Run, expect PASS** (all positives flagged, all negatives clear).
- [ ] **Step 5: Commit** `test(infra): shared DB_BINDING_SIGNALS + behavioral matcher tests`

---

### Task 4: Static guard over the allowlist + regen script + nightly drift

**Files:**
- Create: `tests/cross-cutting/db-free-movable-static-guard.test.ts`
- Create: `scripts/regen-db-free.mjs`
- Create: `tests/probes/__fixtures__/drift-classification.json` (DIFFERS from the
  committed lists, so `--check` is exercised on a real mismatch)
- Create: `tests/cross-cutting/regen-db-free-check.test.ts`
- Create: `.github/workflows/db-free-drift.yml`
- Modify: `package.json` (`ci:regen-db-free`)

- [ ] **Step 1a: Static-guard test** (allowlist has no DB-binding file):

```ts
// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DB_FREE_MOVABLE } from "@/vitest.projects";
import { hasDbBindingSignal } from "@/lib/test/dbBindingSignals";
const ROOT = process.cwd();
describe("db-free-movable static DB-binding guard (spec §3.2)", () => {
  it("no movable file matches a DB-binding signal", () => {
    const offenders = DB_FREE_MOVABLE.filter((f) =>
      existsSync(join(ROOT, f)) && hasDbBindingSignal(f, readFileSync(join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 1b: Regen `--check` test, BOTH outcomes** (Codex plan R1, the stub
  must exercise a real mismatch, not read the committed outputs):

```ts
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
const run = (env: Record<string, string>) =>
  execFileSync("pnpm", ["exec", "tsx", "scripts/regen-db-free.mjs", "--check"],
    { env: { ...process.env, ...env }, stdio: "pipe" });
describe("ci:regen-db-free --check", () => {
  it("exits 0 when the stub classification == the committed lists", () => {
    expect(() => run({ REGEN_DB_FREE_STUB: "committed" })).not.toThrow();
  });
  it("exits nonzero + prints a diff when the stub classification differs", () => {
    let code = 0, out = "";
    try { run({ REGEN_DB_FREE_STUB: "drift" }); } catch (e: any) { code = e.status; out = `${e.stdout}${e.stderr}`; }
    expect(code).not.toBe(0);
    expect(out).toMatch(/drift|differ|db-free-movable/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (script + fixture missing).
- [ ] **Step 3: Implement.**
  - `scripts/regen-db-free.mjs`: default mode re-runs the DB-touch probe
    (`DB_TOUCH_PROBE=1`), `scripts/movable-serial.mjs`, and the
    `hasDbBindingSignal` sweep, then REWRITES the two committed lists. `--check`
    computes the same, diffs against the committed files, prints the diff and
    `process.exit(1)` on any difference. `REGEN_DB_FREE_STUB` skips the DB run:
    `"committed"` loads the current committed lists (no diff, exit 0); `"drift"`
    loads `tests/probes/__fixtures__/drift-classification.json` (diff, exit 1).
    Invoked via `tsx` so it can import the TS matcher + `vitest.projects`.
  - `tests/probes/__fixtures__/drift-classification.json`: the committed movable
    list minus one entry plus one fabricated entry (a deterministic diff).
  - `package.json`: `"ci:regen-db-free": "tsx scripts/regen-db-free.mjs"`.
  - `.github/workflows/db-free-drift.yml`: `on: { schedule: [{cron: '0 7 * * *'}],
    workflow_dispatch: {} }`; job checks out, runs `./.github/actions/setup`,
    `supabase/setup-cli@v1` (2.107.0), `scripts/ci/supabase-local-bootstrap.sh`,
    then `pnpm ci:regen-db-free --check`.

- [ ] **Step 4: Structural workflow-wiring test** — add to
  `tests/cross-cutting/regen-db-free-check.test.ts` a block asserting
  `db-free-drift.yml` parses and contains the schedule cron, `workflow_dispatch`,
  the bootstrap step, and the `--check` invocation (string/regex on the YAML, same
  pattern as `unit-suite-shard-topology.test.ts`).
- [ ] **Step 5: Run, expect PASS. Commit** `feat(infra): regen-db-free generator + nightly drift check`

---

### Task 5: CI topology rebalance (db 3 / nodb 5)

**Files:**
- Modify: `.github/workflows/unit-suite.yml` (matrix counts + `--shard` denominators + header comment lines 17-18)
- Modify: `tests/cross-cutting/unit-suite-shard-topology.test.ts:34-35`

- [ ] **Step 1: Failing test** — set new counts:

```ts
const DB_LEGS = 3;
const NODB_LEGS = 5;
```

- [ ] **Step 2: Run, expect FAIL** (workflow still 8/3):
  `pnpm exec vitest run tests/cross-cutting/unit-suite-shard-topology.test.ts`
- [ ] **Step 3: Implement** — `unit-suite-db` matrix `shard: [1,2,3]` +
  `--shard=${{ matrix.shard }}/3`; `unit-suite-nodb` matrix `shard: [1,2,3,4,5]`
  + `--shard=${{ matrix.shard }}/5`; update header comment lines 17-18 to
  `3 legs` / `5 legs`. Keep `workflow_dispatch:` enabled for §4 measurement.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `perf(infra): rebalance unit-suite to 3 db + 5 nodb shards`

---

### Task 6: Verification STAGE (not TDD; Codex plan R7)

This is a gate, not a red→green task. It commits only if cleanup is needed.

- [ ] **Step 1:** `rg -n VITEST_MOVABLE_LIST` across the tree. Expected hits: only
  the spike findings doc (historical). Remove any residue in `vitest.config.ts` /
  `vitest.projects.ts` (Task 1 already deleted the block; confirm zero code hits).
- [ ] **Step 2: Full local gate** (spec §4 steps 1-2) on a fresh DB:
  `pnpm typecheck && pnpm lint && pnpm format:check`, then the four affected/new
  meta-test files, then full `pnpm test` — must match the clean baseline (1 known
  flake: `email-canonicalization`), 0 DB corruption.
- [ ] **Step 3:** If Step 1 removed residue, commit
  `chore(infra): drop spike-only movable-list lever`. If nothing changed, no
  commit (a verification stage legitimately produces none).

---

## Post-implementation (Stage 4, not a task)

Whole-diff Codex review → push → measure real CI (spec §4 protocol: 2 VALID
baseline runs at the fork-point SHA, 2 VALID candidate runs; a run with any
failed/cancelled/timed-out shard is discarded) → merge IFF
`candidate ≤ baseline − 30s` → fast-forward main. A sub-margin/regression result
is a blocker: report and do not merge.
