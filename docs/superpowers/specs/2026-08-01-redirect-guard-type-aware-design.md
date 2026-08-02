# Type-aware self-redirect guard (BL-SOUND-REDIRECT-GUARD)

**Status:** R9 — whole-diff round-6 finding repaired · **Branch:** `test/redirect-guard-type-aware` · **Date:** 2026-08-01

**Whole-diff R6 disposition (2026-08-01):** one RED finding — the namespace hop inspected only properties literally named `NextResponse`/`Response`, so a namespace over a RENAMED re-export (`export { NextResponse as Redirector }`, default exports, dynamic-import twins) escaped. Closed (probe 11): module-symbol types (ValueModule/NamespaceModule flags) get an ALL-property one-hop check regardless of export spelling — module-gated, so ordinary structural types stay on the cheap named path; tree cost unchanged. Rows R87–R89. Also repaired: R86 made order-independent (each multi-module row lays down its full helper chain), and the rot-prone range metadata in the plan and test header now defers to §6 as the single source of truth.

**Whole-diff R5 disposition (2026-08-01):** one RED finding — renamed static re-exports (`export { NextResponse as Redirector }`, default re-exports, re-exported namespaces, multi-hop chains) deliver a carrier under an arbitrary local name, so name-based tracking missed their naked structural launderings. Closed (probe 10): tracked locals are now decided by TYPE — every import binding (default, namespace, named) whose type carries the banned method (directly, via `redirect`, or one namespace hop) joins the candidate set; one type query per binding, tree cost unchanged. (r6: the namespace hop enumerates ALL properties for module-symbol types.) Rows R83–R86 + N10 (unrelated bindings stay untracked); the plan's graduation text and the committed harness's leftover name-tracking swept in the same revision.

**Whole-diff R4 disposition (2026-08-01):** one RED finding — dynamic-import tracking covered only direct variable initializers; five zero-diagnostic shapes escaped (inline awaited-import stuffing, declaration/assignment destructuring, promise-carried awaiting, `.then` callbacks). Closed (probe 9): the `import(...)` CALL EXPRESSION itself is a candidate, decided on its AWAITED module type — every downstream shape flags at the one site that must spell the module specifier; the variable-name tracking is removed as subsumed. Rows R78–R82; dynamic import of an unrelated module stays quiet. Second finding (staleness in plan/archive ranges) swept in the same revision.

