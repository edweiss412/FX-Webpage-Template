# Execution Methods Derived From Driver Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the query-submitting core of `EXECUTION_METHODS` in `tests/db/_destructiveFileAnalysis.ts:541` from the installed postgres.js driver's own type declarations via a committed generated module, so a driver upgrade that adds a query-submitting method becomes a visible diff instead of a silent guard gap.

**Architecture:** A pure derivation module (TypeScript AST over a type-declaration source string) feeds a generator that writes a committed generated module; the analyzer composes its execution set from that module's derived core plus a hand-justified client-capability list; a guard suite pins version freshness, composition, disjointness, and the derivation's floor; pretest-gen and an x-audits CI step keep the committed module fresh with no silent path; the derivation module is enrolled in the source-mutation registry before the first diff-review round.

**Tech Stack:** TypeScript compiler API (already a dependency), vitest, tsx generators, pretest-gen manifest, x-audits workflow, source-mutation gate.

**Spec:** docs/superpowers/specs/2026-08-16-execution-methods-driver-derived-design.md — the plan argues from the spec; executors read both. Spec section numbers (§N) below refer to that file. The spec's §1 probe table and §4 census are load-bearing context for every task.

## Global Constraints

- Invariant 1 (AGENTS.md): TDD per task — failing test, minimal implementation, passing test, commit. Commit per task, conventional-commits style.
- Invariant 11: all work in the isolated worktree /Users/ericweiss/FX-worktrees/execution-methods-driver-derived on branch test/execution-methods-driver-derived; the main checkout is read-only.
- Heavy-phase rule (AGENTS.md): `pnpm mutation:guards` runs wrapped — `pnpm heavy mutation:guards`. Scoped vitest runs with an explicit file list stay unwrapped.
- Behavior freeze: the composed execution set stays exactly the shipped 10 members (spec §1.1). Any diff that changes the set's membership is out of scope.
- Rejected shape (spec §1.1): no vitest suite parses node_modules type-declaration text. The only test-time node_modules read is the version sentinel's package.json read.
- No em-dash in user-visible copy or generated-code comments (pre-code mechanical gate, AGENTS.md); generated headers use `--` or prose without dashes.
- The composed-set members, sorted, are: begin, cursor, end, file, listen, notify, reserve, savepoint, subscribe, unsafe (10). The derived core, sorted, is: file, listen, notify, unsafe (4). The parameter members, sorted, are: array, json (2). Tasks reference these lists; do not retype variants.

## Acceptance criteria (verbatim ids from spec §6)

AC-1 (generator output + check mode), AC-2 (composition unchanged + corpus green + array fixture), AC-3 (guard-suite arms + derivation fixtures), AC-4 (pretest-gen registration), AC-5 (mutation enrolment green), AC-6 (no test-time driver-types parse), AC-7 (CI freshness step + upload wiring + mutant-red probe). Each task's marker cites the ids it discharges.

## Meta-test inventory (mandatory declaration)

- CREATES: tests/db/executionMethodsManifest.test.ts (guard suite + derivation fixture corpus).
- EXTENDS: `scripts/pretest-gen.mjs` `MANIFEST` (new row) AND `tests/cross-cutting/pretest-gen-manifest.test.ts` — its per-row arms walk the imported MANIFEST automatically, but its "covers all four generators" case (`tests/cross-cutting/pretest-gen-manifest.test.ts:95-101`) hardcodes the four existing names and MUST gain `gen:execution-methods` (plan review R1 finding 1); the `scripts/pretest-gen.mjs:2` header comment's "four pre*-hook generators" count is the same enumeration and is updated in the same commit. Task 4 carries both edits.
- EXTENDS: `tests/mutation/source/registry.ts` (one new `GuardSurface` row; see reconciliation below).
- None of the candidate registries in docs/agents/writing-plans.md (Supabase call boundaries, sentinel hiding, admin-alert catalog, advisory-lock topology, email normalization) applies: this change touches no auth path, no DB write, no alert, no tile, no lock. Declared explicitly per the rule.

## Registry count reconciliation (authored AND run at plan time)

`grep -c 'sourcePath: "' tests/mutation/source/registry.ts` on the plan-time tree returns 16 registry rows (grep -n output pasted: lines 159, 179, 238, 419, 460, 535, 612, 640, 651, 967, 1007, 1025, 1054, 1068, 1153, 1258). Task 6 adds exactly one row (`executionMethodsDerivation`), taking the count to 17. No row is removed.

**Re-reconciled after merging `origin/main` at implementation time (2026-08-16).** Sibling arcs enrolled three further surfaces while this branch was in review, so the same command now returns **19** rows before this arc's row and **20** after it. The invariant this section actually asserts is unchanged and is the one to check: this arc adds EXACTLY ONE row and removes none. The plan-time figures above are retained as the authored record rather than overwritten — the delta (16 to 19) is entirely sibling work merged from main, not drift in this branch.

## Mutation-family closure (guard-surface work)

The operator families for the new surface are the registry's declared set — `operators: [...OPERATOR_NAMES]` (`tests/mutation/source/registry.ts:3` imports it from `./operators`). That enumeration is the closure set diff review converges against; a reviewer-proposed NEW family is admissible only with a live escaping mutant against the shipped guard (docs/agents/writing-plans.md, mutation-family closure rule).

## File map

- Create: scripts/execution-methods/lib.ts — pure derivation module (one responsibility: type-declaration source string in, derived name sets out).
- Create: scripts/generate-execution-methods.ts — generator CLI (read installed driver files, call lib, write/check the generated module).
- Create: tests/db/\_\_generated\_\_/postgresExecutionMethods.ts — committed generated module (generator output; never hand-edited).
- Create: tests/db/executionMethodsManifest.test.ts — guard suite + derivation fixtures.
- Modify: `tests/db/_destructiveFileAnalysis.ts:541` region — composition + export.
- Modify: `tests/db/destructiveFileAnalysis.test.ts` — one new fixture (cf), array-on-a-non-client.
- Modify: `package.json` scripts (gen:execution-methods), `scripts/pretest-gen.mjs` MANIFEST, `.github/workflows/x-audits.yml` (freshness step + upload path), `tests/mutation/source/registry.ts` (one row), `BACKLOG.md` / `BACKLOG-archive.md` (closeout).

New test files land in the SERIAL vitest project by default (`vitest.projects.ts:34` BASE_INCLUDE covers tests/db; tests/db is deliberately absent from PARALLEL_TEST_GLOBS) — no partition edit, and the vitest-projects-partition meta-test needs no change.

<!-- tasks: depth=3 red-contract -->

### Task 1: Derivation module + fixture corpus

