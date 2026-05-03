create table public.shows_internal (
  show_id uuid primary key references public.shows(id) on delete cascade,
  financials jsonb,
  parse_warnings jsonb default '[]'::jsonb,
  raw_unrecognized jsonb default '[]'::jsonb
);

create table public.crew_member_auth (
  show_id uuid not null references public.shows(id) on delete cascade,
  crew_name text not null,
  current_token_version int not null default 1,
  max_issued_version int not null default 1,
  revoked_below_version int not null default 0,
  last_changed_at timestamptz not null default now(),
  primary key (show_id, crew_name)
);

create or replace function public.viewer_version_token(p_show_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select to_char(greatest(
    coalesce((select extract(epoch from last_synced_at) * 1000 from public.shows where id = p_show_id), 0),
    coalesce((select extract(epoch from max(last_changed_at)) * 1000 from public.crew_member_auth where show_id = p_show_id), 0),
    coalesce((select extract(epoch from max(last_changed_at)) * 1000 from public.crew_members where show_id = p_show_id), 0)
  ), 'FM999999999999999');
$$;
revoke all on function public.viewer_version_token(uuid) from public;
grant execute on function public.viewer_version_token(uuid) to authenticated, anon, service_role;

create or replace function public.bump_last_changed_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  new.last_changed_at := now();
  return new;
end;
$$;
revoke all on function public.bump_last_changed_at() from public;

create trigger crew_member_auth_bump_last_changed_at
  before update on public.crew_member_auth
  for each row
  when (old.* is distinct from new.*)
  execute function public.bump_last_changed_at();

create trigger crew_members_bump_last_changed_at
  before update on public.crew_members
  for each row
  when (old.* is distinct from new.*)
  execute function public.bump_last_changed_at();

create or replace function public.publish_show_invalidation_after_statement()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select distinct show_id from new_rows where show_id is not null loop
    perform pg_notify(
      'realtime:broadcast',
      json_build_object(
        'topic', 'show:' || r.show_id || ':invalidation',
        'event', 'invalidate',
        'payload', json_build_object('show_id', r.show_id, 'version_token', public.viewer_version_token(r.show_id))
      )::text
    );
  end loop;
  return null;
end;
$$;
revoke all on function public.publish_show_invalidation_after_statement() from public;

create trigger crew_member_auth_publish_invalidation
  after update on public.crew_member_auth
  referencing new table as new_rows
  for each statement
  execute function public.publish_show_invalidation_after_statement();

create trigger crew_member_auth_publish_invalidation_insert
  after insert on public.crew_member_auth
  referencing new table as new_rows
  for each statement
  execute function public.publish_show_invalidation_after_statement();

create trigger crew_members_publish_invalidation
  after update on public.crew_members
  referencing new table as new_rows
  for each statement
  execute function public.publish_show_invalidation_after_statement();

create trigger crew_members_publish_invalidation_insert
  after insert on public.crew_members
  referencing new table as new_rows
  for each statement
  execute function public.publish_show_invalidation_after_statement();

create table public.revoked_links (
  show_id uuid not null references public.shows(id) on delete cascade,
  crew_name text not null,
  token_version int not null,
  revoked_at timestamptz not null default now(),
  revoked_reason text,
  primary key (show_id, crew_name, token_version),
  constraint revoked_links_token_version_positive check (token_version > 0)
);

create table public.link_sessions (
  token text primary key,
  show_id uuid not null references public.shows(id) on delete cascade,
  crew_member_id uuid references public.crew_members(id) on delete set null,
  jwt_token_version int not null,
  signing_key_id text not null,
  expires_at timestamptz not null,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index link_sessions_crew_member_id_idx on public.link_sessions (crew_member_id);

create table public.bootstrap_nonces (
  nonce_hash text not null,
  show_id uuid not null references public.shows(id) on delete cascade,
  issued_at timestamptz not null default now(),
  consumed_at timestamptz,
  primary key (nonce_hash, show_id)
);
create index bootstrap_nonces_issued_at_idx on public.bootstrap_nonces (issued_at);

create table public.pending_syncs (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null,
  parsed_at timestamptz not null default now(),
  base_modified_time timestamptz,
  staged_modified_time timestamptz not null,
  parse_result jsonb not null,
  triggered_review_items jsonb not null default '[]'::jsonb,
  prior_last_sync_status text,
  prior_last_sync_error text,
  staged_id uuid not null default gen_random_uuid(),
  source_kind text not null,
  wizard_session_id uuid,
  wizard_approved boolean not null default false,
  wizard_approved_by_email text,
  wizard_approved_at timestamptz,
  wizard_reviewer_choices jsonb,
  wizard_reviewer_choices_version smallint,
  last_finalize_failure_code text,
  warning_summary text not null,
  constraint pending_syncs_source_kind_check check (source_kind in ('cron', 'push', 'manual', 'onboarding_scan')),
  constraint pending_syncs_wizard_approved_requires_session check (wizard_session_id is not null or wizard_approved = false),
  constraint pending_syncs_live_rows_have_no_approval_payload check (
    wizard_session_id is not null
    or (
      wizard_approved_by_email is null
      and wizard_approved_at is null
      and wizard_reviewer_choices is null
      and wizard_reviewer_choices_version is null
    )
  ),
  constraint pending_syncs_approved_requires_full_payload check (
    wizard_approved = false
    or (
      wizard_approved_by_email is not null
      and wizard_approved_at is not null
      and wizard_reviewer_choices is not null
      and wizard_reviewer_choices_version is not null
    )
  )
);
create index pending_syncs_wizard_session_idx on public.pending_syncs (wizard_session_id) where wizard_session_id is not null;
create unique index pending_syncs_live_drive_file_idx
  on public.pending_syncs (drive_file_id) where wizard_session_id is null;
create unique index pending_syncs_session_drive_file_idx
  on public.pending_syncs (drive_file_id, wizard_session_id) where wizard_session_id is not null;

create table public.pending_ingestions (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null,
  drive_file_name text not null,
  first_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  attempt_count int not null default 1,
  last_error_code text not null,
  last_error_message text not null,
  last_warnings jsonb default '[]'::jsonb,
  wizard_session_id uuid,
  discovered_during_folder_id text,
  last_seen_modified_time timestamptz
);
create unique index pending_ingestions_live_drive_file_idx
  on public.pending_ingestions (drive_file_id) where wizard_session_id is null;
create unique index pending_ingestions_session_drive_file_idx
  on public.pending_ingestions (drive_file_id, wizard_session_id) where wizard_session_id is not null;

create table public.sync_audit (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete cascade,
  drive_file_id text not null,
  applied_at timestamptz not null default now(),
  applied_by text not null,
  staged_id uuid not null,
  triggered_review_items jsonb not null,
  reviewer_choices jsonb not null,
  derived_side_effects jsonb not null,
  parse_result_summary jsonb not null,
  base_modified_time timestamptz,
  staged_modified_time timestamptz not null
);
create index sync_audit_show_id_idx on public.sync_audit (show_id, applied_at desc);
create index sync_audit_drive_file_id_idx on public.sync_audit (drive_file_id, applied_at desc);

create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete cascade,
  drive_file_id text,
  status text not null,
  message text,
  parse_warnings jsonb default '[]'::jsonb,
  duration_ms int,
  occurred_at timestamptz not null default now()
);

create table public.app_settings (
  id text primary key default 'default',
  watched_folder_id text,
  watched_folder_name text,
  watched_folder_set_by_email text,
  watched_folder_set_at timestamptz,
  active_signing_key_id text not null default 'k1',
  pending_folder_id text,
  pending_folder_name text,
  pending_folder_set_by_email text,
  pending_folder_set_at timestamptz,
  pending_wizard_session_id uuid,
  pending_wizard_session_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 'default')
);
insert into public.app_settings (id) values ('default') on conflict do nothing;

