# Type-aware self-redirect guard (BL-SOUND-REDIRECT-GUARD)

**Status:** R2 — round-1 findings repaired · **Branch:** `test/redirect-guard-type-aware` · **Date:** 2026-08-01

**R1 disposition (2026-08-01):** NEEDS-ATTENTION, 7 findings, all accepted. F1 (typed value-flow escapes) is closed structurally by a second matching prong — every non-callee **reference** to the banned method is itself a finding (probe 4: all 12 mutants caught, incl. `as any` value extraction; negatives clean). F2/F3 (mechanism misstatements) fixed against probe-validated mechanics, pure ts-morph. F4 fixture-path contradiction resolved (`__audit_fixture__/` namespace under both roots). F5 `auditTree` contract specified. F6 typecheck overclaim replaced by a no-plain-JS sentinel (probe: zero JS modules under walked roots today). F7 probes now committed at `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe*.mjs`.

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
| `any`-erasure and reflection remain documented limits, not closed classes | §7; no static analysis closes them; consequence-bounded there |
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

**Probe 4c — escape pins.** `(NextResponse as any).redirect(u)` (receiver laundering): 0 findings — remains the documented limit. `const k = "redirect"; NextResponse[k](u)` (const-literal computed key): **caught** by the call prong (the checker resolves literal-typed keys). Widened key (`const k: string = "redirect"` through a `Record` cast): 0 findings — documented limit.

**Probe — no plain-JS modules under walked roots (R1/F6).** `find app lib -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs"` (node_modules excluded) → 0 files. tsconfig `include` covers only `**/*.ts`/`**/*.tsx`, `checkJs` off — so the typecheck gate does NOT discharge import resolution for standalone JS; the sentinel in §5.5 fences the class instead.

## 3. Consequence bound (acceptance criterion)

The guard's claim after this work: **in the walked roots, (1) any call whose callee statically resolves to `NextResponse.redirect` or `Response.redirect` is reported, and (2) any other reference to that method — extraction, storage, passing, adaptation — is reported at the site where the member name is spelled.** Typed value flow BEYOND an extraction site needs no tracking: the extraction itself is already a finding (probe 4). Convergence for review is this consequence bound plus the documented-limits section (§7) — NOT "no imaginable defeating input". A hypothetical escape is a finding only with a live probe showing it escaping the NEW two-prong guard; escapes that require laundering the RECEIVER before the member access (`(NextResponse as any).redirect`), a non-literal-typed computed key, or reflection/eval file to §7 without a round (finding-admissibility contract, AGENTS.md; boundary pinned by probe 4c).

## 4. Approaches considered

**A (chosen) — type-aware audit inside the existing vitest harness.** Swap the audit module's resolution core for resolved-signature matching over a tsconfig-hosted ts-morph project. Keeps: the test file's fixture style, the allowlist with argument pin, the stale-row/reason meta-tests, the honest-limits header discipline, the cross-cutting suite placement. Precedent: `lib/audit/noGlobalCursor.ts` already builds `Project({ tsConfigFilePath: "tsconfig.json" })` and consults types (`isUntypedAnyEscape`).

**B — ESLint (`no-restricted-properties` + type-aware custom rule).** Rejected: the syntactic half re-opens the exact spelling arms race the BACKLOG entry fences; a typed custom rule needs type-checked linting wired into `eslint.config.mjs` (repo lint is currently untyped — no `parserOptions.project*` in `eslint.config.mjs`), slowing every lint run for one rule; the allowlist argument-pin and stale-row semantics would need reimplementation as rule options + a companion meta-test anyway; and the guard's claim would then live in two mechanisms with two honesty headers.

**C — raw `ts.createProgram` without ts-morph.** Works (probe 2 uses the raw checker underneath) but re-implements project loading ts-morph already does, against repo precedent. ts-morph justification per BACKLOG: existing devDependency, three existing audit modules use it, tsconfig hosting is one line.

## 5. Design

### 5.1 Audit module: `tests/cross-cutting/no-absolute-self-redirect-audit.ts` (rewritten in place)

