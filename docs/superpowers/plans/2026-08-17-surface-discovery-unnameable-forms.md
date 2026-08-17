# Surface Discovery — Unnameable Action Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the shared invariant-10 discovery engine total — every Server-Action construct in
the walked corpus becomes a keyed unit or a named refusal, never a dark surface.

**Architecture:** widen `collectSurfaceUnits` to the two derived domains (D1 exported value names
of `"use server"` modules via a closed resolver; D2 directive-prologue function-likes via
`ts.isFunctionLike`), add an engine-owned per-kind reconciliation (`discoveryGaps`) that refuses
the residue by name, wire the invariant-10 meta-test to it, migrate the origin sweep's private
tripwire onto the shared exports, and enrol the engine in the source-mutation registry.

**Tech Stack:** TypeScript compiler API (`import ts from "typescript"`), Vitest, the
source-mutation harness (`pnpm mutation:guards`).

**Spec:** `docs/superpowers/specs/2026-08-17-surface-discovery-unnameable-forms-design.md` —
argue every disputed point from it; §1.1 lists what is ratified.

## Global Constraints

- Invariant 1 (TDD per task), invariant 6 (conventional commits — `fix(log)` / `test(log)` /
  `test(auth)` / `infra:` as fits), invariant 11 (this worktree only), invariant 12 (ledger marker
  already on branch).
- Scoped vitest runs (explicit file list) stay UNWRAPPED; any full-suite run goes through
  `pnpm heavy <cmd>`. `pnpm mutation:guards` is heavy-wrapped and runs FOREGROUND (lessons file:
  backgrounded-across-turn runs get SIGTERM-killed).
- No UI surface, no DB surface, no advisory-lock surface, no user-visible copy (all diagnostics
  are test-failure messages).
- Suite must be green at every commit — engine-widening tasks flip the origin-test fixtures they
  un-escape IN THE SAME COMMIT (the `premiseHolds` guards there red the moment discovery starts
  succeeding; that is their design).
- Consumer suites to run per task (scoped, unwrapped):
  `pnpm vitest run tests/log/mutationSurface/enumerate.test.ts tests/log/_metaMutationSurfaceObservability.test.ts tests/log/adminOutcomeBehavior.test.ts tests/log/_auditableMutations.shape.test.ts tests/auth/_metaServerActionOriginGate.test.ts`
  then `pnpm typecheck`.

## Meta-test inventory (mandatory declaration)

- **Extends** `tests/log/_metaMutationSurfaceObservability.test.ts` — gains the live totality
  assertion (spec AC-3, §3.6).
- **Extends** `tests/auth/_metaServerActionOriginGate.test.ts` — private totality helpers deleted
  in favor of shared engine exports; ESCAPES fixtures re-dispositioned per spec §3.6.
- **Extends** `tests/mutation/source/registry.ts` (`GUARD_SURFACES`) — new enrolment row; shard
  membership derives automatically via `surfacesForShard` (`tests/mutation/guardSurfaces.shard0.test.ts:14`).
- **Creates** tests/log/mutationSurface/totality.test.ts — the reconciliation's own contract
  suite.
- Registries NOT touched: `_metaInfraContract` (no Supabase calls), `advisoryLockRpcDeadlock`
  (no locks), `_metaAdminAlertCatalog`, sentinel-hiding, email-normalization — none applies: the
  diff is pure static-analysis test infrastructure.

## Mutation-family closure (for the enrolment task and all diff reviews)

Operator set for the enrolled engine, from `OPERATOR_NAMES`
(`tests/mutation/source/operators.ts:17`): `equality-flip`, `logical-connector`,
`statement-removal`. Rationale: the engine's defect class is "reports units/gaps while the truth
moved" — dropped statements (a skipped export form), flipped predicates (kind checks, directive
comparison), and connector flips (the per-kind filters) are exactly that class;
`relational-boundary`/`integer-literal` have almost no sites here (no numeric thresholds), and
`regex-quantifier-bound` touches only `SHOUTY`. Wall-clock is measured at enrolment (Task 5) and
the operator set narrows by budget ONLY with the numbers recorded in the registry row comment,
premiseScan-style (`tests/mutation/source/registry.ts:151-166`). A reviewer-proposed NEW family is
admissible only with a live escaping mutant demonstrated against the shipped guard.

## File map

- Modify `tests/log/mutationSurface/enumerate.ts` — D2 widening (Task 1), D1 resolver (Task 2).
- Create tests/log/mutationSurface/totality.ts — `inlineDirectiveBearingCount`,
  `discoveryGaps` (Task 3). Separate module so the enrolment can score `enumerate.ts` and
  totality.ts as two registry rows; both are engine. `exportedValueNames` lives in
  `enumerate.ts` (Task 2 needs it for collection) and totality.ts imports it from there —
  one-directional, no import cycle.
- Create tests/log/mutationSurface/totality.test.ts (Task 3).
- Modify `tests/log/mutationSurface/enumerate.test.ts` — new discovery cases (Tasks 1–2).
- Modify `tests/log/_metaMutationSurfaceObservability.test.ts` — live totality assertion (Task 3).
- Modify `tests/auth/_metaServerActionOriginGate.test.ts` — fixture flips (Tasks 1–2), helper
  migration + refusal-pin rewrite (Task 4).
