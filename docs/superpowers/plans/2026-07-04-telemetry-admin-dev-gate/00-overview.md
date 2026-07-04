# Telemetry rename + admin-management developer-restriction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two related changes to the admin surface, both building on the just-shipped developer tier (PR #286):

- **Part A** — Rename/relocate `/admin/observability` → `/admin/dev/telemetry` (full live-surface sweep), keeping it **prod-available** and runtime **developer-gated**.
- **Part B** — Restrict ALL admin-roster management (Add / Revoke / Re-add) to **developers** (server-action gate + table-backed RPC actor check + UI hiding). Supersedes the developer-tier's accepted "any admin can revoke any admin" §5.5 risk.

**Architecture:** Part A is a pure move + rename + access-gate-inventory change with **zero data/render-logic change** — the page keeps its `requireDeveloperIdentity()` gate, but its new location under `/admin/dev/` breaks the repo-wide "everything under `/admin/dev/**` is dev-builds-only" assumption, so every gate encoding that assumption is updated and a structural classifier is added. Part B swaps the two admin-management server-action gates `requireAdminIdentity → requireDeveloperIdentity`, changes the `upsert_admin_email_rpc` + `revoke_admin_email_rpc` actor authorization from `is_admin()` to a **table-backed developer** check (pre-lock + post-lock, parity with `set_admin_developer_rpc`), and gates the three management controls in `AdministratorsSection` on the already-threaded `viewerIsDeveloper` prop.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase Postgres (SECURITY DEFINER RPCs, RLS), TypeScript, Vitest, Playwright, ts-morph (AST meta-tests).