Deleted: `parseSource`, `resolveBindings`, `receiverText`, `unwrap`, `isRedirectCall` — the entire syntactic resolution layer, and the raw `typescript` import with it. Kept: `EXTERNAL_REDIRECT_ALLOWLIST` (same rows, same comments), `unallowedRedirects` filter semantics (exact-argument match, same rationale comment). `SelfRedirectFinding` gains a `kind: "call" | "reference"` discriminant (line/text/argument fields unchanged; `argument` is `""` for references).

**Pure ts-morph API throughout (R1/F3).** ts-morph vendors its own compiler (`@ts-morph/common`); its nodes do not satisfy the standalone `typescript` package's nominal types under strict tsc. The implementation uses ts-morph wrappers only (`Node`, `Project`, type guards, `TypeChecker#getResolvedSignature`), matching `lib/audit/noGlobalCursor.ts` idiom. Validated: the §2 probe-4 core typechecks standalone with `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`.

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

**Prong 2 — references (R1/F1 closure):** candidate nodes are `PropertyAccessExpression`s named `redirect`, `ElementAccessExpression`s with string-literal argument `"redirect"`, and `BindingElement`s whose property name is `redirect`. Skip candidates in direct-callee position (prong 1 owns those; the allowlist keys on calls). Flag the rest when the node's TYPE carries a banned call signature: `node.getType().getCallSignatures().some(s => isBannedDecl(s.getDeclaration()))`. Rationale: every way to move the method into differently-typed storage must spell the member name once, at the extraction site — probe 4 shows all twelve R1 mutants caught there, including `as any` VALUE laundering, and the real tree has zero such references. Extraction findings are unconditionally banned: no allowlist row can cover them (a reference's `argument` is `""`, which never matches a row's pinned argument, and no legitimate external-redirect use needs to extract the method).

Deliberately name-based container matching, not declaration-path-based: a vendored or re-declared `NextResponse`/`Response` with a `redirect` member still flags. Default-deny — a false positive on a hypothetical innocent class named `NextResponse` is a visible, allowlistable event, not a silent miss.

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

- `FLAGGED_SPELLINGS` (19 rows) preserved with the compilable preamble, plus new positive rows R20–R24 and R25–R37 (§6.1).
- Negative fixtures (§6.2): `hostRelativeRedirect` (existing), `next/navigation` `redirect` (call AND extraction), a local class method named `redirect` (call AND extraction + `.call` adapter), `new NextResponse(null, { headers: { Location } })`.
- Tree tests (one `describe`, shared `beforeAll` scan per §5.2): offenders assertion (message unchanged); stale-row assertion (live keys from prong-1 findings); vacuous-walk floors — `visitedAppFiles > 50`, `visitedLibFiles >= 1`; **no-plain-JS sentinel** (R1/F6) — `plainJsFiles` is empty, with a message stating WHY: tsconfig `include` covers only TS extensions and `checkJs` is off, so a standalone JS module has no typecheck backstop for unresolved identifiers; a team adding one must extend the guard's JS story deliberately (the walk globs already include JS extensions as defense in depth).
- Argument-changed test: the synthetic line-72 fixture becomes a compilable module — import line + padding — with the call landing on line 72, asserted by the fixture's own reported finding line (keeps the padding honest), expect 1 unallowed finding.
- Escape-documentation tests (§6.3): receiver-laundering and widened-key fixtures asserted to produce **0 findings** — pinning each documented limit as behavior so a future change to the boundary trips a test and updates the header deliberately.
- Fixture-shadow assertions: neither `app/__audit_fixture__` nor `lib/__audit_fixture__` exists on disk.

### 5.6 Honesty header rewrite

The module header's claim changes from "these 19 spellings" to: *two-prong resolved-identity matching over the walked roots — every call resolving to `NextResponse.redirect`/`Response.redirect`, and every non-callee reference to that method, is reported. Conditional on the program resolving its imports: for TypeScript files the `typecheck` merge gate (`tsc --noEmit`, `.github/workflows/quality.yml`) enforces that tree-wide; for plain-JS files no such backstop exists, which is why the JS sentinel (§5.5) keeps the walked roots TS-only. It does NOT mean the dynamic class is impossible: §7 limits (receiver laundering, non-literal computed keys, reflection, node_modules wrappers) remain, stated in the header.* The 19-spelling enumeration moves from "what the guard catches" to "regression floor pinned by fixtures".

