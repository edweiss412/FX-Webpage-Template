-- "Use the sheet's raw value" decisions (spec 2026-07-10-structural-transform-use-raw §3).
-- Two homes for the same UseRawDecision[] shape:
--   pending_syncs.use_raw_decisions  — STAGED, per wizard session (pre-publish)
--   shows_internal.use_raw_decisions — PERSISTED, per published show (post-publish)
-- Both default to an empty array so every existing/new row reads cleanly with no
-- backfill. Mutations flow ONLY through the two SECURITY-adjacent server actions
-- under the per-show advisory lock; direct PostgREST DML is already REVOKEd on both
-- tables (shows_internal: 20260619000001_lockdown_shows_internal.sql; pending_syncs:
-- 20260601000000_b2_show_lifecycle.sql) — column-level access inherits the table
-- REVOKE, so no new REVOKE is required. Idempotent (add-if-not-exists).
alter table public.pending_syncs
  add column if not exists use_raw_decisions jsonb not null default '[]'::jsonb;

alter table public.shows_internal
  add column if not exists use_raw_decisions jsonb not null default '[]'::jsonb;
