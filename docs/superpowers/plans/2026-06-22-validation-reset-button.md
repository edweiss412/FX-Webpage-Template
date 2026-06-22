# Validation Reset + Reseed Buttons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two admin-Settings "maintenance" buttons — **Reset validation data** (empties validation show data) and **Reseed validation fixtures** — that are structurally impossible to fire against production.

**Architecture:** A triple guard (validation project-ref + `ALLOW_DESTRUCTIVE_RESET` env flag + a no-DML-grant `destructive_reset_gate` DB table) protects two server actions that call SECURITY DEFINER RPCs (reset) / the existing fixture RPCs via a gated service-role client (reseed). Two thin client buttons live in the existing maintenance card. See the approved spec: `docs/superpowers/specs/2026-06-22-validation-reset-button-design.md` (11 adversarial rounds).

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase (postgres.js / supabase-js, SECURITY DEFINER plpgsql), TypeScript (`exactOptionalPropertyTypes: true`), Vitest (node + jsdom envs), Tailwind v4.

## Global Constraints

- **Spec is canonical.** Every decision (D1–D10, D7a) and every test in the spec is binding. Where this plan abbreviates SQL/code, the spec's exact text governs.
- **Triple guard, all three layers** (spec §4): render (`destructiveResetAllowed()`), server-action (`requireAdmin()` + `destructiveResetAllowed()`), DB (`is_admin()` + `destructive_reset_gate.enabled`). Never collapse a layer.
- **Validation project ref** = `vzakgrxqwcalbmagufjh` (string literal). The ref parser MUST be the strict `PROJECT_REF_HOST_REGEX` copied verbatim from `scripts/lib/validation-target.ts:27`: `/^https?:\/\/([a-z0-9]+)\.supabase\.(?:co|in)(?::\d+)?(?:\/|$)/i`.
- **Gate table is migration-owned at `enabled=false` everywhere; ONLY the `enabled=true` flip is out-of-band in validation.** Never seed it true in a migration.
- **Reset advisory locks (invariant 2):** the reset RPC acquires `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))` over the sorted distinct `drive_file_id` set across `shows ∪ pending_syncs ∪ pending_ingestions ∪ deferred_ingestions` BEFORE any delete. Single-holder, sorted, no nested SECURITY DEFINER re-acquire.
- **Reset guarantee is "rows VISIBLE to the reset"** — empty-at-commit for new keys and post-commit re-ingestion are explicit non-goals; tests must not assert "stays empty."
- **Delete order:** `reports` (non-cascade FK) FIRST, then `shows` (cascade), then `clear-explicit` drive-keyed tables, then `validation_state`, then NULL the `app_settings` pending-wizard/pending-folder pointers. Run a `pg_constraint` FK audit + a drive-keyed-column audit; both are structural tests.
- **No raw error codes in UI (invariant 5):** four UPPER_SNAKE catalog codes `VALIDATION_RESET_NOT_ALLOWED`, `VALIDATION_RESET_NOT_ENABLED`, `VALIDATION_RESET_FAILED`, `VALIDATION_RESEED_FAILED` via the 3-part §12.4 lockstep (master spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`). `{kind:'infra_error'}` maps to `VALIDATION_RESET_FAILED`/`VALIDATION_RESEED_FAILED`.
- **Supabase call-boundary discipline (invariant 9):** every call destructures `{ data, error }`; register the new call sites in `tests/admin/_metaInfraContract.test.ts`.
- **PostgREST DML lockdown:** add one registry row for `destructive_reset_gate` (no DML grant + RLS-deny) to `tests/db/postgrest-dml-lockdown.test.ts`.
- **UI quality gate (invariant 8):** `/impeccable critique` + `/impeccable audit` on the buttons + modals before close-out.
- **Migration must reach validation** (`validation-schema-parity`): apply locally + `pnpm gen:schema-manifest` + apply surgically to `vzakgrxqwcalbmagufjh`.
- **Commit per task**, conventional commits (`feat(admin):`, `feat(db):`, `test(...)`, etc.). Run `pnpm exec tsc --noEmit` + `pnpm exec prettier --check .` after type/format-touching tasks (NOT prettier on the master spec — it is `.prettierignore`d).
- **UI is Opus territory** (AGENTS.md routing): Tasks 7–8 are Opus + impeccable.

---

## Meta-test inventory (declared per writing-plans rule)

- **CREATES:** none net-new meta-test files.
- **EXTENDS:** `tests/db/postgrest-dml-lockdown.test.ts` (gate table row); `tests/admin/_metaInfraContract.test.ts` (the two server actions' Supabase call sites); `tests/auth/advisoryLockRpcDeadlock.test.ts` (reset RPC topology); `tests/cross-cutting/codes.test.ts` (4 new codes, via the x1 gate).
- **Advisory-lock topology:** the reset RPC is the sole new lock holder; sorted single-holder, in-RPC, no nested SECURITY DEFINER re-acquire (spec D10). Pinned by extending the deadlock test.

---

## Task 1: Validation-deployment guard helpers

**Files:**
- Create: `lib/admin/validationDeployment.ts`
- Test: `tests/admin/validationDeployment.test.ts`

**Interfaces:**
- Produces: `VALIDATION_PROJECT_REF: string`, `projectRefFromUrl(url: string | undefined): string | null`, `isValidationDeployment(): boolean`, `destructiveResetAllowed(): boolean`.

- [ ] **Step 1: Write the failing tests** (`tests/admin/validationDeployment.test.ts`)

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VALIDATION_PROJECT_REF,
  projectRefFromUrl,
  isValidationDeployment,
  destructiveResetAllowed,
} from "@/lib/admin/validationDeployment";

afterEach(() => vi.unstubAllEnvs());

describe("projectRefFromUrl (strict host boundary)", () => {
  it("parses the bare validation host", () => {
    expect(projectRefFromUrl("https://vzakgrxqwcalbmagufjh.supabase.co")).toBe("vzakgrxqwcalbmagufjh");
  });
  it("allows an optional port", () => {
    expect(projectRefFromUrl("http://abc123.supabase.co:54321")).toBe("abc123");
  });
  it("REJECTS a branch-preview / suffixed host", () => {
    expect(projectRefFromUrl("https://vzakgrxqwcalbmagufjh-preview.supabase.co")).toBeNull();
  });
  it("returns null for non-supabase / garbage / empty / undefined", () => {
    expect(projectRefFromUrl("https://evil.example.com")).toBeNull();
    expect(projectRefFromUrl("http://127.0.0.1:54321")).toBeNull();
    expect(projectRefFromUrl("")).toBeNull();
    expect(projectRefFromUrl(undefined)).toBeNull();
  });
});

describe("isValidationDeployment / destructiveResetAllowed", () => {
  it("true only for the validation ref", () => {
    vi.stubEnv("SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    expect(isValidationDeployment()).toBe(true);
  });
  it("false for a prod-looking ref", () => {
    vi.stubEnv("SUPABASE_URL", "https://prodref000000000000.supabase.co");
    expect(isValidationDeployment()).toBe(false);
  });
  it("destructiveResetAllowed AND-composes ref + flag", () => {
    vi.stubEnv("SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(destructiveResetAllowed()).toBe(true);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "");
    expect(destructiveResetAllowed()).toBe(false);
  });
  it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL unset", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(destructiveResetAllowed()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/admin/validationDeployment.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/validationDeployment'`.

- [ ] **Step 3: Implement** (`lib/admin/validationDeployment.ts`) — verbatim from spec §4.2:

```ts
export const VALIDATION_PROJECT_REF = "vzakgrxqwcalbmagufjh";

// Strict host-boundary regex copied verbatim from scripts/lib/validation-target.ts:27.
// Rejects branch-preview/suffixed hosts and trailing-garbage suffixes.
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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/admin/validationDeployment.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: tsc + commit**

```bash
pnpm exec tsc --noEmit
git add lib/admin/validationDeployment.ts tests/admin/validationDeployment.test.ts
git commit -m "feat(admin): validation-deployment guard helpers (strict ref parser + destructiveResetAllowed)"
```

---

## Task 2: Reset migration — gate table + `reset_validation_data()` + `assert_destructive_reset_enabled()`

**Files:**
- Create: `supabase/migrations/20260622000000_validation_reset_rpc.sql` (use a timestamp AFTER any migration already on `origin/main`; verify with `ls supabase/migrations | tail` and bump if `20260622000000` collides — see the deep-links lesson on timestamp collisions).
- Test: `tests/db/destructiveResetGate.test.ts`, `tests/db/resetValidationData.test.ts`, `tests/db/resetValidationDataFkAudit.test.ts`, `tests/db/resetValidationDataDriveKeyedAudit.test.ts`, `tests/db/resetValidationDataConcurrency.test.ts`
- Modify (meta-tests): `tests/db/postgrest-dml-lockdown.test.ts`, `tests/auth/advisoryLockRpcDeadlock.test.ts`

**Interfaces:**
- Produces (callable RPCs): `public.reset_validation_data() returns jsonb` (`{clearedShows: number}`); `public.assert_destructive_reset_enabled() returns void`; table `public.destructive_reset_gate(id text, enabled boolean)`.

**Pre-step — FK + drive-keyed audit (do this first, encode results in the RPC):** run, in a local supabase psql, the two audits and confirm they match the spec's expectations before writing the deletes:
```sql
-- non-cascade FK children of shows (must be pre-deleted): expect 'reports'
select conrelid::regclass as child, confdeltype from pg_constraint
 where confrelid = 'public.shows'::regclass and contype='f' and confdeltype not in ('c','n');
-- every table with an EXACT drive_file_id column (clear-explicit unless on-delete-cascade child)
select table_name from information_schema.columns
 where table_schema='public' and column_name='drive_file_id' order by table_name;
```

- [ ] **Step 1: Write the gate prod-safety test** (`tests/db/destructiveResetGate.test.ts`) — reuse the API-gateway pattern from `tests/db/postgrest-dml-lockdown.test.ts:440-449` (`resolveRestConfig()`): send a Supabase **publishable key** as `apikey` + a **self-signed admin JWT** (`is_admin()` true) as `Authorization: Bearer`. Assert PostgREST `select`/`update`/`insert` on `public.destructive_reset_gate` all fail at the table-permission/RLS layer (NOT the gateway); assert `reset_validation_data()` raises while `enabled=false`; assert a non-admin call raises `not authorized`.

- [ ] **Step 2: Write the reset real-DB test** (`tests/db/resetValidationData.test.ts`): with the gate enabled (set `enabled=true` in the test DB) + an admin JWT, seed: a `shows` row + cascade children (`crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`) + a `reports` row for that show + `pending_syncs`/`pending_ingestions`/`deferred_ingestions` rows + a `validation_state` row + `app_settings` with `pending_wizard_session_id` and `watched_folder_id` set. Call `reset_validation_data()`. Assert: all the show/cascade/`reports`/staging/`deferred_ingestions`/`validation_state` rows are gone; the `app_settings` row PERSISTS but `pending_wizard_session_id`/`pending_folder_*` are NULL and `watched_folder_id` UNCHANGED; `admin_emails` rows preserved; the returned `clearedShows` count is correct. (The `reports`-row case is the non-cascade-FK regression; the `deferred_ingestions` case is the suppression-residue regression.)

- [ ] **Step 3: Write the FK-audit + drive-keyed-audit structural tests**
  - `resetValidationDataFkAudit.test.ts`: query `pg_constraint` for FKs to `public.shows` with `confdeltype not in ('c','n')`; assert every such table appears in the RPC's pre-`delete from shows` list (parse the migration SQL file text). Fails on a future non-cascade FK without a pre-delete.
  - `resetValidationDataDriveKeyedAudit.test.ts`: derive the table list at test time from `information_schema.columns where column_name='drive_file_id'`; assert each is in a registry constant with disposition `clear-via-cascade` (verify it IS an `on delete cascade` child via `pg_constraint`) | `clear-explicit` (verify it is in the RPC delete set) | `preserve(reason)`. Seed `revision_race_cooldowns` as a clean-reset regression. Per spec §8: `show_change_log`, `sync_holds`, `pending_snapshot_uploads`, `shows_pending_changes` = `clear-via-cascade`; `pending_syncs`, `pending_ingestions`, `deferred_ingestions`, `onboarding_scan_manifest`, `revision_race_cooldowns` = `clear-explicit`; `sync_log`/`sync_audit` = `clear-explicit` (true empty-state).

- [ ] **Step 4: Write the in-flight concurrency test** (`resetValidationDataConcurrency.test.ts`): T2 opens a tx, takes `pg_advisory_xact_lock(hashtext('show:'||did))` for an existing show + begins an UPDATE; T1 `reset_validation_data()` BLOCKS until T2 commits/rolls back (assert it does not return while T2 holds the lock). After T1 commits, every row that existed when the reset ran is deleted. Do NOT assert "stays empty" (spec D10).

- [ ] **Step 5: Run all five to verify they fail**

Run: `pnpm exec vitest run tests/db/destructiveResetGate.test.ts tests/db/resetValidationData.test.ts tests/db/resetValidationDataFkAudit.test.ts tests/db/resetValidationDataDriveKeyedAudit.test.ts tests/db/resetValidationDataConcurrency.test.ts`
Expected: FAIL (RPC/table do not exist).

- [ ] **Step 6: Write the migration** (`supabase/migrations/<ts>_validation_reset_rpc.sql`):

```sql
-- Gate table (migration-owned at enabled=false everywhere; only the enabled=true flip is out-of-band in validation).
create table if not exists public.destructive_reset_gate (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false
);
revoke all on table public.destructive_reset_gate from anon, authenticated, public;
grant all on table public.destructive_reset_gate to service_role;
alter table public.destructive_reset_gate enable row level security;  -- no policy => PostgREST deny-all
insert into public.destructive_reset_gate (id) values ('default') on conflict do nothing;

create or replace function public.assert_destructive_reset_enabled() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false)
  then raise exception 'destructive reset not enabled for this database'; end if;
