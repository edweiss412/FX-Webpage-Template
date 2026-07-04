-- Developer tier: is_developer sub-role of admin (spec 2026-07-03-developer-tier §4).
-- Additive, apply-twice idempotent. No supabase/tables split exists, so no
-- transitional inline-CHECK parity concern.

alter table public.admin_emails
  add column if not exists is_developer boolean not null default false;

-- A developer bit may only be set on an ACTIVE (non-revoked) row.
alter table public.admin_emails
  drop constraint if exists admin_emails_developer_requires_active;
alter table public.admin_emails
  add constraint admin_emails_developer_requires_active
  check (not (is_developer and revoked_at is not null));

-- Bootstrap: force the deploy-owner identity to an ACTIVE developer, then a
-- hard tripwire so a zero-developer state can never silently ship (spec §4.2).
insert into public.admin_emails (email, added_by, added_at, is_developer)
values ('edweiss412@gmail.com', null, now(), true)
on conflict (email) do update
  set is_developer = true, revoked_at = null, revoked_by = null;

do $$
begin
  if not exists (
    select 1 from public.admin_emails where revoked_at is null and is_developer
  ) then
    raise exception 'developer-tier bootstrap left zero active developers';
  end if;
end $$;

-- is_developer(): mirror is_admin()'s posture. Email arm => active developer row.
-- JWT arm (test-harness only) => role=admin AND developer=true (enforces
-- developer ⟹ admin in the primitive; §2/§4.3).
create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
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
