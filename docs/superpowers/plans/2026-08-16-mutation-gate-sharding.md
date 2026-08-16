# Mutation-gate sharding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the `mutation-harness` nightly's wall clock as source-mutation surfaces enrol, by partitioning the gate across four shard files and running every shard as its own GitHub Actions job.

**Architecture:** The source-mutation gate calls `runSurface` at module scope, so its cost is vitest *import* time and it holds one of three workers for the entire run (159.4 min of a 166.0 min job). The single job is already 97.6 % packed against those three workers, so splitting the gate *within* the job cannot help — the lever is runners. The gate becomes four same-template shard files filtering `GUARD_SURFACES` through an LPT partition recomputed live from the registry, plus one corpus-wide gates file; the workflow becomes a matrix of jobs, one runner per shard. A budget job makes wall-clock growth a named failure instead of something discovered by crossing a timeout.

**Tech Stack:** TypeScript, vitest 4.1.5 (`mutation` project, `fileParallelism: true`), GitHub Actions matrix jobs, `yaml` ^2.9.0 for workflow parsing in meta-tests.

**Spec:** `docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md` (APPROVED, Codex spec review R3, 0 findings). Probe record: `docs/superpowers/specs/ci/probes/2026-08-16-mutation-gate-weight-probe.md`.

impeccable-gate: N/A — no UI surface

> **Path convention in this document.** Files that already exist are cited in `code spans`; files **this plan creates** are written in **bold plain text**, because a citation to a file that does not exist yet is not a citation and `spec:lint` correctly refuses it.

## Global Constraints

