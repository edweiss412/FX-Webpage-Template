-- M9 C9 / M2-D1 — admin allow-list runtime-mutable
-- Spec amendment: docs/superpowers/specs/amendments/2026-05-14-admin-allowlist-runtime-mutable.md
--
-- Replaces the migration-hardcoded `array['dlarson@fxav.net',
-- 'edweiss412@gmail.com']` literal in `public.is_admin()` with a
-- runtime-mutable `public.admin_emails` table lookup.
--
-- The JWT-role arm of `public.is_admin()` is preserved verbatim — it
-- remains the Supabase Auth claim path (`app_metadata.role = 'admin'`).
--
-- Apply-twice idempotency: every DDL uses CREATE ... IF NOT EXISTS or
-- DROP ... IF EXISTS + CREATE; seed uses ON CONFLICT DO NOTHING.

-- 1. admin_emails table ------------------------------------------------------

create table if not exists public.admin_emails (
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

create index if not exists admin_emails_active_idx
  on public.admin_emails (email)
  where revoked_at is null;

-- 2. RLS on admin_emails -----------------------------------------------------
-- The admin_only policy gates SELECT/INSERT/UPDATE/DELETE on
-- public.is_admin(). Recursion is broken by the SECURITY DEFINER on
-- public.is_admin() — the function runs with owner privileges and
-- bypasses RLS on admin_emails for the policy check itself.

alter table public.admin_emails enable row level security;

drop policy if exists admin_only on public.admin_emails;
create policy admin_only on public.admin_emails
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Seed --------------------------------------------------------------------
-- Insert the literal seed admins so deployments aren't admin-less after
-- a fresh `supabase db reset`. ON CONFLICT DO NOTHING makes this safe
-- to re-apply (idempotent). added_by = NULL marks the row as a seed,
-- which the UI surfaces as "Seed admin · Added at deploy".

insert into public.admin_emails (email, added_by, added_at)
values
  ('dlarson@fxav.net', null, now()),
  ('edweiss412@gmail.com', null, now())
on conflict (email) do nothing;

-- 4. Replacement public.is_admin() ------------------------------------------
-- The JWT-role arm is preserved verbatim (line 1 of the SELECT below).
-- The hardcoded array is replaced with an EXISTS subquery against
-- admin_emails filtered on revoked_at IS NULL.
--
-- SECURITY DEFINER + search_path pinning — same posture as the prior
-- function (supabase/migrations/20260501002000_rls_policies.sql:23-37).

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
