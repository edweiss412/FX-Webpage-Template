# Spec amendment — §14.3 admin allow-list mechanism: runtime-mutable

**Date:** 2026-05-14
**Cluster:** M9 C9 (M2-D1 closure)
**Status:** Ratified — supersedes the §14.3:3290 `ADMIN_EMAILS` env-var entry and the migration-hardcoded array in `public.is_admin()` (`supabase/migrations/20260501002000_rls_policies.sql:23-37`).

---

## What changes

The admin allow-list moves from a migration-hardcoded `text[]` literal inside `public.is_admin()` to a runtime-mutable `public.admin_emails` table. Operators add and revoke admins via `/admin/settings/admins` without a code deploy.

The JWT-role arm of `public.is_admin()` is **preserved verbatim** — it remains the Supabase Auth claim path (`app_metadata.role = 'admin'`).

## Authoritative shape

### `public.admin_emails` table

```sql
create table public.admin_emails (
  email       text primary key,
  added_by    uuid references auth.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  revoked_by  uuid references auth.users(id) on delete set null,
  revoked_at  timestamptz null,
  note        text null,
  constraint admin_emails_canonical_email
    check (email = lower(trim(email))),
  constraint admin_emails_revoke_atomicity
    check (
      (revoked_at is null and revoked_by is null)
      or (revoked_at is not null)
    )
);

create index admin_emails_active_idx
  on public.admin_emails (email)
  where revoked_at is null;
```

- `email` column is canonicalized at every boundary. Inline `lower(trim(...))` CHECK is the safety net per AGENTS.md invariant 3 (`lib/email/canonicalize.ts` is the primary mechanism on the application side).
- `revoke_atomicity` CHECK guarantees `revoked_by` and `revoked_at` are either both NULL (active) or both NOT NULL (revoked) — prevents partial-revocation rows.
- Partial index on active rows accelerates the common predicate `WHERE revoked_at IS NULL` consumed by `is_admin()` and the page list query.

### Replacement `public.is_admin()`

```sql
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or exists (
           select 1
             from public.admin_emails ae
            where ae.email = public.auth_email_canonical()
              and ae.revoked_at is null
         );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
```

`SECURITY DEFINER` runs the function with the function-owner's permissions, bypassing RLS on `admin_emails` for the policy check. This is the same pattern existing `can_read_show` uses (`supabase/migrations/20260501002000_rls_policies.sql:41-58`) and breaks the recursion that would otherwise occur (RLS on `admin_emails` calls `is_admin()` which reads `admin_emails`).

### RLS on `admin_emails`

```sql
alter table public.admin_emails enable row level security;

create policy admin_only on public.admin_emails
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

Single `FOR ALL` policy mirrors the 21-table Class A pattern (per M9 handoff §A.f). Admin-only for SELECT/INSERT/UPDATE/DELETE; non-admin gets zero rows + permission denied on writes.

### Initial seed

```sql
insert into public.admin_emails (email, added_by, added_at)
values
  ('dlarson@fxav.net', null, now()),
  ('edweiss412@gmail.com', null, now())
on conflict (email) do nothing;
```

`ON CONFLICT DO NOTHING` makes the seed idempotent (`supabase db reset` runs migrations twice without error). `added_by = NULL` marks the seed admins so the UI can render "Seed admin · Added at deploy" (§6.2 of the shape brief).

## Re-add semantics

Re-add of a previously-revoked email **UPDATEs the existing row**:

- `revoked_at` → NULL
- `revoked_by` → NULL
- `added_at` → now()
- `added_by` → current actor's auth.uid
- `note` → optional new note (replaces any prior note)

Implementation:

```sql
INSERT INTO public.admin_emails (email, added_by, added_at, note)
VALUES ($1, $2, now(), $3)
ON CONFLICT (email) DO UPDATE SET
  revoked_at = NULL,
  revoked_by = NULL,
  added_at = excluded.added_at,
  added_by = excluded.added_by,
  note = excluded.note