- Modify `tests/mutation/source/registry.ts` — enrolment rows (Task 5).

## Interfaces produced (consumed by later tasks and by the consumer suites)

```ts
// tests/log/mutationSurface/enumerate.ts (existing exports unchanged in name/shape)
export function collectSurfaceUnits(roots: string[]): SurfaceUnit[]; // wider behavior, same type
export function exportedValueNames(sf: ts.SourceFile): string[]; // added by Task 2
// tests/log/mutationSurface/totality.ts (new)
export function inlineDirectiveBearingCount(sf: ts.SourceFile): number;
export function discoveryGaps(roots: string[], units: readonly SurfaceUnit[]): string[];
```

<!-- tasks: depth=3 red-contract -->

### Task 1: D2 widening — every directive-bearing function-like, in every file

<!-- task: red=`pnpm vitest run tests/log/mutationSurface/enumerate.test.ts` red-state=authored red-target=`tests/log/mutationSurface/enumerate.ts:310` why=`collectInlineActions restricts to FunctionDeclaration|FunctionExpression|ArrowFunction so methods and accessors are never visited, and collectFileSurfaceUnits returns early for "use server" modules so nested inline actions are never collected` ac=AC-1,AC-4 -->

**What is red and why:** the new cases fail because
`tests/log/mutationSurface/enumerate.ts:310` names three function kinds (a method
declaration is skipped) and `tests/log/mutationSurface/enumerate.ts:337-344` returns module actions without
running inline collection.

**Files:** Modify `tests/log/mutationSurface/enumerate.ts`,
`tests/log/mutationSurface/enumerate.test.ts`, `tests/auth/_metaServerActionOriginGate.test.ts`
(ESCAPES rows 4, 7, 9 → positive pins).

- [ ] **Step 1 (RED).** Add to `enumerate.test.ts`, in a new
  `describe("collectSurfaceUnits - D2 total inline collection")`:

```ts
test("inline object method carrying the directive -> inline-action unit `doIt` (spec §3.6 row 4)", () => {
  const units = unitsFor(
    "components/x/G.tsx",
    'export function G() {\n  const a = { async doIt() { "use server"; await db.from("t").delete(); } };\n  return a;\n}\n',
  );
  expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
  // anti-tautology: the resolved node is live for instrumentation - scanBody
  // sees the fixture's write builder through the SAME node the unit carries.
  expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
});

test("static class method carrying the directive -> inline-action unit `doIt` (spec §3.6 row 9)", () => {
  const units = unitsFor(
    "components/x/I.tsx",
    'export class I {\n  static async doIt() { "use server"; await db.from("t").delete(); }\n}\n',
  );
  expect(units.map((u) => [u.fn, u.kind])).toEqual([["doIt", "inline-action"]]);
  expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
});

test('inline action nested inside a file-level "use server" module -> BOTH units (spec §3.6 row 7)', () => {
  const units = unitsFor(
    "lib/x/e.ts",
    '"use server";\nexport async function outer() {\n  const nested = async () => { "use server"; await db.from("t").delete(); };\n  return nested;\n}\n',
  );
  expect(units.map((u) => [u.fn, u.kind]).sort()).toEqual([
    ["nested", "inline-action"],
    ["outer", "module-action"],
  ]);
  // liveness on BOTH nodes: a correct key on the wrong node is the unpinned failure mode.
  const nested = units.find((u) => u.fn === "nested")!;
  expect(scanBody(nested.node, { descend: false }).writeBuilder).toBe(true);
});

test("a module-exported action whose body ALSO carries the directive is ONE unit, not two (dedupe by node identity)", () => {
  const units = unitsFor(
    "lib/x/dd.ts",
    '"use server";\nexport const mutate = async () => { "use server"; await db.from("t").delete(); };\n',
  );
  expect(units.map((u) => [u.fn, u.kind])).toEqual([["mutate", "module-action"]]);
  expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
});
```

  (`unitsFor`/`makeFixture` already exist in that file — `tests/log/_metaMutationSurfaceObservability.test.ts:45`
  has the same helpers; `enumerate.test.ts` defines its own local pair. Import `scanBody` if the
  file does not already.) The concrete failure modes caught: a kind-enumeration regression drops
  methods silently; an early-return regression re-darkens nested actions; a dedupe regression
  double-keys one body.
- [ ] **Step 2.** Run the suite — the four cases fail (first three: 0 or 1 unit where 1–2
  expected; fourth may pass pre-change only if the early return also swallows it — record which).
- [ ] **Step 3 (GREEN).** In `enumerate.ts`:

```ts
function collectInlineActions(sf: ts.SourceFile): { fn: string; node: ts.Node }[] {
  const out: { fn: string; node: ts.Node }[] = [];
  const visit = (n: ts.Node) => {
    // `isFunctionLike` is the TOTAL predicate (mirrors the origin tripwire's
    // counter): signature-only kinds have no body and fall out of the
    // directive check, so the cast is safe rather than a widening.
    if (ts.isFunctionLike(n) && functionBodyHasUseServer(n as ts.FunctionLikeDeclaration)) {
      const fn = inlineName(n);
      if (fn) out.push({ fn, node: n });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
```

  `inlineName` gains one branch, before the parent checks:

```ts
  if (
    (ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  )
    return node.name.text;
```

  `collectFileSurfaceUnits` loses the early return; module units claim their nodes first:

```ts
function collectFileSurfaceUnits(sf: ts.SourceFile, file: string): SurfaceUnit[] {
  if (basename(file) === "route.ts") {
    return routeMutatingMethods(sf).map((fn) => ({
      file, fn, kind: "route" as const, node: sf, admin: isAdminRoutePath(file),
    }));
  }
  const units: SurfaceUnit[] = [];
  const taken = new Set<ts.Node>();
  if (moduleHasUseServer(sf))
    for (const { fn, node } of collectModuleActions(sf)) {
      taken.add(node);
      units.push({ file, fn, kind: "module-action", node, admin: scanBody(node, { descend: false }).adminGated });
    }
  for (const { fn, node } of collectInlineActions(sf)) {
    if (taken.has(node)) continue;
    units.push({ file, fn, kind: "inline-action", node, admin: scanBody(node, { descend: false }).adminGated });
  }
  return units;
}
```

- [ ] **Step 4 (fixture flips, same commit).** In the origin test's `ESCAPES` array, rows now
  discovered — "R1: inline action as an object method", 'R2: inline action NESTED inside a
  file-level "use server" module', "R2: static class method carrying the directive" — move out of
  `ESCAPES` into a new `DISCOVERED_FORMS` table in the same describe, each asserting: the exact
  units (fn/kind pairs, as in Step 1), AND `scanBody(unit.node, { descend: false }).writeBuilder`
  true for every positive pin (each fixture carries a write builder; a correct key attached to
  the wrong node must fail), AND `undiscoverableConstructs` quiet on the fixture. Keep
  each row's source string byte-identical to its `ESCAPES` original so the pin's subject does not
  drift. The `premiseHolds` guard is REPLACED by the positive assertion (the premise's own text
  says so: "if it now discovers all N, this fixture no longer exercises the tripwire").
- [ ] **Step 5.** Run the five consumer suites (Global Constraints) + `pnpm typecheck`. All green.
- [ ] **Step 6.** Commit `fix(log): collect every directive-bearing function-like in every file (invariant-10 D2 totality)`.

### Task 2: D1 resolver — every exported value name of a "use server" module

<!-- task: red=`pnpm vitest run tests/log/mutationSurface/enumerate.test.ts` red-state=authored red-target=`tests/log/mutationSurface/enumerate.ts:264` why=`collectModuleActions accepts only identifier bindings whose initializer is literally an arrow/function expression — a paren-wrapped initializer, an alias chain, and both binding-pattern export forms produce no unit` ac=AC-1,AC-4 -->

**What is red and why:** `tests/log/mutationSurface/enumerate.ts:264-268` requires
`ts.isIdentifier(d.name)` and a bare arrow/function initializer;
`tests/log/mutationSurface/enumerate.ts:224-238` (`findLocalDeclNode`) has the same restriction
for export lists. Paren-wrapped, aliased, and binding-pattern exports all yield zero units.

**Files:** Modify `tests/log/mutationSurface/enumerate.ts`,
`tests/log/mutationSurface/enumerate.test.ts`, `tests/auth/_metaServerActionOriginGate.test.ts`
(ESCAPES rows 1, 2, 5, 6 → `DISCOVERED_FORMS`).

- [ ] **Step 1 (RED).** Add to `enumerate.test.ts`, new
  `describe("collectSurfaceUnits - D1 closed resolver")` — one case per spec §3.6 row, fixture
  sources byte-identical to the `ESCAPES` originals:

```ts
const D1_CASES: ReadonlyArray<{ label: string; rel: string; src: string; fn: string }> = [
  {
    label: "row 1: paren-wrapped module export",
    rel: "lib/x/a.ts",
    src: '"use server";\nexport const wrapped = (async () => { await db.from("t").delete(); });\n',
    fn: "wrapped",
  },
  {
    label: "row 2: export aliased through an intermediate binding",
    rel: "lib/x/b.ts",
    src: '"use server";\nconst impl = async () => { await db.from("t").delete(); };\nconst alias = impl;\nexport { alias as doIt };\n',
    fn: "doIt",
  },
  {
    label: "row 5: OBJECT binding-pattern export",
    rel: "lib/x/c.ts",
    src: '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { doIt } = bag;\n',
    fn: "doIt",
  },
  {
    label: "row 6: ARRAY binding-pattern export",
    rel: "lib/x/d.ts",
    src: '"use server";\nconst arr = [async () => { await db.from("t").delete(); }];\nexport const [doIt] = arr;\n',
    fn: "doIt",
  },
];

test.each(D1_CASES.map((c) => [c.label, c] as const))("%s resolves to a module-action unit", (_l, c) => {
  const units = unitsFor(c.rel, c.src);
  expect(units.map((u) => [u.fn, u.kind])).toEqual([[c.fn, "module-action"]]);
  expect(scanBody(units[0]!.node, { descend: false }).writeBuilder).toBe(true);
});

test("unresolvable initializer (higher-order call) yields NO unit - the refusal is Task 3's job", () => {
  const units = unitsFor("lib/x/hof.ts", '"use server";\nexport const x = withFoo(async () => {});\n');
  expect(units).toEqual([]);
});

test("COMPUTED binding property refuses even when it names a literal member (plan review R1 F3)", () => {
  const units = unitsFor(
    "lib/x/cp.ts",
    '"use server";\nconst bag = { doIt: async () => { await db.from("t").delete(); } };\nexport const { ["doIt"]: doIt } = bag;\n',
  );
  expect(units).toEqual([]);
});

test("alias CYCLE yields no unit and does not hang", () => {
  const units = unitsFor(
    "lib/x/cy.ts",
    '"use server";\nconst a = b;\nconst b = a;\nexport { a as doIt };\nexport async function ok() { await db.from("t").delete(); }\n',
  );
  expect(units.map((u) => u.fn)).toEqual(["ok"]);
});
```

  Failure modes caught: a resolver regression silently re-darkens a form (the `scanBody`
  assertion also proves the resolved node is the REAL body, not a stub); an unbounded alias
  walk hangs collection; a resolver that "resolves" a higher-order call would fabricate a
  checkable body that is not the executing one.
- [ ] **Step 2.** Run — the four `D1_CASES` fail with `[]` observed; the two negatives pass
  already (record that: they are premise pins for Task 3's refusal side, not this task's red).
- [ ] **Step 3 (GREEN).** In `enumerate.ts`, replace `findLocalDeclNode` and the
  variable-statement branch of `collectModuleActions` with the closed resolver (spec §3.2):

```ts
const isCheckableFunction = (n: ts.Node): boolean =>
  ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) ||
  ts.isMethodDeclaration(n);

/** Unwrap parens; follow module-scope identifier alias chains (cycle-safe). */
function reduceModuleExpr(sf: ts.SourceFile, expr: ts.Expression, seen: Set<string>): ts.Node | undefined {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (!ts.isIdentifier(e)) return e;
  return resolveModuleName(sf, e.text, seen);
}

/** A module-scope name to its declaration/initializer, reduced. */
function resolveModuleName(sf: ts.SourceFile, name: string, seen: Set<string>): ts.Node | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer)
          return reduceModuleExpr(sf, d.initializer, seen);
        if (!ts.isIdentifier(d.name) && bindingBindsName(d.name, name) && d.initializer)
          return resolvePatternMember(sf, d.name, name, d.initializer, seen);
      }
  }
  return undefined;
}

/** `const { doIt } = <literal>` / `const [doIt] = <literal>` - literal member
 * access only (spec §3.2 rule 3); everything else returns undefined (refusal). */
function resolvePatternMember(
  sf: ts.SourceFile, pattern: ts.BindingName, name: string, init: ts.Expression, seen: Set<string>,
): ts.Node | undefined {
  const reduced = reduceModuleExpr(sf, init, seen);
  if (!reduced) return undefined;
  if (ts.isObjectBindingPattern(pattern) && ts.isObjectLiteralExpression(reduced)) {
    for (const el of pattern.elements) {
      if (!ts.isIdentifier(el.name) || el.name.text !== name) continue;
      if (el.initializer || el.dotDotDotToken) return undefined; // defaults/rest refuse
      // computed member names refuse (spec §3.2 rule 3) - falling back to
      // el.name.text here would let `{ ["doIt"]: doIt }` match a literal member.
      if (el.propertyName && !(ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)))
        return undefined;
      const key = el.propertyName === undefined ? el.name.text : (el.propertyName as ts.Identifier | ts.StringLiteral).text;
      for (const p of reduced.properties) {
        if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key) {
          const r = reduceModuleExpr(sf, p.initializer, seen);
          return r && isCheckableFunction(r) ? r : undefined;
        }
        if (ts.isMethodDeclaration(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key)
          return p;
        if (ts.isShorthandPropertyAssignment(p) && p.name.text === key)
          return resolveModuleName(sf, key, seen);
      }
      return undefined;
    }
  }
  if (ts.isArrayBindingPattern(pattern) && ts.isArrayLiteralExpression(reduced)) {
    for (let i = 0; i < pattern.elements.length; i++) {
      const el = pattern.elements[i];
      if (!el || ts.isOmittedExpression(el)) continue;
      if (!ts.isIdentifier(el.name) || el.name.text !== name) continue;
      if (el.initializer || el.dotDotDotToken) return undefined;
      const item = reduced.elements[i];
      if (!item || ts.isOmittedExpression(item) || ts.isSpreadElement(item)) return undefined;
      const r = reduceModuleExpr(sf, item, seen);
      return r && isCheckableFunction(r) ? r : undefined;
    }
  }
  return undefined;
}
```

  `collectModuleActions` becomes: for every exported name from the total reader — copy the
  origin test's `exportedValueNames` + `collectBindingNames` VERBATIM into `enumerate.ts` and
  EXPORT `exportedValueNames` (they are already total; Task 4 deletes the origin-test originals) —, `const node =
  resolveModuleName(sf, localNameFor(exportedName), new Set())` where `localNameFor` is the
  export-list `propertyName ?? name` mapping and the export-modified declaration's own name
  otherwise; `add(exportedName, node)` only when `node && isCheckableFunction(node)`. Default
  exports stay excluded (`moduleDefaultExports` untouched).
