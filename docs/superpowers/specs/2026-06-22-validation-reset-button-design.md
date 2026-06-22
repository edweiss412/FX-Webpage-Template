# Validation Reset + Reseed Buttons — Design Spec

**Date:** 2026-06-22
**Status:** Draft → adversarial review
**Author:** Opus (Claude Code)
**Scope:** Two admin-Settings "maintenance" buttons that **reset** the validation deployment's show data to an empty initial state, and **reseed** the validation fixture shows — both guarded so they can NEVER run against production.

---

## 1. Motivation

After the tile→source-sheet deep-links feature shipped (PR #64), existing shows have empty `source_anchors` because anchors only populate on sync. Re-testing the full pipeline (including wizard onboarding → anchor extraction → deep links) is easiest from a known clean state. Today the only way to reset/reseed the validation project is the offline CLI (`pnpm validation:reseed`, `scripts/validation-reseed.ts`). This spec adds two in-app admin buttons so an operator can reset to empty (then re-onboard via the wizard) or reseed the fixture shows, directly from the deployed validation app — while making it structurally impossible to fire either against production.

---

## 2. Out of scope

- Any production-facing reset/cleanup. This feature is validation-only by construction (§4).
- A bulk "re-sync all shows" / per-show backfill of `source_anchors` on existing data (separate concern; the wizard/Re-Sync paths already populate anchors).
- Changing the existing offline CLI (`scripts/validation-reseed.ts`) behavior. It is **refactored** to share fixture definitions (§6.2) but its outputs are unchanged.
- Confirmation copy localization, analytics, or audit-log of resets beyond the existing `admin_alerts`/console paths.

---

## 3. Resolved decisions (single source of truth)

| ID | Decision |
|----|----------|
| D1 | **Two buttons** in the existing maintenance card (`app/admin/settings/page.tsx:179-228`): "Reset validation data" (destructive) and "Reseed validation fixtures" (additive). |
| D2 | **Triple guard** (all three must pass): (a) **render** layer — buttons render only when `isValidationDeployment()` AND `process.env.ALLOW_DESTRUCTIVE_RESET === 'true'`; (b) **server-action** layer — `requireAdmin()` + both checks re-evaluated, throw before any DB call; (c) **DB** layer — the RPC requires `is_admin()` AND a validation-only marker row in `app_settings`. |
| D3 | **`isValidationDeployment()`** = the live Supabase project-ref (parsed from `process.env.SUPABASE_URL` ?? `NEXT_PUBLIC_SUPABASE_URL`) equals the canonical validation ref `vzakgrxqwcalbmagufjh`. The ref parser MUST reuse the **strict host-boundary regex** already proven in `scripts/lib/validation-target.ts:27` (`PROJECT_REF_HOST_REGEX = /^https?:\/\/([a-z0-9]+)\.supabase\.(?:co\|in)(?::\d+)?(?:\/\|$)/i`), which rejects branch-preview/suffixed hosts (`tests/scripts/validation-target.test.ts:70-82`). Because `scripts/lib/**` is CLI tooling (not app-importable), the plan EITHER promotes that regex to a shared module both import OR copies it verbatim into `lib/admin/validationDeployment.ts` with the same branch-preview/port/malformed-suffix guard tests. (The `vzakgrxqwcalbmagufjh` literal at `validation-target.ts:99-100` is example prose, not an exported constant — do not cite it as the source of truth.) |
| D4 | **DB marker** = a boolean column `app_settings.destructive_reset_enabled` (`app_settings` is a singleton row, `id='default'`, `supabase/migrations/20260501001000_internal_and_admin.sql:232-247`). The migration **adds the column `not null default false`** (present-but-false everywhere, incl. prod) but does **NOT** set it true. It is set `true` **only in the validation DB, out-of-band** (one-time `update public.app_settings set destructive_reset_enabled = true where id='default';`, exactly like the `ALLOW_DESTRUCTIVE_RESET` env var). Prod keeps the default `false` → DB-layer refusal. |
| D5 | **Reset scope** = DELETE all show data (`reports` first — non-cascade FK — then `shows` + FK-cascade children) + staging/wizard tables (`pending_syncs`, `pending_ingestions`, wizard sessions/checkpoints, onboarding scan manifest) + the **validation fixture singleton** `public.validation_state` (no FK to `shows`; holds stale alias IDs/seed dates — `supabase/migrations/20260527204241_validation_state.sql:4-12` — must be cleared or it survives the wipe). **PRESERVE** `admin_emails`, auth/sessions, and `app_settings` **durable** config (`watched_folder_*`, `active_signing_key_id`) — but **NULL the transient pointers** `app_settings.pending_wizard_session_id` / `pending_wizard_session_at` / `pending_folder_*` (`20260501001000:239-244`), since their referenced wizard/pending state is being deleted (leaving them set strands the admin UI on a nonexistent active setup). Result: empty show list + clean fixture/wizard state, operator still admin, Drive connection intact. |
| D6 | **Reset mechanism** = one new SECURITY DEFINER RPC `reset_validation_data()`; single transaction; admin+marker gated. |
| D7 | **Reseed mechanism** = reuse the **existing, unchanged** `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` RPCs (defined in `supabase/migrations/20260527210000_mint_validation_fixture_atomic.sql` + `20260527210001_validation_finalize_all_atomic.sql`; these are SECURITY DEFINER with **no `is_admin()` body gate**, called by the CLI via a **service-role** client — `scripts/validation-reseed.ts:72,204`). No new seed RPC; combo definitions move to a shared lib (§6.2). |
| D7a | **Reseed guard wiring (resolves the grant-posture risk):** the reseed server action (a) calls a new tiny `assert_destructive_reset_enabled()` RPC via the **admin session** client (enforces `is_admin()` + marker — the DB-layer guard) and only on success (b) seeds by looping `mintFixtureCombos` via a **service-role** client against the unchanged mint/finalize RPCs. This keeps the existing RPCs + CLI untouched (no grant changes, no broad `authenticated` exposure) while still giving reseed a DB-layer admin+marker gate. The service-role client is reached ONLY behind render-gate + `requireAdmin` + `destructiveResetAllowed` + the assert RPC. |
| D8 | **Confirmation UX:** Reset = **typed confirmation** (operator types `RESET` to enable the confirm button). Reseed = **simple two-step confirm** (mirrors `ReapStaleSessionsButton`). |
| D9 | **Error/copy discipline:** no raw error codes in UI (AGENTS.md invariant 5); server actions follow the `{data,error}` call-boundary discipline (invariant 9). |
| D10 | **Concurrency — per-show advisory lock (AGENTS.md invariant 2, NON-NEGOTIABLE):** `reset_validation_data()` mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions` — all invariant-2 tables — so the RPC MUST hold the per-show advisory lock for every affected show before mutating. It materializes the **distinct `drive_file_id` set across `shows ∪ pending_syncs ∪ pending_ingestions`**, sorts it, and `perform pg_advisory_xact_lock(hashtext('show:' \|\| drive_file_id))` for each in sorted order (deterministic order is deadlock-safe against single-show sync holders, which each hold only their own lock) BEFORE any delete. **Single-holder:** the reset RPC is the sole lock-taker in its transaction — no nested SECURITY DEFINER re-acquires (the deletes are inline `delete` statements, not calls to other lock-taking RPCs). The in-RPC `hashtext('show:'\|\|…)` pattern matches existing holders (e.g. `supabase/migrations/20260502000000_dev_schema_clone.sql:412`). Topology is pinned by extending `tests/auth/advisoryLockRpcDeadlock.test.ts`. This is invariant compliance, **not** a "global lock." |

---

## 4. The triple guard (safety lynchpin)

A reset that ever hit production would be catastrophic and irreversible. There is **no existing runtime validation-vs-prod guard** in the app (the only discriminator is `process.env.SUPABASE_URL`, `lib/supabase/server.ts:35`). So the feature builds three independent layers; **all three must pass**.

### 4.1 Render layer
`app/admin/settings/page.tsx` computes `const canReset = isValidationDeployment() && process.env.ALLOW_DESTRUCTIVE_RESET === 'true';` (server component, evaluated per request). The two buttons render only when `canReset`. On production both env signals are false → the maintenance card looks exactly as today (only `ReapStaleSessionsButton`).

### 4.2 `isValidationDeployment()` (new: `lib/admin/validationDeployment.ts`)
```ts
export const VALIDATION_PROJECT_REF = "vzakgrxqwcalbmagufjh";
// Strict host-boundary regex copied verbatim from scripts/lib/validation-target.ts:27
// (CLI tooling is not app-importable). Rejects branch-preview/suffixed hosts, e.g.
// https://vzakgrxqwcalbmagufjh-preview.supabase.co and trailing-garbage suffixes.
const PROJECT_REF_HOST_REGEX = /^https?:\/\/([a-z0-9]+)\.supabase\.(?:co|in)(?::\d+)?(?:\/|$)/i;
export function projectRefFromUrl(url: string | undefined): string | null {
  const m = (url ?? "").match(PROJECT_REF_HOST_REGEX);
  return m?.[1] ?? null;
}
export function isValidationDeployment(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return projectRefFromUrl(url) === VALIDATION_PROJECT_REF;
}
export function destructiveResetAllowed(): boolean {
  return isValidationDeployment() && process.env.ALLOW_DESTRUCTIVE_RESET === "true";
}
```
Local dev (`http://127.0.0.1:54321`) → `projectRefFromUrl` returns null → not validation → guard closed (local must opt in only via tests that stub the functions). This is intentional: the buttons do not appear in normal local dev.

### 4.3 Server-action layer
Both actions (`resetValidationDataAction`, `reseedValidationFixturesAction`) start with `await requireAdmin();` then `if (!destructiveResetAllowed()) return { ok: false, code: "reset_not_allowed" };` BEFORE any Supabase call. Never trust the client; the render gate is defense-in-depth, not the enforcement.

### 4.4 DB layer
`reset_validation_data()` is `SECURITY DEFINER`, `set search_path = public, pg_temp`, and begins:
```sql
if not public.is_admin() then raise exception 'not authorized'; end if;
if not coalesce((select destructive_reset_enabled from public.app_settings
                 where id = 'default'), false)
then raise exception 'destructive reset not enabled for this database'; end if;
```
Because the column is set `true` out-of-band in validation **only** (D4) and defaults `false` everywhere, even a misconfigured app pointed at prod cannot reset prod — prod's `destructive_reset_enabled` is `false` and the RPC raises. The same marker gate is added to a thin `assert_destructive_reset_enabled()` helper the reseed path also calls (so reseed is equally DB-gated).

**Immediately after the guard passes, BEFORE any delete**, the RPC acquires the per-show advisory locks (D10) — invariant 2 is enforced inside the same transaction as the mutation, so the gate and the lock acquisition cannot be separated.

---

## 5. Components & data flow

```
[Settings page (RSC)]
   canReset = destructiveResetAllowed()
   └─ <MaintenanceResetButtons> (client) — rendered only if canReset
        ├─ Reset button → typed-confirm modal → resetValidationDataAction()
        └─ Reseed button → simple-confirm modal → reseedValidationFixturesAction()
                                   │
         [server actions: app/admin/settings/_actions/validationReset.ts]
            requireAdmin() → destructiveResetAllowed() gate
                                   │
            ┌─ reset:  rpc reset_validation_data()  → {clearedShows}
            └─ reseed: assert gate + loop mintFixtureCombos() via
                       mint_validation_fixture_atomic + validation_finalize_all_atomic
                                   │
            revalidatePath('/admin'); revalidatePath('/admin/settings')
            return typed result {ok, code?, count?}
```

### 5.1 Guard conditions (per input / state)
- **`SUPABASE_URL` unset/empty** → `projectRefFromUrl` null → not validation → buttons absent, actions refuse.
- **`SUPABASE_URL` = prod ref** → not validation → absent/refuse.
- **`ALLOW_DESTRUCTIVE_RESET` unset/≠"true"** → guard closed → absent/refuse.
- **Marker column `false`** (validation env but DB not provisioned out-of-band) → server action proceeds to RPC; RPC raises `destructive reset not enabled`; action maps to a typed `reset_not_enabled` code with calm copy. Buttons may render (env says validation) but the action fails safely with a clear message.
- **Empty DB** (already reset) → `reset_validation_data()` deletes 0 rows, returns `{clearedShows: 0}`; success with "0 shows cleared".
- **Reseed when shows already present** → `mint_validation_fixture_atomic` UPSERTs (idempotent per its existing contract); returns seeded count.
- **Confirm input ≠ `RESET`** → reset confirm button stays disabled; action never called.

---

## 6. Implementation surfaces

### 6.1 Reset RPC + marker column — `supabase/migrations/<ts>_validation_reset_rpc.sql`
- **Marker column:** `alter table public.app_settings add column if not exists destructive_reset_enabled boolean not null default false;` (idempotent; applies to all envs at `false`; set `true` out-of-band in validation only — D4). This column participates in the schema manifest / `validation-schema-parity` gate.
- `create or replace function public.reset_validation_data() returns jsonb` — SECURITY DEFINER, admin+marker gate (§4.4), then in one transaction:
  1. **Acquire per-show advisory locks (invariant 2, D10):** `for v_did in select drive_file_id from (select drive_file_id from public.shows union select drive_file_id from public.pending_syncs union select drive_file_id from public.pending_ingestions) u order by drive_file_id loop perform pg_advisory_xact_lock(hashtext('show:' || v_did)); end loop;` — sorted order, single-holder, BEFORE any mutation.
  2. capture `count(*) from public.shows`;
  3. **`delete from public.reports;`** FIRST — `reports.show_id` is a **non-cascading** FK (`supabase/migrations/20260501001000_internal_and_admin.sql:311` — plain `references public.shows(id)`, no `on delete cascade`/`set null`), so `delete from shows` would raise a FK violation if any report row remains. This is the lone non-cascade child found; **the plan MUST run a complete FK audit** (query `pg_constraint` for every FK referencing `public.shows` with `confdeltype not in ('c','n')`) and delete each such parent-blocking table before `shows`, rather than trusting this enumeration.
  4. `delete from public.shows;` — FK cascade clears the `on delete cascade` children (`crew_members:33`, `hotel_reservations:55`, `rooms:68`, `transportation:89`, `contacts:106`, `shows_internal`, `show_share_tokens`, sync_holds, show_change_log, etc. — all verified `on delete cascade`); `email_deliveries`/`onboarding_manifest.created_show_id` are `on delete set null` (rows survive, link nulled — acceptable);
  5. explicit `delete` of drive-keyed staging tables NOT FK'd to shows (`pending_syncs`, `pending_ingestions`, onboarding scan manifest, wizard sessions/checkpoints);
  6. **`delete from public.validation_state;`** (the fixture singleton — D5/F2 — no FK to shows, would otherwise survive with stale alias IDs);
  7. **clear stranded `app_settings` pointers (D5/F3):** `update public.app_settings set pending_wizard_session_id = null, pending_wizard_session_at = null, pending_folder_id = null, pending_folder_name = null, pending_folder_set_by_email = null, pending_folder_set_at = null where id = 'default';` (durable `watched_folder_*` / `active_signing_key_id` untouched);
  8. return `jsonb_build_object('clearedShows', <count>)`.
- Also create `assert_destructive_reset_enabled() returns void` (SECURITY DEFINER, `is_admin()` + marker gate, raises otherwise) — the reseed action's DB-layer guard (D7a).
- Grants: `grant execute ... to authenticated;` revoke from `anon`, `public`. Mirrors the `unarchive_show` admin RPC pattern (`supabase/migrations/20260602000000_b2_r4_unarchive_held_and_finalize_admin_guard.sql:35-63`).
- Idempotent DDL (`create or replace`; if a marker helper is added, `drop function if exists` + recreate).
- **Migration lifecycle:** applied locally (TDD), manifest regenerated (`pnpm gen:schema-manifest`), and applied surgically to the validation project (the `validation-schema-parity` gate, per AGENTS.md). The DB **marker row is NOT in the migration** (D4) — it is a one-time manual insert into validation.

### 6.2 Shared fixture lib — `lib/validation/reseedFixtures.ts`
- Extract the 16 combo definitions + the per-combo mint call currently inline in `scripts/validation-reseed.ts` into an exported `FIXTURE_COMBOS` + `mintFixtureCombos(client)` that BOTH the CLI and the server action import. CLI behavior unchanged.
- **Client (resolved — D7a):** `mintFixtureCombos(client)` accepts a Supabase client and loops the existing, unchanged mint/finalize RPCs. The server action passes a **service-role** client (the existing RPCs have no `is_admin()` gate and the CLI already calls them service-role — `scripts/validation-reseed.ts:204`). The admin+marker gate for reseed is enforced separately by `assert_destructive_reset_enabled()` invoked via the admin **session** client BEFORE any seeding (so a non-admin or a non-validation DB is rejected before the service-role client is ever used). Existing RPC grants are NOT modified.

### 6.3 Server actions — `app/admin/settings/_actions/validationReset.ts`
- `"use server"`. Both actions: `requireAdmin()` → `destructiveResetAllowed()` gate → … → `revalidatePath('/admin')` + `revalidatePath('/admin/settings')`. Return discriminated `{ ok: true; count: number } | { ok: false; code: string }`. Every Supabase call destructures `{ data, error }`; infra faults → typed `{ ok:false, code:'infra_error' }` (invariant 9).
- `resetValidationDataAction()`: after gates, calls `reset_validation_data()` via the admin **session** client; maps a marker-disabled raise to `reset_not_enabled`.
- `reseedValidationFixturesAction()`: after gates, calls `assert_destructive_reset_enabled()` via the **session** client (DB-layer is_admin+marker); on success, builds a **service-role** client and runs `mintFixtureCombos(serviceClient)`; returns seeded count. The service-role client is constructed ONLY after all gates + the assert pass.

### 6.4 UI — `components/admin/MaintenanceResetButtons.tsx`
- Client component, sibling of `ReapStaleSessionsButton` in the maintenance card. Two buttons + their modals. Reset = destructive styling + typed-confirm (`RESET`); Reseed = neutral + simple confirm. Idle→confirming→running→done/error state machine (ported from `ReapStaleSessionsButton.tsx`). Copy via the message catalog (`messageFor`), no raw codes. a11y: `aria-describedby` on compact buttons, focus management on modal open/close, `disabled` on `isPending` (not self-disable in onClick — per `feedback_react_form_action_synchronous_disable_cancels_submit`).
- Rendered by `app/admin/settings/page.tsx` only when `destructiveResetAllowed()`; passed no secret props.

### 6.5 Error catalog rows (`lib/messages/catalog.ts` + §12.4 + `gen:spec-codes`)
- New codes: `reset_not_allowed` (guard closed), `reset_not_enabled` (DB marker absent), and success summaries are plain counts (not error codes). Follow the three-part §12.4 lockstep (AGENTS.md): master spec §12.4 prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts` row, all in one commit; `x1-catalog-parity` gate enforces.

---

## 7. Flag lifecycle table

| Flag / marker | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `ALLOW_DESTRUCTIVE_RESET` | env var (validation deployment only) | set manually in Vercel validation env | `destructiveResetAllowed()` (render + server action) | gates button render + action |
| `SUPABASE_URL` project-ref | env var | existing deploy config | `isValidationDeployment()` | proves which project |
| `app_settings.destructive_reset_enabled` | DB boolean column (added by migration, `default false`; set true validation-only, out-of-band) | one-time manual `update` in validation DB | `reset_validation_data()` / `assert_destructive_reset_enabled()` | DB-layer refusal on prod (prod stays `false`) |

No zombie flags: each is written (manually, validation-only), read (guard), and has a concrete effect (refusal). All three default absent/false → feature inert.

---

## 8. Testing

- **`isValidationDeployment` / guard units** (`tests/admin/validationDeployment.test.ts`): ref match → true; prod ref / null / empty → false; `destructiveResetAllowed` AND-composition (env flag toggled).
- **Reset RPC real-local-DB test** (`tests/db/resetValidationData.test.ts`): seed shows + cascade children + **a `reports` row** + staging → call RPC → assert all show/staging/`reports` rows for those shows cleared AND `admin_emails`/`app_settings`/auth rows preserved; returns correct `clearedShows`; marker-`false` → raises; non-admin → raises. The `reports`-row case is the regression for the non-cascade FK (without the pre-delete the RPC raises a FK violation). (jsdom insufficient — real DB.)
- **FK-audit guard test** (`tests/db/resetValidationDataFkAudit.test.ts`): query `pg_constraint` for FKs referencing `public.shows` with `confdeltype not in ('c','n')`; assert every such table appears in the RPC's pre-delete list. Fails if a future migration adds a non-cascade FK to `shows` without updating the reset RPC.
- **Reseed test**: empty DB → reseed → 16 combos present (assert against `FIXTURE_COMBOS` length, not a hardcoded literal).
- **Server-action guard-refusal test** (`tests/admin/validationResetAction.test.ts`), split by layer (resolves the §5.1↔§8 contradiction): (a) **env/ref/flag guard fails** (`destructiveResetAllowed()` false: not-validation ref, or flag off) → typed `reset_not_allowed`, and **NO Supabase call is made** (mock asserts zero RPC calls, no service-role client constructed); (b) **gates pass but DB marker is `false`** → the action **DOES** call `reset_validation_data()` / `assert_destructive_reset_enabled()` (which raises), mapped to `reset_not_enabled`, but the reseed path **does NOT** construct the service-role client or call mint/finalize. These are distinct assertions, not "RPC never called" across the board.
- **Render-gate component test** (`tests/components/admin/maintenanceResetButtons.test.tsx`): buttons absent when `destructiveResetAllowed()` false; present + typed-confirm gating when true; confirm disabled until input==`RESET`.
- **Ref-parser strictness test** (`tests/admin/validationDeployment.test.ts`): the strict `PROJECT_REF_HOST_REGEX` rejects branch-preview/suffixed hosts (`https://<ref>-preview.supabase.co`), accepts the bare validation host + optional port, returns null for non-supabase/garbage — mirroring `tests/scripts/validation-target.test.ts:70-82`.
- **Advisory-lock topology test** (extend `tests/auth/advisoryLockRpcDeadlock.test.ts`): pin `reset_validation_data()` as a single-holder in-RPC lock-taker — it `perform pg_advisory_xact_lock(hashtext('show:'||…))` over the sorted distinct `drive_file_id` set and contains no nested SECURITY DEFINER re-acquisition. Reset DB test also seeds a row in each invariant-2 table (shows/crew_members/pending_syncs/pending_ingestions) to exercise the lock-then-delete path.
- **`/impeccable` critique + audit** on the two buttons + modals (AGENTS.md invariant 8), HIGH/CRITICAL fixed or DEFERRED.
- **CI:** `validation-schema-parity` after the migration reaches validation; `x1-catalog-parity` for the new codes; `tsc --noEmit` + `prettier --check .` (per the deep-links lessons).

---

## 9. Meta-test inventory

- **Trust-domain auth chain** (`tests/cross-cutting/auth-chain-audit.test.ts` / `lib/audit/trustDomains.ts`): no new routes (buttons live on the existing `/admin/settings` page) → **no new TRUST_DOMAINS row**. Declared explicitly so the reviewer doesn't expect one.
- **PostgREST DML lockdown** (`tests/db/postgrest-dml-lockdown.test.ts`): the new RPC mutates `shows` + children. The RPC-gated children are REVOKE'd from `authenticated`/`anon` via `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80` (and tracked in the lockdown registry). Crucially, `reset_validation_data()` is **SECURITY DEFINER**, so it executes with the definer's privileges and bypasses RLS/table-grant posture regardless of which children are REVOKE'd — the triple guard (not table grants) is what protects it. No new table → no new registry row; the plan re-confirms the lockdown test still passes.
- **§12.4 catalog parity** (`tests/messages/codes.test.ts`): new codes added in lockstep (§6.5).

---

## 10. Disagreement preempts (for the reviewer)

- **The buttons not appearing in local dev is intentional**, not a bug (§4.2): the guard is validation-ref-bound; local opt-in is via test stubs only. Do not relitigate as "feature broken locally."
- **The DB marker is deliberately NOT migration-seeded** (D4): a migration-seeded marker would exist in prod (migrations apply everywhere), defeating the guard. The out-of-band manual insert (same place as the env flag) is the design, not an omission.
- **Reset preserves admin/config/auth** (D5) by design — it is "empty of shows," not "factory wipe." Preserving `admin_emails`/`app_settings`/auth is intended so the operator stays logged in.
- **Reset DOES hold per-show advisory locks (D10, invariant 2)** — the RPC locks every affected show's `drive_file_id` in sorted order before mutating, single-holder, pinned by `advisoryLockRpcDeadlock.test.ts`. (Round-1 D10 wrongly hand-waved this as "row-level contention is enough"; corrected in round 2. This is invariant compliance, not a global lock.)
- **Reseed reuses existing RPCs** (D7) rather than a new seed RPC — intentional DRY with the CLI; the shared lib (§6.2) is the single source of combo definitions.
- **Reseed uses a service-role client** (D7a) — deliberate, because the existing mint/finalize RPCs have no `is_admin()` gate and the CLI already calls them service-role; adding an `authenticated`+`is_admin()` grant to them would break the CLI's service-role calls (is_admin() is false under a service_role JWT). The admin+marker gate is instead enforced by `assert_destructive_reset_enabled()` via the session client before the service-role client is constructed. Do not relitigate as "service-role in a server action is unsafe" — it is reached only behind render-gate + requireAdmin + destructiveResetAllowed + the assert RPC, in a validation-only deployment.

---

## 11. Plan-time mandates (resolved at spec level; plan must mechanize)

- **Complete FK audit before writing the reset RPC** (§6.1 step 2): query `pg_constraint` for every FK referencing `public.shows` whose `confdeltype` is neither `'c'` (cascade) nor `'n'` (set null); delete each such blocking parent table before `shows`. The spec names `reports` as the lone case found by grep, but the plan must derive the authoritative list from the live schema and add a test that fails if a new non-cascade FK to `shows` is introduced without a corresponding pre-delete.
- The reseed grant posture is **resolved** (D7a / §6.2): service-role client behind the assert RPC; no change to existing RPC grants. (Was an open question in round 1; closed.)
