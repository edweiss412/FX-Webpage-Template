-- Pull-sheet-on-archived-tab override (spec 2026-07-06). Nullable jsonb; NULL = skipped
-- (default). NOT '{}': null is the meaningful "skipped" sentinel (distinct from
-- source_anchors' '{}' neutral). Idempotent: ADD COLUMN IF NOT EXISTS (apply-twice safe).
alter table public.pending_syncs
  add column if not exists pull_sheet_override jsonb;
alter table public.pending_syncs
  add column if not exists pull_sheet_override_applied jsonb;
alter table public.shows
  add column if not exists pull_sheet_override jsonb;

comment on column public.pending_syncs.pull_sheet_override is
  'In-app override to include an archived OLD-tab pull sheet: {tabName,fingerprint,acceptedBy,acceptedAt}|null. NULL=skipped (default). Written only via set_pull_sheet_override RPC + publish propagation.';
comment on column public.pending_syncs.pull_sheet_override_applied is
  'overrideSnapshot({tabName,fingerprint}|null) the currently-staged parse_result was produced under. Deferred-apply consistency gate (spec 5.8). NOT propagated to shows.';
comment on column public.shows.pull_sheet_override is
  'Durable copy of pull_sheet_override, propagated at publish (Flow A/B). Read by cron sync (spec 5.3).';

-- SECURITY DEFINER accept/revoke writer. Sole writer of pending_syncs.pull_sheet_override at
-- the onboarding layer. Holds the per-show advisory lock (single holder — the JS route never
-- locks). Belt-and-suspenders: (1) execute revoked below; (2) in-RPC active-session guard.
create or replace function public.set_pull_sheet_override(
  p_drive_file_id text,
  p_wizard_session_id uuid,
  p_tab_name text,
  p_fingerprint text,
  p_accepted_by text,
  p_expected_override_snapshot jsonb  -- overrideSnapshot({tabName,fingerprint}|null) the admin's UI last saw (row-state CAS)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_session uuid;
  v_current jsonb;
  v_current_snapshot jsonb;
  v_override jsonb;
begin
  -- Per-show advisory lock INSIDE the SECURITY DEFINER tx (single holder). Keeps direct
  -- service-role RPC callers from bypassing the write lock.
  perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));

  -- In-RPC active-session guard (mirrors rescanWizardSheet.ts:103-115): the session must be
  -- the live onboarding session, and the target pending_syncs row must exist.
  select pending_wizard_session_id into v_active_session
    from public.app_settings where id = 'default' limit 1;
  if v_active_session is null or v_active_session <> p_wizard_session_id then
    raise exception 'stale or forged wizard session for pull_sheet_override'
      using errcode = '22023';
  end if;

  -- Row-state CAS (Codex plan-R3-1): read the CURRENT override under the lock and compare its
  -- snapshot to what the admin's UI last saw. A stale S3 page revoking after another accept
  -- (or a stale accept after a revoke) would otherwise clobber the newer decision (lost update).
  select pull_sheet_override into v_current
    from public.pending_syncs
   where drive_file_id = p_drive_file_id and wizard_session_id = p_wizard_session_id;
  if not found then
    raise exception 'no pending_syncs row for (session, drive_file_id)'
      using errcode = 'P0002';
  end if;
  v_current_snapshot := case when v_current is null then null
    else jsonb_build_object('tabName', v_current->>'tabName', 'fingerprint', v_current->>'fingerprint') end;
  -- p_expected_override_snapshot is null|{tabName,fingerprint}; compare with null-safe equality.
  if v_current_snapshot is distinct from p_expected_override_snapshot then
    raise exception 'stale override snapshot (row changed since review)'
      using errcode = '40001';  -- serialization_failure -> route maps to 409 stale_review
  end if;

  if p_tab_name is null then
    v_override := null; -- revoke
  else
    v_override := jsonb_build_object(
      'tabName', p_tab_name,
      'fingerprint', p_fingerprint,
      'acceptedBy', p_accepted_by,
      'acceptedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end if;

  update public.pending_syncs
     set pull_sheet_override = v_override
   where drive_file_id = p_drive_file_id and wizard_session_id = p_wizard_session_id;

  return jsonb_build_object('override', v_override);
end;
$$;

revoke execute on function public.set_pull_sheet_override(text, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_pull_sheet_override(text, uuid, text, text, text, jsonb)
  to service_role;
