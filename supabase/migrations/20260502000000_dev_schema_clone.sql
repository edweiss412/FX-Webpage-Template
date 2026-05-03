-- ============================================================================
-- M3 Task 3.1 — dev-schema clone for the /admin/dev panel
-- ============================================================================
--
-- This migration creates a `dev` schema that mirrors the M2 Phase-1 surfaces
-- in `public` so that the /admin/dev fixture-upload panel can write through
-- the canonical Phase-1 contract (parseSheet → enrichWithDrivePins →
-- runInvariants → phase1) WITHOUT touching production rows.
--
-- DESIGN DECISIONS (intentional):
--
-- 1. Verbatim copy of every public.* table, CHECK, FK, and index that the dev
--    panel exercises. Drift between public.* and dev.* is a P0 bug — the
--    `tests/db/dev-schema-parity.test.ts` drift sentinel introspects both
--    schemas and asserts column-by-column equivalence.
-- 2. RLS is NOT enabled on dev.*. The dev panel is admin-gated at the
--    application layer (lib/auth/requireAdmin.ts) AND tests run as service
--    role which bypasses RLS anyway. Adding RLS would require cloning every
--    is_admin() / can_read_show() helper and is unnecessary scope for M3.
-- 3. SECURITY DEFINER helpers (`is_admin`, `auth_email_canonical`,
--    `viewer_version_token`, `bump_last_changed_at`,
--    `publish_show_invalidation_after_statement`) live ONLY in `public`.
--    Dev-side SQL calls them via fully-qualified `public.is_admin()` etc.
-- 4. dev.* is intentionally a subset — only the Phase-1 write surfaces. We
--    do NOT clone reports, report_audit, admin_alerts, drive_watch_channels,
--    deferred_ingestions, onboarding_scan_manifest, pending_snapshot_uploads,
--    etc. because the M3 dev panel never writes to them. M6/M7 can extend the
--    clone if Apply-path testing needs more surfaces.
-- 5. `dev_truncate_all()` SECURITY DEFINER RPC is the canonical reset. It
--    truncates every dev.* table with CASCADE so the Playwright auto-truncate
--    setup hook can run as service-role without granting per-table truncate.
--
-- Required schemas exposed to PostgREST: add `"dev"` to `[api].schemas` in
-- supabase/config.toml. Without that, supabase-js .schema('dev').from(...)
-- returns 404 (PGRST106 — schema not exposed).

create schema if not exists dev;

-- pgcrypto extension is already created in 20260501000000_initial_public_schema.sql:1.
-- gen_random_uuid() resolves via extensions schema regardless of search_path.

