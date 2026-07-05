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
- `components/admin/observability/**` (9 files: AutoRefreshControl, ContextDetail, CronHealthHeader, CronRunSummaryCard, EventFilters, EventLevelBadge, EventRow, EventTimeline, cronHealthStatus, + the dir);
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
- **Multiple existing gates encode the (now-broken) "all `/admin/dev/**` is dev-only-build-gated" assumption and MUST be updated — see the comprehensive inventory + structural defense in §2.1a below** (build-artifact-gate, Tailwind `@source` exclusion, no-raw-codes crawl exclusion, the phase-2 e2e href rejection, playwright comments). Do the full §2.1a audit before writing code.
- `app/admin/dev/observability-dim/page.tsx` → `app/admin/dev/telemetry-dim/page.tsx`. This IS a build-disabled dev harness — **update the path in `scripts/with-admin-dev-flag.mjs`'s hardcoded list** (line ~55) so the harness stays build-gated under its new name.

### §2.2 Component + type rename
- `components/admin/observability/` → `components/admin/telemetry/` (git mv all 9 files; internal component names unchanged unless they contain "observability" in an identifier — none of the component export names do; only the DIR + import paths change).
- `lib/admin/observabilityTypes.ts` → `lib/admin/telemetryTypes.ts` (exported symbols `parseAppEventFilters`, `AppEventFilters`, etc. keep their names — they are not "observability"-named; only the file + import path change).
- Update every `@/components/admin/observability/*` and `@/lib/admin/observabilityTypes` import across the tree to the new paths. **This includes the otherwise-out-of-scope observe CLI files that IMPORT the renamed type** (Codex R2 MED): `lib/observe/query/cronHealth.ts:10`, `lib/observe/query/events.ts:9`, `scripts/observe.ts:19`, `scripts/observe/args.ts:3`, `scripts/observe/collect.ts:2`, `scripts/observe/format.ts:2`, `tests/observe/collect.test.ts:57`, and the stale-name comment in `lib/observe/query/types.ts:2` (full list from `git grep observabilityTypes`; the implementer re-greps to confirm none are missed). Updating an IMPORT of the renamed type file is a mechanical cross-boundary fix and is NOT a rename of the `observe` CLI namespace (which stays `observe`). After these updates the observe surface contains no `observability` token (its namespace word is `observe`, not `observability`), so it does not conflict with the §2.3b grep-zero rule.

### §2.3 Nav
- `components/admin/nav/navConfig.ts`: the `NavItem` id union member `"observability"` → `"telemetry"`; the entry `id:"observability"` → `id:"telemetry"`, `label:"Activity"` → `label:"Telemetry"`, `short:"Activity"` → `short:"Telemetry"`, `href:"/admin/observability"` → `href:"/admin/dev/telemetry"`. **`developerOnly: true` stays** (it remains a developer-only nav item, now pointing under /admin/dev). The `Activity` lucide icon stays (Activity is a fine icon for telemetry).
- `AdminNav.tsx`: no logic change beyond the id/label flowing through; verify no hardcoded `"observability"` string remains.

### §2.1a COMPREHENSIVE `/admin/dev` prod-route gate inventory (Codex R1+R3 same-vector — mandatory full sweep + structural defense)

A prod-available route **under** `/admin/dev/` violates the repo-wide assumption "everything under `/admin/dev/**` is dev-builds-only." Three review rounds surfaced this vector; this is the exhaustive enumeration of EVERY surface encoding that assumption, each with its fix. The implementer audits the full list BEFORE writing code (do not fix piecemeal):

