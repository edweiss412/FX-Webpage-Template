-- Hotfix: run the reset wipe via the SERVICE-ROLE path (mirroring the reseed action),
-- not the `authenticated` session path.
--
-- ROOT CAUSE: reset_validation_data() acquires per-show advisory locks (invariant 2)
-- to serialize behind any in-flight cron/onboarding sync before wiping. Invoked from
-- the admin server action as the `authenticated` role (Supabase configures it with
-- statement_timeout=8s), it TIMED OUT on `pg_advisory_xact_lock` whenever the live
-- validation cron held a show's lock → VALIDATION_RESET_FAILED. statement_timeout is
-- armed when the top-level statement starts, so raising it INSIDE the function does not
-- affect the running statement — the only fix is to run the wipe under a role without
-- the 8s cap. `service_role` has no statement_timeout.
--
-- The reseed action already uses this split (session-client assert_destructive_reset_enabled()
-- for the is_admin + gate check, then a service-role client for the heavy work). This makes
-- the reset consistent: admin identity is enforced by the action (requireAdmin) + the
-- session-client assert; reset_validation_data() keeps the gate check (the prod fence) and
-- is now SERVICE-ROLE-ONLY (revoked from authenticated/anon), so a non-admin authenticated
-- user can no longer call it directly via PostgREST at all.

create or replace function public.reset_validation_data() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_did text;
  v_cleared bigint;
begin
  -- Admin identity is enforced upstream (server action requireAdmin + the session-client
  -- assert_destructive_reset_enabled() call). This RPC runs via the service-role client
  -- (no 8s statement_timeout) so the advisory-lock wait below can complete. The gate check
  -- below remains the production fence (the gate is unwritable via PostgREST and false in prod).
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

  -- Non-cascade FK child (NO ACTION) — MUST precede `delete from public.shows`.
  delete from public.reports;

  -- Cascade clears all on-delete-cascade children.
  delete from public.shows;

  -- Clear-explicit: no FK to shows (or SET NULL) — not reached by the cascade.
  delete from public.pending_syncs;
  delete from public.pending_ingestions;
  delete from public.deferred_ingestions;
  delete from public.onboarding_scan_manifest;
  delete from public.revision_race_cooldowns;
  delete from public.wizard_finalize_checkpoints;

  -- Validation seed singleton.
  delete from public.validation_state;

  -- Preserve the app_settings row; null only the pending pointers. watched_folder_id
  -- and every other column are left UNCHANGED.
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

-- Service-role-only: a non-admin authenticated user can no longer reach the wipe via
-- PostgREST. The admin gate now lives in the action (requireAdmin + session-client assert).
revoke all on function public.reset_validation_data() from public, anon, authenticated;
grant execute on function public.reset_validation_data() to service_role;