<!-- task: red=`pnpm vitest run tests/db/executionMethodsManifest.test.ts` red-state=authored red-target=`scripts/execution-methods/lib.ts` why=`the derivation module does not exist, so the suite's import of deriveExecutionMethods fails to resolve` ac=AC-3 -->

**Files:**
- Create: scripts/execution-methods/lib.ts
- Test: tests/db/executionMethodsManifest.test.ts (derivation-fixture half; the generated-module arms arrive in Task 2)

**Interfaces:**
- Produces: `deriveExecutionMethods(dtsSource: string): ExecutionMethodDerivation` where `ExecutionMethodDerivation = { core: string[]; parameterMembers: string[] }`, both sorted and deduplicated. Consumed by Task 2's generator and by this suite.

- [ ] **Step 1: Write the failing derivation-fixture tests**

Create tests/db/executionMethodsManifest.test.ts:

```ts
import { describe, expect, it } from "vitest";

import { deriveExecutionMethods } from "@/scripts/execution-methods/lib";

describe("deriveExecutionMethods (spec 2026-08-16 §2.1/§2.5)", () => {
  it("collects methods returning PendingQuery, deduplicating overloads", () => {
    const src = `
      interface ISql {
        unsafe(query: string): PendingQuery<Row[]>;
        file(path: string): PendingQuery<Row[]>;
        file(path: string, args: unknown[]): PendingQuery<Row[]>;
      }`;
    expect(deriveExecutionMethods(src).core).toEqual(["file", "unsafe"]);
  });

  it("collects PendingRequest and ListenRequest returners", () => {
    const src = `
      interface Sql {
        notify(channel: string, payload: string): PendingRequest;
        listen(channel: string, fn: (v: string) => void): ListenRequest;
      }`;
    expect(deriveExecutionMethods(src).core).toEqual(["listen", "notify"]);
  });

  it("does not collect a method returning a Promise (the begin shape)", () => {
    const src = `interface Sql { begin<T>(cb: (sql: unknown) => T): Promise<T>; }`;
    expect(deriveExecutionMethods(src)).toEqual({ core: [], parameterMembers: [] });
  });

  it("routes Parameter and ArrayParameter returners to parameterMembers", () => {
    const src = `
      interface ISql {
        json(value: unknown): Parameter;
        array(value: unknown[]): ArrayParameter<unknown[]>;
      }`;
    const out = deriveExecutionMethods(src);
    expect(out.core).toEqual([]);
    expect(out.parameterMembers).toEqual(["array", "json"]);
  });

  it("ignores property signatures whose type is a function returning Parameter (the typed shape)", () => {
    const src = `interface ISql { typed: (value: unknown, oid: number) => Parameter; }`;
    expect(deriveExecutionMethods(src)).toEqual({ core: [], parameterMembers: [] });
  });

  it("collects a qualified return reference (postgres.PendingQuery)", () => {
    const src = `interface ISql { unsafe(q: string): postgres.PendingQuery<Row[]>; }`;
    expect(deriveExecutionMethods(src).core).toEqual(["unsafe"]);
  });

  it("ignores a method with no return annotation", () => {
    const src = `interface ISql { unsafe(q: string); }`;
    expect(deriveExecutionMethods(src).core).toEqual([]);
  });

  it("walks interfaces inside a declare-namespace block (the real driver file's shape)", () => {
    const src = `
      declare namespace postgres {
        interface ISql { unsafe(q: string): PendingQuery<Row[]>; }
      }`;
    expect(deriveExecutionMethods(src).core).toEqual(["unsafe"]);
  });

  it("does not collect a method signature inside a type literal (the toJSON shape, spec §4)", () => {
    const src = `type JSONValue = string | { toJSON(): PendingQuery<Row[]> };`;
    expect(deriveExecutionMethods(src).core).toEqual([]);
  });
});
```

Every fixture derives its expectation from its own declared members (anti-tautology rule) — none reads the live driver. The toJSON fixture deliberately returns PendingQuery from inside a type literal: it fails if the walk domain ever widens past interface declarations, which is the concrete failure mode it catches.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `pnpm vitest run tests/db/executionMethodsManifest.test.ts`
Expected: FAIL — cannot resolve `@/scripts/execution-methods/lib` (module absent).

- [ ] **Step 3: Write the derivation module**

Create scripts/execution-methods/lib.ts:

```ts
/**
 * scripts/execution-methods/lib.ts
 *
 * Pure derivation of postgres.js execution methods from a type-declaration
 * SOURCE STRING (spec docs/superpowers/specs/2026-08-16-execution-methods-driver-derived-design.md §2.1).
 * Walk domain: interface declarations only -- a method signature inside a type
 * literal (the driver's toJSON node) is deliberately never a candidate.
 * Consumers: scripts/generate-execution-methods.ts and the guard suite.
 * Enrolled in tests/mutation/source/registry.ts (executionMethodsDerivation).
 */
import ts from "typescript";

export type ExecutionMethodDerivation = {
  /** Method members whose declared return-type head is PendingQuery | PendingRequest | ListenRequest. */
  core: string[];
  /** Method members whose declared return-type head is Parameter | ArrayParameter. */
  parameterMembers: string[];
};

const CORE_HEADS = new Set(["PendingQuery", "PendingRequest", "ListenRequest"]);
const PARAMETER_HEADS = new Set(["Parameter", "ArrayParameter"]);

/** Rightmost identifier of a type reference's name; null for any other annotation shape. */
function headIdentifier(type: ts.TypeNode | undefined): string | null {
  if (type === undefined || !ts.isTypeReferenceNode(type)) return null;
  let name: ts.EntityName = type.typeName;
  while (ts.isQualifiedName(name)) name = name.right;
  return name.text;
}

export function deriveExecutionMethods(dtsSource: string): ExecutionMethodDerivation {
  const sf = ts.createSourceFile(
    "driver.d.ts",
    dtsSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const core = new Set<string>();
  const parameterMembers = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isInterfaceDeclaration(n)) {
      for (const member of n.members) {
        if (!ts.isMethodSignature(member) || !ts.isIdentifier(member.name)) continue;
        const head = headIdentifier(member.type);
        if (head === null) continue;
        if (CORE_HEADS.has(head)) core.add(member.name.text);
        else if (PARAMETER_HEADS.has(head)) parameterMembers.add(member.name.text);
      }
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return { core: [...core].sort(), parameterMembers: [...parameterMembers].sort() };
}
```

(`member.name` on a `MethodSignature` is a `PropertyName`, so `ts.isIdentifier(member.name)` both narrows and filters computed/string names; no separate undefined check is needed — the property is non-optional.)

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm vitest run tests/db/executionMethodsManifest.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: clean.

