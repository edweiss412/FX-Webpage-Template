# Spec — Developer tier (an `is_developer` sub-role of admin)

**Date:** 2026-07-03
**Slug:** `developer-tier`
**Status:** Draft → (self-review) → (Codex adversarial review to APPROVE) → plan
**Author harness:** Opus / Claude Code (UI is touched → Opus-owned per ROUTING.md hard rule)

---

## 1. Intent

Today "admin" is a **binary** role. Every admin (Doug, and any future admin) sees the developer/debug tooling — the fixture-tester & parse-diagnostics panel, the Activity event-log/cron-health page, the stale-session reap, and the validation reset/reseed controls. Doug is non-technical and never needs these; they are clutter at best and footguns at worst.

Introduce a **`developer` sub-tier of admin**. A developer is an admin with an extra bit set. Normal admins keep the business surfaces (Drive connection, Administrators, publish/sync, notify preferences); **all technical surfaces move behind the developer bit**. Developers are managed with a per-row toggle in the existing Administrators section, usable only by developers.

This is a UI + DB + advisory-lock change → all plan-wide invariants apply (TDD per task, impeccable v3 dual-gate on UI, migration→validation parity, meta-test registry rows, PostgREST DML lockdown, single-holder advisory lock).

## 2. Load-bearing axiom: **developer ⟹ admin**

A developer is always also an admin. This holds in both auth paths and is what lets `requireDeveloper` **replace** (not stack on top of) `requireAdmin` on gated surfaces:

- **Prod (email-table path):** `is_developer` is a column on `public.admin_emails`; a developer is an *active* row with `is_developer = true`. `is_admin()` matches any active row, so a developer's row satisfies `is_admin()` too. A CHECK (§4) guarantees `is_developer` is only ever `true` on an active (non-revoked) row.
- **Test (JWT path, test-harness only):** `is_developer()`'s JWT arm **requires `role = 'admin'` AND `developer = 'true'` together** (§4.3), so any token that satisfies the JWT arm of `is_developer()` also satisfies `is_admin()` by construction — the axiom is enforced in the primitive, not merely by the minter. The minter co-setting both claims (§9) is defense-in-depth.

Because `is_developer() = true ⟹ is_admin() = true` **holds at the SQL level in both arms** (email arm = active admin row; JWT arm = ANDs `role = 'admin'`), `requireDeveloper()` is strictly stronger than `requireAdmin()` and subsumes it. We do **not** call both. A stray `{ developer: true }` token without `role = 'admin'` can never pass `is_developer()`.

## 3. Resolved decisions (canonical — every later section references these)

1. **Storage:** a boolean column `admin_emails.is_developer` (NOT a JWT claim as the primary mechanism; NOT a separate table). Rationale: matches the existing admin model exactly; promotion takes effect on the **next request** because `is_developer()` reads the table live; avoids stale-token propagation.
2. **Scope (which surfaces become developer-only):** **all four technical surfaces** — (a) `/admin/dev/*` family + the "Developer tools" settings row; (b) Activity `/admin/observability` + its Diagnostics settings link + its nav item; (c) the "Clean up old setup leftovers" reap (button + API route); (d) validation reset/reseed. Normal admins keep: Drive connection, Administrators, publish/sync toggles, the three notify toggles, and the auto-publish toggle.
3. **Gating model = access + visibility, both:** every developer surface gets a **server access gate** (`requireDeveloper`) *and* a **visibility gate** (hide its entrypoint) so a hidden button whose endpoint still accepts a normal admin is not a hole.
4. **Two postures, deliberately different:**
   - **Access** gates (`requireDeveloper`/`requireDeveloperIdentity`) are **error-first / fail-500-on-infra** — a confirmed non-developer gets `forbidden()` (403); an infra fault throws `DeveloperInfraError` (500-class). Never collapse an infra fault into a benign "not a developer."
   - **Visibility** gates use a boolean `isCurrentUserDeveloper()` that **fails to `false`** — on an infra blip a real developer sees *fewer* tools, never a normal admin seeing *more*. (Invariant 9: erring toward less privilege is safe for visibility; erring is never allowed for access.)
5. **Management:** a per-row **Developer toggle** in the Administrators section, rendered/usable **only by developers**, backed by a new `set_admin_developer_rpc` gated on **`is_developer()`** (NOT `is_admin()`).
6. **Self-demotion refused unconditionally** (`self_developer_demote_forbidden`), mirroring the admin self-revoke refusal. You can never strip your own developer bit → you cannot lock *yourself* out. A developer *can* demote another developer.
7. **Revoke clears the bit:** `revoke_admin_email_rpc` also sets `is_developer = false`, so revoking a developer strips the bit (and satisfies the CHECK). Re-adding a revoked admin therefore starts them as a **normal admin** (least privilege) with no change to the upsert path.
8. **Bootstrap:** the migration seeds `edweiss412@gmail.com` as `is_developer = true` (`ON CONFLICT (email) DO UPDATE`), or no first developer can ever exist.
9. **One new §12.4 code:** `SELF_DEVELOPER_DEMOTE_FORBIDDEN` (self-demote refusal copy). The toggle's infra-fault path **reuses** the existing `ADMIN_EMAIL_WRITE_FAILED` code (a developer toggle *is* an `admin_emails` write). No other new user-visible codes.

## 4. Data model

### 4.1 Column + CHECK (new forward-only migration)

New migration `supabase/migrations/<ts>_admin_emails_developer_tier.sql`. There is **no `supabase/tables/` or `supabase/schemas/` split** in this repo (verified: all DDL lives in `supabase/migrations/`), so there is **no transitional tables-before-migrations window** — this is a plain additive migration with no dual inline-CHECK parity concern.

```sql
alter table public.admin_emails
  add column if not exists is_developer boolean not null default false;

-- A developer bit may only be set on an ACTIVE (non-revoked) row.
alter table public.admin_emails
  drop constraint if exists admin_emails_developer_requires_active;
alter table public.admin_emails
  add constraint admin_emails_developer_requires_active
  check (not (is_developer and revoked_at is not null));
```

- `add column if not exists` + `drop constraint if exists ... add constraint` → **apply-twice idempotent**.
- The column defaults `false`; the seed (below) is the only row set `true`, and it is active → the CHECK cannot be violated at apply time.

### 4.2 Bootstrap seed (same migration) — must guarantee ≥1 active developer