-- ============================================================================
-- dev.shows — verbatim mirror of public.shows
-- ============================================================================
create table if not exists dev.shows (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  slug text not null unique,
  title text not null,
  client_label text not null,
  client_contact jsonb,
  template_version text not null,
  venue jsonb,
  dates jsonb,
  event_details jsonb,
  agenda_links jsonb,
  diagrams jsonb,
  opening_reel_drive_file_id text,
  opening_reel_drive_modified_time timestamptz,
  opening_reel_head_revision_id text,
  opening_reel_mime_type text,
  coi_status text,
  pull_sheet jsonb,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  archived boolean not null default false,
  published boolean not null default true,
  last_seen_modified_time timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- dev.crew_members
-- ============================================================================
create table if not exists dev.crew_members (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references dev.shows(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null,
  role_flags text[] not null default '{}',
  date_restriction jsonb,
  stage_restriction jsonb,
  flight_info text,
  last_changed_at timestamptz not null default now(),
  unique (show_id, name),
  constraint crew_members_email_canonical check (
    email is null or email = lower(trim(email))
  )
);

create unique index if not exists crew_members_show_email_unique
  on dev.crew_members (show_id, email)
  where email is not null;

-- ============================================================================
-- dev.hotel_reservations
-- ============================================================================
create table if not exists dev.hotel_reservations (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references dev.shows(id) on delete cascade,
  ordinal int not null,
  hotel_name text,
  hotel_address text,
  names text[] not null default '{}',
  confirmation_no text,
  check_in date,
  check_out date,
  notes text
);

-- ============================================================================
-- dev.rooms
-- ============================================================================
create table if not exists dev.rooms (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references dev.shows(id) on delete cascade,
  kind text not null,
  name text not null,
  dimensions text,
  floor text,
  setup text,
  set_time text,
  show_time text,
  strike_time text,
  audio text,
  video text,
  lighting text,
  scenic text,
  power text,
  digital_signage text,
  other text,
  notes text
);

-- ============================================================================
-- dev.transportation
-- ============================================================================
create table if not exists dev.transportation (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references dev.shows(id) on delete cascade,
  driver_name text,
  driver_phone text,
  driver_email text,
  vehicle text,
  license_plate text,
  color text,
  parking text,
  schedule jsonb not null default '[]'::jsonb,
  notes text,
  constraint transportation_driver_email_canonical check (
    driver_email is null or driver_email = lower(trim(driver_email))
  )
);

-- ============================================================================
-- dev.contacts
-- ============================================================================
create table if not exists dev.contacts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references dev.shows(id) on delete cascade,
  kind text not null,
  name text,
  email text,
  phone text,
  notes text,
  constraint contacts_email_canonical check (
    email is null or email = lower(trim(email))
  )
);

-- ============================================================================
-- dev.shows_internal
-- ============================================================================
create table if not exists dev.shows_internal (
  show_id uuid primary key references dev.shows(id) on delete cascade,
  financials jsonb,
  parse_warnings jsonb default '[]'::jsonb,
  raw_unrecognized jsonb default '[]'::jsonb
);

-- ============================================================================
-- dev.crew_member_auth
-- ============================================================================
create table if not exists dev.crew_member_auth (
  show_id uuid not null references dev.shows(id) on delete cascade,
  crew_name text not null,
  current_token_version int not null default 1,
  max_issued_version int not null default 1,
  revoked_below_version int not null default 0,
  last_changed_at timestamptz not null default now(),
  primary key (show_id, crew_name)
);

-- ============================================================================
-- dev.pending_syncs — verbatim mirror of public.pending_syncs
-- ============================================================================
create table if not exists dev.pending_syncs (
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
create index if not exists pending_syncs_wizard_session_idx
  on dev.pending_syncs (wizard_session_id) where wizard_session_id is not null;
create unique index if not exists pending_syncs_live_drive_file_idx
  on dev.pending_syncs (drive_file_id) where wizard_session_id is null;
create unique index if not exists pending_syncs_session_drive_file_idx
  on dev.pending_syncs (drive_file_id, wizard_session_id) where wizard_session_id is not null;

-- ============================================================================
-- dev.pending_ingestions — verbatim mirror of public.pending_ingestions
-- ============================================================================
create table if not exists dev.pending_ingestions (
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
create unique index if not exists pending_ingestions_live_drive_file_idx
  on dev.pending_ingestions (drive_file_id) where wizard_session_id is null;
create unique index if not exists pending_ingestions_session_drive_file_idx
  on dev.pending_ingestions (drive_file_id, wizard_session_id) where wizard_session_id is not null;

-- ============================================================================
-- dev.sync_audit
-- ============================================================================
create table if not exists dev.sync_audit (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references dev.shows(id) on delete cascade,
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
create index if not exists sync_audit_show_id_idx on dev.sync_audit (show_id, applied_at desc);
create index if not exists sync_audit_drive_file_id_idx on dev.sync_audit (drive_file_id, applied_at desc);

-- ============================================================================
-- dev.sync_log
-- ============================================================================
create table if not exists dev.sync_log (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references dev.shows(id) on delete cascade,
  drive_file_id text,
  status text not null,
  message text,
  parse_warnings jsonb default '[]'::jsonb,
  duration_ms int,
  occurred_at timestamptz not null default now()
);

-- ============================================================================
-- dev_truncate_all() — Service-role-callable RPC for Playwright auto-truncate.
-- ============================================================================
--
-- Truncates every dev.* table the panel may have written to. CASCADE handles
-- the FK chains (dev.shows → crew_members / hotel_reservations / rooms / etc).
--
-- Marked SECURITY DEFINER so the test harness can call it via the supabase-js
-- client without needing per-table grants. Restricted to service_role to
-- prevent accidental misuse from anon/authenticated.

create or replace function public.dev_truncate_all()
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  truncate table
    dev.shows,
    dev.crew_members,
    dev.hotel_reservations,
    dev.rooms,
    dev.transportation,
    dev.contacts,
    dev.shows_internal,
    dev.crew_member_auth,
    dev.pending_syncs,
    dev.pending_ingestions,
    dev.sync_audit,
    dev.sync_log
    cascade;
end;
$$;
revoke all on function public.dev_truncate_all() from public;
grant execute on function public.dev_truncate_all() to service_role;

-- ============================================================================
-- Grants on dev.* tables — service_role only (no RLS, no anon/authenticated).
-- ============================================================================
-- The /admin/dev page server actions call into dev.* via the cookie-bound
-- Supabase client. To make that work at runtime, the server actions wrap their
-- DB calls in `set local role service_role` after requireAdmin() passes —
-- effectively elevating to service_role only after the app-layer auth gate.
-- This avoids exposing dev.* to non-admin users at the DB layer while keeping
-- the panel's pipeline parity claim honest.
--
-- Tests invoke supabase.* with the service-role JWT directly, so no further
-- grant manipulation is needed there.

grant usage on schema dev to service_role;
grant all privileges on all tables in schema dev to service_role;
grant all privileges on all sequences in schema dev to service_role;
alter default privileges in schema dev grant all on tables to service_role;
alter default privileges in schema dev grant all on sequences to service_role;
