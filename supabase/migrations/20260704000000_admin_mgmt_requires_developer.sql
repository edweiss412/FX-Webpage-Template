-- Part B (spec 2026-07-04 §3.2): admin-roster mutation is DEVELOPER-only.
-- CREATE OR REPLACE upsert_admin_email_rpc + revoke_admin_email_rpc, changing ONLY
-- the actor authorization from is_admin() to a TABLE-BACKED active-developer check
-- (parity with set_admin_developer_rpc — never the OR-based public.is_developer(),
-- whose JWT arm must not authorize a membership mutation). The check appears BOTH
-- pre-lock (fast reject) AND post-lock (TOCTOU re-check: a developer concurrently
-- revoked while parked on the advisory lock must not complete one more mutation).
-- Idempotent (create or replace), apply-twice safe. No table-grant change (PostgREST
-- DML lockdown intact). Advisory lock topology unchanged (sole holder, advisory-then-row-lock).

create or replace function public.upsert_admin_email_rpc(
  p_email text,
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
  v_actor_uid uuid;
  v_existing public.admin_emails%rowtype;
  v_new public.admin_emails%rowtype;
begin
  -- Part B (§3.2): admin_emails mutation is DEVELOPER-only. Table-backed actor
  -- check (NOT public.is_developer(), whose JWT arm must never authorize a
  -- membership mutation). Fast-reject BEFORE the advisory lock. The added_by
  -- column is derived from auth.uid() here (not trusted from a caller param) so
  -- a forged request can't spoof the actor identity.
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = public.auth_email_canonical()
      and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'permission denied: admin_emails mutation requires developer'
      using errcode = '42501';
  end if;
  v_actor_uid := auth.uid();

  -- Canonicalize at the boundary (defense-in-depth alongside the
  -- application-side canonicalize() call). R6 fix: also validate
  -- email shape so non-email strings (e.g., "x", "/") can't land in
  -- the table and inflate the last-admin-lockout active count. The
  -- regex matches local@domain.tld pragmatically — same shape as
  -- the table's admin_emails_email_shape CHECK so the rejection is
  -- consistent at both layers.
  v_canonical := lower(btrim(coalesce(p_email, '')));
  if length(v_canonical) = 0
     or v_canonical !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  -- Serialize concurrent mutations of the admin allow-list. A single
  -- key suffices — the table is small and contention is operator-rate.
  perform pg_advisory_xact_lock(hashtextextended('admin_emails', 0));

  -- Post-lock re-check (TOCTOU): re-read committed actor status under the lock
  -- before any row read/update. A developer revoked while parked on the advisory
  -- lock must not complete one more mutation with stale authorization.
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = public.auth_email_canonical()
      and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'permission denied: admin_emails mutation requires developer'
      using errcode = '42501';
  end if;

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
           added_by = v_actor_uid,
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
  values (v_canonical, v_actor_uid, now(), p_note)
  returning * into v_new;
  return jsonb_build_object('status', 'ok', 'row', row_to_json(v_new));
end;
$$;

-- R2 fix: signature changed (removed p_added_by — derived from
-- auth.uid() inside SECURITY DEFINER body). Drop the prior signature
-- if a previous apply registered it so the new function isn't
-- shadowed.
drop function if exists public.upsert_admin_email_rpc(text, uuid, text, boolean);
revoke all on function public.upsert_admin_email_rpc(text, text, boolean) from public;
grant execute on function public.upsert_admin_email_rpc(text, text, boolean)
  to authenticated, service_role;

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
  -- Part B (§3.2): admin_emails mutation is DEVELOPER-only. Table-backed actor
  -- check (NOT public.is_developer(), whose JWT arm must never authorize a
  -- membership mutation). Fast-reject BEFORE the advisory lock. Actor identity
  -- (uid + canonical email for the self-revoke check) is derived from auth.* so
  -- a forged caller-supplied actor can't trigger an "other-revoke" treatment of
  -- their own revoke.
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = public.auth_email_canonical()
      and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'permission denied: admin_emails mutation requires developer'
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

  -- Post-lock re-check (TOCTOU): re-read committed actor status under the lock
  -- before any row read/update. A developer revoked while parked on the advisory
  -- lock must not complete one more mutation with stale authorization.
  if not exists (
    select 1 from public.admin_emails ae
    where ae.email = public.auth_email_canonical()
      and ae.revoked_at is null and ae.is_developer
  ) then
    raise exception 'permission denied: admin_emails mutation requires developer'
      using errcode = '42501';
  end if;

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