- [ ] **Step 4 (fixture flips, same commit).** Origin test rows 1, 2, 5, 6 move from `ESCAPES`
  to `DISCOVERED_FORMS` exactly as Task 1 Step 4 (byte-identical sources; positive unit pins;
  tripwire-quiet assertion).
- [ ] **Step 5.** Five consumer suites + `pnpm typecheck` green.
- [ ] **Step 6.** Commit `fix(log): resolve every exported value name of a use-server module through the closed reducer (invariant-10 D1 totality)`.

### Task 3: totality.ts — per-kind reconciliation, refusals by name, observability parity

<!-- task: red=`pnpm vitest run tests/log/mutationSurface/totality.test.ts` red-state=authored red-target=`tests/log/mutationSurface/totality.ts` why=`the module does not exist: the engine exports no reconciliation, so a refusal-class construct produces zero units and zero signals — the invariant-10 dark-surface hole` ac=AC-2,AC-3,AC-6,AC-7 -->

**What is red and why:** tests/log/mutationSurface/totality.ts is absent — there is no
`discoveryGaps` anywhere in the engine; the only reconciliation lives as private helpers of the
origin test and pools unit kinds (the spec-review R1 defect, spec §3.4).

**Files:** Create tests/log/mutationSurface/totality.ts,
tests/log/mutationSurface/totality.test.ts; modify
`tests/log/_metaMutationSurfaceObservability.test.ts` (live assertion + formatted remediation).

- [ ] **Step 1 (RED).** Create totality.test.ts:

```ts
import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectSurfaceUnits } from "./enumerate";
import { discoveryGaps } from "./totality";

function makeFixture(relPath: string, contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "totality-"));
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  return root;
}
const gapsFor = (rel: string, src: string): string[] => {
  const root = makeFixture(rel, src);
  return discoveryGaps([root], collectSurfaceUnits([root]));
};

describe("discoveryGaps - the fail-closed residue (spec §3.4)", () => {
  test("anonymous JSX action -> D2 refusal naming the file and the rewrite (spec §3.6 row 3)", () => {
    const gaps = gapsFor(
      "components/x/F.tsx",
      'export function F() {\n  return <form action={async () => { "use server"; await db.from("t").delete(); }} />;\n}\n',
    );
    expect(gaps).toHaveLength(1);
    // END-ANCHORED so the appended-suffix mutant dies (four-mutant discipline,
    // docs/agents/writing-plans.md; plan review R1 F4). The path prefix is the
    // tmpdir fixture root, hence the leading wildcard.
    expect(gaps[0]).toMatch(
      /^.*components\/x\/F\.tsx: holds 1 function-scoped "use server" bodies but discovery accounted for 0 - bind each action to a named const or named function; anonymous actions cannot be keyed$/,
    );
  });

  test("anonymous action behind a directive PROLOGUE -> D2 refusal (spec §3.6 row 8)", () => {
    const gaps = gapsFor(
      "components/x/H.tsx",
      'export function H() {\n  return <form action={async () => { "use strict"; "use server"; await db.from("t").delete(); }} />;\n}\n',
    );
    expect(gaps).toHaveLength(1);
  });

  test("unresolvable D1 export -> refusal naming the export (spec §7 higher-order limit)", () => {
    const gaps = gapsFor("lib/x/hof.ts", '"use server";\nexport const x = withFoo(async () => {});\n');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /^.*lib\/x\/hof\.ts: "use server" module export `x` produced no module-action unit - bind `x` directly to an async function declaration or arrow; discovery cannot statically locate the body behind this initializer$/,
    );
  });

  test("CROSS-DOMAIN COLLISION: unresolvable D1 export sharing a D2 inline unit's name still REFUSES (AC-7, spec-review R1)", () => {
    const gaps = gapsFor(
      "lib/x/e.ts",
      '"use server";\nexport const nested = withFoo(async () => {});\n' +
        'export async function outer() {\n  const nested = async () => { "use server"; await db.from("t").delete(); };\n  return nested;\n}\n',
    );
    // per-kind: the inline unit `nested` must NOT satisfy the module-side name.
    expect(gaps.some((g) => g.includes("nested") && g.includes("lib/x/e.ts"))).toBe(true);
  });

  test("duplicate file+fn key refuses by name (AC-6)", () => {
    const gaps = gapsFor(
      "lib/x/dup.ts",
      'export function A() {\n  const doIt = async () => { "use server"; };\n  return doIt;\n}\n' +
        'export function B() {\n  const doIt = async () => { "use server"; };\n  return doIt;\n}\n',
    );
    expect(
      gaps.some((g) =>
        /^.*lib\/x\/dup\.ts: 2 units share the key `doIt` - rename so every unit has a unique file\+fn key; registries cannot address two surfaces with one key$/.test(g),
      ),
    ).toBe(true);
  });

  test("a fully discoverable module is QUIET (negative half)", () => {
    expect(
      gapsFor("lib/x/ok.ts", '"use server";\nexport async function mutate() { await db.from("t").delete(); }\n'),
    ).toEqual([]);
  });

  test("route files are exempt from the reconciliation (routes are D-neither)", () => {
    expect(gapsFor("app/api/x/route.ts", "export async function POST(){}\n")).toEqual([]);
  });
});
```

  Failure modes caught: a pooled-kind reconciliation passes the collision case (the R1 probe,
  now a permanent pin); a refusal message that stops naming file/export/rewrite - OR grows a suffix - fails the
  END-ANCHORED content assertions (four pre-dispatch string-mutants run at implementation time per
  `docs/agents/writing-plans.md` — record all four in the Task 3 commit message: emptied
  message, suffixed message, message present but on the wrong branch, each discriminating
  parameter varied); a reconciliation that fires on ordinary code fails the negative half.