WHERE admin_emails.revoked_at IS NOT NULL;
```

The `WHERE` clause refuses re-add of an already-active row. Idempotent for re-clicks; clear "already active" error for double-add.

## Last-admin-lockout refusal contract

`canRevokeAdmin(email)` returns false when:

1. The email's row is the only `revoked_at IS NULL` row, AND
2. The actor is revoking themselves (matches `auth_email_canonical()`).

Server Action throws `LastAdminLockoutError` → UI catches → renders `messageFor('LAST_ADMIN_LOCKOUT_REFUSED')`.

If the actor is NOT revoking themselves, they CAN revoke the last admin — defense against malice is out of scope for v1.

## Cascade — best-effort, session expires naturally

Revoke does NOT invalidate Supabase Auth sessions:

- The next RLS-gated SELECT/UPDATE/INSERT/DELETE on admin-only tables fails immediately (within ms — RLS evaluates per-statement).
- Currently-loaded admin pages show no new data on next fetch.
- Page-level unauthorized states render on next navigation.
- The auth session itself remains valid until natural expiry; non-admin-gated access (e.g., `/me` if the user is also a crew member) is preserved.

The security claim is "no new admin actions after revoke," which is what RLS enforces.

## §14.3 row replacement

The `ADMIN_EMAILS` row at spec §14.3:3290 reads, post-amendment:

> **`ADMIN_EMAILS`** — _RETIRED 2026-05-14 via M9 C9 (M2-D1). Was never consumed by any code path; the live `public.is_admin()` array was migration-hardcoded. Admin allow-list is now table-driven via `public.admin_emails` with the initial admins seeded by the C9 migration. Operator adds/revokes via `/admin/settings/admins` UI._

`.env.local.example:26` removes the `ADMIN_EMAILS=...` line.

## Bootstrap protocol

The migration's seed `INSERT` is the SOLE bootstrap path. For deployments needing different initial admins:

1. Apply migrations (seed inserts the literal admins).
2. Sign in as a seed admin (or use Supabase Studio JWT-role override).
3. Add the deployment's actual admins via `/admin/settings/admins`.
4. Revoke the literal seed admins (subject to last-admin-lockout protection).

OR: hand-edit the migration's seed `INSERT` in a one-shot patch before first apply.

`supabase/seed.sql` does NOT exist in this repo; `supabase/seed.ts` is invoked manually (`pnpm db:seed`) and is fixture-only. No deploy-time TypeScript bootstrap entry point exists, so an env-var-driven initial admin would no-op in normal flow — the env var is dropped.

## Apply-twice idempotency

- `CREATE TABLE IF NOT EXISTS admin_emails`
- `CREATE OR REPLACE FUNCTION public.is_admin`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (idempotent)
- `DROP POLICY IF EXISTS admin_only ON admin_emails; CREATE POLICY admin_only ...`
- Seed `INSERT ... ON CONFLICT DO NOTHING`

`supabase db reset` twice in a row produces identical schema + identical seed rows.

## Behavioral parity

The 21 admin-gated tables (per M9 handoff §A.f Class A list) all consume `is_admin()` via RLS. The C9 migration replaces only the function body — the policy texts that call `public.is_admin()` are unchanged. `tests/db/schema-introspection.test.ts` is the regression gate for policy text drift; `tests/db/admin-emails.test.ts` (NEW) is the regression gate for `is_admin()` return-value parity (admin → true, revoked admin → false, JWT-role admin → true, non-admin → false).

## Catalog row

Add to `lib/messages/catalog.ts`:

```ts
LAST_ADMIN_LOCKOUT_REFUSED: {
  code: "LAST_ADMIN_LOCKOUT_REFUSED",
  surface: "admin",
  dougFacing: "You can't revoke the last administrator. Add another admin first, then revoke this one.",
  crewFacing: null,
  helpfulContext: null,
  severity: "error",
}
```

## Migration filename

`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql` (NEW).