1. **`scripts/with-admin-dev-flag.mjs` (disable list, `:44-55`)** — the SOURCE OF TRUTH: files here are renamed-aside (dev-only). `telemetry/page.tsx` is NOT added (⇒ prod). `observability-dim/page.tsx` → `telemetry-dim/page.tsx` in the list (stays dev-only).
2. **`app/globals.css:20` `@source not "../app/admin/dev";`** (Codex R3 HIGH — styling correctness) — this excludes the ENTIRE `/admin/dev` tree from Tailwind class scanning, so the prod telemetry page would ship with NO generated CSS for any class only it uses. Fix: re-include telemetry — keep the broad exclusion for the dev-only surfaces AND add an explicit `@source "../app/admin/dev/telemetry";` (Tailwind v4 processes `@source` include directives; verify the include re-adds the subtree despite the parent `@source not`). If the `not`/include ordering doesn't compose in v4, instead narrow the exclusion to the specific dev-only paths (`@source not "../app/admin/dev/page.tsx"`, `.../actions.ts`, `.../source-link-dim`, `.../telemetry-dim`). Add `app/globals.css` to Part A scope.
3. **`tests/admin/build-artifact-gate.test.ts` (`:101` route-dir absence, `:120` app-paths-manifest `startsWith("/admin/dev")` filter, `:131` routes-manifest `includes("/admin/dev")`)** — asserts prod build (flag unset) has NO `/admin/dev`. Fix: EXPECT `/admin/dev/telemetry` PRESENT in the prod artifact while `/admin/dev` (panel), `/admin/dev/source-link-dim`, `/admin/dev/telemetry-dim` remain ABSENT. Update the route-dir assertion, exclude telemetry from the `startsWith("/admin/dev")` manifest filter, and change the routes-manifest `includes("/admin/dev")===false` to permit the telemetry path.
4. **`tests/cross-cutting/no-raw-codes-audit.ts:319` `.filter(p => !p.startsWith("app/admin/dev/"))`** (invariant-5 coverage) — narrow so `app/admin/dev/telemetry/**` IS crawled (prod user-facing content) while the dev-only paths stay excluded.
5. **e2e `a[href*='/admin/dev']` count-zero assertions** (functional — these FAIL if a developer viewer surfaces the moved "Telemetry" nav item / Diagnostics link): `tests/e2e/admin-phase2-surfaces.spec.ts:35-36` (Codex R3) AND `tests/e2e/onboarding-wizard-step1.spec.ts:71` (Codex R4). Narrow BOTH assertions to allow `/admin/dev/telemetry` (matching `a[href='/admin/dev/telemetry']` is OK) while still forbidding the dev-only `/admin/dev`, `/admin/dev/source-link-dim`, `/admin/dev/telemetry-dim`. Verify which viewer identity each spec uses — if it signs in as a NON-developer, the telemetry link/nav is server-side absent and the count stays 0 (no change needed), but the assertion's PREDICATE must still be narrowed so it does not accidentally pass/fail on the exception.
6. **`tests/e2e/admin-banner.spec.ts:14,379`** — asserts the PreviewBanner is ABSENT on the `/admin/dev` route. Verify the banner's absence rule applies equally to the new `/admin/dev/telemetry` route (the banner should stay absent on the diagnostic page); if the spec navigates only to `/admin/dev` (404 in prod) it is unaffected, but confirm and add a telemetry case if the banner-absence contract should cover it.
7. **Comment/prose accuracy (now-imprecise "all `/admin/dev` is build-gated / 404 in prod" — update the ones that assert a BLANKET absence; leave incidental dev-panel comments that stay true):** `playwright.config.ts` (`:10,13,99,194,196,225,267,291`), `tests/e2e/admin-dev.spec.ts` (`:15-18,60-62,84-86,99-101`), and `.github/workflows/dev-gate-e2e.yml:4-8` — these describe the build-vs-runtime contract as "prod build → NO `/admin/dev`". Add a one-line carve-out: the dev PANEL (`/admin/dev`) + `source-link-dim` + `telemetry-dim` remain 404 in prod; `/admin/dev/telemetry` is the deliberate prod-available exception. **Incidental comments that remain accurate need no change** (they describe the dev panel, which IS still build-gated): `components/admin/PreviewBanner.tsx:17`, `components/admin/settings/DevToolsRow.tsx:8`, `lib/audit/trustDomains.ts:49,52`, `tests/auth/oauth-flow.test.ts:164`, `tests/auth/signInPageRedirect.test.ts:95`, `tests/components/admin/PreviewBannerHelpAffordance.test.tsx:95`, `tests/components/admin/settings/DevToolsRow.test.tsx:9`, `tests/components/admins-error-boundary.test.tsx:80,87`, `tests/components/AlertBanner.test.tsx:562` (all reference the `/admin/dev` panel redirect/404, which is unchanged).
8. **`tests/auth/developerGatingContract.test.ts` (`:110` `observability-dim` registry row)** → `telemetry-dim`. The telemetry PAGE is covered by enforcement-3 PROTECTED_ROUTES (renamed §2.5); the dim harnesses are the registered dev-only pages, telemetry page's coverage is via PROTECTED_ROUTES.

