-- Task 2 — Destructive validation-reset gate + RPC.
--
-- Line 7 below is the table-level REVOKE that the PostgREST-DML-lockdown
-- registry cites as destructive_reset_gate's closed_at
-- (tests/db/postgrest-dml-lockdown.test.ts).
create table if not exists public.destructive_reset_gate (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false
);
revoke all on table public.destructive_reset_gate from anon, authenticated, public;
grant all on table public.destructive_reset_gate to service_role;
alter table public.destructive_reset_gate enable row level security; -- no policy => PostgREST deny-all
insert into public.destructive_reset_gate (id) values ('default') on conflict do nothing;

-- Gate-only assertion: admin AND this database's gate enabled. Production never
-- flips the gate, so this raises there even for an admin.
create or replace function public.assert_destructive_reset_enabled() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false) then
    raise exception 'destructive reset not enabled for this database';
  end if;
end;
$$;

-- The reset itself. is_admin() + gate check FIRST (admin gate before the enabled
-- check). Then acquire the per-show advisory lock for EVERY affected drive_file_id
-- (sorted, single-holder) BEFORE any delete (invariant 2). Delete order:
--   reports (non-cascade NO-ACTION FK child) -> shows (cascade clears children)
--   -> clear-explicit residue (no FK / SET NULL) -> validation_state
--   -> null the app_settings pending pointers.
--
-- The shows cascade clears: crew_members, hotel_reservations, rooms,
-- transportation, contacts, shows_internal, admin_alerts, show_share_tokens,
-- sync_holds, sync_log, sync_audit, show_change_log, pending_snapshot_uploads,
-- shows_pending_changes, email_deliveries (SET NULL). Those are NOT explicit-
-- deleted here — `delete from public.shows` reaches their empty-state.
--
-- onboarding_scan_manifest is a SET NULL child (delete from shows only NULLs its
-- created_show_id), so it MUST be explicit-deleted. pending_syncs /
-- pending_ingestions / deferred_ingestions / revision_race_cooldowns carry no FK
-- to shows and are explicit-deleted. wizard_finalize_checkpoints is wizard-session
-- residue with no FK to shows and no drive_file_id — explicit-deleted.
create or replace function public.reset_validation_data() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_did text;
  v_cleared bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
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

  -- Cascade clears all on-delete-cascade children (see header comment).
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

revoke all on function public.reset_validation_data() from public, anon;
grant execute on function public.reset_validation_data() to authenticated;
revoke all on function public.assert_destructive_reset_enabled() from public, anon;
grant execute on function public.assert_destructive_reset_enabled() to authenticated;