end; $$;

create or replace function public.reset_validation_data() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_did text; v_cleared bigint;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false)
  then raise exception 'destructive reset not enabled for this database'; end if;

  -- invariant 2: per-show advisory locks over the sorted distinct affected-key set, BEFORE any mutation.
  for v_did in
    select drive_file_id from (
      select drive_file_id from public.shows
      union select drive_file_id from public.pending_syncs
      union select drive_file_id from public.pending_ingestions
      union select drive_file_id from public.deferred_ingestions
    ) u order by drive_file_id
  loop perform pg_advisory_xact_lock(hashtext('show:' || v_did)); end loop;

  select count(*) into v_cleared from public.shows;

  delete from public.reports;            -- non-cascade FK child (must precede shows)
  delete from public.shows;              -- FK cascade clears crew_members/hotels/rooms/transportation/contacts/
                                         -- shows_internal/show_share_tokens/sync_holds/show_change_log/
                                         -- pending_snapshot_uploads/shows_pending_changes (all on delete cascade)
  delete from public.pending_syncs;
  delete from public.pending_ingestions;
  delete from public.deferred_ingestions;
  delete from public.onboarding_scan_manifest;
  delete from public.revision_race_cooldowns;
  delete from public.sync_log;
  delete from public.sync_audit;
  delete from public.wizard_finalize_checkpoints;
  -- (add any clear-explicit table the Step-3 audit surfaced)
  delete from public.validation_state;

  update public.app_settings set
    pending_wizard_session_id = null, pending_wizard_session_at = null,
    pending_folder_id = null, pending_folder_name = null,
    pending_folder_set_by_email = null, pending_folder_set_at = null
  where id = 'default';

  return jsonb_build_object('clearedShows', v_cleared);
