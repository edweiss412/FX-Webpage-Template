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
- **`SHARD_BUDGET_SECONDS = 3600`**, against `timeout-minutes: 90` per shard job. Declared in SECONDS: an integer-minute record cannot express 60m59s, so a shard already over budget would be recorded at the threshold and evade an "above" comparison.
- **Weight is the boot model:** `mutants + accepted.length × (suitePaths.length − 1) + suitePaths.length`. Recomputed at shard startup from the live registry; **no weight table is committed** (spec §3.1).
- **No committed weight table, ever.** The partition is a pure function of the registry and the sources it names (`tests/parser/mutation/shardPartition.ts:5-8` is the property being preserved).
- **The LPT packing is REUSED, never re-implemented.** `lptAssign` (`tests/parser/mutation/shardPartition.ts:19`) is imported as-is per spec §3.1; a second copy of one algorithm drifts silently.
- **The gate stays non-gating** — not a required check. Nothing here reaches the merge path.
- **Serial per-mutant execution within a surface is unchanged.** This partitions across surfaces only.
- **The browser-mutant mode is out of scope** — separate file, separate workflow, separate budget (`.github/workflows/mutation-browser.yml:15` and `.github/workflows/mutation-browser.yml:60`).
- **`mutation-harness` is red on `main`** for two pre-existing reasons (spec §2.7, PR #824). Do not treat either as a regression of this work; AC-9's signature comparison is how you tell.
- **Commit per task**, conventional commits. Types/scopes in use here: `test(mutation)`, `feat(mutation)`, `chore(infra)`, `docs(plan)`.
- **Any local harness run goes through `pnpm heavy`** — `pnpm mutation:guards`, any `--project mutation` run, any build. This machine runs ~12 concurrent arcs behind a 2-slot semaphore. Scoped `vitest run <file>` on non-mutation suites, `pnpm typecheck`, and `pnpm spec:lint` stay unwrapped.

## Meta-test inventory (mandatory declaration)

**CREATES:**
- **tests/mutation/_metaSourceShardIntegrity.test.ts** — pins matrix index lists, shard file sets, shard file BODIES, realized execution targets, the `mutation:guards` script, the budget job's arguments, and `notify`'s job references, all against their TypeScript constants (AC-4, AC-6, AC-6a, AC-6b, AC-6c, AC-7, AC-10).
- **tests/mutation/source/shardPartition.test.ts** — the partition's own unit suite; also the referring suite that makes the module enrollable in the source-mutation registry (Task 7).
- **tests/ci/shardBudget.test.ts** — the budget logic's unit suite, and its referring suite for the same reason (Task 7).

**EXTENDS:**
- `tests/cross-cutting/mutation-browser-ci-wiring.test.ts` — its two assertions naming the monolith must become shard-aware (Task 5).
- `tests/cross-cutting/vitest-projects-partition.test.ts` — the hard nightly-file count 11 → 15 (Task 3).
- `tests/mutation/_metaOverlayConfigParity.test.ts` — the `OWNERS` row for `slowTest.fixture.ts` repoints to the gates file (Task 2).
- `tests/mutation/source/registry.ts` — one new enrolled surface (Task 7).

**Declared N/A:** advisory-lock topology (no `pg_advisory*` in this diff); Supabase call-boundary registry (no Supabase client calls); admin-alert catalog; tile sentinel-hiding; layout-dimensions and transition-audit tasks (no UI surface).

## Mutation-family closure (guard surfaces shipped here)

Task 7 enrols **both** guard surfaces this arc ships — **tests/mutation/source/shardPartition.ts** and **lib/ci/shardBudget.ts** — each with the full declared operator set (`[...OPERATOR_NAMES]`, six families), the same closure every other surface uses.

**Both are importable modules with a referring suite, and neither carries a CLI main.** The budget checker's decision logic lives in **lib/ci/shardBudget.ts** and its command-line entry in a separate **scripts/check-shard-budget.ts**, because the registry already records the cost of the combined shape: `phantomGapExecuted` "enrolled as one file with its CLI main block inline it scored 0.27, 18 of 19 survivors sitting in code the referring suite can never execute through an import" (`tests/mutation/source/registry.ts:993-1008`). A guard that cannot be imported cannot be enrolled, and enrolment precedes review. The convergence criterion for the guard is **the mutation score plus an empty unaccepted-survivor set**, both machine-computed. A reviewer-proposed new operator family is a registry change carrying its own before/after numbers, not a round on this diff.

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
| **tests/mutation/_metaSourceShardIntegrity.test.ts** | Workflow ↔ constant ↔ file-set ↔ template ↔ realized-target ↔ notify-reference integrity. |
| **lib/ci/shardBudget.ts** | Fail-closed completeness + budget decisions. No I/O, no `process`, so it is enrollable. |
| **scripts/check-shard-budget.ts** | Thin CLI: parse arguments, read the artifact dir, call the module, exit. Decides nothing. |
| **tests/ci/shardBudget.test.ts** | Its unit suite (per-task TDD applies to CI scripts too). |

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

Reuses the parser harness's `lptAssign` **as-is** (`tests/parser/mutation/shardPartition.ts:19`), per spec §3.1. This module supplies the weights and the shard count; it does not re-implement the packing, because two implementations of one algorithm drift and the spec forbids it.

**Files:**
- Create: **tests/mutation/source/shardPartition.ts**
- Test: **tests/mutation/source/shardPartition.test.ts**

**Interfaces:**
- Consumes: `GUARD_SURFACES` and `GuardSurface` from `tests/mutation/source/registry.ts:12` and `tests/mutation/source/registry.ts:151`; `enumerateSites` from `tests/mutation/source/operators.ts:99`; `generateMutants` from `tests/mutation/source/generate.ts:34`; **`lptAssign` and `ShardAssignment` from `tests/parser/mutation/shardPartition.ts:19` and `tests/parser/mutation/shardPartition.ts:12`**.
- Produces:
  ```ts
  export const SOURCE_SHARD_COUNT = 4;
  export const SHARD_BUDGET_SECONDS = 3600;
  export function weightOf(surface: GuardSurface): number;
  export function sourceShardAssignment(surfaces?: readonly GuardSurface[]): ShardAssignment;
  export function shardOfSurface(id: string, assignment: ShardAssignment): number;
  export function surfacesForShard(shard: number, surfaces?: readonly GuardSurface[]): GuardSurface[];
  ```
  The budget is declared in **seconds**, not minutes: an integer-minute record cannot express 60m59s and a shard already over budget would be recorded at exactly the threshold and evade an "above" comparison.

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts` why=`the module does not exist, so every import in the new suite fails to resolve` ac=AC-1,AC-2 -->

- [ ] **Step 1: Write the failing test**

```ts
// tests/mutation/source/shardPartition.test.ts
import { describe, expect, it } from "vitest";

import { premise } from "../../_shared/premise";
import { GUARD_SURFACES, type GuardSurface } from "./registry";
import {
  SHARD_BUDGET_SECONDS,
  SOURCE_SHARD_COUNT,
  shardOfSurface,
  sourceShardAssignment,
  surfacesForShard,
  weightOf,
} from "./shardPartition";

/**
 * A surface whose SOURCE is real (so mutant generation is real) but whose suite
 * count and ledger size are ours to set. Holding the source fixed and varying
 * only those two isolates the weight formula: a function that ignored either
 * field would produce the same number for both, and the delta assertions below
 * would fail. Asserting `weightOf` against a value derived from `weightOf` --
 * the shape this suite deliberately avoids -- would pass for any formula.
 */
const fakeSurface = (over: Partial<GuardSurface>): GuardSurface => {
  const base = GUARD_SURFACES.find((s) => s.id === "tapTargetScan");
  if (!base) throw new Error("tapTargetScan must stay enrolled for this fixture");
  return { ...base, ...over };
};

describe("source-mutation shard partition", () => {
  const assignment = sourceShardAssignment();

  it("weighs a surface by modelled child boots: mutants + accepted*(suites-1) + suites", () => {
    // Same source file, so the mutant count is identical in both calls; only the
    // declared suites and ledger size differ. A weight ignoring `suites` gives
    // delta 0; one ignoring `accepted` gives delta 2; the true formula gives 6.
    const oneSuite = weightOf(fakeSurface({ suitePaths: ["a"], accepted: [] }));
    const threeSuites = weightOf(
      fakeSurface({
        suitePaths: ["a", "b", "c"],
        accepted: [{ siteId: "x", kind: "equivalent", why: "fixture", ref: "BL-X" }] as never,
      }),
    );
    // (m + 1*2 + 3) - (m + 0 + 1) = 4  -- independent of m, so no hardcoded count.
    expect(threeSuites - oneSuite).toBe(4);
    // And the absolute value for the single-suite, empty-ledger case is m + 1.
    expect(oneSuite).toBeGreaterThan(1);
  });

  it("is total: the union of the four shard slices is exactly the registry (AC-1)", () => {
    // Built the way the SHARD FILES build it, so a filter bug is caught here
    // rather than in CI. Comparing the Map's size to itself would not do that.
    const slices = Array.from({ length: SOURCE_SHARD_COUNT }, (_, i) => surfacesForShard(i));
    const union = slices.flat().map((s) => s.id).sort();
    expect(union).toEqual(GUARD_SURFACES.map((s) => s.id).sort());
  });

  it("is disjoint: no surface appears in two slices (AC-1)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < SOURCE_SHARD_COUNT; i++) {
      for (const s of surfacesForShard(i)) {
        expect(seen.has(s.id), `${s.id} appears in more than one shard`).toBe(false);
        seen.add(s.id);
      }
    }
    expect(seen.size).toBe(GUARD_SURFACES.length);
  });

  it("is deterministic: two independent computations agree (AC-2)", () => {
    // Load-bearing: each shard job recomputes the map on its OWN runner, so a
    // non-deterministic assignment silently drops or double-runs surfaces across
    // jobs while every individual job passes.
    expect([...sourceShardAssignment().entries()].sort()).toEqual(
      [...sourceShardAssignment().entries()].sort(),
    );
  });

  it("achieves the optimal makespan, which the heaviest surface pins (AC-1)", () => {
    const weights = GUARD_SURFACES.map(weightOf);
    const heaviest = Math.max(...weights);
    const total = weights.reduce((a, b) => a + b, 0);
    // The claim only has content while one surface outweighs an even split --
    // exactly the regime spec §2.4 measured and the reason the count is 4.
    premise(
      "the heaviest surface outweighs an even split, which is what pins the makespan",
      heaviest,
      total / SOURCE_SHARD_COUNT,
    );
    const loads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
    for (const s of GUARD_SURFACES) loads[shardOfSurface(s.id, assignment)]! += weightOf(s);
    // EQUALITY, not >=: `>=` holds for any additive packing and proves nothing.
    expect(Math.max(...loads)).toBe(heaviest);
  });

  it("throws on a surface absent from the assignment rather than skipping it", () => {
    expect(() => shardOfSurface("no-such-surface", assignment)).toThrow(/no-such-surface/);
  });

  it("declares a budget below the per-job timeout, in seconds", () => {
    expect(SHARD_BUDGET_SECONDS).toBeGreaterThan(0);
    expect(SHARD_BUDGET_SECONDS).toBeLessThan(90 * 60);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/mutation/source/shardPartition.test.ts`
Expected: FAIL — `Failed to resolve import "./shardPartition"`. The production surface whose absence causes this is **tests/mutation/source/shardPartition.ts**, verified absent on the live tree.

- [ ] **Step 3: Write the minimal implementation**

```ts
// tests/mutation/source/shardPartition.ts
// Deterministic partition of the enrolled source-mutation surfaces
// (spec docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md §3.1).
//
// The PACKING is not ours: `lptAssign` is imported from the parser harness and
// reused as-is. Two implementations of one algorithm drift, and the drift is
// silent -- the copy that missed a tie-break simply partitions differently.
//
// What IS ours is the weight. Weighted by MODELLED CHILD BOOTS, not by mutant
// count and not by mutants*suites: `runAllSuites` short-circuits on the first
// suite that rejects (tests/mutation/source/runner.ts:216-228), so a KILLED
// mutant costs one boot however many suites a surface declares, while a SURVIVOR
// pays every suite. In a green run every survivor is a ledgered `accepted` row,
// because an unaccepted survivor fails the gate.
//
// Pure function of the registry and the sources it names: every shard recomputes
// the identical map on its own runner, so there is NO committed weight table.
import { readFileSync } from "node:fs";

import { type ShardAssignment, lptAssign } from "../../parser/mutation/shardPartition";
import { generateMutants } from "./generate";
import { enumerateSites } from "./operators";
import { GUARD_SURFACES, type GuardSurface } from "./registry";

/** Four: max load is pinned by the heaviest surface from n=4 on (spec §2.4). */
export const SOURCE_SHARD_COUNT = 4;

/** SECONDS, not minutes -- an integer-minute record cannot express 60m59s. */
export const SHARD_BUDGET_SECONDS = 60 * 60;

export function weightOf(surface: GuardSurface): number {
  const text = readFileSync(surface.sourcePath, "utf8");
  const sites = enumerateSites(surface.sourcePath, text, surface.operators);
  const { mutants } = generateMutants(surface.sourcePath, text, surface.operators, sites);
  const suites = surface.suitePaths.length;
  return mutants.length + surface.accepted.length * (suites - 1) + suites;
}

export function sourceShardAssignment(
  surfaces: readonly GuardSurface[] = GUARD_SURFACES,
): ShardAssignment {
  return lptAssign(
    surfaces.map((s) => ({ key: s.id, w: weightOf(s) })),
    SOURCE_SHARD_COUNT,
  );
}

/** Throws on an unknown id: a surface that cannot be sharded is corrupt data,
 *  not a row to skip. Skipping would drop it from every shard silently. */
export function shardOfSurface(id: string, assignment: ShardAssignment): number {
  const shard = assignment.get(id);
  if (shard === undefined) {
    throw new Error(`shardOfSurface: surface ${id} is absent from the assignment`);
  }
  return shard;
}

/** The slice a shard file runs. One definition, so a shard file cannot filter
 *  differently from what the gates file proves total. */
export function surfacesForShard(
  shard: number,
  surfaces: readonly GuardSurface[] = GUARD_SURFACES,
): GuardSurface[] {
  const assignment = sourceShardAssignment(surfaces);
  return surfaces.filter((s) => shardOfSurface(s.id, assignment) === shard);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/mutation/source/shardPartition.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mutant-check the weight formula**

Temporarily change `weightOf`'s return to `mutants.length + suites` (dropping the `accepted` term) and re-run.
Expected: FAIL on the delta assertion (`4` becomes `2`). Then change it to `mutants.length` alone: expected FAIL again. Revert and confirm green. Record all three observations in the commit — this is what proves the weight case is not an identity.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add tests/mutation/source/shardPartition.ts tests/mutation/source/shardPartition.test.ts
git commit -m "feat(mutation): weight enrolled guard surfaces and partition them with the existing LPT"
```

---

### Task 2: Split the gate, wire the new files into the nightly project, and retire the monolith

One task, because none of these halves is independently shippable: the shard files cannot RUN until they are in `MUTATION_TEST_GLOBS`, and leaving the monolith behind while the shards exist would double every surface. Wiring is what makes the deliverable executable, so it lands with it.

**Files:**
- Create: **tests/mutation/source/expectedLedgerKinds.ts**, **tests/mutation/source/surfaceCases.ts**
- Create: **tests/mutation/guardSurfaces.shard0.test.ts** … **tests/mutation/guardSurfaces.shard3.test.ts**
- Create: **tests/mutation/guardSurfaces.gates.test.ts**
- Delete: `tests/mutation/guardSurfaces.gate.test.ts`
- Modify: `vitest.projects.ts:83-97`, the repo-root `package.json` (`mutation:guards`, line 55), `tests/mutation/_metaOverlayConfigParity.test.ts:58-66`

<!-- task: red=`pnpm vitest run tests/mutation/_metaOverlayConfigParity.test.ts` red-state=authored red-target=`tests/mutation/_metaOverlayConfigParity.test.ts:60` why=`deleting the monolith orphans the OWNERS row that maps slowTest.fixture.ts to it, so this suite reds on a missing owner file until the row is repointed at the gates file` ac=AC-3,AC-4,AC-5,AC-9a,AC-10 -->

- [ ] **Step 1: Move `EXPECTED_LEDGER_KINDS` verbatim**

Cut the whole declaration (`tests/mutation/guardSurfaces.gate.test.ts:34-159`) into **tests/mutation/source/expectedLedgerKinds.ts**, **comments included** — every comment there is a per-surface argument someone paid review rounds for. Export it.

- [ ] **Step 2: Move the seven per-surface cases**

Cut the entire `describe.each(...)` block (`tests/mutation/guardSurfaces.gate.test.ts:169-265`) into **tests/mutation/source/surfaceCases.ts**:

```ts
// tests/mutation/source/surfaceCases.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EXPECTED_LEDGER_KINDS } from "./expectedLedgerKinds";
import { evaluateGate } from "./gate";
import type { GuardSurface } from "./registry";
import { runControl, runSurface } from "./runner";

const root = process.cwd();

/**
 * The seven per-surface gate cases, in ONE copy, called by each shard with its
 * own slice.
 *
 * `runSurface` runs at MODULE scope inside describe.each -- deliberate and
 * load-bearing. It is why the gate's cost is vitest IMPORT time, and it is why a
 * shard must filter BEFORE calling this: a `describe.skip` or a filtered `it`
 * would still pay the full run during collection.
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

The `describe.each` title string and every assertion inside move **unmodified**. Do not tidy them.

- [ ] **Step 3: Write the four shard files**

Each is this, with only `SOURCE_SHARD` and the filename in the header comment differing:

```ts
// tests/mutation/guardSurfaces.shard0.test.ts
// One LPT slice of the enrolled source-mutation surfaces (wall-clock spec §3.2).
// Runs ONLY in the env-gated `mutation` vitest project. All shard files are this
// same template with only the SOURCE_SHARD literal and this filename differing --
// pinned byte-for-byte by tests/mutation/_metaSourceShardIntegrity.test.ts.
import { surfacesForShard } from "./source/shardPartition";
import { registerSurfaceCases } from "./source/surfaceCases";

const SOURCE_SHARD = 0;

registerSurfaceCases(surfacesForShard(SOURCE_SHARD));
```

Filtering happens through `surfacesForShard`, the one definition the gates file also proves total — a shard file never writes its own filter.

- [ ] **Step 4: Write the gates file**

```ts
// tests/mutation/guardSurfaces.gates.test.ts
// Corpus-wide checks over the WHOLE registry, which therefore cannot live in any
// shard (wall-clock spec §3.3). Generation only, except the one child spawned by
// the timeout premise at the bottom.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INERT_TARGET, childRun } from "./source/childRun";
import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";
import { GUARD_SURFACES } from "./source/registry";
import { SOURCE_SHARD_COUNT, surfacesForShard } from "./source/shardPartition";

const root = process.cwd();

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
  const slices = Array.from({ length: SOURCE_SHARD_COUNT }, (_, i) => surfacesForShard(i));

  it("(a) the union of every shard slice is exactly the registry", () => {
    expect(slices.flat().map((s) => s.id).sort()).toEqual(
      GUARD_SURFACES.map((s) => s.id).sort(),
    );
  });

  it("(b) no surface appears in two slices", () => {
    const ids = slices.flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("(c) the per-surface case count is 7, which §2.2's enrolment arithmetic depends on", () => {
    // Derived from the source, not asserted as a literal against itself: §2.2
    // reads enrolment off a run's test count as (tests - 2) / 7, and that
    // arithmetic silently misreports the moment a case is added or removed.
    const src = readFileSync(join(root, "tests/mutation/source/surfaceCases.ts"), "utf8");
    expect(src.match(/^\s*it\(/gm) ?? []).toHaveLength(7);
  });
});

/**
 * The per-mutant config's timeout is actually in force (guard-premise Task 3).
 *
 * Corpus-wide, not per-surface, so it lives here rather than in a shard, and it
 * must not be dropped: without it a mutant that merely runs long is classified
 * KILLED through tests/mutation/source/runner.ts:223-227, silently inflating the
 * score. tests/mutation/_metaOverlayConfigParity.test.ts compares configured
 * VALUES and cannot prove one takes effect.
 */
describe("the per-mutant config's timeout is in force", () => {
  it("runs a fixture that outlives vitest's 5000ms default", () => {
    expect(childRun(root, "tests/mutation/source/fixtures/slowTest.fixture.ts", INERT_TARGET)).toBe(
      0,
    );
  }, 300_000);
});
```

- [ ] **Step 5: Wire all five files into the nightly project — BEFORE running any of them**

Nothing above can run until this lands: the `mutation` project's include list decides which files exist for it, and a file absent from `MUTATION_TEST_GLOBS` reports `No test files found` however it is invoked.

In `vitest.projects.ts`, replace the the retired monolith path entry in `MUTATION_TEST_GLOBS` (`vitest.projects.ts:87`) and its `**/`-prefixed twin in `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts:95`):

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

**Both lists, or the files land on every PR.** `PARALLEL_TEST_GLOBS` contains `tests/mutation/**/*.test.{ts,tsx}` (`vitest.projects.ts:143`), so a file that reaches the first list but not the second is admitted by the `parallel` project and runs a per-mutant harness on the merge path of every PR in the repo.

- [ ] **Step 6: Repoint the local entry point in the same breath**

the repo-root `package.json` (`mutation:guards`, line 55) still names the monolith, so `pnpm mutation:guards` breaks the moment Step 7 deletes it. Repoint it now:

```json
"mutation:guards": "VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/guardSurfaces.shard0.test.ts tests/mutation/guardSurfaces.shard1.test.ts tests/mutation/guardSurfaces.shard2.test.ts tests/mutation/guardSurfaces.shard3.test.ts tests/mutation/guardSurfaces.gates.test.ts",
```

Files named explicitly, so the local command runs exactly the set Task 4's meta-test pins. **Keep the script NAME** — `tests/docs/agentsHeavyPhaseRule.test.ts:119` and `AGENTS.md:246` pin `pnpm mutation:guards` as a must-wrap invocation, and renaming it breaks both.

- [ ] **Step 7: Delete the monolith and repoint the OWNERS row**

```bash
git rm tests/mutation/guardSurfaces.gate.test.ts
```

Run: `pnpm vitest run tests/mutation/_metaOverlayConfigParity.test.ts`
Expected: **FAIL** — `OWNERS` maps `slowTest.fixture.ts` to a file that no longer exists. This is the task's declared RED, observed on the same command that must go green below.

Then change that value (`tests/mutation/_metaOverlayConfigParity.test.ts:60`) from the retired monolith path to **tests/mutation/guardSurfaces.gates.test.ts**, and update the three comment-only references listed in the reconciliation sweep.

Run: `pnpm vitest run tests/mutation/_metaOverlayConfigParity.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify the split preserved every case**

Run: `pnpm heavy pnpm mutation:guards`
Expected: the shards plus gates collect **`7 × GUARD_SURFACES.length + 5`** cases — the seven per-surface cases across the four shards, plus the gates file's ONE completeness case, THREE partition cases, and ONE timeout case, which is five. With 18 surfaces enrolled that is 126 + 5 = **131**, against the monolith's 128; the three extra are the new partition cases. Record the observed count in the commit; a shortfall means a surface was lost in the split, which is what this step exists to catch.

**Expect a FAILURE, not a pass, and check its signature.** `pnpm mutation:guards` is red at the merge base: `interactionTimingScan` carries an unaccepted survivor (`logical-connector:330:39:&&>||`), which this arc explicitly does not fix (Global Constraints; spec §2.7). The passing condition for this step is therefore **the collected count above, plus a failure set equal to the merge-base signatures in Task 8 Step 1 restricted to this gate** — that one survivor and nothing else. A DIFFERENT failure is this task's regression; the absence of that failure means something stopped executing.

> This is the one full-gate run in the plan and it is slow. It runs under `pnpm heavy`. If the semaphore is saturated, wait — do not run it unwrapped.

- [ ] **Step 9: Commit**

```bash
git add -A tests/mutation/ vitest.projects.ts package.json
git commit -m "feat(mutation): shard the source-mutation gate into four files plus a corpus-wide gates file"
```

---

### Task 3: Prove the new files are off the merge path

**Files:**
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts:254-257`

<!-- task: red=`pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts` red-state=authored red-target=`tests/cross-cutting/vitest-projects-partition.test.ts:256` why=`Task 2 added five nightly files and removed one, so the suite's hard count of 11 no longer matches the discovered set` ac=AC-9a -->

- [ ] **Step 1: Run the partition suite to observe the RED**

Run: `pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL — the `nightlyCount` assertion expects 11 against the new file set.

- [ ] **Step 2: Update the hard nightly-file count**

At `tests/cross-cutting/vitest-projects-partition.test.ts:254-257` the count goes 11 → **15**, and the message must be updated with it — the existing text enumerates its own arithmetic and would be stale on its face. Keep the `live in no default project` clause, which is the sentence's actual claim:

```ts
      expect(
        nightlyCount,
        "exactly the 15 nightly files (9 parser harness + 4 source-mutation shards + the source-mutation gates file + the browser-mutant gate) live in no default project",
      ).toBe(15);
```

**This suite reads the workflow as RAW TEXT, not parsed YAML** (`readFileSync` at `tests/cross-cutting/vitest-projects-partition.test.ts:394`, then `includes`/regex). Two of its string checks must keep matching after Task 4's rewrite: `wf.includes("--project mutation")` and `wf.includes("tests/parser/mutationHarness.*.test.ts")`. The second is satisfied by the **`paths:` filter** (`.github/workflows/mutation-harness.yml:32`), not by a run line, so that filter line must survive the matrix rewrite verbatim. Re-run this suite after Task 4 as well as here.

- [ ] **Step 3: Run it to verify it passes**

Run: `pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS.

- [ ] **Step 4: Prove the merge-path property directly**

Run: `pnpm vitest run tests/mutation/guardSurfaces.shard0.test.ts --project parallel 2>&1 | tail -5`
Expected: **no test file matched** for the `parallel` project. Repeat with `--project serial`. This is the assertion that matters most in this task, and it is checked directly rather than inferred from the count passing.

- [ ] **Step 5: Commit**

```bash
git add tests/cross-cutting/vitest-projects-partition.test.ts
git commit -m "chore(infra): keep the sharded mutation gate in the nightly project only"
```

---

### Task 4: The integrity meta-test, then the workflow matrix

The meta-test is written **first** and observed red against the current single-job workflow, then the workflow is rewritten to satisfy it. That order is what makes it a guard rather than a transcript of whatever got written.

**Files:**
- Create: **tests/mutation/_metaSourceShardIntegrity.test.ts**
- Modify: `.github/workflows/mutation-harness.yml`

<!-- task: red=`pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`.github/workflows/mutation-harness.yml:43` why=`the workflow declares a single mutation-harness job with no matrix, so every family, index-list and realized-target assertion fails until it is rewritten` ac=AC-4,AC-6a,AC-6b,AC-10 -->

- [ ] **Step 1: Write the failing meta-test**

```ts
// tests/mutation/_metaSourceShardIntegrity.test.ts
// The workflow's matrices, the shard FILE sets, the shard file BODIES, and each
// leg's REALIZED TARGET, all pinned to their TypeScript constants (spec §3.4.1).
//
// WHY REALIZED TARGETS AND NOT JUST INDEX LISTS. A correct `[0,1,2,3]` says
// nothing about what each leg RUNS. Every leg could hard-code the shard-0 file
// with the index list, the file set, and the gates file's totality proof all
// still green, while three quarters of the surfaces never executed. Not
// abstract: interactionTimingScan lands in source shard 1 and the drifted parser
// fingerprints in parser shard 4, so a run-shard-0-everywhere workflow would make
// BOTH failures currently live on `main` disappear and look greener than today.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { premiseHolds } from "../_shared/premise";
import { SHARD_COUNT } from "../parser/mutation/shardPartition";
import { SOURCE_SHARD_COUNT } from "./source/shardPartition";

const ROOT = join(__dirname, "..", "..");
type Step = { run?: string; with?: { script?: string } };
type Job = {
  strategy?: { matrix?: Record<string, unknown>; "fail-fast"?: boolean };
  needs?: string[];
  steps?: Step[];
};
const wf = parseYaml(
  readFileSync(join(ROOT, ".github/workflows/mutation-harness.yml"), "utf8"),
) as { jobs: Record<string, Job> };

const runsOf = (job: string): string[] =>
  (wf.jobs[job]?.steps ?? []).map((s) => s.run ?? "").filter((r) => r.length > 0);
const vitestRun = (job: string): string =>
  runsOf(job).find((r) => r.includes("vitest")) ?? "";
/** EVERY test target in a run line, not just the first -- an extra target is
 *  exactly the fail-open case a first-match extraction cannot see. */
const targetsIn = (run: string): string[] => run.match(/tests\/\S+?\.test\.ts/g) ?? [];

const FAMILIES = [
  {
    job: "parser-shards",
    count: SHARD_COUNT,
    dir: "tests/parser",
    stem: "mutationHarness.shard",
    glob: /^mutationHarness\.shard.*\.test\.ts$/,
    // EVERY place the index legitimately appears in a body. A normalizer that
    // misses one rejects the live family: parser shards 0 and 1 are identical
    // except for the filename, `const SHARD`, AND `runShard(N)`, and omitting
    // the third makes this guard fail on correct files.
    indexSites: (i: number) => [`const SHARD = ${i};`, `runShard(${i})`],
  },
  {
    job: "source-shards",
    count: SOURCE_SHARD_COUNT,
    dir: "tests/mutation",
    stem: "guardSurfaces.shard",
    glob: /^guardSurfaces\.shard.*\.test\.ts$/,
    indexSites: (i: number) => [`const SOURCE_SHARD = ${i};`],
  },
] as const;
const GATES = [
  { job: "parser-gates", file: "tests/parser/mutationHarness.gates.test.ts" },
  { job: "source-gates", file: "tests/mutation/guardSurfaces.gates.test.ts" },
] as const;

const shardFile = (f: (typeof FAMILIES)[number], i: number) => `${f.dir}/${f.stem}${i}.test.ts`;

describe("mutation-harness matrices are pinned to their constants", () => {
  it("the workflow parses and declares every expected job", () => {
    premiseHolds("mutation-harness.yml defines jobs", Object.keys(wf.jobs ?? {}).length > 0);
    for (const f of FAMILIES) expect(Object.keys(wf.jobs)).toContain(f.job);
    for (const g of GATES) expect(Object.keys(wf.jobs)).toContain(g.job);
    expect(Object.keys(wf.jobs)).toContain("budget");
  });

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: matrix is exactly {shard: 0..COUNT-1} with no include/exclude (AC-6a)",
    (_job, f) => {
      const matrix = wf.jobs[f.job]?.strategy?.matrix as { shard?: number[] } | undefined;
      expect(matrix, `${f.job} declares no matrix`).toBeDefined();
      // `include`/`exclude` alter realized legs without changing the index list.
      expect(Object.keys(matrix!).sort()).toEqual(["shard"]);
      expect(matrix!.shard).toEqual(Array.from({ length: f.count }, (_, i) => i));
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: interpolates matrix.shard and each index resolves to exactly its own file (AC-6b)",
    (_job, f) => {
      const run = vitestRun(f.job);
      expect(run, `${f.job} has no vitest run step`).not.toBe("");
      expect(run, "a leg naming a fixed index runs the same shard on every leg").toMatch(
        /\$\{\{\s*matrix\.shard\s*\}\}/,
      );
      for (let i = 0; i < f.count; i++) {
        const realized = run.replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i));
        // EXACTLY its own file: an extra target here is the fail-open case.
        expect(targetsIn(realized)).toEqual([shardFile(f, i)]);
      }
    },
  );

  it.each(GATES.map((g) => [g.job, g] as const))(
    "%s: names exactly its own gates file (AC-6b)",
    (_job, g) => {
      expect(targetsIn(vitestRun(g.job))).toEqual([g.file]);
    },
  );

  it("the realized target union is exactly this workflow's files, each named once (AC-6b)", () => {
    const realized = [
      ...FAMILIES.flatMap((f) =>
        Array.from({ length: f.count }, (_, i) =>
          targetsIn(vitestRun(f.job).replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, String(i))),
        ).flat(),
      ),
      ...GATES.flatMap((g) => targetsIn(vitestRun(g.job))),
    ];
    const expected = [
      ...FAMILIES.flatMap((f) => Array.from({ length: f.count }, (_, i) => shardFile(f, i))),
      ...GATES.map((g) => g.file),
    ];
    // Sets compared both ways, and length compared separately, so a duplicate
    // cannot hide inside a set equality.
    expect([...realized].sort()).toEqual([...expected].sort());
    expect(realized).toHaveLength(SHARD_COUNT + SOURCE_SHARD_COUNT + GATES.length);
    // The browser gate belongs to mutation-browser.yml and appears in no leg.
    expect(realized.some((r) => r.includes("browser"))).toBe(false);
  });

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: the shard FILE set on disk matches the constant, under the PROJECT's glob (AC-6a)",
    (_job, f) => {
      // Scanned with the same `shard*` shape the vitest project include uses --
      // a `\\d+` scan would ignore a non-numeric shard file the project still runs.
      const found = readdirSync(join(ROOT, f.dir)).filter((n) => f.glob.test(n)).sort();
      expect(found).toEqual(
        Array.from({ length: f.count }, (_, i) => `${f.stem}${i}.test.ts`).sort(),
      );
    },
  );

  it.each(FAMILIES.map((f) => [f.job, f] as const))(
    "%s: every shard file is the same template modulo its index (AC-4)",
    (_job, f) => {
      // Byte equality after normalising the index everywhere it legitimately
      // appears. A divergent body -- a different filter, a skipped call -- is
      // what this catches, and nothing else in the suite would.
      const normalise = (src: string, i: number) => {
        let out = src.split(`${f.stem}${i}.test.ts`).join("<FILE>");
        for (const site of f.indexSites(i)) {
          const canonical = site.split(String(i)).join("<N>");
          out = out.split(site).join(canonical);
        }
        return out;
      };
      const base = normalise(readFileSync(join(ROOT, shardFile(f, 0)), "utf8"), 0);
      for (let i = 1; i < f.count; i++) {
        expect(
          normalise(readFileSync(join(ROOT, shardFile(f, i)), "utf8"), i),
          `${shardFile(f, i)} diverges from shard 0 beyond its index`,
        ).toBe(base);
      }
    },
  );

  it("every source shard file registers its slice exactly once (AC-4)", () => {
    for (let i = 0; i < SOURCE_SHARD_COUNT; i++) {
      const src = readFileSync(join(ROOT, `tests/mutation/guardSurfaces.shard${i}.test.ts`), "utf8");
      expect(src.match(/registerSurfaceCases\(/g) ?? []).toHaveLength(1);
      expect(src.match(/surfacesForShard\(/g) ?? []).toHaveLength(1);
      expect(/const SOURCE_SHARD\s*=\s*(\d+)/.exec(src)?.[1]).toBe(String(i));
    }
  });

  it("the mutation:guards script names exactly the sharded gate files (AC-10)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts["mutation:guards"] ?? "";
    expect(targetsIn(script).sort()).toEqual(
      [
        ...Array.from(
          { length: SOURCE_SHARD_COUNT },
          (_, i) => `tests/mutation/guardSurfaces.shard${i}.test.ts`,
        ),
        "tests/mutation/guardSurfaces.gates.test.ts",
      ].sort(),
    );
  });

  it("a red shard does not cancel its siblings, and budget gates notify (AC-6c)", () => {
    for (const f of FAMILIES) expect(wf.jobs[f.job]?.strategy?.["fail-fast"]).toBe(false);
    expect(wf.jobs["notify"]?.needs ?? []).toEqual(
      expect.arrayContaining([...FAMILIES.map((f) => f.job), ...GATES.map((g) => g.job), "budget"]),
    );
  });

  it("notify references no job that no longer exists (AC-6)", () => {
    // The rewrite DELETES the `mutation-harness` job, and the notify steps
    // branch on `needs.mutation-harness.result` (.github/workflows/
    // mutation-harness.yml:94 and :133). A dangling reference does not error --
    // it evaluates to empty, so the failure branch never fires and the success
    // branch may auto-close a standing issue on a red run. That is the tracking
    // issue going silent, which is the one thing spec §3.5 exists to prevent.
    const yaml = readFileSync(join(ROOT, ".github/workflows/mutation-harness.yml"), "utf8");
    expect(yaml).not.toContain("needs.mutation-harness.");
    for (const ref of yaml.match(/needs\.([A-Za-z0-9_-]+)\./g) ?? []) {
      const job = ref.slice("needs.".length, -1);
      expect(Object.keys(wf.jobs), `notify references a job that does not exist: ${job}`).toContain(
        job,
      );
    }
  });

  it("the tracking issue reports each job's RESULT, in the BODY (AC-6)", () => {
    // Scoped to the github-script BODY, not the serialized step object. A step
    // NAME like `Report needs.parser-shards.result`, or the same expression in
    // an `if:` condition, satisfies a whole-object substring search while the
    // body itself reports nothing -- the sibling-contamination shape the
    // anti-tautology rule exists to stop.
    const bodies = (wf.jobs["notify"]?.steps ?? [])
      .map((s) => s.with?.script ?? "")
      .filter((b) => b.length > 0);
    expect(bodies.length, "notify runs no github-script step").toBeGreaterThan(0);
    const body = bodies.join("\n");
    for (const job of [...FAMILIES.map((f) => f.job), ...GATES.map((g) => g.job), "budget"]) {
      expect(body, `the issue body never reports ${job}'s result`).toContain(
        `needs.${job}.result`,
      );
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: FAIL on the first case — the workflow declares a single `mutation-harness` job (`.github/workflows/mutation-harness.yml:43`) and none of `parser-shards`, `source-shards`, `parser-gates`, `source-gates`, `budget` exists.

- [ ] **Step 3: Rewrite the workflow**

Replace the single job with four families plus `budget` (Task 5 supplies the budget job's body). Preserve, unchanged: the workflow-level `concurrency` block with `${{ github.ref }}` and PR-only cancel (`tests/cross-cutting/ci-workflow-speedup.test.ts:37-80` requires it at workflow level; a job-level matrix must not displace it); `permissions: contents: read` on every harness job; `issues: write` on `notify` alone; the `schedule` / `workflow_dispatch` / path-filtered `pull_request` triggers **including the `tests/parser/mutationHarness.*.test.ts` path line** Task 3 depends on; `VITEST_INCLUDE_MUTATION_HARNESS: "1"` on every harness job; and the `actions/checkout@v4` + `./.github/actions/setup` pair, which each job now repeats.

```yaml
  source-shards:
    strategy: { fail-fast: false, matrix: { shard: [0, 1, 2, 3] } }   # == SOURCE_SHARD_COUNT
    timeout-minutes: 90
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      # FIRST step of the job, BEFORE checkout and setup. $GITHUB_ENV lives
      # outside the workspace, so the value survives checkout.
      - name: Stamp job start
        run: echo "SHARD_START=$(date +%s)" >> "$GITHUB_ENV"
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Run source-mutation shard ${{ matrix.shard }}
        env:
          VITEST_INCLUDE_MUTATION_HARNESS: "1"
        run: pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shard${{ matrix.shard }}.test.ts
      - name: Record elapsed seconds
        if: always()
        run: echo "$(( $(date +%s) - SHARD_START ))" > elapsed.txt
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: elapsed-source-shards-${{ matrix.shard }}
          path: elapsed.txt
```

**The stamp is the job's FIRST step, so the record is job wall clock.** An earlier draft captured the start inside the vitest step, which measures only the test and excludes checkout plus `./.github/actions/setup`. That understates the quantity §4 actually targets: 1,200 s of setup plus a 3,000 s test is a 3,000 s record that passes a 3,600 s budget while the job took 4,200 s — a complete, finite, plausible record that no completeness or parse guard can catch. Stamping before checkout is what makes the recorded number the same number the workflow's `timeout-minutes` bounds.

**Seconds, and the start explicitly captured.** An earlier draft wrote `(( ($(date +%s) - START) / 60 ))` with `START` never set: with the variable unset the expression evaluates to epoch minutes and exits 0, so every record would have been a plausible-looking number that measured nothing. Integer minutes also lose the boundary — 60m59s records as `60` and slips past an "above 60" comparison. Recording seconds and comparing in seconds removes both.

Artifacts, not job outputs: matrix children share one output name and overwrite each other nondeterministically, so the slow shard is exactly the value that would vanish.

- [ ] **Step 4: Run the meta-test to verify it passes**

Run: `pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify the meta-test — six mutants, each recorded**

Apply each to the workflow or a shard file, run the meta-test, revert, and record the observed failure in the commit. If any mutant does NOT red, the guard is not pinning what it claims and the task is not done.

| # | mutation | must fail |
|---|---|---|
| a | every `source-shards` leg runs the shard-0 file (drop the interpolation) | the interpolation/resolution case |
| b | `matrix: { shard: [0,1,2] }` | the index-list case |
| c | add `include: [{ shard: 9 }]` | the no-modifier case |
| d | `source-gates` points at a shard file | the gates-leg case |
| e | a shard leg's run line gains a SECOND test target | the exact-target and union cases |
| f | the shard-2 file's body changed to filter shard 1 | the template-equality and registration cases |
| g | an index site removed from `indexSites` (drop `runShard(N)`) | the template-equality case, on the LIVE parser family |

Mutant (g) is in the table because an earlier draft of this normalizer omitted `runShard(N)` and therefore rejected the live parser shards, which are correct. A guard that reds on correct input is not a stricter guard; it is a broken one, and the mutant is what tells the two apart.

**Probed at plan time, against the live tree.** The corrected normalizer was run over all eight existing `tests/parser/mutationHarness.shard*.test.ts` files, normalising the filename, `const SHARD = N;` and `runShard(N)` per family:

```
parser family template-equal under the corrected normalizer: True
```

The earlier draft's normalizer, run the same way, reported `equal false` at `runShard(0)` vs `runShard(1)`. The source family has only two index sites and no `runShard`, which is why it did not surface the gap.

Mutant (e) is the one a first-match extraction would miss, and (f) is the one a filename-only scan would miss; both are in the suite specifically because an earlier draft of this guard was fail-open on them.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/mutation-harness.yml tests/mutation/_metaSourceShardIntegrity.test.ts
git commit -m "feat(infra): run every mutation shard as its own job, pinned to the shard constants"
```

---

### Task 5: The budget script, test-first

AC-6c and AC-7 are behavioural claims about a script, so the script gets a test before it gets a body — the per-task TDD invariant applies to `.github/scripts/**` exactly as it does to `lib/**`.

**Files:**
- Create: **lib/ci/shardBudget.ts** (the logic), **scripts/check-shard-budget.ts** (a thin CLI), **tests/ci/shardBudget.test.ts** (its suite)
- Modify: `.github/workflows/mutation-harness.yml` (the `budget` job body, `notify.needs`)

**Interfaces:**
- Produces, from **lib/ci/shardBudget.ts**: `export function checkBudget(records: {leg: string, seconds: number}[], expectedLegs: string[], budgetSeconds: number): {ok: boolean, failures: string[], warnings: string[]}` and `export function expectedLegNames(parserShards: number, sourceShards: number): string[]`.

**The logic and the CLI are SEPARATE FILES, and this is not a style choice.** The registry records what happens otherwise: `phantomGapExecuted` was "enrolled as one file with its CLI main block inline it scored 0.27, 18 of 19 survivors sitting in code the referring suite can never execute through an import" (`tests/mutation/source/registry.ts:993-1008`). A guard with an inline main is not enrollable, and this budget checker IS a guard. So **lib/ci/shardBudget.ts** holds every decision and **scripts/check-shard-budget.ts** holds only argument parsing, a call, and `process.exit` — thin enough that nothing in it needs mutation coverage.
- Consumes at RUNTIME, from the workflow's arguments rather than from constants of its own: `--budget-seconds`, `--parser-shards`, `--source-shards`, `--dir`. The script derives `expectedLegs` from the two counts. Step 5 pins those arguments to the TypeScript constants in the integrity meta-test, so the script cannot become a second copy of either number.

<!-- task: red=`pnpm vitest run tests/ci/shardBudget.test.ts` red-state=authored red-target=`lib/ci/shardBudget.ts` why=`the module does not exist, so the suite's import fails to resolve` ac=AC-6c,AC-7 -->

- [ ] **Step 1: Write the failing test**

```ts
// tests/ci/shardBudget.test.ts
import { describe, expect, it } from "vitest";

import { checkBudget, expectedLegNames } from "@/lib/ci/shardBudget";

const LEGS = ["source-shards-0", "source-shards-1"];
const BUDGET = 3600;
const rec = (leg: string, seconds: number) => ({ leg, seconds });

describe("shard budget check", () => {
  it("passes when every leg reported and all are under budget", () => {
    const r = checkBudget([rec(LEGS[0]!, 100), rec(LEGS[1]!, 200)], LEGS, BUDGET);
    expect(r).toEqual({ ok: true, failures: [], warnings: [] });
  });

  it("FAILS NAMING the absent leg rather than maximising over a partial set (AC-6c)", () => {
    // The whole point: a missing record must not read as "that shard was fast".
    const r = checkBudget([rec(LEGS[0]!, 100)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain(LEGS[1]!);
  });

  it("FAILS on a duplicated leg (AC-6c)", () => {
    const r = checkBudget([rec(LEGS[0]!, 1), rec(LEGS[0]!, 2), rec(LEGS[1]!, 3)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain(LEGS[0]!);
  });

  it("fails a shard one second over budget, the boundary integer minutes lost", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET + 1), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
  });

  it("passes at exactly budget, so the comparison is strictly above", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(true);
  });

  it("warns above 75% while staying green (AC-7)", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET * 0.8), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toContain(LEGS[0]!);
  });

  it("does not warn at or below 75%", () => {
    const r = checkBudget([rec(LEGS[0]!, BUDGET * 0.75), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.warnings).toEqual([]);
  });

  it("rejects a non-numeric record instead of coercing it to zero", () => {
    const r = checkBudget([rec(LEGS[0]!, NaN), rec(LEGS[1]!, 1)], LEGS, BUDGET);
    expect(r.ok).toBe(false);
  });
});

describe("expected leg names", () => {
  it("derives one leg per shard plus the two gates legs", () => {
    // Derived from the counts, so the leg set has ONE origin -- the same two
    // numbers the workflow passes and the integrity meta-test pins.
    expect(expectedLegNames(2, 3).sort()).toEqual(
      [
        "parser-shards-0",
        "parser-shards-1",
        "source-shards-0",
        "source-shards-1",
        "source-shards-2",
        "parser-gates",
        "source-gates",
      ].sort(),
    );
  });

  it("scales with each count independently", () => {
    // A derivation that ignored one count would give the same length for both.
    expect(expectedLegNames(8, 4)).toHaveLength(8 + 4 + 2);
    expect(expectedLegNames(4, 8)).toHaveLength(4 + 8 + 2);
    expect(expectedLegNames(8, 4)).not.toEqual(expectedLegNames(4, 8));
  });

  it("names no duplicate leg", () => {
    const legs = expectedLegNames(8, 4);
    expect(new Set(legs).size).toBe(legs.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/ci/shardBudget.test.ts`
Expected: FAIL — cannot resolve **lib/ci/shardBudget.ts**, verified absent on the live tree.

- [ ] **Step 3: Write the script**

**lib/ci/shardBudget.ts** holds `checkBudget` and `expectedLegNames`, and nothing else — no `process`, no I/O, no exit. **scripts/check-shard-budget.ts** parses `--dir`, `--budget-seconds`, `--parser-shards` and `--source-shards`, reads the artifact directory into records, calls `expectedLegNames` then `checkBudget`, prints a **::warning::** annotation per warning, and exits non-zero when `ok` is false. Every decision lives in the module; the script decides nothing.

Completeness is checked **before** any maximum is taken: an absent or duplicated leg is a failure naming the leg, never a smaller maximum. A record that does not parse as a finite number is a failure, not a zero. **The script declares no default for any of the four arguments** — a missing one is a usage error and a non-zero exit, because a default is how it would silently become a second copy of a constant that lives elsewhere.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run tests/ci/shardBudget.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Wire the budget job, passing the constants rather than restating them**

```yaml
  budget:
    needs: [parser-shards, parser-gates, source-shards, source-gates]
    if: always()
    runs-on: ubuntu-latest
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { pattern: elapsed-*, path: elapsed }
      - run: >
          pnpm tsx scripts/check-shard-budget.ts
          --dir elapsed
          --budget-seconds 3600
          --parser-shards 8
          --source-shards 4
```

**Why arguments and not constants baked into the script.** The script is `.mjs` under `.github/scripts/` and the constants are TypeScript in the test tree; it cannot import them. Left to invent its own numbers it becomes a fourth copy of the shard count and a second copy of the budget, free to drift the moment either changes — and every one of Task 5's tests would still pass, because they supply their own fixtures. So the workflow passes them, and **the integrity meta-test pins the workflow's arguments to the TypeScript constants**, the same mechanism §3.4.1 uses for the matrices. Add to **tests/mutation/_metaSourceShardIntegrity.test.ts**:

```ts
  it("the budget job is invoked with the canonical constants (AC-7)", () => {
    const run = runsOf("budget").find((r) => r.includes("check-shard-budget")) ?? "";
    expect(run, "the budget job runs no budget script").not.toBe("");
    // WHOLE-TOKEN equality, not a substring and not a digit-boundary regex.
    // `toContain("3600")` accepts `36000`; a `(?![0-9])` lookahead still accepts
    // `3600.5`, which the CLI parses as a finite budget differing from the
    // constant. Take the token after the flag and compare it exactly.
    const tokens = run.split(/\s+/);
    const argValue = (flag: string): string | undefined => {
      const i = tokens.indexOf(flag);
      expect(i, `the budget job passes no ${flag}`).toBeGreaterThanOrEqual(0);
      return tokens[i + 1];
    };
    expect(argValue("--budget-seconds")).toBe(String(SHARD_BUDGET_SECONDS));
    expect(argValue("--parser-shards")).toBe(String(SHARD_COUNT));
    expect(argValue("--source-shards")).toBe(String(SOURCE_SHARD_COUNT));
  });
```

with `SHARD_BUDGET_SECONDS` added to the import from **tests/mutation/source/shardPartition.ts**. The script derives its expected leg names from the two counts, so the leg set has one origin too.

`notify` takes `needs: [parser-shards, parser-gates, source-shards, source-gates, budget]`. Without `budget` there, a budget-only failure files no tracking issue — the whole point of spec §3.5 — and worse, `notify`'s green branch could auto-close the standing issue (`.github/workflows/mutation-harness.yml:132-147`) on a run whose budget check failed.

**Rewrite the notify CONDITIONS in the same step, not only its `needs`.** Both branches currently test a job this rewrite deletes:

```
.github/workflows/mutation-harness.yml:94   needs.mutation-harness.result == 'failure'
.github/workflows/mutation-harness.yml:133  needs.mutation-harness.result == 'success'
```

A dangling `needs.<job>` does not error — it evaluates to empty. So the failure branch would never fire and the success branch could auto-close a standing issue on a red run: the tracking issue goes silent exactly when it is needed, and every structural assertion about `needs` still passes. Replace both with an expression over the five real jobs, e.g. failure when `contains(needs.*.result, 'failure')` and success when it does not, and extend the issue body to name each family's result plus the budget outcome so a triager knows which of fourteen legs to look at. The two integrity cases added above are what hold this: one rejects any `needs.<job>` naming a job the workflow does not define, the other requires every job name to appear in the notify steps.

- [ ] **Step 6: Probe the CLI end-to-end against a constructed input**

Build a scratch directory holding one record per leg, then:
- one record set to `3601` → expected non-zero exit naming the over-budget leg;
- one record deleted → expected non-zero exit naming the **absent** leg;
- one record duplicated → expected non-zero exit naming the duplicate;
- all records at `100` → expected exit 0, and **no** **::warning::** on stdout;
- one record at `2881` (80 % of 3600) → expected exit **0** with a **::warning::** naming that leg. Without this probe, deleting the annotation entirely leaves every other check green;
- `--budget-seconds` omitted → expected non-zero **usage** exit, naming the missing argument. Without this probe, a hard-coded default silently reinstates the second copy of the constant that repair #4 removed;
- `--parser-shards` omitted → same;
- `--budget-seconds 36000` against a record of `3601` → expected exit 0, confirming the script actually READS the argument rather than ignoring it in favour of an internal value.

A budget check never observed failing is not known to fail, and an annotation never observed emitting is not known to emit. Record all eight in the commit.

- [ ] **Step 7: Commit**

```bash
git add lib/ci/shardBudget.ts scripts/check-shard-budget.ts tests/ci/shardBudget.test.ts .github/workflows/mutation-harness.yml
git commit -m "feat(infra): fail-closed per-shard wall-clock budget with a tested completeness check"
```

---

### Task 6: Make the browser-gate wiring test shard-aware

`tests/cross-cutting/mutation-browser-ci-wiring.test.ts` asserts, on **every** run string containing `--project mutation`, that it names `tests/mutation/guardSurfaces.gate.test.ts` (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:124`) and matches `/mutationHarness/` (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:125`). Both are false under the matrix: the monolith is gone, and a source-shard leg names no `mutationHarness` file.

Its real contract, and the one worth keeping, is `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:121-123`: no leg may run a bare `--project mutation`, because that would sweep in the browser gate.

**Files:**
- Modify: `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:117-128`

<!-- task: red=`pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts` red-state=authored red-target=`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:124` why=`Task 4 replaced the single job whose run string named the monolith, so this assertion fails against every matrix leg` ac=AC-6b -->

- [ ] **Step 1: Run it to observe the RED**

Run: `pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts`
Expected: FAIL on the `guardSurfaces.gate.test.ts` and `mutationHarness` matchers.

- [ ] **Step 2: Replace the two file-naming assertions**

Keep `premiseHolds` (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:119`) and the bare-`--project mutation` prohibition (`tests/cross-cutting/mutation-browser-ci-wiring.test.ts:121-123`) exactly as they are. Replace lines 124-125 with:

```ts
      // Post-sharding a leg names its own explicit subject, which is a parser
      // harness file OR a source-mutation shard/gates file. NOTE the YAML is
      // parsed but its `${{ matrix.shard }}` expressions are NOT evaluated, so a
      // shard leg's run string contains that literal text; match the stable
      // prefix rather than an interpolated index.
      //
      // The invariant that matters is the one above: never a bare
      // `--project mutation`, which would sweep in the browser gate. Per-leg
      // realized-target correctness is pinned by
      // tests/mutation/_metaSourceShardIntegrity.test.ts, not here.
      expect(run, "a mutation leg must name an explicit nightly subject").toMatch(
        /tests\/parser\/mutationHarness|tests\/mutation\/guardSurfaces\.(shard|gates)/,
      );
```

- [ ] **Step 3: Verify, including the assertion that must NOT change**

The `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:126-128` assertion that no run matches `/tests\/mutation\/browser/` is unchanged and must stay green — it is what keeps the browser gate out of this workflow.

Run: `pnpm vitest run tests/cross-cutting/mutation-browser-ci-wiring.test.ts`
Expected: PASS.

- [ ] **Step 4: Mutant check**

Temporarily add a job step running a bare `pnpm exec vitest run --project mutation` and re-run: expected FAIL on `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:121-123`. Then add a step naming a `tests/mutation/browser/` file: expected FAIL on the browser exclusion. Revert both. This records that the surviving assertions still discriminate.

- [ ] **Step 5: Commit**

```bash
git add tests/cross-cutting/mutation-browser-ci-wiring.test.ts
git commit -m "test(infra): make the browser-gate wiring assertions shard-aware"
```

---

### Task 7: Enrol the partition module in the source-mutation registry

Required **before** the whole-diff review dispatch: this arc ships a guard surface the registry can express, and `AGENTS.md` makes enrolment precede review so the convergence criterion is a mutation score plus an empty unaccepted-survivor set rather than reviewer imagination.

**Files:**
- Modify: `tests/mutation/source/registry.ts`, **tests/mutation/source/expectedLedgerKinds.ts**

<!-- task: red=`pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts` why=`a registry row without its EXPECTED_LEDGER_KINDS entry fails the completeness assertion, which is the fail-by-default property that makes a new surface declare its own counts` ac=AC-5 -->

- [ ] **Step 1: Add the registry row**

```ts
  {
    id: "shardBudget",
    sourcePath: "lib/ci/shardBudget.ts",
    suitePaths: ["tests/ci/shardBudget.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Turns the strictly-above budget comparison into at-or-above, which the
    // exactly-at-budget case is built to notice.
    control: { from: "seconds > budgetSeconds", to: "seconds >= budgetSeconds" },
    accepted: [],
  },
  {
    id: "sourceShardPartition",
    sourcePath: "tests/mutation/source/shardPartition.ts",
    suitePaths: ["tests/mutation/source/shardPartition.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    // Drops the `accepted` term from the weight, which the delta case in the
    // suite is built to notice.
    control: {
      from: "surface.accepted.length * (suites - 1) + suites",
      to: "suites",
    },
    accepted: [],
  },
```

- [ ] **Step 2: Run the gates file to observe the RED**

Run: `pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts`
Expected: FAIL — `EXPECTED_LEDGER_KINDS` has no `sourceShardPartition` key while `GUARD_SURFACES` now does. The fail-by-default property working.

> **`pnpm heavy` is not optional here.** Any `--project mutation` invocation is in the must-wrap set (Global Constraints; `AGENTS.md` heavy-phase rule), regardless of how few files it names — classification is by invocation shape, not by expected duration.

> **The env var and `--project mutation` are both load-bearing.** Task 2 Step 5 puts the gates file in `NIGHTLY_ONLY_EXCLUDES`, so a bare `pnpm vitest run <path>` reports `No test files found` and exits non-zero for a reason that has nothing to do with this task — a red that would never turn green no matter what the task did. Every command in this plan that names a nightly file carries the opt-in.

- [ ] **Step 3: Declare the surface's expected ledger kinds**

```ts
  // Enrolled 2026-08-16 with an EMPTY ledger, deliberately. Every branch in the
  // partition is decided by tests/mutation/source/shardPartition.test.ts, so a
  // row appearing here later is a coverage regression to repair, not a number
  // to bump.
  sourceShardPartition: {},
  // Enrolled 2026-08-16 with an EMPTY ledger. The module is pure decision logic
  // with the CLI deliberately in a separate file, so every branch is reachable
  // through the referring suite and a row appearing here is a gap to repay.
  shardBudget: {},
```

- [ ] **Step 4: Run the SAME command green**

Run: `pnpm heavy env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts`
Expected: PASS. This is the identical command Step 2 observed red, which is what the marker contract requires; the gates file is generation-only apart from one child, so it is cheap to run twice.

- [ ] **Step 5: Run the whole gate and record the score**

Run: `pnpm heavy pnpm mutation:guards`
Expected: the same known merge-base failure and no other — `interactionTimingScan`'s `logical-connector:330:39:&&>||` unaccepted survivor, which this arc does not fix (Global Constraints; spec §2.7). **PASS is the wrong expectation here and would require fixing out-of-scope work.** Every OTHER surface, including the two newly enrolled ones, must be clean.

**Record each new surface's score and its full survivor list in the commit message** — those numbers are the convergence criterion the diff-review brief states.

Every survivor is repaid with a case in **tests/mutation/source/shardPartition.test.ts** or argued into `EXPECTED_LEDGER_KINDS` with a reachability argument in prose. Do not bless a survivor you have not argued.

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts tests/mutation/source/shardPartition.test.ts
git commit -m "test(mutation): enrol the shard partition as a source-mutation surface"
```

<!-- tasks: end -->


### Task 8: Closeout

**Files:**
- Modify: `BACKLOG.md` (marker off, entry out)
- Modify: `BACKLOG-archive.md` (entry in)
- Create: **docs/superpowers/plans/2026-08-16-mutation-gate-sharding-closeout.md**

- [ ] **Step 1: Capture the merge-base failure signature set (AC-9)**

Before triaging any red on this branch, record the merge-base's failure signatures **row by row**. An aggregate will not do: "11 drifted rows" and a line range are satisfied by two entirely different eleven-row sets, so a count cannot establish set equality. Either transcribe the full set from run `31933821808` (whose log carries every row), or run `gh workflow run mutation-harness.yml --ref <merge-base>` and transcribe that.

The merge-base set as of `e3fc2e8d3`, from run `31933821808`, in full:

```
interactionTimingScan | unaccepted-survivor | logical-connector:330:39:&&>||
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L35:Xgap0|wrong|401f04fc41a0246f
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L36:Xgap1|wrong|610fa6e15ac305a8
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L37:Xgap2|wrong|6105380d595eb4de
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L38:Xgap3|wrong|efadbb9936687297
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L39:Xgap4|wrong|c8a9337291b07365
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L40:Xgap5|wrong|10097e68698678ca
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L41:Xgap6|wrong|4cf6fd6c0e5587a5
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L42:Xgap7|wrong|72bae9df9aab27f4
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L43:Xgap8|wrong|ce41539565fccaf5
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L44:Xgap9|wrong|a95dc5defc287693
parser-shard4 | DRIFTED | blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L45:Xgap10|wrong|378444153e9f3fe3
```

Twelve signatures. Paste this table into the closeout and compare the branch's set against it **element by element**.

The criterion is set **equality**, not subset. A signature on the branch and not here is a regression of this diff. A signature here and not on the branch is **a disappearance to explain, not a win** — most likely something stopped executing. The shard index is not part of a signature, so a failure legitimately moving between shards is not a difference; `parser-shard4` above records where it was observed, not part of the key.

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

Every reference to the retired monolith, run on the live tree at plan-authoring time, with a disposition per hit. Command:

```
rg -n --no-heading 'guardSurfaces\.gate\.test\.ts'
```

| hit | disposition |
|---|---|
| `vitest.projects.ts:87` (`MUTATION_TEST_GLOBS`) | Task 2 Step 5 — replaced by the shard glob + gates file |
| `vitest.projects.ts:95` (`NIGHTLY_ONLY_EXCLUDES`) | Task 2 Step 5 — same, with `**/` prefix |
| the repo-root `package.json` (`mutation:guards`, line 55) | Task 2 Step 6 — repointed at the five files |
| `.github/workflows/mutation-harness.yml:76` | Task 4 — replaced by the matrix legs |
| `.github/workflows/mutation-harness.yml:112` | Task 8 — notify issue body, section B |
| `tests/cross-cutting/mutation-browser-ci-wiring.test.ts:124` | Task 6 — assertion made shard-aware |
| `tests/mutation/_metaOverlayConfigParity.test.ts:60` | Task 2 Step 7 — `OWNERS` repointed at the gates file |
| `tests/mutation/browser/browserSurfaces.gate.test.ts:11` | comment only — update in Task 2 Step 7 |
| `tests/mutation/source/fixtures/slowTest.fixture.ts:2` | comment only — update in Task 2 Step 7 |
| `tests/mutation/_metaPremiseContract.test.ts:28` | comment only (`guardSurfaces.gate`, no extension) — update in Task 2 Step 7 |
| `BACKLOG.md:295` | Task 8 — entry graduates to the archive |
| `BACKLOG-archive.md:1050` | historical record — **never edited** |
| ~45 hits across `docs/superpowers/specs/**` and `docs/superpowers/plans/**` | historical records of shipped arcs — **never edited**; they describe the tree as it was |

Registry-count reconciliation, also run now: `GUARD_SURFACES` holds **18** rows and `EXPECTED_LEDGER_KINDS` holds **18** keys; Task 7 adds exactly one to each, so both are 19 at closeout. The gates file's completeness assertion is what enforces the pairing.

## Self-review

**Spec coverage.** AC-1/AC-2 → Task 1 (union, disjointness, determinism, optimal makespan) and the gates file's partition block. AC-3 → Task 2 Step 8, the case-count parity check. AC-4 → Task 4's template-equality and registration-shape cases, mutants (f) and (g). AC-5 → Task 2 (assertion moved once, corpus-wide) and Task 7 (fail-by-default demonstrated). AC-6 → Task 4's dangling-`needs` and result-reporting cases, plus Task 5's condition rewrite. AC-6a → Task 4's index-list and file-set cases, mutants (b) and (c). AC-6b → Task 4's interpolation, gates-leg and union cases, mutants (a), (d), (e). AC-6c → Task 5's absent-leg and duplicate-leg cases plus the `needs` case in Task 4. AC-7 → Task 5's boundary, warn-band and no-warn cases, the argument-pinning case in Task 4, and the eight CLI probes at Task 5 Step 6. AC-8 → Task 4 Step 3 (permissions preserved verbatim). AC-9/AC-9b → Task 8 Steps 1-2, against the twelve transcribed merge-base signatures. AC-9a → Task 2 Step 5 and Task 3, with the direct `--project parallel` check at Task 3 Step 4. AC-10 → Task 2 Step 6 and Task 4's `mutation:guards` case. No AC is unclaimed.

**Placeholder scan.** None.

**Falsified at plan time, against the reviewer's own counterexamples.** The two repairs that had already failed once were re-probed rather than asserted:

```
--budget-seconds 3600    accepted=True     --parser-shards 8    accepted=True
--budget-seconds 36000   accepted=False    --parser-shards 8.5  accepted=False
--budget-seconds 3600.5  accepted=False    --parser-shards 80   accepted=False
notify step NAME carries the expression, body does not -> False
notify BODY carries the expression                     -> True
```

**Anti-tautology.** Twelve assertions were rewritten across two review rounds after being found true by construction, and each now carries the mutant that proves otherwise. The weight case holds the source fixed and varies suites and ledger size, asserting the delta, with both formula mutants run at Task 1 Step 5. The makespan case asserts equality behind an executable `premise` rather than a `>=` any additive packing satisfies. Totality and disjointness are asserted over the four slices built the way the shard FILES build them, not over the assignment map's own size. Task 4's realized-target union extracts EVERY target per leg rather than the first, and compares as a sorted set and by length. The template normalizer covers every index-bearing site per family and was probed against all eight live parser shards. The constant-pinning assertions are end-anchored regexes, because `--budget-seconds 36000` contains `3600`. The notify guard requires each job's `needs.<job>.result` expression, not its bare name, which a static label would satisfy. And Task 5's CLI probes now include the warn band and two missing-argument cases, without which deleting the annotation or hard-coding a default would leave everything green.

**Expected-failure honesty.** Both full-gate checkpoints (Task 2 Step 8, Task 7 Step 5) expect the known merge-base failure rather than a pass. `pnpm mutation:guards` is red at the merge base on `interactionTimingScan`'s unaccepted survivor, which this arc explicitly does not fix; demanding PASS would have required fixing out-of-scope work for the task to complete.

**Type consistency.** `sourceShardAssignment` / `shardOfSurface` / `surfacesForShard` / `weightOf` / `SOURCE_SHARD_COUNT` / `SHARD_BUDGET_SECONDS` are spelled identically in Tasks 1, 2, 4, 5 and 7. `registerSurfaceCases` is spelled identically in Task 2's Steps 2 and 3 and in Task 4's registration case. The parser constant is `SHARD_COUNT` and the source one is `SOURCE_SHARD_COUNT`; Task 4 imports both. `ShardAssignment` is imported from the parser module rather than redeclared, since `lptAssign` returns that exact type.