The seed **force-activates** the bootstrap identity to an active developer (clearing any revoked state), then a **hard tripwire** aborts the migration if — for any reason — no active developer remains. This closes the deploy-time hazard where a pre-existing *revoked* seed row would otherwise leave zero developers and lock every admin out of the now-gated surfaces with no in-app recovery (Codex spec-review R2 HIGH).

```sql
-- Force the bootstrap identity to an ACTIVE developer. On a fresh row this
-- inserts active+developer; on an existing row (active OR revoked) it clears
-- revoked_* and sets is_developer=true, so a revoked seed row cannot silently
-- leave the deployment with zero developers. Satisfies the CHECK (active row).
insert into public.admin_emails (email, added_by, added_at, is_developer)
values ('edweiss412@gmail.com', null, now(), true)
on conflict (email) do update
  set is_developer = true,
      revoked_at   = null,
      revoked_by   = null;

-- Hard tripwire: abort the migration (and any CI/validation apply) if the
-- bootstrap did not leave at least one active developer. Fail loud, never
-- silently ship a zero-developer state.
do $$
begin
  if not exists (
    select 1 from public.admin_emails
    where revoked_at is null and is_developer
  ) then
    raise exception 'developer-tier bootstrap left zero active developers';
  end if;
end $$;
```

**Why force-activate rather than `DO NOTHING`/conditional update:** In the live DB the seed row (`edweiss412@gmail.com`, inserted active by `20260514000000:122-125`) is already active, so the `DO UPDATE` merely sets `is_developer = true` (a no-op on `revoked_*`). The `revoked_at = null` clause is purely defensive — it makes the *revoked-seed-row* edge case impossible rather than a silent zero-developer deploy. This resurrection is a one-time **bootstrap** action for the deploy-owner identity (distinct from the post-deploy revoke rules in §14) and is idempotent (apply-twice yields the same active-developer row). The `do $$ … raise exception … $$` guard aborts the surrounding transaction on failure (a `RAISE` — unlike a bare `RETURN` in a top-level `DO` — does abort the psql apply), so a zero-developer state can never reach production or the validation project.

### 4.3 `is_developer()` SECURITY DEFINER function (same migration)

Mirrors `is_admin()`'s posture exactly (verified at `20260514000000_admin_emails_runtime_mutable.sql:135-152`): `language sql`, `stable`, `security definer`, `set search_path = public, pg_temp`, `revoke all from public`, `grant execute to anon, authenticated, service_role`.

```sql
create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- JWT arm (test-harness-only): requires BOTH developer=true AND role=admin,
    -- so the primitive itself enforces developer ⟹ admin (§2) — it never depends
    -- on the minter's discipline. A stray { developer: true } without role=admin
    -- can never satisfy is_developer().
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'developer') = 'true'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
      false
    )
    or exists (
      select 1 from public.admin_emails ae
      where ae.email = public.auth_email_canonical()
        and ae.revoked_at is null
        and ae.is_developer
    );
$$;
revoke all on function public.is_developer() from public;
grant execute on function public.is_developer() to anon, authenticated, service_role;
```

> **Design note — the JWT arm uses a dedicated `developer` claim AND requires `role = 'admin'`.** `is_admin()` keys on `role = 'admin'`; a JWT carries a single `role`. Using a separate `app_metadata.developer = true` claim (rather than `role = 'developer'`) keeps `is_admin()` **completely untouched**. Crucially, the JWT arm ANDs `developer = 'true'` with `role = 'admin'`, so the **primitive itself** enforces developer ⟹ admin (§2) — a stray or buggy `{ developer: true }` token *without* `role = 'admin'` can never satisfy `is_developer()`. The minter co-setting both claims (§9) is then defense-in-depth, not the only guard. This arm is **test-harness-only**; it is dormant in prod exactly as `is_admin()`'s `role='admin'` arm is (no production writer). The prod path is the email column, which already implies an active admin row.

`SECURITY DEFINER` is required to read `admin_emails` without tripping RLS recursion (same reason `is_admin()` is definer).

### 4.4 `set_admin_developer_rpc` — promotion/demotion write path (same migration)

```sql
create or replace function public.set_admin_developer_rpc(
  p_email text,
  p_is_developer boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_uid uuid := auth.uid();
  v_actor_canonical text := public.auth_email_canonical();
  v_canonical text := public.canonicalize_email(p_email);
  v_found record;
begin
  -- Gate on is_developer(), NOT is_admin(): only a developer may grant/revoke
  -- developer. This first check is a FAST REJECT (no lock held) for a plain
  -- non-developer caller.
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_canonical is null or v_canonical = '' then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  -- Advisory lock BEFORE any row lock (advisory-then-row-lock ordering,
  -- pinned by advisoryLockRpcDeadlock.test.ts). SAME key as upsert/revoke.
  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  -- RE-CHECK is_developer() UNDER the serializing advisory lock, before any
  -- write (Codex spec R8 HIGH — TOCTOU race). A concurrent demotion may have
  -- stripped THIS actor's developer bit while we blocked on the lock. Under
  -- READ COMMITTED the second txn resumes only after the first commits+releases
  -- the lock, so this re-evaluated is_developer() now sees the actor demoted →
  -- 42501. Without it, two developers could cross-demote and reach ZERO
  -- developers via the toggle path (NOT the accepted §14 revoke risk).
  if not public.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Refuse self-DEMOTION unconditionally (mirrors self_revoke_forbidden).
  if p_is_developer = false and v_canonical = v_actor_canonical then
    return jsonb_build_object('status', 'self_developer_demote_forbidden', 'email', v_canonical);
  end if;

  select * into v_found from public.admin_emails
    where email = v_canonical and revoked_at is null
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'email', v_canonical);
  end if;

  update public.admin_emails
    set is_developer = p_is_developer
    where email = v_canonical and revoked_at is null;

  return jsonb_build_object('status', 'ok', 'email', v_canonical, 'is_developer', p_is_developer);
end;
$$;
revoke all on function public.set_admin_developer_rpc(text, boolean) from public;
grant execute on function public.set_admin_developer_rpc(text, boolean) to authenticated, service_role;
```

**Advisory-lock single-holder rule (invariant 2):** this RPC acquires `hashtextextended('admin_emails', 0)` at exactly one layer — its own body. It is **never** invoked from inside `upsert_admin_email_rpc` / `revoke_admin_email_rpc` (which already hold that key), so there is no nested holder. Lock is acquired **before** the `SELECT ... FOR UPDATE` (advisory-then-row-lock), matching the existing RPCs (`20260514000000:218`, `20260621000000:71`).