create table public.deferred_ingestions (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null,
  wizard_session_id uuid,
  deferred_kind text not null check (deferred_kind in ('defer_until_modified', 'permanent_ignore')),
  deferred_at_modified_time timestamptz,
  deferred_at timestamptz not null default now(),
  deferred_by_email text not null,
  reason text
);
create unique index deferred_ingestions_live_drive_file_idx
  on public.deferred_ingestions (drive_file_id) where wizard_session_id is null;
create unique index deferred_ingestions_session_drive_file_idx
  on public.deferred_ingestions (drive_file_id, wizard_session_id) where wizard_session_id is not null;

create table public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete cascade,
  code text not null,
  context jsonb not null,
  raised_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count int not null default 1,
  resolved_at timestamptz,
  resolved_by text
);
create unique index admin_alerts_one_unresolved_idx
  on public.admin_alerts (coalesce(show_id::text, ''), code) where resolved_at is null;
create index admin_alerts_unresolved_recent_idx
  on public.admin_alerts (raised_at desc) where resolved_at is null;

create table public.drive_watch_channels (
  id text primary key,
  status text not null default 'pending',
  watched_folder_id text not null,
  webhook_secret text not null,
  resource_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  superseded_at timestamptz,
  stopped_at timestamptz,
  constraint drive_watch_channels_status_check check (
    status in ('pending', 'active', 'superseded', 'stopping', 'stopped', 'orphaned')
  ),
  constraint drive_watch_channels_active_requires_drive_state check (
    status <> 'active' or (resource_id is not null and expires_at is not null)
  )
);
create unique index drive_watch_channels_one_active_per_folder_idx
  on public.drive_watch_channels (watched_folder_id) where status = 'active';
create index drive_watch_channels_lookup_idx
  on public.drive_watch_channels (id) where status = 'active';