```bash
git add scripts/execution-methods/lib.ts tests/db/executionMethodsManifest.test.ts
git commit -m "test(db): derivation module for postgres execution methods"
```

### Task 2: Generator, committed generated module, and freshness arms

<!-- task: red=`pnpm vitest run tests/db/executionMethodsManifest.test.ts` red-state=authored red-target=`scripts/generate-execution-methods.ts` why=`the generator and its committed output do not exist, so the new sentinel/premise/disjointness arms fail on an unresolvable import of the generated module` ac=AC-1,AC-3 -->

**Files:**
- Create: scripts/generate-execution-methods.ts
- Create: tests/db/__generated__/postgresExecutionMethods.ts (by running the generator; committed)
- Modify: `package.json` (one script line)
- Test: tests/db/executionMethodsManifest.test.ts (add the generated-module arms)

**Interfaces:**
- Consumes: `deriveExecutionMethods` from Task 1.
- Produces: generated module exporting `POSTGRES_TYPES_VERSION: string`, `POSTGRES_EXECUTION_CORE: readonly string[]`, `POSTGRES_PARAMETER_MEMBERS: readonly string[]`; generator constants `DRIVER_TYPES_PATH`, `DRIVER_PACKAGE_JSON_PATH`, `OUT_PATH`. Task 3 imports `POSTGRES_EXECUTION_CORE`; Task 4 registers the paths.

- [ ] **Step 1: Add the failing arms to the suite**

Append to tests/db/executionMethodsManifest.test.ts:

```ts
import { readFileSync } from "node:fs";

import { premiseHolds } from "../_shared/premise";
import {
  POSTGRES_EXECUTION_CORE,
  POSTGRES_PARAMETER_MEMBERS,
  POSTGRES_TYPES_VERSION,
} from "./__generated__/postgresExecutionMethods";

const DRIVER_PACKAGE_JSON = "node_modules/postgres/package.json";

describe("generated execution-methods module (spec §2.4)", () => {
  it("version sentinel: the committed module matches the installed driver", () => {
    const raw = readFileSync(DRIVER_PACKAGE_JSON, "utf8");
    const installed = (JSON.parse(raw) as { version: string }).version;
    // The suite's one environment-touching test (premise-contract classification,
    // Task 6): its premise is that the installed driver actually yielded a version.
    premiseHolds("installed driver package.json yields a version", installed.length > 0);
    expect(
      POSTGRES_TYPES_VERSION,
      "stale generated module -- run: pnpm gen:execution-methods",
    ).toBe(installed);
  });

  it("disjointness: no parameter member is in either half of the composition", () => {
    for (const name of POSTGRES_PARAMETER_MEMBERS) {
      expect(POSTGRES_EXECUTION_CORE).not.toContain(name);
    }
  });

  it("premise guard: the derivation floor members are present (spec §2.4 arm 4)", () => {
    premiseHolds(
      "the derivation produced a non-collapsed core",
      POSTGRES_EXECUTION_CORE.length > 0,
    );
    expect(POSTGRES_EXECUTION_CORE).toContain("unsafe");
    expect(POSTGRES_EXECUTION_CORE).toContain("file");
  });
});
```

(Consolidate the `readFileSync` import with any existing node:fs import if one exists; imports live at the top of the file.)

- [ ] **Step 2: Run the suite to verify it fails**

Run: `pnpm vitest run tests/db/executionMethodsManifest.test.ts`
Expected: FAIL — cannot resolve `./__generated__/postgresExecutionMethods`.

- [ ] **Step 3: Write the generator**

Create scripts/generate-execution-methods.ts:

```ts
/**
 * scripts/generate-execution-methods.ts  (pnpm gen:execution-methods)
 *
 * Reads the installed postgres.js driver's type declarations and version, and
 * writes tests/db/__generated__/postgresExecutionMethods.ts -- the committed
 * derived core of the destructive-file analyzer's execution set (spec
 * docs/superpowers/specs/2026-08-16-execution-methods-driver-derived-design.md §2.2).
 *
 * Usage:
 *   pnpm gen:execution-methods          # write the generated module
 *   pnpm gen:execution-methods --check  # write nothing; exit 1 if it would change
 */
import { readFileSync, writeFileSync } from "node:fs";

import { deriveExecutionMethods } from "./execution-methods/lib";

export const DRIVER_TYPES_PATH = "node_modules/postgres/types/index.d.ts";
export const DRIVER_PACKAGE_JSON_PATH = "node_modules/postgres/package.json";
export const OUT_PATH = "tests/db/__generated__/postgresExecutionMethods.ts";

function render(): string {
  const pkg = JSON.parse(readFileSync(DRIVER_PACKAGE_JSON_PATH, "utf8")) as { version: string };
  const derived = deriveExecutionMethods(readFileSync(DRIVER_TYPES_PATH, "utf8"));
  return [
    "// @generated by scripts/generate-execution-methods.ts; do not edit. Regenerate: pnpm gen:execution-methods",
    `// Source: ${DRIVER_TYPES_PATH} (postgres ${pkg.version}).`,
    `export const POSTGRES_TYPES_VERSION = ${JSON.stringify(pkg.version)};`,
    `export const POSTGRES_EXECUTION_CORE: readonly string[] = ${JSON.stringify(derived.core)};`,
    `export const POSTGRES_PARAMETER_MEMBERS: readonly string[] = ${JSON.stringify(derived.parameterMembers)};`,
    "",
  ].join("\n");
}

const next = render();
if (process.argv.includes("--check")) {
  const current = readFileSync(OUT_PATH, "utf8");
  if (current !== next) {
    console.error(`${OUT_PATH} is stale; run pnpm gen:execution-methods`);
    process.exit(1);
  }
} else {
  writeFileSync(OUT_PATH, next);
}
```

Add to `package.json` scripts, directly after the `gen:schema-manifest` line:

```json
    "gen:execution-methods": "tsx scripts/generate-execution-methods.ts",
