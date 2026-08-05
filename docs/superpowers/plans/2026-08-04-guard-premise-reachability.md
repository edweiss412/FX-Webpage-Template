# Guard Premise Reachability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a guard that cannot fail detectable before a reviewer finds it — by unblocking mutation-gate enrollment, enrolling the ledger surface, and making the premise convention executable.

**Architecture:** Four units. Unit 1 gives the mutation harness's per-mutant vitest config the root config's `@` alias and timeouts, which is what currently blocks enrolling 82% of this repo's suites. Unit 2 repairs the gate's single-surface liveness control and enrolls both ledger modules with triaged survivor ledgers. Unit 3 adds a `premise` helper plus a merge-gating checker that requires one on any enrolled-suite test whose environment provenance is reachable through the declaration-reference graph. Unit 4 records the rule where it is cross-CLI durable.

**Tech Stack:** TypeScript, vitest 4.1.5, the TypeScript compiler API (`ts.forEachChild`, already the mutation harness's enumeration mechanism), node 20.

**Spec:** `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md`. The spec is canonical; where this plan and the spec disagree, the spec wins and you open a question.

## Global Constraints

- **TDD per task** (plan-wide invariant 1): failing test → minimal implementation → passing test → commit. Never write implementation before the test that exercises it.
- **Commit per task** (invariant 6), conventional-commits style. Scopes in use here: `mutation`, `ledger`, `docs`, `test`.
- **Every executable fixture is named `*.fixture.ts`** and lives under `tests/mutation/source/fixtures/`. `BASE_INCLUDE` at `vitest.projects.ts:34` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, so a `*.fixture.ts` file is invisible to every default project. This is load-bearing: three of these fixtures MUST FAIL when run, and a discovered failing test would red the merge suite.
- **No `accepted` ledger row may have an environment-dependent verdict** (spec AC-6). If a mutant's verdict differs between a full clone and a zero-ref checkout, kill it with a test that constructs its own repository — never ledger it.
- **Adversarial review is WAIVED for this arc** by explicit user decision on 2026-08-04, because Codex is at its usage limit until 2026-08-10 21:36 and the spec already absorbed 12 rounds. The merge bar is **real CI green** plus the mutation gate's own criterion (score at or above floor, empty unaccepted-survivor set). This waiver is arc-scoped and does not change `AGENTS.md`.
- **Ledger marker** (invariant 12): `BL-GUARD-PREMISE-REACHABILITY` is marked `**Status:** IN PROGRESS · **Branch:** chore/guard-premise-reachability` in `BACKLOG.md`. Task 15 removes the marker in the PR's last commit, before the merge.

impeccable-gate: N/A — no UI surface

---

## File Structure

| file | responsibility |
| --- | --- |
| `vitest.projects.ts` | **modify** — gains `REPO_ALIAS` and `TEST_TIMEOUT_MS` as the single definition both configs read |
| `vitest.config.ts` | **modify** — consumes those instead of its own literals |
| `tests/mutation/source/mutantOverlay.config.ts` | **modify** — consumes them too; this is Unit 1's whole point |
| `tests/mutation/_metaOverlayConfigParity.test.ts (new)` | **create** — structural parity plus the alias fixture's child run |
| `tests/mutation/source/fixtures/*.fixture.ts` | **create** — six executable fixtures, none discovered |
| `tests/mutation/source/registry.ts` | **modify** — `control` field, its validation, two new surface rows |
| `tests/mutation/guardSurfaces.gate.test.ts` | **modify** — control runs per surface; `EXPECTED_LEDGER_KINDS` rows |
| `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | **modify** — rejection cases for the `control` field |
| `tests/_shared/premise.ts (new)` | **create** — the helper |
| `tests/mutation/source/premiseScan.ts (new)` | **create** — the declaration-reference traversal and the classifier |
| `tests/mutation/_metaPremiseContract.test.ts (new)` | **create** — the contract, its fixture matrix, its non-vacuity assertions |
| `tests/scripts/ledgerClaimsCheck.test.ts` | **modify** — survivor kills, two construction-based repairs, premises |
| `tests/scripts/ledgerClaims.test.ts` | **modify** — survivor kills |
| `docs/agents/writing-plans.md`, `AGENTS.md` | **modify** — Unit 4 |

---

## Task 1: Single definition for the alias and the timeouts

**Files:**
- Modify: `vitest.projects.ts` (append exports)
- Modify: `vitest.config.ts` lines 85-86 and 150
- Test: `tests/cross-cutting/db-test-timeout-floor.test.ts` (extend)

**Interfaces:**
- Produces: `REPO_ALIAS(root: string): Record<string, string>` and `TEST_TIMEOUT_MS: number` from `vitest.projects.ts`. Task 2 consumes both.

`vitest.projects.ts` has **zero imports** and no `process.` use — verified — so `mutantOverlay.config.ts` can import it without pulling vitest into a config that vite loads standalone.

- [ ] **Step 1: Write the failing test**

Append to `tests/cross-cutting/db-test-timeout-floor.test.ts`:

```ts
import { REPO_ALIAS, TEST_TIMEOUT_MS } from "@/vitest.projects";

describe("one definition, two readers (guard-premise Unit 1)", () => {
  it("the root config reads the shared timeout rather than its own literal", () => {
    expect(TEST_TIMEOUT_MS).toBe(TIMEOUT_FLOOR_MS);
    expect(rootTest?.testTimeout).toBe(TEST_TIMEOUT_MS);
    expect(rootTest?.hookTimeout).toBe(TEST_TIMEOUT_MS);
  });

  it("the shared alias maps @ to the root it is given", () => {
    expect(REPO_ALIAS("/tmp/anywhere")).toEqual({ "@": "/tmp/anywhere" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run tests/cross-cutting/db-test-timeout-floor.test.ts`
Expected: FAIL — `Failed to resolve import "@/vitest.projects"` has no `REPO_ALIAS` export.

- [ ] **Step 3: Add the definitions**

Append to `vitest.projects.ts`:

```ts
/**
 * The `@` alias, as one definition with two readers: the root config and the
 * mutation harness's per-mutant config. They drifted apart once already; the
 * overlay config had no alias at all, which made every suite importing through
 * `@/` (1461 of 1788) fail `assertCleanBaseline` on UNMUTATED source.
 */
export const REPO_ALIAS = (root: string): Record<string, string> => ({ "@": root });

/** Same rationale. Vitest's default is 5_000, which fails real suites. */
export const TEST_TIMEOUT_MS = 30_000;
```

- [ ] **Step 4: Point the root config at them**

In `vitest.config.ts`, import `REPO_ALIAS, TEST_TIMEOUT_MS` from the `vitest.projects` module, then replace the literals:

```ts
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
```

```ts
    alias: REPO_ALIAS(dirname(fileURLToPath(import.meta.url))),
```

- [ ] **Step 5: Run the test and the partition meta-test**

Run: `pnpm exec vitest run tests/cross-cutting/db-test-timeout-floor.test.ts tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS. The partition test reads `vitest.config.ts`'s projects and must be unaffected.

- [ ] **Step 6: Commit**

```bash
git add vitest.projects.ts vitest.config.ts tests/cross-cutting/db-test-timeout-floor.test.ts
git commit -m "refactor(mutation): one definition for the @ alias and the test timeouts"
```

---

## Task 2: The overlay config reaches parity, proven by a fixture that imports through `@/`

**Files:**
- Modify: `tests/mutation/source/mutantOverlay.config.ts` lines 31-40
- Create: `tests/mutation/source/fixtures/aliasImport.fixture.ts (new)`
- Create: `tests/mutation/_metaOverlayConfigParity.test.ts (new)`

**Interfaces:**
- Consumes: `REPO_ALIAS`, `TEST_TIMEOUT_MS` (Task 1).
- Produces: a green baseline for any `@/`-importing suite, which Tasks 6 and 8 depend on entirely.

The structural half of this guard can fail (revert a value, it reds). The executable half is the fixture: a real suite, run through the real overlay config by a real child vitest, importing through `@/`.

- [ ] **Step 1: Write the fixture it will run**

Create `tests/mutation/source/fixtures/aliasImport.fixture.ts (new)`:

```ts
/**
 * NOT a discovered test; `*.fixture.ts` cannot match BASE_INCLUDE
 * (vitest.projects.ts:34). Invoked as a child run by
 * tests/mutation/_metaOverlayConfigParity.test.ts.
 *
 * Its entire job is the `@/` import on the next line. If the overlay config
 * loses its alias, this file fails to resolve and the child run exits non-zero.
 */
import { expect, it } from "vitest";

import { siteId } from "@/tests/mutation/source/operators";

it("resolves a module through the @ alias", () => {
  expect(
    siteId({
      operator: "integer-literal",
      start: 0,
      end: 1,
      replacement: "1",
      line: 1,
      column: 1,
      from: "0",
      to: "1",
    }),
  ).toBe("integer-literal:1:1:0>1");
});
```

- [ ] **Step 2: Write the failing meta-test**

Create `tests/mutation/_metaOverlayConfigParity.test.ts (new)`:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ALIAS, TEST_TIMEOUT_MS } from "@/vitest.projects";

const ROOT = join(__dirname, "..", "..");
const FIXTURE = "tests/mutation/source/fixtures/aliasImport.fixture.ts";
const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/** Run one fixture through the real overlay config, serving CLEAN source. */
function childRun(fixture: string, target: string): number {
  try {
    execFileSync("pnpm", ["exec", "vitest", "run", "--config", CONFIG], {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        VITEST_INCLUDE_MUTATION_HARNESS: "1",
        MUTATION_ROOT: ROOT,
        MUTATION_TARGET: join(ROOT, target),
        MUTATION_MUTANT: join(ROOT, target),
        MUTATION_SUITE: fixture,
      },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("overlay config parity with the root config", () => {
  it("carries the shared alias and timeouts, not its own literals", async () => {
    process.env.MUTATION_ROOT = ROOT;
    process.env.MUTATION_TARGET = join(ROOT, "tests/mutation/source/operators.ts");
    process.env.MUTATION_MUTANT = join(ROOT, "tests/mutation/source/operators.ts");
    process.env.MUTATION_SUITE = FIXTURE;
    const cfg = (await import("@/tests/mutation/source/mutantOverlay.config")).default as {
      resolve?: { alias?: Record<string, string> };
      test?: { testTimeout?: number; hookTimeout?: number };
    };
    expect(cfg.resolve?.alias).toEqual(REPO_ALIAS(ROOT));
    expect(cfg.test?.testTimeout).toBe(TEST_TIMEOUT_MS);
    expect(cfg.test?.hookTimeout).toBe(TEST_TIMEOUT_MS);
  });

  it("runs a fixture that imports through @/, through the real config", () => {
    // The fixture's own premise: it must still contain the import this proves.
    const src = readFileSync(join(ROOT, FIXTURE), "utf8");
    expect(src, "fixture premise: it still imports through @/").toContain('from "@/');
    expect(childRun(FIXTURE, "tests/mutation/source/operators.ts")).toBe(0);
  });
});
```

- [ ] **Step 3: Run it and watch both cases fail**

Run: `pnpm exec vitest run tests/mutation/_metaOverlayConfigParity.test.ts`
Expected: FAIL — `cfg.resolve` is `undefined`, and the child run exits non-zero on an unresolved `@/` import.

- [ ] **Step 4: Give the overlay config parity**

In `tests/mutation/source/mutantOverlay.config.ts`, import `REPO_ALIAS, TEST_TIMEOUT_MS` from the `vitest.projects` module, then:

```ts
export default defineConfig({
  root: req("MUTATION_ROOT"),
  // Parity with the root config, from ONE definition. Without the alias every
  // suite importing through `@/` fails assertCleanBaseline on unmutated source;
  // without the timeout, vitest's 5_000 default does the same to any suite with
  // a slower test. Neither was in the harness spec's limits table.
  resolve: { alias: REPO_ALIAS(req("MUTATION_ROOT")) },
  plugins: [mutantOverlayPlugin(target, mutantSource)],
  test: {
    include: [req("MUTATION_SUITE")],
    environment: "node",
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    reporters: [["dot", {}]],
  },
});
```

- [ ] **Step 5: Run it green**

Run: `pnpm exec vitest run tests/mutation/_metaOverlayConfigParity.test.ts`
Expected: PASS, both cases.

- [ ] **Step 6: Prove the guard bites**

Temporarily delete the `resolve:` line, re-run, confirm FAIL on the child-run case; restore it. Then temporarily set `testTimeout: 5_000`, confirm the structural case FAILs; restore. Record both in the commit message.

- [ ] **Step 7: Commit**

```bash
git add tests/mutation/source/mutantOverlay.config.ts tests/mutation/source/fixtures/aliasImport.fixture.ts tests/mutation/_metaOverlayConfigParity.test.ts
git commit -m "fix(mutation): the per-mutant config resolves @/ and carries the root's timeouts"
```

---

## Task 3: The slow fixture, and the wiring assertion that keeps every fixture from going dark

**Files:**
- Create: `tests/mutation/source/fixtures/slowTest.fixture.ts (new)`
- Modify: `tests/mutation/guardSurfaces.gate.test.ts`
- Modify: `tests/mutation/_metaOverlayConfigParity.test.ts (new)`

**Interfaces:**
- Consumes: `childRun` (Task 2) — export it from the parity meta-test so the gate can reuse it.

"It runs nightly only" is a claim nobody checks unless something checks it. Both halves matter: the default projects must resolve **zero** files under the fixtures directory, and each owner must actually execute what it claims.

- [ ] **Step 1: Write the fixture**

Create `tests/mutation/source/fixtures/slowTest.fixture.ts (new)`:

```ts
/**
 * NOT discovered. Invoked by tests/mutation/guardSurfaces.gate.test.ts, which
 * is nightly-only (vitest.projects.ts:87), because 5.2 s is not worth paying on
 * every merge. The merge-gating structural check in
 * _metaOverlayConfigParity.test.ts covers the same VALUE every merge; this
 * proves the value is actually in force.
 */
import { expect, it } from "vitest";

it("outlives vitest's 5000 ms default", async () => {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 5_200));
  expect(Date.now() - start).toBeGreaterThanOrEqual(5_200);
});
```

- [ ] **Step 2: Write the failing wiring assertion**

Add to `tests/mutation/_metaOverlayConfigParity.test.ts (new)`:

```ts
import { readdirSync } from "node:fs";
import { globToRegExp } from "@/lib/test/serialAudit";
import vitestConfig from "@/vitest.config";

describe("fixtures are never discovered, and every one has a live owner", () => {
  const FIXTURE_DIR = "tests/mutation/source/fixtures";
  const files = readdirSync(join(ROOT, FIXTURE_DIR)).map((f) => `${FIXTURE_DIR}/${f}`);

  it("has fixtures to reason about", () => {
    // Non-vacuity: an empty directory would satisfy every assertion below.
    expect(files.length, "premise: there are fixtures").toBeGreaterThan(0);
  });

  it("resolves zero fixture files in any default project", () => {
    const projects = (vitestConfig as { test: { projects: { test: { include: string[] } }[] } })
      .test.projects;
    expect(projects.length, "premise: default projects exist").toBeGreaterThan(0);
    for (const p of projects) {
      for (const glob of p.test.include) {
        const re = globToRegExp(glob);
        const hits = files.filter((f) => re.test(f));
        expect(hits, `${glob} must not discover fixtures`).toEqual([]);
      }
    }
  });

  it("names an owner for every fixture on disk", () => {
    // Owners declared in spec §3.3.2.3. A fixture nobody invokes is dark, which
    // is this plan's own subject one level in.
    const owners: Record<string, string> = {
      "aliasImport.fixture.ts": "tests/mutation/_metaOverlayConfigParity.test.ts",
      "slowTest.fixture.ts": "tests/mutation/guardSurfaces.gate.test.ts",
      "emptyItEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
      "emptyTestEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
      "emptyDescribeEach.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
      "associatedPlacement.fixture.ts": "tests/mutation/_metaPremiseContract.test.ts",
    };
    expect(Object.keys(owners).sort()).toEqual(files.map((f) => f.split("/").pop()!).sort());
    for (const [fixture, owner] of Object.entries(owners)) {
      const src = readFileSync(join(ROOT, owner), "utf8");
      expect(src, `${owner} must invoke ${fixture}`).toContain(fixture);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run tests/mutation/_metaOverlayConfigParity.test.ts`
Expected: FAIL — the owners map names four fixtures that do not exist yet. This is correct: it fails until Task 12 creates them, so leave the map complete and land this task's commit with the two files that DO exist, adjusting the map in Task 12. **Instead**, write the map now with only the two live entries and add the other four in Task 12, so this task ends green.

- [ ] **Step 4: Make the gate invoke the slow fixture**

In `tests/mutation/guardSurfaces.gate.test.ts`, add one case inside the existing `describe.each` block, or as a standalone `describe` — standalone is correct, since it is a property of the config and not of any surface:

```ts
import { childRun } from "./_metaOverlayConfigParity.test";

describe("the per-mutant config's timeout is in force (nightly)", () => {
  it("runs a fixture that outlives vitest's 5000 ms default", () => {
    expect(
      childRun(
        "tests/mutation/source/fixtures/slowTest.fixture.ts",
        "tests/mutation/source/operators.ts",
      ),
    ).toBe(0);
  });
});
```

Export `childRun` from `_metaOverlayConfigParity.test.ts (new)` to make this import work.

- [ ] **Step 5: Run both**

Run: `pnpm exec vitest run tests/mutation/_metaOverlayConfigParity.test.ts` — PASS.
Run: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts -t "outlives"` — PASS in ~6 s.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/source/fixtures/slowTest.fixture.ts tests/mutation/_metaOverlayConfigParity.test.ts tests/mutation/guardSurfaces.gate.test.ts
git commit -m "test(mutation): prove the timeout is in force, and that no fixture is discovered or dark"
```

---

## Task 4: `GuardSurface.control` — a liveness control that is per-surface and actually runs

**Files:**
- Modify: `tests/mutation/source/registry.ts`
- Modify: `tests/mutation/_metaGuardSurfaceRegistry.test.ts`

**Interfaces:**
- Produces: `GuardSurface.control: { from: string; to: string }`. Tasks 6 and 8 supply one per enrolled surface.

The shipped control replaces a literal that exists only in `lib/specLint/taskContract.ts`, inside a `describe.each` over the registry — so enrolling any second surface reds the gate. And the `broken` value it computes is never passed to `runSurface`, so the assertion proves only that a string exists in a file.

- [ ] **Step 1: Write the failing validation cases**

Add to `tests/mutation/_metaGuardSurfaceRegistry.test.ts`, inside the existing rejection describe (each case flips exactly one field of `VALID`):

```ts
  it("rejects a control whose `from` is absent from the source", () => {
    expect(reject({ control: { from: "nothing like this exists", to: "x" } }).join(" ")).toMatch(
      /control/i,
    );
  });

  it("rejects a control whose `from` occurs more than once", () => {
    // Ambiguous anchor: the mutant's target is unknowable, which is the
    // taskContract bug generalized rather than fixed.
    expect(reject({ control: { from: "const", to: "let" } }).join(" ")).toMatch(/once/i);
  });

  it("rejects a control that changes nothing", () => {
    expect(reject({ control: { from: "plan", to: "plan" } }).join(" ")).toMatch(/identical/i);
  });
```

and add `control` to the `VALID` fixture:

```ts
  control: { from: 'if (kind !== "plan") return [];', to: 'if (kind === "plan") return [];' },
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm exec vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts`
Expected: FAIL — `control` is not a property of `GuardSurface`, and `validateSurface` emits nothing about it.

- [ ] **Step 3: Add the field and its validation**

In `tests/mutation/source/registry.ts`, add to the `GuardSurface` type:

```ts
  /**
   * A deliberately behavior-changing edit the suite MUST notice, used to prove
   * the overlay is live: without it, a harness whose overlay silently failed to
   * apply reports a PERFECT score with every mutant running against clean
   * source. Per-surface, because the previous version replaced a literal that
   * exists only in taskContract.ts; inside a describe.each over this registry,
   * so enrolling any second surface red it.
   */
  control: { from: string; to: string };
```

and inside `validateSurface`, after the `suitePaths` checks:

```ts
  const { from, to } = surface.control;
  if (from === to) {
    problems.push(`${surface.id}: control.from and control.to are identical; it mutates nothing`);
  }
  if (existsSync(surface.sourcePath)) {
    const occurrences = readFileSync(surface.sourcePath, "utf8").split(from).length - 1;
    if (occurrences === 0) {
      problems.push(`${surface.id}: control.from does not occur in ${surface.sourcePath}`);
    } else if (occurrences > 1) {
      problems.push(
        `${surface.id}: control.from occurs ${occurrences} times in ${surface.sourcePath}; ` +
          `an ambiguous anchor makes the control's target unknowable; it must occur exactly once`,
      );
    }
  }
```

Add `readFileSync` to the `node:fs` import.

- [ ] **Step 4: Give the shipped surface its control row**

In `GUARD_SURFACES`, add to the `taskContract` row:

```ts
    control: { from: 'if (kind !== "plan") return [];', to: 'if (kind === "plan") return [];' },
```

This is the same text the gate test hardcodes today, moved to where it belongs. The first customer's behavior is unchanged.

- [ ] **Step 5: Run green**

Run: `pnpm exec vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts
git commit -m "feat(mutation): a per-surface liveness control, validated for a unique anchor"
```

---

## Task 5: The gate runs the control as a mutant and asserts KILLED

**Files:**
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` lines 115-127
- Modify: `tests/mutation/source/runner.ts` (export a single-mutant entry point)

**Interfaces:**
- Consumes: `GuardSurface.control` (Task 4).
- Produces: `runControl(root, surface): number` — the child's exit code for the control mutant. Non-zero means the suite noticed.

- [ ] **Step 1: Write the failing test**

Replace the body of the existing `"kills a deliberately-broken control mutant"` case in `tests/mutation/guardSurfaces.gate.test.ts`:

```ts
    it("kills this surface's own control mutant, proving the overlay is live (AC-3)", () => {
      // The assertion the previous version READ as if it made. `broken` used to
      // be computed, asserted non-equal to source, and then never passed to
      // runSurface; so it proved a string existed in a file. This runs it.
      const source = readFileSync(surface.sourcePath, "utf8");
      const broken = source.replace(surface.control.from, surface.control.to);
      expect(broken, "control did not apply; validateSurface should have caught this").not.toBe(
        source,
      );
      expect(runControl(root, surface, broken), "the suite did not notice the control").not.toBe(0);
    });
```

- [ ] **Step 2: Run and watch it fail**

Run: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts -t "control"`
Expected: FAIL — `runControl` is not defined.

- [ ] **Step 3: Export the single-mutant runner**

In `tests/mutation/source/runner.ts`, add:

```ts
/**
 * Run ONE given mutant text against a surface's suites and return the child's
 * exit code. Used by the gate's liveness control, which needs to run a
 * hand-written mutant rather than a generated one; the declared operator set
 * cannot synthesize an arbitrary edit, and the control's whole job is to be an
 * edit a human chose because the suite must obviously notice it.
 */
export function runControl(root: string, surface: GuardSurface, mutantText: string): number {
  const dir = mkdtempSync(join(tmpdir(), "mutation-control-"));
  try {
    const mutantFile = join(dir, "control.ts");
    writeFileSync(mutantFile, mutantText, "utf8");
    for (const suite of surface.suitePaths) {
      const code = runSuite(
        root,
        resolve(root, surface.sourcePath),
        mutantFile,
        suite,
        `${surface.id}:control`,
      );
      if (code !== 0) return code;
    }
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run green**

Run: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts -t "control"`
Expected: PASS — `taskContract`'s suite notices its inverted kind guard.

- [ ] **Step 5: Prove it bites**

Temporarily set `taskContract`'s `control.to` equal to a no-op edit that the suite does NOT notice (e.g. a comment change), re-run, confirm FAIL. Restore. Record in the commit message.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/guardSurfaces.gate.test.ts tests/mutation/source/runner.ts
git commit -m "fix(mutation): run the liveness control as a mutant instead of asserting a string exists"
```

---

## Task 6: Enroll `ledger-claims-core.ts` — kill the reachable survivors

**Files:**
- Modify: `tests/scripts/ledgerClaimsCheck.test.ts`, `tests/scripts/ledgerClaims.test.ts`
- Modify: `tests/mutation/source/registry.ts`, `tests/mutation/guardSurfaces.gate.test.ts`

**Interfaces:**
- Consumes: Task 2's parity (this suite imports through `@/` and has a >5 s test — it could not reach a green baseline before it).

Measured on this branch with Task 2 applied: **61 mutants, 38 killed, score 0.623, 23 survivors.** The full survivor list with per-site dispositions is reproduced below; regenerate it before starting, because line numbers move.

```bash
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec tsx -e '
import { runSurface } from "./tests/mutation/source/runner";
import { OPERATOR_NAMES } from "./tests/mutation/source/operators";
const r = runSurface(process.cwd(), { id: "probe", sourcePath: "scripts/lib/ledger-claims-core.ts",
  suitePaths: ["tests/scripts/ledgerClaimsCheck.test.ts", "tests/scripts/ledgerClaims.test.ts"],
  operators: [...OPERATOR_NAMES], scoreFloor: 0.95, accepted: [],
  control: { from: "x", to: "y" } });
console.log(JSON.stringify({ killed: r.killed, count: r.mutantCount, survivors: r.survivors }, null, 2));'
```

**Dispositions.** Kill these seventeen with tests; the `equivalent` and probe rows go to Task 7.

| survivor | the test that kills it |
| --- | --- |
| `integer-literal:80` `STALE_DAYS 14>15` | a tip exactly **15** days old reads stale. **Corrected during implementation:** the 14-day case kills nothing here, since `14 > 14` and `14 > 15` are both false; it is what kills `relational-boundary:224`. Two separate cases. |
| `logical-connector:111` `\|\|>&&`, `integer-literal:111` `0>1` | `base = ""` (empty, not null) still yields `ci-unknown` |
| `integer-literal:133` `1000>1001` | call `resolveClaims` with **no** `opts.now` and assert `tipAgeDays` against a tip one day old — every existing test pins `now`, so the `Date.now()` default is untested, and `/1001` shifts the epoch about twenty days |
| `statement-removal:137` `git.fetch()` | the Task 9 repair of the ordering guard kills this; do it there, not here |
| `statement-removal:139` `degraded.push(fetch-failed)` | a fake whose `fetch` throws surfaces `fetch-failed: …` |
| `statement-removal:142` `degraded.push(no-fetch-cached-refs)` | an **in-process** assertion on `resolveClaims(fake(), { fetch: false }).degraded` — the only current assertion is through a spawned CLI, which the overlay cannot reach (spec L-7) |
| `logical-connector:170` `&&>\|\|` | an ordinary **full clone with a main** must not push `merged-exclusion-skipped-no-main`. **Corrected during implementation:** the shallow-with-main case cannot kill it, since `!true && x` and `!true \|\| x` are both false; only a full clone separates them, and only an ABSENCE assertion sees it, because every existing assertion is a `toContain`. |
| `statement-removal:198` `candidates.sort(...)` | two candidates with distinct tip epochs come back newest-first |
| `relational-boundary:224` `>>>=` | a tip exactly `STALE_DAYS` old is fresh, not stale |
| `statement-removal:243` `blobCache.set` | two refs sharing a blob call `readBlob` **once**; count the calls on the fake |
| `statement-removal:261,262,267` | absent `mainOid`, and null `mergeBase`, each push `merge-base-unavailable` exactly once and skip inference |
| `integer-literal:273` `0>1` | a one-line hunk still attributes |
| `integer-literal:274` `1>2` | the hunk's last line is `start + count - 1`; a two-line hunk at 10 ends at 11 |
| `relational-boundary:278` (both) | a hunk touching exactly the first line of a span, and exactly the last, each attribute |

- [ ] **Step 1: Write the failing tests**

Add to `tests/scripts/ledgerClaims.test.ts` (pure-core cases; it has no environment sources, which keeps them out of Task 13's premise scope):

```ts
describe("staleness boundary (guard-premise Task 6)", () => {
  const DAY = 86_400;
  const at = (ageDays: number) =>
    resolveClaims(
      fake({ localRefs: () => new Map([["main", "m"], ["feat/a", "a"]]),
             tipEpoch: () => NOW - ageDays * DAY }),
      { fetch: false, now: NOW },
    ).claims[0];

  it("a tip exactly STALE_DAYS old is fresh, not stale", () => {
    expect(at(14)?.tipAgeDays, "fixture premise: the fixture reaches the boundary").toBe(14);
    expect(at(14)?.stale).toBe(false);
  });

  it("a tip one day past STALE_DAYS is stale", () => {
    expect(at(15)?.stale).toBe(true);
  });

  it("derives `now` from the clock when the caller omits it", () => {
    const r = resolveClaims(
      fake({ localRefs: () => new Map([["main", "m"], ["feat/a", "a"]]),
             tipEpoch: () => Math.floor(Date.now() / 1000) - DAY }),
      { fetch: false },
    );
    // A /1001 divisor moves the derived epoch by roughly twenty days, so a
    // one-day-old tip stops reading as one day old.
    expect(r.claims[0]?.tipAgeDays).toBe(1);
  });
});
```

Write the remaining fourteen in the same shape — one `it` per row of the table, each naming the mutant it kills in a comment, each asserting a value the mutant changes.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run tests/scripts/ledgerClaims.test.ts tests/scripts/ledgerClaimsCheck.test.ts`
Expected: the boundary tests FAIL if you wrote them against the mutant's behavior; they should PASS against clean source. **The real verification is Step 4** — a test that passes against clean source proves nothing until the mutant fails it.

- [ ] **Step 3: No implementation**

There is no production change in this task. Every survivor here is a real behavior that already works and was simply unasserted. If a test fails against clean source, you have found a genuine bug — stop and report it rather than adjusting the test.

- [ ] **Step 4: Verify each test kills its mutant**

For each row, apply the mutant to `scripts/lib/ledger-claims-core.ts` on disk, run the one test, confirm FAIL, restore. This is the only step that proves the tests are not vacuous — which is the entire subject of this plan.

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/ledgerClaims.test.ts tests/scripts/ledgerClaimsCheck.test.ts
git commit -m "test(ledger): kill seventeen surviving mutants in the claims core"
```

---

## Task 7: Enroll `ledger-claims-core.ts` — the registry row and its ledger

**Files:**
- Modify: `tests/mutation/source/registry.ts`, `tests/mutation/guardSurfaces.gate.test.ts`

- [ ] **Step 1: Probe the two undecided sites**

`integer-literal:194` (`declaredOnly ? 0 : tipEpoch`) and `integer-literal:216` (`86400>86401`). For each, write a fixture that varies the field the mutant could move — per the harness spec's L-8, a probe is only as strong as what its fixture varies — and record whether any observable output differs. If one differs, it is a **kill**, and it moves to Task 6's list; if neither does, it is `equivalent` with the probe as its argument.

- [ ] **Step 2: Write the registry row**

```ts
  {
    id: "ledgerClaimsCore",
    sourcePath: "scripts/lib/ledger-claims-core.ts",
    suitePaths: ["tests/scripts/ledgerClaimsCheck.test.ts", "tests/scripts/ledgerClaims.test.ts"],
    operators: [...OPERATOR_NAMES],
    // Set from the run in step 4, at or below the measured score. Do NOT set it
    // to the measured value exactly: the floor is a floor, not a snapshot.
    scoreFloor: 0.95,
    control: {
      from: "if (opts.fetch) {",
      to: "if (!opts.fetch) {",
    },
    accepted: [
      { siteId: "integer-literal:198:46:0>1", kind: "equivalent",
        reason: "tipOf is built from candidates, so the `?? 0` fallback in the comparator is unreachable" },
      // …one row per remaining survivor, each with its argument
    ],
  },
```

- [ ] **Step 2a: Verify the control is unique**

Run: `grep -c 'if (opts.fetch) {' scripts/lib/ledger-claims-core.ts` — must print `1`. `validateSurface` enforces this, but knowing before you run a 61-mutant sweep is cheaper.

- [ ] **Step 3: Declare the ledger-kind counts**

In `tests/mutation/guardSurfaces.gate.test.ts`, add a row to `EXPECTED_LEDGER_KINDS` keyed `ledgerClaimsCore`, counted independently from the rows you wrote. The map's key set is asserted equal to the enrolled surface ids, so this is not optional.

- [ ] **Step 4: Run the gate**

Run: `pnpm mutation:guards`
Expected: PASS, with an empty unaccepted-survivor set. This is the convergence criterion for this surface.

- [ ] **Step 5: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/guardSurfaces.gate.test.ts
git commit -m "feat(mutation): enroll scripts/lib/ledger-claims-core.ts"
```

---

## Task 8: Enroll `ledger-git.ts` — the throwaway-repository harness

**Files:**
- Modify: `tests/scripts/ledgerClaimsCheck.test.ts`
- Modify: `tests/mutation/source/registry.ts`, `tests/mutation/guardSurfaces.gate.test.ts`

Measured: **81 mutants, 40 killed, score 0.494, 41 survivors.** Most are killable by one technique — and it is the same construction the spec prescribes as the *cure* for the vacuity class, so this task's work and Task 9's are the same technique applied twice.

- [ ] **Step 1: Write the shared repository builder**

```ts
/**
 * A throwaway repository with a known ref namespace, and optionally a file://
 * remote so `ls-remote` and `fetch` have something real to read. This is the
 * `484824b9e` pattern generalized: every assertion below discriminates because
 * the fixture CONSTRUCTS what it asserts against, rather than asking the
 * ambient checkout; which is exactly what made three shipped guards vacuous in
 * CI (spec §1.2, §3.3.4).
 */
function throwawayRepo(opts: { branches?: string[]; withRemote?: boolean; shallow?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ledger-git-"));
  const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  g("init", "--quiet", "--initial-branch=main");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "t");
  g("commit", "--quiet", "--allow-empty", "-m", "base");
  const head = g("rev-parse", "HEAD").trim();
  for (const b of opts.branches ?? []) g("update-ref", `refs/remotes/origin/${b}`, head);
  return { dir, head, g };
}
```

- [ ] **Step 2: Write the failing tests**

One `it` per survivor group, each setting `LEDGER_GIT_ROOT` to the throwaway repo. Note `gitRoot()` honours that variable **only under vitest** (`scripts/lib/ledger-git.ts:25-30`), which is deliberate and means these tests work while production cannot be redirected.

Groups: `parseRefLine` on a one-field line; `lsRemote` HEAD exclusion against a `file://` remote; `fetch` actually fetching (refs appear that were absent before); `mergedIntoMain` with one merged and one unmerged branch; `fileOids`; `showFile` present and absent; `mergeBase` across unrelated roots; `diffHunks` including a single-line hunk; `tipEpoch` rejecting non-finite and non-positive; `isShallow` (Task 9); `currentBranch` on a detached HEAD; `inCI` with `GITHUB_ACTIONS` set both ways; the error-message cases at lines 59 and 234.

- [ ] **Step 3: Verify each kills its mutant**

Same as Task 6 Step 4, and non-negotiable here: **run each new test against both a full clone and a zero-ref environment.** Per spec AC-6, a mutant whose verdict differs between them may not be ledgered — it must be killed by a test that builds its own refs. Simulate the zero-ref case by pointing `LEDGER_GIT_ROOT` at a fresh repo with no `refs/remotes/origin/*`.

- [ ] **Step 4: File the `accepted-gap` family**

**Corrected during implementation: there is ONE family, not two.**

1. **`BL-LEDGER-GIT-TIMEOUT-CONSTANTS`** — `FETCH_MS`, `LS_REMOTE_MS`, `GH_MS`. Asserting a timeout means waiting it out or injecting the spawn; the ledger branch already named this gap in `5f1a98a66`'s message. Filed in `BACKLOG.md` in this PR per the class-sweep disposition rule, naming exception (c): the repair redesigns the one module permitted to spawn, which this PR does not otherwise touch.
2. **The `gh` path** — planned as a second family with a backlog row of its own, and **not filed, because its premise is false.** `prList` spawns `gh` BY NAME, so `PATH` is already the seam and no refactor is needed: a shim first on `PATH` drives the status handling directly. All four mutants (`status !== 0` to `===` and to `!== 1`, the `||` joining it to `!r.stdout`, and `isCrossRepository === true` to `!==`) are killed by two cases, one with a shim that succeeds and one with a shim that exits 1 while printing well-formed JSON — which is the only input that separates the `&&` mutant from clean. A ledger row here would have recorded debt that does not exist.

- [ ] **Step 5: Write the registry row, declare the counts, run the gate**

Same shape as Task 7. Control suggestion: `from: 'if (name === "HEAD") continue;'`, `to: 'if (name !== "HEAD") continue;'` — verify it occurs exactly once first.

Run: `pnpm mutation:guards`
Expected: PASS with an empty unaccepted-survivor set on **both** surfaces.

- [ ] **Step 6: Commit**

```bash
git add tests/scripts/ledgerClaimsCheck.test.ts tests/mutation/source/registry.ts tests/mutation/guardSurfaces.gate.test.ts BACKLOG.md
git commit -m "feat(mutation): enroll scripts/lib/ledger-git.ts against a constructed ref namespace"
```

---

## Task 9: Repair the three live vacuous guards

**Files:**
- Modify: `tests/scripts/ledgerClaimsCheck.test.ts` at lines 393-409, 508-510 and 546-565

These are not new tests. They are three guards that ship today and cannot fail — found by applying this arc's own taxonomy, and the reason the arc exists.

- [ ] **Step 1: The ordering guard that passes when the first event never happens**

The ordering guard at lines 546-565 asserts `calls.indexOf("fetch") < calls.indexOf("localRefs")`. With `git.fetch()` deleted, `calls` is `["localRefs"]`, so `indexOf` returns `-1` and `-1 < 0` holds. **Probed: the test passes against that mutant.** The premise is that both events occurred:

```ts
    const fetchAt = calls.indexOf("fetch");
    const snapshotAt = calls.indexOf("localRefs");
    premise("both events occurred; an absent one indexes to -1", fetchAt, -1);
    premise("both events occurred; an absent one indexes to -1", snapshotAt, -1);
    expect(fetchAt, "fetch must precede the snapshot").toBeLessThan(snapshotAt);
```

- [ ] **Step 2: The `isShallow` guard, vacuous in exactly the environment that merge-gates**

The shallow guard at lines 393-409 compares `isShallow()` to git's answer in the same checkout. CI's checkout is shallow, so `truth` is `true` and the `Boolean(out)` mutant returns `true` too. Replace the ambient checkout with a constructed one covering **both** values — a throwaway repo is non-shallow, and a `--depth=1` clone of it over `file://` is shallow:

```ts
    for (const [shallow, repo] of [[false, full], [true, shallowClone]] as const) {
      process.env.LEDGER_GIT_ROOT = repo;
      expect(realGitSurface().isShallow(), `shallow=${shallow}`).toBe(shallow);
    }
```

Both arms are required: with only the shallow arm, `Boolean(out)` still passes.

- [ ] **Step 3: The CLI/core count comparison, zero on both sides in CI**

The count comparison at lines 508-510 asserts `payload.claims.length === core.claims.length`, both read from the live checkout. In CI both are zero, so `claims: []` is indistinguishable from a correct envelope. The 101-claim `reportEnvelope` test at at lines 524-542 already covers the cardinality contract against a constructed corpus, so this assertion needs a premise rather than a rewrite — and the premise is false in CI, which means it must **not** be written as an assertion that reds there. Assert cardinality only when the corpus is non-empty, and say so:

```ts
    if (core.claims.length === 0) {
      // Documented, not hidden: CI's checkout resolves no claims, so this
      // comparison cannot discriminate there. The cardinality contract is
      // proven against a constructed 101-claim corpus at the reportEnvelope
      // test below, which is reachable in every environment.
      expect(payload.claims).toEqual([]);
    } else {
      expect(payload.claims.length, "the CLI truncated what the core resolved").toBe(
        core.claims.length,
      );
    }
```

- [ ] **Step 4: Verify all three**

For each, apply the mutant it names and confirm the test now FAILS: `git.fetch()` removed; `isShallow` returning `Boolean(out)`; `claims: res.claims.slice(0, 100)` in `reportEnvelope`.

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/ledgerClaimsCheck.test.ts
git commit -m "fix(ledger): three shipped guards that could not fail now can"
```

---

## Task 10: The `premise` helper

**Files:**
- Create: `tests/_shared/premise.ts (new)`
- Create: `tests/_shared/premise.test.ts (new)`

**Interfaces:**
- Produces: `premise(description: string, actual: number, mustExceed: number): void` and `premiseHolds(description: string, condition: boolean): void`. Tasks 9, 11, 12, 13 consume both.

The helper exists as much for the AST-detectable call site as for the assertion. Its message must name the failure as a **premise** failure — "this test proves nothing in this environment" is a different instruction to the reader than "the code is wrong", and conflating the two is how a red test got repaired into a vacuous one (spec §1.2).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "./premise";

describe("premise", () => {
  it("passes silently when the premise holds", () => {
    expect(() => premise("101 is past the cap", 101, 100)).not.toThrow();
  });

  it("throws when the premise does not hold, naming it as a premise failure", () => {
    expect(() => premise("13 is past the cap", 13, 100)).toThrow(
      /premise not met.*13 is past the cap.*13 .*100/s,
    );
  });

  it("treats the bound as strict; equal is not past", () => {
    expect(() => premise("boundary", 100, 100)).toThrow(/premise not met/);
  });

  it("says the test below proves nothing, not that the code is wrong", () => {
    expect(() => premise("x", 0, 0)).toThrow(/proves nothing/i);
  });

  it("premiseHolds carries the non-numeric form", () => {
    expect(() => premiseHolds("git reported refs", false)).toThrow(/premise not met.*git reported/s);
    expect(() => premiseHolds("git reported refs", true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run tests/_shared/premise.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * The condition under which the assertion below it has discriminating power.
 *
 * A guard whose fixture or environment cannot reach the boundary it asserts
 * passes unconditionally and would pass forever. Stating the premise executably
 * turns that silence into a loud failure; and the message says so, because a
 * premise failure and an ordinary assertion failure call for opposite responses:
 * one means the environment is wrong for this test, the other means the code is.
 * Repairing the first as if it were the second is exactly how a red test became
 * a vacuous one in PR #701.
 *
 * See docs/agents/writing-plans.md and
 * docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md.
 */
export function premise(description: string, actual: number, mustExceed: number): void {
  if (!(actual > mustExceed)) {
    throw new Error(
      `premise not met: ${description}. Got ${actual}, which does not exceed ${mustExceed}. ` +
        `The assertion below this line proves nothing in this environment; it is not that the ` +
        `code under test is wrong.`,
    );
  }
}

/** The non-numeric form. Same contract, same message shape. */
export function premiseHolds(description: string, condition: boolean): void {
  if (!condition) {
    throw new Error(
      `premise not met: ${description}. The assertion below this line proves nothing in this ` +
        `environment; it is not that the code under test is wrong.`,
    );
  }
}
```

- [ ] **Step 4: Run green**

Run: `pnpm exec vitest run tests/_shared/premise.test.ts`
Expected: PASS, five cases.

- [ ] **Step 5: Commit**

```bash
git add tests/_shared/premise.ts tests/_shared/premise.test.ts
git commit -m "feat(test): a premise helper that names a premise failure as one"
```

---

## Task 11: The declaration-reference traversal

**Files:**
- Create: `tests/mutation/source/premiseScan.ts (new)`
- Create: `tests/mutation/source/premiseScan.test.ts (new)`

**Interfaces:**
- Produces:
  ```ts
  export const ENVIRONMENT_SOURCES: { modules: string[]; globals: string[] };
  export type TestClassification = {
    testName: string;
    line: number;
    verdict: "environment-touching" | "environment-free" | "unclassifiable";
    detail: string;
    hasPremise: boolean;
    exemption: string | null;
  };
  export function classifyTests(root: string, suitePath: string): TestClassification[];
  ```
  Task 12 consumes `classifyTests`.

Read spec §3.3.2, §3.3.2.1 and §3.3.2.2 in full before writing this. The rule is a cycle-safe fixed point over declarations and references; **position is not a parameter and neither is depth**, which is what four review rounds cost to establish.

- [ ] **Step 1: Write the failing fixture-matrix test**

Every case below is a synthetic source string the scanner parses; none is executed. Each environment-touching case has an environment-free foil differing in exactly one thing, so a constant traversal fails in **both** directions.

```ts
import { describe, expect, it } from "vitest";
import { classifyTests } from "./premiseScan";

const verdict = (src: string) => classifyTests(ROOT, writeTemp(src))[0]?.verdict;

describe("provenance, over the declaration-reference graph", () => {
  it("direct spawn in the test body", () => {
    expect(verdict(`import { spawnSync } from "node:child_process";
      it("x", () => { spawnSync("git", []); });`)).toBe("environment-touching");
  });

  it("aliased import", () => {
    expect(verdict(`import { spawnSync as run } from "node:child_process";
      it("x", () => { run("git", []); });`)).toBe("environment-touching");
  });

  it("namespace import", () => {
    expect(verdict(`import * as cp from "node:child_process";
      it("x", () => { cp.spawnSync("git", []); });`)).toBe("environment-touching");
  });

  it("dynamic destructured import", () => {
    expect(verdict(`it("x", async () => {
      const { spawnSync } = await import("node:child_process"); spawnSync("git", []); });`))
      .toBe("environment-touching");
  });

  it("process.env direct member access", () => {
    expect(verdict(`it("x", () => { const r = process.env.ROOT; });`)).toBe("environment-touching");
  });

  it("process.env destructured", () => {
    expect(verdict(`const { env } = process;
      it("x", () => { const r = env.ROOT; });`)).toBe("environment-touching");
  });

  it("process.env aliased destructure", () => {
    expect(verdict(`const { env: e } = process;
      it("x", () => { const r = e.ROOT; });`)).toBe("environment-touching");
  });

  it("two-level same-file chain", () => {
    expect(verdict(`import { spawnSync } from "node:child_process";
      const inner = () => spawnSync("git", []);
      const outer = () => inner();
      it("x", () => { outer(); });`)).toBe("environment-touching");
  });

  it("module-scope initializer no body reads", () => {
    expect(verdict(`const root = process.env.ROOT;
      export function readRoot() { return root; }
      it("x", () => { readRoot(); });`)).toBe("environment-touching");
  });

  it("module-level assignment to a reachable binding", () => {
    expect(verdict(`let root;
      root = process.env.ROOT;
      function readRoot() { return root; }
      it("x", () => { readRoot(); });`)).toBe("environment-touching");
  });

  it("default parameter initializer", () => {
    expect(verdict(`function f(x = process.env.ROOT) { return x; }
      it("x", () => { f(); });`)).toBe("environment-touching");
  });

  it("hook-mediated read classifies the whole describe subtree", () => {
    expect(verdict(`import { spawnSync } from "node:child_process";
      describe("d", () => { beforeEach(() => { spawnSync("git", []); });
        it("x", () => { expect(1).toBe(1); }); });`)).toBe("environment-touching");
  });

  it("an environment-derived .each producer is inside the test's extent", () => {
    expect(verdict(`import { spawnSync } from "node:child_process";
      const rows = () => spawnSync("git", []).stdout.split("\\n");
      test.each(rows())("x %s", (r) => { expect(r).toBeDefined(); });`))
      .toBe("environment-touching");
  });

  // ---- the foils. Each differs from a case above in ONE thing. ----

  it("pure local wrapper", () => {
    expect(verdict(`import { join } from "node:path";
      const inner = () => join("a", "b");
      it("x", () => { inner(); });`)).toBe("environment-free");
  });

  it("pure module constant, so the rule is not `any module constant`", () => {
    expect(verdict(`const n = 3;
      function readN() { return n; }
      it("x", () => { readN(); });`)).toBe("environment-free");
  });

  it("a module that merely SHARES a file with a provenance importer", () => {
    // scripts/ledger-claims.ts imports realGitSurface from ledger-git, which
    // imports child_process; but reportEnvelope's body references neither. A
    // module-CLOSURE rule marks every test importing reportEnvelope as
    // environment-touching, including the 101-claim fixture that touches no
    // environment at all. Declarations, not modules.
    expect(verdict(`import { reportEnvelope } from "@/scripts/ledger-claims";
      it("x", () => { reportEnvelope({ degraded: [], claims: [] }); });`))
      .toBe("environment-free");
  });

  it("a pure .each producer", () => {
    expect(verdict(`const rows = () => ["a", "b"];
      test.each(rows())("x %s", (r) => { expect(r).toBeDefined(); });`)).toBe("environment-free");
  });
});

describe("unclassifiable; recognized but unresolvable, and it reds", () => {
  it("a dynamic import whose specifier is not a literal", () => {
    expect(verdict(`const m = "node:child_process";
      it("x", async () => { const { spawnSync } = await import(m); spawnSync("git", []); });`))
      .toBe("unclassifiable");
  });

  it("a computed member access on process", () => {
    expect(verdict(`const k = "env";
      it("x", () => { const r = (process as never)[k]; });`)).toBe("unclassifiable");
  });
});
```

- [ ] **Step 2: Run and watch every case fail**

Run: `pnpm exec vitest run tests/mutation/source/premiseScan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scanner**

Use `ts.createSourceFile` and `ts.forEachChild`, matching `tests/mutation/source/operators.ts`'s approach — AST, never text, for the reason stated in that file's header. Structure:

1. Parse the suite. Collect module-level declarations, their extents (initializer or body, **plus any module-level statement that writes to the binding**), and the import map (specifier → local names, including aliases and namespaces).
2. Collect tests: calls to `it`/`test` (with any `.each`/`.skip`/`.only` chain). A test's extent is the **entire call expression**. Record enclosing `describe`s and their hooks and `.each` producers.
3. For each test, walk references to a cycle-safe fixed point over declarations, resolving imported bindings to repo modules (the `@` alias and relative specifiers) and recursing into their declarations. Stop at `node_modules`, at a declared provenance, and at a visited declaration.
4. A declaration is provenance-bearing if its extent references a binding imported from `ENVIRONMENT_SOURCES.modules`, or accesses `process.env`.
5. Emit `unclassifiable` for a non-literal dynamic specifier, a computed member access on `process`, an unfollowable re-export, or an in-repo module that fails to parse.
6. Record `hasPremise` (a `premise`/`premiseHolds` call in the test's extent, **or** in the associated pre-registration position for an environment-derived producer) and `exemption` (a `// no-premise: <reason>` comment inside the body, reason non-empty).

- [ ] **Step 4: Run green**

Run: `pnpm exec vitest run tests/mutation/source/premiseScan.test.ts`
Expected: PASS, all cases including both foil directions.

- [ ] **Step 5: Commit**

```bash
git add tests/mutation/source/premiseScan.ts tests/mutation/source/premiseScan.test.ts
git commit -m "feat(mutation): classify a test's environment provenance over the declaration graph"
```

---

## Task 12: The four executable premise fixtures

**Files:**
- Create: `tests/mutation/source/fixtures/{emptyItEach,emptyTestEach,emptyDescribeEach,associatedPlacement}.fixture.ts`
- Modify: `tests/mutation/_metaOverlayConfigParity.test.ts (new)` (complete the owners map from Task 3)

Each of these **must fail** when run — which is why none can be a discovered test, and why each is invoked as a child run whose non-zero exit is the assertion.

- [ ] **Step 1: Write the three empty-producer fixtures**

`emptyTestEach.fixture.ts (new)`, and its `it.each` and `describe.each` twins:

```ts
/**
 * NOT discovered. Invoked by tests/mutation/_metaPremiseContract.test.ts, which
 * asserts this file's child run exits NON-ZERO.
 *
 * Probed at spec R8: with the premise in the callback instead, this file passes
 * green; `Tests 1 passed (1)`; because vitest registers .each cases by
 * iterating the producer, so an empty producer registers nothing and the
 * callback never runs. The premise below sits in the associated
 * pre-registration position, so it executes regardless.
 */
import { expect, it, test } from "vitest";
import { premise } from "@/tests/_shared/premise";

const rows: string[] = [];             // stands in for an environment-derived producer
premise("the producer yielded cases", rows.length, 0);   // MUST fail here

test.each(rows)("never registered %s", (r) => {
  expect(r).toBeDefined();
});

it("an unrelated passing test, so a green file would be green for the wrong reason", () => {
  expect(1).toBe(1);
});
```

- [ ] **Step 2: Write the associated-placement fixture**

`associatedPlacement.fixture.ts (new)` — same shape, proving the accepted placement executes on an empty producer.

- [ ] **Step 3: Verify each fails as a child run**

```bash
for f in emptyItEach emptyTestEach emptyDescribeEach associatedPlacement; do
  VITEST_INCLUDE_MUTATION_HARNESS=1 MUTATION_ROOT=$PWD \
    MUTATION_TARGET=$PWD/tests/mutation/source/operators.ts \
    MUTATION_MUTANT=$PWD/tests/mutation/source/operators.ts \
    MUTATION_SUITE=tests/mutation/source/fixtures/$f.fixture.ts \
    pnpm exec vitest run --config tests/mutation/source/mutantOverlay.config.ts >/dev/null 2>&1
  echo "$f exit=$?"   # every one must be non-zero
done
```

- [ ] **Step 4: Prove the fixtures are not trivially failing**

Move each premise into the callback, re-run, and confirm the exit becomes **0** — that is the vacuity the fixture exists to demonstrate. Restore. Without this step the fixtures prove only that something failed, not that the premise placement is what makes the difference.

- [ ] **Step 5: Complete the owners map**

Add the four entries to `tests/mutation/_metaOverlayConfigParity.test.ts (new)`'s owners map from Task 3 Step 2.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/source/fixtures tests/mutation/_metaOverlayConfigParity.test.ts
git commit -m "test(mutation): four fixtures proving a premise that cannot run is no premise"
```

---

## Task 13: The premise contract meta-test

**Files:**
- Create: `tests/mutation/_metaPremiseContract.test.ts (new)`

**Interfaces:**
- Consumes: `classifyTests` (Task 11), `childRun` (Task 2), `GUARD_SURFACES` (Task 7/8).

- [ ] **Step 1: Write the failing contract**

```ts
import { describe, expect, it } from "vitest";
import { classifyTests } from "./source/premiseScan";
import { GUARD_SURFACES } from "./source/registry";
import { childRun } from "./_metaOverlayConfigParity.test";

/**
 * Declared per suite, INDEPENDENTLY of the classification; counting a list and
 * comparing it to itself proves nothing. A recognizer that silently stops
 * matching drops these to zero and reds, instead of reporting a clean corpus it
 * no longer understands. A genuinely pure suite declares 0 honestly.
 */
const EXPECTED_ENV_TOUCHING: Record<string, number> = {
  "tests/scripts/ledgerClaimsCheck.test.ts": 0, // set from the real count in step 3
  "tests/scripts/ledgerClaims.test.ts": 0,
  "tests/specLint/taskContract.test.ts": 0,
};

const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();

describe("premise contract; non-vacuity", () => {
  it("has enrolled suites to scan", () => {
    expect(suites.length, "premise: the registry enrols at least one suite").toBeGreaterThan(0);
  });

  it("declares a count for every enrolled suite, and no others", () => {
    expect(Object.keys(EXPECTED_ENV_TOUCHING).sort()).toEqual(suites);
  });

  it("examined tests at all", () => {
    const all = suites.flatMap((s) => classifyTests(ROOT, s));
    expect(all.length, "premise: the scanner found tests").toBeGreaterThan(0);
  });

  it("classifies the declared number of environment-touching tests per suite", () => {
    for (const suite of suites) {
      const touching = classifyTests(ROOT, suite).filter(
        (t) => t.verdict === "environment-touching",
      );
      expect(touching.length, `${suite}`).toBe(EXPECTED_ENV_TOUCHING[suite]);
    }
  });

  it("classifies no dependency-injected test as environment-touching", () => {
    // Over-classification turns the premise into a ritual, and is a defect in
    // the traversal rather than in the test.
    const injected = classifyTests(ROOT, "tests/scripts/ledgerClaims.test.ts");
    expect(injected.filter((t) => t.verdict === "environment-touching")).toEqual([]);
  });
});

describe("premise contract; the rule", () => {
  it("every environment-touching test carries a premise or a reasoned exemption", () => {
    const offenders = suites.flatMap((s) =>
      classifyTests(ROOT, s)
        .filter((t) => t.verdict === "environment-touching" && !t.hasPremise && !t.exemption)
        .map((t) => `${s}:${t.line} ${t.testName}`),
    );
    expect(offenders).toEqual([]);
  });

  it("reports every unclassifiable test rather than passing it as environment-free", () => {
    const unresolved = suites.flatMap((s) =>
      classifyTests(ROOT, s)
        .filter((t) => t.verdict === "unclassifiable" && !t.exemption)
        .map((t) => `${s}:${t.line} ${t.detail}`),
    );
    expect(unresolved).toEqual([]);
  });
});

describe("premise contract; a premise that cannot run is no premise", () => {
  const FIXTURES = [
    "emptyItEach.fixture.ts",
    "emptyTestEach.fixture.ts",
    "emptyDescribeEach.fixture.ts",
    "associatedPlacement.fixture.ts",
  ];

  it.each(FIXTURES)("%s fails as a child run", (f) => {
    expect(
      childRun(`tests/mutation/source/fixtures/${f}`, "tests/mutation/source/operators.ts"),
      `${f} must FAIL; an empty producer registers no case`,
    ).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts`
Expected: FAIL — the declared counts are `0` and the real ones are not.

- [ ] **Step 3: Set the real counts, and read what they tell you**

Run the scanner over each suite, record the counts, and **look at the classifications before accepting them**. If a `fake()`-driven test is classified environment-touching, the traversal is wrong — fix Task 11, do not raise the count.

- [ ] **Step 4: Add the premises the contract now demands**

Every environment-touching test in the two ledger suites gets a premise or a `// no-premise: <reason>`. Task 9 already supplied three; the rest are mechanical. A premise on a test whose environment genuinely cannot be constructed is correct; where it can be constructed, construct it instead.

- [ ] **Step 5: Run green**

Run: `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts tests/scripts/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/_metaPremiseContract.test.ts tests/scripts/
git commit -m "feat(mutation): require an executable premise on every environment-touching guard"
```

---

## Task 14: The durable rule

**Files:**
- Modify: `docs/agents/writing-plans.md` lines 10-14
- Modify: `AGENTS.md`

The rule's home is the tracked repo, not a per-machine memory file — that is the point of the arc. `docs/agents/writing-plans.md` already carries the anti-tautology rule these instances violated; the premise rule goes directly beneath it.

- [ ] **Step 1: Add the bullet**

Append to the anti-tautology rule's sub-list in `docs/agents/writing-plans.md`:

```markdown
  - **State every guard's premise executably.** A guard has discriminating power only under some condition — a fixture large enough to cross a boundary, an environment rich enough to differ from empty. Say it in code, immediately above the assertion that depends on it: `premise("fixture premise: past the cap", fixture.length, CAP)` (`tests/_shared/premise.ts (new)`). Five shapes, all measured in PR #701: a fixture that cannot reach the boundary; an expected value read from the same degenerate source as the actual; an absent event that indexes to a sentinel satisfying the comparison; a premise for a mechanism since refactored away; and a premise that never executes at all. The premise must execute UNCONDITIONALLY relative to what it guards — never inside a `.each` callback, whose case count can be zero. **The trap is the repair, not the original:** a guard that goes red in CI is most naturally "fixed" by deriving its expected value from the environment, which is exactly what makes it vacuous there. Where the environment can be constructed, construct it (a throwaway repository, a 101-row fixture) rather than asking the ambient one. Suites enrolled in the mutation registry have this enforced by `tests/mutation/_metaPremiseContract.test.ts (new)`; everywhere else it is convention. Full rationale: `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md`.
```

- [ ] **Step 2: Add the AGENTS.md pointer, and nothing more**

One line in the cross-cutting discipline section, pointing at the writing-plans bullet. The rule lives in one place; a second copy drifts.

- [ ] **Step 3: Verify the docs guards still pass**

Run: `pnpm exec vitest run tests/docs/`
Expected: PASS. `tests/docs/_metaAgentsMarkerContract.test.ts` and the referential-integrity guard both read `AGENTS.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/agents/writing-plans.md AGENTS.md
git commit -m "docs(agents): state every guard's premise executably"
```

---

## Task 15: Close out

- [ ] **Step 1: Full local verification**

```bash
pnpm typecheck && pnpm test && pnpm mutation:guards
```

All three must pass. `pnpm mutation:guards` is the convergence criterion for the two enrolled surfaces: score at or above floor, empty unaccepted-survivor set.

- [ ] **Step 2: Graduate the ledger entry and drop the marker**

In `BACKLOG.md`, move `BL-GUARD-PREMISE-REACHABILITY` to `BACKLOG-archive.md` with its outcome, and confirm the two new `BL-` rows from Task 8 remain OPEN. The `**Status:** IN PROGRESS · **Branch:** …` marker comes off **in this commit** — the PR's last — never in a later one: a marker that merges into main names a branch the merge just deleted, and `tests/docs/_metaLedgerInProgress.test.ts` then reds on main until someone clears it.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin chore/guard-premise-reachability
gh pr create --title "guard premise reachability: enrollment, and a premise that can fail" --body "…"
```

- [ ] **Step 4: Real CI green**

Not local green. Watch the actual run. `pnpm mutation:guards` is nightly and path-filtered (`.github/workflows/mutation-harness.yml`), and this PR touches `tests/mutation/**`, so the `pull_request` trigger fires it on the branch — check that run specifically, because it is the one that executes the enrolled surfaces in CI's zero-ref checkout, where several of these mutants behave differently than they do locally.

- [ ] **Step 5: Merge, then sync**

```bash
gh pr merge --merge
git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main   # must be "0  0"
```

- [ ] **Step 6: Clear the pane and agent labels, delete the cron nudge**

```bash
herdr pane rename "$HERDR_PANE_ID" --clear && herdr agent rename "$HERDR_PANE_ID" --clear
```

Then `CronDelete` job `8fd01918`, and set the ship-state marker's `stage` to `"done"`.

---

## Self-review

**Spec coverage.** AC-1/2 → Task 1-2. AC-3/3a → Task 2-3, 12. AC-4 → Task 6-8. AC-4a/4b → Task 4-5. AC-5 → Task 7-8. AC-6 → Task 8 Step 3. AC-7 → Task 10. AC-8/8a → Task 11, 13. AC-8b/8c/8d → Task 11-13. AC-9 → Task 13. AC-10 → Task 9, 13. AC-10a/10b → Task 11, 13. AC-11 → Task 14. AC-12 → Task 15.

**Ordering.** Task 2 gates Tasks 6-8 absolutely: neither ledger suite can reach a green mutation baseline without the alias and the timeout. Task 4 gates Task 5, and both gate Tasks 7-8, because enrolling a second surface reds the shipped control. Tasks 10-13 are independent of 6-9 except that Task 13's counts are taken over the suites Tasks 6-9 leave behind, so run 13 last.

**Known soft spots, stated rather than discovered later.** Task 11 is the largest single piece and the one most likely to need a second pass — the traversal is fully specified but the TypeScript API surface for resolving imports is fiddly. Task 8's 41 survivors are the largest volume; if the review scope proves too wide, splitting it at the `realGitSurface` method boundary is the natural seam.
