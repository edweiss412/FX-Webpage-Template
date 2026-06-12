-- M12.13 — auto-publish undo delivery: SCHEMA-ADDITIVE migration (spec §4.4/§4.5).
--
-- DEPLOYMENT ORDERING: this file is schema-first — apply it BEFORE deploying any
-- artifact whose notify code can emit kind='auto_publish_undo'. The CHECK widening
-- and the new column must exist in the target DB before the new writer runs, or
-- delivery inserts fail exactly when Doug should receive the undo email
-- (M12.13 plan R4). It is the ordinary additive half; the residue scrub is a
-- SEPARATE producer-first migration (20260612000003).
--
-- Apply-twice idempotent: DROP IF EXISTS + ADD on the constraint; ADD COLUMN IF NOT EXISTS.

-- The auto-publish undo email is the 4th email_deliveries kind (spec §4.4).
alter table public.email_deliveries drop constraint if exists email_deliveries_kind_check;
alter table public.email_deliveries add constraint email_deliveries_kind_check
  check (kind in ('realtime_problem', 'digest', 'auto_publish_undo'));

-- Dedicated toggle gating the auto-publish undo email (spec §4.5; default ON,
-- mirrors B3's 20260602000003 notify-column pattern).
alter table public.app_settings
  add column if not exists alert_on_auto_publish boolean not null default true;
