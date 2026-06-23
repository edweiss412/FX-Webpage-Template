-- Hotfix #2: qualify every DELETE in reset_validation_data() so it survives the
-- `safeupdate` extension that Supabase preloads on the PostgREST connection role.
--
-- ROOT CAUSE (the actual bug behind VALIDATION_RESET_FAILED): the `authenticator`
-- role that PostgREST connects as has `session_preload_libraries = supautils,
-- safeupdate`. The `safeupdate` extension raises `21000 DELETE requires a WHERE
-- clause` for any unqualified DELETE/UPDATE — and it is loaded SESSION-WIDE, so it
-- applies even after PostgREST switches to `service_role` (it is not a per-role
-- setting). reset_validation_data() issued bare `delete from <table>` statements,
-- which PostgREST rejected in ~0.5s (NOT a timeout — the earlier 8s-statement_timeout
-- diagnosis was a red herring: every prior test called the function over a DIRECT
-- psql/superuser connection, which does NOT preload safeupdate, so the bare deletes
-- ran and masked the failure). The button calls the function via the supabase-js
-- service-role client → PostgREST → safeupdate → blocked.
--
-- FIX: add `where ctid is not null` to every DELETE. `ctid` is a system column on
-- every table, so the predicate references a real column (the planner cannot fold it
-- away the way it can fold `where true`), satisfies safeupdate's "must have a WHERE
-- clause" check, and matches every existing row (ctid is never null for a live row) —
-- so the delete-all semantics are preserved exactly. Disabling safeupdate via a
-- function-level `SET safeupdate.enabled = off` is NOT viable: that GUC is privileged
-- (permission denied even at CREATE FUNCTION time). The app_settings UPDATE already
-- carries `where id = 'default'`, so it is unaffected.
--
-- Verified non-destructively against LOCAL Supabase (which preloads the same
-- safeupdate): a bare-delete function returns `21000 DELETE requires a WHERE clause`
-- over PostgREST, while the `where ctid is not null` form returns 200.

create or replace function public.reset_validation_data() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_did text;
  v_cleared bigint;
begin
  if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false) then
    raise exception 'destructive reset not enabled for this database';
  end if;

  -- Invariant 2: sorted single-holder per-show advisory locks over the distinct
  -- affected-key set, BEFORE any mutation. No nested SECURITY DEFINER re-acquire.
  for v_did in
    select drive_file_id
      from (
        select drive_file_id from public.shows
        union
        select drive_file_id from public.pending_syncs
        union
        select drive_file_id from public.pending_ingestions
        union
        select drive_file_id from public.deferred_ingestions
      ) u
     where drive_file_id is not null
     order by drive_file_id
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || v_did));
  end loop;

  select count(*) into v_cleared from public.shows;

  -- Every DELETE carries `where ctid is not null` (delete-all that safeupdate accepts).
  -- Non-cascade FK child (NO ACTION) — MUST precede `delete from public.shows`.
  delete from public.reports where ctid is not null;

  -- Cascade clears all on-delete-cascade children.
  delete from public.shows where ctid is not null;

  -- Clear-explicit: no FK to shows (or SET NULL) — not reached by the cascade.
  delete from public.pending_syncs where ctid is not null;
  delete from public.pending_ingestions where ctid is not null;
  delete from public.deferred_ingestions where ctid is not null;
  delete from public.onboarding_scan_manifest where ctid is not null;
  delete from public.revision_race_cooldowns where ctid is not null;
  delete from public.wizard_finalize_checkpoints where ctid is not null;

  -- Validation seed singleton.
  delete from public.validation_state where ctid is not null;

  -- Preserve the app_settings row; null only the pending pointers. watched_folder_id
  -- and every other column are left UNCHANGED. (Already qualified — safeupdate-safe.)
  update public.app_settings set
    pending_wizard_session_id = null,
    pending_wizard_session_at = null,
    pending_folder_id = null,
    pending_folder_name = null,
    pending_folder_set_by_email = null,
    pending_folder_set_at = null
  where id = 'default';

  return jsonb_build_object('clearedShows', v_cleared);
end;
$$;

-- Service-role-only (unchanged from 20260622000002): a non-admin authenticated user
-- can no longer reach the wipe via PostgREST. The admin gate lives in the action
-- (requireAdmin + session-client assert) and the gate check inside this function.
revoke all on function public.reset_validation_data() from public, anon, authenticated;
grant execute on function public.reset_validation_data() to service_role;
