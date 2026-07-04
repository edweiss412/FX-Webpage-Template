# Developer Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `is_developer` sub-role of admin so normal admins (Doug) never see dev/debug tooling; developers are managed with a per-row toggle in the Administrators section.

**Architecture:** `is_developer` boolean column on `public.admin_emails` + an `is_developer()` SECURITY DEFINER read primitive (email arm ∨ test-only JWT arm) + a `requireDeveloper()/requireDeveloperIdentity()` application chokepoint cloning `requireAdmin`. All four technical surfaces (`/admin/dev/*`, Activity/`/admin/observability`, the stale-session reap, validation reset/reseed) swap their gate to `requireDeveloper*` (access) and hide their entrypoints for non-developers (visibility). Developer-bit *mutation* goes through `set_admin_developer_rpc`, authorized by a **table-backed** actor check (never the OR-based `is_developer()`), under the existing `admin_emails` advisory lock.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase Postgres (SECURITY DEFINER RPCs, RLS), TypeScript, Vitest, Playwright, ts-morph (AST meta-tests).

**Spec:** `docs/superpowers/specs/2026-07-03-developer-tier.md` (canonical; 11-round Codex-APPROVE'd). Every task cites the spec section it implements.

## Global Constraints

- **TDD per task** — failing test → minimal impl → green → commit. Never impl before its test. (AGENTS.md invariant 1)
- **Commit per task**, conventional commits (`<type>(<scope>): <summary>`); scopes here: `db`, `auth`, `admin`, `crew-page`, `infra`, `plan`. One task per commit.
- **Advisory-lock single-holder** — `set_admin_developer_rpc` acquires `hashtextextended('admin_emails', 0)` at exactly one layer (its own body); never nested inside upsert/revoke. Advisory lock BEFORE any row lock. (invariant 2; `tests/auth/advisoryLockRpcDeadlock.test.ts`)
- **Email canonicalization** only via `lib/email/canonicalize.ts` / DB `auth_email_canonical()`. (invariant 3)
- **No raw error codes in UI** — all user copy through `lib/messages/lookup.ts` (`getDougFacing`/`lookupDougFacing`). (invariant 5)
- **Supabase call-boundary discipline** — destructure `{ data, error }`; infra faults are typed/thrown, never silent; new auth producers registered in `tests/auth/_metaInfraContract.test.ts`. (invariant 9)
- **PostgREST DML lockdown** — `admin_emails` stays write-REVOKE'd from `authenticated`; `is_developer` is only ever written via the gated RPCs. (`tests/db/postgrest-dml-lockdown.test.ts`)
- **Migration→validation parity** — every migration: apply locally + test, `pnpm gen:schema-manifest` + commit manifest, surgically apply to validation project `vzakgrxqwcalbmagufjh`. (`tests/db/validation-schema-parity.test.ts`)
- **developer ⟹ admin axiom** — `is_developer()=true ⟹ is_admin()=true` in both arms (email arm = active admin row; JWT arm ANDs `role='admin'`). This is why `requireDeveloper` REPLACES `requireAdmin` on gated surfaces. (spec §2)
- **UI work is Opus-owned**; invariant-8 impeccable v3 dual-gate (`/impeccable critique` + `/impeccable audit`) runs on the UI diff at close-out before the whole-diff Codex review.
- **Never run prettier on the master spec** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.
- **`--no-verify` commits** (shared lint-staged hook belongs to the main checkout) → run `pnpm format:check` + `pnpm typecheck` before pushing.

## Meta-test inventory (declared per AGENTS.md)

This milestone **CREATES**:
- `tests/auth/developerGatingContract.test.ts` — the structural defense (spec §6.1): (1) AST gate-coverage over developer-gated server-action files, (2) `PROTECTED_ROUTES` route/page coverage, (3) error-posture registry + `inline-typed-exception` enumeration, (4) `set_admin_developer_rpc` SQL authorization guard (table-backed `exists`, no `public.is_developer()`).

This milestone **EXTENDS**:
- `tests/auth/_metaInfraContract.test.ts` — add `requireDeveloper`, `requireDeveloperIdentity` producers + behavioral rows.
- `tests/cross-cutting/auth-chain-audit.test.ts` (via `lib/audit/trustDomains.ts` + `lib/audit/authPrimitives.ts`) — `ChainStep` gains `requireDeveloper`; `PROTECTED_ROUTES` rows for the dev page + 2 harness pages + observability page + reap route change to `chain:["requireDeveloper"]`; recognizer accepts `requireDeveloper*` as a first-line gate. **Routes/pages only** — non-route server actions are covered by `developerGatingContract`.
- `tests/messages/codes.test.ts` (x1 catalog parity) — satisfied by the §12.4 lockstep for `SELF_DEVELOPER_DEMOTE_FORBIDDEN`.

This milestone **SATISFIES (no edit, must stay green)**:
- `tests/db/validation-schema-parity.test.ts`, `tests/db/postgrest-dml-lockdown.test.ts`, `tests/auth/advisoryLockRpcDeadlock.test.ts`, `tests/admin/build-artifact-gate.test.ts`.

## Advisory-lock holder topology (mandatory — plan touches `pg_advisory*`)

Hashkey: `hashtextextended('admin_emails', 0)`. Existing holders (each a single layer):
- `upsert_admin_email_rpc` (`20260514000000:218`) — JS-side callers do NOT wrap; the RPC is the sole holder.
- `revoke_admin_email_rpc` (`20260621000000:71`) — sole holder.

**New holder:** `set_admin_developer_rpc` acquires the SAME key in its own body, as the **sole** holder for its call path. It is NEVER invoked from within upsert/revoke (no nesting). Its JS wrapper (`setAdminDeveloper` in `lib/data/adminEmails.ts`) does NOT acquire any advisory lock. Advisory lock is taken BEFORE the `SELECT ... FOR UPDATE` (advisory-then-row-lock), matching the two existing RPCs. `tests/auth/advisoryLockRpcDeadlock.test.ts` derives lock-taking RPCs from migration files and must recognize + pass the new RPC.

## File structure

**Create:**
- `supabase/migrations/<ts>_admin_emails_developer_tier.sql` — column + CHECK + bootstrap + tripwire + `is_developer()` + `set_admin_developer_rpc` + `revoke_admin_email_rpc` CREATE OR REPLACE.
- `lib/auth/requireDeveloper.ts` — `DeveloperInfraError`, `resolveDeveloperIdentity`, `requireDeveloper`, `requireDeveloperIdentity`, `isCurrentUserDeveloper`.
- `app/admin/settings/admins/developerActions.ts` — `setDeveloperAction` (developer-only server action).
- `components/admin/settings/DeveloperToggleButton.tsx` — client toggle bound to `setDeveloperAction`.
- `tests/auth/developerGatingContract.test.ts` — structural meta-test.
- DB + unit + e2e test files per task.

**Modify:** `lib/auth/constants.ts`, `lib/data/adminEmails.ts`, `app/api/test-auth/set-session/route.ts`, `components/admin/settings/DevToolsRow.tsx`, `components/admin/settings/AdministratorsSection.tsx`, `components/admin/nav/navConfig.ts`, `components/admin/nav/AdminNav.tsx`, `app/admin/layout.tsx`, `app/admin/settings/page.tsx`, `app/admin/settings/admins/page.tsx`, `app/admin/observability/page.tsx`, `app/admin/dev/page.tsx`, `app/admin/dev/actions.ts`, `app/admin/dev/source-link-dim/page.tsx`, `app/admin/dev/observability-dim/page.tsx`, `app/api/admin/onboarding/reap-stale-sessions/route.ts`, `app/admin/settings/_actions/validationReset.ts`, `lib/audit/trustDomains.ts`, `lib/audit/authPrimitives.ts`, `tests/auth/_metaInfraContract.test.ts`, master spec §12.4 + `lib/messages/catalog.ts` + generated code.

## Task index

Tasks are in separate files by phase for context economy:
- `01-db-foundation.md` — Tasks 1–2 (migration, RPCs, DB tests, manifest, validation apply)
- `02-auth-primitives.md` — Tasks 3–5 (requireDeveloper, visibility helper, _metaInfraContract)
- `03-minter-datalayer.md` — Tasks 6–7 (test minter, adminEmails data layer)
- `04-action-and-catalog.md` — Tasks 8–9 (§12.4 code, setDeveloperAction)
- `05-access-gate-swaps.md` — Tasks 10–13 (dev routes, observability, reap route, validationReset)
- `06-visibility-ui.md` — Tasks 14–18 (DevToolsRow, nav, settings page, admins page, Administrators toggle)
- `07-structural-and-e2e.md` — Tasks 19–21 (auth-chain-audit, developerGatingContract, Playwright e2e)
- `08-closeout.md` — Task 22 (self-review, impeccable dual-gate, adversarial review, handoff)