```

- [ ] **Step 4: Run the generator; inspect the committed output**

Run: `mkdir -p tests/db/__generated__ && pnpm gen:execution-methods && cat tests/db/__generated__/postgresExecutionMethods.ts`
Expected content (AC-1): version `3.4.9`; core exactly `["file","listen","notify","unsafe"]`; parameterMembers exactly `["array","json"]`. If either list differs, STOP — the derivation disagrees with the spec §1 probe table; do not adjust the expectation, find the walker defect.

- [ ] **Step 5: Run the suite to verify it passes; probe check mode both ways**

Run: `pnpm vitest run tests/db/executionMethodsManifest.test.ts`
Expected: PASS.

Run: `pnpm gen:execution-methods --check; echo "exit=$?"`
Expected: `exit=0`.

Run (mutant-red for check mode; the file is still UNTRACKED at this point, so restore by regenerating, not by git checkout — plan review R1 finding 2): `echo "// stale" >> tests/db/__generated__/postgresExecutionMethods.ts && pnpm gen:execution-methods --check; echo "exit=$?"; pnpm gen:execution-methods`
Expected: `exit=1` with the stale message, then the final regeneration rewrites the canonical content. Confirm with `pnpm gen:execution-methods --check; echo "exit=$?"` printing `exit=0` before committing.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add scripts/generate-execution-methods.ts tests/db/__generated__/postgresExecutionMethods.ts tests/db/executionMethodsManifest.test.ts package.json docs/superpowers/plans/2026-08-16-execution-methods-driver-derived.md
git commit -m "infra: generator + committed derived execution-methods module"
```

### Task 3: Analyzer composition + composition pin + array fixture

<!-- task: red=`pnpm vitest run tests/db/executionMethodsManifest.test.ts tests/db/destructiveFileAnalysis.test.ts` red-state=authored red-target=`tests/db/_destructiveFileAnalysis.ts:541` why=`the analyzer still holds a module-private hand-typed set with no export and no derived-core import, so the new composition-pin arm cannot import EXECUTION_METHODS` ac=AC-2,AC-3 -->

**Files:**
- Modify: `tests/db/_destructiveFileAnalysis.ts` (the `EXECUTION_METHODS` declaration region at `tests/db/_destructiveFileAnalysis.ts:525-543`, plus one import line at the top)
- Test: tests/db/executionMethodsManifest.test.ts (composition-pin arm), `tests/db/destructiveFileAnalysis.test.ts` (fixture (cf))

**Interfaces:**
- Consumes: `POSTGRES_EXECUTION_CORE` from Task 2.
- Produces: `export const EXECUTION_METHODS: Set<string>` from `tests/db/_destructiveFileAnalysis.ts` (test-only consumer; no production caller).

- [ ] **Step 1: Add the failing composition-pin arm and the array fixture**

Append to the `describe` block added in Task 2 in tests/db/executionMethodsManifest.test.ts:

```ts
  it("composition pin: the analyzer's exported set is exactly the shipped 10 members", () => {
    expect([...EXECUTION_METHODS].sort()).toEqual([
      "begin", "cursor", "end", "file", "listen",
      "notify", "reserve", "savepoint", "subscribe", "unsafe",
    ]);
  });

  it("disjointness covers the hand list too", () => {
    for (const name of POSTGRES_PARAMETER_MEMBERS) {
      expect(EXECUTION_METHODS.has(name)).toBe(false);
    }
  });
```

with the import added at the top:

```ts
import { EXECUTION_METHODS } from "./_destructiveFileAnalysis";
```

This asserts the analyzer's OWN exported object, not a test-side recomputation (spec §2.4 arm 2 anti-tautology requirement). Failure mode caught: the analyzer composing a different set than the module the suite recomputes from.

In `tests/db/destructiveFileAnalysis.test.ts`, add directly after fixture `(cb)` (`tests/db/destructiveFileAnalysis.test.ts:1166`), reusing that fixture's local conventions (`IMPORT`, `P`, `analyseDestructiveFile` are already in scope in that file):

```ts
  it("(cf) keeps `.array()` OUT of the execution set -- the behavioral twin of (cb)'s json case", () => {
    // Spec 2026-08-16 §2.5: fixture (cb)'s title promises array coverage its body
    // never exercised (spec review R3 finding 3). A discovered file calling
    // `.array()` on a non-client must still pass; if `array` ever entered the
    // execution set, this rejects with an unchecked-execution error.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
const parts = new Float32Array(4);
const halves = parts.array();
await sql\`select public.prune_sync_log()\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });
```

(The receiver shape is what matters, not runtime validity: the analyzer sees a property call named `array` on a non-client identifier. The fixture never executes this source.)

- [ ] **Step 2: Run both suites to verify the new cases fail**

Run: `pnpm vitest run tests/db/executionMethodsManifest.test.ts tests/db/destructiveFileAnalysis.test.ts`
Expected: the composition-pin arm FAILS (no `EXECUTION_METHODS` export exists at `tests/db/_destructiveFileAnalysis.ts:541` — it is module-private). Fixture (cf) passes already (array was never in the set); it is a regression pin, and its `red` is carried by the arm in the same command.

- [ ] **Step 3: Compose the set in the analyzer**

In `tests/db/_destructiveFileAnalysis.ts`, add to the import block at the top (after the `./_destructiveStatements` import at `tests/db/_destructiveFileAnalysis.ts:58`):

```ts
import { POSTGRES_EXECUTION_CORE } from "./__generated__/postgresExecutionMethods";
```

Replace the declaration at `tests/db/_destructiveFileAnalysis.ts:541-543` (`const EXECUTION_METHODS = new Set(...)` and its string literal), keeping the existing doc comments above it and updating their `file was missing` paragraph's final sentence to note the derivation:

```ts
/** Client-capability members the derivation deliberately does not produce (spec
 *  2026-08-16-execution-methods-driver-derived-design.md §2.3): each hands out or
 *  manages client capability rather than returning a pending query. Cited to the
 *  postgres 3.4.9 driver types: begin (line 717) and savepoint (line 724) hand a
 *  TransactionSql to a callback; end (line 709) and reserve (line 720) are session
 *  lifecycle; subscribe (line 713) opens a replication subscription; cursor
 *  (line 617) is the result-iteration member, kept for shipped behavior. */
const CLIENT_CAPABILITY_METHODS = [
  "begin", "end", "reserve", "savepoint", "subscribe", "cursor",
] as const;

/** Exported for the composition pin in executionMethodsManifest.test.ts only. */
export const EXECUTION_METHODS = new Set<string>([
  ...POSTGRES_EXECUTION_CORE,
  ...CLIENT_CAPABILITY_METHODS,
]);
```

- [ ] **Step 4: Run both suites plus the full serial-adjacent neighbors to verify green**

