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

-- PostgREST DML lockdown (AGENTS.md cross-cutting rule): writes flow ONLY through the
-- resolve-blocker/finalize-cas routes' privileged postgres.js connection. Include PUBLIC
-- per the class-wide default-ACL reason (tests/db/postgrest-dml-lockdown.test.ts).
revoke insert, update, delete on public.onboarding_rebuild_attempts from public, anon, authenticated;
revoke select on public.onboarding_rebuild_attempts from public, anon, authenticated;