create index drive_watch_channels_renewal_due_idx
  on public.drive_watch_channels (expires_at) where status = 'active';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id),
  reported_by_kind text not null check (reported_by_kind in ('admin', 'crew')),
  reported_by text not null,
  reporter_role text,
  context jsonb not null,
  message text,
  github_issue_url text,
  idempotency_key uuid not null default gen_random_uuid() unique,
  processing_lease_until timestamptz,
  lease_holder uuid,
  created_at timestamptz not null default now()
);
create index reports_show_id_idx on public.reports (show_id, created_at desc);
create index reports_reporter_idx on public.reports (reported_by, created_at desc);

create table public.report_rate_limits (
  kind text not null check (kind in ('admin', 'crew')),
  identity text not null,
  hour_bucket timestamptz not null,
  count int not null default 1,
  primary key (kind, identity, hour_bucket)
);

create table public.onboarding_scan_manifest (
  id uuid primary key default gen_random_uuid(),
  folder_id text not null,
  wizard_session_id uuid not null,
  drive_file_id text not null,
  mime_type text not null,
  name text not null,
  status text not null check (
    status in (
      'staged',
      'hard_failed',
      'skipped_non_sheet',
      'applied',
      'defer_until_modified',
      'permanent_ignore',
      'discard_retryable',
      'live_row_conflict'
    )
  ),
  observed_at timestamptz not null default now(),
  transitioned_at timestamptz not null default now(),
  unique (wizard_session_id, drive_file_id)
);
create index onboarding_scan_manifest_session_idx
  on public.onboarding_scan_manifest (wizard_session_id, status);

create table public.pending_snapshot_uploads (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  drive_file_id text not null,
  temp_prefix text not null,
  snapshot_revision_id uuid not null,
  asset_count int not null,
  uploaded_at timestamptz not null default now(),
  promoted_at timestamptz,
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  delete_started_at timestamptz,
  promote_started_at timestamptz,
  constraint pending_snapshot_uploads_temp_prefix_key unique (temp_prefix),
  constraint pending_snapshot_uploads_snapshot_revision_id_key unique (snapshot_revision_id),
  constraint pending_snapshot_uploads_asset_count_check check (asset_count >= 0),
  constraint pending_snapshot_uploads_claim_symmetry_check check (
    (
      claim_token is null
      and claimed_at is null
      and claim_expires_at is null
    )
    or (
      claim_token is not null
      and claimed_at is not null
      and claim_expires_at is not null
    )
  ),
  constraint pending_snapshot_uploads_delete_requires_claim_check check (
    delete_started_at is null or claim_token is not null
  ),
  constraint pending_snapshot_uploads_delete_invariant_check check (
    delete_started_at is null or promoted_at is null
  )
);
create index pending_snapshot_uploads_unpromoted_idx
  on public.pending_snapshot_uploads (uploaded_at)
  where promoted_at is null and claim_token is null;
create index pending_snapshot_uploads_claim_expiry_idx
  on public.pending_snapshot_uploads (claim_expires_at)
  where claim_token is not null and promoted_at is null and delete_started_at is null and promote_started_at is null;
create index pending_snapshot_uploads_promote_stuck_idx
  on public.pending_snapshot_uploads (promote_started_at)
  where promote_started_at is not null and promoted_at is null;
create index pending_snapshot_uploads_committing_delete_idx
  on public.pending_snapshot_uploads (delete_started_at)
  where delete_started_at is not null;

create table public.revision_race_cooldowns (
  drive_file_id text not null,
  raced_head_revision_id text not null,
  last_race_at timestamptz not null default now(),
  retry_count int not null default 0,
  primary key (drive_file_id, raced_head_revision_id)
);
create index revision_race_cooldowns_last_race_idx on public.revision_race_cooldowns (last_race_at);

create table public.wizard_finalize_checkpoints (
  id uuid primary key default gen_random_uuid(),
  wizard_session_id uuid not null unique,
  last_processed_drive_file_id text,
  last_processed_at timestamptz,
  batches_completed int not null default 0,
  status text not null default 'in_progress' check (
    status in ('in_progress', 'all_batches_complete', 'final_cas_done')
  )
);
create index wizard_finalize_checkpoints_status_idx
  on public.wizard_finalize_checkpoints (status) where status <> 'final_cas_done';

create table public.shows_pending_changes (
  id uuid primary key default gen_random_uuid(),
  wizard_session_id uuid not null,
  drive_file_id text not null,
  show_id uuid not null references public.shows(id) on delete cascade,
  payload jsonb not null,
  applied_by_email text not null,
  applied_at_intent timestamptz not null,
  staged_at timestamptz not null default now(),
  unique (wizard_session_id, drive_file_id)
);
create index shows_pending_changes_session_idx on public.shows_pending_changes (wizard_session_id);
create index shows_pending_changes_show_idx on public.shows_pending_changes (show_id);

create table public.recovery_drift_cooldowns (
  show_id uuid not null,
  preview_revision_id uuid not null,
  last_drift_at timestamptz not null default now(),
  retry_count int not null default 0,
  primary key (show_id, preview_revision_id)
);
create index recovery_drift_cooldowns_last_drift_idx on public.recovery_drift_cooldowns (last_drift_at);
