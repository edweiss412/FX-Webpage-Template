-- 20260621000000_revoke_admin_refuse_self_revoke.sql (M12.5-DEF-1)
--
-- Defense-in-depth: refuse self-revoke at the RPC / DB boundary.
--
-- Background: M12.5 added a Server-Action-layer guard so an admin can
-- never revoke their OWN access (app/admin/settings/admins/actions.ts —
-- the UI also omits the Revoke control on the actor's own row). But the
-- Server Action is only one entry point; a hand-forged PostgREST
-- `rpc('revoke_admin_email_rpc', ...)` call by a signed-in admin (an
-- admin self-harming via a forged request, or a future code path that
-- forgets the Server-Action guard) would still reach the RPC. This
-- migration pushes the refusal down to the SECURITY DEFINER body so the
-- DB is the authoritative trust boundary.
--
-- Change: the prior self-revoke branch counted OTHER active admins and
-- only refused (status='last_admin_lockout') when zero others remained —
-- i.e. self-revoke WITH peers was ALLOWED. M12.5-DEF-1 makes self-revoke
-- UNCONDITIONALLY refused regardless of peer count, returning the new
-- status='self_revoke_forbidden'. The v_other_active_count peer-count
-- branch is removed (the variable is dropped from the declaration).
--
-- Self-revoke is determined by comparing the canonical target email to
-- the actor's canonical email (public.auth_email_canonical()), both
-- derived from auth.* inside the SECURITY DEFINER body so a forged
-- caller-supplied actor cannot dodge the check.
--
-- Other-revoke (a rogue admin revoking a PEER, including the last
-- remaining peer) stays ALLOWED — that is by design per spec amendment
-- §5.5 + §11 anti-goal and is unchanged here.
--
-- Idempotent: CREATE OR REPLACE keeps the existing (text) signature; the
-- grants are re-stated so a fresh apply (tables/ before migrations/)
-- lands in a consistent state. Apply locally then
-- `notify pgrst, 'reload schema';`.

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
  -- revoked_at set).
  update public.admin_emails
     set revoked_at = now(),
         revoked_by = v_actor_uid
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
