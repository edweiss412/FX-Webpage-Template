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
| D2 | **Triple guard** (all three must pass): (a) **render** layer — buttons render only when `isValidationDeployment()` AND `process.env.ALLOW_DESTRUCTIVE_RESET === 'true'`; (b) **server-action** layer — `requireAdmin()` + both checks re-evaluated, throw before any DB call; (c) **DB** layer — the RPC requires `is_admin()` AND a validation-only gate row in a **dedicated table `public.destructive_reset_gate` with NO `anon`/`authenticated` DML grants** (so a production admin cannot enable it via PostgREST and then call the RPC directly — the marker is deliberately NOT on `app_settings`, which IS admin-writable via PostgREST behind `is_admin()` RLS, `supabase/migrations/20260501002000_rls_policies.sql:131-137`). |
| D3 | **`isValidationDeployment()`** = the live Supabase project-ref (parsed from `process.env.SUPABASE_URL` ?? `NEXT_PUBLIC_SUPABASE_URL`) equals the canonical validation ref `vzakgrxqwcalbmagufjh`. The ref parser MUST reuse the **strict host-boundary regex** already proven in `scripts/lib/validation-target.ts:27` (`PROJECT_REF_HOST_REGEX = /^https?:\/\/([a-z0-9]+)\.supabase\.(?:co\|in)(?::\d+)?(?:\/\|$)/i`), which rejects branch-preview/suffixed hosts (`tests/scripts/validation-target.test.ts:70-82`). Because `scripts/lib/**` is CLI tooling (not app-importable), the plan EITHER promotes that regex to a shared module both import OR copies it verbatim into `lib/admin/validationDeployment.ts` with the same branch-preview/port/malformed-suffix guard tests. (The `vzakgrxqwcalbmagufjh` literal at `validation-target.ts:99-100` is example prose, not an exported constant — do not cite it as the source of truth.) |
| D4 | **DB marker** = a row in the dedicated singleton table `public.destructive_reset_gate (id text primary key default 'default' check (id='default'), enabled boolean not null default false)`. The migration creates it, REVOKEs ALL from `anon`/`authenticated`/`public` (grants only to `service_role`), enables RLS with **no policy** (deny-all to PostgREST), and inserts the `enabled=false` singleton everywhere — so NO runtime session (even an admin) can read or write it via PostgREST. The reset/assert RPCs (SECURITY DEFINER, owner privileges) read it. It is set `enabled=true` **only in the validation DB, out-of-band** (one-time `update public.destructive_reset_gate set enabled=true where id='default';` via service-role/psql, exactly like the `ALLOW_DESTRUCTIVE_RESET` env var). Prod keeps `false` AND a prod admin cannot flip it (no DML grant) → DB-layer refusal even if the app/render guards are bypassed. |
| D5 | **Reset scope** = DELETE all show data (`reports` first — non-cascade FK — then `shows` + FK-cascade children) + drive-keyed staging/suppression tables NOT FK-cascade'd to `shows`: `pending_syncs`, `pending_ingestions`, **`deferred_ingestions`** (the live suppression table — `permanent_ignore`/`defer_until_modified` rows the cron reads BEFORE processing, `supabase/migrations/20260501001000_internal_and_admin.sql:250-266`, `lib/sync/runScheduledCronSync.ts:929-937`; leaving rows taints the next "clean" onboarding), onboarding scan manifest, wizard sessions/checkpoints + the **validation fixture singleton** `public.validation_state` (no FK to `shows`; stale alias IDs/seed dates — `20260527204241_validation_state.sql:4-12`). **The plan MUST run a complete drive-keyed-staging audit** (enumerate every table with a `drive_file_id` column that is not an `on delete cascade` child of `shows`) and decide clear-vs-preserve per table, not trust this list. **PRESERVE** `admin_emails`, auth/sessions, and `app_settings` **durable** config (`watched_folder_*`, `active_signing_key_id`) — but **NULL the transient pointers** `app_settings.pending_wizard_session_id` / `pending_wizard_session_at` / `pending_folder_*` (`20260501001000:239-244`). Result: empty show list + clean fixture/wizard/suppression state, operator still admin, Drive connection intact. |
| D6 | **Reset mechanism** = one new SECURITY DEFINER RPC `reset_validation_data()`; single transaction; admin+marker gated. |
| D7 | **Reseed mechanism** = reuse the **existing, unchanged** `mint_validation_fixture_atomic` + `validation_finalize_all_atomic` RPCs (defined in `supabase/migrations/20260527210000_mint_validation_fixture_atomic.sql` + `20260527210001_validation_finalize_all_atomic.sql`; these are SECURITY DEFINER with **no `is_admin()` body gate**, called by the CLI via a **service-role** client — `scripts/validation-reseed.ts:72,204`). No new seed RPC; combo definitions move to a shared lib (§6.2). |
| D7a | **Reseed guard wiring (resolves the grant-posture risk):** the reseed server action (a) calls a new tiny `assert_destructive_reset_enabled()` RPC via the **admin session** client (enforces `is_admin()` + marker — the DB-layer guard) and only on success (b) seeds by looping `mintFixtureCombos` via a **service-role** client against the unchanged mint/finalize RPCs. This keeps the existing RPCs + CLI untouched (no grant changes, no broad `authenticated` exposure) while still giving reseed a DB-layer admin+marker gate. The service-role client is reached ONLY behind render-gate + `requireAdmin` + `destructiveResetAllowed` + the assert RPC. |
| D8 | **Confirmation UX:** Reset = **typed confirmation** (operator types `RESET` to enable the confirm button). Reseed = **simple two-step confirm** (mirrors `ReapStaleSessionsButton`). |
| D9 | **Error/copy discipline:** no raw error codes in UI (AGENTS.md invariant 5); server actions follow the `{data,error}` call-boundary discipline (invariant 9). |
| D10 | **Concurrency — per-show advisory locks for in-flight serialization; "empty at commit" guarantee (honest scope, R5 final):** `reset_validation_data()` mutates invariant-2 tables (`shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`), so it holds the per-show advisory lock for every affected show — it materializes the distinct `drive_file_id` set across `shows ∪ pending_syncs ∪ pending_ingestions ∪ deferred_ingestions`, sorts it, and `perform pg_advisory_xact_lock(hashtext('show:'\|\|did))` each in sorted order BEFORE any delete. Sorted acquisition + single-holder + the reset holding nothing else ⇒ **deadlock-free** (single-show sync holders never wait on a second lock; multi-lock finalize paths also sort — `lib/onboarding/sessionLifecycle.ts`). This SERIALIZES the reset against any in-flight sync of an affected show (no half-applied corruption). **The guarantee (deliberately scoped, R6): the reset clears every `shows` row and every drive-keyed staging/suppression row that is VISIBLE to it — i.e., present when it builds its lock+delete set.** It does NOT guarantee the tables are observably empty at commit for a *brand-new* key, and does NOT keep them empty afterward: a concurrent cron run (`lib/sync/runScheduledCronSync.ts` — takes its OWN per-show lock on an arbitrary new `drive_file_id` via `lib/sync/lockedShowTx.ts:57-61`) can INSERT `pending_*` for a key absent from reset's set and commit inside or after the reset window; and the next cron tick re-ingests from the watched Drive folder regardless. No within-transaction lock the reset can take (advisory OR table-level) excludes a brand-new concurrent key without an **admission gate that the cron + onboarding writers consult** — and that gate is a deliberate **non-goal** (out of scope §2). The operator runs reset when syncs are quiesced and/or pairs it with the wizard/reseed flow; the watched folder is the source of truth. Pinned by the advisory-lock topology test (reset = sorted single-holder advisory taker) + an in-flight-serialization concurrency test. |

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
Both actions (`resetValidationDataAction`, `reseedValidationFixturesAction`) start with `await requireAdmin();` then `if (!destructiveResetAllowed()) return { ok: false, code: "VALIDATION_RESET_NOT_ALLOWED" };` BEFORE any Supabase call. Never trust the client; the render gate is defense-in-depth, not the enforcement.