**Completeness basis:** this inventory is derived from the DEFINITIVE untruncated sweep `git grep -n "admin/dev" -- ':!docs/**' ':!app/admin/dev/**'` (175 matches). The implementer re-runs that exact grep in the pre-draft pass and reconciles every match against items 1-8 (functional-break vs accurate-comment vs incidental) — a match not accounted for is a spec gap to escalate.

**STRUCTURAL DEFENSE (ship in THIS milestone — AGENTS.md same-vector calibration):** add `tests/admin/dev-route-prod-classification.test.ts`. It reads `scripts/with-admin-dev-flag.mjs`'s disable list (dev-only set) and a hardcoded `PROD_AVAILABLE_DEV_ROUTES = ["app/admin/dev/telemetry"]` allowlist, then walks `app/admin/dev/*` (top-level route dirs) and asserts every one is classified as EITHER dev-only (in the disable list, including nested harness dirs) OR prod-available (in the allowlist) — failing if a new `/admin/dev/*` route dir appears unclassified. This forces any future prod-under-`/admin/dev` route to consciously update the allowlist + the gate inventory above, closing the whack-a-mole class at CI time rather than in a future review round.

### §2.3a Settings-page mobile Diagnostics link (Codex R1 MED)
- `app/admin/settings/page.tsx` (Diagnostics section, `~:277`) renders a SEPARATE mobile-reachability link into the observability page — it still points to `/admin/observability` with "Activity" copy and is pinned by `tests/admin/observabilityRouteAudit.test.ts:13`. Update this link's `href` → `/admin/dev/telemetry`, its copy "Activity" → "Telemetry", any `data-testid` containing `observability`, and the route-audit test's asserted path.

