-- supabase/migrations/20260716000000_role_token_mappings.sql
-- Global admin-editable role-token -> capability mapping
-- (spec docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md §3).
create table public.role_token_mappings (
  token text primary key,
  grants text[] not null default '{}',
  decided_by text not null
    constraint role_token_mappings_decided_by_canonical
    check (decided_by = lower(btrim(decided_by)) and decided_by <> ''),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_token_mappings_token_canonical
    check (token = upper(btrim(token)) and length(token) between 1 and 64),
  constraint role_token_mappings_grants_allowed
    check (
      grants <@ array['A1','V1','L1','FINANCIALS']::text[]
      and array_position(grants, null) is null
    )
);

-- Read posture (spec §3): RLS enabled with ZERO policies = default-deny for
-- anon/authenticated PostgREST access. Deliberately STRICTER than the
-- admin_only-policy tables (20260501002000_rls_policies.sql:61-85) — this
-- table has NO client-session readers; every reader/writer is server-side
-- service-role. Do NOT add an admin_only policy here.
alter table public.role_token_mappings enable row level security;
grant all privileges on table public.role_token_mappings to service_role;
-- SELECT revoked explicitly too — posture never rests on RLS alone (plan-R2 F2).
revoke select, insert, update, delete on public.role_token_mappings from anon, authenticated;
