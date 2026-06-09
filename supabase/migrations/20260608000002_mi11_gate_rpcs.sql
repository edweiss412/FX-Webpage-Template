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

-- ---------------------------------------------------------------------------
-- _mi11_collision_group(p_show_id, p_hold_id) → uuid[] of the closed group's hold ids
-- (including the submitted hold), or NULL if the group is NON-CLOSEABLE.
--
-- Directed transitive closure over {email, name} targets (PF29 + Task 3.4). For each axis where the
-- proposed value DIFFERS from the row's own current value (satisfied self-edges for unchanged
-- columns are skipped), find the live owner of that target value. If the owner is covered by an open
-- mi11_pending hold whose proposed_value VACATES that exact value → add to the group + recurse; else
-- → NON-CLOSEABLE (return NULL). Covers LIVE-owner chains only; suppressed distinct-entity rows are
-- handled by the reservation_collisions guard, not here. A removal hold vacates BOTH name and email.
-- ---------------------------------------------------------------------------
create or replace function public._mi11_collision_group(p_show_id uuid, p_hold_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group   uuid[] := array[]::uuid[];
  v_work    uuid[];
  v_cur     uuid;
  v_hold    public.sync_holds%rowtype;
  v_disp    text;
  v_axis    text;
  v_target  text;
  v_self    text;
  v_owner   public.crew_members%rowtype;
  v_owner_hold public.sync_holds%rowtype;
  v_owner_vacates boolean;
begin
  v_work := array[p_hold_id];
  while array_length(v_work, 1) is not null loop
    v_cur := v_work[1];
    v_work := v_work[2:];
    if v_cur = any(v_group) then
      continue;
    end if;
    v_group := v_group || v_cur;

    select * into v_hold from public.sync_holds where id = v_cur and show_id = p_show_id;
    if not found or v_hold.kind <> 'mi11_pending' then
      return null;
    end if;
    v_disp := v_hold.proposed_value->>'disposition';
    if v_disp = 'removal' then
      continue;  -- vacates its row; claims no target → no outgoing edge.
    end if;

    foreach v_axis in array array['email','name'] loop
      v_target := v_hold.proposed_value->>v_axis;
      if v_target is null then
        continue;
      end if;
      if v_axis = 'name' then
        v_self := v_hold.entity_key;
      else
        select cm.email into v_self from public.crew_members cm
         where cm.show_id = p_show_id and cm.name = v_hold.entity_key;
      end if;
      if v_target is not distinct from v_self then
        continue;  -- satisfied self-edge (unchanged column).
      end if;

      if v_axis = 'name' then
        select * into v_owner from public.crew_members cm
         where cm.show_id = p_show_id and cm.name = v_target;
      else
        select * into v_owner from public.crew_members cm
         where cm.show_id = p_show_id and cm.email = v_target;
      end if;
      if not found then
        continue;  -- target free → no edge.
      end if;
      if v_owner.name = v_hold.entity_key then
        continue;
      end if;

      select * into v_owner_hold from public.sync_holds
       where show_id = p_show_id and entity_key = v_owner.name and kind = 'mi11_pending';
      if not found then
        return null;  -- chain terminates at a non-held live row.
      end if;
      v_owner_vacates := (v_owner_hold.proposed_value->>'disposition') = 'removal'
        or ((v_owner_hold.proposed_value->>v_axis) is distinct from v_target);
      if not v_owner_vacates then
        return null;
      end if;
      v_work := v_work || v_owner_hold.id;
    end loop;
  end loop;

  return v_group;
end;
$$;
revoke all on function public._mi11_collision_group(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mi11_approve_hold(p_hold_id, p_observed_modified_time, p_expected_base_modified_time)
-- ---------------------------------------------------------------------------
create or replace function public.mi11_approve_hold(
  p_hold_id uuid,
  p_observed_modified_time timestamptz,
  p_expected_base_modified_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold       public.sync_holds%rowtype;
  v_group      uuid[];
  v_id         uuid;
  v_m          public.sync_holds%rowtype;
  v_actor      text := public.auth_email_canonical();
  -- parallel arrays for the parked email_change/rename nodes (removals handled separately).
  v_pholds     uuid[]   := array[]::uuid[];     -- hold id
  v_pkeys      text[]   := array[]::text[];     -- entity_key (the held crew name)
  v_pplace     text[]   := array[]::text[];     -- placeholder name assigned at park
  v_pdisp      text[]   := array[]::text[];     -- disposition
  v_pname      text[]   := array[]::text[];     -- proposed name (final)
  v_pemail     text[]   := array[]::text[];     -- proposed email (final)
  v_pbefore    jsonb[]  := array[]::jsonb[];    -- LIVE-row before_image (id + claim + non-identity), P3-F1
  v_rmplace    text[]   := array[]::text[];     -- removal nodes' parked placeholder names
  v_rmkey      text[]   := array[]::text[];     -- removal nodes' entity_key
  v_rmdrive    text[]   := array[]::text[];
  v_rmshow     uuid[]   := array[]::uuid[];
  v_rmbefore   jsonb[]  := array[]::jsonb[];    -- LIVE-row before_image for removal nodes, P3-F1
  v_pdrive     text;
  v_pshow      uuid;
  v_place      text;
  v_live       public.crew_members%rowtype;     -- the live crew row read UNDER THE LOCK (P3-F1)
  v_before     jsonb;                            -- authoritative before_image built from v_live
  v_rc         int;                              -- ROW_COUNT fail-safe (P3-F3)
  i            int;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden', hint = 'mi11_approve_hold is admin-only';
  end if;

  select * into v_hold from public.sync_holds where id = p_hold_id;
  if not found or v_hold.kind <> 'mi11_pending' then
    return jsonb_build_object('ok', false, 'code', 'MI11_HOLD_ALREADY_RESOLVED');
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_hold.drive_file_id));

  select * into v_hold from public.sync_holds where id = p_hold_id for update;
  if not found or v_hold.kind <> 'mi11_pending' then
    return jsonb_build_object('ok', false, 'code', 'MI11_HOLD_ALREADY_RESOLVED');
  end if;
  v_pdrive := v_hold.drive_file_id;
  v_pshow  := v_hold.show_id;

  -- Submitted-hold guards: disposition-validity (PF32), staleness pair (PF40), reservation (PF37).
  if (v_hold.proposed_value->>'disposition') = 'email_change'
     and (v_hold.proposed_value->>'name') is distinct from v_hold.entity_key then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_WOULD_COLLIDE');
  end if;
  if p_observed_modified_time is distinct from v_hold.base_modified_time then
    return jsonb_build_object('ok', false, 'code', 'MI11_TARGET_MOVED');
  end if;
  if v_hold.base_modified_time is distinct from p_expected_base_modified_time then
    return jsonb_build_object('ok', false, 'code', 'MI11_TARGET_MOVED');
  end if;
  if jsonb_array_length(coalesce(v_hold.reservation_collisions, '[]'::jsonb)) > 0 then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_WOULD_COLLIDE');
  end if;

  v_group := public._mi11_collision_group(v_hold.show_id, p_hold_id);
  if v_group is null then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_WOULD_COLLIDE');
  end if;

  -- Per-member validation pass (PF39): re-select EVERY group hold FOR UPDATE, re-run the SAME guards.
  foreach v_id in array v_group loop
    select * into v_m from public.sync_holds where id = v_id for update;
    if not found or v_m.kind <> 'mi11_pending' then
      return jsonb_build_object('ok', false, 'code', 'MI11_HOLD_ALREADY_RESOLVED');
    end if;
    if v_m.base_modified_time is distinct from p_observed_modified_time then
      return jsonb_build_object('ok', false, 'code', 'MI11_TARGET_MOVED');
    end if;
    if jsonb_array_length(coalesce(v_m.reservation_collisions, '[]'::jsonb)) > 0 then
      return jsonb_build_object('ok', false, 'code', 'IDENTITY_WOULD_COLLIDE');
    end if;
    if (v_m.proposed_value->>'disposition') = 'email_change'
       and (v_m.proposed_value->>'name') is distinct from v_m.entity_key then
      return jsonb_build_object('ok', false, 'code', 'IDENTITY_WOULD_COLLIDE');
    end if;
  end loop;

  -- step (1): for each member, READ THE LIVE ROW UNDER THE LOCK (P3-F1 / PF38 / resolution #24 — the
  -- live row is authoritative: it carries the id + claimed_via_oauth_at that held_value omits, and
  -- reflects any claim that landed AFTER the hold was created), build the full before_image, THEN park
  -- the row (email→NULL, name→'__hold:<uuid>') to clear both unique indexes before any reassign.
  foreach v_id in array v_group loop
    select * into v_m from public.sync_holds where id = v_id;
    select * into v_live from public.crew_members
     where show_id = v_m.show_id and name = v_m.entity_key;
    -- FAIL-SAFE (P3-F3): a missing SELECT INTO leaves v_live fields NULL (no error). If the live crew
    -- row vanished before approve (concurrent delete, or another path removed it while the hold
    -- lingered), abort with a typed non-mutating result BEFORE building before_image / parking /
    -- logging — never write a phantom applied log with a NULL-id before_image. The hold stays pending
    -- and the next sync reconciles. ZERO mutation.
    if not found then
      return jsonb_build_object('ok', false, 'code', 'MI11_TARGET_MOVED');
    end if;
    -- authoritative before_image — id + claimed_via_oauth_at + non-identity fields (Phase 4 undo restores them).
    v_before := jsonb_build_object(
      'id', v_live.id,
      'name', v_live.name,
      'email', v_live.email,
      'phone', v_live.phone,
      'role', v_live.role,
      'role_flags', to_jsonb(v_live.role_flags),
      'date_restriction', v_live.date_restriction,
      'stage_restriction', v_live.stage_restriction,
      'flight_info', v_live.flight_info,
      'claimed_via_oauth_at', v_live.claimed_via_oauth_at
    );

    v_place := '__hold:' || gen_random_uuid()::text;
    update public.crew_members
       set email = null, name = v_place
     where show_id = v_m.show_id and name = v_m.entity_key;
    -- ROW_COUNT fail-safe (P3-F3): the park MUST hit exactly the one live row we just read. If the row
    -- vanished in the (lock-held) window since the FOUND check, abort the whole RPC (raise → rollback
    -- of any earlier parks in this group) rather than proceed against a half-parked group.
    get diagnostics v_rc = row_count;
    if v_rc <> 1 then
      raise exception using errcode = 'P0001',
        message = 'MI11_ROW_VANISHED',
        hint = 'crew row vanished mid-approve during park';
    end if;

    if (v_m.proposed_value->>'disposition') = 'removal' then
      v_rmplace  := v_rmplace  || v_place;
      v_rmkey    := v_rmkey    || v_m.entity_key;
      v_rmdrive  := v_rmdrive  || v_m.drive_file_id;
      v_rmshow   := v_rmshow   || v_m.show_id;
      v_rmbefore := v_rmbefore || v_before;
    else
      v_pholds  := v_pholds  || v_m.id;
      v_pkeys   := v_pkeys   || v_m.entity_key;
      v_pplace  := v_pplace  || v_place;
      v_pdisp   := v_pdisp   || (v_m.proposed_value->>'disposition');
      v_pname   := v_pname   || coalesce(v_m.proposed_value->>'name', v_m.entity_key);
      v_pemail  := v_pemail  || (v_m.proposed_value->>'email');
      v_pbefore := v_pbefore || v_before;
    end if;
  end loop;

  -- step (2): DELETE the removal nodes' (now-parked) rows by their exact placeholder + crew_removed log
  -- (before_image is the LIVE-row image captured under the lock — carries id + claim, P3-F1).
  if array_length(v_rmplace, 1) is not null then
    for i in 1 .. array_length(v_rmplace, 1) loop
      delete from public.crew_members
       where show_id = v_rmshow[i] and name = v_rmplace[i];
      -- the parked removal row MUST still exist (we just parked it under the lock); P3-F3.
      get diagnostics v_rc = row_count;
      if v_rc <> 1 then
        raise exception using errcode = 'P0001',
          message = 'MI11_ROW_VANISHED', hint = 'parked removal row vanished mid-approve';
      end if;
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary,
         before_image, after_image, status, created_by)
      values
        (v_rmshow[i], v_rmdrive[i], 'mi11_approve', 'crew_removed', v_rmkey[i],
         'Removal of ' || v_rmkey[i] || ' was approved',
         v_rmbefore[i], null, 'applied', v_actor);
    end loop;
  end if;

  -- step (3): apply each email_change/rename node from its parked placeholder. BRANCH BY DISPOSITION
  -- (P3-F2): an email_change is the SAME person → in-place reassign (keep the PK), clear the moved
  -- anchor's claim (#27); a rename = delete-old + insert-FRESH (new id, claim NULL, copy ONLY the F17
  -- non-identity set) to match the single-node rename semantics (spec §5.4).
  if array_length(v_pholds, 1) is not null then
    for i in 1 .. array_length(v_pholds, 1) loop
      if v_pdisp[i] = 'rename' then
        delete from public.crew_members where show_id = v_pshow and name = v_pplace[i];
        -- the parked rename row MUST still exist (P3-F3).
        get diagnostics v_rc = row_count;
        if v_rc <> 1 then
          raise exception using errcode = 'P0001',
            message = 'MI11_ROW_VANISHED', hint = 'parked rename row vanished mid-approve';
        end if;
        insert into public.crew_members
          (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info)
        values (
          v_pshow, v_pname[i], v_pemail[i],
          v_pbefore[i]->>'phone',
          v_pbefore[i]->>'role',
          coalesce(array(select jsonb_array_elements_text(v_pbefore[i]->'role_flags')), '{}')::text[],
          v_pbefore[i]->'date_restriction',
          v_pbefore[i]->'stage_restriction',
          v_pbefore[i]->>'flight_info'
        );
      else
        update public.crew_members
           set name = v_pname[i], email = v_pemail[i], claimed_via_oauth_at = null
         where show_id = v_pshow and name = v_pplace[i];
        -- the parked email_change row MUST still exist (P3-F3).
        get diagnostics v_rc = row_count;
        if v_rc <> 1 then
          raise exception using errcode = 'P0001',
            message = 'MI11_ROW_VANISHED', hint = 'parked email_change row vanished mid-approve';
        end if;
      end if;
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary,
         before_image, after_image, status, created_by)
      values
        (v_pshow, v_pdrive, 'mi11_approve',
         case when v_pdisp[i] = 'rename' then 'crew_renamed' else 'crew_email_changed' end,
         v_pkeys[i],
         case when v_pdisp[i] = 'rename'
              then 'Rename of ' || v_pkeys[i] || ' to ' || v_pname[i] || ' was approved'
              else 'Email change for ' || v_pkeys[i] || ' was approved' end,
         v_pbefore[i],
         jsonb_build_object('name', v_pname[i], 'email', v_pemail[i]),
         'applied', v_actor);
    end loop;
  end if;

  -- step (4): delete ALL the group's holds.
  delete from public.sync_holds where id = any(v_group);

  -- INVARIANT (P4-F2): every writer of an APPLIED crew-identity change_kind row MUST call
  -- cleanup_superseded_before_images under the show lock BEFORE returning — not only the Phase-2
  -- auto-apply tail. mi11_approve_hold writes applied crew_removed/crew_renamed/crew_email_changed
  -- rows (single-node AND closed-group, all written above), so it runs cleanup here so an older
  -- auto-apply rename/add row to the same/successor identity is flipped status='superseded' +
  -- before_image nulled. Otherwise undo_change(originalRename/Add) stays callable during the window
  -- before the next sync and restores STALE crew (PF19). The advisory lock is still held → race-safe.
  -- (mi11_reject_hold writes status='rejected' rows and undo_change writes status='undone' rows —
  -- neither is an APPLIED crew-identity write, so neither runs cleanup.)
  perform public.cleanup_superseded_before_images(v_pshow);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mi11_approve_hold(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.mi11_approve_hold(uuid, timestamptz, timestamptz) to authenticated;