**Spec:** `docs/superpowers/specs/2026-07-04-telemetry-rename-admin-dev-gate.md` (canonical; cross-model-APPROVE'd, 7 Codex rounds). Every task cites the spec section it implements. **The spec is canonical** — anywhere the plan and spec disagree, the spec wins (open a question; do not silently "fix").

---

## Global Constraints

Copied from the spec's invariants + AGENTS.md plan-wide invariants. Violating any is a P0 regardless of test status.

- **TDD per task** — failing test → minimal impl → green → commit. Never impl before its test. (invariant 1)
- **Commit per task**, conventional commits (`<type>(<scope>): <summary>`); scopes here: `db`, `auth`, `admin`, `crew-page`, `routing`, `infra`, `plan`. One task per commit. `--no-verify` (the lint-staged hook belongs to the main checkout) → run `pnpm format:check` + `pnpm typecheck` before every push.
- **Advisory-lock single-holder** — `upsert_admin_email_rpc` and `revoke_admin_email_rpc` each acquire `hashtextextended('admin_emails', 0)` at exactly ONE layer (their own body); never nested, no JS-side wrapper lock. Advisory lock BEFORE any row lock. The Part-B migration re-creates both but does NOT change the lock topology. (invariant 2; `tests/auth/advisoryLockRpcDeadlock.test.ts`)
- **Email canonicalization** only via `lib/email/canonicalize.ts` / DB `auth_email_canonical()`. (invariant 3)
- **No raw error codes in UI** — all user copy through `lib/messages/lookup.ts` (`getDougFacing`/`getRequiredDougFacing`). A raw `42501` from a direct-RPC bypass is never user-facing (the Server Action gate + PostgREST DML lockdown are the real entry points). (invariant 5)
- **Supabase call-boundary discipline** — no new auth producer this milestone (`requireDeveloperIdentity` already registered in `tests/auth/_metaInfraContract.test.ts` from developer-tier); no `_metaInfraContract` change. (invariant 9)
- **PostgREST DML lockdown** — `admin_emails` stays write-REVOKE'd from `authenticated`; roster mutation flows only through the (now developer-gated) RPCs. No grant change. (`tests/db/postgrest-dml-lockdown.test.ts`)
- **Migration→validation parity** — the Part-B migration: apply locally + test, `pnpm gen:schema-manifest` + commit manifest (functions-only ⇒ likely no manifest delta, but regenerate and commit whatever changes), surgically apply to validation project `vzakgrxqwcalbmagufjh` (validation creds live in the MAIN checkout `.env.local`). (`tests/db/validation-schema-parity.test.ts`)
- **developer ⟹ admin axiom** — `is_developer()=true ⟹ is_admin()=true`. Table-backed actor checks (NOT the OR-based `public.is_developer()`, whose JWT arm must never authorize a membership mutation) are used for every roster-mutation RPC. (spec §3.2)
- **UI work is Opus-owned** — Task 6 (AdministratorsSection gating) is UI; invariant-8 impeccable v3 dual-gate (`/impeccable critique` + `/impeccable audit`) runs on the UI diff at close-out before the whole-diff Codex review.
- **Never run prettier on the master spec** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (mangles §12.4 cells → x1 divergence).
- **`observe` namespace is NOT renamed** — `lib/observe/**`, `scripts/observe*`, `pnpm observe`, `tests/observe/**` stay. Only their IMPORT of the renamed type file updates. The generic monitoring word "observability" in unrelated logging/crew/cron/sync code stays. (spec §1, §2.3b)

---

## Plan-of-record deviations from spec citations (resolved during pre-draft verification — CONFIRM in review)

These are underspecified/imprecise spec points resolved faithfully during the mandatory pre-draft code-verification pass. Each is called out again in its task. None is a redesign.

1. **§3.3 non-developer read-only else-branch is implicit.** `AdministratorsSection` (`:143-151`) returns `<section><AddAdminDisclosure heading list /></section>`, and `AddAdminDisclosure` (`AddAdminDisclosure.tsx:52-70`) renders the "Add admin" trigger **and** the card containing `{list}` (the whole admins list). Literally gating `AddAdminDisclosure` on `viewerIsDeveloper` would hide the list — contradicting §3.3's "non-developers keep the read-only list." **Resolution (Task 6):** render `AddAdminDisclosure` only when `viewerIsDeveloper`; else render an equivalent read-only card — the SAME `list` node inside a `<div data-testid="admin-settings-admins-card" className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">` plus the heading (no trigger, no form) — mirroring `AddAdminDisclosure.tsx:54-62` verbatim minus the trigger/`AddAdminForm`. The row-level buttons gate independently (below).
2. **`RevokedRow` does not yet receive `viewerIsDeveloper`.** `AdministratorsSection.tsx:135` calls `<RevokedRow row now />` and the fn signature (`:209`) lacks the prop. To gate `ReAddRowButton` (`:220`) on `viewerIsDeveloper` per §3.3, thread `viewerIsDeveloper` into `RevokedRow` (call site + signature) — a required sub-change the spec omits. `RevokeRowButton` (`:194`) is in `AdminRow`, which already receives `viewerIsDeveloper`.
3. **§4 §12.4 prose lives in TWO master-spec locations per code.** `scripts/extract-spec-codes.ts` reads the §12.4 **table row** (`parseRows`, dougFacing/crewFacing/followUp) AND a **`helpfulContext` appendix** (`parseHelpfulContextAppendix`, anchor `<!-- §12.4 helpfulContext appendix`). For each changed code the master-spec edit must touch BOTH: the table row (`ADMIN_EMAIL_WRITE_FAILED` `:2979`, `SELF_REVOKE_FORBIDDEN` `:3021`) AND the appendix line (`:3236`, `:3279`). `gen:spec-codes` then regenerates `spec-codes.ts`; `catalog.ts` is updated to match; x1 compares runtime catalog ↔ generated spec-codes. (spec §4 cited only the table rows.)

---

## Meta-test inventory (declared per AGENTS.md)

This milestone **CREATES**:
- `tests/admin/dev-route-prod-classification.test.ts` (Part A §2.1a structural defense) — reads `with-admin-dev-flag.mjs`'s disable list + a hardcoded `PROD_AVAILABLE_DEV_ROUTES = ["app/admin/dev/telemetry"]` allowlist, walks `app/admin/dev/*` top-level route dirs, asserts every one is classified dev-only OR prod-available (fails on an unclassified new `/admin/dev/*` route). Closes the "prod-under-/admin/dev whack-a-mole" class at CI time. (Task 11)
- `tests/db/admin-mgmt-requires-developer.test.ts` (Part B) — the non-developer-actor `42501` contract test for `upsert_admin_email_rpc`/`revoke_admin_email_rpc` (anti-tautology proof the gate rejects). (Task 1)
- `tests/db/admin-mgmt-developer-concurrency.test.ts` (Part B) — cross-demotion post-lock re-check isolation for upsert/revoke, modeled on `tests/db/set-admin-developer-concurrency.test.ts`. (Task 2)
- `tests/config/observabilityRedirect.test.ts` (Part A) — asserts `nextConfig.redirects()` contains `{ source: "/admin/observability", destination: "/admin/dev/telemetry", permanent: true }`, mirroring `tests/config/rootRedirect.test.ts:17`. (Task 10)

This milestone **EXTENDS**:
- `tests/auth/developerGatingContract.test.ts` — **enforcement 2** flips: `addAdminAction` + `revokeAdminAction` change from `requireAdminIdentity`-gated to `requireDeveloperIdentity`-gated (`ADMIN_GATED_ACTIONS`/`ADMIN_GATE` at `:132-133`, test at `:288-289`). (Task 4) **enforcement 4-style** RPC-SQL guard extends to the two re-created `upsert/revoke` RPCs (≥2 table-backed `exists` actor checks, no `public.is_developer()`; `:333`). (Task 3) The `observability-dim` registry row (`:109-110`) → `telemetry-dim`. (Task 10)
- `tests/cross-cutting/auth-chain-audit.test.ts` — the developer-route regression pin (`:31-37`, the 5-route list) updates `app/admin/observability/page.tsx` → `app/admin/dev/telemetry/page.tsx` and `app/admin/dev/observability-dim/page.tsx` → `app/admin/dev/telemetry-dim/page.tsx`. (The full-registry `arrayContaining` pin at `:13-19` lists only picker/API surfaces — no change.) (Task 10)
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — add the new Part-B migration to the hardcoded `migrationFiles` list (`:33-62`) so the re-created `upsert/revoke` RPCs keep their advisory-before-row-lock + single-holder pin. (Task 3)

This milestone **SATISFIES (no structural edit, must stay green)**:
- `tests/messages/*` x1 catalog-parity — satisfied by the §12.4 3-way lockstep (Task 5).
- `tests/admin/build-artifact-gate.test.ts` — UPDATED (not merely satisfied): prod artifact now EXPECTS `/admin/dev/telemetry` PRESENT while `/admin/dev`, `/admin/dev/source-link-dim`, `/admin/dev/telemetry-dim` stay ABSENT (`:101,:120,:131`). (Task 7)
- `tests/cross-cutting/no-raw-codes-audit.ts` — UPDATED: the `!path.startsWith("app/admin/dev/")` filter (`:319`) narrows so `app/admin/dev/telemetry/**` IS crawled. (Task 7)
- `tests/db/validation-schema-parity.test.ts`, `tests/db/postgrest-dml-lockdown.test.ts` — no change; must stay green after the Part-B migration.
- `tests/auth/_metaInfraContract.test.ts` — no change (no new auth producer).

---

## Advisory-lock holder topology (mandatory — plan touches `pg_advisory*`)

Hashkey: `hashtextextended('admin_emails', 0)`. Existing holders (each a single layer):
- `upsert_admin_email_rpc` (current def `supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:174`, lock at `:218`) — JS-side callers do NOT wrap; the RPC is the sole holder.
- `revoke_admin_email_rpc` (current def `supabase/migrations/20260703230100_admin_emails_developer_tier.sql:121`, lock at `:156`) — sole holder.
- `set_admin_developer_rpc` (same migration `:61`, lock at `:85`) — sole holder; unchanged by this milestone.

**This milestone:** the Part-B migration `CREATE OR REPLACE`s `upsert_admin_email_rpc` + `revoke_admin_email_rpc`. Each **remains the sole holder** of the `admin_emails` key **at its own layer** — no new lock, no nesting, no JS-side lock. The only body change is the actor authorization (`is_admin()` → table-backed developer) plus a **post-lock re-check** (a second table-backed `exists` immediately AFTER `pg_advisory_xact_lock` and BEFORE any row read/update), mirroring the two occurrences in `set_admin_developer_rpc` (`:76` pre-lock, `:89` post-lock). Advisory lock stays BEFORE the `for update` row lock (advisory-then-row-lock). `tests/auth/advisoryLockRpcDeadlock.test.ts` gains the new migration in its `migrationFiles` list (Task 3) so both re-created RPCs stay pinned.

---

## File structure

**Create:**
- `supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql` — `CREATE OR REPLACE` of `upsert_admin_email_rpc` + `revoke_admin_email_rpc` (table-backed developer actor, pre+post-lock).
- `tests/db/admin-mgmt-requires-developer.test.ts`, `tests/db/admin-mgmt-developer-concurrency.test.ts`, `tests/config/observabilityRedirect.test.ts`, `tests/admin/dev-route-prod-classification.test.ts`.
- New route dirs via `git mv`: `app/admin/dev/telemetry/page.tsx`, `app/admin/dev/telemetry-dim/page.tsx`, `components/admin/telemetry/**`, `lib/admin/telemetryTypes.ts`.

**Modify (Part B):** `app/admin/settings/admins/actions.ts`, `components/admin/settings/AdministratorsSection.tsx`, `tests/auth/developerGatingContract.test.ts`, `tests/auth/advisoryLockRpcDeadlock.test.ts`, `tests/db/admin-emails.test.ts`, `tests/admin/admins-actions.test.ts`, `tests/app/admin/adminActionInfraError.test.ts`, `tests/app/admin/adminActionsRevalidate.test.ts`, `tests/app/admin/revokeHang.test.tsx`, master spec §12.4 + `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts`.

**Modify (Part A):** `scripts/with-admin-dev-flag.mjs`, `app/globals.css`, `tests/admin/build-artifact-gate.test.ts`, `tests/cross-cutting/no-raw-codes-audit.ts`, `lib/audit/trustDomains.ts`, `components/admin/nav/navConfig.ts`, `components/admin/nav/AdminNav.tsx`, `app/admin/settings/page.tsx`, `next.config.ts`, `playwright.config.ts`, `tests/cross-cutting/auth-chain-audit.test.ts`, all `@/components/admin/observability/*` + `@/lib/admin/observabilityTypes` importers (incl. `lib/observe/**`, `scripts/observe*`, `lib/admin/loadAppEvents.ts`, `lib/admin/loadCronHealth.ts`), the e2e href-count assertions (`tests/e2e/admin-phase2-surfaces.spec.ts:35`, `tests/e2e/onboarding-wizard-step1.spec.ts:71`), playwright/yml prose comments, and the renamed test files.

---

## Task index

Tasks are in separate files by phase for context economy:

- `01-partB-db.md` — **P0**, Tasks 1–3 (Part-B migration + 42501 test + §4.1 DB-test migration; cross-demotion concurrency; advisoryLock registration + developerGatingContract enforcement-4 extension)
- `02-partB-app.md` — **P1**, Tasks 4–6 (action-gate swap + enforcement-2 flip + §4.2 action-suite migration; §12.4 3-way lockstep; AdministratorsSection UI gating)
- `03-partA-rename.md` — **P2**, Tasks 7–10 (component/type rename + importers; route relocation + §2.1a gate inventory + path references + nav + settings + route-referencing test renames [ONE atomic commit]; old-bookmark redirect + config test; dev-route-prod-classification structural test)
- `04-closeout.md` — **P3**, Tasks 11–14 (whole-milestone self-review + audit-gate sweep; impeccable v3 dual-gate on UI diff; adversarial review (cross-model); execution handoff → CI → merge → ff main)

**Phase ordering rationale:** Part B (P0 DB, P1 app) lands first because its behavioral change is self-contained and its test migrations (§4.1/§4.2) must land atomically with the gate swaps to avoid a red suite window. Part A (P2) is a large mechanical rename with an audit-heavy gate inventory; it touches disjoint sections of the shared meta-tests (`developerGatingContract` registry rows vs. Part B's enforcement 2/4; `auth-chain-audit` route pins — not touched by Part B), so no cross-phase conflict.

**Atomicity note (why Part A is only 4 tasks):** relocating the route file simultaneously breaks `build-artifact-gate`, the `PROTECTED_ROUTES` classification scan, the `auth-chain-audit` regression pin, the `developerGatingContract` registry, and every route-referencing test — none can be a separate green commit, so the route move + full §2.1a inventory + all path references are ONE atomic commit (Task 8), matching the spec's "do not fix piecemeal" §2.1a mandate. The component/type rename (Task 7), the additive redirect (Task 9), and the new structural test (Task 10) are the only genuinely separable Part-A commits. **14 tasks, 4 phases.**
