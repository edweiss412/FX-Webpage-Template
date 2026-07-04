# Telemetry rename + admin-management developer-restriction — spec

**Date:** 2026-07-04
**Branch:** `feat/telemetry-admin-dev-gate`
**Status:** autonomous ship (spec + plan user-review gates waived; cross-model APPROVE required at each stage)

Two related changes to the admin surface, both building on the just-shipped developer tier (PR #286):

- **Part A — Rename `/admin/observability` → `/admin/dev/telemetry`** (full sweep of the live admin observability surface), keeping it **prod-available** and runtime **developer-gated**.
- **Part B — Restrict ALL admin management (Add / Revoke / Re-add) to developers.** Supersedes the developer-tier's accepted "any admin can revoke any admin" §5.5 risk.

---

## §1. Scope boundaries (explicit — do not silently widen or narrow)

**IN scope for the rename (Part A):** the live admin observability feature —
- routes `app/admin/observability/page.tsx`, `app/admin/dev/observability-dim/page.tsx`;
- `components/admin/observability/**` (10 files: AutoRefreshControl, ContextDetail, CronHealthHeader, CronRunSummaryCard, EventFilters, EventLevelBadge, EventRow, EventTimeline, cronHealthStatus, + the dir);
- `lib/admin/observabilityTypes.ts`;
- their tests (`tests/admin/observability-*.test.ts`, `tests/app/admin/observabilityPage.test.tsx`, `tests/components/observability/**`, `tests/e2e/observability-layout.spec.ts`);
- nav (`components/admin/nav/navConfig.ts`, `AdminNav.tsx`), `PROTECTED_ROUTES` (`lib/audit/trustDomains.ts`), the build-flag list (`scripts/with-admin-dev-flag.mjs`), and **every import referencing the above**.

**OUT of scope (keep as-is, flagged so the reviewer does not relitigate):**
- **`lib/observe/**`** — the read-only telemetry-access CLI core shipped in PR #285 (`pnpm observe`). It is a distinct subsystem deliberately namespaced `observe`; the admin page imports its query fns (`loadAppEvents`/`loadCronHealth` wrap it) but renaming the CLI core is a separate, much larger surface and is NOT part of this change. Naming stays mixed (admin route = `telemetry`, shared query core = `observe`) — acceptable.
- **Historical `docs/superpowers/{specs,plans}/**-observability-*`** — records of past milestones. Renaming them is revisionism and pointless churn. Left untouched.
- `lib/admin/loadAppEvents.ts` / `loadCronHealth.ts` — not observability-named; the loader **names** stay (they load app-events/cron-health, which is what telemetry shows). Only their import of the renamed `observabilityTypes` → `telemetryTypes` updates.

## §2. Part A — Route move + rename

### §2.1 Route relocation (prod-available)
- `app/admin/observability/page.tsx` → `app/admin/dev/telemetry/page.tsx`. Keep `requireDeveloperIdentity()` as the first statement (unchanged gate — developer-gated, runtime).
- **Prod-availability contract:** the new route is **NOT** added to the disable-list in `scripts/with-admin-dev-flag.mjs` (which renames-aside `app/admin/dev/{page,actions,source-link-dim/page,observability-dim/page}` when `ADMIN_DEV_PANEL_ENABLED` is unset). So `app/admin/dev/telemetry/page.tsx` ships in prod builds and is gated only at runtime by `requireDeveloperIdentity`. This is the intended behavior (telemetry monitors production cron-health + app-events).
- **Two existing gates encode the (now-broken) "all `/admin/dev/**` is dev-only-build-gated" assumption and MUST be updated (Codex R1 HIGH):**
  1. `tests/admin/build-artifact-gate.test.ts` (`:101`) asserts a prod build (flag unset) contains **no** `/admin/dev` artifact. Update it to assert `/admin/dev/telemetry` **IS** present while `/admin/dev` (panel), `/admin/dev/source-link-dim`, `/admin/dev/telemetry-dim` remain **absent**. The build-flag list in `scripts/with-admin-dev-flag.mjs` is the source of truth for what's renamed-aside; the gate must mirror it (telemetry not in the list ⇒ present in prod).
  2. `tests/cross-cutting/no-raw-codes-audit.ts` (`:276`) excludes all `app/admin/dev/**` from the raw-error-code crawl (because those routes are dev-only). **Narrow the exclusion** so `app/admin/dev/telemetry/**` IS crawled (it renders user-facing content in prod → invariant 5 applies), while the still-dev-only `/admin/dev/{page,actions,source-link-dim,telemetry-dim}` stay excluded.
- `app/admin/dev/observability-dim/page.tsx` → `app/admin/dev/telemetry-dim/page.tsx`. This IS a build-disabled dev harness — **update the path in `scripts/with-admin-dev-flag.mjs`'s hardcoded list** (line ~55) so the harness stays build-gated under its new name.

### §2.2 Component + type rename
- `components/admin/observability/` → `components/admin/telemetry/` (git mv all 10 files; internal component names unchanged unless they contain "observability" in an identifier — none of the component export names do; only the DIR + import paths change).
- `lib/admin/observabilityTypes.ts` → `lib/admin/telemetryTypes.ts` (exported symbols `parseAppEventFilters`, `AppEventFilters`, etc. keep their names — they are not "observability"-named; only the file + import path change).
- Update every `@/components/admin/observability/*` and `@/lib/admin/observabilityTypes` import across the tree to the new paths. **This includes the otherwise-out-of-scope observe CLI files that IMPORT the renamed type** (Codex R2 MED): `lib/observe/query/cronHealth.ts:10`, `lib/observe/query/events.ts:9`, `scripts/observe.ts:19`, `tests/observe/collect.test.ts:57`, and the stale-name comment in `lib/observe/query/types.ts:2`. Updating an IMPORT of the renamed type file is a mechanical cross-boundary fix and is NOT a rename of the `observe` CLI namespace (which stays `observe`). After these updates the observe surface contains no `observability` token (its namespace word is `observe`, not `observability`), so it does not conflict with the §2.3b grep-zero rule.

### §2.3 Nav
- `components/admin/nav/navConfig.ts`: the `NavItem` id union member `"observability"` → `"telemetry"`; the entry `id:"observability"` → `id:"telemetry"`, `label:"Activity"` → `label:"Telemetry"`, `short:"Activity"` → `short:"Telemetry"`, `href:"/admin/observability"` → `href:"/admin/dev/telemetry"`. **`developerOnly: true` stays** (it remains a developer-only nav item, now pointing under /admin/dev). The `Activity` lucide icon stays (Activity is a fine icon for telemetry).
- `AdminNav.tsx`: no logic change beyond the id/label flowing through; verify no hardcoded `"observability"` string remains.

### §2.3a Settings-page mobile Diagnostics link (Codex R1 MED)
- `app/admin/settings/page.tsx` (Diagnostics section, `~:277`) renders a SEPARATE mobile-reachability link into the observability page — it still points to `/admin/observability` with "Activity" copy and is pinned by `tests/admin/observabilityRouteAudit.test.ts:13`. Update this link's `href` → `/admin/dev/telemetry`, its copy "Activity" → "Telemetry", any `data-testid` containing `observability`, and the route-audit test's asserted path.

### §2.3b Live-code token sweep — grep-zero rule (Codex R1 LOW)
- Beyond import paths, rename every **live-code** (app/ components/ lib/ scripts/ tests/ — NOT docs/) occurrence of the token `observability`, including non-import ones: the page title "Activity"/"Observability", `data-testid`s (`observability-dim-harness` at `app/admin/dev/observability-dim/page.tsx:110`, and any `observability-*` testid in components/tests), and the localStorage/pref key `fxav.observability.autorefresh` (`components/admin/observability/AutoRefreshControl.tsx:7`) → `fxav.telemetry.autorefresh` (acceptable one-time autorefresh-preference reset for an internal admin tool; alternatively keep the legacy key with an inline `// legacy-compat key` comment — implementer's call, but it must be a DELIBERATE, commented decision, not an oversight).
- **Acceptance:** after the rename, `git grep -n observability -- app/ components/ lib/ scripts/ tests/` returns ZERO matches except any explicitly-commented legacy-compat key. (This is genuinely achievable — the only `observability` tokens in the out-of-scope observe CLI are imports of the renamed type file, updated per §2.2; the `observe` namespace word itself is not `observability`.) Add this grep as the final rename-verification step. **Do NOT rename the `observe` namespace** (`lib/observe/**`, `scripts/observe.ts`, `pnpm observe`, the `tests/observe/**` dir) — those stay; grep for `observability` (the specific token), not `observe`.

### §2.4 Redirect for old bookmarks
- Add a permanent redirect `/admin/observability` → `/admin/dev/telemetry` in `next.config.*` `redirects()` (alongside the existing root redirect). This preserves any bookmarked/linked URL. The redirect target is developer-gated at the destination page (the redirect itself is unauthenticated → destination enforces auth), matching the existing `/ → /auth/sign-in` pattern.

### §2.5 PROTECTED_ROUTES
- `lib/audit/trustDomains.ts`: rename the two `PROTECTED_ROUTES` path rows — `app/admin/observability/page.tsx` → `app/admin/dev/telemetry/page.tsx`; `app/admin/dev/observability-dim/page.tsx` → `app/admin/dev/telemetry-dim/page.tsx`. Both keep `chain: ["requireDeveloper"]`. The developer-tier regression pin in `auth-chain-audit.test.ts` (which lists the 5 developer routes) must be updated to the new paths.

### §2.6 Tests (rename + repath)
- `tests/admin/observability-requires-developer.test.ts` → `telemetry-requires-developer.test.ts` (update the imported page path).
- `tests/admin/observabilityRouteAudit.test.ts` → `telemetryRouteAudit.test.ts` (update the route/dim paths asserted).
- `tests/app/admin/observabilityPage.test.tsx` → `telemetryPage.test.tsx`.
- `tests/components/observability/**` → `tests/components/telemetry/**` (10 test files; update component import paths).
- `tests/e2e/observability-layout.spec.ts` → `telemetry-layout.spec.ts` (update route URL + any `standalone.config.ts` testMatch entry if present).
- Any test asserting the nav "Activity" label or `/admin/observability` URL updates to "Telemetry" / `/admin/dev/telemetry`.

## §3. Part B — Admin management is developer-only

**Goal:** only developers can Add, Revoke, or Re-add administrators. A normal admin sees the Administrators list **read-only** (no Add/Revoke/Re-add controls) and cannot mutate the roster through any path (UI, server action, or direct RPC).

### §3.1 Server-action gates
- `app/admin/settings/admins/actions.ts`: `addAdminAction` (`:76` `requireAdminIdentity()`) and `revokeAdminAction` (`:158` `requireAdminIdentity()`) → **`requireDeveloperIdentity()`** (import from `@/lib/auth/requireDeveloper`). Gate stays the first statement (boundary-throw posture — a `DeveloperInfraError`/`forbidden()` digest propagates to the boundary exactly as the admin gate did). `ReAddRowButton` reuses `addAdminAction` (`confirm_re_add=true`), so it is covered by the `addAdminAction` gate — no separate action.

### §3.2 RPC actor checks (new migration)
- New migration `<ts>_admin_mgmt_requires_developer.sql`: `CREATE OR REPLACE` `upsert_admin_email_rpc` and `revoke_admin_email_rpc`, changing ONLY the actor authorization from `if not public.is_admin()` to a **table-backed developer check** (parity with `set_admin_developer_rpc`, which uses table-backed — NOT the OR-based `public.is_developer()` — to avoid a JWT-arm actor bypass):
  ```sql
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = public.auth_email_canonical()
      and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'permission denied: admin_emails mutation requires developer'
      using errcode = '42501';
  end if;
  ```
  Everything else in each RPC body is preserved (the advisory lock `pg_advisory_xact_lock(hashtextextended('admin_emails',0))`, canonicalization, self-revoke refusal, `is_developer=false` clearing on revoke, return shapes). Idempotent (`create or replace`), apply-twice safe. Migration→validation parity applies (apply to validation project, regen manifest — functions only, likely no manifest change).
- **Post-lock re-check (TOCTOU — Codex R1 HIGH; parity with `set_admin_developer_rpc`):** the developer actor check must appear BOTH (a) as a fast-reject BEFORE `pg_advisory_xact_lock`, AND (b) as a re-check immediately AFTER the lock is acquired and BEFORE any row read/update. Otherwise a developer whose status is concurrently revoked (they pass the pre-lock check, block on the lock, another developer commits their revocation, they acquire the lock) would complete one more roster mutation with stale authorization. Both `upsert_admin_email_rpc` and `revoke_admin_email_rpc` get the identical `exists ( ... admin_emails ... revoked_at is null and ae.is_developer )` check in both positions (mirror the two occurrences in `set_admin_developer_rpc`). A concurrency regression test modeled on `tests/db/set-admin-developer-concurrency.test.ts` (developer A revokes developer-actor B's developer status; B's concurrent upsert/revoke must 42501 on the post-lock re-check) pins it. The `developerGatingContract` enforcement-4-style "≥2 table-backed exists checks, no `public.is_developer()`" assertion should be extended to cover the two re-created RPCs.
- **Advisory-lock topology unchanged:** each RPC remains the sole holder of the `admin_emails` key at its own layer; no new lock, no nesting. `tests/auth/advisoryLockRpcDeadlock.test.ts` must include the new migration file in its list so the re-created RPCs stay pinned (advisory-before-row-lock).
- **PostgREST DML lockdown unaffected:** no table-grant change; `admin_emails` DML stays REVOKE'd; mutation still flows only through the (now developer-gated) RPCs.

### §3.3 UI (reuse existing `viewerIsDeveloper` plumbing)
- `components/admin/settings/AdministratorsSection.tsx` already receives `viewerIsDeveloper` (`:37`, threaded from `app/admin/settings/page.tsx:150` and the admins deep-link page). Gate the three management controls on it:
  - `AddAdminDisclosure` (`:149`) → rendered only when `viewerIsDeveloper`.
  - `RevokeRowButton` (`:194`) → rendered only when `viewerIsDeveloper` (still also `null` for the actor's own row).
  - `ReAddRowButton` (`:220`) → rendered only when `viewerIsDeveloper`.
- Non-developers keep the **read-only list** (emails, added/revoked metadata, "You" badge, the REVOKED disclosure) with NO management affordances. This mirrors how the Developer toggle is already `viewerIsDeveloper`-gated in the same component.
- **Guard condition:** `viewerIsDeveloper` defaults `false` (already the case) — a partial/failed developer-status read renders the safe read-only view.

### §3.4 Accepted-risk supersession
- The developer-tier spec (§14) accepted "any admin can revoke any admin (§5.5/§11)" as inherited risk. **Part B closes it.** Note this explicitly in the plan and the PR body: admin-roster mutation is now developer-only, so a normal admin can neither add a rogue admin nor revoke a developer. Re-seed on total lockout remains the migration bootstrap (`edweiss412` is_developer=true). Self-revoke stays unconditionally forbidden, so a lone developer cannot lock themselves out.

## §4. Meta-tests to update (mandatory — declared)

- **`tests/auth/developerGatingContract.test.ts` enforcement 2** currently asserts `addAdminAction` + `revokeAdminAction` are gated by `requireAdminIdentity` (NOT developer-gated). Part B flips them → **update enforcement 2 to assert `requireDeveloperIdentity`** (first-statement, boundary-throw). This is the single load-bearing meta-test edit for Part B.
- **`tests/cross-cutting/auth-chain-audit.test.ts`** developer-route regression pin: update the two renamed route paths (§2.5).
- **`tests/auth/advisoryLockRpcDeadlock.test.ts`**: add the new Part-B migration to the `migrationFiles` list so the re-created `upsert/revoke` RPCs keep their advisory-before-row-lock pin.
- **`_metaInfraContract`**: no change (no new auth producer; requireDeveloperIdentity already registered from developer-tier).
- **§12.4 catalog:** no new code (Part B reuses existing `ADMIN_FORBIDDEN`/`ADMIN_EMAIL_WRITE_FAILED`/`self_revoke_forbidden`; the developer-infra path already maps as in the reap route). Confirm no raw codes surface (invariant 5).

### §4.1 Existing `admin-emails.test.ts` RPC test migration (Codex R1 MED — mandatory, large)
Changing the `upsert_admin_email_rpc` + `revoke_admin_email_rpc` actor check from `is_admin()` to table-backed `is_developer` **breaks every existing happy-path RPC test that authenticates as a plain (non-developer) admin** — they will 42501 at the new actor check BEFORE reaching their asserted branch (validation / canonicalization / revoke / self-revoke / re-add). This is the same interaction class as the developer-tier revoke-all fix. Before drafting the plan, the implementer MUST enumerate (grep `tests/db/admin-emails.test.ts` for every `jwtAdmin(...)` / actor-seeding upsert+revoke call, starting ~`:359`) and migrate each:
- **Happy-path branch tests** (expected `ok`/validation/canonicalization/self-revoke-forbidden): seed the ACTOR row as active `is_developer=true` (add `is_developer=true` to the actor's `insert`/`on conflict` in setup), so it passes the new actor check and still exercises its asserted branch. Assertions unchanged — this is setup invariant-consistency, NOT loosening (mirrors the developer-tier revoke-all edit).
- **The "rogue revoke of last admin is ALLOWED (§5.5)" test** (`~:488`): its premise is superseded by Part B. Convert it to the new contract — a NON-developer actor is now REFUSED (42501), and a developer actor revoking another admin succeeds. Update the developer-tier §14 accepted-risk note accordingly.
- **Add explicit non-developer coverage:** a NEW test — a plain admin (JWT role=admin, no `admin_emails.is_developer` row) calling `upsert_admin_email_rpc`/`revoke_admin_email_rpc` gets **42501** (pins the developer-only contract at the RPC boundary; the anti-tautology proof that the gate actually rejects).
- Any OTHER suite that drives these RPCs with a plain-admin actor (grep repo-wide for `upsert_admin_email_rpc`/`revoke_admin_email_rpc` in tests — e.g. `test-auth-gate`, notify/unpublish concurrency, embedded-admin) must likewise seed a developer actor or move to the 42501 contract. Enumerate in the plan's pre-draft code-verification pass.

### §4.2 Server-action-level test suites that mock the gate (Codex R2 MED — mandatory)
The `addAdminAction`/`revokeAdminAction` gate swap (requireAdminIdentity → requireDeveloperIdentity) breaks the ACTION-level suites that mock the gate and/or assert on `AdminInfraError`. Migrate each to mock `requireDeveloperIdentity` (from `@/lib/auth/requireDeveloper`) and expect `DeveloperInfraError` on the infra arm, updating comments/contract prose; success-path cases keep passing (the mock resolves to a developer identity). Enumerated:
- `tests/admin/admins-actions.test.ts` (`:29` mocks `requireAdminIdentity`) — the core add/revoke action contract suite.
- `tests/app/admin/adminActionInfraError.test.ts` (`:27`) — assert the action re-throws `DeveloperInfraError` (was `AdminInfraError`) to the boundary.
- `tests/app/admin/adminActionsRevalidate.test.ts` (`:22`) — revalidatePath after a successful developer-authorized mutation.
- `tests/app/admin/revokeHang.test.tsx` (`:39`) — the revoke in-flight/hang UI test.
Grep `tests/` for every `requireAdminIdentity` mock adjacent to `addAdminAction`/`revokeAdminAction` in the plan's pre-draft pass to confirm the list is complete; do NOT touch suites for actions that stay admin-gated (there are none in admins/actions.ts after Part B — both exported actions become developer-gated).

## §5. Guard conditions / edge cases

- **Telemetry route while `ADMIN_DEV_PANEL_ENABLED` unset (prod):** `/admin/dev/telemetry` renders (NOT in the disable-list) → developer sees it; non-developer → `forbidden()` 403 (the page gate). `/admin/dev` (the panel) + `/admin/dev/telemetry-dim` remain build-disabled (404) in prod.
- **Normal admin hits `/admin/dev/telemetry` directly:** the admin layout admits them (is_admin true), the page's `requireDeveloperIdentity()` → `forbidden()` 403 (same as the pre-rename observability page).
- **Normal admin POSTs `addAdminAction`/`revokeAdminAction` directly:** server action gate `requireDeveloperIdentity()` → non-developer `forbidden()` digest (403 boundary); infra fault → `DeveloperInfraError` (500 boundary).
- **Normal admin hits `upsert_admin_email_rpc`/`revoke_admin_email_rpc` directly (bypassing the action):** the RPC's table-backed developer actor check raises 42501. (Defense-in-depth beyond the action gate; PostgREST DML lockdown already blocks direct table writes.)
- **Old `/admin/observability` bookmark:** 308 redirect → `/admin/dev/telemetry`.

## §6. Out of scope / non-goals

- Renaming `lib/observe/**` (the `pnpm observe` CLI core) or its tests. (§1.)
- Renaming historical observability specs/plans docs. (§1.)
- Any change to what telemetry DISPLAYS (cron health, app events) — this is a move + rename + access change only, zero data/render-logic change.
- Changing the developer-status toggle or `set_admin_developer_rpc` (developer-tier, already shipped).

## §7. Testing strategy

- **TDD per task.** Rename tasks: move file → update imports → run the renamed test (green) → commit. Each rename is verified by its own (renamed) test passing.
- **Part B gates:** failing test (mock `requireDeveloper` throws sentinel → assert action rejects; non-developer → no management buttons rendered; RPC 42501 for non-developer actor) → implement → green.
- **Real-browser layout:** the renamed `telemetry-layout.spec.ts` preserves the existing observability layout invariants (no new layout).
- **Full audit-gate sweep at close-out:** x3-trust-domain (route rename + PROTECTED_ROUTES), developerGatingContract (enforcement 2 flip), advisoryLockRpcDeadlock (new migration), validation-schema-parity (Part-B migration applied to validation), x1 (no §12.4 change expected), quality/typecheck (import rename correctness).
- **Impeccable v3 dual-gate** on the UI diff (AdministratorsSection management-button gating, nav label, the moved telemetry page + its components) at close-out before the whole-diff Codex review.
