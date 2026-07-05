# Mutation-Surface Observability (Invariant #10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plan-wide invariant #10 "every mutation surface is observable," enforced by a static AST discovery meta-test plus a single-file executable behavioral-coverage test, and instrument the 21 currently-silent mutation surfaces.

**Architecture:** A pure AST helper module (`typescript` compiler API) classifies every mutation surface (mutating route, module-level `"use server"` action per exported function, function-scoped inline action) and evaluates a durable-emit predicate. A static discovery meta-test asserts every surface is instrumented / exempted / ledgered, with admin surfaces routed to registry membership. A separate single Vitest file drives each admin surface's committed-success branch through a log sink-spy and records `{file, fn, code}`, then asserts coverage. Seeding adds `await logAdminOutcome(...)` to 20 admin surfaces + 1 non-admin, plus exemption/ledger/registry rows.

**Tech Stack:** TypeScript, Vitest, `typescript` compiler API, Next.js 16 server actions/route handlers, `lib/log` (`logAdminOutcome`, `setLogSink`/`resetLogSink`).

## Global Constraints

- **Spec is canonical:** `docs/superpowers/specs/2026-07-04-mutation-surface-observability.md` (APPROVED, 20 adversarial rounds). Every task implements a spec section; cite it.
- **All new codes ride `logAdminOutcome`** → stripped by `stripLogEmissionCalls` → NOT §12.4 producers. No `lib/messages/catalog.ts` / `gen:spec-codes` / x1 changes.
- **AST stack:** `import ts from "typescript"` everywhere (matches `_metaAdminOutcomeContract.test.ts`). Do NOT import `authPrimitives.hasDirective` (ts-morph, unexported) — reimplement on `ts.Node`.
- **Emit placement:** every `logAdminOutcome` fires **post-commit, on the success branch only, awaited**, outside any advisory-lock tx (spec §9 topology; `lib/log/logAdminOutcome.ts:24`).
- **Durable-emit predicate:** (a) `await logAdminOutcome(...)`; (b) `log.<info|warn|error>(…, { code: "SHOUTY" })` — the `code:` **field** (a SHOUTY message alone is non-durable). `log`/`logAdminOutcome` must resolve to the real `@/lib/log` / `@/lib/log/logAdminOutcome` imports.
- **Admin surface** = module/inline action whose body calls `require{Admin,Developer}[Identity]`, OR a mutating `route.ts` under `app/api/admin/**`. Admin surfaces satisfy the floor ONLY by `AUDITABLE_MUTATIONS` (`{file, fn, code}`) membership + executable behavioral proof, OR an `ADMIN_SURFACE_EXEMPTIONS` row — never a bare `// no-telemetry:`/ledger.
- **TDD per task, commit per task**, conventional-commits (`test(log):` / `feat(admin):` / `docs(plan):` / `chore(...)`), `--no-verify` (shared hooks; run `pnpm format:check` before push).
- **Meta-test fragility:** re-run `tests/admin tests/log tests/auth` after editing any scanned read surface (comment/`;` fragility — `feedback_structural_metatest_comment_fragility`). Run `pnpm typecheck` after any vitest-only change.

---

## File structure

**Create:**
- `tests/log/_auditableMutations.ts` — shared registry (`AUDITABLE_MUTATIONS: {file, fn, code}[]`, sanctioned-code sets) imported by both `_metaAdminOutcomeContract.test.ts` and the discovery test.
- `tests/log/mutationSurface/enumerate.ts` — pure AST helpers: `collectSurfaceUnits(root)`, `hasDirective`, `hasFunctionScopedServerAction`, `classifyAdmin`, `predicateSatisfied`, `importBindingOk`.
- `tests/log/mutationSurface/exemptions.ts` — `ADMIN_SURFACE_EXEMPTIONS`, `KNOWN_UNINSTRUMENTED`, `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER`, `NO_TELEMETRY_RE`, hygiene predicates.
- `tests/log/mutationSurface/enumerate.test.ts` — unit tests for the AST helpers (fixture strings).
- `tests/log/_metaMutationSurfaceObservability.test.ts` — the static discovery meta-test.
- `tests/log/adminOutcomeBehavior.test.ts` — single-file executable behavioral coverage: the `recorded` set, `recordAdminOutcomeBehavior`, the 20 sink-spy cases, AND the coverage assertion all **inline in this one file** (spec R11 F2 requires file-local recorder state — no separate module).

**Modify (instrument — 21 surfaces):** `app/admin/settings/_actions/{setAutoPublish,setAlertOnAutoPublish,setAlertOnSyncProblems,setDailyReviewDigest,validationReset}.ts`, `app/admin/settings/admins/{actions,developerActions}.ts`, `app/admin/dev/actions.ts`, `app/admin/actions.ts`, `app/show/[slug]/unpublish/actions.ts`, `lib/onboarding/serverActions.ts`, `lib/auth/picker/{resetPickerEpoch,rotateShareToken,resetCrewMemberSelection}.ts`, `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts`, `app/api/admin/onboarding/reap-stale-sessions/route.ts`.

**Modify (exemptions/comments):** `app/api/test-auth/set-session/route.ts`, `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx`, `components/auth/IdentityChip.tsx` (`// no-telemetry:`).