Returned statuses: `ok`, `not_found`, `self_developer_demote_forbidden`, `invalid_email`. `not authorized` is a raised `42501` (never an envelope) — a non-developer caller.

### 4.5 `revoke_admin_email_rpc` — clear the bit on revoke (supersede current def)

The **current** revoke def is `20260621000000_revoke_admin_refuse_self_revoke.sql:36-102` (its UPDATE SET is at lines 86-87: `set revoked_at = now(), revoked_by = v_actor_uid`). The new migration `create or replace`s it, extending only the UPDATE SET:

```sql
update public.admin_emails
  set revoked_at = now(), revoked_by = v_actor_uid, is_developer = false
  where email = v_canonical and revoked_at is null;
```

Everything else about the revoke RPC is preserved verbatim (self-revoke refusal, same advisory lock at line 71, grants). **Do NOT edit the stale def at `20260514000000:270-339`** — it is already superseded.

### 4.6 Migration → validation parity (invariant, non-negotiable)

Lands in the same PR as the migration: (1) apply locally + test; (2) `pnpm gen:schema-manifest` and commit the regenerated `supabase/__generated__/schema-manifest.json`; (3) surgically apply the migration to the validation project (`vzakgrxqwcalbmagufjh`) via `supabase db query --linked` / psql against `TEST_DATABASE_URL`, then `notify pgrst, 'reload schema'`. The `validation-schema-parity` gate (Layer 1 DB-free tripwire fails if the manifest is stale; Layer 2 fails if validation is missing the column) enforces all three. Failure mode if skipped: `is_developer()`'s `EXISTS` references a missing column live → `42703` → `requireDeveloper` throws `DeveloperInfraError` → dev tools break for everyone.

## 5. Auth primitives (application layer)

New file `lib/auth/requireDeveloper.ts` (sibling to `requireAdmin.ts`), cloning the `requireAdmin` structure (verified at `lib/auth/requireAdmin.ts:154,279,294`):

- **`DeveloperInfraError`** class (mirrors `AdminInfraError` at `requireAdmin.ts:81`), `readonly code = "DEVELOPER_SESSION_LOOKUP_FAILED"`.
- **`resolveDeveloperIdentity`** = `cache(async () => …)`: `createSupabaseServerClient()` → `supabase.auth.getClaims()` (local ES256 verify) → canonicalize email via `canonicalize` (`lib/email/canonicalize.ts:2`) → `Promise.all([supabase.rpc("is_session_live"), supabase.rpc("is_developer")])` → **error-first**: a returned error on either throws `DeveloperInfraError` **before** any data verdict; `sessionLive !== true` → `redirectToSignIn()`; `isDeveloper !== true` → `forbidden()` (403) with an inline `log.warn` `code: "DEVELOPER_ACCESS_DENIED"` (a log string, mirroring how `ADMIN_ACCESS_DENIED` is used at `requireAdmin.ts:270` — **not** added to the `AuthFailureCode` union, matching the admin precedent).
- **`requireDeveloperIdentity(opts)`** and **`requireDeveloper(opts)`** exports mirror the admin pair; the test-only `maybeForceTestInfraFail` hook runs **outside** the cache (per-layer), exactly as `requireAdminIdentity` does (`requireAdmin.ts:289`).

`AuthFailureCode` union (`lib/auth/constants.ts:1-4`) gains **`DEVELOPER_SESSION_LOOKUP_FAILED`** (mirroring `ADMIN_SESSION_LOOKUP_FAILED` which IS a union member). `DEVELOPER_ACCESS_DENIED` is a bare log-warn string, **not** a union member (mirrors `ADMIN_ACCESS_DENIED`).

### 5.1 Visibility helper

New `isCurrentUserDeveloper(): Promise<boolean>` (in `lib/auth/requireDeveloper.ts` or `lib/admin/isCurrentUserDeveloper.ts`): reads `rpc("is_developer")` and **returns `false` on any error or non-`true` value** (fail-to-false). Used only for hiding UI (nav item, settings sections, DevToolsRow, the Administrators toggle) — never for access. Carries a `// not-subject-to-meta: visibility-only fail-to-false, not an access gate` exemption comment for the `_metaInfraContract` scanner (it is deliberately NOT error-first — the opposite posture, and that is correct for visibility).

## 6. Surface gating matrix

Every developer surface gets BOTH columns. "Access" = server-side gate swap `requireAdmin*` → `requireDeveloper*`. "Visibility" = hide the entrypoint for non-developers.

| # | Surface | File(s) (verified) | Access change | Visibility change |
|---|---|---|---|---|
| 1 | `/admin/dev` page | `app/admin/dev/page.tsx:60` | `requireAdmin()` → `requireDeveloper()` | already build-gated (unchanged) |
| 2 | dev server actions (6) | `app/admin/dev/actions.ts` — `parseAndStage:122`, `parseAndStageFormAction:256`, `getStagedResult:281`, `resetDevSchema:393`, `resetDevSchemaFormAction:403`, `listFixtures:412` | each `requireAdmin()` → `requireDeveloper()` | n/a (build-gated file) |
| 3 | dev render harnesses (2) | `app/admin/dev/source-link-dim/page.tsx:86`, `app/admin/dev/observability-dim/page.tsx:107` | `requireAdmin()` → `requireDeveloper()` | n/a (build-gated) |
| 4 | "Developer tools" settings row | `components/admin/settings/DevToolsRow.tsx:22` | n/a (link only) | add `isDeveloper` prop; render `null` unless `DEV_PANEL_PRESENT && isDeveloper` |
| 5 | Activity page + loaders | `app/admin/observability/page.tsx:20` | `requireAdminIdentity()` → `requireDeveloperIdentity()` | hide nav item (row 8) + Diagnostics link (row 7). **Loaders `loadCronHealth`/`loadAppEvents` do NOT self-gate** (verified — they use a service-role client and rely on the page gate), so the page gate is the sole and sufficient access change; loaders unchanged. |
| 6 | Reap stale sessions | button `components/admin/ReapStaleSessionsButton.tsx`; route `app/api/admin/onboarding/reap-stale-sessions/route.ts` (`requireAdminIdentity` resolved at `:42`, injected via `routeDeps` at `:38`; catch at `:43-49`) | route's `defaultRequireAdminIdentity` → `requireDeveloperIdentity` **AND** update the catch (`:43-49`) so an infra fault code (`DEVELOPER_SESSION_LOOKUP_FAILED`, like `ADMIN_SESSION_LOOKUP_FAILED`) returns a **500-class** cataloged JSON, not the `403 ADMIN_FORBIDDEN` fallthrough (Codex spec R3 HIGH — see §6.1) | hide Maintenance section (row 9) |
| 7 | Settings → Diagnostics section | `app/admin/settings/page.tsx:277-311` (`data-testid="admin-settings-diagnostics-section"`) | n/a | render section only when `isDeveloper` |
| 8 | Activity nav item | `components/admin/nav/navConfig.ts:43-50` (`id:'observability'`) | n/a | add `developerOnly?: true` to the `NavItem` type (`:4-14`), set it on the observability entry, filter it out for non-developers in the nav renderer |
| 9 | Settings → Maintenance section | `app/admin/settings/page.tsx:224-271` (`data-testid="admin-settings-maintenance-section"`) | n/a | render section only when `isDeveloper` (both its contents — reap + validation-reset — are now developer-only) |
| 10 | Validation reset/reseed actions | `app/admin/settings/_actions/validationReset.ts` — `resetValidationDataAction` (`requireAdmin():50`), `reseedValidationFixturesAction` (`requireAdmin():124`) | `requireAdmin()` → `requireDeveloper()` (env + DB-assert gates unchanged) | already inside the Maintenance section (hidden by row 9) + the buttons stay `{canReset && …}` gated |