### 5.7 Performance budget

Probe 3/4b: ~11.5s idle, ~23s under concurrent-session machine load, on this tree (633 files, 16k calls); the reference prong adds no measurable cost (0 candidates in the real tree). Accepted for a cross-cutting audit (the suite already carries whole-project ts-morph audits — `lib/audit/noGlobalCursor.ts` `projectSourceFiles` loads the full tsconfig). The 120s `beforeAll` timeout (§5.2) covers the loaded-machine tail. If tree growth pushes past it, the recorded fallback is root-file batching, not a return to syntactic matching.

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

### 6.2 Must-not-flag (negatives)

| # | Family | Why safe |
| --- | --- | --- |
| N1 | `hostRelativeRedirect(p, 302)` | sanctioned replacement; free function |
| N2 | `next/navigation` `redirect("/x")` — call AND extraction (`const r = redirect; r("/x")`) | free function, no container; its type's call signatures carry no banned declaration (probe 4 NEG) |
| N3 | Local `class Router { redirect(u) {} }` — call, extraction, AND `.call` adapter | container ≠ NextResponse/Response (probe 4 NEG) |
| N4 | `new NextResponse(null, { status, headers: { Location } })` | constructor, not a `redirect` signature — this is `hostRelativeRedirect`'s own mechanism |
| N5 | Direct banned call produces exactly ONE finding | callee-position skip in prong 2 — no double count (probe 4 NEG) |

### 6.3 Documented-escape pins (limits asserted as behavior; boundary probed, 4c)

| # | Family | Verdict |
| --- | --- | --- |
| E1 | `(NextResponse as any).redirect(…)` — RECEIVER laundered before member access | 0 findings — pins §7 limit 1 |
| E2 | Widened computed key: `const k: string = "redirect"; (NextResponse as Record<string, Function>)[k]!(…)` | 0 findings — pins §7 limit 1 |

## 7. Documented limits (residual after this work)

1. **Receiver laundering and widened keys.** Casting the RECEIVER before the member access (`(NextResponse as any).redirect(u)`) or reaching the member through a non-literal-typed computed key erases the declaration before the member name resolves — probe 4c pins both (E1, E2). VALUE laundering (`NextResponse.redirect as any`) is NOT in this class anymore: the extraction reference flags first (R36). Consequence bound: both residual shapes require a deliberate, visible cast on the `NextResponse`/`Response` receiver itself, the loudest possible construct in review; strict mode keeps implicit `any` out.
2. **Reflection/eval.** `Reflect.get(NextResponse, k)`, `eval`. Same consequence bound as 1.
3. **Soundness is conditional on import resolution — TypeScript files only.** A TS file whose `NextResponse` reference does not resolve fails `tsc --noEmit` (TS2304) at the merge gate. Plain-JS files have NO such backstop (tsconfig `include` is TS-only, `checkJs` off — R1/F6 probe); the §5.5 sentinel therefore keeps the walked roots free of plain-JS modules, and a future JS adoption must extend the guard's JS story deliberately.
4. **`node_modules` wrappers.** A third-party package calling `NextResponse.redirect` internally is outside the walked roots. Unchanged from today.
5. **Hand-rolled absolute Location.** `new NextResponse(null, { headers: { Location: absoluteUrl } })` is not a `redirect` call and never was this guard's claim; `hostRelativeRedirect` is the sanctioned constructor-shaped emitter (N4 pins it clean).

## 8. Deliverables

1. Rewritten `tests/cross-cutting/no-absolute-self-redirect-audit.ts` (two-prong type-aware core, pure ts-morph, exports per §5.2).
2. Updated `tests/cross-cutting/no-absolute-self-redirect.test.ts` (compilable fixtures; R20–R37, N1–N5, E1–E2; memoized tree `describe` with JS sentinel and vacuous-walk floors).
3. BACKLOG graduation: entry moves to `BACKLOG-archive.md` with provenance `test/redirect-guard-type-aware`; one `BACKLOG_GRADUATED` registry row added (registry format per `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the orchestrating session owns that file; this branch adds exactly one row).
4. Probe harness committed at `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe*.mjs` (R1/F7).
5. No production-code changes: `app/`, `lib/` untouched.