### §2.3b Live-code token sweep — grep-zero rule (Codex R1 LOW)
- Beyond import paths, rename every **live-code** (app/ components/ lib/ scripts/ tests/ — NOT docs/) occurrence of the token `observability`, including non-import ones: the page title "Activity"/"Observability", `data-testid`s (`observability-dim-harness` at `app/admin/dev/observability-dim/page.tsx:110`, and any `observability-*` testid in components/tests), and the localStorage/pref key `fxav.observability.autorefresh` (`components/admin/observability/AutoRefreshControl.tsx:7`) → `fxav.telemetry.autorefresh` (acceptable one-time autorefresh-preference reset for an internal admin tool; alternatively keep the legacy key with an inline `// legacy-compat key` comment — implementer's call, but it must be a DELIBERATE, commented decision, not an oversight).
- **Acceptance (Codex R5 HIGH — scope the grep to the RENAME SURFACE, not the bare word):** a blanket `git grep observability` is WRONG — the word "observability" is used generically ~58× across unrelated monitoring/logging code (`lib/log/persist.ts`, `lib/cron/withCronRunSummary.ts`, `lib/sync/applyParseResult.ts`, `app/show/[slug]/[shareToken]/_CrewShell.tsx`, `components/crew/SectionTileError.tsx`, `components/admin/wizard/step3ReviewSections.tsx` test-seam, `app/auth/callback/route.ts`, various test comments, etc.). Those are NOT the admin observability page and MUST stay. The rename-verification greps target the SPECIFIC rename-surface identifiers, each of which MUST return zero after the rename:
  - `git grep -n "admin/observability"` (route paths) → 0 (all become `admin/dev/telemetry`);
  - `git grep -n "components/admin/observability"` → 0 (dir renamed to `components/admin/telemetry`);
  - `git grep -n "observabilityTypes"` → 0 (→ `telemetryTypes`, incl. the observe-CLI imports per §2.2);
  - `git grep -n "observability-dim"` → 0 (→ `telemetry-dim`, route + harness testid + all refs);
  - `git grep -n "observability-layout"` → 0 (spec renamed + the playwright root `testMatch` per §2.6);
  - `git grep -n "fxav.observability"` → 0 (localStorage key → `fxav.telemetry`, or an explicitly-commented legacy-compat key);
  - `git grep -n "admin-settings-observability-link"` (the settings Diagnostics link testid, `app/admin/settings/page.tsx:301`) → 0 (→ `admin-settings-telemetry-link`, §2.3a);
  - `git grep -n 'id: "observability"\|"observability"' components/admin/nav/navConfig.ts` → 0 (nav id union member + entry → `telemetry`; also the `inObservability`/`id === "observability"` logic at navConfig `:71` and any `AdminNav.tsx` string).
  - Plus a residual scan `git grep -n "observability" -- app/admin/ components/admin/observability components/admin/telemetry` should show only intentional generic-word comments (e.g. an `AdminNav.tsx` "Activity/observability" doc comment) — update those comments to "Telemetry" where they name the renamed feature; a bare monitoring-concept usage may stay.
- **Do NOT rename the `observe` namespace** (`lib/observe/**`, `scripts/observe.ts`, `scripts/observe/**`, `pnpm observe`, `tests/observe/**`) nor the generic monitoring word "observability" in unrelated logging/crew/cron/sync code.

### §2.4 Redirect for old bookmarks
- Add a permanent redirect `/admin/observability` → `/admin/dev/telemetry` in `next.config.*` `redirects()` (alongside the existing root redirect). This preserves any bookmarked/linked URL. The redirect target is developer-gated at the destination page (the redirect itself is unauthenticated → destination enforces auth), matching the existing `/ → /auth/sign-in` pattern.
- **TDD (Codex R6 MED):** add a config-layer structural test mirroring `tests/config/rootRedirect.test.ts:17` — assert `nextConfig.redirects()` contains `{ source: "/admin/observability", destination: "/admin/dev/telemetry", permanent: true }`. Write it failing first (redirect not yet added), then implement. This catches the redirect entry being dropped/retargeted/flipped.

### §2.5 PROTECTED_ROUTES
- `lib/audit/trustDomains.ts`: rename the two `PROTECTED_ROUTES` path rows — `app/admin/observability/page.tsx` → `app/admin/dev/telemetry/page.tsx`; `app/admin/dev/observability-dim/page.tsx` → `app/admin/dev/telemetry-dim/page.tsx`. Both keep `chain: ["requireDeveloper"]`. The developer-tier regression pin in `auth-chain-audit.test.ts` (which lists the 5 developer routes) must be updated to the new paths.

### §2.6 Tests (rename + repath)
- `tests/admin/observability-requires-developer.test.ts` → `telemetry-requires-developer.test.ts` (update the imported page path).
- `tests/admin/observabilityRouteAudit.test.ts` → `telemetryRouteAudit.test.ts` (update the route/dim paths asserted).
- `tests/app/admin/observabilityPage.test.tsx` → `telemetryPage.test.tsx`.
- `tests/components/observability/**` → `tests/components/telemetry/**` (10 test files; update component import paths).
- `tests/e2e/observability-layout.spec.ts` → `telemetry-layout.spec.ts` (update route URL). **CRITICAL (Codex R5 MED): update the ROOT Playwright `testMatch` regex at `playwright.config.ts:66`** which lists `observability-layout` — rename it to `telemetry-layout`, else the desktop project silently stops running the renamed real-browser layout spec. Also check `tests/e2e/standalone.config.ts` testMatch for any `observability`/`observability-layout` entry. Add all root Playwright/config `testMatch` files to the rename-verification sweep (the `observability-layout` grep-zero above catches a miss).
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
- **§12.4 catalog (Codex R6 HIGH — no NEW code, but TWO existing rows change semantics/copy → 3-way lockstep REQUIRED):** Part B does not add a code, but it invalidates the prose/copy of two existing rows, so the master-spec §12.4 prose + `pnpm gen:spec-codes` (→ `lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts` must be updated **in lockstep** (the `x1-catalog-parity` gate compares runtime catalog ↔ §12.4 prose; updating one without the others fails x1). **Do NOT run prettier on the master spec.** Rows:
  1. **`ADMIN_EMAIL_WRITE_FAILED`** (catalog `:2135`, master `:2979`): `helpfulContext` says "…after the **requireAdminIdentity** gate" → change to **requireDeveloperIdentity** (Part B §3.1).
  2. **`SELF_REVOKE_FORBIDDEN`** (catalog `:2554`, master `:3021`): (a) `helpfulContext` states "Other-revoke (a rogue admin revoking a peer, including the last peer) **stays allowed by design**; see amendment §5.5 + §11 anti-goal" — Part B SUPERSEDES this; rewrite to "Other-revoke is now **developer-only** (this milestone closes the §5.5 rogue-revoke risk); a non-developer actor is refused (42501 at the RPC / `forbidden()` at the Server Action)." (b) `dougFacing` + `longExplanation` "Ask another **admin** to do it if you need to be removed" → "Ask another **developer**…" (only developers can revoke now; a developer self-revoking is the only way to reach this code). This is a user-facing copy change — verify the wording against invariant 5 (routed via `getDougFacing`, no raw code).
  - No NEW code is needed for "non-developer tried to manage admins": the Server-Action gate returns `forbidden()`→`ADMIN_FORBIDDEN` (existing), and a direct-RPC bypass gets a raw 42501 (never user-facing; PostgREST DML lockdown + the action gate are the real entry points). Confirm no raw codes surface (invariant 5).

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
- **Full audit-gate sweep at close-out:** x3-trust-domain (route rename + PROTECTED_ROUTES), developerGatingContract (enforcement 2 flip + telemetry-dim registry rename), advisoryLockRpcDeadlock (new migration), validation-schema-parity (Part-B migration applied to validation), x1 (§12.4 lockstep for the 2 changed rows, §4), quality/typecheck (import rename correctness), **build-artifact-gate** (prod artifact now expects `/admin/dev/telemetry` present + the others absent — §2.1a.3), **no-raw-codes** (telemetry now crawled — §2.1a.4), and the NEW **`dev-route-prod-classification`** structural guard (§2.1a) that pins the prod-vs-dev-only `/admin/dev/*` classification.
- **New/extended meta-tests this milestone (declared):** CREATE `tests/admin/dev-route-prod-classification.test.ts` (§2.1a structural defense). EXTEND `developerGatingContract` (enforcement 2 gate flip; enforcement-4-style RPC-SQL guard over the two re-created upsert/revoke RPCs — §3.2), `auth-chain-audit` (route pins §2.5), `advisoryLockRpcDeadlock` (new migration §3.2). No `_metaInfraContract` change (no new auth producer).
- **Impeccable v3 dual-gate** on the UI diff (AdministratorsSection management-button gating, nav label, the moved telemetry page + its components) at close-out before the whole-diff Codex review.