Run: `pnpm vitest run tests/db/executionMethodsManifest.test.ts tests/db/destructiveFileAnalysis.test.ts tests/db/_metaDestructiveDbTargetGuard.test.ts`
Expected: PASS — every pre-existing analyzer fixture unmodified and green (AC-2), the composition pin green, (cf) green.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add tests/db/_destructiveFileAnalysis.ts tests/db/executionMethodsManifest.test.ts tests/db/destructiveFileAnalysis.test.ts
git commit -m "test(db): compose EXECUTION_METHODS from the derived core"
```

### Task 4: pretest-gen registration

<!-- task: red=`pnpm vitest run tests/cross-cutting/pretest-gen-manifest.test.ts` red-state=authored red-target=`scripts/pretest-gen.mjs:16` why=`the MANIFEST array holds no row for the new generator; the row is added first with deliberately incomplete inputs so the four-generator name-list rejection and the arm coverage failures are OBSERVED, then completed` ac=AC-4 -->

**Files:**
- Modify: `scripts/pretest-gen.mjs` (`MANIFEST` array at `scripts/pretest-gen.mjs:16`; header comment's generator count at `scripts/pretest-gen.mjs:2`)
- Modify: `tests/cross-cutting/pretest-gen-manifest.test.ts` (the "covers all four generators" name list at `tests/cross-cutting/pretest-gen-manifest.test.ts:95-101` gains `gen:execution-methods`; the per-row arms need no edit — they walk the imported `MANIFEST`)

- [ ] **Step 1: Add the row with script-only inputs (deliberate red)**

Append to `MANIFEST` in `scripts/pretest-gen.mjs`:

```js
  {
    name: "gen:execution-methods",
    script: "scripts/generate-execution-methods.ts",
    inputs: ["scripts/generate-execution-methods.ts"],
    output: "tests/db/__generated__/postgresExecutionMethods.ts",
  },
```

- [ ] **Step 2: Run the manifest meta-test and OBSERVE the coverage failure**

Run: `pnpm vitest run tests/cross-cutting/pretest-gen-manifest.test.ts`
Expected: FAIL, twice over — the "covers all four generators" case rejects the fifth name (its list at `tests/cross-cutting/pretest-gen-manifest.test.ts:96-101` hardcodes the four existing generators), and the import-closure/read-call arms report scripts/execution-methods/lib.ts missing from inputs and the driver-types and driver-package reads uncovered. This red proves the meta-test actually guards the new row.

- [ ] **Step 3: Complete the inputs; update the name list and header count**

In `tests/cross-cutting/pretest-gen-manifest.test.ts`, rename the case to "covers all five generators" and add `"gen:execution-methods"` to its sorted expected list. In `scripts/pretest-gen.mjs:2`, update the header comment's "the four pre*-hook generators" to "the five pre*-hook generators". Then complete the row's inputs:

```js
    inputs: [
      "scripts/generate-execution-methods.ts",
      "scripts/execution-methods/lib.ts",
      "node_modules/postgres/types/index.d.ts",
      "node_modules/postgres/package.json",
    ],
```

If the read-call arm additionally flags the `--check` branch's `OUT_PATH` read, it is an in-file-resolved UPPER_SNAKE const, which the arm's own contract accepts (`tests/cross-cutting/pretest-gen-manifest.test.ts` header, arm b); do not add the output path to inputs.

- [ ] **Step 4: Verify green and prove the cache regenerates on driver change**

Run: `pnpm vitest run tests/cross-cutting/pretest-gen-manifest.test.ts`
Expected: PASS.

Run: `node scripts/pretest-gen.mjs && node scripts/pretest-gen.mjs`
Expected: second run skips gen:execution-methods (stamp hit). Then hand-append a comment line to the generated module, run `node scripts/pretest-gen.mjs` again, and confirm it regenerates the file back to canonical content (output content is part of the hash; this is the row's premise probe).

- [ ] **Step 5: Commit**

```bash
git add scripts/pretest-gen.mjs tests/cross-cutting/pretest-gen-manifest.test.ts
git commit -m "infra: register gen:execution-methods in the pretest-gen manifest"
```

<!-- tasks: end -->

<!-- tasks: depth=3 -->

### Task 5: CI freshness gate in x-audits

<!-- task: red=`git diff --exit-code tests/db/__generated__/postgresExecutionMethods.ts` ac=AC-7 -->

The marker's `red=` is the gate's own oracle command: it is OBSERVED failing in Step 4 while the stale-commit mutant is applied, and passes after the reset — the mutant-red treatment the gate-command rule requires (docs/agents/writing-plans.md).

**Files:**
- Modify: `.github/workflows/x-audits.yml` — one step in the `traceability-audit` job after the existing "Verify generated ... is fresh" steps (pattern at `.github/workflows/x-audits.yml:31-36`), plus one line in the upload path list (`.github/workflows/x-audits.yml:60-71`).

- [ ] **Step 1: Add the step and the upload path**

After the "Verify traceability coverage matrix is fresh" step:

```yaml
      - name: Verify generated execution-methods module is fresh
        if: github.event_name != 'schedule'
        run: |
          pnpm gen:execution-methods
          git diff -- tests/db/__generated__/postgresExecutionMethods.ts > traceability-execution-methods-generated.diff
          git diff --exit-code tests/db/__generated__/postgresExecutionMethods.ts
```

In the "Upload X.6 traceability audit artifact" step's `path:` list, add:

```yaml
            traceability-execution-methods-generated.diff