**Modify (registry/governance):** `tests/log/_metaAdminOutcomeContract.test.ts` (import extracted registry), `AGENTS.md` (invariant #10), `BACKLOG.md` (2 entries).

---

## Task 1: Extract `AUDITABLE_MUTATIONS` to a shared `{file, fn, code}` module

**Files:**
- Create: `tests/log/_auditableMutations.ts`
- Modify: `tests/log/_metaAdminOutcomeContract.test.ts` (import from the new module; add `fn` to rows)
- Test: existing `tests/log/_metaAdminOutcomeContract.test.ts` must stay green

**Interfaces:**
- Produces: `export type AuditableMutation = { file: string; fn: string; code: string }`, `export const AUDITABLE_MUTATIONS: readonly AuditableMutation[]`, `export const SANCTIONED_CODES: ReadonlySet<string>`, `export const NEW_FORENSIC_CODES: ReadonlySet<string>`.

- [ ] **Step 1: Write the failing shape test FIRST** (Codex plan-R4 F2 — test-first even for the refactor). Create `tests/log/_auditableMutations.shape.test.ts` (the full code is in Step 4 below) importing `AUDITABLE_MUTATIONS` from `./_auditableMutations`. Run `pnpm vitest run tests/log/_auditableMutations.shape.test.ts` → **FAIL** (module `./_auditableMutations` does not exist yet). This is the red phase.

- [ ] **Step 2: Read the current registry** (`tests/log/_metaAdminOutcomeContract.test.ts`) — copy the `AUDITABLE_MUTATIONS` array, `SANCTIONED_CODES`, `NEW_FORENSIC_CODES` verbatim. **Create `tests/log/_auditableMutations.ts`** with them, adding `fn` to every row (`fn: "POST"` for every route row; the exported action name for action rows — `archive.ts` → `archiveShowAction`, `setPublished.ts` → `setShowPublishedAction`, `feed.ts` → three rows `mi11ApproveAction`/`mi11RejectAction`/`undoChangeAction`, `unarchive.ts` → `unarchiveShowAction`). Run the shape test → it now **PASSES** (module exists, shapes valid).

```ts
// tests/log/_auditableMutations.ts
export type AuditableMutation = { file: string; fn: string; code: string };
export const AUDITABLE_MUTATIONS: readonly AuditableMutation[] = [
  { file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts", fn: "POST", code: "STAGE_APPLIED" },
  // …every existing row, with fn:"POST" for routes / the action name for actions…
];
export const SANCTIONED_CODES: ReadonlySet<string> = new Set([/* …existing… */]);
export const NEW_FORENSIC_CODES: ReadonlySet<string> = new Set([/* …existing… */]);
```

- [ ] **Step 3: Rewrite `_metaAdminOutcomeContract.test.ts` to import** `AUDITABLE_MUTATIONS`, `SANCTIONED_CODES`, `NEW_FORENSIC_CODES` from `./_auditableMutations` and delete the inline copies. Its existing assertions key on `{file, code}` — leave them unchanged (they ignore the extra `fn`).

- [ ] **Step 4: The shape test written in Step 1 (full code — Codex plan-R3 F1)** asserts: every row where `file` ends `/route.ts` has `fn === "POST"`; every action row's `{file, fn}` names a function that actually exists as an exported async function in that live file (parse the file, confirm the export). This makes a wrong `fn` key fail immediately, since `_metaAdminOutcomeContract` still ignores `fn`.

```ts
import { describe, expect, test } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { AUDITABLE_MUTATIONS } from "./_auditableMutations";
const exportedFns = (file: string) => {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const st of sf.statements) {
    const exp = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exp && ts.isFunctionDeclaration(st) && st.name) names.add(st.name.text);
    if (exp && ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
  }
  return names;
};
describe("AUDITABLE_MUTATIONS {file,fn,code} shape", () => {
  test("route rows use fn:POST; action rows name a real exported fn", () => {
    for (const r of AUDITABLE_MUTATIONS) {
      if (r.file.endsWith("/route.ts")) expect(r.fn, r.file).toBe("POST");
      else expect(exportedFns(r.file).has(r.fn), `${r.file}::${r.fn}`).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run both** `pnpm vitest run tests/log/_metaAdminOutcomeContract.test.ts tests/log/_auditableMutations.shape.test.ts` → PASS (pure refactor; shapes valid). **`pnpm typecheck`** → PASS. **Commit:** `test(log): extract AUDITABLE_MUTATIONS to shared {file,fn,code} module + shape test`

---

## Task 2: AST predicate + directive + import-binding helpers

**Files:**
- Create: `tests/log/mutationSurface/enumerate.ts` (partial — predicate + directive parts), `tests/log/mutationSurface/enumerate.test.ts`
- Test: `tests/log/mutationSurface/enumerate.test.ts`

**Interfaces:**
- Produces:
  - `export function parse(file: string): ts.SourceFile`
  - `export function moduleHasUseServer(sf: ts.SourceFile): boolean`
  - `export function functionBodyHasUseServer(node: ts.FunctionLikeDeclaration): boolean`
  - `export function scanBody(node: ts.Node, opts: { descend: boolean }): { adminOutcome: boolean; codedLog: boolean; adminGated: boolean; rpc: boolean; writeBuilder: boolean }`
  - `export function importBindingOk(sf: ts.SourceFile): { log: boolean; logAdminOutcome: boolean }` (file-level: the module imports the real binding)
  - `export function isLocallyRebound(callNode: ts.Node, name: string): boolean` (call-site: any enclosing function/block scope of `callNode` declares a `VariableDeclaration`/`Parameter`/`FunctionDeclaration`/`import` named `name` — i.e. a shadow). A `log.*`/`logAdminOutcome` call counts toward the predicate ONLY when the file `importBindingOk` for that name AND NOT `isLocallyRebound` at the call. `scanBody` applies both checks before setting `adminOutcome`/`codedLog`.
  - `const SHOUTY = /^[A-Z][A-Z0-9_]+$/`, `const ADMIN_GATES = new Set(["requireAdmin","requireAdminIdentity","requireDeveloper","requireDeveloperIdentity"])`

- [ ] **Step 1: Write failing unit tests** in `enumerate.test.ts` for the predicate & directive helpers (parse in-memory via `ts.createSourceFile`). Cover, per spec §4.2 / §10.1:

```ts
import { describe, expect, test } from "vitest";
import ts from "typescript";
import { scanBody, moduleHasUseServer, functionBodyHasUseServer, importBindingOk } from "./enumerate";

const sf = (src: string) =>
  ts.createSourceFile("t.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const firstFn = (src: string) => {
  let f: ts.FunctionLikeDeclaration | undefined;
  const walk = (n: ts.Node) => { if (ts.isFunctionDeclaration(n) && !f) f = n; ts.forEachChild(n, walk); };
  walk(sf(src)); return f!;
};
const IMP = 'import { log } from "@/lib/log";\nimport { logAdminOutcome } from "@/lib/log/logAdminOutcome";\n';

describe("scanBody durability predicate", () => {
  test("awaited logAdminOutcome → adminOutcome true", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ await logAdminOutcome({code:"X"}); }'), { descend: false }).adminOutcome).toBe(true);
  });
  test("void logAdminOutcome → adminOutcome false", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ void logAdminOutcome({code:"X"}); }'), { descend: false }).adminOutcome).toBe(false);
  });
  test("bare unawaited logAdminOutcome → adminOutcome false (Codex plan-R4 F4)", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ logAdminOutcome({code:"X"}); }'), { descend: false }).adminOutcome).toBe(false);
  });
  test("log.info with SHOUTY message but no code field → codedLog false (non-durable)", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ log.info("FOO", { source:"s" }); }'), { descend: false }).codedLog).toBe(false);
  });
  test("log.info with code field → codedLog true", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ log.info("m", { code:"FOO" }); }'), { descend: false }).codedLog).toBe(true);
  });
  test("log.warn message-only → codedLog false", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ log.warn("FOO"); }'), { descend: false }).codedLog).toBe(false);
  });
  test("nested unused emitter → false when descend:false", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ async function u(){ await logAdminOutcome({code:"X"}); } return; }'), { descend: false }).adminOutcome).toBe(false);
  });
  test("emit inside if-block → true (control-flow descended)", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ if(ok){ await logAdminOutcome({code:"X"}); } }'), { descend: false }).adminOutcome).toBe(true);
  });
  test("requireAdmin in body → adminGated true", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ await requireAdmin(); doIt(); }'), { descend: false }).adminGated).toBe(true);
  });
  test(".rpc detected", () => {
    expect(scanBody(firstFn(IMP + 'async function m(){ await sb.rpc("x"); }'), { descend: false }).rpc).toBe(true);
  });
});
describe("directives", () => {
  test("module-level use server", () => { expect(moduleHasUseServer(sf('"use server";\nexport async function m(){}'))).toBe(true); });
  test("use client is not use server", () => { expect(moduleHasUseServer(sf('"use client";\nexport function C(){}'))).toBe(false); });
});
describe("importBindingOk", () => {
  test("real imports", () => {
    const r = importBindingOk(sf(IMP + 'export async function m(){}')); expect(r.log && r.logAdminOutcome).toBe(true);
  });
  test("module-level shadow: no real import", () => {
    const r = importBindingOk(sf('const log = { info(){} };\nexport async function m(){}')); expect(r.log).toBe(false);
  });
  test("wrong-source import rejected", () => {
    const r = importBindingOk(sf('import { log } from "./fake";\nexport async function m(){}')); expect(r.log).toBe(false);
  });
});