end; $$;

revoke all on function public.reset_validation_data() from public, anon;
grant execute on function public.reset_validation_data() to authenticated;
revoke all on function public.assert_destructive_reset_enabled() from public, anon;
grant execute on function public.assert_destructive_reset_enabled() to authenticated;
```
NOTE: verify each `delete from` target's wizard-session/checkpoint table name against the live schema during Step-3 audit (the spec names "wizard sessions/checkpoints" — confirm `wizard_finalize_checkpoints` is the table and whether a separate wizard-session table exists; add it to the clear-explicit deletes if so). Drop tables that the audit shows are cascade children from the explicit delete list.

- [ ] **Step 7: Apply locally + run the five tests + meta-tests**

```bash
psql "$LOCAL_DB_URL" -f supabase/migrations/<ts>_validation_reset_rpc.sql && psql "$LOCAL_DB_URL" -c "notify pgrst, 'reload schema';"
pnpm exec vitest run tests/db/destructiveResetGate.test.ts tests/db/resetValidationData.test.ts tests/db/resetValidationDataFkAudit.test.ts tests/db/resetValidationDataDriveKeyedAudit.test.ts tests/db/resetValidationDataConcurrency.test.ts
```
Expected: PASS. (Use the project's standard local-DB harness env var for `$LOCAL_DB_URL`.)

- [ ] **Step 8: Extend the two meta-tests**
  - `tests/db/postgrest-dml-lockdown.test.ts`: add a registry row for `destructive_reset_gate` (no DML grant + RLS-deny → all PostgREST DML fails). Run it.
  - `tests/auth/advisoryLockRpcDeadlock.test.ts`: add an assertion pinning `reset_validation_data()` as a sorted single-holder advisory taker (`order by drive_file_id` + `pg_advisory_xact_lock(hashtext('show:'||…))`, no nested SECURITY DEFINER re-acquire). Run it.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/<ts>_validation_reset_rpc.sql tests/db/destructiveResetGate.test.ts tests/db/resetValidationData.test.ts tests/db/resetValidationDataFkAudit.test.ts tests/db/resetValidationDataDriveKeyedAudit.test.ts tests/db/resetValidationDataConcurrency.test.ts tests/db/postgrest-dml-lockdown.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts
git commit -m "feat(db): destructive_reset_gate + reset_validation_data/assert RPCs (no-grant gate, advisory locks, FK-ordered deletes)"
```