```

- [ ] **Step 2: Mutant-red probe of the gate, locally (AC-7 evidence)**

Run, and record the transcript in the task's commit message body or the handoff notes:

```bash
printf '\n// hand-edit mutant\n' >> tests/db/__generated__/postgresExecutionMethods.ts
pnpm gen:execution-methods
git diff --exit-code tests/db/__generated__/postgresExecutionMethods.ts; echo "exit=$?"
```

Expected: `exit=0` — and that is the correct expectation for THIS input: `pnpm gen:execution-methods` regenerates over the working-tree mutant, so the tree matches HEAD again and the gate passes (regeneration repairs a hand-edit; the diff artifact captures nothing). Restore with `pnpm gen:execution-methods` if any residue remains. The gate's REAL failing input is a stale COMMIT, probed in Step 4 AFTER the workflow change is committed, so no stash juggling is needed (plan review R1 finding 2: the earlier draft stashed the workflow edit and never popped it).

- [ ] **Step 3: Commit the workflow change**

```bash
git add .github/workflows/x-audits.yml
git commit -m "infra: x-audits freshness gate for the execution-methods module"
```

- [ ] **Step 4: Mutant-red probe of the gate against a stale commit (AC-7 evidence)**

The working tree is now clean. Simulate the silent-merge shape from spec review R1 finding 1 — a committed module that no longer matches the installed driver derivation:

```bash
sed -i '' 's/"unsafe"/"unsafe-mutant"/' tests/db/__generated__/postgresExecutionMethods.ts
git add tests/db/__generated__/postgresExecutionMethods.ts && git commit -m "tmp: gate mutant (revert immediately)"
pnpm gen:execution-methods
git diff --exit-code tests/db/__generated__/postgresExecutionMethods.ts; echo "exit=$?"
git reset --hard HEAD^
```

Expected: `exit=1` — the regenerated working tree differs from the mutant commit, so the gate goes red on exactly the stale-commit shape. After `git reset --hard HEAD^`, confirm `git status --short` prints nothing and `pnpm gen:execution-methods --check` exits 0.

- [ ] **Step 5: Append and commit the evidence**

Only NOW — after the reset, so the reset cannot erase it — append both probe transcripts (Step 2's exit=0 and Step 4's exit=1) to this plan's "Execution evidence" section, and commit:

```bash
git add docs/superpowers/plans/2026-08-16-execution-methods-driver-derived.md
git commit -m "infra: record freshness-gate probe evidence"
```

### Task 6: Mutation enrolment

<!-- task: red=`pnpm heavy mutation:guards` ac=AC-5 -->

The marker's `red=` is the enrolment gate itself: it is red whenever the new surface's score is under its floor or an unaccepted survivor exists, and the task is not done until it is green — enrolment precedes the first diff-review dispatch (AGENTS.md convergence bullet 4; spec §5).

**Files:**
- Modify: `tests/mutation/source/registry.ts` (one `GuardSurface` row)
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (`EXPECTED_ENV_TOUCHING` row for the enrolled suite) and `tests/mutation/guardSurfaces.gate.test.ts` (`EXPECTED_LEDGER_KINDS` row for the new surface id) — both hand-keyed companion registries red until their row lands (plan review R2 finding 1)
- Possibly modify: tests/db/executionMethodsManifest.test.ts (fixtures added to kill survivors)

- [ ] **Step 1: Add the registry row**

Following the analyzer row's shape (`tests/mutation/source/registry.ts:533-541`):

```ts
  /**
   * Derivation of the destructive-file analyzer's execution-method core from the
   * driver's type declarations (BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES).
   * Pure AST over a source string, DB-free, fixture-corpus suite -- enrolled
   * before the arc's first diff-review round per the AGENTS.md contract.
   */
  {
    id: "executionMethodsDerivation",
    sourcePath: "scripts/execution-methods/lib.ts",
    suitePaths: ["tests/db/executionMethodsManifest.test.ts"],
    operators: [...OPERATOR_NAMES],
    // Placeholder until the first run; tighten to measured-minus-0.05 (the
    // analyzer row's convention at registry.ts:538-541) in this same task.
    scoreFloor: 0.8,
    // Inverting core classification collects every annotated return type into
    // core; the Promise-shape and Parameter-routing fixtures reject it.
    control: {
      from: "if (CORE_HEADS.has(head)) core.add(member.name.text);",
      to: "if (!CORE_HEADS.has(head)) core.add(member.name.text);",
    },
    accepted: [],
  },