describe("call-site binding (Codex plan-R1 F2): local shadow does NOT satisfy the floor", () => {
  test("real import but log rebound in the fn body → codedLog false", () => {
    const src = IMP + 'async function m(){ const log = { warn(){} }; log.warn("x", { code:"FOO" }); }';
    // scanBody must reject because the call's `log` is locally rebound
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("real import but logAdminOutcome rebound → adminOutcome false", () => {
    const src = IMP + 'async function m(){ const logAdminOutcome = async () => {}; await logAdminOutcome({ code:"X" }); }';
    expect(scanBody(firstFn(src), { descend: false }).adminOutcome).toBe(false);
  });
  test("destructured shadow const { log } = fake → codedLog false (Codex plan-R3)", () => {
    const src = IMP + 'async function m(){ const { log } = fake; log.warn("x", { code:"FOO" }); }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("catch (log) shadow → codedLog false", () => {
    const src = IMP + 'async function m(){ try { doIt(); } catch (log) { log.error("x", { code:"FOO" }); } }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
  test("param shadow (log) → codedLog false", () => {
    const src = IMP + 'async function m(log){ log.info("x", { code:"FOO" }); }';
    expect(scanBody(firstFn(src), { descend: false }).codedLog).toBe(false);
  });
});
```

`scanBody` keeps its signature `scanBody(root, { descend })` and derives the import binding
internally: `const imports = importBindingOk(root.getSourceFile())` (parent pointers are set via
`setParentNodes: true`). Before crediting a `log.*`/`logAdminOutcome` call it confirms
`imports[name] === true` AND `isLocallyRebound(call, name) === false`. `isLocallyRebound` walks
`callNode.parent` up to the SourceFile, returning true if any enclosing `Block`/function/params
declares `name`.

- [ ] **Step 2: Run — FAIL** (`enumerate.ts` empty). Run: `pnpm vitest run tests/log/mutationSurface/enumerate.test.ts` → FAIL.

- [ ] **Step 3: Implement the helpers** in `enumerate.ts`:

```ts
import { readFileSync } from "node:fs";
import ts from "typescript";

const SHOUTY = /^[A-Z][A-Z0-9_]+$/;
const ADMIN_GATES = new Set(["requireAdmin", "requireAdminIdentity", "requireDeveloper", "requireDeveloperIdentity"]);
const isFnLike = (n: ts.Node) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n);

export function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function leadingDirective(stmts: readonly ts.Statement[], d: string): boolean {
  for (const st of stmts) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === d) return true; continue;
    }
    break;
  }
  return false;
}
export function moduleHasUseServer(sf: ts.SourceFile) { return leadingDirective(sf.statements, "use server"); }
export function functionBodyHasUseServer(node: ts.FunctionLikeDeclaration) {
  return !!node.body && ts.isBlock(node.body) && leadingDirective(node.body.statements, "use server");
}
/** True if `name` is bound anywhere in a `BindingName` (identifier, object/array
 * destructuring, incl. rename `{ log: x }` binds `x` not `log`, and `{ log }` binds `log`). */
