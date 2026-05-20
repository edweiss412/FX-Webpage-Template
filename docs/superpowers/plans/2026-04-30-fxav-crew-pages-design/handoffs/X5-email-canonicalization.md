# Handoff — X.5: Email canonicalization at every boundary (AC-X.5)

**Handed off:** 2026-05-19 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md "X.\* — Cross-cutting" row — backend audit; no UI surface).
**Adversarial reviewer:** Opus 4.7 / Claude Code (reviewer-pairing logic — Codex implements → Opus reviews; per ROUTING.md + memory `feedback_iterate_until_convergence.md`). Lineage: X.2 R1 APPROVE → X.3 R1 APPROVE → **X.4 R1 REQUEST_CHANGES → R2 APPROVE** (semantic data-flow surface broke the R1-streak). X.5 is between X.3 (medium, AST-only) and X.4 (heavy, semantic data-flow) in difficulty — pure static AST analysis plus DB schema introspection, no per-row Postgres execution. Expect 1–2 rounds; pre-emptive self-audit per §6 watchpoint 8.
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md` — Task X.5 only (lines 1939–1981).

> X.5 is the fifth of six cross-cutting audit tasks (X.1–X.6). No §A/§B split — backend audit infrastructure (ts-morph static analysis + Postgres `pg_proc` / `pg_get_constraintdef` introspection + AC-X.5 boundary allowlist + ~6 positive failure-mode fixtures + CI workflow extension). UI hard rule N/A — no file under `app/` (outside `app/api/**`), `components/`, or design tokens is mutated.

> **X.5 is the structural enforcement of AGENTS.md §1.3 — "Email canonicalization at every boundary."** Per spec §4.1.1: `lib/email/canonicalize.ts` is the ONLY function that touches raw emails before they enter the system; schema-level CHECK constraints are the safety net, not the primary mechanism. M3-era enforcement is `tests/admin/no-inline-email-normalization.test.ts` — a narrow static-text guard scoped to 8 auth+sync paths via a hardcoded `AUDITED_PATHS` array (per `tests/admin/no-inline-email-normalization.test.ts:70-85`). X.5 promotes that into a structural meta-test covering every email persistence path AC-X.5 enumerates, with parser-write / DB-write / DB-CHECK / RLS-helper / validator / reports / `admin_alerts.context.*email*` JSONB layers all audited.

> **X.5 catches the bug classes X.1 / X.2 / X.3 / X.4 cannot.** X.1 enforces catalog parity; X.2 enforces no raw codes in UI; X.3 enforces auth-chain dominance over protected sinks; X.4 enforces no global sync cursor. None of those audit the email-canonicalization boundary. The canonical bug class X.5 catches (per plan Task X.5 Step 3): (a) a new email-bearing column added without a `*_email_canonical` CHECK; (b) a new write site in `lib/parser/blocks/` bypassing `canonicalize`; (c) the `auth_email_canonical()` / `is_admin()` / `canonicalize_email(text)` SQL helpers renamed/dropped without RLS update; (d) raw `auth.email` written without canonicalization; (e) inline `.toLowerCase()` / `.trim()` chain crept in alongside `canonicalize()` (drift bait — the M3 R4 Finding 1 class).

> **Derive from spec, not from handoff** (memory `feedback_audit_derives_from_spec_not_handoff.md`, codified 2026-05-19 after X.3 R1 caught the 21-vs-19 admin-tables drift; honored in X.4). The 17-row boundary table in plan Task X.5 Step 1 IS the canonical inventory per AC-X.5 ("Plan Task X.5's boundary list is the canonical inventory"). X.5's audit MUST derive its boundary allowlist from spec §4.1.1 prose + plan Task X.5 Step 1 table parsed at audit-execution time — NOT from a hardcoded TypeScript array. Spec §4.1.1 amendments (e.g., a new `admin_alerts.context.*email*` field) must be picked up automatically; an audit that hardcodes the boundary list silently goes stale.

> **DRIFT NOTE — AC-X.6 required-checks list names the X.5 gate `x5-rls-coverage`** (spec §17.2 lines 2831, 3677, 3681; plan `11-cross-cutting.md:2057,2167,2289,2297`). AC-X.5 BODY in spec §17.2 line 3676 is unambiguously about email canonicalization, NOT RLS coverage. Per AGENTS.md §1.7 (spec is canonical) the AC body wins over a check-name string in a supplementary required-checks list — the drift is an internal spec inconsistency that X.6's cross-cutting parity assertion was DESIGNED to catch. **X.5 ships under the working CI check name `x5-email-canonicalization`** (semantically matches AC-X.5 body). X.5's convergence log MUST record the drift as a finding surfaced for X.6 to audit; do NOT pre-emptively land a spec amendment to rename one or the other — that would short-circuit X.6's first real test of the AC-body ↔ required-checks-list parity check it audits. The downstream amendment (rename `x5-rls-coverage` → `x5-email-canonicalization` in AC-X.6's seven-name list AND in plan `11-cross-cutting.md:2057,2167,2181,2289,2297`) lands after X.6 surfaces the finding through its parity audit. Memory `feedback_audit_derives_from_spec_not_handoff.md` applies recursively to spec internal consistency: live AC body > frozen reference in a list.

> **Same-model self-review pattern post-X.4.** X.4 R1 was REQUEST_CHANGES because the semantic data-flow surface was substantially harder than X.2/X.3 and the implementation regressed to text-regex shortcuts. X.5's surface is HEAVIER than X.3 (DB introspection + RLS-helper round-trip + cross-file boundary tracking) but LIGHTER than X.4 (no transitive call-graph data flow). Highest-risk pre-emptable failure modes — verify before claiming done: (a) boundary-list extraction from spec §4.1.1 prose + plan Task X.5 Step 1 table is pure (no hardcoded TS array fallback); (b) ts-morph audit walks property assignments via AST symbol resolution (NOT identifier-name regex); (c) RLS-helper introspection asserts all three helpers (`is_admin`, `auth_email_canonical`, `canonicalize_email`) by name + `pronargs` + body shape; (d) `admin_alerts.context` JSONB email-field detection covers nested paths (`context.collidingEmails[]`, `context.matchedEmail`, future fields); (e) every M3-AUDITED_PATHS entry stays covered (regression preservation — same discipline that kept all 28 X.3 tests green through X.4's helper refactor).

---

## 1. Spec sections in scope

Exhaustive, not representative.

- **§4.1.1** — Email canonicalization definition: `canonicalize(email) := lowercase(trim(email))` (spec line 569). Four-layer mandate (line 574): Parser write / Read layer (Google validator) / RLS predicates / Schema CHECK. Three canonical SQL helpers — `is_admin()` (zero-arg, BOOLEAN, admin precedence per `app_metadata.role='admin'` OR `auth_email_canonical()` against `public.admin_emails`), `auth_email_canonical()` (zero-arg, TEXT, wraps `canonicalize_email(auth.email())`), `canonicalize_email(text)` (one-arg, IMMUTABLE, returns `lower(btrim($1))`). Every callsite uses function-call syntax with parens.
- **§4.5** — `app_settings.{watched_folder_set_by_email, pending_folder_set_by_email}` admin attribution columns; `deferred_ingestions.deferred_by_email` admin-who-deferred attribution. Both require canonicalize-before-write per §4.1.1.
- **§4.6** — `admin_alerts.resolved_by` (admin attribution) + `admin_alerts.context` JSONB (collision-payload emails, e.g., `AMBIGUOUS_EMAIL_BINDING` `context.collidingEmails[]`). Every email-bearing field in JSONB MUST be canonicalized before UPSERT.
- **§5.2 / §7.2.2** — `validateGoogleSession` look up `crew_members WHERE show_id = $requestedShowId AND email = canonicalize(...)` (spec line 2253). The DB column is already canonical per §4.1.1 so the comparison is exact-match on canonical form.
- **§6.8.3** — `sync_audit.applied_by` stores admin email of operator who clicked Apply; canonicalize before INSERT.
- **§7 / §7.3** — `/me` page calls `validateGoogleIdentity` (not `validateGoogleSession`); `lib/data/listShowsForCrew.ts` reads `crew_members.email = canonicalize(supabaseAuth.user.email)` so mixed-case Google emails (`Doug@FXAV.NET`) match the canonical DB rows.
- **§13.2** — Bug-report identity attribution: `lib/reports/submit.ts` admin path canonicalizes admin email; crew path writes `crew_members.id::text` (no email written). `lib/reports/rateLimit.ts` `report_rate_limits.identity` UPSERT canonicalizes admin email before `INSERT .. ON CONFLICT (kind, identity, hour_bucket)` to prevent quota-doubling via case drift.
- **§17.2** — AC-X.5 verbatim. Also AC-X.6 cross-cutting parity (the required-status-checks list — X.5 surfaces the `x5-rls-coverage` drift but does NOT itself amend the spec).
- **AGENTS.md §1.3** — "Email canonicalization at every boundary. `lib/email/canonicalize.ts` is the only function that touches raw emails before they enter the system. Schema-level CHECK is the safety net, not the primary mechanism." X.5 IS the canonical structural enforcement.

## 2. Acceptance criteria

**Primary AC (verbatim from spec §17.2 line 3676):**

- **AC-X.5** — **Email canonicalization at every persistence boundary — full coverage.** Static analysis covers every spec-defined email persistence path including `crew_members.email`, `admin_alerts.context.*email*`, `report_rate_limits.identity` (when prefixed `email:`), `sync_audit.applied_by`, `app_settings.{watched_folder_set_by_email, pending_folder_set_by_email}`, `deferred_ingestions.deferred_by_email`, `admin_alerts.resolved_by`, AND read-side `WHERE email = $x` predicates in `listShowsForCrew` (`/me`) — every site MUST call `canonicalize(email)` or be documented as already-canonical (e.g., from `crew_members.email`). Plan Task X.5's boundary list is the canonical inventory.

**Task-internal sub-criteria (from plan Task X.5, `11-cross-cutting.md:1939-1981`):**

- **Boundary allowlist extractor** at `scripts/extract-email-boundaries.ts` (new) — parses spec §4.1.1 prose + plan Task X.5 Step 1 markdown table at audit-execution time and emits the boundary inventory (each row: `Layer | Path | BoundaryCheck`) as a generated module `lib/audit/email-boundaries.generated.ts` (mirrors X.3's `admin-tables.generated.ts` + X.4's `watermark-symbols.generated.ts` pattern). The audit imports the generated manifest; `pretypecheck`/`prelint`/`pretest`/`prebuild` chain to `gen:email-boundaries`. CI freshness gate: `pnpm gen:email-boundaries && git diff --exit-code lib/audit/email-boundaries.generated.ts`. Per memory `feedback_audit_derives_from_spec_not_handoff.md`.
- **Layer 1: Parser-write static analysis** (plan Task X.5 Step 2 sub-assertion 1) — ts-morph `Project({ tsConfigFilePath: 'tsconfig.json' })` walks every file under `lib/parser/**/*.ts`. For every `PropertyAssignment` / object-literal-shorthand / call-site param-binding whose target property name matches `/^email$|_email$/`, assert the RHS expression is EITHER a `CallExpression` to `canonicalize` (resolved via ts-morph symbol → `lib/email/canonicalize.ts`) OR the literal `null` / `undefined`. **No identifier-name shortcuts** — the matcher walks ts-morph symbols, not source-text regex.
- **Layer 2: DB-write defensive canonicalization** (Step 2 sub-assertion 2) — for every `from(<table>).insert(<obj>)` / `from(<table>).upsert(<obj>)` / equivalent SQL builder call in `lib/sync/applyParseResult.ts`, `lib/reports/submit.ts`, `lib/reports/rateLimit.ts`, `lib/sync/applyStaged.ts`, `lib/admin/onboarding/finalize.ts`, `lib/sync/discard.ts`, `lib/admin/onboarding/pendingIngestionsActions.ts`, `lib/admin/alerts.ts`, `lib/auth/validateGoogleSession.ts` (admin_alerts.context UPSERT site), assert every email-shaped property in `<obj>` is the result of a `canonicalize` call. The table set comes from the generated boundary manifest; the email-shaped-property predicate is `/^email$|_email$|_by_email$|^identity$/` PLUS structured detection of `admin_alerts.context` JSONB email subfields (`context.matchedEmail`, `context.collidingEmails[]`, any field whose name matches `/email/i` inside the context object literal).
- **Layer 3: Schema CHECK constraint exact-expression match** (Step 2 sub-assertion 3) — SQL introspection via `pg_get_constraintdef`: for each email-bearing column in the generated boundary manifest, assert the constraint definition matches `CHECK ((<column> = lower(btrim(<column>))))` byte-for-byte (normalized for whitespace). Catches a CHECK with the right name but a wrong/weakened body (e.g., a regex check or a `LOWER()` without `BTRIM`). Email-bearing columns include `crew_members.email`, `transportation.driver_email`, `contacts.email`, and `shows.client_contact ->> 'email'` JSONB-extracted via CHECK if reachable.
- **Layer 4: RLS-helper definition introspection** (Step 2 sub-assertion 4) — `SELECT proname, pronargs FROM pg_proc WHERE proname IN ('is_admin', 'auth_email_canonical', 'canonicalize_email') AND pronamespace = 'public'::regnamespace` returns EXACTLY three rows with `(is_admin, 0)`, `(auth_email_canonical, 0)`, `(canonicalize_email, 1)`. `pg_get_functiondef(oid)` bodies match canonical Task 2.3 definitions: `is_admin` returns `(auth.jwt() #>> '{app_metadata,role}' = 'admin') OR EXISTS (SELECT 1 FROM public.admin_emails WHERE email = auth_email_canonical() AND is_active)`; `auth_email_canonical` delegates to `canonicalize_email(auth.email())`; `canonicalize_email` returns `lower(btrim($1))`. **Drop / rename / arity-change in any one fails the audit.**
- **Layer 5: Validator canonicalization** (Step 2 sub-assertion 5) — `lib/auth/validateGoogleSession.ts` contains a `canonicalize(supabaseAuth.user.email)` (or equivalent named binding chained from `canonicalize`) BEFORE the SELECT against `crew_members.email`. Verified via ts-morph: walk the function body until first reach of `from('crew_members').select(...).eq('email', X)` (or `.match({ email: X })` / equivalent) and assert `X` symbol traces back to a `canonicalize` call upstream. Same audit applied to `lib/auth/validateGoogleIdentity.ts` (cross-show identity-only validator) AND `lib/data/listShowsForCrew.ts` (the `/me` show-list reader).
- **Layer 6: Reports `reported_by` canonicalization** (Step 2 sub-assertion 6) — `lib/reports/submit.ts` admin path canonicalizes admin email before INSERT. Crew path writes `crew_members.id::text`; ts-morph asserts the INSERT object's `reported_by` field is EITHER `canonicalize(<expr>)` (admin path) OR `<crew_member_id>.toString()` / equivalent UUID expression (crew path) — never a raw email shape. **Round-trip negative regression**: a synthesized fixture INSERT with `reported_by = 'doug@fxav.net'` on the crew path triggers an audit failure with the canonical message naming the violating site.
- **Layer 7: `admin_alerts.context` JSONB email-field canonicalization** (Step 2 sub-assertion 7) — the `lib/auth/validateGoogleSession.ts` `AMBIGUOUS_EMAIL_BINDING` UPSERT into `admin_alerts` carries `context.collidingEmails[]` + `context.matchedEmail` — ts-morph walks the context object-literal initializer + asserts every email-shaped subfield (key name matches `/email/i`) is sourced from a `canonicalize` call. Future `admin_alerts.context` writes that include email-bearing fields (e.g., a hypothetical `WEBHOOK_TOKEN_INVALID` payload with the requester email) MUST inherit the audit automatically — no per-code allowlist.
- **Defense-in-depth: inline-normalization static-text guard** (M3 R4 Finding 1 inheritance) — extend `tests/admin/no-inline-email-normalization.test.ts:70-85` `AUDITED_PATHS` to cover every path in the generated boundary manifest, PLUS `lib/parser/blocks/**/*.ts`, `lib/reports/**/*.ts`, `lib/admin/onboarding/**/*.ts`, `lib/sync/**/*.ts` (already partially covered), `lib/admin/alerts.ts`. Assert no `.toLowerCase()` / `.toLocaleLowerCase()` / `.trim()` / `.trimStart()` / `.trimEnd()` patterns outside comments. The M3 test's `// canonicalize-exempt: <reason>` opt-out convention is preserved; any new exempt-line in X.5 scope MUST cite a non-email use (e.g., a sheet-row label or an admin-display name). **The M3 meta-test stays at `tests/admin/no-inline-email-normalization.test.ts`** — X.5 EXTENDS its `AUDITED_PATHS` array, does NOT relocate or rename it (M3 tests stay green discipline; X.3 helper-refactor lesson).
- **Cross-helper allowlist round-trip** (memory `feedback_negative_regression_verification.md`) — synthesize a stash where (a) one `crew_members` email CHECK is dropped, audit FAILS with `+missing_check:crew_members.email`; (b) one `lib/parser/blocks/crew.ts` `email: row.email` is left without `canonicalize`, audit FAILS with `+raw_email_assignment:lib/parser/blocks/crew.ts:<line>`; (c) `auth_email_canonical` is renamed to `auth_email_canonicalized`, audit FAILS with `+missing_rls_helper:auth_email_canonical`; (d) a synthesized `.toLowerCase()` chain is added to `lib/auth/validateGoogleSession.ts`, the inline-normalization defense-in-depth guard FAILS. Each negative regression is documented in the convergence log with stash SHA before APPROVE.
- **Regression fixtures** — under `tests/cross-cutting/fixtures/email-canonicalization/` (~6 positive failure-mode fixtures + their counterparts):
  - `bad-parser-raw-email.ts.fixture` (parser block assigns `email: row['Email']` without canonicalize)
  - `bad-db-insert-raw-email.ts.fixture` (DB write helper INSERTs `email: bodyEmail` directly)
  - `bad-jsonb-context-raw-email.ts.fixture` (`admin_alerts` UPSERT with `context.matchedEmail: rawEmail`)
  - `bad-validator-no-canonicalize.ts.fixture` (`validateGoogleSession` SELECTs `from('crew_members').eq('email', supabaseAuth.user.email)` without canonicalize)
  - `bad-reports-reported-by-raw-email.ts.fixture` (crew-path `reports.reported_by = adminEmail` write)
  - `bad-inline-toLowerCase.ts.fixture` (`const e = raw.toLowerCase().trim()` in an audited path)
  - `good-canonicalized-parser.ts.fixture` (parser block correctly wraps in `canonicalize(...)`)
  - `good-canonicalized-db-write.ts.fixture` (DB write helper correctly wraps)
  - `good-canonicalized-jsonb-context.ts.fixture` (`admin_alerts.context` correctly wraps all email subfields)
  - `good-validator-canonicalizes.ts.fixture` (validator correctly canonicalizes before SELECT)
  - `good-reports-crew-uses-id.ts.fixture` (crew-path uses `crew_members.id::text`, no email written)
- **CI workflow** exposes the audit as status check `x5-email-canonicalization` (NOT `x5-rls-coverage` — see drift note in opening summary). Uses canonical artifact-naming pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}` (X.2 R1 codification). Includes `pnpm gen:admin-tables && git diff --exit-code` AND `pnpm gen:watermark-symbols && git diff --exit-code` (inherited) AND the new `pnpm gen:email-boundaries && git diff --exit-code lib/audit/email-boundaries.generated.ts` BEFORE the audit step. `pretypecheck`/`prelint`/`pretest`/`prebuild` chain ALL THREE generators.
- **Spec ↔ plan parity assertion** (AC-X.6 cross-cutting parity, mirroring X.4's parity assertion): parses spec §4.1.1 prose + plan Task X.5 Step 1 table; asserts `setEqual(specBoundaries, planBoundaries)` for the boundary inventory (canonical key = `Layer:Path`). Fails on row drift (e.g., spec adds a `client_contact.email` JSONB row but plan doesn't, or vice versa) with named diff `+missing_in_plan:<key>` / `-extra_in_plan:<key>`.
- **AVOID the X.2 residual substring-matching trap** (also flagged as X.3/X.4 watchpoint). The audit walks ts-morph AST symbols + exact-name property-key matching. `BANNED_OUTSIDE_AUTH_LIB`-style `.some(b => v.includes(b))` substring patterns are banned. The M3 static-text guard MAY use regex (it's defense-in-depth secondary; precedent in `tests/admin/no-inline-email-normalization.test.ts:50-56`), but primary layers 1–7 use ts-morph symbol resolution.

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (per `00-overview.md` and `AGENTS.md`):

- [x] Amendment 1 — `listForRepo` recovery contract — **N/A — M8-only.**
- [x] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — M8-only.**
- [x] Amendment 3 — `lease_holder` ownership protocol — **N/A — M8-only.**

X.5 audits the email-canonicalization surface; none of the three §13.2.3 amendments touch email persistence. The 2026-05-14 admin-allowlist amendment IS in scope (it's why `lib/data/adminEmails.ts` + `app/admin/settings/admins/actions.ts` were added to the M3 `AUDITED_PATHS` list at `tests/admin/no-inline-email-normalization.test.ts:78-82`). The 2026-05-19 §12.4 catalog cleanup is not in scope.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0..M10 closed. X.1 closed at `2090dc2`. X.2 closed at `84af646`. X.3 closed at `d4775f9`. X.4 closed at `a6bb529`. M11 Phase A in-flight commits at HEAD (Phase A's `app/help/**` work is parallel and does NOT touch email-canonicalization surfaces).
- [x] **Pre-flight tests passing in isolation**:
  - `pnpm lint` exits 0 (5-warning baseline carries forward from X.4 close — none are `<img>`; mix of react-hooks/exhaustive-deps + unused-var per X.4 §4).
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0.
  - `pnpm test:audit:x1-catalog-parity` exits 0.
  - `pnpm test:audit:x2-no-raw-codes` exits 0.
  - `pnpm test:audit:x3-trust-domain` exits 0 (28 tests).
  - `pnpm test:audit:x4-no-global-cursor` exits 0.
  - `pnpm verify:spec-amendment` exits 0.
  - **M3 email-normalization meta-test green**: `pnpm test tests/admin/no-inline-email-normalization.test.ts` passes (current `AUDITED_PATHS` count = 8 explicit + `lib/drive/**` + `lib/sync/**`; X.5 EXTENDS this list).
- [x] **Specific files present from prior milestones**:
  - `lib/email/canonicalize.ts` (M1-shipped) — the canonical helper. X.5 asserts ALL email-bearing assignments route through this single function.
  - `lib/audit/admin-tables.generated.ts` + `lib/audit/watermark-symbols.generated.ts` + `scripts/generate-admin-tables.ts` + `scripts/extract-watermark-symbols.ts` (X.3/X.4-shipped). X.5 mirrors this pattern for `email-boundaries.generated.ts`.
  - `lib/audit/authChain.ts` + `lib/audit/trustDomains.ts` + `lib/audit/protectedRoutes.ts` + `lib/audit/authPrimitives.ts` (X.3-shipped) + `lib/audit/noGlobalCursor.ts` (X.4-shipped) — X.5 reads these as integration partners (no refactor expected).
  - `lib/messages/__internal__/walkSourceFiles.ts` (X.1-shipped) — X.5 reuses for source-file enumeration.
  - `tests/admin/no-inline-email-normalization.test.ts` (M3 R4-shipped, 124 lines) — X.5 EXTENDS `AUDITED_PATHS` to cover the full boundary manifest. The structural shape (regex pattern set + `// canonicalize-exempt:` opt-out + `stripComments` helper + negative control test) is preserved.
  - `tests/cross-cutting/auth.test.ts` (X.3-shipped, 28 tests) — must stay green (no expected interaction).
  - `tests/cross-cutting/no-global-cursor.test.ts` (X.4-shipped) — must stay green (no expected interaction).
  - `.github/workflows/x-audits.yml` (X.1/X.2/X.3/X.4-shipped) — X.5 extends with `x5-email-canonicalization` job + the email-boundaries freshness gate.
  - `tsconfig.json` — X.5 extends `exclude` to add `tests/cross-cutting/fixtures/email-canonicalization*` so the audit's own bad fixtures don't trip the live-tree walk.
- [x] **NEW X.5 deliverables**:
  - `scripts/extract-email-boundaries.ts` — parser for spec §4.1.1 prose + plan Task X.5 Step 1 markdown table; emits `lib/audit/email-boundaries.generated.ts` (boundary rows + email-bearing-table set + email-bearing-property predicate seed).
  - `lib/audit/email-boundaries.generated.ts` — committed `readonly` manifest; `// @generated` header; eslint override entry.
  - `lib/audit/emailCanonicalization.ts` — the seven-layer audit (parser-write / DB-write / schema CHECK / RLS helpers / validator / reports / `admin_alerts.context` JSONB). Or split into `lib/audit/emailCanonicalization/{parser,dbWrite,schema,rls,validator,reports,jsonb}.ts`.
  - `tests/cross-cutting/email-canonicalization.test.ts` — the CI gate `x5-email-canonicalization`. Layers 3 + 4 require a Supabase test client (mirrors the X.3 / X.4 schema-introspection harness OR static parse of `supabase/migrations/` + `supabase/tables/` for the CHECK constraint text).
  - `tests/cross-cutting/fixtures/email-canonicalization/` — ~11 fixtures (5 bad + 6 good) per §2.
  - `package.json` script entries: `gen:email-boundaries`, `test:audit:x5-email-canonicalization`. `pretypecheck`/`prelint`/`pretest`/`prebuild` chained to BOTH X.3/X.4 generators AND the new `gen:email-boundaries`.
  - `.github/workflows/x-audits.yml` job extension exposing `x5-email-canonicalization` with canonical artifact-naming + triple freshness gates.
  - `eslint.config.js` (or `.eslintrc.json`) override entry for `lib/audit/email-boundaries.generated.ts`.
  - **EXTENDED FROM M3 (in X.5 commit range)**: `tests/admin/no-inline-email-normalization.test.ts` `AUDITED_PATHS` array expansion to cover the full boundary manifest. M3 test stays at its current path; ts-morph-shaped audit lives separately in `tests/cross-cutting/email-canonicalization.test.ts`.
- [x] **DEFERRED.md** — no X.5 sub-items pre-listed. Audit findings on the live tree are not expected (M3 R4 closed the inline-normalization class; spec §4.1.1 has been canonical since M1); any mechanical fix lands in X.5 scope per memory `feedback_deferral_discipline.md`. **Drift finding for AC-X.6 required-checks-list rename** (`x5-rls-coverage` → `x5-email-canonicalization`) is logged in X.5's convergence log + routed to X.6 for the cross-cutting parity audit, NOT pre-emptively patched.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** (invariant 1) — always. Each fixture is failing-test-first.
- [ ] **Per-show advisory lock** (invariant 2) — **N/A.** X.5 makes no DB mutations; reads `pg_proc` / `pg_get_constraintdef` only.
- [x] **Email canonicalization at boundary** (invariant 3) — **X.5 IS the canonical structural enforcement.** Replaces the M3-era narrow `AUDITED_PATHS` static-text guard with seven-layer structural audit (ts-morph property-assignment walk + DB CHECK introspection + RLS helper introspection + validator/reports/JSONB symbol-resolution audit + extended static-text guard).
- [x] **No global cursor** (invariant 4) — **N/A for X.5's audit code; structurally enforced by X.4.**
- [ ] **No raw error codes in user-visible UI** (invariant 5) — **N/A for X.5's audit code; structurally enforced by X.2.**
- [x] **Commit per task** (invariant 6) — always. Conventional-commits: `<type>(<scope>): <summary>`. Suggested scopes: `audit`, `cross-cutting`, `scripts`, `test`, `ci`, `email`. Example commits:
  - `scripts(audit): bootstrap extract-email-boundaries extractor (Task X.5 Step 1)`
  - `feat(audit): commit lib/audit/email-boundaries.generated.ts manifest`
  - `feat(audit): layer-1 parser-write ts-morph audit (Task X.5 Step 2.1)`
  - `feat(audit): layer-2 DB-write defensive canonicalization audit (Task X.5 Step 2.2)`
  - `feat(audit): layer-3 schema CHECK pg_get_constraintdef introspection (Task X.5 Step 2.3)`
  - `feat(audit): layer-4 RLS helper pg_proc introspection (Task X.5 Step 2.4)`
  - `feat(audit): layer-5/6 validator + reports canonicalization audit (Task X.5 Step 2.5/2.6)`
  - `feat(audit): layer-7 admin_alerts.context JSONB email-field audit (Task X.5 Step 2.7)`
  - `test(cross-cutting): X.5 email-canonicalization audit + ~11 regression fixtures (Task X.5 Step 2)`
  - `test(admin): extend no-inline-email-normalization AUDITED_PATHS to full boundary manifest (M3 R4 inheritance)`
  - `ci(audits): wire x5-email-canonicalization as PR-required status check + email-boundaries freshness gate`
- [x] **Spec is canonical** (invariant 7) — boundary manifest derives from spec §4.1.1 prose + plan Task X.5 Step 1 table. Parity assertion fails on spec ↔ plan drift. The AC-X.6 required-checks-list internal drift is surfaced as a finding, NOT silently fixed (memory `feedback_audit_derives_from_spec_not_handoff` applied recursively to spec internal consistency).
- [ ] **UI quality gate / impeccable dual-gate** (invariant 8) — **N/A — no UI surface.** X.5 touches `scripts/`, `lib/audit/`, `tests/cross-cutting/`, `tests/admin/no-inline-email-normalization.test.ts`, `.github/workflows/`, `package.json`, `eslint.config.js`.
- [x] **Supabase call-boundary discipline** (invariant 9) — **PARTIAL.** Layer 3 + Layer 4 invoke Supabase via the test client to introspect `pg_proc` + `pg_get_constraintdef`. Per AGENTS.md §1.9, every such call MUST destructure `{ data, error }`, distinguish returned-error from thrown-error, and surface infra faults as discriminable typed results. X.5's audit code is subject to the meta-test registry — if a new helper is introduced, EITHER add a row to `tests/auth/_metaInfraContract.test.ts` OR carry an inline `// not-subject-to-meta: <reason>` comment. Most likely X.5 reuses an existing Supabase admin test client; verify before claiming done.

## 6. Watchpoints from prior adversarial review

Pulled forward from X.1 R1–R3 + X.2 R1 + X.3 R1 + X.4 R1–R2 close + 2026-05-19 memories.

1. **Derive from spec at audit-execution time, NOT from handoff arrays** (memory `feedback_audit_derives_from_spec_not_handoff.md`, codified 2026-05-19 from X.3's 21-vs-19 drift; honored in X.4). The boundary-list extractor parses spec §4.1.1 prose + plan Task X.5 Step 1 table. Reviewer verifies that editing spec §4.1.1 + running `pnpm gen:email-boundaries` produces a diff in `lib/audit/email-boundaries.generated.ts`; reverting the spec edit and re-running produces no diff (round-trip cleanly). Hardcoded boundary arrays in the audit code are a P0.

2. **AST scoping, NOT substring grep** (X.2 residual, X.3 watchpoint, X.4 R1 P0-2 lesson). The audit walks ts-morph property assignments + symbol-resolves the RHS to `canonicalize` from `lib/email/canonicalize.ts`. **No identifier-name regex shortcuts** (X.4 R1 P0-2c: `expectedSnapshot` named variable grants reviewed-context trust — X.4's lesson was to walk helper returns via `sourceFromHelperCall`, not name-pattern match). For X.5 the analogous trap is: a variable named `canonicalized` that's NOT actually the result of a `canonicalize` call. Resolver MUST trace to the function symbol, not the variable name.

3. **DB CHECK exact-expression match** (Step 2.3). Normalize whitespace via `pg_get_constraintdef` then byte-compare against the canonical form. A CHECK named correctly but body like `CHECK (email = LOWER(email))` (missing `BTRIM`) MUST FAIL. Reviewer adds a synthetic CHECK mutation in a stash to verify the audit catches the weakening.

4. **RLS-helper `pronargs` discipline** (Step 2.4 + spec §4.1.1 line 577). `is_admin()` zero-arg; `auth_email_canonical()` zero-arg; `canonicalize_email(text)` one-arg. **A drop / rename / arity-change is a P0.** Reviewer verifies by synthesizing `DROP FUNCTION auth_email_canonical(); CREATE FUNCTION auth_email_canonicalized() ...` in a stash and confirming the audit fails with `+missing_rls_helper:auth_email_canonical`.

5. **`admin_alerts.context` JSONB email-field detection covers nested paths** (Step 2.7). The matcher walks the context object-literal initializer recursively (including arrays — `collidingEmails[]`) and asserts every key whose name matches `/email/i` carries a `canonicalize`-sourced RHS. Future codes that introduce email-bearing context fields (e.g., the spec §12.4 catalog `WEBHOOK_TOKEN_INVALID` mentioned at AC-X.5 line 1) are picked up automatically. Reviewer adds a synthetic context-write fixture with a deeply-nested email field (`context.payload.colliding.emails[0]`) and confirms it's caught.

6. **M3 `AUDITED_PATHS` regression preservation** — the existing 8 paths in `tests/admin/no-inline-email-normalization.test.ts:70-85` stay covered. X.5's `AUDITED_PATHS` extension is a superset, not a replacement. Reviewer re-runs the M3 test after the extension and confirms all per-file `test(...)` cases still pass (including the negative controls at lines 107-123).

7. **Class-sweep code-shape-based** (memory `feedback_class_sweep_must_be_code_shape_not_name_list.md`). Layers 1, 2, 5, 6, 7 walk every `.ts`/`.tsx` in their respective tsconfig program subtrees (NOT a hardcoded path array). Reviewer verifies by adding a hypothetical new file under `lib/admin/onboarding/<future>.ts` containing `email: rawEmail` and confirming the audit picks it up automatically.

8. **Same-model-blind-spot pattern** (X.1 R2 lesson; X.4 R1 reinforced). Pre-emptively self-audit before declaring done. Highest-risk pre-emptable failure modes: (a) boundary extraction round-trips cleanly (spec edit produces diff; revert produces no diff); (b) RHS resolution traces ts-morph SYMBOLS not VARIABLE NAMES; (c) DB CHECK normalization handles whitespace + parens variants; (d) all three RLS helpers introspected; (e) `admin_alerts.context` JSONB nested-path traversal works for `collidingEmails[]`; (f) M3 `AUDITED_PATHS` regression stays green.

9. **CI artifact-naming + triple freshness gates** (X.2 R1 codification + X.3 + X.4 freshness pattern). Canonical artifact pattern `<job-name>-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}`. THREE freshness gates run BEFORE the audit step: `gen:admin-tables` (X.3 inherited), `gen:watermark-symbols` (X.4 inherited), `gen:email-boundaries` (new). `pretypecheck`/`prelint`/`pretest`/`prebuild` ALL chain ALL THREE generators.

10. **Cross-cutting parity assertion** (AC-X.6 cross-cutting at `11-cross-cutting.md:~8019`). Spec §4.1.1 ↔ plan Task X.5 Step 1 boundary parity is wired and asserted. Reviewer adds a hypothetical row drift (e.g., remove `report_rate_limits.identity` from the plan table) + re-runs the audit + confirms it fails with a named diff naming the drifted row.

11. **Anti-tautology** (CLAUDE.md). Each bad fixture must have a real failure mode tied to a real boundary-violation shape. Derive expected violation positions from fixture geometry. Spot-check 3 random bad fixtures.

12. **Deferral discipline** (memory `feedback_deferral_discipline.md`). Mechanical fixes land in X.5 scope. The AC-X.6 required-checks-list rename (`x5-rls-coverage` → `x5-email-canonicalization`) is NOT a mechanical X.5 fix — it's a spec amendment that X.6's parity audit was DESIGNED to surface (per AGENTS.md §1.7 + memory `feedback_audit_derives_from_spec_not_handoff` applied recursively). Route to X.6 with the X.5 convergence log noting the drift; do NOT land a spec-amendment commit during X.5.

13. **Verify findings against actual code site before patching** (memory `feedback_verify_review_findings_against_external_api_spec.md`). When adversarial review surfaces a finding (e.g., "validator missing canonicalize before SELECT"), read the audit code verbatim AND read the live `lib/auth/validateGoogleSession.ts` AND confirm the audit's complaint is real before patching.

14. **Same-vector recurrence rule** (memory). If 3+ rounds surface findings on the same audit vector (e.g., "matcher misses a new `*_by_email` column shape"), ship a structural defensive layer — e.g., make the email-bearing-property predicate derive from the generated boundary manifest's column names rather than a hardcoded regex.

15. **R1 finding-disagreement cap is 3** (memory `feedback_iterate_until_convergence.md`). Iterate fix→review→fix→review until APPROVE. Round-3 cap is for finding-disagreement loops, NOT for halting when each round surfaces NEW bugs.

16. **Class-sweep before patching review findings** (memory `feedback_class_sweep_before_patch.md`). When review surfaces a single missed boundary or a single missed property-name pattern, grep the live email layer for sibling shapes before patching only the named site.

17. **Drift NOT pre-emptively patched** — the AC-X.6 required-checks-list `x5-rls-coverage` string is surfaced as a finding in X.5's convergence log, NOT amended during X.5 implementation. X.6's cross-cutting parity audit (per AC-X.6) IS the structural mechanism for detecting + reporting this class of internal spec drift. Pre-emptively renaming during X.5 short-circuits the audit's first real test.

## 7. Test commands

- **X.5 audit:** `pnpm test tests/cross-cutting/email-canonicalization.test.ts` (or `pnpm test:audit:x5-email-canonicalization` after the package.json script entry lands).
- **Email-boundaries generator idempotency:** `pnpm gen:email-boundaries && git diff --exit-code lib/audit/email-boundaries.generated.ts`.
- **M3 meta-test (regression baseline):** `pnpm test tests/admin/no-inline-email-normalization.test.ts` — must stay green after X.5 extends `AUDITED_PATHS`.
- **Existing X.1/X.2/X.3/X.4 gates remain green:** `pnpm test:audit:x1-catalog-parity && pnpm test:audit:x2-no-raw-codes && pnpm test:audit:x3-trust-domain && pnpm test:audit:x4-no-global-cursor`.
- **Type + lint + full test gate (final):** `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings (5-warning baseline from X.4 carries forward).
- **CI workflow check:** `.github/workflows/x-audits.yml` exposes a job named `x5-email-canonicalization` verbatim; runs on `pull_request` + `push` to `main`; includes ALL THREE freshness gates BEFORE the audit step; canonical artifact naming.

## 8. Exit criteria

- [ ] All sub-steps in `11-cross-cutting.md` Task X.5 (Steps 1–5) checked off.
- [ ] AC-X.5 has at least one passing test asserting each named surface: layer 1 (parser-write), layer 2 (DB-write defensive), layer 3 (schema CHECK), layer 4 (RLS helpers — all three: `is_admin`, `auth_email_canonical`, `canonicalize_email`), layer 5 (validator + listShowsForCrew), layer 6 (reports admin vs crew path), layer 7 (`admin_alerts.context` JSONB nested).
- [ ] `scripts/extract-email-boundaries.ts` derives the boundary inventory from spec §4.1.1 prose + plan Task X.5 Step 1 table at audit-execution time. Hardcoded boundary arrays in the audit code are a P0.
- [ ] `lib/audit/email-boundaries.generated.ts` is committed with `// @generated` header; `pnpm gen:email-boundaries && git diff --exit-code` passes; CI regenerate is byte-identical; `eslint.config.js` override entry exists.
- [ ] All ~11 regression fixtures under `tests/cross-cutting/fixtures/email-canonicalization/` exist and behave as specified.
- [ ] **Negative regression verification** (memory `feedback_negative_regression_verification.md`): for EACH of the seven layers, stash a synthesized production-side break (CHECK drop, parser raw-email assignment, RLS helper rename, validator canonicalize removal, reports crew-path raw-email write, admin_alerts.context raw-email subfield, inline `.toLowerCase()` chain) — confirm the audit fails — restore — confirm green. Document each stash SHA in the convergence log.
- [ ] M3 meta-test `tests/admin/no-inline-email-normalization.test.ts` extended with full boundary manifest paths; all current tests + new tests pass.
- [ ] CI exposes `x5-email-canonicalization` verbatim. Spot-check `.github/workflows/x-audits.yml`. Artifact name uses canonical pattern. ALL THREE freshness gates run BEFORE the audit step.
- [ ] `pretypecheck` / `prelint` / `pretest` / `prebuild` ALL chained to ALL THREE generators (`gen:admin-tables` + `gen:watermark-symbols` + `gen:email-boundaries`) in `package.json`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` exits 0 with no new warnings (5-warning baseline preserved).
- [ ] No new `// TODO` or `// FIXME` lines.
- [ ] **AC-X.6 required-checks-list drift surfaced in convergence log** as a finding for X.6 (NOT pre-emptively patched). Convergence log records the drift with verbatim citations: spec §17.2 line 3676 (AC-X.5 body = email canonicalization), spec §17.2 lines 2831/3677/3681 (AC-X.6 required-checks list names `x5-rls-coverage`), plan `11-cross-cutting.md:2057,2167,2181,2289,2297` (named-check usages). X.6's cross-cutting parity audit handles the rename.
- [ ] Adversarial review converged to APPROVE (memory `feedback_iterate_until_convergence.md`).
- [ ] All commits follow `<type>(<scope>): <summary>` format with one logical task per commit.
- [ ] Convergence log at the bottom of this file is filled in (R1 + any subsequent rounds + complexity-hypothesis data point).

## 9. Sandbox / git protocol

- [x] **Codex CLI with relaxed sandbox** — verified working through X.1 / X.2 / X.3 / X.4. Commits run in-session.
- **Invocation discipline (memory `feedback_codex_exec_needs_stdin_closed.md`):** every `codex exec` invocation must close stdin (`< /dev/null`); monitor worker CPU% — 0.0% for 2+ minutes signals a stdin hang.
- **Job-status string** (memory `feedback_codex_companion_status_completed_string.md`): codex-companion terminal status is `"completed"` (past tense), NOT `"complete"`.

## 10. Adversarial review handoff

1. Implementer (Codex) summarizes deliverables, AC sub-criteria satisfied, the AC-X.6 drift finding, and any email-canonicalization drift the audit surfaced on the live tree (with fix-commit SHAs or DEFERRED.md routing).
2. Adversarial reviewer (Opus / Claude Code) invoked. Suggested invocation:
   ```
   /codex:adversarial-review --background --base a6bb529 "X.5 email-canonicalization audit (single-implementer Codex backend; extends M3 meta-test) — see handoff §6 watchpoints + §8 exit criteria. Focus on spec-prose extraction completeness (round-trip cleanliness), ts-morph symbol resolution (not variable-name regex), DB CHECK exact-expression match, RLS-helper pronargs introspection (all three), admin_alerts.context JSONB nested-path traversal, M3 AUDITED_PATHS regression preservation, AND the AC-X.6 required-checks-list drift surfacing (verify X.5 logs it; verify X.5 does NOT pre-emptively patch it)."
   ```
3. Reviewer iterates until APPROVE (memory `feedback_iterate_until_convergence.md`).
4. Per-round routing: X.5 is single-implementer Codex; almost every finding is Codex's. Exceptions surface to orchestrator: spec amendments (the AC-X.6 rename is X.6's, not X.5's), DB CHECK or RLS-helper interaction with `supabase/migrations/` ordering (review-routed to M2-owner if any).
5. Class-sweep before patching (memory `feedback_class_sweep_before_patch.md`): when review surfaces a single missed boundary or a single missed property-name pattern, grep the live email layer for sibling shapes before patching only the named site.
6. **R2+ anchor to milestone base, not R1 fix-base** (memory `feedback_adversarial_review_full_milestone_scope.md`). If a R1 REQUEST_CHANGES occurs, R2 anchors `--base a6bb529` (X.4 close-out SHA), NOT the R1 fix commit, so fresh-eyes drift outside the fix surface is detected.
7. **Lead with fresh-eyes whole-diff audit; prior-findings checklist secondary** (memory `feedback_review_prompt_fresh_eyes_first.md`). R2+ review prompts open with whole-diff watchpoint audit (especially W1, W2, W4, W5 from §6) BEFORE walking the R1 finding-closure checklist.
8. **Complexity-hypothesis data point** (X.4 retrospective): record in convergence log at what round Opus surfaces the first finding Codex self-review missed. X.5's surface (DB introspection + ts-morph symbol resolution + cross-file boundary tracking) is between X.3 (medium) and X.4 (heavy). If Codex's R1 is APPROVE, hypothesis "self-review accuracy decays with audit complexity" weakens. If R1 is REQUEST_CHANGES, hypothesis strengthens. Either is a useful data point for X.6.
9. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies

- **X.1 closed** (`2090dc2`). **X.2 closed** (`84af646`). **X.3 closed** (`d4775f9`). **X.4 closed** (`a6bb529`). X.5 inherits the canonical artifact-naming pattern, the `*.generated.ts` manifest pattern, the freshness-gate CI shape, the `walkSourceFiles` helper, and the ts-morph + Supabase-introspection toolchains.
- **M3-era `tests/admin/no-inline-email-normalization.test.ts` ownership extension**: X.5 EXTENDS `AUDITED_PATHS` to cover the full boundary manifest. The structural meta-test stays at its M3 path (`tests/admin/no-inline-email-normalization.test.ts`); the ts-morph-shaped audit lives separately at `tests/cross-cutting/email-canonicalization.test.ts`. The two test files coexist; M3's defense-in-depth static-text guard is preserved.
- **M1 `lib/email/canonicalize.ts` ownership**: X.5 reads (does not modify) the canonical helper. Any X.5 finding that requires modifying the helper itself surfaces back to M1's owner (Eric / orchestrator decision).
- **M2 RLS helpers ownership**: X.5 introspects `is_admin`, `auth_email_canonical`, `canonicalize_email`. Any drift finding that requires modifying the SQL functions surfaces back to M2's owner. The 2026-05-14 admin-allowlist amendment is the most recent change to `is_admin`'s body (now `app_metadata.role` OR `admin_emails` table lookup); X.5 asserts the current canonical form per spec §4.1.1 line 577.
- **M5 validator ownership**: X.5 audits `lib/auth/validateGoogleSession.ts` + `lib/auth/validateGoogleIdentity.ts`. Any canonicalization drift in those validators surfaces back to M5's owner.
- **M11 Phase B (catalog extension) in flight in parallel.** Phase B catalog work touches §12.4 catalog producers, NOT the email-canonicalization surface. Unlikely Phase B introduces new email-bearing fields. If found, route as an X.5 finding back to Phase B handoff.
- **AC-X.6 required-checks-list drift** (`x5-rls-coverage` string): X.5 surfaces it; X.6 audits it via the cross-cutting parity assertion. X.5 does NOT pre-emptively land the spec-amendment commit — that's X.6's first real test of the parity audit it ships.
- **X.6 (traceability + branch-protection) follows X.5.** X.6 reads X.5's `lib/audit/email-boundaries.generated.ts` as one input to the cross-cutting parity gate (boundary inventory spec ↔ plan parity) AND audits the AC-X.6 required-checks-list ↔ AC-X.5 body parity surfaced by X.5. X.5 does NOT block X.6 conceptually; X.6 just operates on X.5's generated manifest after X.5 closes.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**N/A — no UI surface.** X.5 ships scripts, generated TypeScript manifests, Vitest meta-tests, regression fixtures, an extension of an existing test file, and a CI workflow extension. No file under `app/` (outside `app/api/**`), `components/`, `app/globals.css`, `DESIGN.md`, `tailwind.config.*`. The dual `/impeccable critique` + `/impeccable audit` gate does not apply.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

Declared at handoff time per memory `feedback_meta_test_at_plan_time_not_round_n.md`.

- [ ] **Supabase call-boundary discipline** — **PARTIAL.** Layers 3 + 4 invoke Supabase via the test client to introspect `pg_proc` / `pg_get_constraintdef`. Any new helper subject to §1.9 either adds a row to `tests/auth/_metaInfraContract.test.ts` OR carries an inline `// not-subject-to-meta: <reason>` comment. Most likely X.5 reuses an existing Supabase admin test client; verify and document the choice in the implementation report.
- [ ] **Sentinel hiding in optional text** — **N/A.** X.5 doesn't render.
- [ ] **`admin_alerts` catalog completeness** — **N/A.** X.5 audits email canonicalization at write sites, not catalog producer registry.
- [ ] **Advisory-lock topology** — **N/A.** X.5 makes no `pg_advisory*` calls.
- [x] **EXTEND: tests/admin/no-inline-email-normalization.test.ts** (`AUDITED_PATHS` expansion to full boundary manifest) — concrete failure mode: a future inline `.toLowerCase()` chain added in `lib/admin/onboarding/finalize.ts` or `lib/sync/applyStaged.ts` (currently NOT in `AUDITED_PATHS`) silently passes the M3 guard. X.5's extension catches it.
- [x] **CREATE: email-canonicalization seven-layer audit** (`tests/cross-cutting/email-canonicalization.test.ts`) — parser-write / DB-write / schema CHECK / RLS helpers / validator / reports / admin_alerts.context JSONB. Concrete failure mode: a future write site introduced in `lib/admin/alerts.ts` that UPSERTs `admin_alerts.context.matchedEmail` without canonicalize passes layers 1–6 but is caught by layer 7's recursive JSONB email-field walk.
- [x] **CREATE: email-boundaries generator** (`scripts/extract-email-boundaries.ts`) + **CREATE: manifest** (`lib/audit/email-boundaries.generated.ts`) — derived from spec §4.1.1 prose + plan Task X.5 Step 1 table. Concrete failure mode: spec amendment that adds a new boundary row (e.g., a future `webhook_audit.requester_email` field) without `pnpm gen:email-boundaries` run fails the freshness gate with named diff.
- [x] **CREATE: ~11 regression fixtures** (`tests/cross-cutting/fixtures/email-canonicalization/`) per §2.
- [x] **EXTEND: tests/cross-cutting/auth.test.ts** — must stay green (X.5 does NOT refactor `lib/audit/authPrimitives.ts`; the X.3 helper refactor closed in X.4 commit range). Verified during X.5 implementation.
- [x] **EXTEND: tests/cross-cutting/no-global-cursor.test.ts** — must stay green. X.5 does NOT touch X.4 audit code.

---

## Convergence log

### Implementation ready for adversarial review

- _Pending Codex delivery. Codex appends an `Implementation summary` block here with the final SHA, AC sub-criteria satisfied, the AC-X.6 drift-finding entry, and verification gate results before handing off to Opus._

### Adversarial review

- _Pending. R1 prompt template per §10 above; R2+ anchored to milestone base `a6bb529` per memory `feedback_adversarial_review_full_milestone_scope.md`._

### Complexity-hypothesis data point (X.4 retrospective continuation)

- _Pending. Record the round at which Opus surfaces the first finding Codex self-review missed. X.5 surface complexity: DB introspection + ts-morph symbol resolution + cross-file boundary tracking (between X.3 medium and X.4 heavy). Updates the working hypothesis "same-model self-review accuracy decays with audit complexity (pattern matching > AST resolution > data-flow analysis)."_

### AC-X.6 required-checks-list drift (surfaced for X.6)

- _Pending. X.5 records the drift here verbatim with citations: spec §17.2 line 3676 (AC-X.5 body = email canonicalization), spec §17.2 lines 2831/3677/3681 (AC-X.6 required-checks list names `x5-rls-coverage`), plan `11-cross-cutting.md:2057,2167,2181,2289,2297` (named-check usages). X.5 ships under `x5-email-canonicalization`; X.6's cross-cutting parity audit owns the structural detection + reporting. Per AGENTS.md §1.7 + memory `feedback_audit_derives_from_spec_not_handoff.md` (applied recursively to spec internal consistency), X.5 does NOT pre-emptively amend the spec — letting X.6 surface the drift through its designed audit is the load-bearing path._
