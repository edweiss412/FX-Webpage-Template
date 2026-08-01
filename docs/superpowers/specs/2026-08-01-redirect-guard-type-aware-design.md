# Type-aware self-redirect guard (BL-SOUND-REDIRECT-GUARD)

**Status:** DRAFT for adversarial review · **Branch:** `test/redirect-guard-type-aware` · **Date:** 2026-08-01

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
| Match criterion: resolved-signature declaration named `redirect` whose enclosing named container is `NextResponse` or `Response` | Probe 2 output — every offending spelling resolves there; `next/navigation` `redirect` (free function, no container) and local methods named `redirect` (container ≠ those names) do not |
| Allowlist mechanics unchanged: `path:line` key + exact-argument pin, stale-row + reason meta-tests kept | `EXTERNAL_REDIRECT_ALLOWLIST`, `unallowedRedirects` in the audit module; the pinning rationale comments carry forward verbatim |
| `any`-erasure and reflection remain documented limits, not closed classes | §7; no static analysis closes them; consequence-bounded there |
| Guard soundness is conditional on the tree resolving its imports; the `typecheck` merge gate (`package.json` `typecheck`: `tsc --noEmit`) discharges the condition | §5.6 |
| Finding shape `{line, text, argument}` and test-file structure preserved | §5.5 |

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

Exactly the one allowlisted external-OAuth site; zero false positives across a tree that calls `next/navigation` `redirect` routinely. Runtime ~11.5s → §5.7 perf budget.

## 3. Consequence bound (acceptance criterion)

The guard's claim after this work: **any call expression in the walked roots whose callee statically resolves to `NextResponse.redirect` or `Response.redirect` is reported, regardless of spelling or value flow.** Convergence for review is this consequence bound plus the documented-limits section (§7) — NOT "no imaginable defeating input". A hypothetical escape is a finding only with a live probe showing it escaping the NEW guard while producing the host flip; escapes that require defeating the type system (`as any`, reflection) file to §7 without a round (finding-admissibility contract, AGENTS.md).

## 4. Approaches considered

**A (chosen) — type-aware audit inside the existing vitest harness.** Swap the audit module's resolution core for resolved-signature matching over a tsconfig-hosted ts-morph project. Keeps: the test file's fixture style, the allowlist with argument pin, the stale-row/reason meta-tests, the honest-limits header discipline, the cross-cutting suite placement. Precedent: `lib/audit/noGlobalCursor.ts` already builds `Project({ tsConfigFilePath: "tsconfig.json" })` and consults types (`isUntypedAnyEscape`).

**B — ESLint (`no-restricted-properties` + type-aware custom rule).** Rejected: the syntactic half re-opens the exact spelling arms race the BACKLOG entry fences; a typed custom rule needs type-checked linting wired into `eslint.config.mjs` (repo lint is currently untyped — no `parserOptions.project*` in `eslint.config.mjs`), slowing every lint run for one rule; the allowlist argument-pin and stale-row semantics would need reimplementation as rule options + a companion meta-test anyway; and the guard's claim would then live in two mechanisms with two honesty headers.

**C — raw `ts.createProgram` without ts-morph.** Works (probe 2 uses the raw checker underneath) but re-implements project loading ts-morph already does, against repo precedent. ts-morph justification per BACKLOG: existing devDependency, three existing audit modules use it, tsconfig hosting is one line.

## 5. Design

### 5.1 Audit module: `tests/cross-cutting/no-absolute-self-redirect-audit.ts` (rewritten in place)

Deleted: `parseSource`, `resolveBindings`, `receiverText`, `unwrap`, `isRedirectCall` — the entire syntactic resolution layer. Kept: `SelfRedirectFinding` (same fields), `EXTERNAL_REDIRECT_ALLOWLIST` (same rows, same comments), `unallowedRedirects` filter semantics (exact-argument match, same rationale comment).

New core:

```ts
function isBannedRedirectCall(checker: ts.TypeChecker, call: ts.CallExpression): boolean
```

1. `sig = checker.getResolvedSignature(call)`; no signature or no declaration → not banned (see §7 limit 1).
2. Declaration must be named `redirect`. Declaration kinds accepted: `MethodDeclaration`, `MethodSignature`, `PropertySignature` whose type is a function (covers `var Response: { redirect(...) }`-shaped constructor types). `FunctionDeclaration` is never banned — that shape is `next/navigation`'s `redirect` (probe 2).
3. Enclosing named container (nearest `ClassDeclaration`/`InterfaceDeclaration` ancestor name, or the `VariableDeclaration` name when the declaration sits in a `TypeLiteral` initializer/type) must be `NextResponse` or `Response`.