function bindingBindsName(bn: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(bn)) return bn.text === name;
  for (const el of bn.elements) {
    if (ts.isOmittedExpression(el)) continue;
    if (bindingBindsName(el.name, name)) return true;
  }
  return false;
}
export function isLocallyRebound(callNode: ts.Node, name: string): boolean {
  let n: ts.Node | undefined = callNode.parent;
  while (n && !ts.isSourceFile(n)) {
    let found = false;
    // block-scoped decls (incl. destructuring) + local function decls
    if (ts.isBlock(n) || isFnLike(n))
      ts.forEachChild(n, (ch) => {
        if (ts.isVariableStatement(ch)) for (const d of ch.declarationList.declarations)
          if (bindingBindsName(d.name, name)) found = true;
        if (ts.isFunctionDeclaration(ch) && ch.name?.text === name) found = true;
      });
    // function/method/arrow parameters (incl. destructured params)
    if (isFnLike(n)) for (const p of (n as ts.FunctionLikeDeclaration).parameters ?? [])
      if (bindingBindsName(p.name, name)) found = true;
    // catch clause variable: catch (log) { ... }
    if (ts.isCatchClause(n) && n.variableDeclaration && bindingBindsName(n.variableDeclaration.name, name)) found = true;
    if (found) return true;
    n = n.parent;
  }
  return false;
}
export function scanBody(root: ts.Node, opts: { descend: boolean }) {
  const res = { adminOutcome: false, codedLog: false, adminGated: false, rpc: false, writeBuilder: false };
  const WRITE = new Set(["insert", "update", "delete", "upsert"]);
  const imports = importBindingOk(root.getSourceFile());
  const realBinding = (call: ts.Node, name: "log" | "logAdminOutcome") => imports[name] && !isLocallyRebound(call, name);
  const visit = (n: ts.Node, isRoot: boolean) => {
    if (!isRoot && !opts.descend && isFnLike(n)) return; // action scope: don't descend into nested fns
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (ts.isIdentifier(c) && c.text === "logAdminOutcome" && n.parent && ts.isAwaitExpression(n.parent) && realBinding(n, "logAdminOutcome")) res.adminOutcome = true;
      if (ts.isIdentifier(c) && ADMIN_GATES.has(c.text)) res.adminGated = true;
      if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.name)) {
        if (WRITE.has(c.name.text)) res.writeBuilder = true;
        if (c.name.text === "rpc") res.rpc = true;
        if (ts.isIdentifier(c.expression) && c.expression.text === "log" && ["info", "warn", "error"].includes(c.name.text) && realBinding(n, "log")) {
          const a1 = n.arguments[1];
          if (a1 && ts.isObjectLiteralExpression(a1)) for (const p of a1.properties)
            if (ts.isPropertyAssignment(p) && ((ts.isIdentifier(p.name) && p.name.text === "code") || (ts.isStringLiteral(p.name) && p.name.text === "code")) && ts.isStringLiteral(p.initializer) && SHOUTY.test(p.initializer.text)) res.codedLog = true;
        }
      }
    }
    ts.forEachChild(n, (ch) => visit(ch, false));
  };
  visit(root, true);
  return res;
}
export function importBindingOk(sf: ts.SourceFile) {
  const out = { log: false, logAdminOutcome: false };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const mod = st.moduleSpecifier.text; const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) {
      if (el.name.text === "log" && mod === "@/lib/log") out.log = true;
      if (el.name.text === "logAdminOutcome" && mod === "@/lib/log/logAdminOutcome") out.logAdminOutcome = true;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run — PASS.** `pnpm vitest run tests/log/mutationSurface/enumerate.test.ts` → PASS. **Step 5: typecheck + commit** `test(log): AST predicate/directive/import-binding helpers for surface discovery`.

---

## Task 3: Surface enumeration (routes, module actions, inline actions, default-export ban) + admin classification

**Files:** Modify `tests/log/mutationSurface/enumerate.ts`, `tests/log/mutationSurface/enumerate.test.ts`.

**Interfaces:**
- Produces:
  - `export type SurfaceUnit = { file: string; fn: string; kind: "route" | "module-action" | "inline-action"; node: ts.Node; admin: boolean }`
  - `export function collectSurfaceUnits(roots: string[]): SurfaceUnit[]` (walks `app/`, `lib/`, `components/`)
  - `export function moduleDefaultExports(sf: ts.SourceFile): boolean`
  - `export function routeMutatingMethods(sf: ts.SourceFile): string[]`

- [ ] **Step 1: Failing tests** — add to `enumerate.test.ts` (Codex plan-R4 F4 — include the re-export/alias cases): a `"use server"` module with 2 exported async fns yields 2 module-action units (fn names correct); an `export { mutate }` list export is collected; **an aliased list export `async function local(){} export { local as mutate }` yields a unit with `fn:"mutate"` bound to `local`'s body**; a route file with `export async function POST` yields one route unit (`fn:"POST"`); **a route re-export `export { POST } from "./x"` / `export { handler as POST } from "./x"` is detected by `routeMutatingMethods` (length ≥1)**; a route with `POST`+`DELETE` → `routeMutatingMethods` length 2; a `"use server"` module with `export default` → `moduleDefaultExports` true; admin classification: a module action calling `requireAdmin` → `admin:true`, a route under `app/api/admin/**` → `admin:true`, `app/api/report/route.ts`-style path → `admin:false`.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `collectSurfaceUnits`, `routeMutatingMethods` (top-level exported `FunctionDeclaration`/`VariableStatement`/`ExportDeclaration` re-export named POST/PUT/PATCH/DELETE), module-action enumeration (exported async fns incl. `export { local as name }` resolved to local decls), inline-action enumeration (function/arrow whose block body opens with `"use server"`), `moduleDefaultExports` (any `export default` in a `"use server"` module), and `admin` = (kind==="route" && file matches `app/api/admin/`) OR (`scanBody(node,{descend:false}).adminGated`). Use `walkSourceFiles` from `@/lib/messages/__internal__/walkSourceFiles` for the FS walk, skipping `node_modules/.next/.git`.

- [ ] **Step 4: Run — PASS. Step 5: typecheck + commit** `test(log): surface enumeration + admin classification + default-export detection`.

---

## Task 4: Exemption + ledger + grandfather registries and hygiene

**Files:** Create `tests/log/mutationSurface/exemptions.ts`; add tests to `enumerate.test.ts` (or a new `exemptions.test.ts`).

**Interfaces:**
- Produces:
  - `export const NO_TELEMETRY_RE = /^\s*\/\/\s*no-telemetry:\s*\S/`
  - `export function fileHasNoTelemetry(file: string): boolean` and `functionSpanHasNoTelemetry(file, node)`
  - `export const ADMIN_SURFACE_EXEMPTIONS: readonly { file: string; fn?: string; kind: "delegator" | "read-only"; delegatesTo?: string }[]`
  - `export const KNOWN_UNINSTRUMENTED: readonly { file: string; fn: string; backlog: string }[]`
  - `export const ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER: readonly { file: string; fn: string }[]` (the 30 units)

- [ ] **Step 1: Failing tests** — `NO_TELEMETRY_RE` rejects `// no-telemetry:` with no reason and accepts `// no-telemetry: x`; `KNOWN_UNINSTRUMENTED` contains exactly the 6 picker fns (spec §3.1 C); `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` is a **hardcoded literal** (Codex plan-R3 F4 — NOT computed from the tree) of exactly 30 `{file, fn}` entries: the 24 admin route files each `{fn:"POST"}` + the 6 action fns (`archive.ts`::`archiveShowAction`, `unarchive.ts`::`unarchiveShowAction`, `setPublished.ts`::`setShowPublishedAction`, `feed.ts`::`mi11ApproveAction`/`mi11RejectAction`/`undoChangeAction`). Regression assertion: `manifest/…/ignore` and `reap-stale-sessions` (with `fn:"POST"`) are NOT in the grandfather set (they are seeded now, not grandfathered).

- [ ] **Step 2: Run — FAIL. Step 3: Implement** the constants as hardcoded literals (values copied verbatim from spec §3.1 B/C and §4.2 grandfather list) + the regex/comment scanners. **Step 4: PASS. Step 5: commit** `test(log): exemption/ledger/grandfather registries + no-telemetry regex`.

---

## Task 5: Static discovery meta-test (fixture-level, live assertion deferred to Task 18)

**Files:** Create `tests/log/_metaMutationSurfaceObservability.test.ts`.

- [ ] **Step 1: Write the meta-test** composing Tasks 2–4. It implements the per-surface decision.
  **Scan scope (Codex plan-R1 F1 — get the recursion direction right):** for a **route**, scan the
  whole `SourceFile` with `scanBody(sf, { descend: true })` (the emit legitimately lives in a
  file-level helper the handler delegates to). For an **action/inline** surface, scan the
  function `node` with `scanBody(node, { descend: false })` (per-function body, do NOT descend
  into nested fns — the R4 F3 unused-nested-emitter guard). Equivalently `descend: kind === "route"`,
  with routes scanning the SourceFile and actions scanning the function node. Add fixtures proving:
  a route whose emit is in a file-level helper PASSES; an action with an unused nested
  `logAdminOutcome` FAILS; an action with the emit in an `if`/`try` block PASSES.
  - non-admin surface passes iff its scan satisfies predicate (a `adminOutcome` OR b `codedLog`) with call-site import binding valid (Task 2), OR a `// no-telemetry:` (function-span for actions/inline; file-leading only for routes/non-action files), OR a `KNOWN_UNINSTRUMENTED` `{file,fn}` row;
  - admin surface passes iff its `{file,fn}` has a matching `{file,fn,code}` in `AUDITABLE_MUTATIONS`, OR an `ADMIN_SURFACE_EXEMPTIONS` row (delegator's `delegatesTo` ∈ `AUDITABLE_MUTATIONS`; read-only has no write-builder/`.rpc`/`logAdminOutcome`);
  - a bare `// no-telemetry:` on an admin surface → FAIL; a file-leading `// no-telemetry:` in a `"use server"`/inline-action file → error; a `"use server"` module with a default export → FAIL; `KNOWN_UNINSTRUMENTED` entry naming an admin-gated fn → FAIL.
  Include the fixture/negative tests from spec §10.1/§10.4/§10.5-hygiene using in-memory strings written to a tmp dir (or a `describe` over synthetic `SourceFile`s that bypass the FS walk). **Route-multiplicity assertion:** no `route.ts` in the live tree exports >1 mutating method (prove-it-fails fixture: a two-method route string).

- [ ] **Step 1b: Ledger + exemption hygiene negatives (Codex plan-R2 F2)** — explicit fixture tests, one per spec rule:
  - a `KNOWN_UNINSTRUMENTED` entry whose `file` no longer exists → FAIL;
  - an entry whose `{file, fn}` is no longer a discovered surface → FAIL;
  - an entry whose `fn` now emits (would pass anyway) → FAIL (stale debt must be removed);
  - a NEW un-ledgered sibling in a ledgered file (a 2nd export added to a picker file) → FAIL;
  - a `KNOWN_UNINSTRUMENTED` entry naming an admin-gated fn → FAIL;
  - an `ADMIN_SURFACE_EXEMPTIONS` `delegator` whose file does NOT actually call/import the `delegatesTo` target → FAIL;
  - a `delegator` whose `delegatesTo` is not in `AUDITABLE_MUTATIONS` → FAIL;
  - a `read-only` row on a fn containing `.rpc(`/write-builder/`logAdminOutcome` → FAIL.
- [ ] **Step 1c: Failure-output test (Codex plan-R2 F3 / spec §4.4)** — a `formatFailures(units)` helper: given a synthetic mix of offenders (≥1 non-admin action, ≥1 admin route), assert the message lists **every** `file :: fn` (no truncation), and that admin offenders' remediation text lists registry+behavioral / `ADMIN_SURFACE_EXEMPTIONS` and does **NOT** offer `// no-telemetry:` or `KNOWN_UNINSTRUMENTED`, while non-admin offenders' text does.
- [ ] **Step 2: The live-surface `test()` ("zero unaccounted") is written but `.skip`ped** with a comment `// UN-SKIP in Task 17 after exemptions/ledger land`. (Rationale: it fails until all 21 surfaces are instrumented AND the exemption/ledger surfaces are accounted; enabling it now would leave the task red.)

- [ ] **Step 3: Run — the fixture/negative tests PASS, live test skipped.** `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` → PASS (skips reported). **Step 4: typecheck + commit** `test(log): static discovery meta-test (fixtures; live assertion skipped pending seeding)`.

---

## Task 6: Single-file behavioral scaffold (recorder + sink-spy) — TDD

**Files:** Create `tests/log/adminOutcomeBehavior.test.ts` (all state INLINE — no separate recorder module, per spec R11 F2 / Codex plan-R1 F3).

- [ ] **Step 1: Write ONLY the failing smoke test first** (Codex plan-R1 F4 / R4 F2 — a concrete failing test, impl NOT in this step). Write the `describe`/`test` block below but do NOT yet define `recorded`, `recordAdminOutcomeBehavior`, or `observeCodes`. Run → **FAIL** (`recordAdminOutcomeBehavior is not defined`). This is the red phase.

```ts
import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome"; // NOT re-exported from @/lib/log (verified live)
import type { LogRecord } from "@/lib/log";

// ── inline file-local recorder (single-file contract; no cross-file state) ──
const recorded = new Set<string>(); // "file::fn::code"
function recordAdminOutcomeBehavior(x: { file: string; fn: string; code: string }) {
  recorded.add(`${x.file}::${x.fn}::${x.code}`);
}

/** Drive a success path with a sink spy; return the codes observed. Captures codes even when
 * `run()` throws — required for `Promise<never>` redirect actions (Next's `redirect()` throws
 * a NEXT_REDIRECT error). The spy runs synchronously in the logger before the throw escapes. */
async function observeCodes(run: () => Promise<unknown>): Promise<string[]> {
  const codes: string[] = [];
  setLogSink((r: LogRecord) => { if (r.code) codes.push(r.code); });
  try { await run(); } catch { /* redirect / expected throw — codes already captured */ } finally { resetLogSink(); }
  return codes;
}
afterEach(() => resetLogSink());

describe("behavioral scaffold smoke", () => {
  test("spy captures a code; recorder records; and codes survive a thrown (redirect-style) run", async () => {
    const codes = await observeCodes(() => logAdminOutcome({ code: "TEST_SMOKE", source: "t" }));
    expect(codes).toContain("TEST_SMOKE");
    recordAdminOutcomeBehavior({ file: "x", fn: "y", code: "TEST_SMOKE" });
    expect(recorded.has("x::y::TEST_SMOKE")).toBe(true);
    // redirect-style: emit then throw — the code must still be observed
    const thrown = await observeCodes(async () => { await logAdminOutcome({ code: "TEST_THROW", source: "t" }); throw new Error("NEXT_REDIRECT"); });
    expect(thrown).toContain("TEST_THROW");
  });
});
```

  (The block above is the FINAL file state. In Step 1 write ONLY the imports + the `describe(...)` test; the `recorded`/`recordAdminOutcomeBehavior`/`observeCodes`/`afterEach` definitions come in Step 2.)

- [ ] **Step 2: Run red → add minimal impl.** Run: `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` → FAIL (`recordAdminOutcomeBehavior is not defined`). Then add the recorder + `observeCodes` (with the `catch`) + `afterEach` definitions shown above.

- [ ] **Step 3: Run — PASS** (incl. the redirect-capture `TEST_THROW` assertion, which fails if you omit the `catch` — proving it load-bearing). **Step 4: typecheck + commit** `test(log): single-file behavioral sink-spy scaffold (redirect-safe) + inline recorder`.

---

## Tasks 7–16: Seed the 20 admin surfaces (one task per surface group)

**Per-surface pattern (repeated with exact constants per group).** Each task, for each surface it covers:
1. Add a **failing sink-spy case** in `adminOutcomeBehavior.test.ts` that mocks the surface's deps so it reaches the committed-success branch, asserts the expected `code` is observed AND non-success branches observe nothing, then calls `recordAdminOutcomeBehavior({file, fn, code})`.
2. Run → FAIL (surface silent).
3. **Resolve any newly-needed actor identity BEFORE the mutating operation** — if the surface only calls `requireAdmin()` today, add `const { email } = await requireAdminIdentity()` (cached; verified) **above the mutation**, NOT post-commit (Codex plan-R2 F4: a `require*Identity()` infra throw must not escape over an already-committed mutation). Then add **only** `await logAdminOutcome({ code, source, actorEmail?, showId?/…, result })` on the success branch, **post-commit** (`logAdminOutcome` is internally try/catch-wrapped, so it — and it alone — is safe there). Where identity is already resolved earlier (e.g. `admins/actions` `requireAdminIdentity()`, `resetPickerEpoch` `adminCtx`), reuse it; add nothing new post-commit but the emit.
4. Add the `{file, fn, code}` row to `tests/log/_auditableMutations.ts` (and the code to `SANCTIONED_CODES`/`NEW_FORENSIC_CODES`). The `fn` MUST match the exact exported function name (the `_auditableMutations.shape.test.ts` from Task 1 re-runs and fails immediately on a wrong `fn`).
5. Run → PASS (incl. `_auditableMutations.shape.test.ts` for the new rows). typecheck. Commit.

**Mocking pattern.** **NEVER mock `@/lib/log` or `@/lib/log/logAdminOutcome` in
`adminOutcomeBehavior.test.ts` (Codex plan-R4 F3)** — the sink-spy proof requires the REAL
logger to run (`logAdminOutcome` → `log.info` → the sink). Mock ONLY auth / data / Next deps.
(The existing `tests/app/admin/set-published-action.test.ts` mocks the logger — do NOT copy
that here; borrow only its auth/Supabase mock shapes.) `vi.mock("@/lib/auth/requireAdmin", …)`
→ `requireAdmin`/`requireAdminIdentity` resolve `{ email: "admin@x" }`;
`vi.mock("@/lib/auth/requireDeveloper", …)` similarly. Assert the FAILURE branch records nothing.
Per-surface mock notes (non-Supabase-builder surfaces):
- **validationReset**: mock `createSupabaseServerClient` (assert RPC ok) + `createSupabaseServiceRoleClient` (reset/reseed RPC resolves `{ clearedShows }`/minted), `destructiveResetAllowed → true`, `requireDeveloper*`.
- **onboarding redirects**: mock `purgeAndRotateOnboardingSession` (resolve), `requireAdminIdentity`, and `next/navigation` `redirect` (throws NEXT_REDIRECT — use redirect-safe `observeCodes`).
- **retryWatchSubscription**: mock the watch-renewal dep to resolve success; separately drive the no-folder skip branch (asserts no `WATCH_SUBSCRIPTION_RETRIED`).
- **manifest/ignore route**: mock `deps.withRowTx`/`transitionManifestRow` to return committed-success; drive a CAS-miss variant asserting no emit.
- **confirmUnpublishAction**: mock `unpublishShowViaEmailedLink` → `{ outcome:"success", showId }` and `prevalidateUnpublishBinding` → ok; drive expired/neutral/infra asserting no emit.

### Task 7: Settings toggles (4)
- `setAutoPublish` → `SETTING_AUTOPUBLISH_CHANGED`, source `"admin.settings.autoPublish"`, `result: next ? "enabled" : "disabled"`. Emit only on `{ ok: true }` (after `revalidatePath`).
- `setAlertOnAutoPublish` → `SETTING_ALERT_ON_AUTOPUBLISH_CHANGED`, source `"admin.settings.alertOnAutoPublish"`.
- `setAlertOnSyncProblems` → `SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED`.
- `setDailyReviewDigest` → `SETTING_DAILY_REVIEW_DIGEST_CHANGED`.
Each currently calls `requireAdmin()`; add `const { email } = await requireAdminIdentity();` and pass `actorEmail: email`. Commit: `feat(admin): observe app_settings toggle changes`.

### Task 8: validationReset (2)
- `resetValidationDataAction` → `VALIDATION_RESET_RUN`, source `"admin.settings.validationReset"`, `result: "cleared_" + count`, on `{ ok: true, count }`. Actor via `requireDeveloperIdentity()`.
- `reseedValidationFixturesAction` → `VALIDATION_RESEED_RUN`, `result: "minted_" + count`, on `{ ok: true }`.
Commit: `feat(admin): observe validation reset/reseed`.

### Task 9: admin-management (3)
- `addAdminAction` → `ADMIN_GRANTED` on `kind:"ok"`; `revokeAdminAction` → `ADMIN_REVOKED` on `kind:"ok"`. Both already call `requireAdminIdentity()` (reuse `email`). Idempotent/refusal branches emit nothing.
- `setDeveloperAction` → `ADMIN_DEVELOPER_SET` on `outcome.kind==="ok"`, `result: outcome.isDeveloper ? "granted" : "revoked"`.
Commit: `feat(admin): observe admin grant/revoke + developer toggle`.

### Task 10: dev/actions (2 mutations)
- `parseAndStage` → `DEV_PARSE_STAGED`; `resetDevSchema` → `DEV_SCHEMA_RESET`. Emit on success return. Actor via `requireDeveloperIdentity()`.
Commit: `feat(admin): observe dev parse-stage + schema reset`.

### Task 11: onboarding serverActions (2)
- `startOverServerAction` → `ONBOARDING_STARTED_OVER`; `rerunSetupServerAction` → `ONBOARDING_SETUP_RERUN`. `Promise<never>` — emit `await logAdminOutcome(...)` **before** the `redirect()` throw, after `purgeAndRotateOnboardingSession()` resolves; identity via the existing `requireAdminIdentity()` (already resolved pre-mutation). **The sink-spy cases MUST use the redirect-safe `observeCodes` (Task 6)** — `redirect()` throws `NEXT_REDIRECT`, so the helper's `catch` is what lets the emitted code be observed. Assert the code IS observed despite the throw.
Commit: `feat(onboarding): observe start-over / rerun-setup`.

### Task 12: app/admin/actions (2)
- `resolveAdminAlertFormAction` → **reuse** `ADMIN_ALERT_RESOLVED` on the committed UPDATE branch only (before `revalidatePath("/admin","layout")`); nothing on getUser-fail/null-email/UPDATE-error/invalid-id.
- `retryWatchSubscriptionFormAction` → `WATCH_SUBSCRIPTION_RETRIED` on the successful-renewal branch only (not the no-folder skip / failure).
Commit: `feat(admin): observe alert-resolve + watch-retry success`.

### Task 13: admin picker mutations (3)
- `resetPickerEpoch` → `PICKER_EPOCH_RESET_BY_ADMIN`, `result: "epoch_" + new_epoch`, on `{ ok: true }`. Actor from the existing `requireAdminIdentity()` (`adminCtx.email`).
- `rotateShareToken` → `SHARE_TOKEN_ROTATED_BY_ADMIN`, `result: "epoch_" + new_epoch` — **NEVER log `new_share_token`**. Add `requireAdminIdentity()` for actor.
- `resetCrewMemberSelection` → `CREW_SELECTION_RESET_BY_ADMIN`, `result: "reset"`, on `{ ok: true }`. Add `requireAdminIdentity()` for actor.
Emit AFTER the RPC resolves (post-commit, outside the in-RPC advisory lock — spec §9). Commit: `feat(picker): observe admin epoch/share-token/selection resets`.

### Task 14: admin routes manifest/ignore + reap (2)
- `manifest/…/ignore` route → `MANIFEST_SHEET_IGNORED`. **The current handler returns its
  success JSON from INSIDE `deps.withRowTx(...)` (the advisory-lock wrapper). Restructure so the
  callback returns a success payload/sentinel; emit `await logAdminOutcome(...)` AFTER
  `await deps.withRowTx(...)` resolves (outside the lock — invariant 2 / spec §9), THEN return
  `NextResponse.json(...)` (Codex plan-R4 F1).** Emit only on the committed-transition result,
  NOT on a CAS-miss (where the wrapper rolls back). Actor from its `requireAdminIdentity()`.
  Negative test: a CAS-miss / wrapper-failure result records nothing.
- `reap-stale-sessions` route → `STALE_SESSIONS_REAPED`, `result: "reaped_" + count`, on the
  successful reap (after `await reap(...)` resolves); actor from `requireDeveloperIdentity()`.
Commit: `feat(admin): observe manifest-ignore + stale-session reap`.

### Task 15: non-admin confirmUnpublishAction (broad floor, reuse code)
- `confirmUnpublishAction` → **reuse** `SHOW_UNPUBLISHED_VIA_EMAILED_LINK` on `result.outcome==="success"` (`showId: result.showId`, no actorEmail — emailed-link actor). Sink-spy test co-located with the unpublish tests; does NOT record (non-admin). No `AUDITABLE_MUTATIONS` row required (non-admin passes the floor via the emit). Commit: `feat(crew): observe emailed-link unpublish confirm`.

### Task 16: (reserved) — verify all seeded codes are stripped
- [ ] Run `pnpm vitest run tests/messages/stripLogEmissionCalls.test.ts tests/messages/codes.test.ts` → PASS (proves the 19 new codes are NOT §12.4 producers). Commit only if a change is needed (else skip).

---

## Task 17: Exemptions + ledger + un-skip the live discovery assertion (TDD)

**Files:** the 4 comment targets, `tests/log/mutationSurface/exemptions.ts`, `_metaMutationSurfaceObservability.test.ts`.

- [ ] **Step 1: Un-skip the live-surface `test()` FIRST — it must be RED** (Codex plan-R2 F1). At this point Tasks 7-16 have instrumented the 21 surfaces, so the remaining unaccounted are exactly the exemption/ledger surfaces (test-auth, 2 route shims, 2 dev wrappers, 2 dev reads, 3 inline crew wrappers, 6 picker fns). Run `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` → **FAIL**, listing those surfaces.
- [ ] **Step 2: Add the exemptions/ledger/comments to make it green:**
  - `// no-telemetry: test-only auth scaffolding; not a product mutation surface` (file-leading) in `app/api/test-auth/set-session/route.ts`;
  - per-inline-function `// no-telemetry: thin crew form-action wrapper; delegates to <picker action>` inside `clearIdentityFormAction` (IdentityChip.tsx), `selectIdentityFormAction` (_PickerInterstitial.tsx), `clearIdentityAndSkipFormAction` (_SignInOrSkipGate.tsx);
  - `ADMIN_SURFACE_EXEMPTIONS`: the 2 route shims (`delegator` → retry route), the 2 dev form-wrappers (`delegator` → parseAndStage/resetDevSchema), the 2 dev reads (`read-only`);
  - `KNOWN_UNINSTRUMENTED`: the 6 picker fns (spec §3.1 C).
- [ ] **Step 3: Run → GREEN.** `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` → PASS (zero unaccounted). **Commit** `feat(observability): account every mutation surface (exemptions + ledger) — invariant 10 discovery green`.

---

## Task 18: Enable the admin behavioral-coverage assertion (TDD)

**Files:** `adminOutcomeBehavior.test.ts` (add coverage `test()`).

- [ ] **Step 1: Add the coverage `test()`** at the end of `adminOutcomeBehavior.test.ts` (uses the file-local `recorded` set — all 20 cases above have run and populated it within this one file's module scope): import `collectSurfaceUnits`, `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER`, `AUDITABLE_MUTATIONS`; assert every admin surface `{file,fn}` NOT in the grandfather set has a `recorded` entry `${file}::${fn}::${code}` matching its `AUDITABLE_MUTATIONS` row; assert the grandfather set equals exactly the frozen 30 and each grandfather entry is a live admin surface (fails if it grows or an entry disappears). Before adding it: temporarily comment out one seeded surface's `recordAdminOutcomeBehavior(...)` line and confirm the coverage test goes RED (proves non-tautology), then restore.
- [ ] **Step 2: Run** `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` → **PASS** (all 20 recorded; grandfather exactly 30). If red, the failing surface is unaccounted — fix its seeding, not the assertion.
- [ ] **Step 3: Run the fragility sweep** `pnpm vitest run tests/admin tests/log tests/auth` → PASS. **typecheck + format:check.** **Commit** `test(log): enable executable admin behavioral-coverage assertion`.

---

## Task 19: AGENTS.md invariant #10 + BACKLOG entries

**Files:** `AGENTS.md`, `BACKLOG.md`.

- [ ] Insert invariant **10** into the "Plan-wide invariants (non-negotiable)" list, verbatim from spec §6 (the two-bullet non-admin/admin structure).
- [ ] Add `BL-CREW-PICKER-OBSERVABILITY` and `BL-ADMIN-OUTCOME-BEHAVIOR` to `BACKLOG.md` (spec §6 wording).
- [ ] `pnpm format:check` (do NOT prettier the master spec). **Commit** `docs(plan): ratify invariant #10 + backlog crew-picker / admin-behavior debt`.

---

## Task 20: Self-review

- [ ] Spec-coverage sweep: map every spec §4/§5/§9/§10 item to a task above; list gaps; add tasks for any gap.
- [ ] Placeholder scan; type-consistency (helper signatures match across Tasks 2–6, 18).
- [ ] Numeric sweep: 21 seeded (20 admin + 1 non-admin), 30 grandfather units, 6 ledger fns, 19 new codes + 2 reuses — consistent with the spec.

## Task 21: Adversarial review (cross-model)

- [ ] Invoke the `adversarial-review` skill → Codex. Iterate to APPROVE (no round budget). Class-sweep every finding; ship structural defenses in-round after 3+ same-vector rounds.

## Task 22: Execution handoff

- [ ] Offer subagent-driven vs inline execution.

---

## Verification (whole-plan)

- `pnpm vitest run tests/log tests/messages tests/admin tests/auth`
- `pnpm typecheck && pnpm format:check`
- Full suite in CI.
- **Invariant-8 close-out:** `/impeccable critique` + `/impeccable audit` on the diff (UI-surface files touched — spec §8); record dispositions in the handoff. No visual diff ⇒ expect no HIGH/CRITICAL.