### 4.4 DB layer
`reset_validation_data()` is `SECURITY DEFINER`, `set search_path = public, pg_temp`, and begins:
```sql
if not public.is_admin() then raise exception 'not authorized'; end if;
if not coalesce((select enabled from public.destructive_reset_gate
                 where id = 'default'), false)
then raise exception 'destructive reset not enabled for this database'; end if;
```
Because `destructive_reset_gate.enabled` is set `true` out-of-band in validation **only** (D4), defaults `false` everywhere, AND has no `anon`/`authenticated` DML grant, even a misconfigured app OR a prod admin hitting PostgREST directly cannot reset prod — prod's gate is `false` and unwritable through any runtime session, so the RPC raises. The same gate check is in a thin `assert_destructive_reset_enabled()` helper the reseed path also calls (so reseed is equally DB-gated).

**Immediately after the guard passes, BEFORE any delete**, the RPC acquires the per-show advisory locks (D10) inside the same transaction, so in-flight syncs of affected shows are serialized (no corruption) and the gate + lock acquisition cannot be separated. (The guarantee is bounded to rows visible to the reset — a brand-new concurrent key is not excluded; D10.)

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
- **Gate `enabled=false`** (validation env but DB gate not provisioned out-of-band) → server action proceeds to RPC; RPC raises `destructive reset not enabled`; action maps to `VALIDATION_RESET_NOT_ENABLED` with calm copy. Buttons may render (env says validation) but the action fails safely with a clear message.
- **Empty DB** (already reset) → `reset_validation_data()` deletes 0 rows, returns `{clearedShows: 0}`; success with "0 shows cleared".
- **Reseed when shows already present** → `mint_validation_fixture_atomic` UPSERTs (idempotent per its existing contract); returns seeded count.
- **Confirm input ≠ `RESET`** → reset confirm button stays disabled; action never called.