### 6.1 Error-posture parity for gate-swapped surfaces (comprehensive — Codex spec R3 + R4)

Swapping a gate from `requireAdmin*` to `requireDeveloper*` changes the thrown infra-error type from `AdminInfraError` (`code = "ADMIN_SESSION_LOOKUP_FAILED"`) to `DeveloperInfraError` (`code = "DEVELOPER_SESSION_LOOKUP_FAILED"`). The §3.4 posture (infra → **500-class**; confirmed-non-developer → 403/forbidden) must be preserved through each surface's **full consumer chain**, not just the server-side throw point. Two failure modes: (a) an API route whose catch is **code-keyed** on the admin code (R3); (b) a **client component that wraps a gate-swapped server action in a try/catch** and converts the throw to inline copy (R4). Note the client **cannot** distinguish a gate infra throw from any other throw (React digests server-action errors on the client), so the fix must live server-side (route catch, or action-level typed return), never a client `instanceof` check.

**Comprehensive per-surface error-posture map** (every gate-swapped surface + the new toggle, traced through its consumer — the authoritative list; the structural meta-test below pins it):

| Surface | Consumer chain | Infra-fault posture | Change |
|---|---|---|---|
| `/admin/dev` page, `source-link-dim`, `observability-dim` (RSC) | RSC render → admin error boundary | throw → generic cataloged 500 boundary (not code-keyed) | none (also build-gated) |
| `/admin/observability` page (RSC) | RSC render → admin error boundary | throw → generic 500 boundary | none |
| dev server actions (`parseAndStage` … 6) | dev-panel client (build-gated); form-actions → boundary | form-action throw → boundary | plan verifies no dev-panel client `catch` swallows gate infra (low-stakes — build-gated, developer-only) |
| reap route (API) | `ReapStaleSessionsButton` reads `body.code` via `lookupDougFacing` | route JSON **500** for infra code | **R3 fix:** catch treats `DEVELOPER_SESSION_LOOKUP_FAILED` as 500 (reuse cataloged `ADMIN_SESSION_LOOKUP_FAILED` copy); non-developer → 403 `ADMIN_FORBIDDEN` |
| validationReset/reseed actions | `MaintenanceResetButtons` (client) `await`s action in `try`, catch-all (`:131/:154`) swallows throw → inline copy; reads `result.kind` | action **catches** gate infra + **returns** cataloged `{kind:'error',code}` inline (documented §3.4 exception) | **R4 fix** (below) |
| `setDeveloperAction` (new toggle) | `AdministratorsSection` toggle via `useActionState`; gate **outside** `try` (mirror `addAdminAction:76`) | throw propagates via `useActionState` → boundary → 500 | none new (follows admin precedent) |

**Reap route fix (R3, + R7 body-code pin):** the catch (`route.ts:43-49`) returns 500-class when the thrown `.code` is `ADMIN_SESSION_LOOKUP_FAILED` **or** `DEVELOPER_SESSION_LOOKUP_FAILED`. **The JSON response body's `code` MUST be the cataloged `ADMIN_SESSION_LOOKUP_FAILED`, NOT the raw `DEVELOPER_SESSION_LOOKUP_FAILED`** (Codex spec R7 MEDIUM): `ReapStaleSessionsButton` renders `body.code` only if it resolves in `MESSAGE_CATALOG` (via `lookupDougFacing`), else falls back to generic copy — `DEVELOPER_SESSION_LOOKUP_FAILED` is an `AuthFailureCode`/log code, **not** a §12.4 catalog entry, so emitting it would silently lose the cataloged UX. Mapping the developer infra `.code` → the cataloged `ADMIN_SESSION_LOOKUP_FAILED` in the response body keeps the generic "couldn't verify your session" 500 copy and avoids a second §12.4 code. Non-developer still → `403 ADMIN_FORBIDDEN`.

**validationReset fix (R4, + R8 result-shape correction):** the actions' existing return contract is `ValidationActionResult = { ok: true; count: number } | { ok: false; code: MessageCode }` (`validationReset.ts:35`); `MaintenanceResetButtons` renders `lookupDougFacing(result.code)` on `!result.ok` (`:121-129`, `:144-152`) but an **uncaught throw hits its client `catch {}` → `GENERIC_ERROR`** (`:131`, `:154` set `code: null`) — that is the R4 downgrade. So today an `AdminInfraError` from `requireAdmin()` (currently the first statement, outside any try) already renders `GENERIC_ERROR`. **Fix:** each action places `await requireDeveloper()` as the **first side-effecting statement inside its top-level `try`** (nothing — no `destructiveResetAllowed()` env read, no Supabase/service-role client construction — precedes it), and the `catch` maps a `DeveloperInfraError` to the **existing cataloged `{ ok: false, code: "VALIDATION_RESET_FAILED" }`** (reseed → `"VALIDATION_RESEED_FAILED"`), so `MaintenanceResetButtons`'s `!result.ok` branch renders the cataloged copy instead of `GENERIC_ERROR`. (Next control-flow digests / the non-developer `forbidden()` are re-thrown, mirroring `addAdminAction`; they land on the client `catch {}` → generic denial, acceptable for this dev-only-visible surface.) This gate placement is exactly what the `developerGatingContract` meta-test asserts for `inline-typed-exception` actions (§6.1 item 1), so the R4 fix and the gate-coverage guard are consistent, not contradictory. It is a **documented, intentional exception to §3.4, scoped to this validation-env-only surface**: invariant-9-compliant (a discriminable typed `{ ok: false, code }`, never a silent/blank swallow), reusing the actions' existing `VALIDATION_RESET_FAILED` / `VALIDATION_RESEED_FAILED` cataloged codes — **no new §12.4 code, no `ValidationActionResult` type change**.