```

- [ ] **Step 2: OBSERVE both companion-registry reds (plan review R4 finding 1)**

With the registry row from Step 1 in place and NO companion rows yet, run both owning commands and observe each fail on its equality assertion — the guaranteed reds whose same commands later pass (the premise meta-test goes green at Step 3 once its row lands; the heavy gate goes green by Step 5, after survivor resolution and the floor tightening):

Run: `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts`
Expected: FAIL — "declares a count for every enrolled suite" (`tests/mutation/_metaPremiseContract.test.ts:137-142`) rejects the newly enrolled suite with no `EXPECTED_ENV_TOUCHING` key.

Run: `pnpm heavy mutation:guards`
Expected: FAIL — "declares expected ledger-kind counts for every enrolled surface" (`tests/mutation/guardSurfaces.gate.test.ts:150-155`) rejects `executionMethodsDerivation` with no `EXPECTED_LEDGER_KINDS` key. This red is UNCONDITIONAL (an equality over key sets), not score-dependent.

- [ ] **Step 3: Add the two mandatory companion-registry rows (plan review R2 finding 1)**

Enrolment touches TWO more hand-keyed registries; add the rows the Step 2 reds demanded:

- `tests/mutation/_metaPremiseContract.test.ts` — `EXPECTED_ENV_TOUCHING` must declare a count for every enrolled suitePath (asserted at `tests/mutation/_metaPremiseContract.test.ts:137-142`). Add `"tests/db/executionMethodsManifest.test.ts": 0` — the classifier's provenance set counts `node:child_process`, ledger-git, and `process.env` reads as environment-touching (`tests/mutation/source/premiseScan.ts:28` and `tests/mutation/source/premiseScan.ts:211`); a bare `node:fs` read is pure to it, so the version sentinel classifies environment-free and the suite's declared count is ZERO (plan review R3 finding 1, probe-verified against the exact sentinel snippet). The sentinel keeps its `premiseHolds` line regardless — it states the read's premise for the human reader even though the classifier does not demand it. If the classifier's verdicts differ at implementation time, reconcile by reading them, not by bumping the number blind.
- `tests/mutation/guardSurfaces.gate.test.ts` — `EXPECTED_LEDGER_KINDS` must declare a kind-count row for every `GuardSurface.id` (asserted at `tests/mutation/guardSurfaces.gate.test.ts:150-155`). Add `executionMethodsDerivation: {}` (the row starts with `accepted: []`; update the kind counts in the same commit as any survivor disposition so the two stay in lockstep).

Run: `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` (the Step 2 premise command, now green) and `pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts`
Expected: PASS after both rows land (row well-formed; the suite's premise usage satisfies the premise contract — if the premise-contract test demands a different helper form for any arm, repair the suite to comply, not the meta-test).

- [ ] **Step 4: Run the gate**

Run: `pnpm heavy mutation:guards`
Expected: the new surface reports a score and a survivor list. For each unaccepted survivor: kill it with a new derivation fixture where it exposes a real gap, or add an `accepted` row with a reachability argument where it is equivalent (registry conventions; deletion of dead code beats blessing it). Iterate until zero unaccepted survivors.

- [ ] **Step 5: Tighten the floor and re-run**

Set `scoreFloor` to measured-minus-0.05. Re-run `pnpm heavy mutation:guards`; expected green. Record the measured score, the survivor dispositions, and the run duration in the Execution evidence section — the diff-review round-1 brief must state them (spec §5).

- [ ] **Step 6: Commit**

```bash
git add tests/mutation/source/registry.ts tests/mutation/_metaPremiseContract.test.ts tests/mutation/guardSurfaces.gate.test.ts tests/db/executionMethodsManifest.test.ts docs/superpowers/plans/2026-08-16-execution-methods-driver-derived.md
git commit -m "test(db): enrol executionMethodsDerivation in the mutation gate"
```

### Task 7: Closeout sweeps, ledger graduation, handoff evidence

<!-- task: red=`bash -c '! grep -rn "types/index.d.ts" tests/ --exclude-dir=__generated__'` ac=AC-6 -->

The marker's `red=` is the AC-6 sweep with CORRECT red-then-green polarity (plan review R1 finding 3): the `!` inverts rg, so the command exits NON-ZERO exactly when a vitest suite references the driver types file (the defect) and 0 when the tree is clean. Step 1 OBSERVES the red against a constructed failing input before running the clean sweep — a gate never seen failing proves nothing.

**Files:**
- Modify: `BACKLOG.md`, `BACKLOG-archive.md` (graduate the entry), this plan file (execution-evidence notes), `docs/review-rounds/test/execution-methods-driver-derived/119895a7c756.md` (extend if diff rounds reach threshold)

- [ ] **Step 1: AC-6 sweeps — observe the red, then the clean pass**

First OBSERVE the marker command failing on a constructed defect (one ordinary edit inside the probe domain):

```bash
printf '// probe: node_modules/postgres/types/index.d.ts\n' > tests/db/ac6-probe.test.ts
bash -c '! rg -n "types/index.d.ts" tests/ --glob "!tests/db/__generated__/**"'; echo "exit=$?"
rm tests/db/ac6-probe.test.ts
```

Expected: `exit=1` (the sweep catches the reference). Then the clean pass:

```bash
bash -c '! rg -n "types/index.d.ts" tests/ --glob "!tests/db/__generated__/**"'; echo "exit=$?"
rg -n "node_modules/postgres" tests/; echo "exit=$?"
```

Expected: first prints `exit=0` — the SAME command that just failed now passes (no suite touches the driver types file). Second returns exactly the version sentinel's node_modules/postgres/package.json read (and the generated module's provenance comment if the glob catches it) — every hit dispositioned in the Execution evidence section; any OTHER hit is an AC-6 violation to repair. Record all three transcripts in the Execution evidence section.

- [ ] **Step 2: Full verification battery**

```bash
pnpm typecheck && pnpm exec eslint scripts/execution-methods scripts/generate-execution-methods.ts tests/db/executionMethodsManifest.test.ts
pnpm vitest run tests/db/executionMethodsManifest.test.ts tests/db/destructiveFileAnalysis.test.ts tests/db/_metaDestructiveDbTargetGuard.test.ts tests/cross-cutting/pretest-gen-manifest.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts
pnpm heavy test:fast
```

Expected: all green. (`pnpm heavy test:fast` is the full-suite leg and MUST run under the heavy wrapper per AGENTS.md.)

- [ ] **Step 3: Cross-model diff review to APPROVE (marker still on)**

Commit the Task 7 step-1 evidence appends first (`git add docs/superpowers/plans/2026-08-16-execution-methods-driver-derived.md && git commit -m "docs(plan): record closeout sweep evidence"`). Then whole-diff codex review to APPROVE via codex-guard (`--stage diff`), with the round-1 brief stating: consequence bound, PROBE DOMAIN, threat fence (copy from spec §7), the measured mutation score + survivor set from Task 6, and REVIEWER ONLY. The in-progress ledger marker is STILL PRESENT during review — it comes off only in the step-4 graduation commit (plan review R3 finding 3: graduating before a review that can spawn repair commits leaves the ledger claiming no work in flight while work is in flight). The brief DECLARES the upcoming graduation commit and its exact content (entry moved to archive, marker line removed, nothing else) so the reviewer approves the merged diff's final shape — the review-covers-what-merges accommodation for a pre-declared docs-only tail (docs/agents/writing-plans.md, lint shape (i)). Any repair commit the review produces returns to the start of this step; graduation happens only after an APPROVE with no further repairs.

- [ ] **Step 4: Graduate the ledger entry — the PR's actual last commit**

Move the whole `BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES` entry from `BACKLOG.md` to `BACKLOG-archive.md` with provenance (branch, spec path, this plan path, what shipped, the spec §1 equality correction, and ALL THREE re-open triggers — the two from spec §4, a postgres.js version bump or a first live largeObject use, PLUS the entry's own original trigger preserved by spec §4's closing line: a second omission found by review rather than by this guard; plan review R1 finding 5). Remove the `**Status:** IN PROGRESS · **Branch:** ...` marker line in the SAME commit (archives reject in-flight entries; the marker must never reach main). Nothing but the ledger move and marker removal is in this commit — it must match what the step-3 brief declared. This is the PR's last commit, per invariant 12.

- [ ] **Step 5: CI, merge, sync**

Push, real CI green, `gh pr merge --merge`, fast-forward main, confirm `git rev-list --left-right --count main...origin/main` reports `0  0`.

<!-- tasks: end -->

## Execution evidence

Appended by the implementation session as each named step completes, and COMMITTED IN THAT TASK'S OWN COMMIT — every task whose step records evidence here stages this plan file alongside its code (plan review R3 finding 2; batching the evidence into Task 7 would violate commit-per-task, and leaving it unstaged puts it in the path of Task 5's `git reset --hard`, which is why Task 5 appends its evidence only AFTER the reset completes). A step that names this section is not done until its transcript is here. Required rows (each a fenced transcript with the command, its output tail, and the exit code):

- Task 2 step 5: check-mode both-ways probe (exit 0 fresh, exit 1 stale).

```text
$ pnpm gen:execution-methods && cat tests/db/__generated__/postgresExecutionMethods.ts
// @generated by scripts/generate-execution-methods.ts; do not edit. Regenerate: pnpm gen:execution-methods
// Source: node_modules/postgres/types/index.d.ts (postgres 3.4.9).
export const POSTGRES_TYPES_VERSION = "3.4.9";
export const POSTGRES_EXECUTION_CORE: readonly string[] = ["file","listen","notify","unsafe"];
export const POSTGRES_PARAMETER_MEMBERS: readonly string[] = ["array","json"];

$ pnpm vitest run tests/db/executionMethodsManifest.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ pnpm gen:execution-methods --check; echo "exit=$?"
exit=0

$ echo "// stale" >> tests/db/__generated__/postgresExecutionMethods.ts
$ pnpm gen:execution-methods --check; echo "exit=$?"
tests/db/__generated__/postgresExecutionMethods.ts is stale; run pnpm gen:execution-methods
 ELIFECYCLE  Command failed with exit code 1.
exit=1

$ pnpm gen:execution-methods
$ pnpm gen:execution-methods --check; echo "exit=$?"
exit=0
```

AC-1 satisfied: version 3.4.9, core exactly the four-member sorted list, parameterMembers exactly the two-member sorted list, `--check` 0 on a fresh tree and 1 on a stale one.

- Task 5 step 2: hand-edit probe (exit 0 with the regeneration explanation).

```text
$ printf '\n// hand-edit mutant\n' >> tests/db/__generated__/postgresExecutionMethods.ts
$ pnpm gen:execution-methods
$ git diff --exit-code tests/db/__generated__/postgresExecutionMethods.ts; echo "exit=$?"
exit=0
$ git status --short
 M .github/workflows/x-audits.yml
