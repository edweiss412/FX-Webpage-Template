-- Phase 4 — undo_change(p_change_log_id uuid): per-item undo of an auto-applied crew-identity change.
--
-- Two directions, selected by change_kind (resolution #18 / PF22 — NOT by before_image-null):
--   crew_removed / crew_renamed → Direction A: restore the prior crew row from before_image
--                                 (id + claim preserved, PF38) + write a held-present undo_override.
--   crew_added                  → Direction B: tombstone (_undo_tombstone) — DELETE the added row,
--                                 revoke its claim, write a held-absent override (F11).
-- Anything else (crew_email_changed, field_changed, section_shrunk, asset_drift, …) → UNDO_NOT_FOUND
-- with ZERO mutation: undo_change is SECURITY DEFINER + admin-callable with an arbitrary
-- p_change_log_id, so it enforces the undoable set ITSELF (never trusting the feed's action gating).
--
-- LOCK ORDER (resolution #15 / PF11 CRITICAL — deadlock class, M5 R20): is_admin() gate →
--   NON-locking plan read → pg_advisory_xact_lock → re-select FOR UPDATE + re-validate → mutate.
--   NO `for update` and no read-planned-for-mutation precedes the advisory lock.
--
-- GRANTS (resolution #11): SECURITY DEFINER; revoke from public/anon; grant execute to authenticated
--   only; body gates on public.is_admin() (raises 42501 when false — no catalog code, mirrors
--   archive_show / Phase 3); created_by stamped via public.auth_email_canonical() (the repo's
--   canonical authed-admin-email fn; is_admin() reads the same JWT). NOT granted to service_role.

-- ---------------------------------------------------------------------------
-- _undo_tombstone(v_log, v_drive) — Direction B (Task 4.3). SECURITY INVOKER (PF36): when undo_change
-- (SECURITY DEFINER, owned by the privileged migration role) calls it, it runs with the DEFINER's
-- privileges (can DELETE crew / write sync_holds + show_change_log); a DIRECT authenticated call runs
-- as authenticated, which has DML REVOKEd on these RPC-gated tables (PostgREST-DML-lockdown) → every
-- mutation blocked. SECURITY DEFINER here would GRANT those privileges to a direct caller and defeat
-- the lockdown. EXECUTE is also REVOKEd from public/anon/authenticated (below) so PostgREST cannot
-- invoke it at all; the owner (migration role) keeps EXECUTE implicitly, so undo_change still calls it.
-- It runs ENTIRELY inside undo_change's already-held advisory lock — it MUST NOT re-acquire the lock
-- (nested second holder → deadlock; single-holder rule).
-- ---------------------------------------------------------------------------
create or replace function public._undo_tombstone(v_log public.show_change_log, v_drive text)
  returns jsonb language plpgsql security invoker
  set search_path = public, pg_temp as $$
declare
  v_email text;
  v_rc    int;
begin
  -- The added email comes from the applied add's after_image (before_image is NULL for crew_added).
  v_email := v_log.after_image->>'email';

  -- DELETE the added crew row by its name (entity_ref = the added name, resolution #19). Deleting the
  -- row removes its OAuth claim (resolution #4 — the claim lives on crew_members.claimed_via_oauth_at,
  -- so the DELETE IS the revoke). FOUND/ROW_COUNT fail-safe: never write a phantom undo log if the
  -- row already vanished.
  delete from public.crew_members
   where show_id = v_log.show_id and name = v_log.entity_ref;
  get diagnostics v_rc = row_count;
  if v_rc < 1 then
    -- The added row is already gone (concurrent delete / a newer sync). Nothing to tombstone.
    return jsonb_build_object('ok', false, 'code', 'UNDO_NOT_FOUND');
  end if;

  -- Held-ABSENT tombstone: Phase 2 suppresses the re-add until the sheet stops listing them.
  -- baseline {kind:'add', added:{name,email}} (PF13 — symmetric signature).
  insert into public.sync_holds
    (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
  values (
    v_log.show_id, v_drive, 'crew_identity', v_log.entity_ref,
    jsonb_build_object(
      'absent', true, 'name', v_log.entity_ref, 'email', v_email,
      'baseline', jsonb_build_object('kind', 'add',
        'added', jsonb_build_object('name', v_log.entity_ref, 'email', v_email))
    ),
    'undo_override', public.auth_email_canonical()
  )
  on conflict (show_id, domain, entity_key) do update
    set held_value = excluded.held_value, kind = 'undo_override', proposed_value = null;

  insert into public.show_change_log
    (show_id, drive_file_id, source, change_kind, entity_ref, summary,
     before_image, after_image, status, undo_of, created_by)
  values (v_log.show_id, v_drive, 'undo', v_log.change_kind, v_log.entity_ref, v_log.summary,
          null, null, 'undone', v_log.id, public.auth_email_canonical());

  -- Flip the ORIGINAL crew_added row to 'undone' under the lock (PF16): feed action→'none' and a 2nd
  -- undo hits the status<>'applied' guard → UNDO_SUPERSEDED.
  update public.show_change_log set status = 'undone' where id = v_log.id;

  return jsonb_build_object('ok', true, 'entity', v_log.entity_ref);
end;
$$;
revoke execute on function public._undo_tombstone(public.show_change_log, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- undo_change(p_change_log_id uuid)
-- ---------------------------------------------------------------------------
create or replace function public.undo_change(p_change_log_id uuid)
  returns jsonb language plpgsql security definer
  set search_path = public, pg_temp as $$
declare
  v_log      public.show_change_log%rowtype;
  v_drive    text;
  v_before   jsonb;
  v_name     text;
  v_baseline jsonb;   -- PF13: the undone-change signature stored at held_value.baseline
  v_held     jsonb;   -- before_image + {baseline}
  v_rc       int;     -- ROW_COUNT fail-safe
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

  -- Email-collision guard (PF27): the predicate matches crew_members_show_email_unique (show_id,
  -- email) — reject if ANY OTHER live crew row (different name) already holds the non-null prior
  -- email, claimed OR not, so the restore INSERT never hits a raw 23505. Typed UNDO_EMAIL_CLAIMED.
  if (v_before->>'email') is not null and exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id
       and email = (v_before->>'email')
       and name <> v_name
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_EMAIL_CLAIMED');
  end if;

  -- Name-collision guard (PF28) symmetric to the email guard: if a DIFFERENT-email live crew row
  -- already holds the restore-target name, reject (UNDO_SUPERSEDED) so ON CONFLICT (show_id, name)
  -- never clobbers a newer live row of that name.
  if exists (
    select 1 from public.crew_members
     where show_id = v_log.show_id
       and name = v_name
       and (v_before->>'email') is distinct from email
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDO_SUPERSEDED');
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
$$;
revoke all on function public.undo_change(uuid) from public, anon;
grant execute on function public.undo_change(uuid) to authenticated;