---

## Task 3: Promote the validation-fixtures module into the app-importable tree

**Files:**
- Create: `lib/validation/fixtures.ts` (moved content of `scripts/lib/validation-fixtures.ts`: `R_COMBOS`, `SW_COMBOS`, `buildFixtures`, and their helper exports/types)
- Modify: `scripts/lib/validation-fixtures.ts` → re-export from `lib/validation/fixtures.ts` (or delete + re-point); `scripts/validation-reseed.ts:208` import path
- Test: `tests/validation/fixtures.test.ts` (new, light) + the existing reseed/validation tests must still pass

**Interfaces:**
- Produces: `buildFixtures(todayIso: string): <existing return type>`, `R_COMBOS`, `SW_COMBOS` from `@/lib/validation/fixtures`.

- [ ] **Step 1:** Move the module. `git mv scripts/lib/validation-fixtures.ts lib/validation/fixtures.ts` (or copy + re-export to keep `scripts/lib` import working). Update `scripts/validation-reseed.ts` to `import { buildFixtures } from "@/lib/validation/fixtures"` (verify the `@/` alias resolves in the scripts tsconfig; if scripts use relative paths, use the correct relative import). Update any other importer found via `grep -rn "validation-fixtures" scripts/ lib/ tests/`.
- [ ] **Step 2: Write a light test** asserting `buildFixtures("2026-06-22")` returns the 16-combo set and `R_COMBOS.length + SW_COMBOS.length === 16` (derive, don't hardcode the breakdown). Run it; expect PASS once the import resolves.
- [ ] **Step 3:** Run the existing validation-fixtures/reseed unit tests (`grep -rl "validation-fixtures\|buildFixtures" tests/`) to prove no regression. Run `pnpm exec tsc --noEmit`.
- [ ] **Step 4: Commit**

```bash
git add lib/validation/fixtures.ts scripts/lib/validation-fixtures.ts scripts/validation-reseed.ts tests/validation/fixtures.test.ts
git commit -m "refactor(validation): promote fixtures to lib/validation/fixtures (app-importable; CLI re-points, behavior unchanged)"
```

---

## Task 4: `mintFixtureCombos` shared reseed loop

**Files:**
- Create: `lib/validation/reseedFixtures.ts`
- Modify: `scripts/validation-reseed.ts` (the per-combo mint+finalize loop now calls `mintFixtureCombos`)
- Test: `tests/db/reseedFixtures.test.ts` (real-DB)

**Interfaces:**
- Consumes: `buildFixtures` from Task 3; the existing RPCs `mint_validation_fixture_atomic`, `validation_finalize_all_atomic`.
- Produces: `mintFixtureCombos(client: SupabaseClient, fixtures: ReturnType<typeof buildFixtures>): Promise<{ seeded: number }>` (loops the existing mint RPC per combo, then calls finalize once; mirrors `scripts/validation-reseed.ts:102-134`).

- [ ] **Step 1: Write the real-DB test:** against an empty local DB, build fixtures, call `mintFixtureCombos(serviceClient, fixtures)`; assert the seeded show count equals the fixtures' combo count (derive from `fixtures`, not a literal) and `validation_state` is populated. Run → FAIL (module missing).
- [ ] **Step 2: Implement** `mintFixtureCombos` by extracting the loop currently inline in `scripts/validation-reseed.ts` (each combo → `client.rpc("mint_validation_fixture_atomic", {...})` with `{ data, error }` destructure + throw on error; then one `client.rpc("validation_finalize_all_atomic", {...})`). Re-point the CLI to call it.
- [ ] **Step 3:** Run the test → PASS. Run the existing reseed CLI test (no behavior change). `pnpm exec tsc --noEmit`.
- [ ] **Step 4: Commit**

```bash
git add lib/validation/reseedFixtures.ts scripts/validation-reseed.ts tests/db/reseedFixtures.test.ts
git commit -m "feat(validation): mintFixtureCombos shared reseed loop (CLI + server action share one path)"
```

---

## Task 5: Catalog codes (§12.4 lockstep)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose — add 4 rows). **DO NOT run prettier on this file** (it is `.prettierignore`d; prettier mangles §12.4 → x1 divergence).
- Regenerate: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Modify: `lib/messages/catalog.ts` (4 matching rows)
- Test: x1 gate (`pnpm test:audit:x1-catalog-parity`)

**Interfaces:**
- Produces: `MessageCode`s `VALIDATION_RESET_NOT_ALLOWED`, `VALIDATION_RESET_NOT_ENABLED`, `VALIDATION_RESET_FAILED`, `VALIDATION_RESEED_FAILED`.

- [ ] **Step 1:** Read 3 existing §12.4 rows + their `lib/messages/catalog.ts` entries (e.g. `REAP_STALE_SESSIONS_FAILED`) to copy the exact column shape (code, dougFacing, crewFacing, helpfulContext, etc.).
- [ ] **Step 2:** Add the 4 rows to §12.4 prose with this admin-facing copy (adjust to match the catalog's tone/columns exactly):
  - `VALIDATION_RESET_NOT_ALLOWED` — dougFacing: "Data reset is only available on the validation environment."
  - `VALIDATION_RESET_NOT_ENABLED` — dougFacing: "Destructive reset isn't enabled for this database yet."
  - `VALIDATION_RESET_FAILED` — dougFacing: "The validation reset couldn't finish. Please try again."
  - `VALIDATION_RESEED_FAILED` — dougFacing: "Reseeding the validation fixtures couldn't finish. Please try again."
  (These are crew-invisible admin codes; set `crewFacing` per the catalog convention for admin-only codes — copy a sibling admin code's posture.)
- [ ] **Step 3:** `pnpm gen:spec-codes`; add the matching 4 rows to `lib/messages/catalog.ts` (same commit).
- [ ] **Step 4:** Run `pnpm test:audit:x1-catalog-parity` → PASS. Run `pnpm gen:internal-code-enums` + `pnpm test:audit:x2-no-raw-codes` if the codes need the internal-enum (check whether admin codes are in the x2 set; align with the sibling code).
- [ ] **Step 5: Commit** (all three layers together):

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts
git commit -m "feat(messages): VALIDATION_RESET_* catalog codes (§12.4 lockstep)"
```

---

## Task 6: Server actions

**Files:**
- Create: `app/admin/settings/_actions/validationReset.ts`
- Test: `tests/admin/validationResetAction.test.ts`
- Modify (meta-test): `tests/admin/_metaInfraContract.test.ts`

**Interfaces:**
- Consumes: `destructiveResetAllowed` (Task 1); `requireAdmin` (`@/lib/auth/requireAdmin`); the RPCs (Task 2); `buildFixtures` + `mintFixtureCombos` (Tasks 3–4); the session client (`createSupabaseServerClient`) + service-role client (`createSupabaseServiceRoleClient`) from `@/lib/supabase/server`; the codes (Task 5).
- Produces: `resetValidationDataAction(): Promise<{ ok:true; count:number } | { ok:false; code: MessageCode }>`; `reseedValidationFixturesAction(): Promise<same>`.

- [ ] **Step 1: Write the guard-refusal test** (`tests/admin/validationResetAction.test.ts`), split by layer (spec §8): (a) gates fail (`destructiveResetAllowed()` false — stub env) → `VALIDATION_RESET_NOT_ALLOWED`, and NO Supabase call (mock `createSupabaseServerClient`/`createSupabaseServiceRoleClient` and assert zero calls); (b) gates pass but the RPC raises gate-disabled → `VALIDATION_RESET_NOT_ENABLED`; reseed path does NOT construct the service-role client when the assert RPC raises. Mock the clients; assert `requireAdmin` is called first.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (`"use server"`):
  - `resetValidationDataAction`: `await requireAdmin()` → `if (!destructiveResetAllowed()) return { ok:false, code:"VALIDATION_RESET_NOT_ALLOWED" }` → session client `.rpc("reset_validation_data")`, destructure `{ data, error }`; if `error` message matches the gate-disabled raise → `VALIDATION_RESET_NOT_ENABLED`, else any error → `VALIDATION_RESET_FAILED`; on success `revalidatePath("/admin"); revalidatePath("/admin/settings"); return { ok:true, count: data.clearedShows }`.
  - `reseedValidationFixturesAction`: `requireAdmin` → gate → session client `.rpc("assert_destructive_reset_enabled")` (gate-disabled → `VALIDATION_RESET_NOT_ENABLED`); on success build the service-role client, `mintFixtureCombos(serviceClient, buildFixtures(<todayIso>))` (infra fault → `VALIDATION_RESEED_FAILED`); `revalidatePath` + `return { ok:true, count: seeded }`. Construct the service-role client ONLY after the assert passes.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5:** Add the two call sites to `tests/admin/_metaInfraContract.test.ts` (both actions destructure `{ data, error }`, distinguish returned vs thrown faults, map to the typed codes, no silent continue, service-role constructed only post-assert). Run it → PASS. `pnpm exec tsc --noEmit`.
- [ ] **Step 6: Commit**

```bash
git add app/admin/settings/_actions/validationReset.ts tests/admin/validationResetAction.test.ts tests/admin/_metaInfraContract.test.ts
git commit -m "feat(admin): reset + reseed server actions (triple-guarded; service-role behind assert gate)"
```

---

## Task 7: Maintenance UI — buttons + modals + wire into settings (OPUS)

**Files:**
- Create: `components/admin/MaintenanceResetButtons.tsx`
- Modify: `app/admin/settings/page.tsx` (render `<MaintenanceResetButtons />` inside the maintenance card when `destructiveResetAllowed()`, after `<ReapStaleSessionsButton />` at :228)
- Test: `tests/components/admin/maintenanceResetButtons.test.tsx`

**Interfaces:**
- Consumes: the two server actions (Task 6); `messageFor` (`@/lib/messages/lookup`); `MESSAGE_CATALOG`/`MessageCode` (`@/lib/messages/catalog`); `destructiveResetAllowed` (Task 1, called in the RSC page).

- [ ] **Step 1: Write the component test** (jsdom, `@vitest-environment jsdom`, `@testing-library/jest-dom/vitest`): (a) the page gate — render the settings maintenance region with `destructiveResetAllowed()` stubbed false → neither button present; stubbed true → both present. (b) Reset confirm is disabled until the user types `RESET` (fire input events). (c) Each of the 4 codes resolves to non-empty `dougFacing` (assert `messageFor(code).dougFacing` is a non-empty string for all four — guards invariant 5). (d) On `isPending` the confirm button is `disabled` (not self-disabled in onClick — per the React-19 form-action lesson).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `MaintenanceResetButtons.tsx` (`"use client"`), porting the idle→confirming→running→done/error state machine + catalog error lookup (`lookupDougFacing(code) ?? GENERIC_ERROR`) from `components/admin/ReapStaleSessionsButton.tsx`. Reset = destructive styling + a typed-confirm modal (input must equal `RESET` to enable confirm); Reseed = neutral styling + a simple two-step confirm. a11y: `aria-describedby` on the compact buttons, focus management on modal open/close, `disabled={isPending}`. Use `useTransition` for the action calls. Render success as a plain count ("N shows cleared" / "N shows seeded"). Use only `@theme` design tokens (no inline `tracking-[…]`, no raw hex).
- [ ] **Step 4:** Wire into `app/admin/settings/page.tsx`: compute `const canReset = destructiveResetAllowed()` in the RSC; render `{canReset && <MaintenanceResetButtons />}` inside the maintenance card. Pass NO secret props.
- [ ] **Step 5: Run → PASS.** `pnpm exec tsc --noEmit` + `pnpm exec prettier --check .`.
- [ ] **Step 6: Commit**

```bash
git add components/admin/MaintenanceResetButtons.tsx app/admin/settings/page.tsx tests/components/admin/maintenanceResetButtons.test.tsx
git commit -m "feat(admin): maintenance Reset + Reseed buttons (typed-confirm; render-gated to validation)"
```

---

## Task 8: Impeccable UI gate (OPUS, invariant 8)

- [ ] **Step 1:** Run `/impeccable critique` and `/impeccable audit` (v3 preflight gates: PRODUCT.md → DESIGN.md → register → preflight) on the Task-7 diff (`MaintenanceResetButtons.tsx` + the settings-page change + modals). Verify the buttons render (the dev/validation gate may hide them — render with `destructiveResetAllowed()` forced true in a local harness, or critique the component in isolation).
- [ ] **Step 2:** Fix every HIGH/CRITICAL finding, or defer via a `DEFERRED.md` entry with a concrete trigger. Record findings + dispositions for the PR description.
- [ ] **Step 3: Commit** any fixes (`fix(admin): impeccable findings on maintenance reset buttons`).

---

## Task 9: Migration reaches validation + manifest

- [ ] **Step 1:** `pnpm gen:schema-manifest` (introspects the local all-migrations-applied DB) and commit the regenerated `supabase/**generated**/schema-manifest.json` (must include `destructive_reset_gate`).
- [ ] **Step 2:** Apply the migration surgically to the validation project (per AGENTS.md / the deep-links lesson): read `TEST_DATABASE_URL` from the main checkout's `.env.local`, `psql "$TEST_DATABASE_URL" -f supabase/migrations/<ts>_validation_reset_rpc.sql`, then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. Verify the table + RPCs exist in validation. (The `enabled=true` flip is NOT done here — that is a separate, deliberate operator step the user performs when they want the buttons live.)
- [ ] **Step 3:** Commit the manifest:

```bash
git add supabase/**generated**/schema-manifest.json
git commit -m "chore(db): regen schema manifest for destructive_reset_gate (validation-schema-parity)"
```

---

## Self-review (run before adversarial)

1. **Spec coverage:** D1 (two buttons)→T7; D2 triple guard→T1/T2/T6/T7; D3 ref parser→T1; D4 gate table→T2; D5 reset scope→T2; D6 reset RPC→T2; D7/D7a reseed→T3/T4/T6; D8 confirm UX→T7; D9 codes→T5/T6; D10 advisory locks→T2. §8 tests→T1/T2/T6/T7. §9 meta-tests→T2/T6. All covered.
2. **Placeholder scan:** the only deferred specifics are the Step-3 audit-driven delete-list confirmation and the `<ts>` timestamp — both are explicit "verify against live schema" steps, not placeholders.
3. **Type consistency:** `destructiveResetAllowed`/`projectRefFromUrl` (T1) used in T6/T7; `mintFixtureCombos(client, fixtures)` (T4) used in T6; the 4 `VALIDATION_RESET_*` codes consistent across T5/T6/T7.

## Adversarial review (cross-model) — MANDATORY before execution handoff

After self-review, run the cross-model plan review (Codex via `codex exec`, the same path used for the spec) to APPROVE, then proceed to Execution Handoff.

## Execution Handoff

Subagent-Driven Development (Tasks 1–9; UI tasks 7–8 on Opus).