- [ ] **Step 2.** Run — every case fails: the `./totality` import does not resolve because the
  production module is absent (the declared red-target).
- [ ] **Step 3 (GREEN).** Create totality.ts — move the origin test's
  `inlineDirectiveBearingCount` VERBATIM (it is already total; that is the point), import
  `exportedValueNames` from `./enumerate` (exported there by Task 2), plus:

```ts
import { basename } from "node:path";
import ts from "typescript";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { exportedValueNames, moduleHasUseServer, parse, type SurfaceUnit } from "./enumerate";

/** Every construct discovery could not turn into a unit - one message per
 * offender, empty when discovery was total. PER-KIND (spec §3.4): D1 names
 * reconcile against module-action units only; D2 counts against inline-action
 * units plus module-action units whose resolved node is a directive-bearing
 * body; a pooled projection lets an inline unit mask an unresolved export
 * (spec review R1). */
export function discoveryGaps(roots: string[], units: readonly SurfaceUnit[]): string[] {
  const problems: string[] = [];
  const byFile = new Map<string, SurfaceUnit[]>();
  for (const u of units) byFile.set(u.file, [...(byFile.get(u.file) ?? []), u]);

  for (const file of walkSourceFiles(roots).filter(
    (f) => !f.includes("/node_modules/") && !f.includes("/.next/") && !f.includes("/.git/"),
  )) {
    if (basename(file) === "route.ts") continue;
    const sf = parse(file);
    const found = byFile.get(file) ?? [];
    const moduleUnits = found.filter((u) => u.kind === "module-action");
    const inlineUnits = found.filter((u) => u.kind === "inline-action");

    if (moduleHasUseServer(sf)) {
      const discovered = new Set(moduleUnits.map((u) => u.fn));
      for (const name of exportedValueNames(sf))
        if (!discovered.has(name))
          problems.push(
            `${file}: "use server" module export \`${name}\` produced no module-action unit - ` +
              `bind \`${name}\` directly to an async function declaration or arrow; discovery ` +
              `cannot statically locate the body behind this initializer`,
          );
    }

    const directiveBodies = inlineDirectiveBearingCount(sf);
    const moduleDirectiveBodies = moduleUnits.filter(
      (u) => bodyHasDirective(u.node),
    ).length;
    const accounted = inlineUnits.length + moduleDirectiveBodies;
    if (directiveBodies > accounted)
      problems.push(
        `${file}: holds ${directiveBodies} function-scoped "use server" bodies but discovery ` +
          `accounted for ${accounted} - bind each action to a named const or named function; ` +
          `anonymous actions cannot be keyed`,
      );

    const seen = new Map<string, number>();
    for (const u of found) seen.set(u.fn, (seen.get(u.fn) ?? 0) + 1);
    for (const [fn, n] of seen)
      if (n > 1)
        problems.push(
          `${file}: ${n} units share the key \`${fn}\` - rename so every unit has a unique ` +
            `file+fn key; registries cannot address two surfaces with one key`,
        );
  }
  return problems;
}
```

  `bodyHasDirective` is a small local: the unit node's block body's leading string-literal run
  contains `"use server"` (reuse `functionBodyHasUseServer` from `./enumerate` when the node is
  function-like; a `SourceFile` node — route units — never reaches here). No duplicate helper
  copy survives across the engine after Task 4 deletes the origin-test originals (spec §1.1.4).
- [ ] **Step 4.** totality.test.ts green; five consumer suites green.
- [ ] **Step 5 (observability parity — spec AC-3).** In
  `_metaMutationSurfaceObservability.test.ts`, add to the live-discovery describe
  (`tests/log/_metaMutationSurfaceObservability.test.ts:675`):

```ts
test("discovery is TOTAL over the live tree, or this meta-test fails by name (invariant-10 parity)", () => {
  const units = collectSurfaceUnits(["app", "lib", "components"]);
  const gaps = discoveryGaps(["app", "lib", "components"], units);
  expect(gaps, gaps.join("\n")).toEqual([]);
});
```

  **Planted-mutant proof (record the transcript in the commit message):** create
  lib/__mutant__/dark.tsx containing the anonymous-JSX fixture source, run the observability
  suite, observe THIS test red naming lib/__mutant__/dark.tsx, delete the file, observe green.
  This is the gate-fires proof the origin arc ran per-repair; a wiring that never reds is the
  vacuous-guard shape `docs/agents/writing-plans.md` bans.
- [ ] **Step 6.** Commit
  `fix(log): engine-owned per-kind discoveryGaps closes the invariant-10 dark-surface hole`.

### Task 4: origin-test migration onto the shared totality exports

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`tests/auth/_metaServerActionOriginGate.test.ts:592` why=`the private undiscoverableConstructs pools unit kinds (found.map over all units), so the cross-domain collision fixture passes against it while the shared per-kind discoveryGaps refuses — the two tripwires disagree until the private copy dies` ac=AC-2,AC-7 -->

**What is red and why:** adding the AC-7 collision fixture to the origin test's fixture
self-tests fails against the PRIVATE tripwire — `tests/auth/_metaServerActionOriginGate.test.ts:607`
projects `found.map((u) => u.fn)` across all kinds, so the collision yields zero problems there
(the spec-review R1 probe output: `unresolvedD1ByModuleProvenance: ["nested"]`,
`D1MissedByAllUnitNames: []`).

**Files:** Modify `tests/auth/_metaServerActionOriginGate.test.ts` only.

- [ ] **Step 1 (RED).** Add to the fixture self-tests a collision case using the Task 3 AC-7
  source, asserting `problemsFor` (which still calls the private helper) reports the `nested`
  export. Run: FAILS — the private pooled projection returns `[]` for it.
- [ ] **Step 2 (GREEN).** Delete the private `exportedValueNames`, `collectBindingNames`,
  `inlineDirectiveBearingCount`, and `undiscoverableConstructs`; import `discoveryGaps` from
  `@/tests/log/mutationSurface/totality` (match the file's existing import style for
  cross-tree test imports — relative if that is the convention: `../log/mutationSurface/totality`).
  `problemsFor`, the live totality test, and every `DISCOVERED_FORMS`/`ESCAPES` assertion call
  the shared export. Rewrite the two remaining `ESCAPES` rows (3 and 8 — the anonymous forms)
  as refusal pins: premise (`premiseHolds`, executed unconditionally — not inside a `.each`
  callback whose case list could empty) asserting discovery still yields `< actions` units, then
  assert the refusal message names the file. `walkedFiles` disappears with the private helper
  (the shared `discoveryGaps` owns the walk).
- [ ] **Step 3.** Five consumer suites + `pnpm typecheck` green. Grep proves single-sourcing:
  `rg -n "undiscoverableConstructs|inlineDirectiveBearingCount|exportedValueNames" tests/auth/` →
  only import references remain.
- [ ] **Step 4.** Commit `test(auth): origin sweep consumes the shared per-kind totality engine`.

### Task 5: registry enrolment + score

<!-- task: red=`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts tests/mutation/source/generate.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:151` why=`GUARD_SURFACES has no row for the discovery engine, so nothing validates or scores it; the RED is observed by adding the draft rows with a deliberately absent control.from - the registry-validation suite's "must validate" case fails naming the row (validateSurface checks control.from occurrence in sourcePath) - and the SAME command passes once the control anchors a real unique source literal` ac=AC-5 -->

