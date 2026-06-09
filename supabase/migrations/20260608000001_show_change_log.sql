-- Phase 1 Task 1.2 — show_change_log: per-show changes-feed source + before/after images.
-- DDL is the canonical "Shared contracts" block from
-- docs/superpowers/plans/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate/00-overview.md.
-- Read posture (F9): before_image/after_image carry crew PII (email/phone/role/...) — admin-only:
-- RLS enabled, NO anon/authenticated SELECT or DML; the feed reads as service_role.

create table if not exists public.show_change_log (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references public.shows(id) on delete cascade,
  drive_file_id text not null,
  occurred_at   timestamptz not null default now(),
  source        text not null,
  change_kind   text not null,
  entity_ref    text,
  summary       text not null,
  before_image  jsonb,
  after_image   jsonb,
  status        text not null,
  undo_of       uuid references public.show_change_log(id),
  created_by    text not null default 'system'
);

-- CHECKs: DROP IF EXISTS + ADD for apply-twice idempotency + future-value widening.
alter table public.show_change_log drop constraint if exists show_change_log_source_chk;
alter table public.show_change_log add  constraint show_change_log_source_chk
  check (source in ('auto_apply','mi11_approve','mi11_reject','undo'));
alter table public.show_change_log drop constraint if exists show_change_log_status_chk;
alter table public.show_change_log add  constraint show_change_log_status_chk
  check (status in ('applied','pending','rejected','undone','superseded'));
-- change_kind is open-ended (STRUCTURAL values only, never an MI-* invariant code — the
-- /^MI-/ taxonomy is enforced by tests/db/show-change-log-change-kind-taxonomy.test.ts, not the
-- DB CHECK); guard only against empty so a row always carries a renderable kind.
alter table public.show_change_log drop constraint if exists show_change_log_change_kind_chk;
alter table public.show_change_log add  constraint show_change_log_change_kind_chk
  check (length(change_kind) > 0);

create index if not exists show_change_log_feed_idx
  on public.show_change_log (show_id, occurred_at desc);

-- PostgREST DML lockdown + admin-only read (F9).
alter table public.show_change_log enable row level security;
revoke all on table public.show_change_log from anon, authenticated;
grant all on table public.show_change_log to service_role;
-- deny-by-default: NO anon/authenticated RLS policy is created (service-role bypasses RLS).
