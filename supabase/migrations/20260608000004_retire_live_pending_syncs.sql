-- Phase 2 Task 2.10b — cutover: retire the LIVE whole-parse pending_syncs staging path (PF31).
--
-- The new decision rule auto-applies + writes sync_holds and NEVER inserts a live pending_sync
-- (wizard_session_id IS NULL). Existing live rows would strand: _publish_show_core blocks publish
-- on them (PUBLISH_BLOCKED_PENDING_REVIEW) and the dashboard routes them to the per-show review
-- mount that Phase 6 removes. This ONE-SHOT DATA migration is a residue sweep that clears those
-- live rows + resets their shows so the next cron re-processes under the new auto-apply + MI-11 rule.
--
-- DEPLOYMENT ORDERING (PF35 — the load-bearing fix): run AFTER the new code is the only writer
-- (Phase 1+2 deployed, cron quiesced/drained). The migration is residue-sweep, NOT concurrency
-- control against old writers — deployment ordering is. The per-show advisory lock below is
-- defense-in-depth (PF33): it serializes against any in-flight NEW sync (which won't write live
-- pending_syncs anyway), using the SAME key the sync path uses (hashtext('show:'||drive_file_id)).
--
-- The WIZARD pending_syncs path (wizard_session_id IS NOT NULL, onboarding) is UNTOUCHED.
--
-- This is a DO block, NOT a create function, so it takes the lock without registering as a
-- lock-taking RPC (tests/auth/advisoryLockRpcDeadlock.test.ts greps create-function bodies).
-- Idempotent: re-applying after the LIVE cohort is gone enumerates zero rows → no-op.

do $$
declare r record;
begin
  for r in
    select distinct ps.drive_file_id
      from public.pending_syncs ps
     where ps.wizard_session_id is null
  loop
    -- Blocking; same key as the sync path (lib/sync/lockedShowTx.ts). xact-scoped — held to commit.
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
    delete from public.pending_syncs
      where drive_file_id = r.drive_file_id and wizard_session_id is null;
    update public.shows
       set last_seen_modified_time = null, requires_resync = true
     where drive_file_id = r.drive_file_id;
  end loop;
end $$;
