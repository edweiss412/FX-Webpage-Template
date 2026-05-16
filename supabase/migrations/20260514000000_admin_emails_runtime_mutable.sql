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
  -- added_by / revoked_by hold auth.users(id) UUIDs for audit. R1 fix:
  -- no FK reference — auth.users `on delete set null` would conflict
  -- with the tightened revoke_atomicity CHECK (revoked_at not null
  -- requires revoked_by not null). The audit column stores the
  -- historical UUID; admin investigations join out-of-band.
  added_by    uuid,
  added_at    timestamptz not null default now(),
  revoked_by  uuid,
  revoked_at  timestamptz null,
  note        text null,
  constraint admin_emails_canonical_email
    check (email = lower(trim(email))),
  constraint admin_emails_revoke_atomicity
    check (
      (revoked_at is null and revoked_by is null)
      or (revoked_at is not null and revoked_by is not null)
    )
);

create index if not exists admin_emails_active_idx
  on public.admin_emails (email)
  where revoked_at is null;

-- R1 fix: drop the auth.users FK references (if a prior apply added
-- them). The `on delete set null` cascade conflicts with the tightened
-- revoke_atomicity CHECK that requires revoked_by to be non-null when
-- revoked_at is set.
alter table public.admin_emails
  drop constraint if exists admin_emails_added_by_fkey;
alter table public.admin_emails
  drop constraint if exists admin_emails_revoked_by_fkey;

-- R1 fix: tighten admin_emails_revoke_atomicity CHECK to require both
-- revoked_at AND revoked_by when revoked. Older deployments may have
-- the loose form (revoked_at without revoked_by); DROP IF EXISTS + ADD
-- replaces it idempotently. This ALTER runs on apply-twice safely.
alter table public.admin_emails
  drop constraint if exists admin_emails_revoke_atomicity;
alter table public.admin_emails
  add constraint admin_emails_revoke_atomicity
  check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  );

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

-- 5. Atomic mutation RPCs (C9 R1 HIGH + MEDIUM fixes) ----------------------
-- The application-side add/revoke flows were race-prone read-then-write
-- chains. Two concurrent self-revokes could leave the deployment with
-- zero admins; concurrent add/re-add could surface unique-constraint
-- conflicts as infra errors instead of the documented already_active /
-- ok branches. These RPCs own the atomic logic in Postgres so the JS
-- data layer is a thin RPC wrapper.
--
-- Both functions are SECURITY DEFINER so they can access admin_emails
-- regardless of the calling role's RLS posture (the calling Server
-- Action has already gated via requireAdminIdentity). They serialize
-- via a single advisory lock on hashtextextended('admin_emails', 0) so
-- mutations are mutually exclusive across processes.

-- Discriminated result is returned as (status text, email text,
-- previously_revoked_at timestamptz, row_email, row_added_by, ...).
-- Status values: 'ok' | 'already_active' | 're_add_required' |
-- 'last_admin_lockout' | 'invalid_email' (the JS layer maps these to
-- AdminEmailWriteOutcome).

create or replace function public.upsert_admin_email_rpc(
  p_email text,
  p_added_by uuid,
  p_note text,
  p_confirm_re_add boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_canonical text;
  v_existing public.admin_emails%rowtype;
  v_new public.admin_emails%rowtype;
begin
  -- Canonicalize at the boundary (defense-in-depth alongside the
  -- application-side canonicalize() call). Empty / whitespace-only
  -- input is the only branch this guards against.
  v_canonical := lower(btrim(coalesce(p_email, '')));
  if length(v_canonical) = 0 then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  -- Serialize concurrent mutations of the admin allow-list. A single
  -- key suffices — the table is small and contention is operator-rate.
  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  select * into v_existing
    from public.admin_emails
   where email = v_canonical
   for update;

  if found then
    if v_existing.revoked_at is null then
      return jsonb_build_object('status', 'already_active', 'email', v_canonical);
    end if;
    -- Existing row is revoked. Without explicit confirmation, surface
    -- the re-add prompt; the UI re-submits with confirm_re_add=true.
    if not coalesce(p_confirm_re_add, false) then
      return jsonb_build_object(
        'status', 're_add_required',
        'email', v_canonical,
        'previously_revoked_at', to_jsonb(v_existing.revoked_at)
      );
    end if;
    -- Reactivate: clear revoked_*, refresh added_*, replace note.
    update public.admin_emails
       set revoked_at = null,
           revoked_by = null,
           added_at = now(),
           added_by = p_added_by,
           note = p_note
     where email = v_canonical
       and revoked_at is not null
     returning * into v_new;
    return jsonb_build_object('status', 'ok', 'row', row_to_json(v_new));
  end if;

  -- Fresh row — INSERT under the advisory lock so a concurrent insert
  -- of the same email is serialized (the second caller sees the row
  -- and returns already_active above).
  insert into public.admin_emails (email, added_by, added_at, note)
  values (v_canonical, p_added_by, now(), p_note)
  returning * into v_new;
  return jsonb_build_object('status', 'ok', 'row', row_to_json(v_new));
end;
$$;

revoke all on function public.upsert_admin_email_rpc(text, uuid, text, boolean) from public;
grant execute on function public.upsert_admin_email_rpc(text, uuid, text, boolean)
  to authenticated, service_role;

create or replace function public.revoke_admin_email_rpc(
  p_email text,
  p_revoked_by uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_canonical text;
  v_actor_canonical text;
  v_other_active_count integer;
  v_row public.admin_emails%rowtype;
begin
  v_canonical := lower(btrim(coalesce(p_email, '')));
  if length(v_canonical) = 0 then
    return jsonb_build_object('status', 'invalid_email');
  end if;
  v_actor_canonical := lower(btrim(coalesce(p_actor_email, '')));

  -- Serialize against concurrent mutations. The count-then-update
  -- branch below would otherwise be race-prone (R1 HIGH).
  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  -- Self-revoke + last-admin lockout (amendment §5.5). The count is
  -- evaluated under the lock so a concurrent self-revoke by a peer
  -- cannot trick both into proceeding.
  if v_canonical = v_actor_canonical then
    select count(*) into v_other_active_count
      from public.admin_emails
     where revoked_at is null
       and email <> v_canonical;
    if v_other_active_count = 0 then
      return jsonb_build_object('status', 'last_admin_lockout', 'email', v_canonical);
    end if;
  end if;

  -- Guarded UPDATE. Idempotent on re-submit (zero rows updated → still
  -- returns ok with the current row state, which will already show
  -- revoked_at set).
  update public.admin_emails
     set revoked_at = now(),
         revoked_by = p_revoked_by
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

revoke all on function public.revoke_admin_email_rpc(text, uuid, text) from public;
grant execute on function public.revoke_admin_email_rpc(text, uuid, text)
  to authenticated, service_role;
