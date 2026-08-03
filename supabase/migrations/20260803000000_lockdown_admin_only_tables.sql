-- DB-lockdown-trio Task 2 (spec docs/superpowers/specs/db/2026-08-02-db-lockdown-trio-design.md §4.2).
-- Statement-level lockdown for the eight remaining §4.3 admin-only tables whose
-- DML was never revoked. Probe evidence in spec §2.3: an ADMIN-authenticated
-- session could INSERT/UPDATE/DELETE these tables directly through PostgREST,
-- bypassing every SECURITY DEFINER RPC gate -- its advisory locks, its
-- atomicity, and its audit emission. Non-admin crew were already blocked at
-- the row level by admin_only RLS; this closes the admin-session bypass on the
-- eight tables listed below, so the RPC is the only door FOR THOSE EIGHT.
--
-- The §2.3 probe was demonstrated on admin_alerts (forging resolved_by), but
-- admin_alerts is deliberately NOT revoked here -- see the class-(c) note
-- below. That bypass remains open by decision, not by oversight.
--
-- SELECT is deliberately RETAINED: admin UI reads and the observe CLI depend on
-- it, and admin_only RLS remains the row-level gate for reads.
--
-- app_settings and admin_alerts are NOT included. Their write paths name RLS as
-- the authoritative gate in their own comments
-- (app/admin/settings/_actions/setAutoPublish.ts:47, app/admin/actions.ts:139),
-- so revoking would invert a deliberate trust boundary rather than reinforce
-- one. They carry ADMIN_DML_EXEMPTIONS rows instead (spec §4.1 class (c), §11).
--
-- Registry rows: tests/db/postgrest-dml-lockdown.test.ts (RPC_GATED_TABLES).
-- The Layer 4 meta-assertion enforces the migration<->registry lockstep in both
-- directions, which is why those rows land in this same commit.
--
-- Idempotent: REVOKE/GRANT are no-ops when already applied.
begin;
revoke insert, update, delete on table public.sync_log                 from anon, authenticated;
revoke insert, update, delete on table public.reports                  from anon, authenticated;
revoke insert, update, delete on table public.sync_audit               from anon, authenticated;
revoke insert, update, delete on table public.drive_watch_channels     from anon, authenticated;
revoke insert, update, delete on table public.report_rate_limits       from anon, authenticated;
revoke insert, update, delete on table public.pending_snapshot_uploads from anon, authenticated;
revoke insert, update, delete on table public.revision_race_cooldowns  from anon, authenticated;
revoke insert, update, delete on table public.recovery_drift_cooldowns from anon, authenticated;
grant all privileges on table public.sync_log                 to service_role;
grant all privileges on table public.reports                  to service_role;
grant all privileges on table public.sync_audit               to service_role;
grant all privileges on table public.drive_watch_channels     to service_role;
grant all privileges on table public.report_rate_limits       to service_role;
grant all privileges on table public.pending_snapshot_uploads to service_role;
grant all privileges on table public.revision_race_cooldowns  to service_role;
grant all privileges on table public.recovery_drift_cooldowns to service_role;
commit;