**What is red and why:** no row in `GUARD_SURFACES`
(`tests/mutation/source/registry.ts:151`) names `tests/log/mutationSurface/enumerate.ts` or
totality.ts. The RED runs on `tests/mutation/_metaGuardSurfaceRegistry.test.ts` — the suite that
actually invokes `validateSurface` over every registry row (plan review R1 F1: the gates file
`tests/mutation/guardSurfaces.gates.test.ts` never calls it, and mutation-project files are not
collectible by a plain scoped vitest run — probed: `No test files found, exiting with code 1`).
Cycle: add the rows with `control.from` set to a string absent from the source → the
"must validate" case fails naming the row → correct the control → the same command passes.

**Files:** Modify `tests/mutation/source/registry.ts`,
`tests/mutation/source/expectedLedgerKinds.ts`.

- [ ] **Step 1 (RED).** Add two rows — ids `mutationSurfaceEnumerate`
  (`sourcePath: "tests/log/mutationSurface/enumerate.ts"`) and `mutationSurfaceTotality`
  (sourcePath tests/log/mutationSurface/totality.ts) — operators per the Mutation-family closure
  section above, `scoreFloor: 0.9` initial (raise only with measured numbers),
  `suitePaths: ["tests/log/mutationSurface/enumerate.test.ts", "tests/log/mutationSurface/totality.test.ts"]`
  for both rows (both suites exercise both modules), `accepted: []`. Set each `control.from` to a
  deliberately absent string first; run the marker's command; observe both rows fail
  "must validate" (control.from absent from source). This proves the rows are validated rather
  than inert.
