# Handoff — X.3: Single auth-validation entry point — semantic audit (AC-X.3)

**Handed off:** 2026-05-19 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md "X.\* — Cross-cutting" row — backend AST/audit infrastructure, no UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (reviewer-pairing logic — Codex implements → Opus reviews, per ROUTING.md + memory `feedback_iterate_until_convergence.md` + the X.1 R2 lesson — Opus reviewer caught 2 P0 findings Codex's same-model self-review missed; X.2 then converged on R1 with the lineage carried forward).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md` — Task X.3 only (lines 431–1457).

> X.3 is the third of six cross-cutting audit tasks (X.1–X.6). No §A/§B split — pure backend test/audit infrastructure (ts-morph AST control-flow + dominator analysis with cross-import call graph + trust-domain classifier + outcome-discriminator audit + DYNAMIC_FROM_ALLOWLIST semantic-identity machinery + ~30 regression fixtures + spec-§4.3-driven admin-tables generator + CI workflow extension). UI hard rule N/A — no file under `app/` (outside `app/api/**`), `components/`, or design tokens is mutated.

> **X.3 is the structural enforcement of AGENTS.md §1.9-adjacent invariants and the canonical multi-guard state machine pattern.** Per memory `feedback_multi_guard_state_machine_incomplete_gate.md` (M10 R4-R5 + M5 R20 + M8 R3 H1), recurring class: a decision branch makes a terminal transition based on guard X but forgets to also check guard Y. Per-pin reviews audit guards individually; only multi-guard integration audit catches the composition. X.3 IS the multi-guard integration audit for the auth-validation entry-point class. The canonical example it catches: M10 R3's admin-precedence bug, where `/api/report` accepted a `validateLinkSession` success before checking `isAdminSession`, silently downgrading admin-context reports to crew (fix shipped at `e54babe`). X.3 makes that bug class statically impossible by requiring `isAdminSession(req)` as the guard predicate for B1 admin-precedence; any route that calls `validateLinkSession` before that guard fails the audit on every non-admin branch.

> **X.3 catches the bug class neither X.1 nor X.2 can.** X.1 enforces three-way catalog parity (spec ↔ catalog ↔ scenario). X.2 enforces that no raw code-shaped identifier reaches user-visible render output. Both presume the protected route HAS gated correctly — neither verifies the gate itself. X.3 verifies the gate, statically, with control-flow + dominator analysis on the call graph. Together X.1 + X.2 + X.3 close the spec ↔ catalog ↔ producer ↔ render ↔ route-gating coverage triad.

> **Same-model self-review pattern (X.1 R2 lesson, attenuated by X.2 R1 win).** X.1's R1 (Codex self-review) missed 2 P0 + 4 minor that R2 (Opus) caught; X.2's R1 (Codex impl + Opus review) converged first round. X.3's complexity is closer to X.1's (~30 fixtures, multi-layer AST machinery, semantic-identity allowlist) than to X.2's (single AST walker + manifest). Expect 1–3 rounds; do NOT assume R1 APPROVE without verification of the M10 R3 admin-precedence fixture pair AND the wrapped-inline-route-handler `enclosing_symbol` stability tests — those are the highest-risk pre-emptable failure modes.

> **Pre-existing scaffolding at handoff base.** `tests/cross-cutting/auth.test.ts` (150 lines) and `lib/audit/authChain.ts` (253 lines) are M5-era smoke-test precursors. They cover real M5 crew/me/redeem-link/OAuth surfaces but do NOT implement the full X.3 machinery (no `PROTECTED_SINKS` from spec §4.3, no `classifyTrustDomain`, no `findServerActionsInFile`, no `findRequestEntries` for `generateMetadata`/`loading`/`not-found`/`head`/`template`, no `verifyOutcomeDiscriminators`, no `DYNAMIC_FROM_ALLOWLIST` semantic-identity, no `getEnclosingSymbol` wrapped-route-handler pattern, no `fingerprintCallSite` stability test, no CI workflow exposure). X.3 EXTENDS this file — preserve existing tests as the "real-route smoke" suite and add the spec-driven audit framework around them. Do NOT delete the existing tests; they catch the M5 surfaces the spec-driven audit must also pass.

---

## 1. Spec sections in scope

Exhaustive, not representative.

- **§7.2** — Signed-link redemption flow (the `__Host-fxav_session` cookie mint that the auth chain validates).
- **§7.2.1** — `link_sessions` schema (the table that BANNED_OUTSIDE_AUTH_LIB protects against direct access).
- **§7.2.2** — 12-step `validateLinkSession` validator + the cross-show `validateGoogleIdentity` amendment (the `/me` trust-domain split that X.3's `me` classification enforces).
- **§7.2.3** — Signing-key rotation (not directly audited, but the validators X.3 references must already honor it).
- **§7.3** — Authorization gate "Google session OR redeemed-link cookie OR admin" — the OR semantics that `CREW_SESSION_CHAINS` encodes as B1/B2/B3/B4 terminal-success branches.
- **§7.4** — `getShowForViewer` chain + role re-derivation — `getShowForViewer` is a PROTECTED_SINK; the audit verifies validator-before-getShowForViewer on every reachable path.
- **§4.3** — Admin-only / crew-readable table partitioning. X.3's `PROTECTED_SINKS` regex list is GENERATED from §4.3 at build time via `scripts/generate-admin-tables.ts` → `lib/audit/admin-tables.generated.ts` (19 admin-only tables as of 2026-05-19 — see plan ~line 690). The same generator's output is the input for AC-2.5 (M2's admin-table parity) AND AC-X.6 (traceability matrix), per the plan's cross-cutting parity gate at ~line 8019.
- **§13.2.3 amendments 1–3** — N/A directly for X.3 (those are M8 implementation contracts). X.3 audits whether `app/api/report/route.ts` is in `PROTECTED_ROUTES` with `chain: CREW_SESSION_CHAINS` and whether its actual control flow honors B1–B4, but X.3 itself does not author any amendment behavior.
- **§17.2** — AC-X.3 + AC-X.6. AC-X.3 names the audit shape verbatim ("Auth-chain — every protected sink runs AFTER terminal-validator success on every control-flow path"). AC-X.6 names the required CI status check `x3-trust-domain` verbatim.
- **AGENTS.md §1.5 / §1.9 / multi-guard state machine memory** — X.3 is the canonical structural enforcement of the "every protected sink runs AFTER terminal-validator success" invariant; replaces every prior advisory grep / convention-only check.

## 2. Acceptance criteria

**Primary AC (verbatim from spec §17.2):**

- **AC-X.3** — **Auth-chain — every protected sink runs AFTER terminal-validator success on every control-flow path.** Static analysis classifies every route by trust domain (crew-session / admin / me / auth-library / public-bootstrap / public-webhook / cron-internal / server-action / non-route); AST control-flow + dominator analysis with cross-import call graph asserts the validator chain (B1 admin-precedence, B2 link-wins, B3 link-continue → google, B4 link-continue → google-continue → admin) runs to a terminal `success` discriminator BEFORE any `PROTECTED_SINKS` member fires. **Outcome-discriminator audit (`verifyOutcomeDiscriminators`)**: every validator's `kind === 'success' | 'continue'` discriminator MUST be inspected before sinks/next-validator. **`PROTECTED_SINKS` table list is GENERATED from spec §4.3 admin-only list at build time** (NOT hand-rolled) — currently 19 admin-only tables; future §4.3 additions auto-propagate. **`AUTH_LIB_ALLOWLIST`** carries the small set of files that legitimately touch auth primitives. **`.rpc(...)` calls are protected-by-default** (empty initial `RPC_ALLOWLIST`); non-literal RPC names are ALWAYS sinks. **`.from(...)` calls with non-literal arguments** are ALWAYS treated as protected sinks unless explicitly allowlisted via `DYNAMIC_FROM_ALLOWLIST` (initially empty; entries require reviewed justification, keyed on `(file, enclosing_symbol, fingerprint)` semantic identity NOT `(file, line, columnRange)`).

**Task-internal sub-criteria (from plan Task X.3, `11-cross-cutting.md:431-1457`):**

- **Trust-domain classifier** at `lib/audit/trustDomains.ts` (or co-located in `lib/audit/authChain.ts`) — `classifyTrustDomain(path)` returns exactly one of `crew-session | admin | me | auth-library | public-bootstrap | public-webhook | cron-internal | server-action | non-route | unclassified`. **Unclassified files under `app/api/`, `app/admin/`, `app/show/`, `app/me/` fail CI immediately** — forces the engineer to declare trust domain explicitly. Server-action AST detection runs FIRST, before any path-based skip (so inline `'use server'` in component files does NOT escape audit).
- **`PROTECTED_SINKS` regex list** is build-generated from spec §4.3 admin-only bullets via NEW `scripts/generate-admin-tables.ts` → committed `lib/audit/admin-tables.generated.ts` (`readonly string[]`, NOT object array with `.name`). The generator output drives `ADMIN_FROM_REGEXES = ADMIN_TABLES.map(t => new RegExp(\`\\.from\\(['"\`]${t}['"\`]\\)\`))`; the canonical 19-table bootstrap set is enumerated at plan ~line 763 (`ADMIN_BOOTSTRAP_NAMES`). The crew-readable additions (`shows`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`) are appended as fixed regexes. Service-role + Storage + Drive + `getShowForViewer` are also sinks per plan ~line 787-794.
- **`AUTH_LIB_ALLOWLIST`** enumerates: `lib/auth/jwt.ts`, `lib/auth/validateLinkSession.ts`, `lib/auth/validateGoogleSession.ts`, `lib/auth/validateGoogleIdentity.ts`, `lib/auth/requireAdmin.ts`, `lib/auth/isAdminSession.ts`, `lib/auth/cookies.ts`, `lib/auth/constants.ts`, `app/api/auth/redeem-link/route.ts`, `middleware.ts` (plan ~line 579-589). Plus the bootstrap-shell `/show/<slug>/p` mint surface IF/WHEN it INSERTs `bootstrap_nonces` (plan ~line 1428 fixture mandates allowlist entry if not already present).
- **`BANNED_OUTSIDE_AUTH_LIB`** scans BOTH `Identifier` AND `StringLiteral` AND `NoSubstitutionTemplateLiteral` AST nodes (plan ~line 595-602, 1167-1189): `link_sessions`, `crew_member_auth`, `revoked_links`, `verifyLinkJwt`, `__Host-fxav_session` (literal-only after per-show-naming retirement). Catches `from('link_sessions')` which the Identifier-only scan misses.
- **`RPC_ALLOWLIST`** starts EMPTY. Non-literal RPC names are ALWAYS sinks (plan ~line 803-826). `isProtectedRpcCall(node)` is the predicate.
- **`DYNAMIC_FROM_ALLOWLIST`** starts EMPTY. Entries keyed on `(file, enclosing_symbol, fingerprint)` semantic identity (NOT `(file, line, columnRange)`). `getEnclosingSymbol(node)` MUST handle the wrapped inline route handler pattern (`export const GET = withAdmin(async (req) => { ... })`) by composing `<file>::GET->withAdmin[0]`; nested wrappers chain outermost-to-innermost (plan ~line 951-1029). `fingerprintCallSite` normalizes whitespace + SHA-256s; cosmetic reformat is stable, argument-list edits invalidate.
- **`findRequestEntries(sf)`** discovers EVERY server-side App Router entry per request, NOT just `page.tsx` default + `route.ts` HTTP-method exports. Discovered kinds: `page` | `route-handler` | `generate-metadata` | `generate-viewport` | `head` | `loading` | `error` (only when no `'use client'`) | `not-found` | `template` (plan ~line 464-473, 1266-1294). `middleware.ts` matcher-scoped exports classified as `auth-library` (exempt).
- **`findServerActionsInFile(sf)`** AST-scans every `.ts`/`.tsx` under `app/**` for `'use server'` directives — module-level OR function-scoped — BEFORE any path-based classification skip. Each detected action audits independently with chain inherited from containing route subtree (`app/show/**` → `crew-session`; `app/admin/**` → `admin`; `app/me/**` → `me`; `app/api/**` → defer to path-based) (plan ~line 1198-1235).
- **Per-entry call-graph audit** via `ts-morph`: `buildCallGraph(sf, entry.node)` resolves local helpers transitively; **imported helpers ARE inlined** (plan ~line 1417, "An imported helper that touches a protected sink before the local validator chain runs is a violation, NOT an exempt black box"); unresolvable external imports treated conservatively as sinks unless in `KNOWN_PURE_HELPERS` allowlist. `enumerateControlFlowPaths(callGraph, entry.node, sink.node)` walks every path; for each, at least ONE `ValidPath` in `CREW_SESSION_CHAINS.anyOf` (or the single chain for `admin`/`me`) MUST dominate the sink in declared order.
- **`verifyOutcomeDiscriminators(flowPath, candidate, chainCallsInOrder, sinkNode)`** asserts every validator's `kind` discriminator is inspected before next-call or sink. Accepted shapes (plan ~line 1385-1410): `if (binding.kind === 'success')`, early-return on `kind !== 'success'`, `switch (binding.kind) { case 'success': ... }`, ts-pattern `match(binding).with({ kind: 'success' }, ...)`. Bare fall-through REJECTED. Reading `result.viewer` is NOT a discriminator check.
- **Regression fixtures (~30)** under `tests/cross-cutting/fixtures/auth-x3/` (plan ~line 1421-1456):
  - **B1 (admin-precedence wins)**: `good-b1-admin-precedence.tsx`, `good-admin-precedence-no-link.fixture` (admin without any cookie or Google session — proves B1 doesn't require either).
  - **B2/B3/B4 (link/google/admin)**: `good-b2-link-wins.tsx`, `good-b3-google-wins.tsx`, `good-b4-google-then-admin.tsx`, `good-stale-linear-tuple.tsx` (B4 superset proof — every previously-accepted route still passes).
  - **M10 R3 canonical bad shape**: `bad-link-before-admin-precedence.fixture` — link-first ordering that silently downgraded admin-with-link-cookie to crew-mode. Audit MUST throw because no `ValidPath` accepts link-before-admin-precedence.
  - **Validator misuse**: `bad-import-only.tsx`, `bad-access-before-validate.tsx`, `bad-skip-link.tsx` (bare `requireAdmin` without `isAdminSession` guard), `bad-google-before-link.tsx`, `bad-sink-before-terminal.tsx`.
  - **Banned-primitive direct access**: `bad-direct-link-sessions.ts`, `bad-bootstrap-nonces-direct-access.tsx`.
  - **`/me` trust-domain**: `bad-me-route-uses-validateGoogleSession.tsx` (must fail — show-bound validator in cross-show surface), `good-me-route-uses-validateGoogleIdentity.tsx` (must pass).
  - **Outcome discriminator**: `bad-ignored-continue.tsx` (result captured but `.kind` never inspected), `bad-ignored-continue-bound.tsx` (reading `r.viewer` is NOT the discriminator check), `bad-fallthrough-no-continue-check.tsx` (B4 path with no `kind === 'continue'` checks between non-terminal validators).
  - **Inline server actions in component files**: `bad-inline-action-in-component.tsx` (function-scoped `'use server'` in `app/show/[slug]/components/`), `bad-module-use-server-non-actions-file.ts` (module-level `'use server'` in `app/admin/dev/helpers.ts`, NOT named `actions.ts`), `good-inline-action-with-validation.tsx`.
  - **Discovered-entry coverage (`generateMetadata`/`loading`/`not-found`/`head`)**: `bad-generate-metadata-touches-shows-internal.tsx`, `bad-loading-touches-protected-table.tsx`, `bad-not-found-touches-protected-table.tsx`, `bad-head-tsx-touches-protected-table.tsx`, `good-generate-metadata-via-validator.tsx`.
  - **Transitive imported helper**: `bad-imported-helper.tsx` — route imports `loadShow` from sibling module; `loadShow` queries `shows_internal`; route calls `loadShow` BEFORE `validateLinkSession`. Audit MUST reject — the sink doesn't appear textually in the route file; inlining is mandatory.
  - **Allowlisted auth-library**: `good-allowlisted.ts` (`app/api/auth/redeem-link/route.ts` reads `link_sessions`), `good-redeem-link-via-auth-lib.tsx` (`bootstrap_nonces` UPSERT in redeem-link), `good-bootstrap-shell-mint.tsx` (`/show/<slug>/p` INSERT — adds shell to `AUTH_LIB_ALLOWLIST` if not already present).
  - **`DYNAMIC_FROM_ALLOWLIST` semantic-identity**: `bad-dynamic-from-bypass.tsx`, `bad-template-from-bypass.tsx`, `good-from-string-literal.tsx`, `good-allowlisted-call-site-unchanged.fixture`, `good-allowlisted-call-site-after-formatter.fixture` (50 imports inserted + arg list reformatted — same enclosing_symbol + fingerprint → audit MUST pass), `bad-allowlisted-argument-changed.fixture` (arg list edited → fingerprint changes → entry stale → audit MUST throw), `bad-second-dynamic-from-in-allowlisted-file.fixture` (new dynamic-from in different enclosing_symbol — file-scoped exemption does NOT extend), `bad-ambiguous-from-without-occurrence-index.fixture`, `good-ambiguous-from-with-explicit-occurrence-index.fixture`.
  - **Fingerprint stability**: `fingerprint-stability/{singleq.ts,doubleq.ts,tabs4.ts}` — three formatter outputs of the same logical `.from(tableName)` call; all three fingerprints bit-equal.
  - **Wrapped-inline-route-handler `enclosing_symbol` stability**: `wrapped-route-handler-named-arg.fixture` (sibling `GET` + `POST` MUST emit distinct `<file>::GET->withAdmin[0]` vs `<file>::POST->withAdmin[0]`), `wrapped-route-handler-nested-wrappers.fixture` (`withAdmin(withRateLimit(...))` vs `withRateLimit(withAdmin(...))` MUST emit different symbols), `wrapped-route-handler-anonymous-deep.fixture` (`mountRoute('/api/foo', withAdmin(...))` MUST emit `<file>::<module>->mountRoute[1]->withAdmin[0].body[N]` with `N` = top-level statement index), `wrapped-route-handler-second-arg-position.fixture` (inline fn as 2nd arg MUST emit `withRateLimit[1]` not `withRateLimit[0]`). Each fixture MUST have a format-tolerance sibling that re-renders with different formatter outputs and asserts `getEnclosingSymbol` returns bit-equal.
- **`PROTECTED_ROUTES` allowlist** at plan ~line 520-569 — every protected route in the codebase MUST appear. Step 2's audit fails on any unlisted route under `app/api/`, `app/show/`, `app/me/`, `app/admin/`. Routes already enumerated: `app/show/[slug]/page.tsx`, `app/me/page.tsx`, `app/admin/page.tsx`, `app/admin/show/[slug]/page.tsx`, `app/admin/show/[slug]/preview/[crewId]/page.tsx`, `app/admin/dev/page.tsx`, `app/admin/settings/page.tsx`, `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`, `app/api/asset/reel/[show]/route.ts`, `app/api/report/route.ts`, `app/api/admin/sync/[slug]/route.ts`, `app/api/admin/staged/[fileId]/{apply,discard}/route.ts`, `app/api/admin/onboarding/finalize/route.ts`, `app/api/admin/onboarding/finalize-cas/route.ts`, `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts`, `app/api/admin/onboarding/scan/route.ts`, `app/api/admin/onboarding/pending_ingestions/[id]/{retry,defer_until_modified,permanent_ignore}/route.ts`, plus auth-library exceptions `app/api/auth/redeem-link/route.ts` + `middleware.ts`.
- **CI workflow** exposes the static audit as status check `x3-trust-domain` verbatim per spec §17.2. Reuses the canonical artifact naming pattern X.2 codified: `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}`. Includes the two-step freshness gate `pnpm gen:admin-tables && git diff --exit-code lib/audit/admin-tables.generated.ts` BEFORE the audit step (per plan ~line 666-675; ALSO required for `pretypecheck`/`prelint`/`pretest`/`prebuild` so local invocations regenerate first).
- **Admin-tables generator idempotency**: `pnpm gen:admin-tables` against current spec §4.3 produces byte-identical `lib/audit/admin-tables.generated.ts`. CI verifies via `git diff --exit-code`.
- **AVOID the X.2 residual substring-matching trap**. Per X.2 close-out residual flagged for X.3+: substring matching on long internal-enum tokens (`parse_error`, `drive_error`, `sheet_unavailable`, `pending_review`) could false-positive on future JSX-position literals like `'parse_error_recovery'`. X.3's audit uses AST scoping (ts-morph node-position discrimination), NOT bare regex substring. Specifically: `BANNED_OUTSIDE_AUTH_LIB` walks `Identifier` + `StringLiteral` + `NoSubstitutionTemplateLiteral` AST nodes and uses EXACT-MATCH against the banned list (`BANNED_OUTSIDE_AUTH_LIB.includes(v)`, NOT `.some(b => v.includes(b))`). `ADMIN_FROM_REGEXES` uses bounded regex with `\\.from\\(['"\`]${t}['"\`]\\)` — the surrounding `.from(...)` brackets the match; a substring like `shows_internal_view` inside an unrelated string does NOT match.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [x] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only.**
- [x] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only.**
- [x] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only.**

X.3 audits whether `app/api/report/route.ts` honors §13.2.3 amendments transitively (by virtue of having `requireAdmin` in its terminal-success branch B1, the lease-holder tail UPDATE uses the right caller-context), but X.3 itself does not author amendment behavior. The 2026-05-12 AGENDA amendment, 2026-05-14 admin-allowlist amendment, and 2026-05-19 §12.4 catalog cleanup amendment are not in X.3's audit scope (they're X.1's surface).

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0..M10 closed. X.1 closed at `2090dc2`. X.2 closed at `84af646`. Current HEAD includes M11 Phase A in-flight commits (`6d35cf5`, `0274a63`, `271bb22`, `370298f`) — Phase A's `app/help/**` work is parallel and does NOT touch X.3's surfaces.
- [x] **Pre-flight tests passing in isolation**:
  - `pnpm lint` exits 0 (four pre-existing M7 `<img>` warnings carry forward).
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0.
  - `pnpm test:audit:x1-catalog-parity` exits 0.
  - `pnpm test:audit:x2-no-raw-codes` exits 0.
  - `pnpm test tests/cross-cutting/auth.test.ts` exits 0 (the M5-era smoke tests — preserved by X.3, not deleted).
  - `pnpm verify:spec-amendment` exits 0.
- [x] **Specific files present from prior milestones**:
  - `lib/audit/authChain.ts` (M5-era; 253 lines; X.3 EXTENDS but does NOT delete) — the smoke-test precursor that exercises real `app/show/[slug]/page.tsx`, `app/me/page.tsx`, `app/api/auth/redeem-link/route.ts`, OAuth callback/sign-in/sign-out.
  - `tests/cross-cutting/auth.test.ts` (M5-era; 150 lines; preserve all 12 tests; ADD spec-driven tests in same file OR adjacent `tests/cross-cutting/trust-domain.test.ts`).
  - `lib/auth/{jwt.ts,validateLinkSession.ts,validateGoogleSession.ts,validateGoogleIdentity.ts,isAdminSession.ts,requireAdmin.ts,validateNextParam.ts,cookies.ts,constants.ts,bootstrapCookie.ts,resolveShowViewer.ts,supabaseAuthError.ts,validateCrewAssetSession.ts}` — the validators the audit asserts every protected route reaches.
  - `lib/messages/__internal__/walkSourceFiles.ts` (X.1-shipped at R2 fix) — X.3 reuses for AST walk root resolution.
  - `lib/messages/__generated__/spec-codes.ts` + `internal-code-enums.ts` (X.1/X.2-shipped) — X.3 does not consume but the existence of the `__generated__` pattern is the precedent for `lib/audit/admin-tables.generated.ts`.
  - `.github/workflows/x-audits.yml` — X.3 extends with `x3-trust-domain` job using the canonical artifact-naming pattern.
- [x] **NEW X.3 deliverables**:
  - `scripts/generate-admin-tables.ts` — generator that parses spec §4.3 admin-only bullet list and emits `lib/audit/admin-tables.generated.ts`.
  - `lib/audit/admin-tables.generated.ts` — committed `readonly string[]` manifest (`// @generated` header, `eslint.config.js` override entry to skip rules that fight machine output).
  - `lib/audit/trustDomains.ts` (or extension of `lib/audit/authChain.ts`) — `classifyTrustDomain`, `findRequestEntries`, `findServerActionsInFile`, `inheritedChainForAction`, `buildCallGraph`, `findProtectedSinks`, `enumerateControlFlowPaths`, `candidateChains`, `verifyOutcomeDiscriminators`, `getEnclosingSymbol`, `fingerprintCallSite`, `composeQualifiedSymbol`, `isProtectedRpcCall`, `isProtectedFromCall`, `collectFromCallsInSymbol`.
  - `lib/audit/protectedRoutes.ts` — `PROTECTED_ROUTES: RouteSpec[]` with `CREW_SESSION_CHAINS` constant.
  - `lib/audit/authPrimitives.ts` (or co-located) — `AUTH_LIB_ALLOWLIST`, `BANNED_OUTSIDE_AUTH_LIB`, `RPC_ALLOWLIST`, `DYNAMIC_FROM_ALLOWLIST`, `KNOWN_PURE_HELPERS`.
  - `tests/cross-cutting/trust-domain.test.ts` (the new spec-driven audit — CI gate name `x3-trust-domain`).
  - `tests/cross-cutting/auth.test.ts` PRESERVED + extended with new audit-driven assertions; existing 12 tests must continue to pass.
  - `tests/cross-cutting/fixtures/auth-x3/` — ~30 regression fixtures enumerated in §2.
  - `package.json` script entries: `gen:admin-tables`, `test:audit:x3-trust-domain`. `pretypecheck`/`prelint`/`pretest`/`prebuild` ALL chained to `gen:admin-tables`.
  - `.github/workflows/x-audits.yml` job extension exposing the `x3-trust-domain` status check with the canonical artifact-naming pattern AND the `gen:admin-tables` freshness gate.
  - `eslint.config.js` (or `.eslintrc.json`) override entry for `lib/audit/admin-tables.generated.ts`.
- [x] **DEFERRED.md** — no X.3 sub-items pre-listed at handoff. If the audit surfaces any rendered-protected-data leak that requires fixing the owning milestone's route file (rather than refactoring within X.3's scope), route the fix to that milestone's owner per memory `feedback_deferral_discipline.md`; do NOT defer to BACKLOG.md.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (invariant 1) — always. Each fixture is failing-test-first.
- [ ] **Per-show advisory lock** (invariant 2) — **N/A for X.3's own code.** If the audit surfaces a protected route that mutates `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions` without `pg_advisory*` wrapping, that's an invariant-2 finding routed to the owning milestone (M5/M6/M10).
- [ ] **Email canonicalization** (invariant 3) — **N/A for X.3's own code.** Boundary canonicalization is X.5's audit surface.
- [ ] **No global cursor** (invariant 4) — **N/A for X.3.** X.4's audit surface.
- [x] **No raw error codes in user-visible UI** (invariant 5) — **N/A for X.3's own code; structurally enforced by X.2.**
- [x] **Commit per task** (invariant 6) — always. Conventional-commits: `<type>(<scope>): <summary>`. Suggested scopes: `audit`, `cross-cutting`, `scripts`, `test`, `ci`. Example commits:
  - `scripts(audit): bootstrap generate-admin-tables extractor (Task X.3 Step 1)`
  - `feat(audit): commit lib/audit/admin-tables.generated.ts manifest (Task X.3 Step 1)`
  - `feat(audit): trust-domain classifier + findRequestEntries + findServerActionsInFile (Task X.3 Step 1)`
  - `feat(audit): call-graph builder with transitive import inlining (Task X.3 Step 1)`
  - `feat(audit): verifyOutcomeDiscriminators (Task X.3 Step 1)`
  - `feat(audit): DYNAMIC_FROM_ALLOWLIST semantic-identity with wrapped-route enclosing_symbol (Task X.3 Step 1)`
  - `test(cross-cutting): X.3 trust-domain audit + ~30 regression fixtures (Task X.3 Step 2)`
  - `test(cross-cutting): fingerprint + enclosing_symbol stability tests (Task X.3 Step 2)`
  - `ci(audits): wire x3-trust-domain as PR-required status check`
  - `chore(audit): retire any prior advisory auth-chain conventions superseded by X.3` (only if any advisory check existed)
- [x] **Spec is canonical** (invariant 7) — if the audit surfaces a route legitimately needing a new ValidPath branch (none expected; the 4-branch B1/B2/B3/B4 design is exhaustive per spec §7.3), open a spec question; do NOT silently extend `CREW_SESSION_CHAINS.anyOf`.
- [ ] **UI quality gate / impeccable dual-gate** (invariant 8) — **N/A — no UI surface.** X.3 touches `scripts/`, `lib/audit/`, `tests/cross-cutting/`, `.github/workflows/`, `package.json`, `eslint.config.js`.
- [x] **Supabase call-boundary discipline** (invariant 9) — **N/A for X.3's own code** (audit makes no Supabase calls). If the audit's call-graph walk surfaces a Supabase-call-boundary §1.9 violation in a protected route (silent `continue`, returned-error not distinguished from thrown-error), route to the owning milestone; do NOT absorb into X.3. The existing `tests/auth/_metaInfraContract.test.ts` (M5-era) remains the §1.9 registry meta-test; X.3 is orthogonal.

## 6. Watchpoints from prior adversarial review

Pulled forward from X.1 R1–R3, X.2 R1, M5 R20 advisory-lock single-holder, M8 R3 H1 caller-context, M10 R3 admin-precedence, plus memories.

1. **M10 R3 admin-precedence is THE canonical regression.** The fixture pair MUST include `bad-link-before-admin-precedence.fixture` (link-first ordering silently downgrading admin-with-link-cookie to crew-mode — the exact M10 R3 shape) MUST throw, AND `good-b1-admin-precedence.tsx` + `good-admin-precedence-no-link.fixture` (B1 path with isAdminSession guard) MUST pass. Reviewer hand-walks both fixtures and confirms the audit error messages name `B1` explicitly. Memory `feedback_multi_guard_state_machine_incomplete_gate.md` is the codified pattern; this is its enforcement.

2. **AST scoping, not substring grep (X.2 residual carry-forward).** Audit uses ts-morph node-position discrimination. Bare regex on identifiers is banned. Substring matching on long internal-enum tokens is the X.2 residual class — X.3 avoids it because `BANNED_OUTSIDE_AUTH_LIB` uses `.includes(v)` exact-match against the literal value AND `ADMIN_FROM_REGEXES` brackets matches with `\\.from\\(...)\\)`. Reviewer verifies by hand that no `.some(b => v.includes(b))` substring-match pattern exists in the audit code.

3. **Class-sweep code-shape-based, NOT name-list-based** (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`; X.1 R2 P0-1). `PROTECTED_ROUTES` enumerates ~22 routes (the M5/M8/M10 surfaces). But the audit ALSO walks every `.tsx`/`.ts` under `app/api/`, `app/admin/`, `app/show/`, `app/me/` via `walkSourceFiles` and fails on `unclassified` — so a future protected route added without classification fails CI immediately. Reviewer verifies the `unclassified` branch is reachable AND a fixture proves it fires.

4. **validateGoogleSession vs validateGoogleIdentity** (memory + M5 watchpoint #10): deliberate non-DRY. `/me` MUST use `validateGoogleIdentity` (cross-show, no show binding); per-show routes MUST use `validateGoogleSession` (show-bound). Cross-use fixtures (`bad-me-route-uses-validateGoogleSession.tsx`, `good-me-route-uses-validateGoogleIdentity.tsx`) MUST be in the regression set. Per plan ~line 524: `app/me/page.tsx` chain is `['validateGoogleIdentity']` not `['validateGoogleSession']`.

5. **AdminInfraError handling** (M10 R3 + M5 §B watchpoint). The outcome-discriminator audit catches the related but distinct bug class: a route that calls a validator and IGNORES the `kind` discriminator → falls through to a sink with un-narrowed type. Per plan ~line 1408: "Bare fall-through (next validator runs unconditionally without ever reading `binding.kind`) is REJECTED."

6. **Multi-guard state machine** (memory `feedback_multi_guard_state_machine_incomplete_gate.md`). For each terminal transition (sink access), X.3 verifies every guard the transition logically requires is present at the decision point. This is the structural enforcement of that memory's rule — the OR-semantics 4-branch `CREW_SESSION_CHAINS` IS the multi-guard catalogue.

7. **Same-model-blind-spot pattern** (X.1 R2 lesson, attenuated by X.2 R1). Codex's same-model self-review consistently misses class-of-error findings. Pre-emptively self-audit for: (a) the M10 R3 fixture pair both being asserted AND a reviewer can hand-walk WHICH ValidPath each accepts/rejects; (b) the wrapped-route-handler `enclosing_symbol` tests covering all 4 shapes (named-arg, nested wrappers including swapped order, anonymous deep, second-arg position) AND format-tolerance siblings; (c) imported helper inlining ACTUALLY inlines (not stubbed-as-pure); (d) every PROTECTED_ROUTES entry actually classifies — pull the live route paths via `git ls-files 'app/api/**/route.ts' 'app/{admin,show,me}/**/page.tsx'` and diff against the allowlist; missing-from-allowlist must throw, extra-in-allowlist must throw.

8. **Anti-tautology** (CLAUDE.md). Each bad fixture must exercise a real failure mode tied to a real protected route shape. Use representative routes from M5/M8/M10. Derive expected values from fixture geometry (e.g., the validator chain ordering inside the fixture matches the candidate that should accept/reject). Do NOT use contrived test-only TSX that exercises only the matcher's happy path.

9. **CI artifact-naming pattern (X.2 R1 codification carryover).** Reuse the canonical `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}` pattern. X.2 retroactively renamed X.1's artifact; X.3 follows the same pattern without renaming X.2's (already canonical).

10. **`pretypecheck`/`prelint`/`pretest`/`prebuild` wiring** (plan ~line 666-678 explicit requirement). The freshness gate MUST run before EVERY entry point that consumes `lib/audit/admin-tables.generated.ts` — not just CI. Local `pnpm typecheck` / `pnpm lint` / `pnpm test` must ALWAYS regenerate first via the pre-script hooks. The X.6 traceability-audit Step 2 asserts CI/pre-commit ALWAYS goes through `pnpm typecheck`, NEVER raw `tsc`; X.3 inherits that. Reviewer verifies `package.json` has the four pre-script hooks AND raw `tsc --noEmit` is not invoked anywhere in CI.

11. **Cross-cutting parity gate (`AC-X.6` interaction at ~line 8019)**: `setEqual(specAdminTables, ac25AdminTables)` AND `specAdminTables.every(t => protectedSinksRegexList.includes(t))`. X.3's PROTECTED_SINKS feeds this gate. A future §4.3 admin-only addition that propagates to AC-2.5's `ADMIN_TABLES` registry but NOT to X.3's PROTECTED_SINKS fails CI. Reviewer verifies the generator's single-source-of-truth property: editing §4.3 + running `pnpm gen:admin-tables` produces a diff in `lib/audit/admin-tables.generated.ts`; not running the generator triggers the freshness gate.

12. **Deferral discipline** (memory `feedback_deferral_discipline.md`). Small mechanical fixes (a route missing a `validateLinkSession` call before `from('shows_internal')`) land in X.3's scope as fix commits IF they're in the auditing module itself; route-file fixes land in the owning milestone's `DEFERRED.md` entry with concrete fix-target. Speculative work (e.g., "M11 Phase B might want this audit extended") goes to BACKLOG.md.

13. **Verify findings against the actual code site before patching** (memory `feedback_verify_review_findings_against_external_api_spec.md`). When adversarial review surfaces a finding, read the route file verbatim, trace the call graph by hand, and confirm the audit's complaint is real (vs. an audit false-positive). X.1 R2 verified each P0 disposition by reading code; X.3 reviewer does the same.

14. **Same-vector recurrence rule** (memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`). If 3+ rounds in a row surface findings on the same vector (e.g., "discrimination rule misses a new Next.js entry kind"), pause per-instance patching and ship a structural defensive layer (a Next.js entry-kind registry shared with `findRequestEntries`, a parity test against `next.config.js` versioning, etc.). Do not whack-a-mole.

15. **Deliberately preserve M5-era smoke tests.** `tests/cross-cutting/auth.test.ts` exists with 12 real-route tests covering M5 surfaces. X.3 EXTENDS, does NOT replace. New audit-driven assertions go in the same file (preferred — single test file per spec §17.2 CI name `x3-trust-domain`) OR adjacent (only if file size grows unwieldy; preserve symlink/import path so the CI gate name still matches). Reviewer verifies all 12 existing tests still pass.

## 7. Test commands

- **X.3 trust-domain audit:** `pnpm test tests/cross-cutting/auth.test.ts` (or `pnpm test tests/cross-cutting/trust-domain.test.ts` if X.3 lands the spec-driven audit in a separate file — the existing file MUST keep its 12 M5-era tests).
- **Admin-tables generator idempotency:** `pnpm gen:admin-tables && git diff --exit-code lib/audit/admin-tables.generated.ts`.
- **Existing X.1/X.2 gates remain green:** `pnpm test:audit:x1-catalog-parity && pnpm test:audit:x2-no-raw-codes`.
- **M5-era auth meta-tests remain green:** `pnpm test tests/auth/`.
- **Type + lint + full test gate (final):** `pnpm typecheck && pnpm lint && pnpm test` exits 0 with NO new warnings. The four pre-existing M7 `<img>` warnings carry forward.
- **CI workflow check:** `.github/workflows/x-audits.yml` exposes a job named `x3-trust-domain` verbatim; runs on `pull_request` + `push` to `main`; includes the `gen:admin-tables` + `git diff --exit-code` two-step freshness gate BEFORE the audit step; uploads artifact using the canonical naming pattern.
- **Pre-script hook verification:** `cat package.json | grep -E '"pre(typecheck|lint|test|build)"'` shows all four chained to `gen:admin-tables`; running raw `node_modules/.bin/tsc --noEmit` after spec §4.3 edit + no regen surfaces a stale-import typecheck error (proves the wiring is load-bearing, not advisory).

## 8. Exit criteria

- [ ] All sub-steps in `11-cross-cutting.md` Task X.3 (Steps 1–3) checked off.
- [ ] AC-X.3 has at least one passing test asserting each named surface: B1/B2/B3/B4 acceptance + each negative case + `verifyOutcomeDiscriminators` (both bound + unbound) + transitive imported helper + AST-detected inline server actions in component files + every discovered Next.js entry kind (`page`/`route-handler`/`generate-metadata`/`generate-viewport`/`head`/`loading`/`error`/`not-found`/`template`) + `BANNED_OUTSIDE_AUTH_LIB` Identifier + StringLiteral + NoSubstitutionTemplateLiteral + `DYNAMIC_FROM_ALLOWLIST` semantic-identity (format-tolerance + arg-edit invalidation + symbol-scoped non-extension + ambiguity disambiguator) + fingerprint stability + wrapped-route-handler enclosing_symbol (named-arg + nested + swapped + anonymous + second-arg).
- [ ] `lib/audit/admin-tables.generated.ts` is committed with `// @generated` header; `pnpm gen:admin-tables && git diff --exit-code` passes; CI regenerate is byte-identical; `eslint.config.js` override entry exists.
- [ ] `PROTECTED_ROUTES` enumerates every protected route in the live codebase (verified by `git ls-files 'app/api/**/route.ts' 'app/{admin,show,me}/**/page.tsx'` diff); a route added without classification fails CI with the `'is not classified in TRUST_DOMAINS'` error.
- [ ] `M10 R3 admin-precedence` regression fixture is in the regression set + the canonical example named in the convergence log: `bad-link-before-admin-precedence.fixture` (must throw) + `good-b1-admin-precedence.tsx` + `good-admin-precedence-no-link.fixture` (must pass).
- [ ] AST scoping verified — no substring-match anti-pattern: grep audit code for `.some(b => v.includes(b))` and `.some(b => v.startsWith(b))` returns no hits; `BANNED_OUTSIDE_AUTH_LIB` uses `.includes(v)` exact-match; `ADMIN_FROM_REGEXES` brackets matches with `\\.from\\(...)\\)`.
- [ ] Negative-regression verification per memory `feedback_negative_regression_verification.md`: temporarily remove the admin-precedence guard from `verifyOutcomeDiscriminators` and confirm the audit fires on a known-good site; restore and confirm green. Same protocol for `findServerActionsInFile`, `findRequestEntries`-discovered-kinds, transitive-import inlining.
- [ ] Existing `tests/cross-cutting/auth.test.ts` 12 M5-era tests still pass.
- [ ] M10's prior advisory checks (if any) on auth-chain surfaces are retired or explicitly noted as superseded.
- [ ] CI exposes `x3-trust-domain` verbatim. Spot-check `.github/workflows/x-audits.yml`. Artifact name uses canonical pattern. Freshness gate runs BEFORE the audit step.
- [ ] `pretypecheck` / `prelint` / `pretest` / `prebuild` ALL chained to `gen:admin-tables` in `package.json`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings.
- [ ] No new `// TODO` or `// FIXME` lines.
- [ ] Adversarial review converged to APPROVE (Opus reviewer; expected R1–R3).
- [ ] All commits follow `<type>(<scope>): <summary>` format with one logical task per commit.
- [ ] Convergence log at the bottom of this file is filled in.

## 9. Sandbox / git protocol

- [x] **Codex CLI with relaxed sandbox** — verified working through X.1 + X.2. Commits run in-session.
- **Invocation discipline (memory `feedback_codex_exec_needs_stdin_closed.md`):** every `codex exec` invocation must close stdin (`< /dev/null`); monitor worker CPU% — 0.0% for 2+ minutes signals a stdin hang.

## 10. Adversarial review handoff

1. Implementer (Codex) summarizes deliverables, AC sub-criteria satisfied, and any auth-chain drift findings the audit surfaced in live route files (with fix-commit SHAs or — for cross-milestone routing — DEFERRED.md / handoff entries).
2. Adversarial reviewer (Opus / Claude Code) invoked via the canonical `/codex:adversarial-review` slash command per memory `feedback_adversarial_review_canonical_invocation.md`. Suggested invocation:
   ```
   /codex:adversarial-review --background --base 84af646 "X.3 trust-domain audit (single-implementer Codex backend) — see handoff §6 watchpoints + §8 exit criteria. Focus on M10 R3 admin-precedence fixture pair, transitive imported helper inlining, wrapped-route-handler enclosing_symbol stability, and PROTECTED_ROUTES completeness vs live codebase."
   ```
3. Reviewer iterates with implementer until convergence (memory `feedback_iterate_until_convergence.md` — keep iterating until APPROVE; round-3 cap is for finding-disagreement loops, NOT for halting when each round surfaces NEW bugs).
4. Per-round routing: X.3 is single-implementer Codex; almost every finding is Codex's. Exceptions surface to orchestrator: a route-file fix in a non-X.3 surface (route to owning milestone), or a spec amendment (none expected; the 4-branch design is exhaustive).
5. Class-sweep before patching (memory `feedback_class_sweep_before_patch.md`): when review surfaces a single missed Next.js entry kind or a single missed banned primitive, grep `app/**` for sibling shapes before patching only the named site.
6. Same-vector recurrence rule (memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`): if 3+ rounds surface findings on the same audit vector, ship a structural defensive layer.
7. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

- **X.1 closed** (catalog parity, `2090dc2`). **X.2 closed** (no raw codes, `84af646`). X.3 inherits the canonical artifact-naming pattern (X.2 R1 codification) and the X.1-shipped `walkSourceFiles` helper.
- **M11 Phase A in flight** (parallel Opus implementer; `app/help/**` + `components/help/**`). X.3 walks `app/` outside `app/api/`. Phase A's commits (`6d35cf5`, `0274a63`, `271bb22`, `370298f`) are at HEAD; X.3 picks them up. If Phase A's `/help` routes are public (no auth required) they classify as `non-route` or are added to a new `public-help` trust domain — confirm at task start by reading Phase A's spec for `/help` auth posture. If X.3 finds a Phase A violation (e.g., a `/help` route missing a required gate), surface as an X.3 finding routed back to the Phase A handoff — do NOT defer to a post-Phase-A cleanup. Per the cross-cutting plan, X.3 is the structural enforcement of M11's invariant 5 / 8 boundary at the route-gating layer.
- **X.2 residual #1 (FIRST_SEEN_REVIEW allowlist registry migration trigger)**: X.2 left this deferred at count = 1 until trigger fires (> 3). X.3 may add its own allowlist entries (`DYNAMIC_FROM_ALLOWLIST`, `KNOWN_PURE_HELPERS`, `RPC_ALLOWLIST` — all initially empty). If at X.3 close the combined registry-shaped allowlist count (X.1's `FIRST_SEEN_REVIEW` + X.2 entries + X.3 entries) exceeds 3, X.3 ships the shared registry migration at `lib/messages/__internal__/displayAllowlist.ts` (X.2 handoff §11 already named this path). If combined count stays ≤ 3, defer to whichever X.* task triggers the threshold.
- **X.2 residual #2 (substring-matching enum-token false-positive risk for long internal tokens)**: X.3 inherits the watchpoint. X.3's audit code uses AST scoping NOT substring grep — explicitly enforced in §6 watchpoint 2 + §8 exit criteria.
- **X.4, X.5, X.6 are independent of X.3.** X.4 (no global cursor) covers sync watermark surfaces — separate from auth-chain. X.5 (RLS coverage) covers email-canonicalization persistence boundaries — separate. X.6 (traceability matrix) reads X.3's `lib/audit/admin-tables.generated.ts` as one input to the cross-cutting parity gate at ~line 8019; X.6 also adds the `traceability-audit` + `verify-branch-protection-status` 2 of 7 required checks. X.3 does not block any of them.
- **X.6's branch-protection contract** (spec §17.2): once X.3's `x3-trust-domain` gate is merged + green, it becomes one of the 7 required-status-checks the X.6 reader+privileged-script enforces. X.3 does not itself configure branch protection; X.6 owns that.
- **M5/M8/M10 routes audited by X.3**: any audit finding that names a fix in `app/api/report/route.ts` (M8), `app/api/asset/{diagram,reel}/**` (M7), `app/api/admin/onboarding/**` (M10), `app/show/[slug]/page.tsx` (M5), `app/me/page.tsx` (M5) routes to the owning milestone's `DEFERRED.md` only if the fix is non-trivial (per memory `feedback_deferral_discipline.md`); mechanical fixes land in X.3's scope as part of convergence.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**N/A — no UI surface.** X.3 ships scripts, generated TypeScript manifests, Vitest meta-tests, regression fixtures, and a CI workflow extension. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. The dual `/impeccable critique` + `/impeccable audit` gate does not apply.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

Declared at handoff time per memory `feedback_meta_test_at_plan_time_not_round_n.md`.

- [ ] **Supabase call-boundary discipline** — **N/A.** X.3's own code makes no Supabase calls. If the audit surfaces a §1.9 violation in a protected route's call graph (silent `continue`, returned-error not distinguished from thrown-error), route to the owning milestone's meta-test (`tests/auth/_metaInfraContract.test.ts`); do not absorb.
- [ ] **Sentinel hiding in optional text** — **N/A.** X.3 doesn't render.
- [ ] **`admin_alerts` catalog completeness** — **N/A.** X.3 audits routing/access control, not catalog producer registry.
- [ ] **Advisory-lock topology** — **N/A.** X.3 makes no `pg_advisory*` calls. If the audit surfaces a single-holder violation in a protected route's call graph, route to `tests/auth/advisoryLockRpcDeadlock.test.ts` (M5-era topology meta-test); do not absorb.
- [ ] **No-inline-email-normalization** — **N/A.** X.5's audit surface.
- [x] **CREATE: trust-domain semantic audit** (`tests/cross-cutting/auth.test.ts` EXTENSION OR `tests/cross-cutting/trust-domain.test.ts` adjacent) — ts-morph control-flow + dominator + cross-import call graph + outcome-discriminator + DYNAMIC_FROM_ALLOWLIST semantic-identity. Concrete failure mode: a `crew-session` route that calls `validateLinkSession` BEFORE the `isAdminSession(req) === true` guard (the M10 R3 admin-precedence bug shape) is detected at static-analysis time; a `crew-session` route that calls `requireAdmin` under the `isAdminSession` guard, then on the false-branch calls `validateLinkSession` is NOT flagged (legitimate B1+B2/B3/B4 composition).
- [x] **CREATE: admin-tables generator** (`scripts/generate-admin-tables.ts`) + **CREATE: manifest** (`lib/audit/admin-tables.generated.ts`) — committed; regenerated by CI; consumed by X.3 (PROTECTED_SINKS), AC-2.5 (M2 admin-table parity), AC-X.6 (cross-cutting parity gate at ~line 8019). Concrete failure mode: §4.3 spec edit without `pnpm gen:admin-tables` run fails the freshness gate with named diff `+missing_in_generated:<table>`.
- [x] **CREATE: regression fixtures** (`tests/cross-cutting/fixtures/auth-x3/`) — ~30 paired-twin fixtures per §2.
- [x] **CREATE: wrapped-inline-route-handler `enclosing_symbol` stability fixtures + fingerprint stability fixtures** — distinct from the regression set because they assert AUDIT internals (the `getEnclosingSymbol` + `fingerprintCallSite` contracts) rather than route-level audit outcomes. Concrete failure mode: a future change to `composeQualifiedSymbol` that lets line/column data leak into the symbol fails the stability sibling test, NOT a flood of false-stale CI failures across every route handler.
- [x] **EXTEND (or coordinate-with): tests/cross-cutting/auth.test.ts** — the existing M5-era smoke tests stay; X.3 adds spec-driven assertions either inline or via adjacent file imported into the same `describe` block. Verified green during X.3 implementation.
- [x] **EXTEND (or coordinate-with): tests/auth/_metaInfraContract.test.ts** — the §1.9 Supabase-call-boundary registry. If X.3's call-graph walk surfaces a §1.9 violation, route to this meta-test's registry; do NOT absorb. Memory `feedback_meta_contract_test_for_recurring_bug_class.md` is the precedent.

---

## Convergence log

### Implementation ready for adversarial review

- _(filled by Codex when implementation is staged and ready for review)_

### Adversarial review

- _(filled by Opus reviewer round-by-round; format mirrors X.1/X.2 closure logs)_
