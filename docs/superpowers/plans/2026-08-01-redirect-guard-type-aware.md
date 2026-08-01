# Plan: type-aware self-redirect guard (BL-SOUND-REDIRECT-GUARD)

**Spec:** `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md` (R4 — rounds 1–3 repaired; §1.1 do-not-relitigate, §2 probe data, §6 mutation-family closure set). **Branch:** `test/redirect-guard-type-aware`.

## Pre-draft verification (writing-plans rule)

Verified against live code 2026-08-01: `tests/cross-cutting/no-absolute-self-redirect-audit.ts` exports `SelfRedirectFinding`, `EXTERNAL_REDIRECT_ALLOWLIST` (one row, `app/api/auth/google/start/route.ts:72`, argument `data.url`), `parseSource`, `auditSource`, `unallowedRedirects`; `tests/cross-cutting/no-absolute-self-redirect.test.ts` has 19 `FLAGGED_SPELLINGS` rows and 7 `it` blocks (25 tests, 917ms baseline); `ts-morph` ^28 is a devDependency used by `lib/audit/noGlobalCursor.ts` (tsconfig-hosted `Project` + type queries); `tsconfig.json` has `allowJs: true`, `strict: true`, `include` limited to TS extensions, no `checkJs`; `pnpm typecheck` = `tsc --noEmit` runs in `.github/workflows/quality.yml`; zero `.js/.jsx/.mjs/.cjs` files under `app/` + `lib/`.