---

## 6. Implementation surfaces

### 6.1 Reset RPC + gate table — `supabase/migrations/<ts>_validation_reset_rpc.sql`
- **Gate table (D4):** `create table if not exists public.destructive_reset_gate (id text primary key default 'default' check (id='default'), enabled boolean not null default false);` then `revoke all on table public.destructive_reset_gate from anon, authenticated, public;` + `grant all on table public.destructive_reset_gate to service_role;` + `alter table public.destructive_reset_gate enable row level security;` (no policy → PostgREST deny-all) + `insert into public.destructive_reset_gate (id) values ('default') on conflict do nothing;`. Applies to all envs at `enabled=false`; set `true` out-of-band in validation only (D4). The table participates in the schema manifest / `validation-schema-parity` gate and the `postgrest-dml-lockdown` registry (§9).
- `create or replace function public.reset_validation_data() returns jsonb` — SECURITY DEFINER, admin+marker gate (§4.4), then in one transaction:
  1. **Acquire per-show advisory locks (invariant 2, D10):** `for v_did in select drive_file_id from (select drive_file_id from public.shows union select drive_file_id from public.pending_syncs union select drive_file_id from public.pending_ingestions union select drive_file_id from public.deferred_ingestions) u order by drive_file_id loop perform pg_advisory_xact_lock(hashtext('show:' || v_did)); end loop;` — sorted, single-holder, BEFORE any delete; serializes in-flight syncs of affected shows (does NOT prevent post-commit re-ingestion — D10).
  2. capture `count(*) from public.shows`;
  3. **`delete from public.reports;`** FIRST — `reports.show_id` is a **non-cascading** FK (`supabase/migrations/20260501001000_internal_and_admin.sql:311` — plain `references public.shows(id)`, no `on delete cascade`/`set null`), so `delete from shows` would raise a FK violation if any report row remains. This is the lone non-cascade child found; **the plan MUST run a complete FK audit** (query `pg_constraint` for every FK referencing `public.shows` with `confdeltype not in ('c','n')`) and delete each such parent-blocking table before `shows`, rather than trusting this enumeration.
  4. `delete from public.shows;` — FK cascade clears the `on delete cascade` children (`crew_members:33`, `hotel_reservations:55`, `rooms:68`, `transportation:89`, `contacts:106`, `shows_internal`, `show_share_tokens`, sync_holds, show_change_log, etc. — all verified `on delete cascade`); `email_deliveries`/`onboarding_manifest.created_show_id` are `on delete set null` (rows survive, link nulled — acceptable);
  5. explicit `delete` of the `clear-explicit` drive-keyed tables (NOT FK-cascade'd to shows) per the §8 registry: `pending_syncs`, `pending_ingestions`, **`deferred_ingestions`**, `onboarding_scan_manifest`, `revision_race_cooldowns`, wizard sessions/checkpoints (+ `sync_log`/`sync_audit` if the plan dispositions them `clear-explicit`). (`show_change_log`, `sync_holds`, **`pending_snapshot_uploads`** and **`shows_pending_changes`** are `on delete cascade` children — `supabase/migrations/20260501001000_internal_and_admin.sql:364,437` — already cleared by step 4, no explicit delete.)
  6. **`delete from public.validation_state;`** (the fixture singleton — D5/F2 — no FK to shows, would otherwise survive with stale alias IDs);
  7. **clear stranded `app_settings` pointers (D5/F3):** `update public.app_settings set pending_wizard_session_id = null, pending_wizard_session_at = null, pending_folder_id = null, pending_folder_name = null, pending_folder_set_by_email = null, pending_folder_set_at = null where id = 'default';` (durable `watched_folder_*` / `active_signing_key_id` untouched);
  8. return `jsonb_build_object('clearedShows', <count>)`.
- Also create `assert_destructive_reset_enabled() returns void` (SECURITY DEFINER, `is_admin()` + marker gate, raises otherwise) — the reseed action's DB-layer guard (D7a).
- Grants: `grant execute ... to authenticated;` revoke from `anon`, `public`. Mirrors the `unarchive_show` admin RPC pattern (`supabase/migrations/20260602000000_b2_r4_unarchive_held_and_finalize_admin_guard.sql:35-63`).
- Idempotent DDL (`create or replace`; if a marker helper is added, `drop function if exists` + recreate).
- **Migration lifecycle:** applied locally (TDD), manifest regenerated (`pnpm gen:schema-manifest`), and applied surgically to the validation project (the `validation-schema-parity` gate, per AGENTS.md). The gate **table + its `enabled=false` singleton + the REVOKE/RLS + the lockdown registry row are ALL migration-owned** (present in every env with `enabled=false`). The ONLY out-of-band step is flipping `enabled=true` in the validation DB (D4) — the table itself is never out-of-band.

### 6.2 Shared fixture lib — `lib/validation/reseedFixtures.ts`
- The 16-combo fixture definitions ALREADY live in `scripts/lib/validation-fixtures.ts` (`R_COMBOS`/`SW_COMBOS:22-35`, `buildFixtures():537-599`); the CLI calls `buildFixtures(validationTodayIso)` (`scripts/validation-reseed.ts:208`). **Promote that module to an app-importable location** (`lib/validation/fixtures.ts`) and re-point the CLI import — do NOT create a second fixture source. Then extract ONLY the per-combo mint/finalize loop from the CLI into `lib/validation/reseedFixtures.ts` as `mintFixtureCombos(client, fixtures)`, imported by BOTH the CLI and the server action. CLI behavior unchanged.
- **Client (resolved — D7a):** `mintFixtureCombos(client)` accepts a Supabase client and loops the existing, unchanged mint/finalize RPCs. The server action passes a **service-role** client (the existing RPCs have no `is_admin()` gate and the CLI already calls them service-role — `scripts/validation-reseed.ts:204`). The admin+marker gate for reseed is enforced separately by `assert_destructive_reset_enabled()` invoked via the admin **session** client BEFORE any seeding (so a non-admin or a non-validation DB is rejected before the service-role client is ever used). Existing RPC grants are NOT modified.

### 6.3 Server actions — `app/admin/settings/_actions/validationReset.ts`
- `"use server"`. Both actions: `requireAdmin()` → `destructiveResetAllowed()` gate → … → `revalidatePath('/admin')` + `revalidatePath('/admin/settings')`. Return discriminated `{ ok: true; count: number } | { ok: false; code: MessageCode }` where `code` is one of the four UPPER_SNAKE catalog codes (§6.5). Every Supabase call destructures `{ data, error }`; a Supabase-boundary infra fault (invariant 9) is mapped to `VALIDATION_RESET_FAILED` / `VALIDATION_RESEED_FAILED` (never returned as a bare `infra_error`).
- `resetValidationDataAction()`: after gates fail → `VALIDATION_RESET_NOT_ALLOWED`; calls `reset_validation_data()` via the admin **session** client; maps a gate-disabled raise to `VALIDATION_RESET_NOT_ENABLED`, any other infra fault to `VALIDATION_RESET_FAILED`.
- `reseedValidationFixturesAction()`: after gates fail → `VALIDATION_RESET_NOT_ALLOWED`; calls `assert_destructive_reset_enabled()` via the **session** client (DB-layer is_admin+gate; gate-disabled raise → `VALIDATION_RESET_NOT_ENABLED`); on success, builds a **service-role** client and runs `mintFixtureCombos(serviceClient)` (infra fault → `VALIDATION_RESEED_FAILED`); returns seeded count. The service-role client is constructed ONLY after all gates + the assert pass.

### 6.4 UI — `components/admin/MaintenanceResetButtons.tsx`
- Client component, sibling of `ReapStaleSessionsButton` in the maintenance card. Two buttons + their modals. Reset = destructive styling + typed-confirm (`RESET`); Reseed = neutral + simple confirm. Idle→confirming→running→done/error state machine (ported from `ReapStaleSessionsButton.tsx`). Copy via the message catalog (`messageFor`), no raw codes. a11y: `aria-describedby` on compact buttons, focus management on modal open/close, `disabled` on `isPending` (not self-disable in onClick — per `feedback_react_form_action_synchronous_disable_cancels_submit`).
- Rendered by `app/admin/settings/page.tsx` only when `destructiveResetAllowed()`; passed no secret props.

### 6.5 Error catalog rows (`lib/messages/catalog.ts` + §12.4 + `gen:spec-codes`)
- Catalog codes are **UPPER_SNAKE `MessageCode`s** (per `lib/messages/catalog.ts`, e.g. `REAP_STALE_SESSIONS_FAILED`), looked up via `messageFor(code).dougFacing` with a `GENERIC_ERROR` fallback (the `ReapStaleSessionsButton` pattern, `components/admin/ReapStaleSessionsButton.tsx:36-43,81`). This feature adds **four** new catalog codes: `VALIDATION_RESET_NOT_ALLOWED` (guard closed), `VALIDATION_RESET_NOT_ENABLED` (DB gate `false`), `VALIDATION_RESET_FAILED` (reset infra fault), `VALIDATION_RESEED_FAILED` (reseed infra fault). There is **no bare `infra_error` catalog code** (it is a result *kind*, not a `MessageCode`; `lib/messages/lookup.ts:69-79` `fallbackEntryFor` returns all-null fields for unknown codes) — the actions MAP their internal `{ kind:'infra_error' }` Supabase-boundary result to `VALIDATION_RESET_FAILED` / `VALIDATION_RESEED_FAILED` before returning, so the UI always renders real copy (invariant 5). No `reset_busy` (sorted single-holder advisory is deadlock-free). Success summaries are plain counts (not codes). Each new code follows the three-part §12.4 lockstep (AGENTS.md): master spec §12.4 prose + `pnpm gen:spec-codes` (`scripts/extract-spec-codes.ts`) + `lib/messages/catalog.ts` row, all in one commit; the x1 gate `pnpm test:audit:x1-catalog-parity` (`package.json:30` → `tests/cross-cutting/codes.test.ts:76` + `tests/cross-cutting/extract-spec-codes.test.ts`) enforces. A component test asserts each of the four codes resolves to non-empty `dougFacing` copy (never a raw code or blank).

---

## 7. Flag lifecycle table

| Flag / marker | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `ALLOW_DESTRUCTIVE_RESET` | env var (validation deployment only) | set manually in Vercel validation env | `destructiveResetAllowed()` (render + server action) | gates button render + action |
| `SUPABASE_URL` project-ref | env var | existing deploy config | `isValidationDeployment()` | proves which project |
| `destructive_reset_gate.enabled` | dedicated DB table, NO anon/authenticated DML grant + RLS-deny (created by migration, `default false`; set true validation-only, out-of-band) | one-time `update` via service-role/psql in validation DB (NOT possible through any runtime session) | `reset_validation_data()` / `assert_destructive_reset_enabled()` (SECURITY DEFINER) | DB-layer refusal on prod — prod stays `false` AND no admin can flip it via PostgREST |

No zombie flags: each is written (manually, validation-only), read (guard), and has a concrete effect (refusal). All three default absent/false → feature inert.

---

## 8. Testing

- **`isValidationDeployment` / guard units** (`tests/admin/validationDeployment.test.ts`): ref match → true; prod ref / null / empty → false; `destructiveResetAllowed` AND-composition (env flag toggled).
- **Reset RPC real-local-DB test** (`tests/db/resetValidationData.test.ts`): seed shows + cascade children + **a `reports` row** + `pending_syncs`/`pending_ingestions`/**`deferred_ingestions`** rows + a `validation_state` row + `app_settings` with `pending_wizard_session_id`/`watched_folder_id` set → call RPC → assert: all show/cascade/`reports`/staging/`deferred_ingestions`/`validation_state` rows cleared; `app_settings` row PRESERVED but `pending_wizard_session_id`/`pending_folder_*` NULL and `watched_folder_id` UNCHANGED; `admin_emails`/auth preserved; returns correct `clearedShows`; marker-`false` → raises; non-admin → raises. The `reports`-row case is the non-cascade-FK regression (without the pre-delete the RPC raises a FK violation); the `deferred_ingestions` case is the R3 suppression-residue regression. (jsdom insufficient — real DB.)
- **FK-audit guard test** (`tests/db/resetValidationDataFkAudit.test.ts`): query `pg_constraint` for FKs referencing `public.shows` with `confdeltype not in ('c','n')`; assert every such table appears in the RPC's pre-delete list. Fails if a future migration adds a non-cascade FK to `shows` without updating the reset RPC.
- **Drive-keyed cleanup audit (structural)** (`tests/db/resetValidationDataDriveKeyedAudit.test.ts`): **derive the table list at test time** from `information_schema.columns` where `column_name = 'drive_file_id'` EXACTLY (do not hardcode — the live set, per `supabase/__generated__/schema-manifest.json`, includes `shows`, `pending_syncs`, `pending_ingestions`, `deferred_ingestions`, `onboarding_scan_manifest`, `pending_snapshot_uploads`, `revision_race_cooldowns`, `shows_pending_changes`, `sync_audit`, `sync_log`, **`show_change_log`**, **`sync_holds`** — note `wizard_finalize_checkpoints` has `last_processed_drive_file_id`, NOT `drive_file_id`, so it is handled as wizard/session cleanup, not in this set). Assert each table has an explicit disposition in a maintained registry: `clear-via-cascade` (an `on delete cascade` child of `shows` — `show_change_log`, `sync_holds`, `pending_snapshot_uploads`, `shows_pending_changes` — cleared automatically by `delete from shows`, no explicit delete needed) | `clear-explicit` (NOT FK-cascade'd to shows — `pending_syncs`, `pending_ingestions`, `deferred_ingestions`, `onboarding_scan_manifest`, `revision_race_cooldowns` — must be in the RPC's delete set) | `preserve(reason)`. Assert every `clear-explicit` table is in the RPC delete set, and every `clear-via-cascade` table is in fact an `on delete cascade` child (query `pg_constraint` — this is what catches a misclassification like the R7 `pending_snapshot_uploads`/`shows_pending_changes` case). `sync_log`/`sync_audit` → plan records `clear-explicit` (true empty-state) or `preserve(reason)`. Fails when a future migration adds a `drive_file_id` table with no disposition. Seeds `revision_race_cooldowns` as a clean-reset regression.
- **In-flight serialization concurrency test** (`tests/db/resetValidationDataConcurrency.test.ts`): connection T2 opens a transaction, takes `pg_advisory_xact_lock(hashtext('show:'||did))` for an existing show and begins an UPDATE; T1 calls `reset_validation_data()` and BLOCKS on that show's advisory lock until T2 commits/rolls back — proving the reset serializes with in-flight syncs of VISIBLE shows (no half-applied state). Assert every row that existed when the reset ran is deleted. The test does **NOT** assert the tables are empty against a concurrent brand-new-key writer or after commit — that is out of scope by design (D10); asserting it would encode a guarantee the spec deliberately does not make.
- **Reseed test**: empty DB → reseed → 16 combos present (assert against `FIXTURE_COMBOS` length, not a hardcoded literal).
- **Gate-table prod-safety test (real-DB)** (`tests/db/destructiveResetGate.test.ts`): reuse the lockdown test's `resolveRestConfig()` pattern (`tests/db/postgrest-dml-lockdown.test.ts:440-449`) — send a Supabase-issued **publishable key** as the `apikey` header (the API gateway validates `apikey` independently and rejects a self-signed JWT before PostgREST sees it) AND a **self-signed admin JWT** (`is_admin()` true) as `Authorization: Bearer`. Assert a direct PostgREST `update`/`select`/`insert` on `public.destructive_reset_gate` fails at the **table-permission/RLS layer** (not the gateway) — i.e. an admin CANNOT flip `enabled=true` through a runtime session; only a service-role/out-of-band path can. Then assert `reset_validation_data()` raises while the gate is `false`. This proves the R7 critical (admin-mutable marker) is closed.
- **Server-action guard-refusal test** (`tests/admin/validationResetAction.test.ts`), split by layer (resolves the §5.1↔§8 contradiction): (a) **env/ref/flag guard fails** (`destructiveResetAllowed()` false: not-validation ref, or flag off) → `VALIDATION_RESET_NOT_ALLOWED`, and **NO Supabase call is made** (mock asserts zero RPC calls, no service-role client constructed); (b) **gates pass but DB gate is `false`** → the action **DOES** call `reset_validation_data()` / `assert_destructive_reset_enabled()` (which raises), mapped to `VALIDATION_RESET_NOT_ENABLED`, but the reseed path **does NOT** construct the service-role client or call mint/finalize. These are distinct assertions, not "RPC never called" across the board.
- **Render-gate component test** (`tests/components/admin/maintenanceResetButtons.test.tsx`): buttons absent when `destructiveResetAllowed()` false; present + typed-confirm gating when true; confirm disabled until input==`RESET`.
- **Ref-parser strictness test** (`tests/admin/validationDeployment.test.ts`): the strict `PROJECT_REF_HOST_REGEX` rejects branch-preview/suffixed hosts (`https://<ref>-preview.supabase.co`), accepts the bare validation host + optional port, returns null for non-supabase/garbage — mirroring `tests/scripts/validation-target.test.ts:70-82`.
- **Advisory-lock topology test** (extend `tests/auth/advisoryLockRpcDeadlock.test.ts`): pin `reset_validation_data()` as a **sorted single-holder** advisory-lock taker — assert its body acquires `pg_advisory_xact_lock(hashtext('show:'||…))` over a `order by drive_file_id` set and contains no nested SECURITY DEFINER re-acquisition (matches the cleanup-functions topology, deadlock-free). This is the structural defense closing the concurrency vector (per AGENTS.md "structural-defense calibration" — shipped in the same round, not deferred).
- **`/impeccable` critique + audit** on the two buttons + modals (AGENTS.md invariant 8), HIGH/CRITICAL fixed or DEFERRED.
- **CI:** `validation-schema-parity` after the migration reaches validation; `x1-catalog-parity` for the new codes; `tsc --noEmit` + `prettier --check .` (per the deep-links lessons).

---

## 9. Meta-test inventory

- **Trust-domain auth chain** (`tests/cross-cutting/auth-chain-audit.test.ts` / `lib/audit/trustDomains.ts`): no new routes (buttons live on the existing `/admin/settings` page) → **no new TRUST_DOMAINS row**. Declared explicitly so the reviewer doesn't expect one.
- **PostgREST DML lockdown** (`tests/db/postgrest-dml-lockdown.test.ts`): **add a registry row for the new `public.destructive_reset_gate` table** — it has NO `anon`/`authenticated` DML grant and RLS-deny, so SELECT/INSERT/UPDATE/DELETE via PostgREST must all fail (this is the structural pin for the R7 critical fix). The new RPC mutates `shows` + children. The RPC-gated children are REVOKE'd from `authenticated`/`anon` via `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80` (and tracked in the lockdown registry). Crucially, `reset_validation_data()` is **SECURITY DEFINER**, so it executes with the definer's privileges and bypasses RLS/table-grant posture regardless of which children are REVOKE'd — the triple guard (not table grants) is what protects it. (So this milestone DOES add exactly one new lockdown registry row: `destructive_reset_gate`.)
- **§12.4 catalog parity** (`tests/cross-cutting/codes.test.ts:76` + `tests/cross-cutting/extract-spec-codes.test.ts`, run via `pnpm test:audit:x1-catalog-parity`): new codes added in lockstep (§6.5).
- **Supabase call-boundary infra contract (invariant 9)** — the new server actions add Supabase call sites (reset: `reset_validation_data()` via the session client; reseed: `assert_destructive_reset_enabled()` via the session client + `mintFixtureCombos` via the service-role client). Each MUST be pinned: **add a registry row to `tests/admin/_metaInfraContract.test.ts`** (the established admin-surface infra-contract meta-test) asserting both actions destructure `{ data, error }`, distinguish returned-error vs thrown faults, surface them as the typed `VALIDATION_RESET_FAILED`/`VALIDATION_RESEED_FAILED` codes (never a silent continue), and construct the service-role client ONLY after the gate+assert pass. (No call site is exempt; none carries `// not-subject-to-meta`.)

---

## 10. Disagreement preempts (for the reviewer)

- **The buttons not appearing in local dev is intentional**, not a bug (§4.2): the guard is validation-ref-bound; local opt-in is via test stubs only. Do not relitigate as "feature broken locally."
- **Only the gate FLIP (`enabled=true`) is out-of-band; the table itself is migration-owned** (D4): the migration creates `destructive_reset_gate`, its REVOKE/RLS-deny, and inserts the `enabled=false` singleton in EVERY env (so prod has the table+row, gated false and unwritable via PostgREST). What is deliberately NOT in the migration is setting `enabled=true` — that one flip is the validation-only out-of-band step (same posture as the env flag). Do not relitigate as either "the table is out-of-band" (it is not) or "the migration seeds it true" (it does not).
- **Reset preserves admin/config/auth** (D5) by design — it is "empty of shows," not "factory wipe." Preserving `admin_emails`/`app_settings`/auth is intended so the operator stays logged in.
- **Reset guarantee is bounded to rows VISIBLE to the reset, not a hard "empty" (D10, R6 final)** — the reset holds per-show advisory locks (invariant-2 compliant, sorted single-holder, deadlock-free) to serialize in-flight syncs of affected shows and deletes every row present when it runs, but **deliberately does not exclude a concurrent brand-new key** (a cron run under its own per-show lock can insert `pending_*` for a key absent from reset's set and commit inside/after the reset window) nor prevent post-commit re-ingestion from the watched folder. Excluding a brand-new concurrent key would require an admission gate the cron + onboarding writers consult — an explicit non-goal (out of scope §2). The operator quiesces syncs / pairs reset with the wizard/reseed flow. Do not relitigate as "empty guarantee violated" — the spec scopes the guarantee to visible rows precisely so this is not a defect; the concurrency test asserts in-flight serialization + deletion of pre-existing rows, nothing stronger.
- **Reseed reuses existing RPCs** (D7) rather than a new seed RPC — intentional DRY with the CLI; the shared lib (§6.2) is the single source of combo definitions.
- **Reseed uses a service-role client** (D7a) — deliberate, because the existing mint/finalize RPCs have no `is_admin()` gate and the CLI already calls them service-role; adding an `authenticated`+`is_admin()` grant to them would break the CLI's service-role calls (is_admin() is false under a service_role JWT). The admin+marker gate is instead enforced by `assert_destructive_reset_enabled()` via the session client before the service-role client is constructed. Do not relitigate as "service-role in a server action is unsafe" — it is reached only behind render-gate + requireAdmin + destructiveResetAllowed + the assert RPC, in a validation-only deployment.

---

## 11. Plan-time mandates (resolved at spec level; plan must mechanize)

- **Complete FK audit before writing the reset RPC** (§6.1 step 2): query `pg_constraint` for every FK referencing `public.shows` whose `confdeltype` is neither `'c'` (cascade) nor `'n'` (set null); delete each such blocking parent table before `shows`. The spec names `reports` as the lone case found by grep, but the plan must derive the authoritative list from the live schema and add a test that fails if a new non-cascade FK to `shows` is introduced without a corresponding pre-delete.
- The reseed grant posture is **resolved** (D7a / §6.2): service-role client behind the assert RPC; no change to existing RPC grants. (Was an open question in round 1; closed.)
