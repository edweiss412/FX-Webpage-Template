-- Phase 3 — MI-11 gate RPCs: mi11_reject_hold + mi11_approve_hold (+ _mi11_collision_group).
-- Admin-path, lock-taking SECURITY DEFINER RPCs that resolve an open mi11_pending hold.
--
-- LOCK ORDER (resolution #15 / PF11 CRITICAL — deadlock-class, M5 R20): every RPC does
--   (1) is_admin() gate FIRST; (2) NON-locking read of the hold to discover drive_file_id;
--   (3) pg_advisory_xact_lock(hashtext('show:'||drive_file_id)); (4) RE-select FOR UPDATE +
--   RE-validate. Advisory lock BEFORE any FOR UPDATE — never the reverse.
--
-- STALENESS (resolution #26 / PF40): the feed-rendered base_modified_time is submitted back as
--   p_expected_base_modified_time. Reject: base IS DISTINCT FROM expected → MI11_TARGET_MOVED.
--   Approve: observed IS DISTINCT FROM base OR base IS DISTINCT FROM expected → MI11_TARGET_MOVED.
--
-- GRANTS (resolution #11): SECURITY DEFINER; revoke from public/anon/authenticated/service_role;
--   grant execute to authenticated only; body gates on public.is_admin(); created_by stamped via
--   public.auth_email_canonical() (the repo's canonical authed-admin-email function; is_admin() reads
--   the same JWT). NOT granted to service_role.

-- ---------------------------------------------------------------------------
-- mi11_reject_hold(p_hold_id, p_expected_base_modified_time)
-- Convert a pending hold → disposition-appropriate undo_override + write a reject log.
-- ---------------------------------------------------------------------------
create or replace function public.mi11_reject_hold(
  p_hold_id uuid,
  p_expected_base_modified_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold      public.sync_holds%rowtype;
  v_disp      text;
  v_kind      text;     -- structural change_kind
  v_summary   text;
  v_baseline  jsonb;
  v_actor     text := public.auth_email_canonical();
begin
  -- (1) admin gate FIRST.
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden', hint = 'mi11_reject_hold is admin-only';
  end if;

  -- (2) NON-locking read to discover drive_file_id / show_id (+ early no-row/kind pre-check).
  select * into v_hold from public.sync_holds where id = p_hold_id;
  if not found or v_hold.kind <> 'mi11_pending' then
    return jsonb_build_object('ok', false, 'code', 'MI11_HOLD_ALREADY_RESOLVED');
  end if;

  -- (3) advisory lock BEFORE any row lock.
  perform pg_advisory_xact_lock(hashtext('show:' || v_hold.drive_file_id));

  -- (4) RE-select FOR UPDATE under the lock + RE-validate.
  select * into v_hold from public.sync_holds where id = p_hold_id for update;
  if not found or v_hold.kind <> 'mi11_pending' then
    return jsonb_build_object('ok', false, 'code', 'MI11_HOLD_ALREADY_RESOLVED');
  end if;

  -- (4a) feed-token staleness guard (PF40) — base must equal what the admin SAW.
  if v_hold.base_modified_time is distinct from p_expected_base_modified_time then
    return jsonb_build_object('ok', false, 'code', 'MI11_TARGET_MOVED');
  end if;

  -- (5) disposition-aware conversion — READ disposition BEFORE clearing proposed_value (PF30).
  v_disp := v_hold.proposed_value->>'disposition';

  if v_disp = 'email_change' then
    v_kind := 'crew_email_changed';
    v_summary := 'Email change for ' || v_hold.entity_key || ' was rejected (kept the existing email)';
    update public.sync_holds
       set kind = 'undo_override', domain = 'crew_email', proposed_value = null
     where id = p_hold_id;
  elsif v_disp = 'rename' then
    v_kind := 'crew_renamed';
    v_baseline := jsonb_build_object(
      'kind', 'rename',
      'suppressed_added', jsonb_build_object(
        'name', v_hold.proposed_value->>'name',
        'email', v_hold.proposed_value->>'email'
      )
    );
    v_summary := 'Rename of ' || v_hold.entity_key || ' was rejected (kept the existing name)';
    update public.sync_holds
       set kind = 'undo_override',
           domain = 'crew_identity',
           held_value = v_hold.held_value || jsonb_build_object('baseline', v_baseline),
           proposed_value = null
     where id = p_hold_id;
  elsif v_disp = 'removal' then
    v_kind := 'crew_removed';
    v_baseline := jsonb_build_object('kind', 'removal');
    v_summary := 'Removal of ' || v_hold.entity_key || ' was rejected (kept the crew member)';
    update public.sync_holds
       set kind = 'undo_override',
           domain = 'crew_identity',
           held_value = v_hold.held_value || jsonb_build_object('baseline', v_baseline),
           proposed_value = null
     where id = p_hold_id;
  else
    -- shape CHECK should prevent this, but never write an MI-* / unknown change_kind.
    return jsonb_build_object('ok', false, 'code', 'MI11_HOLD_ALREADY_RESOLVED');
  end if;

  insert into public.show_change_log
    (show_id, drive_file_id, source, change_kind, entity_ref, summary,
     before_image, after_image, status, created_by)
  values
    (v_hold.show_id, v_hold.drive_file_id, 'mi11_reject', v_kind, v_hold.entity_key, v_summary,
     v_hold.held_value, null, 'rejected', v_actor);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mi11_reject_hold(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.mi11_reject_hold(uuid, timestamptz) to authenticated;
