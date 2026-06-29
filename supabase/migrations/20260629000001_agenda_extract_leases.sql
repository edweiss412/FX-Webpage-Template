-- Agenda extract lease: per-staged-row dedupe + deployment-wide cap (live-lease count).
create table if not exists public.agenda_extract_leases (
  wizard_session_id uuid not null,
  drive_file_id text not null,
  owner text not null,
  expires_at timestamptz not null,
  primary key (wizard_session_id, drive_file_id)
);
create index if not exists agenda_extract_leases_expires_at_idx
  on public.agenda_extract_leases (expires_at);
-- RPC-gated: mutated only via the endpoint's raw postgres.js; no client DML or SELECT.
-- REVOKE ALL removes every privilege (including TRUNCATE/REFERENCES/TRIGGER from Supabase
-- schema defaults) so information_schema.role_table_grants is empty for anon/authenticated.
revoke all on table public.agenda_extract_leases from public, anon, authenticated;
grant all privileges on table public.agenda_extract_leases to service_role;