**Snippet-typecheck transcript:** the two-prong core (spec §5.1 = probe 4) passed `tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes` standalone. A raw `import ts from "typescript"` variant does NOT typecheck against ts-morph's `compilerObject` (vendored compiler, nominal mismatch) — implementation stays in pure ts-morph wrapper API, matching `lib/audit/noGlobalCursor.ts` idiom. The current audit module's raw-`typescript` import is removed with the syntactic core it served.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/cross-cutting/no-absolute-self-redirect.test.ts` — the guard itself; this arc's whole subject.
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — exactly one `BACKLOG_GRADUATED` row (`{ id: "BL-SOUND-REDIRECT-GUARD", provenance: "test/redirect-guard-type-aware" }`). No other edits to that file (owned by the orchestrating session's concurrent arc).
- No other registry applies: the diff touches no auth, DB, admin-mutation, tile, or Supabase call-boundary surface. No new test files → no testMatch/workflow wiring changes.

## Mutation-family closure

Spec §6 is the closure set (R1–R57 positives, N1–N7 negatives, E1–E2 documented-escape pins). Reviewer-proposed NEW families require a live escaping mutant against the shipped two-prong guard.

## Task 1 — RED: rewrite `tests/cross-cutting/no-absolute-self-redirect.test.ts`

1. Compilable-fixture harness (spec §5.4): standard preamble for the 17 body-only legacy rows —

   ```ts
   const PREAMBLE = `import { NextResponse, NextRequest } from "next/server";
   declare const request: NextRequest;
   declare const req: NextRequest;
   declare const nextRequest: NextRequest;
   declare const cond: boolean;
   declare const p: string;
   export function handler() {\n`;
   const POSTAMBLE = `\n}`;
   ```

   Aliased-import and namespace-import rows stay whole-file fixtures with their own imports. Call-shape text of all 19 rows preserved verbatim (regression floor).
2. New positive rows (spec §6.1): R20 helper-return, R21 class field holding the method, R22 re-export (sibling module via `addFixtureModule`), R23 typed dynamic dispatch, R24 direct call in `lib/__audit_fixture__/` path, R25–R36 the probe-4 F1 families (callback param; structural type-literal/interface/class-field property; conditional/tuple/object-union composite; `.call`/`.apply`/`Response.redirect.call` adapters; renamed destructure; `as any` VALUE laundering), R37 const-literal computed key call, R38–R47 the ten literal-typed-key extraction shapes, R48–R49 union-typed-key call and extraction, R50–R57 destructuring-assignment extraction (five forms + `Response` twin + array-nested + for-of head). Bodies verbatim from `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-probe4-two-prong.mjs`.
3. Negative fixtures (spec §6.2): N2 `next/navigation` call AND extraction; N3 local `Router.redirect` call, extraction, `.call` adapter, element access; N4 `new NextResponse(null, { status: 302, headers: { Location: "/x" } })`; N5 direct banned call yields exactly ONE finding (prong 2 skips a callee only when prong 1 flagged that call); N6 ordinary element access/destructuring stays quiet. N1 `hostRelativeRedirect` exists.
4. Escape pins (spec §6.3): E1 receiver-as-any and E2 widened computed key both `toEqual([])`, comments naming spec §7 limit 1.
5. Tree `describe` with `beforeAll(() => { tree = auditTree(); }, 120_000)` (spec §5.2): offenders assertion (message text unchanged); stale-row live keys from prong-1 findings; vacuous floors `visitedAppFiles > 50`, `visitedLibFiles >= 1`; no-plain-JS sentinel `plainJsFiles == []` with the WHY message (tsconfig include TS-only + checkJs off → no typecheck backstop for JS).
6. Argument-changed test: compilable module with the call landing on line 72 (assert the finding's own line === 72 to keep padding honest), expect 1 unallowed finding.
7. Fixture-shadow assertions: neither `app/__audit_fixture__` nor `lib/__audit_fixture__` exists on disk.
8. Anti-tautology notes: every positive row asserts `findings.length` via the SOURCE fixture (auditSource return), not test-runner side effects; concrete failure mode per new row = "this mutant family silently reintroduces the host flip". N5 pins the exact count (1), not `>0`.

**RED evidence:** run `pnpm exec vitest run tests/cross-cutting/no-absolute-self-redirect.test.ts` at this commit — R20–R37 fail against the syntactic audit (probe 1: four families escape; probe 4: twelve more; R37 inexpressible), N-rows/E-rows/tree-contract calls hit missing exports (`addFixtureModule`, `auditTree`). Record the failure list in the Task 2 commit body.

## Task 2 — GREEN: rewrite `tests/cross-cutting/no-absolute-self-redirect-audit.ts`

1. Delete `parseSource`, `resolveBindings`, `receiverText`, `unwrap`, `isRedirectCall`, `findSelfRedirects`, and the raw `typescript` import. Keep `EXTERNAL_REDIRECT_ALLOWLIST` rows + comments verbatim; keep `unallowedRedirects` exact-argument semantics + rationale comment.
2. `SelfRedirectFinding` gains `kind: "call" | "reference"`; `argument: ""` for references (never matches an allowlist row → references unconditionally banned).
3. Core = spec §5.1 (containerName / declaredName / isBannedDecl / two prongs) — the committed probe-4 mechanics exactly: prong 2 candidates are EVERY non-callee PropertyAccess/ElementAccess/BindingElement, type-decided (`node.getType().getCallSignatures()`), with callee-position skipped only when prong 1 flagged that call; PLUS assignment-pattern object members (Property/ShorthandPropertyAssignment whose parent answers the vendored compiler's `getTypeOfAssignmentPattern`), decided by the SOURCE property-symbol type, with raw-side twin predicates written against ts-morph's exported `ts` namespace.
4. Entry points per spec §5.2: `auditSource` (lazy shared fixture project; paths under `app/__audit_fixture__/` or `lib/__audit_fixture__/`), `addFixtureModule`, `auditTree(): TreeAudit` (fresh project instance; globs `app/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `middleware.{ts,tsx}`; per-file findings incl. empty arrays; visited counts; plainJsFiles).
5. Header rewrite per spec §5.6 (two-prong claim; TS-only import-resolution condition + JS sentinel pointer; §7 limits; 19-spelling list = regression floor).
6. GREEN: full test file passes including tree scan (probe 4b: exactly the one allowlisted finding). Commit `test(cross-cutting): resolve self-redirect callee through the type checker (two-prong)` with the RED transcript in the body.

## Task 3 — `docs: graduate BL-SOUND-REDIRECT-GUARD`

1. Move the BACKLOG.md entry to `BACKLOG-archive.md` (house format; provenance `test/redirect-guard-type-aware`; note: four R1-residual classes + twelve typed value-flow families now caught; receiver-laundering/computed-key/reflection remain documented limits, E-pinned).
2. Add the one `BACKLOG_GRADUATED` registry row.
3. `pnpm exec vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` — the mdast walker polices the move.

## Close-out gates (before push)

- Full `pnpm test` (isolate any failure to rule out sibling-session DB contention before judging), `pnpm typecheck` (vitest strips types — typecheck is the only type gate), `pnpm lint`, `pnpm format:check`.
- Whole-diff cross-model review (codex-guard, fresh-eyes brief, REVIEWER ONLY + verdict line) to APPROVE.
- Push, real CI green, `gh pr merge --merge`, ff-sync main `0 0`; then CronDelete nudge, clear pane label, ship-state `done`.

## Perf note

Tree scan ~11–23s (idle vs loaded machine; probe 3/4b: 633 files, 16,070 calls; reference prong adds no measurable cost — 0 candidates in tree). The 120s `beforeAll` timeout covers the loaded tail. Fallback if growth breaks it: root-file batching — never a return to syntactic matching.
