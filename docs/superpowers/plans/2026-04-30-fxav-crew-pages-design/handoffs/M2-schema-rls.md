# Handoff — M2: Schema, RLS, migrations, seed

**Handed off:** 2026-05-02 by Eric Weiss
**Implementer:** GPT-5.5 / Codex CLI (per ROUTING.md)
**Adversarial reviewer:** Opus 4.7 / Claude Code
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/02-schema-rls.md`

---

## 1. Spec sections in scope

Plan `02-schema-rls.md` cites the following scope verbatim: `Spec context: §4 entire data model, §17.1 milestone 2.`

- §4 — Entire data model: schema, RLS, admin-only surfaces, onboarding/admin tables, sync/report/staging ledgers, and schema-level invariants.
- §17.1 — Milestone 2 acceptance criteria and demo gates.

## 2. Acceptance criteria

- AC-2.1 — Every schema table named for M2 exists with documented columns, constraints, FK actions, indexes, helper functions, and introspection-enforced definitions.
- AC-2.2 — `crew_members_show_email_unique` rejects duplicate non-null `(show_id, email)` crew rows.
- AC-2.3 — `crew_members_email_canonical` rejects mixed-case or non-canonical crew emails such as `Alice@FXAV.NET`.
- AC-2.4 — `revoked_links.token_version` rejects zero or negative token versions.
- AC-2.5 — The full §4.3 admin-only table list denies non-admin SELECT/INSERT/UPDATE/DELETE across every table and verb cell.
- AC-2.6 — Crew-readable RLS lets a matching published-show crew member SELECT their show and peer rows, denies non-matching crew, and denies crew writes.
- AC-2.7 — The seed script loads all 10 raw fixtures into the persisted schema with no errors and with full shape integrity.

## 3. Spec amendments in scope

- [ ] Amendment 1 — listForRepo recovery contract — N/A for M2 implementation; only M8 behavior. Do not implement recovery logic in this milestone.
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate — N/A for M2 implementation; only M8 behavior. Do not implement report reaper behavior in this milestone.
- [x] Amendment 3 — `lease_holder` ownership protocol — partially applies to M2 schema only. The `reports` table DDL must ship with `idempotency_key`, `processing_lease_until`, and `lease_holder uuid` inline. Runtime ownership behavior remains M8-owned.

Relevant amendment text:

> **`lease_holder uuid` ownership protocol.** Stamped at reservation, rotated on every lease re-acquisition. Required (`AND lease_holder = $myToken`) on every URL-writing tail UPDATE. A 0-row tail UPDATE triggers orphan cleanup: close GH issue with `state_reason: 'not_planned'`, add `fxav-orphan-lost-lease` label, INSERT `admin_alerts` `REPORT_ORPHANED_LOST_LEASE`. If re-SELECT returns null, return 410 `REPORT_HORIZON_EXPIRED`.

Schema note for M2: implement only the inline `reports` columns and canonical unique constraint/index required by §4.1. Do not replay §13.2.3 historical `ALTER TABLE reports ADD COLUMN IF NOT EXISTS ...` fragments.

## 4. Pre-handoff state

- [x] Previous milestone(s) committed: M0 and M1 are present in history. Current head at handoff authoring is `77933c7 docs(handoff): record M1 final-milestone adversarial-review convergence (8 rounds, approved)`.
- [x] Tests passing: `pnpm test && pnpm lint && pnpm typecheck` exits 0 before schema work. Result recorded 2026-05-02; lint reports existing warnings but no errors.
- [x] Specific files present: `PRODUCT.md`, `AGENTS.md`, `lib/email/canonicalize.ts`, `lib/parser/index.ts`, `lib/parser/types.ts`, `fixtures/shows/raw/*.md` (10 raw fixtures), `supabase/config.toml`, `vitest.config.ts`, `tsconfig.json`.
- [x] Specific env vars set in `.env.local`: N/A for authoring SQL and static migration tests. Supabase reset/RLS integration tests may require local Supabase CLI services and project env if the harness expects real PostgREST clients.
- [x] Database migrations applied: N/A before M2; this milestone creates the first application migrations.

If any required pre-flight command fails, do NOT start Task 2.1. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] TDD per task — applies to every M2 task. Test must fail for the intended reason before writing migration/RLS/seed implementation.
- [x] Per-show advisory lock — schema surfaces include lock-governed tables (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`). M2 must provide and test schema/RPC support so later mutating code paths can enforce per-show locks. Test command: `pnpm test tests/db/`.
- [x] Email canonicalization at boundary — M2 adds schema-level CHECK safety nets for email-bearing columns, while `lib/email/canonicalize.ts` remains the primary boundary function. Test command: `pnpm test tests/db/`.
- [x] No global cursor — M2 establishes `shows.last_seen_modified_time` as the per-show watermark and must not add any `lastPollAt` source/table field. Verification: `! rg "lastPollAt" lib app supabase tests`.
- [ ] No raw error codes in UI — N/A; M2 must not touch UI files (`app/` outside `app/api/`, `components/`, design tokens).
- [x] Commit per task — applies. Use `feat(db): ...`, `test(db): ...`, `fix(db): ...`, or `docs(handoff): ...`; do not use bare `db:`.

## 6. Watchpoints from prior adversarial review

- CHECK/enum transitional windows — inline CHECKs and migration fragments must accept every current spec value, NULL/disabled rows where specified, and any plan-documented transitional old+new values. Avoid `ALTER ... IF NOT EXISTS` in the fresh schema because it masks drift.
- Table DDL drift — keep `supabase/migrations/` and any test/introspection expectations aligned. Task 2.2's canonical-source matrix is authoritative for which spec section owns each CREATE block.
- Tier x domain completeness matrix — DB-touching changes must cover table DDL, inline CHECKs, RPC read/write paths, propagation triggers, cleanup/GC tables, frontend/admin N/A rationale, and tests. Missing cells were a known prior review class.
- Admin-only RLS coverage — AC-2.5 must cover the complete §4.3 list, currently 21 tables, across all four verbs. Empty-table or invalid-payload tests are not meaningful; each denial probe needs a service-role control row.
- SECURITY DEFINER hardening — every SECURITY DEFINER helper must set `search_path = public, pg_temp` with `pg_temp` last, schema-qualify relation/function references, revoke public execution, and explicitly grant only required roles.
- Helper shape drift — `is_admin()` and `auth_email_canonical()` are zero-arg helpers; `canonicalize_email(text)` is one-arg. Tests must assert `pronargs` and body shape, including proper function-call syntax with parentheses.
- Reports amendment scope — `reports.idempotency_key`, `reports.processing_lease_until`, and `reports.lease_holder` belong in the initial table definition, but M8 owns recovery, reaper, and ownership protocol behavior.
- M1 carry-forward — parser output is converged but had repeated data-loss findings around contact/ops/transport segmentation. Seed tests should validate persisted shape independently rather than tautologically trusting parser internals.

## 7. Test commands

- Pre-flight and final gate: `pnpm test && pnpm lint && pnpm typecheck`.
- Migration/schema tests: `pnpm test tests/db/`.
- Specific migration test pattern: `pnpm test tests/db/schema.test.ts tests/db/rls.test.ts tests/db/seed.test.ts`.
- Supabase reset workflow: `pnpm dlx supabase db reset`.
- No Playwright required for M2; no layout-dimensions or transition-audit task applies.

## 8. Exit criteria

- [x] All Tasks 2.1 through 2.5 in `02-schema-rls.md` are checked off.
- [x] AC-2.1 through AC-2.7 each have at least one passing assertion.
- [x] Task 2.1 creates and verifies `supabase/migrations/20260501000000_initial_public_schema.sql` from §4.1 public tables.
- [x] Task 2.2 creates and verifies `supabase/migrations/20260501001000_internal_and_admin.sql` using the canonical-source matrix, including `app_settings` singleton bootstrap and inline `reports.lease_holder`.
- [x] Task 2.3 creates and verifies `supabase/migrations/20260501002000_rls_policies.sql` with helper functions, admin-only policies, and crew-readable published-show policies.
- [x] Task 2.4 creates and verifies `supabase/seed.ts` for the 10-fixture corpus.
- [x] Task 2.5 creates and verifies CHECK/FK/index/helper introspection coverage.
- [x] No files under `app/` outside `app/api/`, `components/`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, or `DESIGN.md` are touched.
- [x] All commits follow M2 format with `db` scope, one task minimum per commit.
- [x] `pnpm test && pnpm lint && pnpm typecheck` exits 0.
- [x] Working tree is clean except for intentionally uncommitted handoff convergence-log updates left for Opus adversarial review.
- [x] Adversarial review is NOT run by Codex implementer; Opus/Claude Code runs it after implementation and records convergence below.

## 9. Sandbox / git protocol

- [ ] **Claude Code:** N/A for M2 implementer.
- [ ] **Codex CLI default sandbox:** N/A if current relaxed filesystem/git state permits in-session commits.
- [x] **Codex CLI with relaxed sandbox:** commits run in-session. Verified before starting with `git status --short --branch`, which returned `## main...origin/main [ahead 114]` without permission errors.

## 10. Adversarial review handoff

After the implementer finishes:

1. Implementer summarizes what was built and what AC IDs are satisfied.
2. The adversarial reviewer (Opus 4.7 / Claude Code per ROUTING.md) is invoked via `superpowers:adversarial-review` with §4, §17.1, the M2 plan, this handoff, and the M2 diff as input.
3. Reviewer iterates with implementer until convergence or until ambiguity requires a human decision.
4. Convergence is logged below.

## Convergence log

### Round 1 — 2026-05-02

**Reviewer:** Opus 4.7 / Claude Code via `claude -p` with read-only `Read,Grep,Glob` tools.

**Status:** APPROVED.

**Blocking issues:** None.

**User questions:** None.

**Advisory notes:** Reviewer noted non-blocking follow-ups around hardcoded admin allow-list rotation, static-vs-runtime breadth for the 21 admin-table RLS matrix, the single-row `transportation.show_id` uniqueness model, missing introspection pin for `crew_members_show_id_name_key`, the seed's hardcoded restage fixture filename, and deferring app-side advisory-lock helper shape to later milestones.
