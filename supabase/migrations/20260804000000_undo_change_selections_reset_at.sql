-- Unit D (spec 2026-08-03 apply-undo-audit-fidelity §3.6): carry crew_members.selections_reset_at
-- through the undo restore so an undo cannot REVALIDATE a deliberately invalidated picker cookie.
--
-- Full body preserved from the live catalog (20260719000001_undo_change_lifecycle_guard.sql) with
-- exactly three additions:
--   D4  capture the live successor's marker at the `select ... for update` that already precedes the
--       successor delete, into v_succ_reset. This is the load-bearing one: a crew_renamed undo
--       DELETES the successor first precisely so the restore INSERT slot is free, so the restore
--       takes the CLEAN-INSERT path and any greatest() living only in the ON CONFLICT branch never
--       runs. It also rescues historical rows for free -- an absent before_image key is SQL NULL and
--       greatest() falls through to the captured value, so no backfill is needed.
--   D2  selections_reset_at in the restore INSERT, merged as
--       greatest((v_before->>'selections_reset_at')::timestamptz, v_succ_reset).
--   D3  selections_reset_at = greatest(crew_members.selections_reset_at, excluded.selections_reset_at)
--       in the ON CONFLICT DO UPDATE list -- NOT a bare `excluded.` assignment, which would overwrite
--       a live NEWER marker with a stale one and reintroduce the exact revalidation this prevents.
-- greatest() semantics: greatest(NULL, ts) = ts, greatest(ts, NULL) = ts, both-NULL = NULL, and it
-- keeps the newer of two timestamps. The marker is monotonic by construction (its only writer stamps
-- clock_timestamp()), so "keep the newer" is correct rather than a heuristic.
--
-- Single in-RPC advisory-lock holder unchanged (invariant 2); ROW_COUNT fail-safes preserved
-- verbatim. Grants preserved: authenticated-granted, service_role-revoked.
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
  v_succ_reset timestamptz;  -- §3.6 (D4): the successor's picker-invalidation marker, captured
                             -- under the same FOR UPDATE, BEFORE the delete drops the row.
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
  -- §3.6 (D4): the successor's selections_reset_at is captured HERE, under the same FOR UPDATE and
  -- before the delete — after the delete the row is gone and the marker is unrecoverable.
  if v_log.change_kind = 'crew_renamed' then
    select id, selections_reset_at into v_succ_id, v_succ_reset from public.crew_members
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
  -- NULL-safe (NULL for a never-claimed member). selections_reset_at (§3.6) is the MERGE of the
  -- before_image marker and the successor's captured marker, so neither a reset predating the undone
  -- change nor one stamped after it is lost. This single INSERT serves crew_removed AND
  -- crew_renamed. The clean-INSERT path (restores the ORIGINAL id) is the reachable one — the guards
  -- above prove the (show_id,name)+(show_id,email) slots are free; ON CONFLICT is a defensive no-op
  -- that still restores the claim but never the immutable id.
  insert into public.crew_members (
    id, show_id, name, email, phone, role, role_flags,
    date_restriction, stage_restriction, flight_info, last_changed_at,
    claimed_via_oauth_at, selections_reset_at
  )
  values (
    (v_before->>'id')::uuid,
    v_log.show_id, v_name, v_before->>'email', v_before->>'phone',
    v_before->>'role',
    coalesce(array(select jsonb_array_elements_text(v_before->'role_flags')), '{}')::text[],
    v_before->'date_restriction', v_before->'stage_restriction',
    v_before->>'flight_info', clock_timestamp(),
    (v_before->>'claimed_via_oauth_at')::timestamptz,
    greatest((v_before->>'selections_reset_at')::timestamptz, v_succ_reset)
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
    claimed_via_oauth_at = excluded.claimed_via_oauth_at,
    -- NOT a bare excluded.: the live row on this slot may carry a NEWER reset than the restore
    -- image, and overwriting it would revalidate a cookie the admin deliberately invalidated.
    selections_reset_at  = greatest(crew_members.selections_reset_at, excluded.selections_reset_at);
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


-- ---------------------------------------------------------------------------
-- mi11_approve_hold — the SECOND production before_image builder (§3.6).
--
-- Full body preserved from 20260608000002_mi11_gate_rpcs.sql (advisory-lock acquisition, signature,
-- and every ROW_COUNT fail-safe verbatim; no new lock holder) with two additions, because it drops
-- selections_reset_at at TWO sites:
--   1. the jsonb_build_object that becomes before_image — without it a Phase-4 undo of an approved
--      removal/rename restores a row whose picker cookies silently revalidate;
--   2. the rename branch's successor INSERT — the rename inserts a FRESH identity, so fixing only
--      the builder still loses the marker on every future MI-11 rename.
--
-- Shipped HERE rather than as an edit to 20260608000002: that migration is already applied
-- everywhere, so editing it would change nothing on any deployed database.
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
  v_undoable   boolean;                          -- P4-F4: false for a MULTI-node closed group
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

  -- P4-F4: a MULTI-node closed group (rename swap / cycle / chain) is approved ATOMICALLY and writes
  -- several applied crew-identity rows sharing occurred_at=now(); none supersedes another, and
  -- undoing one in isolation always fails the swap-sibling name guard → a perpetually-failing Undo.
  -- Per spec undo is PER-ITEM / one-step, so a multi-node group's rows are NOT individually undoable:
  -- stamp individually_undoable=false (undo_change rejects them; the feed predicate hides the button).
  -- Single-node approvals (group size 1) keep the default true (true reversal, P4-F3).
  v_undoable := (coalesce(array_length(v_group, 1), 1) <= 1);

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
      'claimed_via_oauth_at', v_live.claimed_via_oauth_at,
      -- §3.6: the picker-invalidation marker rides before_image so a Phase-4 undo of this approval
      -- cannot revalidate a cookie the admin deliberately invalidated.
      'selections_reset_at', v_live.selections_reset_at
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
         before_image, after_image, status, created_by, individually_undoable)
      values
        (v_rmshow[i], v_rmdrive[i], 'mi11_approve', 'crew_removed', v_rmkey[i],
         'Removal of ' || v_rmkey[i] || ' was approved',
         v_rmbefore[i], null, 'applied', v_actor, v_undoable);
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
          (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
           flight_info, selections_reset_at)
        values (
          v_pshow, v_pname[i], v_pemail[i],
          v_pbefore[i]->>'phone',
          v_pbefore[i]->>'role',
          coalesce(array(select jsonb_array_elements_text(v_pbefore[i]->'role_flags')), '{}')::text[],
          v_pbefore[i]->'date_restriction',
          v_pbefore[i]->'stage_restriction',
          v_pbefore[i]->>'flight_info',
          -- §3.6: the SECOND site. The rename branch inserts a FRESH identity, so without this the
          -- marker is lost on every approved MI-11 rename even with the before_image half fixed.
          (v_pbefore[i]->>'selections_reset_at')::timestamptz
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
         before_image, after_image, status, created_by, individually_undoable)
      values
        (v_pshow, v_pdrive, 'mi11_approve',
         case when v_pdisp[i] = 'rename' then 'crew_renamed' else 'crew_email_changed' end,
         v_pkeys[i],
         case when v_pdisp[i] = 'rename'
              then 'Rename of ' || v_pkeys[i] || ' to ' || v_pname[i] || ' was approved'
              else 'Email change for ' || v_pkeys[i] || ' was approved' end,
         v_pbefore[i],
         jsonb_build_object('name', v_pname[i], 'email', v_pemail[i]),
         'applied', v_actor, v_undoable);
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
