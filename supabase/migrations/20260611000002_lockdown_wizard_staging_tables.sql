-- F1 Task 1.3 (onboarding-fixups plan R55-1/R56-2): PostgREST DML lockdown for the wizard
-- staging tables, shipped BEFORE any created_show_id consumer exists. The manifest's
-- created_show_id provenance column (20260611000000) drives the Phase D publish flip and the
-- F4 cleanup/reap deletes — an admin-authed PostgREST UPDATE forging created_show_id (or a
-- shadow payload / checkpoint status) must be impossible. Mutations flow exclusively through
-- the finalize / scan / session-lifecycle service-role SQL paths (per-show advisory locks,
-- AGENTS.md invariant 2). SELECT is retained for admin UI reads.
--
-- Registry rows: tests/db/postgrest-dml-lockdown.test.ts (RPC_GATED_TABLES) — the Layer 4
-- meta-assertion enforces the migration↔registry lockstep.
--
-- Idempotent: REVOKE/GRANT are no-ops when already applied.
begin;
revoke insert, update, delete on table public.onboarding_scan_manifest  from anon, authenticated;
revoke insert, update, delete on table public.wizard_finalize_checkpoints from anon, authenticated;
revoke insert, update, delete on table public.shows_pending_changes    from anon, authenticated;
grant all privileges on table public.onboarding_scan_manifest   to service_role;
grant all privileges on table public.wizard_finalize_checkpoints to service_role;
grant all privileges on table public.shows_pending_changes      to service_role;
commit;