- [ ] **Step 2 (GREEN).** Real controls, uniqueness verified with `grep -c -F` first,
  premiseScan-style (`tests/mutation/source/registry.ts:151-166`): enumerate —
  `from: 'c.text === "logAdminOutcome"'` to a never-matching name; totality —
  `from: 'u.kind === "module-action"'` likewise (adjust to a grep-verified unique literal if the
  implementation drifted). Add the two `EXPECTED_LEDGER_KINDS` entries in
  `tests/mutation/source/expectedLedgerKinds.ts` — `{}` for each at enrolment (`accepted: []`
  reduces to `{}`; the per-shard "holds the exact ledger-kind counts" case and the gates file's
  key-set equality both require the entry — plan review R1 F2, probed:
  `missingExpected: ["<both ids>"]` without them). Marker command green; the five consumer
  suites green; `pnpm typecheck`.
- [ ] **Step 3 (score, FOREGROUND, heavy-wrapped).**
  `FX_HEAVY_PRIORITY=1 pnpm heavy pnpm mutation:guards` — the five shipped files as-is (a
  temporary shard-clone file is NOT allowed — `_metaSourceShardIntegrity` pins shard files
  byte-for-byte). Record: score, per-operator site counts, wall-clock, and every survivor
  dispositioned as `equivalent` / `accepted-gap` rows (which then update the two
  `EXPECTED_LEDGER_KINDS` entries to match) or killed by a new test case. Unaccepted survivors
  block the diff-review dispatch (AGENTS.md convergence bullet 4).
- [ ] **Step 4.** Commit `infra: enrol the invariant-10 discovery engine in the source-mutation registry` —
  body carries the measured numbers.

<!-- tasks: end -->

## AC coverage

- AC-1 (nine families per §3.6 matrix): Tasks 1–2 (seven positive pins), Task 3 (rows 3/8
  refusal pins at engine level), Task 4 (origin-side pins).
- AC-2 (shared export, private copies deleted, both consumers assert live emptiness): Tasks 3–4.
- AC-3 (meta-test fails by name on a refusal-class fixture): Task 3 Step 5 planted-mutant proof.
- AC-4 (live tree unchanged, five suites green, no new registry/exemption rows): every task's
  Step "five consumer suites green"; the live walk is asserted unchanged by the observability
  live floor staying green with zero row edits.
- AC-5 (enrolled + scored, stated in round-1 diff brief): Task 5.
- AC-6 (duplicate keys refuse): Task 3.
- AC-7 (cross-domain collision refuses, pinned in both suites): Task 3 (engine), Task 4 (origin).

## Execution record — declared red set, EXECUTED at plan time

Per the lessons file, the plan's executable claims were RUN against the COMMITTED engine (no
implementation present): the Task 1/Task 2 fenced fixtures were spliced into a throwaway suite
(tests/log/mutationSurface/__plansplice__.test.ts, deleted after the run, never committed) and
executed with scoped vitest on 2026-08-17. Observed summary line: `Tests  7 failed | 3 passed (10)`.

- RED as declared (7): `T1a object method` and `T1b static class method` — `expected [] to deeply
  equal [ [ 'doIt', 'inline-action' ] ]`; `T1c nested inside use-server module` — `expected
  [ [ 'outer', 'module-action' ] ] to deeply equal [ [ 'nested', 'inline-action' ], …(1) ]`
  (exactly the early-return dark surface); all four `T2` D1 rows — `expected [] to deeply equal
  [ [ '<fn>', 'module-action' ] ]`.
- PASS pre-change as declared (3): the dedupe case (1 unit `mutate`, module-action — its red
  validity guards Task 1's early-return removal, without dedupe it would become 2 units); the
  higher-order negative (0 units — premise pin for Task 3's refusal side); the alias-cycle
  negative (`["ok"]`, termination pin).
- Task 3 cases: not spliced — their `./totality` import cannot resolve because the production
  module is absent, which is the declared red-target itself (an absent-production-file red, the
  valid TDD shape; splicing would observe a module-resolution error, adding nothing).
- Task 4 case: the private-helper pooled-projection defect was already demonstrated executably by
  the spec-review R1 probe against the committed helpers (`unresolvedD1ByModuleProvenance:
  ["nested"]`, `D1MissedByAllUnitNames: []` — recorded in spec §3.4).

## 12. Closeout

impeccable-gate: N/A — no UI surface

Remaining closeout (implementation session): five consumer suites + `pnpm typecheck` green;
mutation score recorded; whole-diff cross-model review (split tight-scope by default per
AGENTS.md — half A: `enumerate.ts` + `enumerate.test.ts` + totality.ts + totality.test.ts;
half B: the two meta-test files + registry); round-1 diff brief carries the
`GUARD SURFACE: ... MUTATION SCORE: <killed>/<total>` line plus "0 unaccepted survivors"; CI
green; merge; ledger marker off in the PR's last commit.
