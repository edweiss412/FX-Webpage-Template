-- Secondary-name Drive-ID nonblank CHECKs — the four columns the 2026-07-02 migration
-- (20260702120200_drive_file_id_nonblank.sql) left uncovered.
-- Spec: docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md
--
-- Three were deliberate deferrals of SECONDARY-NAME columns (that migration scoped itself to
-- "every column named exactly drive_file_id"). The fourth,
-- public.onboarding_rebuild_attempts.drive_file_id, is named EXACTLY drive_file_id and was
-- therefore always INSIDE that scope rule — it was created 16 days later
-- (20260718000000_onboarding_rebuild_attempts.sql:6) and never picked up a CHECK. That silent
-- drift is why this change also lands an executable coverage guard
-- (lib/driveIdCoverage/, tests/db/driveIdCoverage*.test.ts).
--
-- Predicate `~ '[^[:space:]]'` ("contains at least one non-whitespace char") is inherited verbatim
-- from the parent migration. `btrim(x) <> ''` would be WRONG here: btrim strips only ASCII space
-- U+0020, so it would ACCEPT a tab-only or newline-only value.
--
-- Apply-twice safe: every constraint is DROP CONSTRAINT IF EXISTS then ADD CONSTRAINT.
--
-- WRAPPED IN ONE TRANSACTION, unlike the parent migration. Under the `psql -f` path the post-
-- checklist prescribes, standalone statements let each DROP commit before its ADD — a reapply
-- briefly drops enforcement, and a failure partway (a data violation, an event-trigger rejection)
-- leaves the schema partially migrated with a previously-existing constraint removed. DDL is
-- transactional in Postgres, so one wrapping transaction makes this file all-or-nothing.
--
-- The dev block uses `alter table if exists dev.shows` so this file is a no-op on any target
-- lacking the dev clone (e.g. the validation project) — the shape never needs a per-target rewrite.
-- wizard_finalize_checkpoints and onboarding_rebuild_attempts are NOT in the dev clone
-- (20260502000000_dev_schema_clone.sql creates 12 dev.* tables; neither is among them), so they
-- take no dev mirror.
--
-- NOTE on the wizard_finalize_checkpoints constraint name. It is constrained from BOTH ends:
--   * the conventional `<table>_<column>_nonblank` form is
--     wizard_finalize_checkpoints_last_processed_drive_file_id_nonblank = 65 bytes, past Postgres's
--     63-byte identifier limit, and would be SILENTLY TRUNCATED; and
--   * it must KEEP the `_drive_file_id_nonblank` suffix, because the validation parity test's live
--     query filters on `conname like '%\_drive\_file\_id\_nonblank'`
--     (tests/db/validation-schema-parity.test.ts:261-263) — a name without it would sit in that
--     test's `expected` set and never appear in `live`, leaving the gate permanently RED.
-- Dropping the column-name prefix satisfies both: 50 bytes, suffix intact.

begin;

-- ── NULLABLE columns (public) ─────────────────────────────────────────────────
alter table public.shows drop constraint if exists shows_opening_reel_drive_file_id_nonblank;
alter table public.shows add constraint shows_opening_reel_drive_file_id_nonblank
  check (opening_reel_drive_file_id is null or opening_reel_drive_file_id ~ '[^[:space:]]');

alter table public.wizard_finalize_checkpoints
  drop constraint if exists wizard_finalize_checkpoints_drive_file_id_nonblank;
alter table public.wizard_finalize_checkpoints
  add constraint wizard_finalize_checkpoints_drive_file_id_nonblank
  check (last_processed_drive_file_id is null or last_processed_drive_file_id ~ '[^[:space:]]');

-- ── NOT NULL column (public) ──────────────────────────────────────────────────
-- Half of the composite PK (wizard_session_id, drive_file_id). A blank is a legal DISTINCT value
-- as far as the PK is concerned, so the PK provides no protection here.
alter table public.onboarding_rebuild_attempts
  drop constraint if exists onboarding_rebuild_attempts_drive_file_id_nonblank;
alter table public.onboarding_rebuild_attempts
  add constraint onboarding_rebuild_attempts_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');

-- ── dev.* mirror — 1 (dev.shows carries opening_reel_drive_file_id) ───────────
alter table if exists dev.shows drop constraint if exists shows_opening_reel_drive_file_id_nonblank;
alter table if exists dev.shows add constraint shows_opening_reel_drive_file_id_nonblank
  check (opening_reel_drive_file_id is null or opening_reel_drive_file_id ~ '[^[:space:]]');

commit;