**Whole-diff R3 disposition (2026-08-01):** one RED finding — the class object carried INSIDE a module-namespace object launders without any class-name expression (`({ NextResponse: R } = NS)`; object-rest `({ ...rest } = NS)`; declaration twins; dynamic-import bindings). Closed (probe 8): namespace-import locals and dynamic-import-bound locals join the identifier candidate set, and the carry predicate gains ONE namespace hop (a type whose `NextResponse`/`Response` property's `redirect` property carries the banned declaration) — deeper stuffing must spell a tracked name at the stuffing site, which is itself a flagged naked reference. Rows R72–R77 + N9; real tree unchanged (1 allowlisted call, ~13s). The r3 review's staleness sweep (§3/§5.5/§5.6/test header ranges) is applied in this revision.

**Whole-diff R2 disposition (2026-08-01):** one RED finding — whole-receiver structural laundering (`const R: { redirect: RedirectFn } = NextResponse; R.redirect(u)`: zero casts, zero diagnostics; the resolved container is the annotation's own PropertySignature, so both prongs missed; reviewer enumerated eight sibling shapes). Closed by a naked-reference candidate class (probe 7): identifiers named `NextResponse`/`Response` (plus import aliases of NextResponse — any further local alias must spell one of these at its creation site) in value positions flag when their type carries the banned method directly OR via its `redirect` property. Direct method-carry flags in every position except the prong-1-owned callee (`NextResponse.redirect.call(undefined, u)` flags at the inner access); whole-OBJECT carry skips only positions that never yield the object onward (member-access receiver, `new` callee, instanceof RHS, `typeof` operand — N8 pins them quiet). CONSEQUENCE: former limits E1 (receiver-as-any), E2 (widened key), and `Reflect.get` all FLIP TO CAUGHT (R68–R70) — each must spell the class object in a value position before erasing its type. The sole remaining type-erasure limit is string-mediated dynamic access (eval-shaped; new E1 pin). Real tree: unchanged, exactly the one allowlisted call (~14s). The r2 review also noted the committed RED harness's R22 row demonstrates the unresolved-import boundary rather than a resolved re-export — annotated in the harness header; the real sibling-module fixture in the test file is the R22 catch proof.

**R3 disposition (2026-08-01):** NEEDS-ATTENTION, 1 finding (F-R3-1: destructuring-ASSIGNMENT patterns — `({ redirect: f } = NextResponse)` and four sibling forms — use PropertyAssignment/ShorthandPropertyAssignment nodes, invisible to all three prong-2 candidate kinds; target-side types are structurally erased so no target-node query works). Repair: a third candidate class — object-literal members answering the vendored compiler's `getTypeOfAssignmentPattern` — decided by the SOURCE property-symbol's type (probe 6c: all five R3 forms + `Response` twin + array-nested + for-of variants caught; benign assignment destructure and value-position object literals stay clean; regressions hold). R2 repairs were verified by the R3 reviewer.

**R2 disposition (2026-08-01):** NEEDS-ATTENTION, 3 findings, all accepted. F-R2-1 (literal-TYPED computed keys escape a literal-NODE prefilter; 10 zero-diagnostic shapes enumerated) → prong 2 is now TYPE-DECIDED over every non-callee candidate with no syntactic key prefilter, and callee-position candidates are skipped only when prong 1 already flagged the call — closing union-typed-key calls as well (probe 5: all 10 shapes + union-key call/extraction caught; regressions, negatives, E-pins hold; prefilter removal costs ~1.4s). F-R2-2 (redeclared-container claim overbroad) → claim rescoped: the delegator/hand-roller dichotomy replaces the blanket sentence (§5.1). F-R2-3 (committed probe 4 lacked its advertised tree section) → probe rewritten to the final construction with the tree scan included.

**R1 disposition (2026-08-01):** NEEDS-ATTENTION, 7 findings, all accepted. F1 (typed value-flow escapes) is closed structurally by a second matching prong — every non-callee **reference** to the banned method is itself a finding (probe 4: all 12 mutants caught, incl. `as any` value extraction; negatives clean). F2/F3 (mechanism misstatements) fixed against probe-validated mechanics, pure ts-morph. F4 fixture-path contradiction resolved (`__audit_fixture__/` namespace under both roots). F5 `auditTree` contract specified. F6 typecheck overclaim replaced by a no-plain-JS sentinel (probe: zero JS modules under walked roots today). F7 probes now committed at `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe*.mjs` (self-contained) and `tests/cross-cutting/redirect-guard-probes/` (the two that import the audit module — the sheet-icon containment guard's tests/-import boundary bans such imports from docs/, so they live in the exempt tree).

Graduates `BL-SOUND-REDIRECT-GUARD` (BACKLOG.md): replace the syntactic resolution mechanism in `tests/cross-cutting/no-absolute-self-redirect-audit.ts` with type-checker-based callee resolution, so a `NextResponse.redirect` / `Response.redirect` call is recognized by what the callee **is**, not how it is spelled.

## 1. Problem

The guard bans `NextResponse.redirect(...)` (and Web API `Response.redirect`) under `app/` because an absolute `Location` built from `request.url` can flip the host and drop host-scoped cookies (rationale: `lib/http/hostRelativeRedirect.ts` header). The current implementation resolves the callee **syntactically** — a local-name map built from imports, aliases, and destructurings (`resolveBindings` in the audit module). It recognizes 19 spellings, each added after a review probe defeated the prior version. The module header states the residual honestly: a value reaching the call through a helper's return, a class field, a re-export, or dynamic dispatch is not resolved.

**Probe 1 (below) proves all four residual classes escape the current guard.** The BACKLOG entry fences the "keep adding spellings" direction: the resolution mechanism gets replaced, not extended.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Replace syntactic resolution; do NOT add a 20th spelling to the matcher | BACKLOG.md `BL-SOUND-REDIRECT-GUARD` ("Either is a real piece of work, not a patch"); five prior review rounds converged on this |
| Mechanism: type-aware vitest audit (ts-morph over repo tsconfig), not an ESLint rule | §4 approaches; ts-morph is an existing devDependency (`package.json` `ts-morph`) with repo precedent (`lib/audit/noGlobalCursor.ts` `projectSourceFiles`, `tests/cross-cutting/no-raw-codes-audit.ts`) |
| Walked roots: `app/**`, `lib/**`, root `middleware.{ts,tsx}` — extended from `app/` only | §5.3; closes the wrapper-relocation hole; probe 3 shows `lib/` clean today, no middleware file exists |
| Match criterion is TWO-PRONG: (1) calls whose resolved-signature declaration is the banned `redirect` (container `NextResponse`/`Response`); (2) any non-callee reference to that method — extraction is banned outright, no allowlist row can cover it | Probe 2 + probe 4 outputs — prong 2 closes every R1/F1 typed value-flow mutant at the site where `redirect` is spelled; `next/navigation` `redirect` (free function, no container) and local methods named `redirect` stay clean |
| Plain-JS modules are FENCED OUT of the walked roots by a sentinel test, not covered by a typecheck claim | R1/F6 probe: tsconfig `include` lists only TS extensions and `checkJs` is off, so `tsc --noEmit` proves nothing about a standalone `.js` route; zero JS modules exist under `app/`+`lib/` today (`find` probe) |
| Allowlist mechanics unchanged: `path:line` key + exact-argument pin, stale-row + reason meta-tests kept | `EXTERNAL_REDIRECT_ALLOWLIST`, `unallowedRedirects` in the audit module; the pinning rationale comments carry forward verbatim |
| String-mediated dynamic access (eval-shaped) is the sole remaining type-erasure limit; receiver laundering, widened keys, and `Reflect.get` are CAUGHT at the naked class-object reference (whole-diff r2 closure, probe 7) | §7; E1 pins the eval shape; R68–R70 pin the flips |
| Guard soundness is conditional on the tree resolving its imports; the `typecheck` merge gate (`package.json` `typecheck`: `tsc --noEmit`) discharges the condition | §5.6 |
| Finding shape `{line, text, argument}` preserved plus a `kind: "call" \| "reference"` discriminant; test-file structure preserved | §5.1, §5.5 |

## 2. Probe data (probe-before-argue; detector surface)

All probes run 2026-08-01 in the worktree at `origin/main` (0fb6f9efb), Node 20, repo `typescript` ^5 / `ts-morph` ^28.

**Probe 1 — residual classes escape the current guard.** Each fixture run through the current `auditSource`:

```
helper-return:               0 findings (ESCAPES current guard)
class-field:                 0 findings (ESCAPES current guard)
re-export (importing side):  0 findings (ESCAPES current guard)
dynamic dispatch:            0 findings (ESCAPES current guard)
```

Fixture bodies are §6.1 rows R20–R23.

**Probe 2 — type-checker resolution per spelling.** A tsconfig-hosted ts-morph project, fixtures created in-memory, `checker.getResolvedSignature(call)` per call expression. Every one of the 19 legacy spellings AND all four residual classes resolves to:

```
decl name=redirect parent=NextResponse file=node_modules/next/dist/server/web/spec-extension/response.d.ts
```

(the Web API spelling resolves to `decl name=redirect parent=var Response file=typescript/lib/lib.dom.d.ts`). The negatives are cleanly distinguishable:

```
NEGATIVE hostRelativeRedirect        -> decl name=hostRelativeRedirect parent=? file=lib/http/hostRelativeRedirect.ts
NEGATIVE next/navigation redirect    -> decl name=redirect parent=? file=next/dist/client/components/redirect.d.ts
NEGATIVE unrelated method `redirect` -> decl name=redirect parent=Router file=<fixture>
```

`next/navigation`'s `redirect` is a free function — no enclosing class/interface/var container — so the container criterion excludes it without a name carve-out.

**Probe 3 — candidate matcher over the real tree, timed.** Roots `app/** + lib/** + middleware.{ts,tsx}`, every call expression checked through the resolved-signature criterion:

```
files: 633, calls checked: 16070
load: 537ms, check: 10908ms, total: 11445ms
findings (1):
  app/api/auth/google/start/route.ts:72 NextResponse.redirect(data.url, { status: 302 })
```

Exactly the one allowlisted external-OAuth site; zero false positives across a tree that calls `next/navigation` `redirect` routinely. Runtime ~11.5s idle, ~23s under concurrent-session machine load → §5.7 perf budget.

**Probe 4 — the reference prong closes every R1/F1 mutant (round-1 repair).** The R1 review demonstrated, with zero-diagnostic probes, that precise structural typing erases resolved-signature identity: a callback parameter typed `(url: string | URL, status?: number) => Response`, structurally-typed properties (type literal / interface / class field), composite callables (conditional, tuple, object-union), and `.call`/`.apply` adapters all escaped the call-prong alone. Prong 2 — flag every non-callee reference whose type carries a call signature declared by the banned method — catches all of them at the extraction site, where `redirect` is necessarily spelled:

```
OK  F1a callback param            -> reference: NextResponse.redirect
OK  F1b/c/d structural property (type literal / interface / class field) -> reference
OK  F1e/f/g composite (conditional / tuple / object-union)               -> reference
OK  F1h/i/j .call and .apply adapters (NextResponse and Response)        -> reference
OK  F1k renamed destructure `const { redirect: r } = NextResponse`       -> reference
OK  F1l `const f = NextResponse.redirect as any` (VALUE laundering)      -> reference
NEG next/navigation extraction, unrelated-container extraction           -> clean
NEG direct call: exactly 1 hit (no double count)
ALL MUTANTS CLOSED
```

Real-tree run of the two-prong matcher: **0 non-callee `redirect`-named candidates exist in the tree**, findings unchanged (the one allowlisted call), runtime 12.3s — prong 2 is effectively free.

**Probe 4c — escape pins (HISTORICAL — the whole-diff r2/r3 closures later caught these; see probes 7–8).** `(NextResponse as any).redirect(u)` (receiver laundering): 0 findings — remains the documented limit. `const k = "redirect"; NextResponse[k](u)` (const-literal computed key): **caught** by the call prong (the checker resolves literal-typed keys). Widened key (`const k: string = "redirect"` through a `Record` cast): 0 findings — documented limit.

**Probe 5 — type-decided prong 2 closes the R2 literal-typed-key class (round-2 repair).** R2 demonstrated ten zero-diagnostic extraction shapes whose keys are literal-TYPED but not literal NODES (identifier `as const` keys, template keys, const-object keys, enum keys, computed destructuring, string-literal and computed-string bindings, parenthesized/`as const`/`satisfies` element accesses) — all escaping a syntactic candidate filter. With candidates widened to every non-callee `PropertyAccess`/`ElementAccess`/`BindingElement` and the flag decided purely by the node's type:

```
OK  a–j (all ten R2 shapes)                caught (extraction reference)
OK  k union-key CALL, l union-key extraction  caught (callee skipped only when prong 1 flagged)
OK  probe-4 regressions (F1a, F1k, direct-call exactly-one)
NEG hostRelativeRedirect / next-navigation extraction / unrelated-container element access / ordinary array access  clean
E1 receiver-as-any, E2 widened key        still escape (LATER CLOSED by probe 7)
ALL CLOSED
tree scan prefilter=true:  1 finding(s), 11601ms
tree scan prefilter=false: 1 finding(s), 12976ms   <- shipped construction (no prefilter)
```

**Probe 6 — assignment-pattern extraction closed via `getTypeOfAssignmentPattern` (round-3 repair).** R3 demonstrated five zero-diagnostic destructuring-ASSIGNMENT escapes (rename, shorthand, string-literal key, computed literal-typed key, default-valued). Target-side type queries dead-end: name node, initializer, and member node all report the annotated TARGET type (probe 6b transcript — `RedirectFn`, not the method type), so the repair resolves the SOURCE: for any object-literal member whose parent answers the vendored compiler's `getTypeOfAssignmentPattern`, look up the member's property symbol on that source type (computed keys resolved by their literal TYPE value) and check that symbol's type for a banned call signature. Raw-side twin predicates use ts-morph's exported `ts` namespace — the same vendored compiler world, so the F3 nominal-mixing hazard does not recur.

```
OK  X1 rename / X2 shorthand / X3 string-literal key / X4 computed literal-typed key / X5 default
OK  X6 Response twin / X7 nested in array assignment pattern     (+ for-of variant, probe 6d)
NEG ordinary value-position object literal; benign assignment destructure   clean
reg F1k declaration destructure, direct-call exactly-one                    hold
ALL CLOSED
```

**Probe 7 — whole-receiver structural laundering closed at the naked class-object reference (whole-diff r2 repair).** `const R: { redirect: RedirectFn } = NextResponse; R.redirect(u)` erases the container with ZERO casts and ZERO diagnostics — the resolved declaration is the annotation's own PropertySignature. The closure: the class object must be SPELLED (`NextResponse`, `Response`, or an import alias of NextResponse) in a value position for any such flow, so identifiers with those names become candidates, decided by a widened carry predicate (call signatures carry the banned declaration directly, OR the type's `redirect` property does). Direct method-carry flags in every position except a prong-1-owned callee; whole-object carry skips only member-access-receiver / new-callee / instanceof-RHS / typeof-operand positions:

```
OK  W1–W8 whole-receiver shapes (variable, interface, parameter, return, field, generic, array, Response)
OK  W9–W10 aliased-import and namespace-import naked flows
OK  FLIP E1 receiver-as-any / FLIP E2 widened key / FLIP Reflect.get  -> all caught at the naked reference
NEG new NextResponse / .json receiver / instanceof / typeof / Router / benign destructure  clean
reg direct call exactly-one, renamed destructure                       hold
ALL CLOSED
tree: 1 finding(s), 13914ms   (the allowlisted OAuth call; no naked references exist in the tree)
```

**Probe 8 — namespace carriers closed (whole-diff r3 repair).** The class object rides one property deep inside a module-namespace object, so `({ NextResponse: R } = NS)`, object-rest, declaration twins, object-stuffing, and dynamic-import bindings launder with zero diagnostics and no class-name expression. With namespace-import and dynamic-import-bound locals in the candidate set and a one-hop namespace carry:

```
OK  Y1 assignment-destructure / Y2 object-rest / Y3 declaration destructure
OK  Y4 namespace stuffed into object / Y5 dynamic-import naked flow / Y6 dynamic-import stuffed
NEG namespace member call + type-position uses   clean
reg direct-call exactly-one, benign destructure  hold
ALL CLOSED
tree: 633 files, 1 finding(s), 13103ms
```

**Probe 9 — import-call carriers closed (whole-diff r4 repair).** Deciding at the `import("next/server")` call on its awaited type: inline stuffing, declaration/assignment destructuring, promise-carried, and `.then` shapes all flag (Z1–Z5 OK); `import("node:path")` stays quiet. ALL CLOSED.

**Probe 10 — re-export carriers closed by type-decided binding tracking (whole-diff r5 repair).** Renamed/default/namespace/multi-hop re-exports + structural laundering all flag at the naked local (V1–V4 OK); the R22 direct-call regression holds; unrelated import bindings stay untracked; tree unchanged (633 files, 1 finding, 13.8s). ALL CLOSED.

**Probe 11 — renamed-export namespace carriers closed by the module-gated all-property hop (whole-diff r6 repair).** `import * as NS` over `export { NextResponse as Redirector }` (and default-export/dynamic-import twins) stuffed structurally now flags at the naked namespace reference (U1–U3 OK); unrelated namespaces (node:path) stay quiet; tree unchanged (633 files, 1 finding, 12.5s). ALL CLOSED.

**Probe — no plain-JS modules under walked roots (R1/F6).** `find app lib -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs"` (node_modules excluded) → 0 files. tsconfig `include` covers only `**/*.ts`/`**/*.tsx`, `checkJs` off — so the typecheck gate does NOT discharge import resolution for standalone JS; the sentinel in §5.5 fences the class instead.

## 3. Consequence bound (acceptance criterion)

The guard's claim after this work: **in the walked roots, (1) any call whose callee statically resolves to `NextResponse.redirect` or `Response.redirect` is reported, and (2) any other reference to that method OR to the class object carrying it — extraction, storage, passing, adaptation, whole-object flow — is reported at the site where the method name or the class-object name is spelled.** Typed value flow BEYOND a flagged site needs no tracking: the extraction or object flow itself is already a finding (probes 4, 7). Convergence for review is this consequence bound plus the documented-limits section (§7) — NOT "no imaginable defeating input". A hypothetical escape is a finding only with a live probe showing it escaping the CURRENT construction; the sole ratified type-erasure limit is string-mediated dynamic access (eval shape, E1-pinned) — an escape requiring it files to §7 without a round (finding-admissibility contract, AGENTS.md).

## 4. Approaches considered

**A (chosen) — type-aware audit inside the existing vitest harness.** Swap the audit module's resolution core for resolved-signature matching over a tsconfig-hosted ts-morph project. Keeps: the test file's fixture style, the allowlist with argument pin, the stale-row/reason meta-tests, the honest-limits header discipline, the cross-cutting suite placement. Precedent: `lib/audit/noGlobalCursor.ts` already builds `Project({ tsConfigFilePath: "tsconfig.json" })` and consults types (`isUntypedAnyEscape`).

**B — ESLint (`no-restricted-properties` + type-aware custom rule).** Rejected: the syntactic half re-opens the exact spelling arms race the BACKLOG entry fences; a typed custom rule needs type-checked linting wired into `eslint.config.mjs` (repo lint is currently untyped — no `parserOptions.project*` in `eslint.config.mjs`), slowing every lint run for one rule; the allowlist argument-pin and stale-row semantics would need reimplementation as rule options + a companion meta-test anyway; and the guard's claim would then live in two mechanisms with two honesty headers.

**C — raw `ts.createProgram` without ts-morph.** Works (probe 2 uses the raw checker underneath) but re-implements project loading ts-morph already does, against repo precedent. ts-morph justification per BACKLOG: existing devDependency, three existing audit modules use it, tsconfig hosting is one line.

## 5. Design

### 5.1 Audit module: `tests/cross-cutting/no-absolute-self-redirect-audit.ts` (rewritten in place)

Deleted: `parseSource`, `resolveBindings`, `receiverText`, `unwrap`, `isRedirectCall` — the entire syntactic resolution layer, and the raw `typescript` import with it. Kept: `EXTERNAL_REDIRECT_ALLOWLIST` (same rows, same comments), `unallowedRedirects` filter semantics (exact-argument match, same rationale comment). `SelfRedirectFinding` gains a `kind: "call" | "reference"` discriminant (line/text/argument fields unchanged; `argument` is `""` for references).

**Single compiler world (R1/F3).** ts-morph vendors its own compiler (`@ts-morph/common`); its nodes do not satisfy the standalone `typescript` package's nominal types under strict tsc, so the standalone package is not imported at all. The implementation uses ts-morph wrappers (`Node`, `Project`, type guards, `TypeChecker#getResolvedSignature`) for prongs 1–2, matching `lib/audit/noGlobalCursor.ts` idiom, plus raw twins written against ts-morph's exported `ts` namespace — the same vendored world — for the assignment-pattern prong, which needs `checker.compilerObject.getTypeOfAssignmentPattern`. Validated: the §2 probe-4 core typechecks standalone with `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`.

**Banned-declaration predicate** (shared by both prongs; exact mechanics probe-validated, R1/F2):

```ts
function declaredName(decl: Node): string | null {
  if (Node.isMethodDeclaration(decl) || Node.isMethodSignature(decl)) return decl.getName();
  // Function-typed properties resolve to the nameless FunctionTypeNode; the name
  // lives on the enclosing PropertySignature (interface/type literal) or
  // PropertyDeclaration (class field).
  if (Node.isFunctionTypeNode(decl)) {
    const holder = decl.getParent();
    if (Node.isPropertySignature(holder) || Node.isPropertyDeclaration(holder)) return holder.getName();
    return null;
  }
  return null; // FunctionDeclaration (next/navigation's redirect), arrows: never banned
}

function isBannedDecl(decl: Node | undefined): boolean {
  if (decl === undefined) return false;
  if (declaredName(decl) !== "redirect") return false;
  const container = containerName(decl); // nearest named class/interface, or the
  return container === "NextResponse" || container === "Response"; // TypeLiteral's variable
}
```

**Prong 1 — calls:** flag every `CallExpression` where `isBannedDecl(getResolvedSignature(call)?.getDeclaration())`.

**Prong 2 — references (R1/F1 closure; TYPE-DECIDED per R2/F1; assignment patterns per R3/F1; naked class-object flows per whole-diff R2):** candidate nodes are **every** `PropertyAccessExpression`, `ElementAccessExpression`, and `BindingElement` — no syntactic key/name prefilter (R2 showed a literal-NODE filter misses literal-TYPED keys) — **plus every object-literal member (`PropertyAssignment`/`ShorthandPropertyAssignment`) whose parent object literal is an assignment pattern** (via the vendored compiler's `getTypeOfAssignmentPattern`; covers plain assignments, array-nested patterns, for-of heads) — **plus every Identifier whose local name is `NextResponse`/`Response` or an import binding (default, namespace, named — incl. renamed/multi-hop re-exports) whose TYPE carries the banned method, in expression-use position, plus every dynamic `import(...)` call whose awaited module type carries the banned class (flagged at the import spelling — closes every downstream binding/destructure/promise/`.then` shape at once)** (whole-receiver laundering needs no cast, and a namespace object carries the class one property deep — the naked object reference is the finding; any further local alias or deeper stuffing must spell one of these tracked names at its creation site, which closes the name set). The decision is a split carry predicate: **direct carry** (the node's type's call signatures include the banned declaration) flags in EVERY position except the exact callee prong 1 already reported — `NextResponse.redirect.call(undefined, u)` flags at the inner access even though it is a receiver; **whole-object carry** (the type's `redirect` property carries the banned declaration, or — one namespace hop — its `NextResponse`/`Response` property's `redirect` does) additionally skips positions that never yield the object onward — direct member-access receiver, `new` callee, instanceof RHS, `typeof` operand (N8). Assignment-pattern members flag on the SOURCE property-symbol's type — target-side queries see only the annotated target type (probe 6b) — with computed keys resolved by their literal TYPE value; the raw-side predicates are twins written against ts-morph's exported `ts` namespace (same vendored compiler world; no nominal mixing). Rationale: every way to move the method into differently-typed storage yields, at the extraction site, an expression whose type still carries the banned declaration — probe 4 (twelve R1 mutants) and probe 5 (twelve R2 shapes) both close there, and the real tree has zero such references. Extraction findings are unconditionally banned: no allowlist row can cover them (a reference's `argument` is `""`, which never matches a row's pinned argument, and no legitimate external-redirect use needs to extract the method).

**Container matching scope (rescoped per R2/F2):** name-based container matching (class/interface named `NextResponse`/`Response`, or a type literal owned by a variable of that name) covers the genuine `next/server`/lib.dom declarations and vendored/copied declaration-file-style redeclarations of the same shape. It does NOT chase local runtime mimics — an object literal, namespace, type alias, or anonymous class locally named `NextResponse` with its own `redirect` implementation. That space is unbounded and not load-bearing: a mimic either DELEGATES to the real method (its internal call/reference is in a walked file and flags there) or HAND-ROLLS an absolute Location without the banned method (§7 limit 4, outside this guard's claim, same as today). Fenced both directions: extending container matching to mimic shapes is out of scope, and a reviewer claim that a mimic escapes must show it producing the host flip WITHOUT touching the banned method or hand-rolling.

### 5.2 Entry points (contract per R1/F5)

- `auditSource(repoRelativePath, source)` — fixture/single-file entry, signature preserved, returns `SelfRedirectFinding[]`. Creates the file (overwrite) in a lazily-built module-level fixture `Project` (`tsConfigFilePath`, `skipAddingFilesFromTsConfig: true`) so `next/server` and `@/lib/**` resolve from the real filesystem. `addFixtureModule(repoRelativePath, source)` (exported) adds sibling modules to the same project for multi-file fixtures (R22 re-export). Fixture paths live under an `__audit_fixture__/` segment — `app/__audit_fixture__/**` or `lib/__audit_fixture__/**` (R1/F4: the wrapper-in-lib fixture R24 needs a `lib/` path) — and the test file asserts NEITHER directory exists on disk, so fixtures can never shadow real files.
- `auditTree()` — builds a fresh `Project` (same config; separate instance from the fixture project, so fixtures can never leak into the tree audit) with roots `app/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `middleware.{ts,tsx}`. Returns:

  ```ts
  type TreeAudit = {
    findingsByFile: Map<string, SelfRedirectFinding[]>; // key: repo-relative path; every audited file present, [] when clean
    visitedAppFiles: number;   // audited (non-node_modules) files under app/
    visitedLibFiles: number;   // same, under lib/
    plainJsFiles: string[];    // audited files with .js/.jsx/.mjs/.cjs extensions (sentinel input)
  };
  ```

  Replaces the test file's `readdirSync` walk + per-file `readFileSync`. **Run once per test process:** the tree-consuming tests live in one `describe` whose `beforeAll(() => { tree = auditTree(); }, 120_000)` pays the ~12s (23s loaded-machine) build exactly once under its own explicit timeout; every tree assertion — offenders, stale-row live keys, vacuous-walk floors, JS sentinel — reads that shared result. Individual tests then need no elevated timeout.
- `unallowedRedirects(repoRelativePath, findings)` — filter semantics unchanged (exact-argument match against `EXTERNAL_REDIRECT_ALLOWLIST`); operates on prong-1 findings by construction for allowlisting purposes, and passes every `kind: "reference"` finding through unconditionally (see §5.1).

### 5.3 Walked roots

`app/**` (as today) plus `lib/**` plus root `middleware.{ts,tsx}`. Rationale: a helper that WRAPS the call (`export function go(u: URL) { return NextResponse.redirect(u) }` in `lib/`) is invisible to value-flow at the app call site — the resolved signature there is the wrapper's own. The wrapper's INNER call is a direct call, caught iff its file is walked. Probe 3: `lib/` has zero call sites today (the only `NextResponse` use in `lib/http/hostRelativeRedirect.ts` is the constructor, which emits a relative Location and stays unflagged — the criterion matches only `redirect` signatures). No root middleware file exists today; the `middleware.{ts,tsx}` glob future-proofs the one root-level file Next executes on every request. Wrappers in `node_modules` remain out of scope (§7 limit 4).

### 5.4 Fixture compilability

Type resolution requires resolvable identifiers: a snippet that names `NextResponse` without importing it resolves to nothing and is INVISIBLE to the checker. Every fixture therefore becomes a whole compilable module — real `next/server` import plus `declare const request: NextRequest` style ambient declarations for free variables. The 19 legacy fixture bodies keep their call-shape verbatim inside the standard preamble; the two import-spelling fixtures (aliased, namespace) carry their own imports, as today.

### 5.5 Test file: `tests/cross-cutting/no-absolute-self-redirect.test.ts`

- `FLAGGED_SPELLINGS` (19 rows) preserved with the compilable preamble, plus new positive rows R20–R89 (§6.1).
- Negative fixtures (§6.2): `hostRelativeRedirect` (existing), `next/navigation` `redirect` (call AND extraction), a local class method named `redirect` (call AND extraction + `.call` adapter), `new NextResponse(null, { headers: { Location } })`, ordinary element access/destructuring (N6 — pins the no-prefilter widening quiet on normal code).
- Tree tests (one `describe`, shared `beforeAll` scan per §5.2): offenders assertion (message unchanged); stale-row assertion (live keys from prong-1 findings); vacuous-walk floors — `visitedAppFiles > 50`, `visitedLibFiles >= 1`; **no-plain-JS sentinel** (R1/F6) — `plainJsFiles` is empty, with a message stating WHY: tsconfig `include` covers only TS extensions and `checkJs` is off, so a standalone JS module has no typecheck backstop for unresolved identifiers; a team adding one must extend the guard's JS story deliberately (the walk globs already include JS extensions as defense in depth).
- Argument-changed test: the synthetic line-72 fixture becomes a compilable module — import line + padding — with the call landing on line 72, asserted by the fixture's own reported finding line (keeps the padding honest), expect 1 unallowed finding.
- Escape-documentation test (§6.3): the string-mediated (eval-shape) fixture asserted to produce **0 findings** — pinning the one remaining type-erasure limit as behavior so a future change to the boundary trips a test and updates the header deliberately.
- Fixture-shadow assertions: neither `app/__audit_fixture__` nor `lib/__audit_fixture__` exists on disk.

### 5.6 Honesty header rewrite

The module header's claim changes from "these 19 spellings" to: *two-prong resolved-identity matching over the walked roots — every call resolving to `NextResponse.redirect`/`Response.redirect`, and every non-callee reference to that method, is reported. Conditional on the program resolving its imports: for TypeScript files the `typecheck` merge gate (`tsc --noEmit`, `.github/workflows/quality.yml`) enforces that tree-wide; for plain-JS files no such backstop exists, which is why the JS sentinel (§5.5) keeps the walked roots TS-only. It does NOT mean the dynamic class is impossible: §7 limits (string-mediated dynamic access, node_modules wrappers, the JS sentinel condition, hand-rolled Location) remain, stated in the header.* The 19-spelling enumeration moves from "what the guard catches" to "regression floor pinned by fixtures".

### 5.7 Performance budget

Probes 3/4b/5: ~11.5–13s idle (final no-prefilter construction: 12,976ms, probe 5), ~23s under concurrent-session machine load, on this tree (633 files, 16k calls); the type-decided reference prong costs ~1.4s over the call prong alone and produces 0 reference findings on the real tree. Accepted for a cross-cutting audit (the suite already carries whole-project ts-morph audits — `lib/audit/noGlobalCursor.ts` `projectSourceFiles` loads the full tsconfig). The 120s `beforeAll` timeout (§5.2) covers the loaded-machine tail. If tree growth pushes past it, the recorded fallback is root-file batching, not a return to syntactic matching.

## 6. Mutation-family closure set

Every family = fixture + pinned verdict in the test file. A NEW family is admissible in review only with a live escaping mutant against the NEW guard (writing-plans mutation-family closure rule).

### 6.1 Must-flag (positives)

| # | Family | Fixture shape |
| --- | --- | --- |
| R1–R19 | The 19 legacy spellings | existing `FLAGGED_SPELLINGS`, compilable preamble |
| R20 | Helper return | `function pick() { return NextResponse.redirect; } … pick()(new URL(p, request.url))` |
| R21 | Class field holding the method | `class R { go = NextResponse.redirect } … new R().go(…)` |
| R22 | Re-export | `export { NextResponse as Redirector } from "next/server"` in a sibling fixture module (via `addFixtureModule`); `Redirector.redirect(…)` at the call site |
| R23 | Dynamic dispatch (typed) | `const table = { go: NextResponse.redirect }; table["go" as const](…)` |
| R24 | Wrapper in `lib/` | direct `NextResponse.redirect(…)` call in a `lib/__audit_fixture__/` fixture (walked-roots extension) |
| R25 | Callback parameter (R1/F1a) | `invoke(NextResponse.redirect, url)` where `invoke(fn: RedirectFn, …)` is structurally typed |
| R26 | Structural type-literal property (F1b) | `const impl: { redirect: RedirectFn } = { redirect: NextResponse.redirect }; impl.redirect(…)` |
| R27 | Structural interface property (F1c) | same via `interface Redirish` |
| R28 | Structural class-field property (F1d) | `class Impl { redirect: RedirectFn = NextResponse.redirect }` |
| R29 | Conditional composite (F1e) | `(cond ? NextResponse.redirect : safe)(…)` |
| R30 | Tuple composite (F1f) | `[safe, NextResponse.redirect] as const`, indexed call |
| R31 | Object-union composite (F1g) | `cond ? { go: safe } : { go: NextResponse.redirect }`, `.go(…)` |
| R32 | `.call` adapter (F1h) | `NextResponse.redirect.call(NextResponse, …)` |
| R33 | `.apply` adapter (F1i) | `NextResponse.redirect.apply(NextResponse, […])` |
| R34 | Web API adapter (F1j) | `Response.redirect.call(Response, …)` |
| R35 | Renamed destructure extraction (F1k) | `const { redirect: r } = NextResponse; invoke(r, …)` |
| R36 | `as any` VALUE laundering (F1l) | `const f = NextResponse.redirect as any; f(…)` — caught at the extraction reference |
| R37 | Const-literal computed key (probe 4c) | `const k = "redirect"; NextResponse[k](…)` — the checker resolves literal-typed keys |
| R38–R47 | Literal-typed computed extraction, ten shapes (R2/F1, probe 5 a–j) | identifier `as const` key; template key; const-object key; enum key; computed destructuring; string-literal binding; computed-string binding; parenthesized literal access; `as const` access; `satisfies` access — each extracting the method into a `RedirectFn`-typed value |
| R48 | Union-typed-key call (probe 5 k) | `NextResponse[u as "redirect"](…)` — callee checked by prong 2 when prong 1's signature resolution fails |
| R49 | Union-typed-key extraction (probe 5 l) | `const g = NextResponse[u2 as "redirect"]; g(…)` |
| R50–R54 | Destructuring-assignment extraction, five forms (R3/F1, probe 6c X1–X5) | `({ redirect: f } = NextResponse)`; shorthand; string-literal key; computed literal-typed key; default-valued |
| R55 | Assignment-pattern `Response` twin (X6) | `({ redirect: f } = Response)` |
| R56 | Array-nested assignment pattern (X7) | `[{ redirect: f }] = [NextResponse]` |
| R57 | for-of assignment-pattern head (probe 6d) | `for ({ redirect: f } of [NextResponse]) …` |
| R58–R65 | Whole-receiver structural laundering, eight shapes (whole-diff r2, probe 7 W1–W8) | annotated variable; interface-typed variable; parameter; helper return; class field; generic constraint; typed array; `Response` twin — `const R: { redirect: RedirectFn } = NextResponse; R.redirect(…)`, zero casts/diagnostics |
| R66–R67 | Whole-receiver via aliased / namespace import (probe 7 W9–W10) | `import { NextResponse as NR }` then `const R: {…} = NR`; `NS.NextResponse` property-access flow |
| R68 | Receiver-as-any laundering (FORMER limit E1) | `(NextResponse as any).redirect(…)` — caught at the naked reference |
| R69 | Widened computed key (FORMER limit E2) | caught at the naked reference |
| R70 | `Reflect.get(NextResponse, k)` | caught at the naked reference (argument position) |
| R71 | Bare `.call` adapter, no naked thisArg | `NextResponse.redirect.call(undefined, …)` — direct method-carry flags even in receiver position |
| R72–R75 | Namespace carriers (whole-diff r3, probe 8 Y1–Y4) | `({ NextResponse: R } = NS)`; object-rest `({ ...rest } = NS)`; declaration destructure; namespace stuffed into an object — flagged at the naked namespace reference |
| R76–R77 | Dynamic-import carriers (probe 8 Y5–Y6) | `const m = await import("next/server")` then naked `m`/member flows |
| R78–R82 | Import-call carriers, five shapes (whole-diff r4, probe 9 Z1–Z5) | inline awaited-import stuffing; declaration destructuring; assignment destructuring; promise-carried; `.then` callback — all flagged AT the `import("next/server")` call, decided on the awaited type |
| R83–R86 | Re-export carriers, four shapes (whole-diff r5, probe 10 V1–V4) | renamed named re-export; default re-export; re-exported namespace; two-hop chain — each + structural laundering, flagged at the naked local whose BINDING TYPE carries |
| R87–R89 | Renamed-export namespace carriers (whole-diff r6, probe 11 U1–U3) | `import * as NS` over a renamed/default re-export, stuffed structurally; dynamic-import twin — module-symbol types get the ALL-property hop |

### 6.2 Must-not-flag (negatives)

| # | Family | Why safe |
| --- | --- | --- |
| N1 | `hostRelativeRedirect(p, 302)` | sanctioned replacement; free function |
| N2 | `next/navigation` `redirect("/x")` — call AND extraction (`const r = redirect; r("/x")`) | free function, no container; its type's call signatures carry no banned declaration (probe 4 NEG) |
| N3 | Local `class Router { redirect(u) {} }` — call, extraction, AND `.call` adapter | container ≠ NextResponse/Response (probe 4 NEG) |
| N4 | `new NextResponse(null, { status, headers: { Location } })` | constructor, not a `redirect` signature — this is `hostRelativeRedirect`'s own mechanism |
| N5 | Direct banned call produces exactly ONE finding | prong 2 skips a callee only when prong 1 flagged that call — no double count (probes 4/5 NEG) |
| N6 | Ordinary element access / destructuring (`xs[i]`, `const { length } = xs`) | type carries no banned signature (probe 5 NEG — the no-prefilter widening stays quiet on normal code; real tree: 0 reference findings) |
| N7 | Benign assignment destructure and value-position object literals (`({ redirect: g } = src)`; `const o = { redirect: safe }`) | source property type carries no banned signature; value-position literals never answer `getTypeOfAssignmentPattern` (probe 6c NEG) |
| N8 | Non-extracting whole-object positions: `new NextResponse(…)`, `NextResponse.json(…)` receiver, `x instanceof Response`, `typeof Response` | none yields the class object onward (probe 7 NEG) |
| N9 | Ordinary namespace uses: `NS.NextResponse.json(…)`, `NS.NextRequest` type positions | receiver/type positions are non-extracting (probe 8 NEG) |
| N10 | Unrelated import bindings (`import { join } from "node:path"` etc.) | binding type carries nothing banned — the type-decided tracking adds no noise (probe 10 NEG) |

### 6.3 Documented-escape pin (limit asserted as behavior)

| # | Family | Verdict |
| --- | --- | --- |
| E1 | String-mediated dynamic access: the method name reaches the call only inside a string literal (eval shape) | 0 findings — pins §7 limit 1. (The FORMER E1/E2 — receiver-as-any, widened key — and `Reflect.get` are now POSITIVES R68–R70: the whole-diff r2 naked-reference prong catches the class-object spelling their erasure requires.) |

## 7. Documented limits (residual after this work)

1. **String-mediated dynamic access.** `eval("NextResponse.redirect")` or any construct where the name reaches the method only inside a string literal — the one remaining type-erasure escape (E1 pins the shape at 0 findings). Everything short of that now flags: VALUE laundering at the extraction reference (R36), receiver laundering / widened keys / `Reflect.get` at the naked class-object reference they must spell (R68–R70, whole-diff r2 closure). Consequence bound: hiding the name in a string is the loudest possible construct in review and greppable tree-wide.
2. **Soundness is conditional on import resolution — TypeScript files only.** A TS file whose `NextResponse` reference does not resolve fails `tsc --noEmit` (TS2304) at the merge gate. Plain-JS files have NO such backstop (tsconfig `include` is TS-only, `checkJs` off — R1/F6 probe); the §5.5 sentinel therefore keeps the walked roots free of plain-JS modules, and a future JS adoption must extend the guard's JS story deliberately.
3. **`node_modules` wrappers.** A third-party package calling `NextResponse.redirect` internally is outside the walked roots. Unchanged from today.
4. **Hand-rolled absolute Location.** `new NextResponse(null, { headers: { Location: absoluteUrl } })` is not a `redirect` call and never was this guard's claim; `hostRelativeRedirect` is the sanctioned constructor-shaped emitter (N4 pins it clean).

## 8. Deliverables

1. Rewritten `tests/cross-cutting/no-absolute-self-redirect-audit.ts` (two-prong type-aware core, pure ts-morph, exports per §5.2).
2. Updated `tests/cross-cutting/no-absolute-self-redirect.test.ts` (compilable fixtures; R20–R89, N1–N10, E1; memoized tree `describe` with JS sentinel and vacuous-walk floors).
3. BACKLOG graduation: entry moves to `BACKLOG-archive.md` with provenance `test/redirect-guard-type-aware`; one `BACKLOG_GRADUATED` registry row added (registry format per `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the orchestrating session owns that file; this branch adds exactly one row).
4. Probe harness committed at `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe*.mjs` (R1/F7).
5. No production-code changes: `app/`, `lib/` untouched.