Deliberately name-based, not declaration-path-based: a vendored or re-declared `NextResponse`/`Response` with a `redirect` member still flags. Default-deny — a false positive on a hypothetical innocent class named `NextResponse` is a visible, allowlistable event, not a silent miss.

### 5.2 Entry points

- `auditSource(repoRelativePath, source)` — fixture/single-file entry, signature preserved. Creates the file (overwrite) in a lazily-built module-level fixture `Project` (`tsConfigFilePath`, `skipAddingFilesFromTsConfig: true`) so `next/server` and `@/lib/**` resolve from the real filesystem. Fixture paths live under `app/__audit_fixture__/**` — a directory that must not exist on disk (meta-assertion in the test file) so fixtures can never shadow real files.
- `auditTree()` — builds a fresh `Project` with roots `app/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `middleware.{ts,tsx}`; returns findings per repo-relative path for all non-`node_modules` source files. Replaces the test file's `readdirSync` walk + per-file `readFileSync` (module resolution needs the project anyway; a separate manual walk would double-read the tree).
- `unallowedRedirects(...)` — unchanged filter, now over `auditTree()`/`auditSource` output.

### 5.3 Walked roots

`app/**` (as today) plus `lib/**` plus root `middleware.{ts,tsx}`. Rationale: a helper that WRAPS the call (`export function go(u: URL) { return NextResponse.redirect(u) }` in `lib/`) is invisible to value-flow at the app call site — the resolved signature there is the wrapper's own. The wrapper's INNER call is a direct call, caught iff its file is walked. Probe 3: `lib/` has zero call sites today (the only `NextResponse` use in `lib/http/hostRelativeRedirect.ts` is the constructor, which emits a relative Location and stays unflagged — the criterion matches only `redirect` signatures). No root middleware file exists today; the `middleware.{ts,tsx}` glob future-proofs the one root-level file Next executes on every request. Wrappers in `node_modules` remain out of scope (§7 limit 4).

### 5.4 Fixture compilability

Type resolution requires resolvable identifiers: a snippet that names `NextResponse` without importing it resolves to nothing and is INVISIBLE to the checker. Every fixture therefore becomes a whole compilable module — real `next/server` import plus `declare const request: NextRequest` style ambient declarations for free variables. The 19 legacy fixture bodies keep their call-shape verbatim inside the standard preamble; the two import-spelling fixtures (aliased, namespace) carry their own imports, as today.

### 5.5 Test file: `tests/cross-cutting/no-absolute-self-redirect.test.ts`

- `FLAGGED_SPELLINGS` (19 rows) preserved with the compilable preamble, plus new rows R20–R23 (§6.1) and the wrapper-in-lib and JS-ESM rows R24–R25.
- Negative fixtures: `hostRelativeRedirect` (existing), `next/navigation` `redirect`, a local class method named `redirect`, `new NextResponse(null, { headers: { Location } })`.
- Tree test: `every NextResponse.redirect under the walked roots is allow-listed` via `auditTree()`.
- Stale-row test, reason/argument-pin row test: unchanged semantics.
- Argument-changed test: the synthetic line-72 fixture becomes a compilable module padded so the call still lands on line 72 (the current bare-padding string would be invisible to the checker).
- Vacuous-walk sentinel: `auditTree()` visited > 50 files under `app/` AND ≥ 1 file under `lib/` (extended roots get their own floor).
- Escape-documentation test: the `as any` laundering fixture (§7 limit 1) asserted to produce **0 findings** — pinning the documented limit as behavior so a future "fix" that silently changes the boundary trips a test and updates the header deliberately.
- Perf: the audit builds one `Project` per run (~12s, probe 3). Test timeout set explicitly (60s) on the tree test.

### 5.6 Honesty header rewrite

The module header's claim changes from "these 19 spellings" to: *resolved-callee identity over the walked roots, conditional on the program resolving its imports — a condition the `typecheck` merge gate (`tsc --noEmit`) enforces tree-wide. A green audit + green typecheck means: no call whose callee statically resolves to `NextResponse.redirect`/`Response.redirect` exists outside the allowlist. It does NOT mean the dynamic class is impossible: §7 limits (`any`-erasure, reflection, node_modules wrappers) remain, stated in the header.* The 19-spelling enumeration moves from "what the guard catches" to "regression floor pinned by fixtures".

### 5.7 Performance budget

Probe 3: ~11.5s total on this tree (633 files, 16k calls). Accepted for a cross-cutting audit (the suite already carries whole-project ts-morph audits — `lib/audit/noGlobalCursor.ts` `projectSourceFiles` loads the full tsconfig). If tree growth pushes past the 60s timeout, the recorded fallback is root-file batching, not a return to syntactic matching.

## 6. Mutation-family closure set

Every family = fixture + pinned verdict in the test file. A NEW family is admissible in review only with a live escaping mutant against the NEW guard (writing-plans mutation-family closure rule).

### 6.1 Must-flag (positives)

| # | Family | Fixture shape |
| --- | --- | --- |
| R1–R19 | The 19 legacy spellings | existing `FLAGGED_SPELLINGS`, compilable preamble |
| R20 | Helper return | `function pick() { return NextResponse.redirect; } … pick()(new URL(p, request.url))` |
| R21 | Class field | `class R { go = NextResponse.redirect } … new R().go(…)` |
| R22 | Re-export | `export { NextResponse as Redirector } from "next/server"` in a sibling fixture module; `Redirector.redirect(…)` at the call site |
| R23 | Dynamic dispatch (typed) | `const table = { go: NextResponse.redirect }; table["go" as const](…)` |
| R24 | Wrapper in `lib/` | direct `NextResponse.redirect(…)` call in a `lib/`-path fixture (walked-roots extension) |
| R25 | JS ESM route | a plain-JavaScript route fixture (.js extension) with ESM `import { NextResponse } from "next/server"` (allowJs is on: `tsconfig.json` `allowJs`) |

### 6.2 Must-not-flag (negatives)

| # | Family | Why safe |
| --- | --- | --- |
| N1 | `hostRelativeRedirect(p, 302)` | sanctioned replacement; free function |
| N2 | `next/navigation` `redirect("/x")` | free function, no container (probe 2) |
| N3 | Local `class Router { redirect(u) {} }` | container ≠ NextResponse/Response |
| N4 | `new NextResponse(null, { status, headers: { Location } })` | constructor, not a `redirect` signature — this is `hostRelativeRedirect`'s own mechanism |

### 6.3 Documented-escape pins (limits asserted as behavior)

| # | Family | Verdict |
| --- | --- | --- |
| E1 | `(NextResponse as any).redirect(…)` | 0 findings — pins §7 limit 1 |

## 7. Documented limits (residual after this work)

1. **Type erasure.** A callee laundered through `any`/`unknown`/`Function` (`(NextResponse as any).redirect(u)`, an `any`-typed dispatch table) resolves to no matching declaration and is invisible. No static analysis closes this. Consequence bound: the laundering cast is loud in review, and strict mode (`tsconfig.json` `strict`) keeps *implicit* `any` out — the escape requires a deliberate visible cast. Pinned as E1.
2. **Reflection/eval.** `Reflect.get`, computed non-literal member names, `eval`. Same class as 1; visible constructs.
3. **Soundness is conditional on import resolution.** A file whose `NextResponse` reference does not resolve (missing import) hides the call from the checker — and fails `tsc --noEmit` (TS2304), which the typecheck merge gate runs tree-wide. The guard's claim is joint with that gate.
4. **`node_modules` wrappers.** A third-party package calling `NextResponse.redirect` internally is outside the walked roots. Unchanged from today.
5. **Hand-rolled absolute Location.** `new NextResponse(null, { headers: { Location: absoluteUrl } })` is not a `redirect` call and never was this guard's claim; `hostRelativeRedirect` is the sanctioned constructor-shaped emitter.

## 8. Deliverables

1. Rewritten `tests/cross-cutting/no-absolute-self-redirect-audit.ts` (type-aware core, same exports where stated).
2. Updated `tests/cross-cutting/no-absolute-self-redirect.test.ts` (compilable fixtures; R20–R25, N1–N4, E1; tree test over `auditTree()`; timeout).
3. BACKLOG graduation: entry moves to `BACKLOG-archive.md` with provenance `test/redirect-guard-type-aware`; one `BACKLOG_GRADUATED` registry row added (registry format per `tests/docs/_metaDeferralLedgerGraduation.test.ts` — the orchestrating session owns that file; this branch adds exactly one row).
4. No production-code changes: `app/`, `lib/` untouched.
