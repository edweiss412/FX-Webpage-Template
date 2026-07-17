-- Wizard blocker in-wizard resolution (2026-07-16 spec §3.2): the wizard resolve-blocker
-- route's privileged postgres.js connection has no JWT, so is_admin() (which reads
-- auth.jwt()) would return false if it called unarchive_show directly. Extract the
-- archived->held transition into a lock-free, gate-free internal helper both the
-- Dashboard RPC (self-locked, is_admin()-gated) and the wizard route (route-locked,
-- HTTP-gated via requireAdminIdentity) can call by ownership, needing no grant.
--
-- Body is the EXACT transition SQL of unarchive_show (20260602000002_...:22-41) minus
-- the advisory lock and the is_admin() gate.
create or replace function public._unarchive_show_apply(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text; v_archived boolean;
begin
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
  select archived into v_archived from public.shows where id = p_show_id;
  if not v_archived then return false; end if;
  update public.shows
     set archived = false, published = false, archived_at = null, requires_resync = true,
         picker_epoch = picker_epoch + 1, picker_epoch_bumped_at = clock_timestamp()
   where id = p_show_id;
  update public.show_share_tokens
     set share_token = encode(extensions.gen_random_bytes(32),'hex'), rotated_at = clock_timestamp()
   where show_id = p_show_id;
  delete from public.pending_syncs       where drive_file_id = v_drive and wizard_session_id is null;
  delete from public.pending_ingestions  where drive_file_id = v_drive and wizard_session_id is null;
  delete from public.deferred_ingestions where drive_file_id = v_drive and wizard_session_id is null;
  return true;
end $$;
-- Grant to NO role (Codex R1 F1 + R4 F1): callable ONLY by ownership (unarchive_show's
-- delegate call, and the wizard route's owner postgres.js connection). NOT even
-- service_role — a service_role grant would re-expose the gate-free transition through
-- any service-role PostgREST/RPC path, bypassing requireAdminIdentity + session-membership
-- + archived-state + per-show-lock checks.
revoke all on function public._unarchive_show_apply(uuid) from public, anon, authenticated, service_role;

-- Refactor unarchive_show to delegate (behavior-preserving: same signature, gate, lock,
-- grant, boolean contract). Return-type-preserving create-or-replace is fine here (the
-- signature and return type are unchanged from 20260602000002).
create or replace function public.unarchive_show(p_show_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_drive text;
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='forbidden', hint='unarchive_show is admin-only';
  end if;
  select drive_file_id into v_drive from public.shows where id = p_show_id;
  if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
  return public._unarchive_show_apply(p_show_id);
end $$;
revoke all on function public.unarchive_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.unarchive_show(uuid) to authenticated;
