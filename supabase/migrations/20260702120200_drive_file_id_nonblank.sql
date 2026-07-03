-- Reject empty/whitespace-only drive_file_id at the DB — the only write-side enforcement
-- layer. The JS assertNonEmptyDriveFileId guard (lib/drive/fetch.ts) is READ-path only and
-- covers ZERO writes; every INSERT/UPSERT/RPC that persists a drive_file_id bypasses it, and
-- shows.drive_file_id is the advisory-lock key source (hashtext('show:' || drive_file_id)), so
-- a blank collapses distinct shows onto one lock — a correctness/deadlock hazard.
--
-- Predicate `~ '[^[:space:]]'` ("contains at least one non-whitespace char") is the faithful
-- SQL translation of the JS `/\S/` guard. It rejects tab/newline-only values, which the naive
-- `btrim(x) <> ''` would wrongly ACCEPT (btrim strips only ASCII space U+0020).
--
-- Apply-twice safe: every constraint is DROP CONSTRAINT IF EXISTS then ADD CONSTRAINT, per row.
-- Scope: every column named exactly `drive_file_id` — 14 public (12 NOT NULL + 2 NULLABLE) plus
-- the 5-table dev.* clone subset that carries the column. NOT NULL columns keep their existing
-- NOT NULL (a bare regex CHECK passes NULL); NULLABLE columns use the explicit `is null or` form.
-- The dev block uses `alter table if exists dev.<t>` so it is a no-op on any target lacking the
-- dev clone (e.g. a validation project without the local-seed schema) — the shape never needs a
-- per-target rewrite.

-- ── NOT NULL columns (public) — 12 ────────────────────────────────────────────
alter table public.shows drop constraint if exists shows_drive_file_id_nonblank;
alter table public.shows add constraint shows_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.pending_syncs drop constraint if exists pending_syncs_drive_file_id_nonblank;
alter table public.pending_syncs add constraint pending_syncs_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.pending_ingestions drop constraint if exists pending_ingestions_drive_file_id_nonblank;
alter table public.pending_ingestions add constraint pending_ingestions_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.sync_audit drop constraint if exists sync_audit_drive_file_id_nonblank;
alter table public.sync_audit add constraint sync_audit_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.deferred_ingestions drop constraint if exists deferred_ingestions_drive_file_id_nonblank;
alter table public.deferred_ingestions add constraint deferred_ingestions_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.onboarding_scan_manifest drop constraint if exists onboarding_scan_manifest_drive_file_id_nonblank;
alter table public.onboarding_scan_manifest add constraint onboarding_scan_manifest_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.pending_snapshot_uploads drop constraint if exists pending_snapshot_uploads_drive_file_id_nonblank;
alter table public.pending_snapshot_uploads add constraint pending_snapshot_uploads_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.revision_race_cooldowns drop constraint if exists revision_race_cooldowns_drive_file_id_nonblank;
alter table public.revision_race_cooldowns add constraint revision_race_cooldowns_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.shows_pending_changes drop constraint if exists shows_pending_changes_drive_file_id_nonblank;
alter table public.shows_pending_changes add constraint shows_pending_changes_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.show_change_log drop constraint if exists show_change_log_drive_file_id_nonblank;
alter table public.show_change_log add constraint show_change_log_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.sync_holds drop constraint if exists sync_holds_drive_file_id_nonblank;
alter table public.sync_holds add constraint sync_holds_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table public.agenda_extract_leases drop constraint if exists agenda_extract_leases_drive_file_id_nonblank;
alter table public.agenda_extract_leases add constraint agenda_extract_leases_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

-- ── NULLABLE columns (public) — 2 ─────────────────────────────────────────────
alter table public.sync_log drop constraint if exists sync_log_drive_file_id_nonblank;
alter table public.sync_log add constraint sync_log_drive_file_id_nonblank
  check (drive_file_id is null or drive_file_id ~ '[^[:space:]]');

alter table public.app_events drop constraint if exists app_events_drive_file_id_nonblank;
alter table public.app_events add constraint app_events_drive_file_id_nonblank
  check (drive_file_id is null or drive_file_id ~ '[^[:space:]]');

-- ── dev.* mirror — 5 (shows/pending_syncs/pending_ingestions/sync_audit NOT NULL; sync_log NULLABLE) ──
-- `if exists`: no-op on a target lacking the dev clone (e.g. validation), so the shape never rewrites.
alter table if exists dev.shows drop constraint if exists shows_drive_file_id_nonblank;
alter table if exists dev.shows add constraint shows_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table if exists dev.pending_syncs drop constraint if exists pending_syncs_drive_file_id_nonblank;
alter table if exists dev.pending_syncs add constraint pending_syncs_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table if exists dev.pending_ingestions drop constraint if exists pending_ingestions_drive_file_id_nonblank;
alter table if exists dev.pending_ingestions add constraint pending_ingestions_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table if exists dev.sync_audit drop constraint if exists sync_audit_drive_file_id_nonblank;
alter table if exists dev.sync_audit add constraint sync_audit_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

alter table if exists dev.sync_log drop constraint if exists sync_log_drive_file_id_nonblank;
alter table if exists dev.sync_log add constraint sync_log_drive_file_id_nonblank
  check (drive_file_id is null or drive_file_id ~ '[^[:space:]]');