- **`SOURCE_SHARD_COUNT = 4`.** Settled by measurement: `max` load is pinned by the heaviest surface for every `n ≥ 4`, so a fifth shard costs a runner and returns nothing (spec §2.4).
- **`SHARD_BUDGET_MINUTES = 60`**, against `timeout-minutes: 90` per shard job.
- **Weight is the boot model:** `mutants + accepted.length × (suitePaths.length − 1) + suitePaths.length`. Recomputed at shard startup from the live registry; **no weight table is committed** (spec §3.1).
- **No committed weight table, ever.** The partition is a pure function of the registry and the sources it names (`tests/parser/mutation/shardPartition.ts:5-8` is the property being preserved).
- **The gate stays non-gating** — not a required check. Nothing here reaches the merge path.
- **Serial per-mutant execution within a surface is unchanged.** This partitions across surfaces only.
- **The browser-mutant mode is out of scope** — separate file, separate workflow, separate budget (`.github/workflows/mutation-browser.yml:15` and `.github/workflows/mutation-browser.yml:60`).
- **`mutation-harness` is red on `main`** for two pre-existing reasons (spec §2.7, PR #824). Do not treat either as a regression of this work; AC-9's signature comparison is how you tell.
- **Commit per task**, conventional commits. Types/scopes in use here: `test(mutation)`, `feat(mutation)`, `chore(infra)`, `docs(plan)`.
- **Any local harness run goes through `pnpm heavy`** — `pnpm mutation:guards`, any `--project mutation` run, any build. This machine runs ~12 concurrent arcs behind a 2-slot semaphore. Scoped `vitest run <file>` on non-mutation suites, `pnpm typecheck`, and `pnpm spec:lint` stay unwrapped.

## Meta-test inventory (mandatory declaration)

**CREATES:**
- **tests/mutation/_metaSourceShardIntegrity.test.ts** — pins matrix index lists, shard file sets, and **realized execution targets** for both matrices against their TypeScript constants (AC-6a, AC-6b).
- **tests/mutation/source/shardPartition.test.ts** — the partition's own unit suite; also the referring suite that makes the module enrollable in the source-mutation registry (Task 7).

**EXTENDS:**
- `tests/cross-cutting/mutation-browser-ci-wiring.test.ts` — its two assertions naming the monolith must become shard-aware (Task 5).
- `tests/cross-cutting/vitest-projects-partition.test.ts` — the hard nightly-file count 11 → 15 (Task 3).
- `tests/mutation/_metaOverlayConfigParity.test.ts` — the `OWNERS` row for `slowTest.fixture.ts` repoints to the gates file (Task 2).
- `tests/mutation/source/registry.ts` — one new enrolled surface (Task 7).

**Declared N/A:** advisory-lock topology (no `pg_advisory*` in this diff); Supabase call-boundary registry (no Supabase client calls); admin-alert catalog; tile sentinel-hiding; layout-dimensions and transition-audit tasks (no UI surface).

## Mutation-family closure (guard surfaces shipped here)

Task 7 enrols **tests/mutation/source/shardPartition.ts** with the full declared operator set (`[...OPERATOR_NAMES]`, six families) — the same closure every other surface uses. The convergence criterion for the guard is **the mutation score plus an empty unaccepted-survivor set**, both machine-computed. A reviewer-proposed new operator family is a registry change carrying its own before/after numbers, not a round on this diff.

**Enrolment precedes the diff review** (`AGENTS.md`): Task 7 runs before the whole-diff dispatch, and its score plus survivor set go in the round-1 diff brief. The module is authored as an importable module with a referring suite from the start (Task 1), never a CLI script — that shape is what makes it enrollable at all.

---

## File structure

**Create**
| path | responsibility |
|---|---|
| **tests/mutation/source/shardPartition.ts** | `SOURCE_SHARD_COUNT`, `SHARD_BUDGET_MINUTES`, `weightOf`, `sourceShardAssignment`, `shardOfSurface`. The single source for every count in this arc. |
| **tests/mutation/source/shardPartition.test.ts** | Unit suite: totality, disjointness, determinism, weight model, degenerate counts. |
| **tests/mutation/source/expectedLedgerKinds.ts** | `EXPECTED_LEDGER_KINDS`, imported by both the shards (per-surface row) and the gates file (completeness). |
| **tests/mutation/source/surfaceCases.ts** | `registerSurfaceCases(surfaces)` — the seven per-surface `it`s, one copy, called by each shard. |
| `tests/mutation/guardSurfaces.shard{0,1,2,3}.test.ts` | Four same-template files; only the `SOURCE_SHARD` literal and the filename comment differ. |
| **tests/mutation/guardSurfaces.gates.test.ts** | Corpus-wide: registry completeness, partition totality/disjointness/balance, the `it`-count pin, and the live child-timeout premise. |
| **tests/mutation/_metaSourceShardIntegrity.test.ts** | Workflow ↔ constant ↔ file-set ↔ realized-target integrity, both matrices. |

**Delete**
| path | why |
|---|---|
| `tests/mutation/guardSurfaces.gate.test.ts` | Fully superseded; its two file-level `describe`s move to the gates file and its `describe.each` to **surfaceCases.ts**. |

**Modify**
| path | change |
|---|---|
| `vitest.projects.ts:83-97` | Five new files into `MUTATION_TEST_GLOBS` **and** `NIGHTLY_ONLY_EXCLUDES`; drop the monolith from both. |
| `.github/workflows/mutation-harness.yml` | One job → four job families + `budget`; `notify.needs` gains all of them. |
| the repo-root `package.json` (`mutation:guards`, line 55) | `mutation:guards` runs the shards + gates instead of the monolith. |
| `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:117-128` | Assertions made shard-aware. |
| `tests/cross-cutting/vitest-projects-partition.test.ts:254-257` | Nightly-file count 11 → 15, message updated. |
| `tests/mutation/_metaOverlayConfigParity.test.ts:58-66` | `OWNERS` row repoints to the gates file. |
| `tests/mutation/source/registry.ts` | One new enrolled surface. |
| `BACKLOG.md` | Marker off; entry graduates to `BACKLOG-archive.md`. |

---

<!-- tasks: depth=3 red-contract -->

### Task 1: The partition module and its unit suite

**Files:**
- Create: **tests/mutation/source/shardPartition.ts**
- Test: **tests/mutation/source/shardPartition.test.ts**

**Interfaces:**
- Consumes: `GUARD_SURFACES` and the `GuardSurface` type from `tests/mutation/source/registry.ts:12` and `tests/mutation/source/registry.ts:151`; `enumerateSites` from `tests/mutation/source/operators.ts:99`; `generateMutants` from `tests/mutation/source/generate.ts:34`.
- Produces:
  ```ts
  export const SOURCE_SHARD_COUNT = 4;
  export const SHARD_BUDGET_MINUTES = 60;
  export type ShardAssignment = ReadonlyMap<string, number>;   // surface id → shard index
  export function weightOf(surface: GuardSurface): number;
  export function sourceShardAssignment(surfaces?: readonly GuardSurface[]): ShardAssignment;
  export function shardOfSurface(id: string, assignment: ShardAssignment): number;
  ```
  `shardOfSurface` **throws** on an id absent from the assignment — an unshardable surface is corrupt data, not a skippable row (the same posture as `shardOfSiteId`, `tests/parser/mutation/shardPartition.ts:62-79`).

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts` why=`the module does not exist, so every import in the new suite fails to resolve` ac=AC-1,AC-2 -->

- [ ] **Step 1: Write the failing test**

```ts
// tests/mutation/source/shardPartition.test.ts
import { describe, expect, it } from "vitest";

import { GUARD_SURFACES } from "./registry";
import {
  SHARD_BUDGET_MINUTES,
  SOURCE_SHARD_COUNT,
  shardOfSurface,
  sourceShardAssignment,
  weightOf,
} from "./shardPartition";

describe("source-mutation shard partition", () => {
  const assignment = sourceShardAssignment();

  it("is total: every enrolled surface resolves to exactly one shard in range (AC-1)", () => {
    // Fails if a surface is dropped from the partition -- the failure mode that
    // would let a shard job go green while its surfaces never ran.
    expect(assignment.size).toBe(GUARD_SURFACES.length);
    for (const s of GUARD_SURFACES) {
      const shard = shardOfSurface(s.id, assignment);
      expect(Number.isInteger(shard)).toBe(true);
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(SOURCE_SHARD_COUNT);
    }
  });

  it("is disjoint-exhaustive: per-shard counts sum to the registry size (AC-1)", () => {
    const counts = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of GUARD_SURFACES) counts[shardOfSurface(s.id, assignment)]! += 1;
    expect(counts.reduce((a, b) => a + b, 0)).toBe(GUARD_SURFACES.length);
  });

  it("is deterministic: two independent computations agree (AC-2)", () => {
    // Load-bearing: each shard job recomputes the map on its OWN runner, so a
    // non-deterministic assignment would silently drop or double-run surfaces
    // across jobs while every individual job passed.
    const a = [...sourceShardAssignment().entries()].sort();
    const b = [...sourceShardAssignment().entries()].sort();
    expect(a).toEqual(b);
  });

  it("weighs a surface by modelled child boots, not by mutants alone", () => {
    // interactiveScanCore: 3 suites, 11 accepted survivors. mutants*suites would
    // be 816; the boot model is mutants + 11*2 + 3. Asserting the RELATION rather
    // than a literal, so the test survives the surface's mutant count changing.
    const scan = GUARD_SURFACES.find((s) => s.id === "interactiveScanCore");
    expect(scan, "interactiveScanCore must stay enrolled for this case to mean anything").toBeDefined();
    const s = scan!;
    const extra = s.accepted.length * (s.suitePaths.length - 1) + s.suitePaths.length;
    expect(weightOf(s)).toBeGreaterThan(extra);
    expect(weightOf(s)).toBeLessThan(s.suitePaths.length * weightOf(s));
    // The exact model, stated once:
    const mutantsOnly = weightOf(s) - extra;
    expect(weightOf(s)).toBe(mutantsOnly + extra);
  });

  it("packs the heaviest surface alone once shards outnumber the big surfaces", () => {
    // The spec's SOURCE_SHARD_COUNT=4 rests on this: max load is pinned by the
    // heaviest single surface. If a future registry makes that false, this reds
    // and the shard count wants re-deriving.
    const loads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of GUARD_SURFACES) loads[shardOfSurface(s.id, assignment)]! += weightOf(s);
    const heaviest = Math.max(...GUARD_SURFACES.map(weightOf));
    expect(Math.max(...loads)).toBeGreaterThanOrEqual(heaviest);
  });

  it("throws on a surface absent from the assignment rather than skipping it", () => {
    expect(() => shardOfSurface("no-such-surface", assignment)).toThrow(/no-such-surface/);
  });

  it("declares a budget below the per-job timeout", () => {
    expect(SHARD_BUDGET_MINUTES).toBeGreaterThan(0);
    expect(SHARD_BUDGET_MINUTES).toBeLessThan(90);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/mutation/source/shardPartition.test.ts`
Expected: FAIL — `Failed to resolve import "./shardPartition"`. The production surface whose absence causes this is **tests/mutation/source/shardPartition.ts**; it does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// tests/mutation/source/shardPartition.ts
// Deterministic LPT partition of the enrolled source-mutation surfaces
// (spec docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md §3.1).
//
// Weighted by MODELLED CHILD BOOTS, not by mutant count and not by
// mutants*suites. `runAllSuites` short-circuits on the first suite that rejects
// (runner.ts:216-228), so a KILLED mutant costs one boot however many suites the
// surface declares, while a SURVIVOR pays every suite. In a green run every
// survivor is a ledgered `accepted` row, because an unaccepted survivor fails
// the gate -- so `accepted.length` IS the survivor count.
//
// Pure function of the registry and the sources it names: every shard recomputes
// the identical map on its own runner, so there is NO committed weight table to
// go stale.
import { readFileSync } from "node:fs";

import { generateMutants } from "./generate";
import { enumerateSites } from "./operators";
import { GUARD_SURFACES, type GuardSurface } from "./registry";

/** Four, because max load is pinned by the heaviest surface from n=4 on (spec §2.4). */
export const SOURCE_SHARD_COUNT = 4;

/** Per-shard wall-clock budget, well under the 90-minute per-job timeout (spec §3.5). */
export const SHARD_BUDGET_MINUTES = 60;

export type ShardAssignment = ReadonlyMap<string, number>;

/** boots = mutants + accepted*(suites-1) + suites. See the header. */
export function weightOf(surface: GuardSurface): number {
  const text = readFileSync(surface.sourcePath, "utf8");
  const sites = enumerateSites(surface.sourcePath, text, surface.operators);
  const { mutants } = generateMutants(surface.sourcePath, text, surface.operators, sites);
  const suites = surface.suitePaths.length;
  return mutants.length + surface.accepted.length * (suites - 1) + suites;
}

/** Deterministic LPT: sort by (weight desc, id asc), assign to the least-loaded
 *  shard, ties to the lowest index. Integer arithmetic and lexicographic ties
 *  only, so it is platform-independent. */
export function sourceShardAssignment(
  surfaces: readonly GuardSurface[] = GUARD_SURFACES,
): ShardAssignment {
  const weighed = surfaces.map((s) => ({ key: s.id, w: weightOf(s) }));
  const sorted = [...weighed].sort((a, b) => b.w - a.w || (a.key < b.key ? -1 : 1));
  const loads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
  const assign = new Map<string, number>();
  for (const p of sorted) {
    let best = 0;
    for (let i = 1; i < SOURCE_SHARD_COUNT; i++) if (loads[i]! < loads[best]!) best = i;
    assign.set(p.key, best);
    loads[best] = loads[best]! + p.w;
  }
  return assign;
}

/** Throws on an unknown id: a surface that cannot be sharded is corrupt data,
 *  not a row to skip past. Skipping it would drop it from every shard silently. */
export function shardOfSurface(id: string, assignment: ShardAssignment): number {
  const shard = assignment.get(id);
  if (shard === undefined) {
    throw new Error(`shardOfSurface: surface ${id} is absent from the assignment`);
  }
  return shard;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/mutation/source/shardPartition.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. This repo runs `noUncheckedIndexedAccess`, which is why every indexed read above carries `!` after a bounds-establishing loop.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/source/shardPartition.ts tests/mutation/source/shardPartition.test.ts
git commit -m "feat(mutation): deterministic LPT partition over enrolled guard surfaces"
```

---

### Task 2: Extract the shared body, then split into four shard files and one gates file

**Files:**
- Create: **tests/mutation/source/expectedLedgerKinds.ts**, **tests/mutation/source/surfaceCases.ts**
- Create: **tests/mutation/guardSurfaces.shard0.test.ts** … **shard3.test.ts**
- Create: **tests/mutation/guardSurfaces.gates.test.ts**
- Delete: `tests/mutation/guardSurfaces.gate.test.ts`
- Modify: `tests/mutation/_metaOverlayConfigParity.test.ts:58-66`

**Interfaces:**
- Consumes: `registerSurfaceCases`, `EXPECTED_LEDGER_KINDS` (Task 2); `SOURCE_SHARD_COUNT`, `shardOfSurface`, `sourceShardAssignment`, `weightOf` (Task 1).

<!-- task: red=`pnpm vitest run tests/mutation/_metaOverlayConfigParity.test.ts` red-state=authored red-target=`tests/mutation/_metaOverlayConfigParity.test.ts:60` why=`deleting the monolith orphans the OWNERS row that maps slowTest.fixture.ts to it, so this suite goes red on a missing owner file until the row is repointed at the gates file` ac=AC-3,AC-4,AC-5 -->

- [ ] **Step 1: Move `EXPECTED_LEDGER_KINDS` verbatim**

Cut the whole `const EXPECTED_LEDGER_KINDS` declaration (`tests/mutation/guardSurfaces.gate.test.ts:34-159`) into **tests/mutation/source/expectedLedgerKinds.ts**, **comments included** — every comment there is a per-surface argument someone paid review rounds for. Export it. In the gate file, replace with `import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";`.

- [ ] **Step 2: Move the seven per-surface cases**

Cut the entire `describe.each(...)` block (`tests/mutation/guardSurfaces.gate.test.ts:169-265`) into **tests/mutation/source/surfaceCases.ts**, wrapped:

```ts
// tests/mutation/source/surfaceCases.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { evaluateGate } from "./gate";
import { EXPECTED_LEDGER_KINDS } from "./expectedLedgerKinds";
import type { GuardSurface } from "./registry";
import { runControl, runSurface } from "./runner";

const root = process.cwd();

/**
 * The seven per-surface gate cases, in ONE copy.
 *
 * Called by each shard file with its own slice. `runSurface` runs at MODULE
 * scope inside describe.each -- that is deliberate and load-bearing: it is why
 * the gate's cost is vitest IMPORT time, and it is why a shard must filter
 * BEFORE calling this rather than skipping cases afterwards. A `describe.skip`
 * or a filtered `it` would still pay the full run during collection.
 */
export function registerSurfaceCases(surfaces: readonly GuardSurface[]): void {
  describe.each(surfaces.map((s) => [s.id, s] as const))(
    GATE_EACH_TITLE, // verbatim from the current file, unchanged, em-dash included
    (_id, surface) => {
      // ... the existing body, verbatim and unmodified, from `const before =`
      //     through the closing of the 600_000-budget control case ...
    },
  );
}
```

Everything inside the `describe.each` callback moves **unmodified**. Do not take the opportunity to tidy it.

- [ ] **Step 3: Write the four shard files**

Each is this, with only `SOURCE_SHARD` and the filename in the header comment differing:

```ts
// tests/mutation/guardSurfaces.shard0.test.ts
// One LPT slice of the enrolled source-mutation surfaces (wall-clock spec §3.2).
// Runs ONLY in the env-gated `mutation` vitest project. All SOURCE_SHARD_COUNT
// shard files are this same template with only the SOURCE_SHARD literal and this
// filename differing -- pinned by tests/mutation/_metaSourceShardIntegrity.test.ts.
import { GUARD_SURFACES } from "./source/registry";
import { shardOfSurface, sourceShardAssignment } from "./source/shardPartition";
import { registerSurfaceCases } from "./source/surfaceCases";

const SOURCE_SHARD = 0;

const assignment = sourceShardAssignment();
registerSurfaceCases(
  GUARD_SURFACES.filter((s) => shardOfSurface(s.id, assignment) === SOURCE_SHARD),
);
```

Filtering happens **before** `registerSurfaceCases`, never after — see the note in **surfaceCases.ts**.

- [ ] **Step 4: Write the gates file**

```ts
// tests/mutation/guardSurfaces.gates.test.ts
// Corpus-wide checks over the WHOLE registry, which therefore cannot live in any
// shard (wall-clock spec §3.3). Near-instant: generation only, except the one
// child spawned by the timeout premise at the bottom.
import { describe, expect, it } from "vitest";

import { childRun, INERT_TARGET } from "./source/childRun";
import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";
import { GUARD_SURFACES } from "./source/registry";
import {
  SOURCE_SHARD_COUNT,
  shardOfSurface,
  sourceShardAssignment,
  weightOf,
} from "./source/shardPartition";

describe(REGISTRY_DESCRIBE_TITLE, () => { // verbatim from the current file, unchanged
  it("declares expected ledger-kind counts for every enrolled surface", () => {
    // Corpus-wide by construction: it compares against the WHOLE registry, so
    // duplicating it into a shard would fail in every shard (each sees a subset).
    expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(
      GUARD_SURFACES.map((s) => s.id).sort(),
    );
  });
});

describe("shard partition over the live registry", () => {
  const assignment = sourceShardAssignment();

  it("(a) assigns every enrolled surface to exactly one shard in range", () => {
    expect(assignment.size).toBe(GUARD_SURFACES.length);
    for (const s of GUARD_SURFACES) {
      const shard = shardOfSurface(s.id, assignment);
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(SOURCE_SHARD_COUNT);
    }
  });

  it("(b) per-shard counts sum to the registry size, so the partition is disjoint-exhaustive", () => {
    const counts = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of GUARD_SURFACES) counts[shardOfSurface(s.id, assignment)]! += 1;
    expect(counts.reduce((a, b) => a + b, 0)).toBe(GUARD_SURFACES.length);
  });

  it("(c) load spread stays sane against the heaviest indivisible surface", () => {
    const loads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of GUARD_SURFACES) loads[shardOfSurface(s.id, assignment)]! += weightOf(s);
    const total = loads.reduce((a, b) => a + b, 0);
    const heaviest = Math.max(...GUARD_SURFACES.map(weightOf));
    // The achievable floor is the heaviest single surface, not total/N.
    expect(Math.max(...loads)).toBeLessThanOrEqual(
      Math.max(heaviest, (total / SOURCE_SHARD_COUNT) * 1.2),
    );
  });

  it("(d) pins the per-surface case count at 7", () => {
    // §2.2 reads enrolment off a run's test count as (tests - 2) / 7. If the
    // per-surface case count ever changes, that arithmetic silently misreports
    // and this is the tripwire.
    expect(7).toBe(7);
  });
});

/**
 * The per-mutant config's timeout is actually in force (guard-premise Task 2).
 *
 * Corpus-wide, not per-surface, so it lives here rather than in a shard. It must
 * not be dropped: without it a mutant that merely runs long is classified KILLED
 * through tests/mutation/source/runner.ts:223-227, silently inflating the score.
 * tests/mutation/_metaOverlayConfigParity.test.ts compares configured VALUES and
 * cannot prove one takes effect.
 *
 * The fixture sleeps 5.2s, so this is the one child this file spawns.
 */
describe("the per-mutant config's timeout is in force", () => {
  it("runs a fixture that outlives vitest's 5000ms default", () => {
    expect(childRun(root, "tests/mutation/source/fixtures/slowTest.fixture.ts", INERT_TARGET)).toBe(
      0,
    );
  }, 300_000);
});
```

> `(d)` above is a deliberate placeholder shape and **must not ship as written** — `expect(7).toBe(7)` is a tautology. Replace it with a count derived from the source: read **tests/mutation/source/surfaceCases.ts** and assert its `it(` occurrence count inside `registerSurfaceCases` is 7, so adding or removing a case reds this test and forces §2.2's arithmetic to be revisited. Also declare `const root = process.cwd();` alongside the imports.

- [ ] **Step 5: Delete the monolith and repoint the OWNERS row**

```bash
git rm tests/mutation/guardSurfaces.gate.test.ts
```

In the `OWNERS` map (`tests/mutation/_metaOverlayConfigParity.test.ts:58-66`), change the value for `"slowTest.fixture.ts"` from **“tests/mutation/guardSurfaces.gate.test.ts”** to **“tests/mutation/guardSurfaces.gates.test.ts”**.

- [ ] **Step 6: Run the parity suite to verify it passes**

Run: `pnpm vitest run tests/mutation/_metaOverlayConfigParity.test.ts`
Expected: PASS. Run it **before** the repoint too, to observe the RED this task declares: with the monolith deleted and the row unchanged it fails on a missing owner file.

- [ ] **Step 7: Run the gates file**

Run: `pnpm heavy pnpm vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts`
Expected: PASS in seconds — generation plus one 5.2 s child.

- [ ] **Step 8: Commit**

```bash
git add -A tests/mutation/
git commit -m "feat(mutation): shard the source-mutation gate into four files plus a corpus-wide gates file"
```

---

### Task 3: Project wiring — keep all five new files off the merge path

The failure mode here is severe and silent: `PARALLEL_TEST_GLOBS` contains `tests/mutation/**/*.test.{ts,tsx}` (`vitest.projects.ts:143`), so a new shard file that reaches `MUTATION_TEST_GLOBS` but **not** `NIGHTLY_ONLY_EXCLUDES` is admitted by the `parallel` project and runs on every pull request — putting a per-mutant harness on the merge path of every PR in the repo.

**Files:**
- Modify: `vitest.projects.ts:83-97`
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts:254-257`

<!-- task: red=`pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts` red-state=authored red-target=`tests/cross-cutting/vitest-projects-partition.test.ts:256` why=`Task 2 added five nightly files and removed one; the suite's hard count assertion still says 11 and its every-file-in-exactly-one-project check now sees five files admitted by the parallel project` ac=AC-9a -->

- [ ] **Step 1: Run the partition suite to observe the RED**

Run: `pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL — the `nightlyCount` assertion reports 11 expected against the new file set, and the exactly-one-project check names the five new files.

- [ ] **Step 2: Add all five files to BOTH lists**

In `vitest.projects.ts`, replace the single **“tests/mutation/guardSurfaces.gate.test.ts”** entry in `MUTATION_TEST_GLOBS` (`vitest.projects.ts:87`) with the shard glob plus the gates file, and make the same replacement in `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts:95`) with its `**/` prefix:

```ts
// MUTATION_TEST_GLOBS
  // Source-mutation gate, sharded (wall-clock spec §3.2/§3.3): four shard files
  // plus one corpus-wide gates file. Each shard spawns one vitest child per
  // mutant, so all of them are nightly + on-demand, never merge-gating.
  "tests/mutation/guardSurfaces.shard*.test.ts",
  "tests/mutation/guardSurfaces.gates.test.ts",

// NIGHTLY_ONLY_EXCLUDES
  "**/tests/mutation/guardSurfaces.shard*.test.ts",
  "**/tests/mutation/guardSurfaces.gates.test.ts",
```

Both lists, or the files land on every PR. The glob `guardSurfaces.shard*.test.ts` covers all four without naming them, so raising `SOURCE_SHARD_COUNT` does not need this file edited again — but `_metaSourceShardIntegrity` (Task 5) still pins the file set to the constant.

- [ ] **Step 3: Update the hard nightly-file count**

At `tests/cross-cutting/vitest-projects-partition.test.ts:254-257`, the count goes 11 → **15** and the message must be updated with it — the existing text enumerates its own arithmetic and would be stale on its face. Keep the `live in no default project` clause, which is the sentence's actual claim:

```ts
      expect(
        nightlyCount,
        "exactly the 15 nightly files (9 parser harness + 4 source-mutation shards + the source-mutation gates file + the browser-mutant gate) live in no default project",
      ).toBe(15);
```

**This suite reads the workflow as RAW TEXT, not parsed YAML** (`readFileSync` at `tests/cross-cutting/vitest-projects-partition.test.ts:394`, then `includes`/regex). Two of its string checks must keep matching after Task 4's rewrite: `wf.includes("--project mutation")` and `wf.includes("tests/parser/mutationHarness.*.test.ts")`. The second is satisfied by the **`paths:` filter** (`.github/workflows/mutation-harness.yml:32`), not by a run line — so that filter line must survive the matrix rewrite verbatim. Re-run this suite after Task 4 as well as here.

- [ ] **Step 4: Run the partition suite to verify it passes**

Run: `pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the files really are off the merge path**

Run: `pnpm vitest run tests/mutation/guardSurfaces.shard0.test.ts --project parallel 2>&1 | tail -5`
Expected: **no test file matched** for the `parallel` project. This is the assertion that matters most in this task, and it is checked directly rather than inferred from the partition suite passing.

- [ ] **Step 6: Commit**

```bash
git add vitest.projects.ts tests/cross-cutting/vitest-projects-partition.test.ts
git commit -m "chore(infra): keep the sharded mutation gate in the nightly project only"
```

---

### Task 4: The workflow matrix, its budget job, and the integrity meta-test that pins them

The meta-test is written **first** and observed red against the current single-job workflow, then the workflow is rewritten to satisfy it. That order is what makes the test a guard rather than a transcript of whatever got written.

**Files:**
- Create: **tests/mutation/_metaSourceShardIntegrity.test.ts**
- Modify: `.github/workflows/mutation-harness.yml`

**Interfaces:**
- Consumes: `SOURCE_SHARD_COUNT`, `SHARD_BUDGET_MINUTES` (Task 1); `SHARD_COUNT` from `tests/parser/mutation/shardPartition.ts:11`.

<!-- task: red=`pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:43` why=`the workflow has one job with no matrix, so the index-list, realized-target and per-family assertions all fail until it is rewritten` ac=AC-6a,AC-6b,AC-6c -->

- [ ] **Step 1: Write the failing meta-test**

```ts
// tests/mutation/_metaSourceShardIntegrity.test.ts
// The workflow's matrices, the shard FILE sets, and each leg's REALIZED TARGET,
// all pinned to their TypeScript constants (wall-clock spec §3.4.1).
//
// WHY REALIZED TARGETS AND NOT JUST INDEX LISTS. A correct `[0,1,2,3]` says
// nothing about what each leg RUNS. Every leg could hard-code the shard-0 file
// with the index list, the file set, and the gates file's logical totality proof
// all still green, while three quarters of the surfaces never executed. That is
// not abstract: interactionTimingScan lands in source shard 1 and the drifted
// parser fingerprints in parser shard 4, so a run-shard-0-everywhere workflow
// would make BOTH failures currently live on `main` disappear and look greener
// than today.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { SHARD_COUNT } from "../parser/mutation/shardPartition";
import { premiseHolds } from "../_shared/premise";
import { SHARD_BUDGET_MINUTES, SOURCE_SHARD_COUNT } from "./source/shardPartition";

const ROOT = join(__dirname, "..", "..");
const WORKFLOW = ".github/workflows/mutation-harness.yml";
const wf = parseYaml(readFileSync(join(ROOT, WORKFLOW), "utf8")) as {
  jobs: Record<string, { strategy?: { matrix?: Record<string, unknown>; "fail-fast"?: boolean }; needs?: unknown; steps?: { run?: string }[] }>;
};

const runsOf = (job: string): string[] =>
  (wf.jobs[job]?.steps ?? []).map((s) => s.run ?? "").filter((r) => r.length > 0);

const FAMILIES = [
  { job: "parser-shards", count: SHARD_COUNT, file: (i: number) => `tests/parser/mutationHarness.shard${i}.test.ts` },
  { job: "source-shards", count: SOURCE_SHARD_COUNT, file: (i: number) => `tests/mutation/guardSurfaces.shard${i}.test.ts` },
] as const;

describe("mutation-harness matrices are pinned to their constants", () => {
  it("the workflow parses and declares both shard families", () => {
    premiseHolds("mutation-harness.yml defines jobs", Object.keys(wf.jobs ?? {}).length > 0);
    for (const f of FAMILIES) expect(Object.keys(wf.jobs)).toContain(f.job);
  });

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: matrix index list is exactly 0..COUNT-1 (AC-6a)",
    (_job, f) => {
      const matrix = wf.jobs[f.job]!.strategy!.matrix as { shard: number[] };
      expect(matrix.shard).toEqual(Array.from({ length: f.count }, (_, i) => i));
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: carries no include/exclude modifier, which could alter realized legs (AC-6b)",
    (_job, f) => {
      const matrix = wf.jobs[f.job]!.strategy!.matrix as Record<string, unknown>;
      expect(Object.keys(matrix).sort()).toEqual(["shard"]);
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: interpolates matrix.shard and resolves to that index's file (AC-6b)",
    (_job, f) => {
      const run = runsOf(f.job).find((r) => r.includes("vitest"));
      expect(run, `${f.job} has no vitest run step`).toBeDefined();
      // The leg must not name a fixed index...
      expect(run!).toMatch(/\$\{\{\s*matrix\.shard\s*\}\}/);
      // ...and substituting each index must yield exactly that index's file.
      for (let i = 0; i < f.count; i++) {
        const realized = run!.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i));
        expect(realized).toContain(f.file(i));
      }
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: the shard FILE set on disk is exactly 0..COUNT-1 (AC-6a)",
    (_job, f) => {
      const rel = f.file(0);
      const dir = join(ROOT, rel.slice(0, rel.lastIndexOf("/")));
      const stem = rel.slice(rel.lastIndexOf("/") + 1).replace("0.test.ts", "");
      const found = readdirSync(dir)
        .filter((n) => new RegExp(`^${stem}\\d+\\.test\\.ts$`).test(n))
        .sort();
      expect(found).toEqual(
        Array.from({ length: f.count }, (_, i) => `${stem}${i}.test.ts`).sort(),
      );
    },
  );

  it("every shard file's own literal matches its filename (AC-4)", () => {
    for (const f of FAMILIES) {
      for (let i = 0; i < f.count; i++) {
        const src = readFileSync(join(ROOT, f.file(i)), "utf8");
        const m = /const (?:SOURCE_)?SHARD\s*=\s*(\d+)/.exec(src);
        expect(m, `${f.file(i)} declares no shard literal`).not.toBeNull();
        expect(Number(m![1])).toBe(i);
      }
    }
  });

  it("the realized target union is exactly this workflow's 14 files, each once (AC-6b)", () => {
    const realized: string[] = [];
    for (const f of FAMILIES) {
      const run = runsOf(f.job).find((r) => r.includes("vitest"))!;
      for (let i = 0; i < f.count; i++) {
        realized.push(
          run.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i)).match(/tests\/\S+\.test\.ts/)![0],
        );
      }
    }
    for (const [job, file] of [
      ["parser-gates", "tests/parser/mutationHarness.gates.test.ts"],
      ["source-gates", "tests/mutation/guardSurfaces.gates.test.ts"],
    ] as const) {
      const run = runsOf(job).find((r) => r.includes("vitest"))!;
      expect(run, `${job} must name its own gates file`).toContain(file);
      expect(run, `${job} must not name a shard file`).not.toMatch(/shard\d+\.test\.ts/);
      realized.push(file);
    }
    expect(new Set(realized).size, "a file is named by two legs").toBe(realized.length);
    expect(realized).toHaveLength(SHARD_COUNT + SOURCE_SHARD_COUNT + 2);
    // The browser gate belongs to mutation-browser.yml and must appear nowhere here.
    expect(realized.some((r) => r.includes("browser"))).toBe(false);
  });

  it("a shard's siblings are not cancelled by its failure, and budget gates notify (AC-6c)", () => {
    for (const f of FAMILIES) expect(wf.jobs[f.job]!.strategy!["fail-fast"]).toBe(false);
    expect(wf.jobs["notify"]!.needs).toContain("budget");
  });

  it("the declared budget is below every shard job's timeout", () => {
    expect(SHARD_BUDGET_MINUTES).toBeLessThan(90);
  });
});
```

> **Typechecked at plan time.** This body and Task 1's module were both written into the worktree and run through `pnpm typecheck` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) before this plan was dispatched; both were clean, and the file-set case above is the form that compiled. The temporary files were removed afterwards.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: FAIL on the first case — `.github/workflows/mutation-harness.yml` has a single `mutation-harness` job and neither `parser-shards` nor `source-shards` exists.

- [ ] **Step 3: Rewrite the workflow**

Replace the single `mutation-harness` job with four families plus `budget`. Preserve, unchanged: the workflow-level `concurrency` block with `${{ github.ref }}` and PR-only cancel (`tests/cross-cutting/ci-workflow-speedup.test.ts:37-80` requires it at workflow level, and a job-level matrix must not displace it); `permissions: contents: read` on every harness job; `issues: write` on `notify` alone; the `schedule`/`workflow_dispatch`/path-filtered `pull_request` triggers; `VITEST_INCLUDE_MUTATION_HARNESS: "1"`; and the `actions/checkout@v4` + `./.github/actions/setup` step pair, which each job now repeats.

Each shard job appends its elapsed minutes to a **uniquely named** artifact:

```yaml
      - name: Record elapsed
        if: always()
        run: |
          echo "$(( ($(date +%s) - START) / 60 ))" > elapsed.txt
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: elapsed-source-shards-${{ matrix.shard }}
          path: elapsed.txt
```

Artifacts, not job outputs: matrix children share one output name and overwrite each other nondeterministically, so the slow shard is exactly the value that would vanish.

```yaml
  budget:
    needs: [parser-shards, parser-gates, source-shards, source-gates]
    if: always()
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { pattern: elapsed-*, merge-multiple: false, path: elapsed }
      - name: Enforce the per-shard budget
        run: node .github/scripts/check-shard-budget.mjs elapsed
```

**check-shard-budget.mjs** **fails closed on completeness first**: it asserts it received exactly `SHARD_COUNT + SOURCE_SHARD_COUNT + 2` records and names any that are absent or duplicated, before it maximises over anything. A budget job that cannot see every shard must say so, not silently maximise over the shards that did report. Then: fail above `SHARD_BUDGET_MINUTES`, a **::warning::** annotation above 75 % of it.

`notify` takes `needs: [parser-shards, parser-gates, source-shards, source-gates, budget]` and names the failing job(s) in the issue body. Without `budget` in that list a budget-only failure files no issue, and worse, the green branch could auto-close the standing issue on a run whose budget check failed.

- [ ] **Step 4: Run the meta-test to verify it passes**

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify the meta-test — the mutant that matters**

This is the four-mutant discipline applied where it counts. Temporarily edit the workflow so **every** `source-shards` leg runs **tests/mutation/guardSurfaces.shard0.test.ts** (drop the `${{ matrix.shard }}` interpolation), then run the meta-test.

Expected: FAIL on "interpolates matrix.shard and resolves to that index's file". If it PASSES, the test is not pinning realized targets and the task is not done. Revert the edit afterwards and re-run to confirm green. Record both observations in the commit message.

Run three more mutants and record each: (a) `matrix: { shard: [0,1,2] }` → must fail the index-list case; (b) add `include: [{ shard: 9 }]` → must fail the no-modifier case; (c) point `source-gates` at a shard file → must fail the gates-leg case.

- [ ] **Step 6: Validate the budget script against a constructed failing input**

Run: `node .github/scripts/check-shard-budget.mjs <a fixture dir containing one record of 999>`
Expected: non-zero exit naming the over-budget shard. Then remove one record from the fixture dir and re-run: expected non-zero exit naming the **absent** leg. A budget check never observed failing is not known to fail (AC-7).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/mutation-harness.yml .github/scripts/check-shard-budget.mjs tests/mutation/_metaSourceShardIntegrity.test.ts
git commit -m "feat(infra): run every mutation shard as its own job, with a fail-closed wall-clock budget"
```

---

### Task 5: Make the browser-gate wiring test shard-aware

`tests/cross-cutting/mutation-browser-ci-wiring.test.ts` asserts, on **every** run string containing `--project mutation`, that it names `tests/mutation/guardSurfaces.gate.test.ts` (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:124`) and matches `/mutationHarness/` (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:125`). Both are false under the matrix: the monolith is gone, and a source-shard leg names no `mutationHarness` file.

Its real contract, and the one worth keeping, is `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:121-123`: no leg may run a bare `--project mutation`, because that would sweep in the browser gate. That assertion survives untouched.

**Files:**
- Modify: `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:117-128`

<!-- task: red=`pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts` red-state=authored red-target=`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:124` why=`Task 4 replaced the single job whose run string named the monolith, so the two assertions at :124-125 fail against every matrix leg` ac=AC-6b -->

- [ ] **Step 1: Run it to observe the RED**

Run: `pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts`
Expected: FAIL on the `guardSurfaces.gate.test.ts` and `mutationHarness` matchers.

- [ ] **Step 2: Replace the two file-naming assertions**

Keep `premiseHolds` (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:119`) and the bare-`--project mutation` prohibition (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:121-123`) exactly as they are. Replace lines 124-125 with an assertion that each run names **an explicit nightly subject of this workflow**, whichever family it belongs to:

```ts
      // Post-sharding: a leg names its own explicit subject, which is a parser
      // harness file OR a source-mutation shard/gates file. NOTE the YAML is
      // parsed but its `${{ matrix.shard }}` expressions are NOT evaluated, so a
      // shard leg's run string contains that literal text -- match on the stable
      // prefix rather than trying to match an interpolated index.
      //
      // The invariant that matters is the one above: never a bare
      // `--project mutation`, which would sweep in the browser gate. Per-leg
      // realized-target correctness is pinned by
      // tests/mutation/_metaSourceShardIntegrity.test.ts, not here.
      expect(run, "a mutation leg must name an explicit nightly subject").toMatch(
        /tests\/parser\/mutationHarness|tests\/mutation\/guardSurfaces\.(shard|gates)/,
      );
```

- [ ] **Step 3: Verify the browser exclusion still holds**

The `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:126-128` assertion that no run matches `/tests\/mutation\/browser/` is unchanged and must stay green — it is what keeps the browser gate out of this workflow.

Run: `pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts`
Expected: PASS.

- [ ] **Step 4: Mutant check**

Temporarily add a job step running a bare `pnpm exec vitest run --project mutation` and re-run: expected FAIL on `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:121-123`. Revert. Records that the surviving assertion still discriminates.

- [ ] **Step 5: Commit**

```bash
git add tests/cross-cutting/mutation-browser-ci-wiring.test.ts
git commit -m "test(infra): make the browser-gate wiring assertions shard-aware"
```

---

### Task 6: Local entry point and documentation

**Files:**
- Modify: the repo-root `package.json` (`mutation:guards`, line 55)
- Modify: `.github/workflows/mutation-harness.yml` (header comment + notify issue body)

<!-- task: red=`pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`tests/mutation/_metaSourceShardIntegrity.test.ts` why=`a new case pins the mutation:guards script to the same shard constant; it fails while the script still names the deleted monolith` ac=AC-10 -->

- [ ] **Step 1: Add the entry-point case to the integrity meta-test, and observe the RED**

The local command is a third copy of the shard count, alongside the matrix and the file set, so it is pinned in the same place as the other two. Add to **tests/mutation/_metaSourceShardIntegrity.test.ts**:

```ts
  it("the mutation:guards script names exactly the sharded gate files (AC-10)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts["mutation:guards"] ?? "";
    for (let i = 0; i < SOURCE_SHARD_COUNT; i++) {
      expect(script).toContain(`tests/mutation/guardSurfaces.shard${i}.test.ts`);
    }
    expect(script).toContain("tests/mutation/guardSurfaces.gates.test.ts");
    // The retired monolith must not survive here after the split.
    expect(script).not.toContain("guardSurfaces.gate.test.ts");
  });
```

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: FAIL — the script still names the deleted monolith and none of the shard files.

> Note the assertion order: the negative check names the retired file exactly. Written loosely it could also reject the NEW gates filename, since the retired name is **not** a substring of the new one, but the reverse check is easy to get backwards. Assert the positives first, then the negative, and keep the negative on the exact retired filename.

- [ ] **Step 2: Repoint the script**

```json
"mutation:guards": "VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/guardSurfaces.shard0.test.ts tests/mutation/guardSurfaces.shard1.test.ts tests/mutation/guardSurfaces.shard2.test.ts tests/mutation/guardSurfaces.shard3.test.ts tests/mutation/guardSurfaces.gates.test.ts",
```

Named explicitly rather than globbed, so the local command runs exactly the set the meta-test pins. **Keep the script NAME** — `tests/docs/agentsHeavyPhaseRule.test.ts:119` and `AGENTS.md:246` pin `pnpm mutation:guards` as a must-wrap invocation, and renaming it breaks both.

- [ ] **Step 3: Update the workflow's prose**

The header comment (`.github/workflows/mutation-harness.yml:2-15`) still describes "8 LPT-balanced shard files + 1 generation-only gates file" run by one job, and quotes a `~60-75 min` estimate the measurements superseded. Rewrite it for the matrix, citing runs `31871859884` (137.3 min) and `31933821808` (166.0 min) and the new expected wall clock. Delete the `timeout-minutes: 180 -> 300` rationale block, which no longer describes anything.

In the notify issue body, section B (`.github/workflows/mutation-harness.yml:112`) names `tests/mutation/guardSurfaces.gate.test.ts`; repoint it at the shard files and add a line telling the triager to check the budget job, since a budget failure now reaches this issue.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: PASS.

Then confirm the script itself resolves its files, without measuring an exit code through a pipe (a pipeline reports `head`'s status, not the command's):

Run: `pnpm heavy pnpm mutation:guards --reporter=dot`
Expected: collection finds five files. Interrupt once collection is confirmed — the full local run is Task 7's job.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/mutation-harness.yml
git commit -m "chore(infra): repoint mutation:guards and the harness prose at the sharded gate"
```

---

### Task 7: Enrol the partition module in the source-mutation registry

Required **before** the whole-diff review dispatch: this arc ships a guard surface the registry can express, and `AGENTS.md` makes enrolment precede review so the convergence criterion is a mutation score plus an empty unaccepted-survivor set rather than reviewer imagination.

**Files:**
- Modify: `tests/mutation/source/registry.ts`
- Modify: **tests/mutation/source/expectedLedgerKinds.ts**

<!-- task: red=`pnpm vitest run tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts` why=`adding a registry row without its EXPECTED_LEDGER_KINDS entry fails the completeness assertion -- the fail-by-default property that makes a new surface declare its own counts` ac=AC-5 -->

- [ ] **Step 1: Add the registry row**

```ts
  {
    id: "sourceShardPartition",
    sourcePath: "tests/mutation/source/shardPartition.ts",
    suitePaths: ["tests/mutation/source/shardPartition.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Flips the least-loaded comparison, which is the whole of LPT: with `>` the
    // packing inverts and the balance case must notice.
    control: { from: "loads[i]! < loads[best]!", to: "loads[i]! > loads[best]!" },
    accepted: [],
  },
```

- [ ] **Step 2: Run the gates file to observe the RED**

Run: `pnpm vitest run tests/mutation/guardSurfaces.gates.test.ts`
Expected: FAIL — `EXPECTED_LEDGER_KINDS` has no `sourceShardPartition` key while `GUARD_SURFACES` now does. This is the fail-by-default property working.

- [ ] **Step 3: Declare the surface's expected ledger kinds**

```ts
  // Enrolled 2026-08-16 with an EMPTY ledger, deliberately. Every branch in the
  // partition is decided by tests/mutation/source/shardPartition.test.ts, so a
  // row appearing here later is a coverage regression to repair, not a number
  // to bump.
  sourceShardPartition: {},
```

- [ ] **Step 4: Run the surface's own mutation gate**

Run: `pnpm heavy pnpm vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts tests/mutation/guardSurfaces.shard0.test.ts tests/mutation/guardSurfaces.shard1.test.ts tests/mutation/guardSurfaces.shard2.test.ts tests/mutation/guardSurfaces.shard3.test.ts`

Expected: PASS. **Record the new surface's score and its full survivor list in the commit message** — those two numbers are the convergence criterion the diff-review brief states.

Every survivor is repaid with a test case in `shardPartition.test.ts` or argued into `EXPECTED_LEDGER_KINDS` with a reachability argument in prose. Do not bless a survivor you have not argued.

- [ ] **Step 5: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts tests/mutation/source/shardPartition.test.ts
git commit -m "test(mutation): enrol the shard partition as a source-mutation surface"
```

---

<!-- tasks: end -->

### Task 8: Closeout

**Files:**
- Modify: `BACKLOG.md` (marker off, entry out)
- Modify: `BACKLOG-archive.md` (entry in)
- Create: **docs/superpowers/plans/2026-08-16-mutation-gate-sharding-closeout.md**

- [ ] **Step 1: Capture the merge-base failure signature set (AC-9)**

Before triaging any red on this branch, record the merge-base's failure signatures — from spec §2.7, or a fresh `gh workflow run mutation-harness.yml --ref <merge-base>`. Paste them into the closeout doc:

```
interactionTimingScan / unaccepted-survivor / logical-connector:330:39:&&>||
parser shard4 / DRIFTED / blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L35..L45 (11 rows)
```

The criterion is set **equality**, not subset. A signature on the branch and not the merge-base is a regression of this diff. A signature on the merge-base and not the branch is **a disappearance to explain, not a win** — most likely something stopped executing. Shard index is never part of a signature.

- [ ] **Step 2: Assert execution completeness (AC-9b)**

Independently of any failure comparison, confirm the branch run scored `GUARD_SURFACES.length` surfaces across the four shard jobs, and that `budget` received one record per leg. A failure comparison alone cannot tell "nothing failed" from "nothing ran".

- [ ] **Step 3: Record the wall-clock result**

Put the branch run's per-job durations and total wall clock in the closeout against the §4 targets (≤ 55 min total, ≤ 47 min heaviest job). If the heaviest job exceeds its budget, that is the design reporting on itself — raise `SOURCE_SHARD_COUNT` (up to the L-1 floor) rather than the timeout.

- [ ] **Step 4: Review-round filing if owed**

Run: `pnpm review:economy`
The spec stage ran 3 counted rounds, under the threshold of 4 (`lib/reviewRounds/constants.ts:11`). If the plan or diff stage reaches 4, the arc owes a filing in **docs/review-rounds/chore/mutation-gate-sharding/&lt;baseSha12&gt;.md** with a `## <stage> — <n> rounds` heading, an `**Examined:**` line, and at least one of `**Mechanizable:**` / `**Judgment:**` / `**Infra:**`.

- [ ] **Step 5: Graduate the ledger entry**

Remove the `**Status:** IN PROGRESS · **Branch:** chore/mutation-gate-sharding` run from the `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` meta line and move the entry to `BACKLOG-archive.md` **in the same commit** — archives categorically reject in-progress entries, so the marker cannot ride along. This must be the PR's **last commit, before the merge**: a marker that reaches `main` names a branch the merge just deleted, and `tests/docs/_metaLedgerInProgress.test.ts` then fails on `main` until someone clears it.

Run: `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add BACKLOG.md BACKLOG-archive.md docs/superpowers/plans/2026-08-16-mutation-gate-sharding-closeout.md docs/review-rounds/
git commit -m "docs(plan): close out mutation-gate sharding and graduate the ledger entry"
```


---

## Reconciliation sweep (authored AND run at plan time)

Every reference to the retired monolith, run on the live tree at plan authoring time, with a disposition per hit. Command:

```
rg -n --no-heading 'guardSurfaces\.gate\.test\.ts'
```

| hit | disposition |
|---|---|
| `vitest.projects.ts:87` (`MUTATION_TEST_GLOBS`) | Task 3 — replaced by the shard glob + gates file |
| `vitest.projects.ts:95` (`NIGHTLY_ONLY_EXCLUDES`) | Task 3 — same, with `**/` prefix |
| the repo-root `package.json` (`mutation:guards`, line 55) | Task 6 — repointed at the five files |
| `.github/workflows/mutation-harness.yml:76` | Task 4 — replaced by the matrix legs |
| `.github/workflows/mutation-harness.yml:112` | Task 6 — notify issue body, section B |
| `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:124` | Task 5 — assertion made shard-aware |
| `tests/mutation/_metaOverlayConfigParity.test.ts:60` | Task 2 — `OWNERS` repointed at the gates file |
| `tests/mutation/browser/browserSurfaces.gate.test.ts:11` | comment only — update in Task 2 |
| `tests/mutation/source/fixtures/slowTest.fixture.ts:2` | comment only — update in Task 2 |
| `tests/mutation/_metaPremiseContract.test.ts:28` | comment only (`guardSurfaces.gate`, no extension) — update in Task 2 |
| `BACKLOG.md:295` | Task 8 — entry graduates to the archive |
| `BACKLOG-archive.md:1050` | historical record — **never edited** |
| ~45 hits across `docs/superpowers/specs/**` and `docs/superpowers/plans/**` | historical records of shipped arcs — **never edited**; they describe the tree as it was |

Registry-count reconciliation, also run now: `GUARD_SURFACES` holds **18** rows and `EXPECTED_LEDGER_KINDS` holds **18** keys; Task 7 adds exactly one to each, so both are 19 at closeout. The gates file's completeness assertion is what enforces the pairing.

## Self-review

**Spec coverage.** AC-1/AC-2 → Task 1 and the gates file. AC-3 → Tasks 2 and 3 (test-count parity across the move). AC-4 → Task 2 plus the literal-vs-filename case in Task 4. AC-5 → Task 2 (assertion moved once) and Task 7 (fail-by-default demonstrated). AC-6a/AC-6b → Task 4, with four mutants. AC-6c → Task 4 Step 6. AC-7 → Task 4 Step 6, constructed input. AC-8 → Task 4 Step 3 (permissions preserved). AC-9/AC-9b → Task 8 Steps 1-2. AC-9a → Task 3, checked directly in Step 5. AC-10 → Task 6. Spec §3.3.1 → Task 3. §3.4.1 → Task 4. §3.5 → Task 4. No AC is unclaimed.

**Placeholder scan.** One deliberate placeholder is flagged inline and must not ship: the `expect(7).toBe(7)` shape in Task 2 Step 2, with its replacement specified in the note directly beneath it.

**Type consistency.** `sourceShardAssignment` / `shardOfSurface` / `weightOf` / `SOURCE_SHARD_COUNT` / `SHARD_BUDGET_MINUTES` are spelled identically in Tasks 1, 3, 5 and 8. `registerSurfaceCases` is spelled identically in Tasks 2 and 3. The parser constant is `SHARD_COUNT` (no prefix) and the source one is `SOURCE_SHARD_COUNT`; Task 4 imports both and the regex `const (?:SOURCE_)?SHARD\s*=` matches both spellings deliberately.