```

Exit 0 is the correct expectation for THIS input: `pnpm gen:execution-methods` regenerates over the working-tree hand-edit, so the tree matches HEAD again and the gate passes. Regeneration repairs a hand-edit; the diff artifact captures nothing. The gate's real failing input is a stale COMMIT, below.

- Task 5 step 4: stale-commit mutant probe (exit 1) — the AC-7 mutant-red evidence.

```text
$ sed -i '' 's/"unsafe"/"unsafe-mutant"/' tests/db/__generated__/postgresExecutionMethods.ts
$ git add tests/db/__generated__/postgresExecutionMethods.ts && git commit --no-verify -m "tmp: gate mutant (revert immediately)"
$ pnpm gen:execution-methods
$ git diff --exit-code tests/db/__generated__/postgresExecutionMethods.ts; echo "exit=$?"
diff --git a/tests/db/__generated__/postgresExecutionMethods.ts b/tests/db/__generated__/postgresExecutionMethods.ts
-export const POSTGRES_EXECUTION_CORE: readonly string[] = ["file","listen","notify","unsafe-mutant"];
+export const POSTGRES_EXECUTION_CORE: readonly string[] = ["file","listen","notify","unsafe"];
exit=1
$ git reset --hard HEAD^
$ git status --short
$ pnpm gen:execution-methods --check; echo "check-exit=$?"
check-exit=0
```

AC-7 satisfied: the gate is red on exactly the silent-merge shape from spec review R1 finding 1 (a committed module that no longer matches the installed driver's derivation), and green on a clean tree. `git status --short` prints nothing after the reset, so the mutant commit left no residue.

A second, related gate hazard was found and fixed during Task 2 rather than by probe design: the pre-commit lint-staged prettier pass reflowed the generated module's array literals, which would have made BOTH `--check` and this CI step permanently red. `tests/db/__generated__/` now sits in `.prettierignore` alongside the repo's other raw-emitted generated TS, and the `--check` probe was re-run through a real commit to confirm the bytes survive it.

- Task 6 step 5: measured mutation score, survivor dispositions, run duration.
- Task 7 step 1: AC-6 red observation (exit 1), clean pass (exit 0), and the node_modules sweep with per-hit dispositions.

**The marker command as authored is not executable, and the gate was replaced rather than reported green.** Task 7's `red=` uses `rg`, which on this machine is a shell FUNCTION injected by the Claude Code session snapshot, not a binary. Under `bash -c` it is absent, `rg` exits 127, and the leading `!` inverts that to 0 — so the command passed on a tree carrying the constructed defect AND on the clean tree, proving nothing in either direction. This is exactly the premise-reachability failure the anti-tautology rule exists to catch, found by running the red first:

```text
$ printf '// probe: node_modules/postgres/types/index.d.ts\n' > tests/db/ac6-probe.test.ts
$ bash -c '! rg -n "types/index.d.ts" tests/ --glob "!tests/db/__generated__/**"'; echo "probe-exit=$?"
bash: line 1: rg: command not found
probe-exit=0        # <-- vacuous pass WITH the defect present
$ type -a rg
rg is a shell function from /Users/ericweiss/.claude-account3/shell-snapshots/snapshot-zsh-...sh
```

The sweep is therefore run with `grep -rn`, which is present in any shell the repo's gates can run in. Same intent, correct polarity, observed both ways:

```text
$ printf '// probe: node_modules/postgres/types/index.d.ts\n' > tests/db/ac6-probe.test.ts
$ bash -c '! grep -rn "types/index.d.ts" tests/ --exclude-dir=__generated__'; echo "probe-exit=$?"
tests/db/ac6-probe.test.ts:1:// probe: node_modules/postgres/types/index.d.ts
probe-exit=1        # <-- red on the constructed defect
$ rm tests/db/ac6-probe.test.ts
$ bash -c '! grep -rn "types/index.d.ts" tests/ --exclude-dir=__generated__'; echo "clean-exit=$?"
clean-exit=0        # <-- the SAME command, green on the clean tree

$ grep -rn "node_modules/postgres" tests/; echo "sweep-exit=$?"
tests/db/executionMethodsManifest.test.ts:15:const DRIVER_PACKAGE_JSON = "node_modules/postgres/package.json";
tests/db/__generated__/postgresExecutionMethods.ts:2:// Source: node_modules/postgres/types/index.d.ts (postgres 3.4.9).
sweep-exit=0
```

Per-hit disposition of the node_modules sweep, both hits accounted for:

- `tests/db/executionMethodsManifest.test.ts:15` — the version sentinel's `package.json` read. This is the ONE test-time read under node_modules that AC-6 permits, and it reads a JSON version field, never type-declaration text.
- `tests/db/__generated__/postgresExecutionMethods.ts:2` — a provenance COMMENT in generated output, not a read. No suite parses the driver types file, which is the AC-6 claim.

AC-6 satisfied: no vitest suite reads or parses the driver's type declarations.


## 12 Closeout

impeccable-gate: N/A — no UI surface

This plan touches only tests/, scripts/, package.json, one workflow file, and ledger docs — no file under app/ or components/, no globals.css token, no DESIGN.md change (invariant 8 definition of UI surface).

## Self-review notes (writing-plans checklist, run at authoring time)

- Spec coverage: AC-1 → Task 2; AC-2 → Task 3; AC-3 → Tasks 1-3; AC-4 → Task 4; AC-5 → Task 6; AC-6 → Task 7; AC-7 → Task 5. §2.1 → Task 1; §2.2 → Tasks 2, 4, 5; §2.3 → Task 3; §2.4 → Tasks 2-3; §2.5 → Tasks 1, 3; §5 → Task 6; §4 census → context only (no code); §1.1 fences → Global Constraints.
- Type consistency: `deriveExecutionMethods`, `ExecutionMethodDerivation`, `POSTGRES_EXECUTION_CORE`, `POSTGRES_PARAMETER_MEMBERS`, `POSTGRES_TYPES_VERSION`, `EXECUTION_METHODS`, `CLIENT_CAPABILITY_METHODS` are spelled identically across Tasks 1-6 and match spec §2.
- RED validity: every authored red names its production surface via `red-target=`; Task 5 and Task 7 carry command-oracle reds with their observation procedure inline; no red derives from a test-local fixture alone.
- Snippet typecheck: snippets use guarded index access and explicit types; `member.name` narrowing via `ts.isIdentifier` is the one subtle point and is noted inline in Task 1.
