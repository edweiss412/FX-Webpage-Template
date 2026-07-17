-- BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: add an archived + finalize-owned lifecycle guard to
-- undo_change. Follow-on create-or-replace (full body preserved from the live catalog + one declare
-- var + the guard block). Structured { ok:false, code } returns (matching UNDO_NOT_FOUND), NOT
-- published-gated. Single in-RPC advisory-lock holder unchanged (invariant 2). Grants preserved:
-- authenticated-granted, service_role-revoked.
CREATE OR REPLACE FUNCTION public.undo_change(p_change_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_log      public.show_change_log%rowtype;
  v_drive    text;
  v_before   jsonb;
  v_name     text;
  v_baseline jsonb;   -- PF13: the undone-change signature stored at held_value.baseline
  v_held     jsonb;   -- before_image + {baseline}
  v_rc       int;     -- ROW_COUNT fail-safe
  v_succ_name  text;  -- crew_renamed undo: the SUCCESSOR (renamed-TO) name (after_image)
  v_succ_id    uuid;  -- the live successor row id, locked + deleted before restore (P4-F3)
  v_archived boolean;  -- BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: lifecycle-guard re-read
begin
  -- (1) is_admin gate FIRST.
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden', hint = 'undo_change is admin-only';
  end if;

  -- (2) NON-locking read (no FOR UPDATE) to learn show_id / drive_file_id and plan the undo.
  select * into v_log from public.show_change_log where id = p_change_log_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');
  end if;
  select drive_file_id into v_drive from public.shows where id = v_log.show_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');
  end if;

  -- (3) advisory lock BEFORE any FOR UPDATE / mutation.
  perform pg_advisory_xact_lock(hashtext('show:' || v_drive));

  -- (4a) re-select FOR UPDATE under the lock — it may have changed since the non-locking read.
  select * into v_log from public.show_change_log where id = p_change_log_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');
  end if;

  -- BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD: refuse a read-only (archived) or mid-finalize show.
  -- Post-lock re-read; placed BEFORE the Direction-B _undo_tombstone delegation AND the rename
  -- mutations so it covers BOTH undo directions. NOT published-gated — undo must remain valid on a
  -- Held show (structured return, matching this RPC's UNDO_NOT_FOUND pattern → passes through
  -- interpretUndoResult.data.code).
  select archived into v_archived from public.shows where id = v_log.show_id;
  if v_archived then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SHOW_ARCHIVED');
  end if;
  if public.readfinalizeowned_b2(v_log.show_id) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_FINALIZE_OWNED');
  end if;

  -- (4b) single supersession guard (PF16 / resolution #18): undo only while status='applied'.
  -- The orig row flips to 'undone' on success (below), so a double-submit / racing 2nd undo / a
  -- newer-supersession (cleanup flips it to 'superseded') all deterministically no-op here. This
  -- runs BEFORE the change_kind/direction branch so a superseded crew_removed row whose before_image
  -- was nulled by cleanup never falls into the tombstone path and deletes current crew.
  if v_log.status <> 'applied' then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');
  end if;

  -- (4c) SECURITY-BOUNDARY GUARD (PF22): enforce the undoable set ITSELF. Any non-crew-add/remove/
  -- rename row → UNDO_NOT_FOUND with ZERO mutation, BEFORE any path selection.
  if v_log.change_kind not in ('crew_added', 'crew_removed', 'crew_renamed') then
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');
  end if;

  -- (4d) NOT-INDIVIDUALLY-UNDOABLE GUARD (P4-F4): a multi-node closed-group approval (rename swap /
  -- cycle / chain) is an ATOMIC unit — its rows are stamped individually_undoable=false at write time
  -- (mi11_approve_hold). Undoing one in isolation would always fail the swap-sibling name guard and
  -- leave a perpetually-failing Undo. Reject defensively here with ZERO mutation (the Phase-5 feed
  -- predicate also hides the button). Defaults true for single-node approvals + Phase-2 auto-apply.
  if not v_log.individually_undoable then
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');
  end if;

  -- Direction selected by change_kind, NOT by before_image-null (PF22).
  if v_log.change_kind = 'crew_added' then
    return public._undo_tombstone(v_log, v_drive);  -- Direction B (Task 4.3).
  end if;

  -- ---- Direction A: restore prior crew row from before_image + held-present override. ----
  -- entity_ref = before_image.name = the prior/old name (PF28 / resolution #19) = the ON CONFLICT key.
  v_before := v_log.before_image;
  v_name := v_before->>'name';

  -- PF13 baseline = the undone-change signature (release against what the SHEET asserts).
  if v_log.change_kind = 'crew_renamed' then
    v_baseline := jsonb_build_object(
      'kind', 'rename',
      'suppressed_added', jsonb_build_object(
        'name', v_log.after_image->>'name',
        'email', v_log.after_image->>'email'
      )
    );
  else  -- crew_removed
    v_baseline := jsonb_build_object('kind', 'removal');
  end if;
  v_held := v_before || jsonb_build_object('baseline', v_baseline);

  -- crew_renamed undo is a TRUE reversal (P4-F3): a rename was applied as delete-old + insert-new
  -- (Alice→Dana), so undo must DELETE the successor (Dana) before restoring the prior (Alice). The
  -- status<>'applied' guard above already proved this rename is still the latest change, so
  -- after_image names the CURRENT live successor. We compute the successor name now, but the guards
  -- below (which must run with ZERO mutation on the reject paths) EXCLUDE the successor — then the
  -- actual successor delete happens AFTER the guards pass (so a reject never leaves Dana deleted).
  if v_log.change_kind = 'crew_renamed' then
    v_succ_name := v_log.after_image->>'name';
  end if;

  -- Email-collision guard (PF27): the predicate matches crew_members_show_email_unique (show_id,
  -- email) — reject if ANY OTHER live crew row already holds the non-null prior email, claimed OR
  -- not, so the restore INSERT never hits a raw 23505. Typed UNDO_EMAIL_CLAIMED. EXCLUDES the rename
  -- SUCCESSOR (deleted below) so a SAME-EMAIL rename (Alice(a@x)→Dana(a@x)) is undoable — only a
  -- GENUINELY unrelated owner of the prior email trips it (P4-F3).
  if (v_before->>'email') is not null and exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id
       and email = (v_before->>'email')
       and name <> v_name
       and name is distinct from v_succ_name
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_EMAIL_CLAIMED');
  end if;

  -- Name-collision guard (PF28) symmetric to the email guard: if a DIFFERENT-email live crew row
  -- already holds the restore-target name, reject (UNDO_SUPERSEDED) so ON CONFLICT (show_id, name)
  -- never clobbers a newer live row of that name. (The successor name differs from the prior name,
  -- so this never matches the to-be-deleted successor for a normal rename.)
  if exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id
       and name = v_name
       and (v_before->>'email') is distinct from email
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');
  end if;

  -- All reject guards passed → NOW delete the successor (crew_renamed only). This frees the
  -- successor's name AND email before the restore INSERT. FOUND/ROW_COUNT fail-safe: if the live
  -- successor vanished since the status guard, the state moved → UNDO_SUPERSEDED (zero mutation).
  if v_log.change_kind = 'crew_renamed' then
    select id into v_succ_id from public.crew_members
     where show_id = v_log.show_id and name = v_succ_name
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');
    end if;
    delete from public.crew_members
     where show_id = v_log.show_id and name = v_succ_name;
    get diagnostics v_rc = row_count;
    if v_rc <> 1 then
      raise exception using errcode = 'P0001', message = 'UNDO_SUCCESSOR_ROW_COUNT',
        hint = 'crew_renamed undo successor delete affected an unexpected row count';
    end if;
  end if;

  -- Re-insert the prior crew row. Restores BOTH identity columns id + claimed_via_oauth_at (PF38 /
  -- resolution #24) so the picker cookie (keyed on crew_members.id) still matches and the OAuth
  -- claim survives. Type-correct per live column type (PF6): id::uuid; role_flags rebuilt from the
  -- jsonb array; date/stage_restriction carried with -> (jsonb); text cols via ->>; last_changed_at
  -- = clock_timestamp() (NOT restored — not an identity field). claimed_via_oauth_at::timestamptz is
  -- NULL-safe (NULL for a never-claimed member). This single INSERT serves crew_removed AND
  -- crew_renamed. The clean-INSERT path (restores the ORIGINAL id) is the reachable one — the guards
  -- above prove the (show_id,name)+(show_id,email) slots are free; ON CONFLICT is a defensive no-op
  -- that still restores the claim but never the immutable id.
  insert into public.crew_members (
    id, show_id, name, email, phone, role, role_flags,
    date_restriction, stage_restriction, flight_info, last_changed_at,
    claimed_via_oauth_at
  )
  values (
    (v_before->>'id')::uuid,
    v_log.show_id, v_name, v_before->>'email', v_before->>'phone',
    v_before->>'role',
    coalesce(array(select jsonb_array_elements_text(v_before->'role_flags')), '{}')::text[],
    v_before->'date_restriction', v_before->'stage_restriction',
    v_before->>'flight_info', clock_timestamp(),
    (v_before->>'claimed_via_oauth_at')::timestamptz
  )
  on conflict (show_id, name) do update set
    email                = excluded.email,
    phone                = excluded.phone,
    role                 = excluded.role,
    role_flags           = excluded.role_flags,
    date_restriction     = excluded.date_restriction,
    stage_restriction    = excluded.stage_restriction,
    flight_info          = excluded.flight_info,
    last_changed_at      = excluded.last_changed_at,
    claimed_via_oauth_at = excluded.claimed_via_oauth_at;
  -- ROW_COUNT fail-safe: the insert/upsert must hit exactly one row before we log success.
  get diagnostics v_rc = row_count;
  if v_rc <> 1 then
    raise exception using errcode = 'P0001', message = 'UNDO_RESTORE_ROW_COUNT',
      hint = 'undo restore affected an unexpected row count';
  end if;

  -- held-present override (before_image + baseline). Phase 2's release eval reads held_value.baseline.
  insert into public.sync_holds
    (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
  values (v_log.show_id, v_drive, 'crew_identity', v_name, v_held, 'undo_override',
          public.auth_email_canonical())
  on conflict (show_id, domain, entity_key) do update
    set held_value = excluded.held_value, kind = 'undo_override', proposed_value = null;

  -- undo log row — created_by stamped explicitly (PF7; the 'system' default is auto_apply-only).
  insert into public.show_change_log
    (show_id, drive_file_id, source, change_kind, entity_ref, summary,
     before_image, after_image, status, undo_of, created_by)
  values (v_log.show_id, v_drive, 'undo', v_log.change_kind, v_name, v_log.summary,
          null, v_before, 'undone', v_log.id, public.auth_email_canonical());

  -- flip the ORIGINAL applied row to 'undone' under the lock (PF16): feed action→'none', a 2nd undo
  -- hits the status<>'applied' guard → UNDO_SUPERSEDED.
  update public.show_change_log set status = 'undone' where id = v_log.id;

  return jsonb_build_object('ok', true, 'entity', v_name);
end;
$function$;

revoke all on function public.undo_change(uuid) from public, anon;
grant execute on function public.undo_change(uuid) to authenticated;
revoke all on function public.undo_change(uuid) from service_role;