**Structural defense — `tests/auth/developerGatingContract.test.ts` (NEW; shipped WITH the implementation, not deferred — structural-defense calibration for a recurring vector).** A single self-contained meta-test (NOT dependent on `auth-chain-audit`'s route classification, which skips non-route files — §10.2) with a `DEVELOPER_GATED_SURFACES` registry (one row per surface in the §6 map: `id`, `file`, `consumerKind`, `gate`, `declaredPosture ∈ {boundary-500 | route-500-json | inline-typed-exception}`). It enforces three things:

1. **Server-action gate coverage (AST, the R5 gap).** Using `ts-morph` (already a repo dependency; template: `resolve-show-page-access-exhaustiveness.test.ts`), it walks each registered **developer-gated** server-action file — `app/admin/dev/actions.ts`, `app/admin/settings/_actions/validationReset.ts`, and `app/admin/settings/admins/developerActions.ts` — extracts **every exported `async` function** that is a server action (file-level or function-level `"use server"`), and asserts each one is gated by `requireDeveloper`/`requireDeveloperIdentity`. **The assertion is per the action's `declaredPosture` (Codex spec R7 HIGH — the two postures need different gate placement, so a single "first executable statement" rule is wrong):**
   - **boundary-throw actions** (`boundary-500`; the dev actions + `setDeveloperAction`): `await requireDeveloper*()` MUST be the **first executable statement** of the function body, *outside* any `try` — so its `DeveloperInfraError`/`forbidden()` propagates to the error boundary.
   - **inline-typed-exception actions** (`inline-typed-exception`; the two validationReset actions): `await requireDeveloper()` MUST be the **first side-effecting statement inside the top-level `try`**, with **no env read / Supabase-client construction / service-role work before it** (the test asserts nothing precedes it in the try and nothing side-effecting precedes the try) — so the gate's `DeveloperInfraError` is caught and returned as a cataloged typed inline error (§6.1 validationReset fix). This is the ONLY shape that satisfies R4 without failing gate-coverage.
   
   **Set-equality:** the set of exported server actions discovered by the AST walk MUST equal the registry's action rows — so adding a new action to any registered file without registering + gating it fails CI. This is the guard `auth-chain-audit` cannot provide for non-route files. **Complementary admin-gate assertion (Codex spec R6):** the test ALSO asserts `admins/actions.ts`'s `addAdminAction` + `revokeAdminAction` remain **`requireAdminIdentity`-gated** (NOT developer-gated, NOT ungated) — so `admins/actions.ts` is deliberately excluded from the developer registry and its normal-admin management stays admin-usable, and a future accidental gate change on those two fails CI.
2. **Route/page coverage.** The route/page surfaces (dev page, 2 harnesses, observability page, reap route) are asserted present in `PROTECTED_ROUTES` with `chain: ["requireDeveloper"]` (belt-and-suspenders over the auth-chain-audit extension in §10.2).
3. **Error-posture completeness.** Every surface has a `declaredPosture`; every `inline-typed-exception` surface (only validationReset today) is explicitly enumerated, so a future client-`catch` consumer cannot silently downgrade a gate infra fault without declaring the exception here.

This converts "find the next peer instance by hand" into a CI-time completeness gate over **both** gate coverage (incl. non-route server actions) and error posture.

**Settings page net effect:** the page keeps `requireAdminIdentity()` (`:79`) — it is still admin-accessible. It additionally computes `isDeveloper = await isCurrentUserDeveloper()` and: gates the Maintenance (`:224`) and Diagnostics (`:277`) sections on `isDeveloper`; passes `isDeveloper` to `DevToolsRow` (`:215`); passes `viewerIsDeveloper={isDeveloper}` to `AdministratorsSection`. Doug (non-developer admin) sees Drive connection, Administrators, and the Preferences card (3 notify toggles + auto-publish) — nothing else.

**Administrators deep-link page — `app/admin/settings/admins/page.tsx` (Codex spec R6 MEDIUM).** This page ALSO renders `AdministratorsSection` (verified: it passes `result` / `actorCanonicalEmail` / `now`, no `viewerIsDeveloper`). Because `AdministratorsSection` defaults `viewerIsDeveloper` to `false`, wiring only the main settings page would silently hide the Developer toggle on the dedicated `/admin/settings/admins` route. Fix: this page computes `isCurrentUserDeveloper()` after its `requireAdminIdentity()` (`AdminsPage:27`) and passes `viewerIsDeveloper` into `AdministratorsSection`. **Both** render paths of `AdministratorsSection` must thread the flag; a test exercises the toggle's visibility on **both** `/admin/settings` and `/admin/settings/admins`.

## 7. Management UI — Developer toggle in Administrators

- **Data layer** (`lib/data/adminEmails.ts`): add `is_developer: boolean` to the `AdminEmailRow` type (`:43`); add `is_developer` to the `.select()` column list (`:75`); add a new `setAdminDeveloper({ rawEmail, isDeveloper })` wrapper (mirrors `revokeAdminEmail` at `:128`) calling `set_admin_developer_rpc`, returning a discriminated outcome (`ok` | `not_found` | `self_developer_demote_forbidden` | `invalid_email` | throw `AdminEmailsInfraError` on infra). Extend the status whitelist/translation (`translate*`) accordingly.
- **Server action** — in a **dedicated developer-only action file** `app/admin/settings/admins/developerActions.ts` (NOT `admins/actions.ts`, which must keep its admin-gated `addAdminAction`/`revokeAdminAction` for normal admins — Codex spec R6 HIGH). The new file exports **only** developer-gated actions, so the `developerGatingContract` per-file invariant ("every exported server action here is `requireDeveloper*`-gated") holds cleanly. Add `setDeveloperAction(prev, formData)` gated by **`requireDeveloperIdentity()`** (outside the try, so its `DeveloperInfraError` propagates to the catalog 500 boundary — mirrors `addAdminAction` at `admins/actions.ts:76`). Wrap only the data call; `AdminEmailsInfraError` → `{ kind: "infra_error" }`; a `42501` from the RPC → a typed `not_authorized` outcome (§12), never `infra_error`. Result type `{ kind: "ok"; email; isDeveloper } | { kind: "self_developer_demote_forbidden"; email } | { kind: "not_found"; email } | { kind: "invalid_email" } | { kind: "not_authorized" } | { kind: "infra_error" }`. `revalidatePath("/admin/settings")` + `revalidatePath("/admin/settings/admins")` on success.
- **Component** (`components/admin/settings/AdministratorsSection.tsx`): add a `viewerIsDeveloper: boolean` prop (default-safe `false`). In the `AdminRow` sub-component (`:145`), when `viewerIsDeveloper` is true, render a **Developer toggle** after the existing controls:
  - On **other** rows: an interactive toggle (a new client `DeveloperToggleButton`, styled like the existing switch controls) bound to `setDeveloperAction` via `useActionState`.
  - On the **actor's own row** (`isActor`): a **locked/disabled** developer indicator (you cannot demote yourself; self-demote is refused server-side). Mirrors how the Revoke control is **omitted** on the actor's own row (`:175`) — here we show a locked "Developer" state rather than an actionable toggle.
  - When `viewerIsDeveloper` is false (normal admin): **no developer control and no developer badge** — Doug sees the list exactly as today.
- **Copy (invariant 5, via `getDougFacing` / `lib/messages/lookup.ts:112`):**
  - `self_developer_demote_forbidden` → new §12.4 code `SELF_DEVELOPER_DEMOTE_FORBIDDEN` (§8).
  - `infra_error` → reuse existing `ADMIN_EMAIL_WRITE_FAILED`.
  - Success → optimistic re-render (no code), matching the existing toggles.

## 8. Messages / §12.4 (one new code)

`SELF_DEVELOPER_DEMOTE_FORBIDDEN` is a new user-visible code. Per the §12.4 lockstep + the "new §12.4 code = full CI touchpoints" rule, the SAME commit updates **all** of:

1. Master spec §12.4 prose (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) — add the row (do NOT run prettier on the master spec).
2. `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts`.
3. `lib/messages/catalog.ts` — add the matching row (mirror `SELF_REVOKE_FORBIDDEN` at `:2534`, incl. `helpHref: "/help/errors#SELF_DEVELOPER_DEMOTE_FORBIDDEN"`).
4. `pnpm gen:internal-code-enums` (x2 internal-code-enum gate).
5. Help `_families` + the `/help/errors#…` anchor (help affordance families gate).
6. Run the **full** test suite (x1 catalog-parity `codes.test.ts`, help gates, internal-code-enums all fire).

Copy (draft, Doug-facing, no raw codes): title "You can't remove your own developer access", body "To keep at least one developer in control, you can't turn off your own developer access. Ask another developer to do it if you need to step down." — final wording pinned in the plan.

No new code is needed for the `forbidden()` 403 (admin's `forbidden()` has none either); no new code for `not_found` (not reachable from the UI, which only toggles listed active rows) — it maps to the generic `ADMIN_EMAIL_WRITE_FAILED` inline if it ever surfaces.

## 9. Test-only session minter (Playwright parity)

`app/api/test-auth/set-session/route.ts` (verified: `auth.admin.createUser` at `:173`, `app_metadata` at `:177`, `FIXTURE_ALLOWLIST` at `:63`):

- Extend the `FIXTURE_ALLOWLIST` entry shape from `{ isAdmin: boolean }` to `{ isAdmin: boolean; isDeveloper?: boolean }` and add a developer fixture entry.
- Change the `app_metadata` construction (`:177`) so a developer fixture sets **both** `role: "admin"` **and** `developer: true`: e.g. `app_metadata: allowEntry.isDeveloper ? { role: "admin", developer: true } : allowEntry.isAdmin ? { role: "admin" } : {}`. This enforces the developer⟹admin axiom (§2) at the test layer: a developer fixture is always also an admin.
- No production reachability: the route is gated by `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` + host allowlist + `FIXTURE_ALLOWLIST` (unchanged).

## 10. Structural defenses / meta-tests

Declared meta-test inventory (created or extended):

1. **`tests/auth/_metaInfraContract.test.ts`** (EXTEND): add `"requireDeveloper"` and `"requireDeveloperIdentity"` to the `INFRA_PRODUCERS` string array (`:69-76`) AND add behavioral test blocks with matching `assertEmits(producer, source, code)` calls (the `afterAll` set-equality fails otherwise). Pin: infra fault → throws `DeveloperInfraError` (not `forbidden`); confirmed non-developer → `forbidden()`; unauthed → redirect. `isCurrentUserDeveloper` is deliberately **excluded** (visibility-only, fail-to-false) and carries the `// not-subject-to-meta:` exemption.
2. **`tests/cross-cutting/auth-chain-audit.test.ts`** (EXTEND — covers the **ROUTE/page** surfaces only): add `"requireDeveloper"` to the `ChainStep` union (`trustDomains.ts:12`); change the `PROTECTED_ROUTES` rows for the dev **page**, the two dev render-harness **pages**, the observability **page**, and the reap **route** from `chain: ["requireAdmin"]` to `chain: ["requireDeveloper"]`; teach `authPrimitives.ts` to recognize `requireDeveloper`/`requireDeveloperIdentity` as valid first-line gates (validator recognition `~:135`, the `chain[0] === "requireAdmin"` precedence check `~:622`). **Known limitation (Codex spec R5):** `auditProjectAuthChains` (`authPrimitives.ts:813-823`) SKIPS `non-route` files, and `app/admin/dev/actions.ts` classifies as `non-route`, so the audit does **NOT** scan the six dev **server actions**. Those (and the validationReset actions + the new toggle action) are covered structurally by the dedicated meta-test in item 7 below — do NOT rely on auth-chain-audit for server-action gate coverage.
3. **`tests/db/validation-schema-parity.test.ts`** (satisfied, not edited): the new column must reach the manifest (Layer 1) and the validation project (Layer 2). See §4.6.
4. **`tests/db/postgrest-dml-lockdown.test.ts`** (satisfied, not edited): `admin_emails` stays write-REVOKE'd for `authenticated` (verified `20260514000000:97-98`), so `is_developer` cannot be self-set via a direct PostgREST `PATCH`. No new RPC-gated *table* is introduced, so no new registry row.
5. **`tests/auth/advisoryLockRpcDeadlock.test.ts`** (satisfied, may auto-include): `set_admin_developer_rpc` follows advisory-then-row-lock and holds the same key at a single layer. The test derives lock-taking RPCs from migration files; confirm the new RPC is recognized and passes.
6. **`tests/messages/codes.test.ts`** (satisfied by the §8 lockstep): x1 catalog-parity.
7. **`tests/auth/developerGatingContract.test.ts`** (NEW structural meta-test): (a) AST set-equality gate-coverage over the server-action files — every exported `"use server"` action in `app/admin/dev/actions.ts` + `validationReset.ts` + the `setDeveloperAction` file is gated by `requireDeveloper*` (closes the R5 non-route audit gap); (b) `PROTECTED_ROUTES` route/page coverage with `chain:["requireDeveloper"]`; (c) `DEVELOPER_GATED_SURFACES` error-posture registry + explicit `inline-typed-exception` enumeration (§6.1, Codex spec R4+R5).
8. **New behavioral tests:** the **reap route error-mapping test** — force `requireDeveloperIdentity` to throw `DeveloperInfraError` → assert HTTP **500** AND **`body.code === "ADMIN_SESSION_LOOKUP_FAILED"`** (the cataloged code, NOT the raw `DEVELOPER_SESSION_LOOKUP_FAILED` — Codex spec R7 MEDIUM); force a confirmed-non-developer → assert 403 `ADMIN_FORBIDDEN` (§6.1, Codex spec R3); the **validationReset error-posture test** — force `requireDeveloper` to throw `DeveloperInfraError` in `resetValidationDataAction` and `reseedValidationFixturesAction` → assert each **returns** `{ ok: false, code: "VALIDATION_RESET_FAILED" }` / `"VALIDATION_RESEED_FAILED"` (NOT an uncaught throw) AND `MaintenanceResetButtons` renders `lookupDougFacing(code)` cataloged copy, not `GENERIC_ERROR` (§6.1, Codex spec R4+R8); `set_admin_developer_rpc` (promote, demote-other, self-demote-refused, non-developer caller 42501, active-rows-only, revoke-clears-bit); the **cross-demotion concurrency test** (Codex spec R8 HIGH) — two developers each attempt to demote the other in concurrent transactions; assert the second txn resuming after the first commits gets `42501` (its actor lost developer status under the lock) and that **≥1 active developer always remains** (zero-developer state unreachable via the toggle path); `is_developer()` (email arm true; JWT arm true only when `role='admin'` AND `developer='true'`; **JWT `developer:true` WITHOUT `role='admin'` → FALSE** (Codex spec R1 HIGH); revoked row excluded); the toggle UI (visible only to developers, locked on self, outcome copy routed through `getDougFacing`; **visibility verified on BOTH `/admin/settings` and the `/admin/settings/admins` deep link** — Codex spec R6 MEDIUM); a Playwright e2e proving a normal-admin fixture sees none of the four surfaces and a developer fixture sees all four; a **bootstrap-invariant test** asserting the migration leaves ≥1 active developer even when the seed row pre-exists in a *revoked* state — i.e. applying the migration against a DB whose `edweiss412@gmail.com` row is revoked yields an active `is_developer=true` row and does NOT raise (Codex spec R2 HIGH).

## 11. Flag lifecycle table (`is_developer`)

| Aspect | Detail |
|---|---|
| **Storage** | `public.admin_emails.is_developer boolean not null default false`; CHECK `admin_emails_developer_requires_active`. |
| **Write paths** | `set_admin_developer_rpc` (promote/demote, `is_developer()`-gated); `revoke_admin_email_rpc` (forces `false` on revoke); migration seed (`edweiss412` → `true`). Direct table DML is REVOKE'd from `authenticated`. |
| **Read paths** | `is_developer()` SECURITY DEFINER fn (access, via `requireDeveloper*`); `isCurrentUserDeveloper()` (visibility); `listAdminEmails` `.select()` (to render the toggle state). |
| **Effect on output** | Access: `requireDeveloper*` gates the 4 technical surfaces. Visibility: hides nav item, Maintenance + Diagnostics sections, DevToolsRow, and the per-row toggle for non-developers. |

No zombie columns: every write path is consumed by a read path; every read path affects output.

## 12. Guard conditions (partial/empty/error inputs)

- `set_admin_developer_rpc` with `p_email` null/empty/uncanonicalizable → `{ status: 'invalid_email' }` (no write).
- `p_email` not an active admin row → `{ status: 'not_found' }` (never creates a row; developer status is only for existing active admins).
- `p_is_developer = false` on the caller's own email → `{ status: 'self_developer_demote_forbidden' }` (no write) regardless of other state.
- Non-developer caller → `42501` raise (never an envelope) → data layer throws `AdminEmailsInfraError`-distinct? No: a `42501` from the RPC is an authorization refusal, not infra. The data layer maps a `42501` PostgREST error to a typed `not_authorized` outcome, surfaced as `forbidden()`/inline — NOT `infra_error`. (Plan pins the exact mapping; the UI never shows the toggle to non-developers, so this is a defense-in-depth path.)
- `isCurrentUserDeveloper()` on infra fault → `false` (fail-to-false); the developer simply sees fewer tools until the blip clears.
- `AdministratorsSection` with `viewerIsDeveloper` absent/false → no developer controls rendered (safe default).
- `DevToolsRow` with `isDeveloper` absent → treat as `false` (safe default), still also requires `DEV_PANEL_PRESENT`.

## 13. Dimensional invariants & transition inventory (UI)

**Dimensional invariants:** The Developer toggle sits inside `AdminRow`, which is a content-height flex row (no fixed-dimension parent). The toggle reuses the existing switch control sizing (mirror `NotifyToggle`'s switch) and must present a ≥ `min-h-tap-min` / `min-w` tap target. No parent→child fixed-dimension relationship is introduced. **Plan adds a real-browser (Playwright) assertion** that the toggle's rendered tap target meets the minimum and that the row height does not collapse when the toggle is added (per the Tailwind-v4-no-default-`items-stretch` rule) — jsdom is insufficient.

**Transition inventory** (toggle visual states: `off`, `on`, `pending` (optimistic, action in flight), `locked` (actor's own row)):

| From → To | Trigger | Treatment |
|---|---|---|
| off → pending → on | developer promotes another admin | switch slides (reuse NotifyToggle transition); disabled while pending |
| on → pending → off | developer demotes another admin | switch slides; disabled while pending |
| pending → off/on (revert) | action returns error (`infra_error`) | revert optimistic state; inline `ADMIN_EMAIL_WRITE_FAILED` copy |
| any → locked | rendering the actor's own row | instant — no animation (static locked indicator) |
| (hidden) → visible | viewer is a developer | instant — the whole control is absent for non-developers (server-rendered), no client transition |

Compound transition: toggling row A while row B's toggle is mid-pending — each `AdminRow` owns its own `useActionState`, so they are independent; no shared state to corrupt. Plan's transition-audit task verifies this.

## 14. Accepted inherited risk (do NOT "fix" — disagreement-loop preempt)

**Any admin can revoke any admin** — including the last developer — because other-revoke is intentionally allowed (ratified amendment §5.5/§11; only *self*-revoke is refused, `20260621000000`). So a normal admin *could* revoke the last developer's admin row, which clears the developer bit (§4.5), leaving zero developers until a re-seed migration/manual DB edit. This is the **existing** admin posture, inherited unchanged — it is **not** a regression introduced here and we deliberately add no new protection. The **toggle path cannot reach zero developers**: self-demote is refused (§3.6) AND concurrent cross-demotion is race-guarded by the post-lock `is_developer()` re-check (§4.4, Codex spec R8) — so the *only* way to reach zero developers is the accepted last-developer-via-**other-admin-revoke** path, which is out of scope and consistent with how last-admin-via-other-revoke already behaves. Reviewers: do not relitigate — cite this section.

## 15. Out of scope

- Any change to `is_admin()` (untouched — the developer JWT arm uses a separate `developer` claim precisely to avoid touching it).
- Any read/permission tier *below* admin, or any admin capability *other* than the four technical surfaces (business surfaces stay plain-admin).
- A separate "Developers" management page (declined in brainstorming in favor of the per-row toggle).
- Making the `app_metadata.developer` claim a production mechanism (test-harness only, dormant in prod like the admin `role` arm).
- Retroactively hiding the crew `SourceLink`/report affordances (those are crew product features, not admin dev tooling).

## 16. Numeric sweep (self-consistency)

- **4** technical surface groups (dev family, Activity/observability, reap, validation-reset). Consistent §1 / §3.2 / §6.
- **6** dev server actions gated (§6 row 2). **2** dev render harnesses (§6 row 3).
- **1** new §12.4 code total (`SELF_DEVELOPER_DEMOTE_FORBIDDEN`); toggle infra reuses `ADMIN_EMAIL_WRITE_FAILED` (§8), reap 500 reuses `ADMIN_SESSION_LOOKUP_FAILED` (§6.1), validationReset reuses its existing `'error'`-variant code (§6.1). No other new user-visible codes.
- **1** new structural meta-test (`developerGatingContract.test.ts` — AST server-action gate coverage + route coverage + error-posture registry) + **2** extended (`_metaInfraContract`, `auth-chain-audit` for routes/pages only) (§10). Server actions are covered by the dedicated meta-test because `auth-chain-audit` skips non-route files (§10.2).
- **1** new column, **1** new CHECK, **1** new `is_developer()` fn, **1** new `set_admin_developer_rpc`, **1** superseded `revoke_admin_email_rpc` (§4).
- **2** new `INFRA_PRODUCERS` entries (`requireDeveloper`, `requireDeveloperIdentity`) (§10.1).
- **1** new developer-only server-action file (`admins/developerActions.ts`, holds only `setDeveloperAction`); `admins/actions.ts` stays admin-gated (§7, Codex R6).
- **2** `AdministratorsSection` render paths thread `viewerIsDeveloper`: `/admin/settings` + `/admin/settings/admins` (§6, Codex R6).
- Advisory-lock key `hashtextextended('admin_emails', 0)` — one key, three RPC holders, each single-layer (§4.4).

## 17. Watchpoints (plan-time verification + disagreement preempts)

Items the plan's mandatory pre-draft code-verification pass must pin, and contracts a reviewer might relitigate:

1. **Nav renderer location.** §6 row 8 adds `developerOnly?: true` to `NavItem` and filters it. The consumer of the `NAV` array (the component that renders the admin nav / bottom tab bar from `navConfig.ts`) was NOT located during spec verification — the plan MUST grep for the `NAV` import and thread `viewerIsDeveloper` into that renderer (mobile bottom bar + desktop rail). Filtering only `navConfig` without touching the renderer is a no-op.
2. **`requireDeveloper` replaces `requireAdmin` — verify the audit precedence logic accepts it.** Extending `authPrimitives.ts` is more than a data edit: the ordering/precedence/validator-recognition logic (`~:135`, `~:622-671`) must treat `requireDeveloper` as a legitimate first-line gate, else `auth-chain-audit` fails for every switched route. This is a known 3+-round vector class (auth-chain); do the full-surface audit up front, not per-instance.
3. **`is_developer()`⟹`is_admin()` axiom is the linchpin — now enforced in the primitive.** The JWT arm ANDs `role = 'admin'` with `developer = 'true'` (§4.3), and the email arm requires an active admin row, so `is_developer()` cannot return true for a non-admin regardless of how a token was minted. The test minter (§9) still co-sets `role:"admin"` as defense-in-depth. **The plan MUST include a DB-level test asserting a `{ developer: true }`-only JWT (no `role:"admin"`) makes `is_developer()` return FALSE** — this pins the fix at the SQL layer, not just the app layer (Codex spec-review R1 HIGH).
4. **Other links to `/admin/observability`.** Moving Activity to developer-only 403s any *other* entrypoint (email digests, alert deep-links) for a normal admin. The plan greps for `"/admin/observability"` references beyond the nav + Diagnostics link and confirms none is a normal-admin-facing link; if one exists, it is hidden/guarded consistently.
5. **`42501` (non-developer RPC caller) is an authorization refusal, not infra.** The `setAdminDeveloper` data-layer wrapper must map a PostgREST `42501` from `set_admin_developer_rpc` to a `not_authorized`/`forbidden` outcome, NOT to `AdminEmailsInfraError`/`infra_error` (which is reserved for transient faults). This is defense-in-depth (the toggle is never shown to non-developers), but the mapping must be explicit and tested.
6. **Settings-page read parallelism.** `isCurrentUserDeveloper()` adds one RPC to the settings page. Run it in parallel with the existing `Promise.all` loaders (the page already batches reads for nav-perf), not as a serial extra await.
7. **Intentional posture split is not a bug (preempt).** `isCurrentUserDeveloper()` is deliberately fail-to-`false` (NOT error-first) — the opposite of `requireDeveloper`. This is correct: visibility errs toward *less* privilege; access errs toward 500. The `// not-subject-to-meta:` exemption (§5.1) documents why it is excluded from `_metaInfraContract`. Reviewers: do not flag the missing error-first posture on the visibility helper — cite §3.4 / §5.1.
