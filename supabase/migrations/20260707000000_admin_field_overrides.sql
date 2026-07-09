create table if not exists public.admin_overrides (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references public.shows(id) on delete cascade,
  domain         text not null,
  field          text not null,
  match_key      text not null,          -- '' for show singleton; parsed crew name; parsed hotel name (+ content disambiguator for same-name dups, §5.3)
  override_value jsonb not null,         -- structured (dates/venue) or json string (name/role/hotel_*)
  sheet_value    jsonb,                  -- last parsed value; refreshed each sync; null = never matched / parsed null
  active         boolean not null default true,   -- false = deactivated, row retained until repoint/discard
  deactivation_code text,                 -- R12: DURABLE pause reason. NULL when active; 'target_missing'|'name_conflict' when active=false. Set in-tx (not dependent on the best-effort alert). needs-attention renders copy from THIS.
  version        integer not null default 1,       -- R15/R30: optimistic-concurrency token guarding OVERRIDE STATE. Bumped +1 on every RPC override mutation (upsert-create/edit, revert, repoint, discard) AND on a sync-side DEACTIVATION (active=false) or reactivation. NOT bumped on a benign sync-side sheet_value refresh of a still-active override (R30) — sheet_value is a display-only column independent of override_value; bumping it would false-409 an admin's open edit on every routine cron sync (spuriously unusable). The RPC CAS detects concurrent override mutations + stale-deactivation, not benign chip refreshes.
  created_by     text not null,          -- canonicalized admin email (canonicalized at the RPC boundary; CHECK is the invariant-3 safety net)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- R12: the pause reason is durable, so needs-attention shows the right copy even if the
  -- best-effort admin_alert emit fails. Bound to `active`: present iff paused.
  constraint admin_overrides_deactivation_code_chk check (
    (active and deactivation_code is null)
    or (not active and deactivation_code in ('target_missing','name_conflict'))
  ),
  -- Invariant 3: schema-level CHECK is the email safety net (mirrors crew_members_email_canonical,
  -- 20260501000000_initial_public_schema.sql:44-46). created_by is always an admin email here
  -- (overrides have no 'system' path), so it must be lower/trim-canonical and non-empty.
  constraint admin_overrides_created_by_canonical check (
    created_by = lower(trim(created_by)) and created_by <> ''
  ),
  constraint admin_overrides_domain_field_chk check (
       (domain = 'show'  and field in ('dates','venue')          and match_key = '')
    or (domain = 'crew'  and field in ('name','role'))
    or (domain = 'hotel' and field in ('hotel_name','hotel_address'))
  ),
  constraint admin_overrides_uniq unique (show_id, domain, field, match_key)
);
create index if not exists admin_overrides_show_active_idx
  on public.admin_overrides (show_id) where active;

-- PostgREST DML lockdown (RPC-gated table discipline; invariant + BL-ADMIN-POSTGREST-DML-LOCKDOWN).
-- created_by holds an admin email (PII) → NO select for anon/authenticated either. Crew page never
-- reads this table (it reads the already-overridden live rows). All admin reads go via service-role
-- or the admin-only RLS policy below.
-- WRITES are RPC-only (INSERT/UPDATE/DELETE revoked from anon+authenticated → only the
-- service_role SECURITY DEFINER RPC mutates). READS are admin-only via RLS: SELECT is granted to
-- authenticated but an admin_only policy (public.is_admin()) confines rows to admins, so the
-- existing cookie-bound admin loaders (loadNeedsAttention, needsAttentionCount) can read the
-- inactive-override needs-attention stream WITHOUT new service-role plumbing. anon gets nothing.
-- created_by holds an admin email — visible ONLY to admins under the policy (accepted: admin emails
-- already surface across the admin UI). The crew page never reads this table.
revoke insert, update, delete on table public.admin_overrides from anon, authenticated;
revoke select                 on table public.admin_overrides from anon;
grant  select                 on table public.admin_overrides to authenticated;   -- gated by admin_only RLS below
grant  all privileges         on table public.admin_overrides to service_role;    -- service_role retains ALL (reads + RPC writes); required by postgrest-dml-lockdown registry
alter table public.admin_overrides enable row level security;
drop policy if exists admin_only on public.admin_overrides;   -- idempotency: CREATE POLICY has no IF NOT EXISTS; drop-first makes apply-twice safe
create policy admin_only on public.admin_overrides
  for select to authenticated
  using ( public.is_admin() );   -- canonical predicate (rls_policies.sql:23, ignored_warnings_rls.sql); service_role bypasses RLS

-- same migration file as admin_overrides (20260707000000_admin_field_overrides.sql)
alter table public.crew_members
  add column if not exists sheet_name text;   -- original parsed name when a name override is active; NULL otherwise
comment on column public.crew_members.sheet_name is
  'Set to the pre-override parsed name when an admin name override is active on this row (visibility alias, spec 2026-07-07 §3.5); NULL when name is un-overridden. Written only by the crew override write-transform.';
