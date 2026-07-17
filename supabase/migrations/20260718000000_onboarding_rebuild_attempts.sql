-- Wizard blocker in-wizard resolution (2026-07-16 spec §3.3): cap counter for the
-- STAGED_*_CORRUPT rebuild action. Composite PK mirrors the recovery_drift_cooldowns
-- precedent (20260501001000_internal_and_admin.sql:447-453).
create table if not exists public.onboarding_rebuild_attempts (
  wizard_session_id uuid not null,
  drive_file_id text not null,
  attempts int not null default 0 check (attempts >= 0),
  escalation_logged boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (wizard_session_id, drive_file_id)
);

-- PostgREST DML lockdown (AGENTS.md cross-cutting rule): writes (and reads) flow ONLY
-- through the resolve-blocker route's privileged postgres.js connection. Mirrors the
-- show_share_tokens pattern (20260523000002_show_share_tokens.sql:43-44) rather than a
-- per-privilege revoke: `revoke all ... from public, anon, authenticated` closes every
-- privilege (including truncate/references/trigger/maintain), and the explicit
-- `grant all ... to service_role` makes service_role's ALL access an EXPLICIT grant
-- rather than a default-ACL assumption — robust regardless of how a fresh DB bootstrap
-- wires up default privileges (tests/db/postgrest-dml-lockdown.test.ts Layer 1).
revoke all on table public.onboarding_rebuild_attempts from public, anon, authenticated;
grant all privileges on table public.onboarding_rebuild_attempts to service_role;
