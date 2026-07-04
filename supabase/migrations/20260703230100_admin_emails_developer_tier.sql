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

-- Developer-bit mutation. Authorization is TABLE-BACKED on the actor (NOT
-- is_developer(), whose JWT arm must never authorize a membership mutation; R9).
-- Advisory lock BEFORE the row lock; re-check the table-backed actor status
-- UNDER the lock before the write (closes the cross-demotion TOCTOU race; R8).
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
begin
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = v_actor_canonical and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_canonical is null or v_canonical = '' then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = v_actor_canonical and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_is_developer = false and v_canonical = v_actor_canonical then
    return jsonb_build_object('status', 'self_developer_demote_forbidden', 'email', v_canonical);
  end if;

  perform 1 from public.admin_emails
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

-- Revoke also clears the developer bit (spec §4.5). CREATE OR REPLACE of the
-- current revoke body (20260621000000): the ONLY change is the UPDATE SET, which
-- now also sets is_developer=false so a revoked row can never retain the bit
-- (otherwise admin_emails_developer_requires_active would reject the revoke).
-- Everything else — is_admin() gate, unconditional self-revoke refusal, the
-- advisory lock, grants — is preserved verbatim.
create or replace function public.revoke_admin_email_rpc(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_canonical text;
  v_actor_uid uuid;
  v_actor_canonical text;
  v_row public.admin_emails%rowtype;
begin
  -- R2 CRITICAL FIX: gate inside the SECURITY DEFINER boundary.
  -- Without this any signed-in non-admin could revoke peers. Actor
  -- identity (uid + canonical email for self-revoke check) is derived
  -- from auth.* so a forged caller-supplied actor can't trigger an
  -- "other-revoke" treatment of their own revoke.
  if not public.is_admin() then
    raise exception 'permission denied: admin_emails mutation requires is_admin()'
      using errcode = '42501';
  end if;
  v_actor_uid := auth.uid();
  v_actor_canonical := public.auth_email_canonical();

  v_canonical := lower(btrim(coalesce(p_email, '')));
  if length(v_canonical) = 0 then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  -- Serialize against concurrent mutations (kept for parity with the
  -- upsert path; the self-revoke refusal below is now unconditional so
  -- there is no longer a count-then-update race to protect, but the
  -- lock remains cheap and keeps the two RPCs symmetric).
  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  -- M12.5-DEF-1: an admin can NEVER revoke their OWN access. This is
  -- refused UNCONDITIONALLY here (no peer-count branch) — the closest
  -- "can't revoke this row" outcome and precisely the lockout vector.
  -- Other-revoke (rogue admin revoking a peer, even the last peer) stays
  -- allowed by design (amendment §5.5 + §11 anti-goal).
  if v_canonical = v_actor_canonical then
    return jsonb_build_object('status', 'self_revoke_forbidden', 'email', v_canonical);
  end if;

  -- Guarded UPDATE. Idempotent on re-submit (zero rows updated → still
  -- returns ok with the current row state, which will already show
  -- revoked_at set). Developer-tier: also clears is_developer so the
  -- revoked row satisfies admin_emails_developer_requires_active.
  update public.admin_emails
     set revoked_at = now(),
         revoked_by = v_actor_uid,
         is_developer = false
   where email = v_canonical
     and revoked_at is null
   returning * into v_row;

  if not found then
    select * into v_row from public.admin_emails where email = v_canonical;
    if not found then
      -- Email never existed; treat as already-not-an-admin. The Server
      -- Action maps this to the no-op success branch.
      return jsonb_build_object('status', 'ok', 'row', null);
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'row', row_to_json(v_row));
end;
$$;

revoke all on function public.revoke_admin_email_rpc(text) from public;
grant execute on function public.revoke_admin_email_rpc(text)
  to authenticated, service_role;
