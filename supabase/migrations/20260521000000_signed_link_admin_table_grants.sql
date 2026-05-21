-- supabase/migrations/20260521000000_signed_link_admin_table_grants.sql
--
-- M9.5 (Codex R5 HIGH-1) — close the table-grant bypass on
-- public.crew_member_auth.
--
-- The M9.5 SECURITY DEFINER RPCs at
-- supabase/migrations/20260520000000_signed_link_admin_rpcs.sql
-- are the CANONICAL admin mutation surface for crew_member_auth.
-- They gate every mutation behind:
--   - is_admin()
-- - active crew_members row (Codex R1 M1 — orphan-auth-row soundness)
--   - pg_advisory_xact_lock(hashtext('show:' || drive_file_id))
-- - structured audit-log emission (Vercel function logs)
--
-- But the original RLS migration at
-- supabase/migrations/20260501002000_rls_policies.sql:99-105 granted
-- direct INSERT/UPDATE/DELETE on public.crew_member_auth to anon AND
-- authenticated. Combined with the admin_only RLS policy
-- (USING/WITH CHECK public.is_admin()), this means any authenticated
-- admin session could:
--   - Mutate current_token_version or revoked_below_version directly
--     via PostgREST.
--   - Skip the per-show advisory lock → race sync/apply paths.
--   - Skip the active-roster guard → resurrect orphaned auth rows.
--   - Skip the structured audit log → no operator trail.
--
-- That bypass makes the new RPC gates circumventable.
--
-- Fix: revoke INSERT/UPDATE/DELETE from anon + authenticated. Keep
-- SELECT so loadShowCrewWithAuth (admin per-show page render) and
-- the viewer-side bootstrap reads continue to work via PostgREST.
-- service_role retains ALL privileges so:
--   - The SECURITY DEFINER RPCs (owned by postgres/service_role)
--     continue to mutate the table via security-definer privilege
--     elevation.
--   - The sync paths (lib/sync/*.ts), which run via direct
--     DATABASE_URL pg.Pool connections as the superuser role rather
--     than via PostgREST, continue to write directly inside their
--     own per-show advisory locks.
--
-- This migration is idempotent: REVOKE on a privilege that doesn't
-- exist is a no-op.

revoke insert, update, delete on table public.crew_member_auth
  from anon, authenticated;

-- Defense-in-depth: explicitly re-affirm the SELECT grant so future
-- migrations that REVOKE ALL on this table for posture cleanup don't
-- inadvertently break the admin-page render path.
grant select on table public.crew_member_auth to anon, authenticated;

-- ----------------------------------------------------------------------
-- Symmetric lockdown of public.crew_members (Codex R6 HIGH-1 fix).
-- ----------------------------------------------------------------------
--
-- issue_new_link_rpc and revoke_all_links_rpc validate that an active
-- public.crew_members row exists for (show_id, crew_name) inside the
-- per-show advisory lock (Codex R1 M1). That predicate only linearizes
-- against writers that ALSO hold the same lock.
--
-- The original RLS migration at
-- supabase/migrations/20260501002000_rls_policies.sql granted
-- authenticated INSERT/UPDATE/DELETE on crew_members directly. A
-- compromised admin browser could therefore direct-DELETE a
-- crew_members row outside the lock window, racing
-- issue_new_link_rpc into issuing a live token version for a row
-- that was just removed — recreating the orphan-auth-row class the
-- R1 active-roster guard was supposed to close.
--
-- Production writers of crew_members all go through the sync
-- pipeline (lib/sync/runScheduledCronSync.ts) which connects via
-- DATABASE_URL pg.Pool as the superuser/postgres role, NOT through
-- PostgREST. The onboarding wizard does not write crew_members
-- directly either; its finalize path runs through the same sync apply
-- (via DATABASE_URL).
--
-- Conclusion: authenticated does NOT need direct DML on crew_members.
-- Lock it down with the same shape as crew_member_auth above.

revoke insert, update, delete on table public.crew_members
  from anon, authenticated;

-- Preserve SELECT — the admin per-show page render
-- (loadShowCrewWithAuth) AND viewer-side reads use crew_members
-- via PostgREST.
grant select on table public.crew_members to anon, authenticated;

-- service_role is unaffected. The original RLS migration's
-- `grant all privileges on table public.crew_member_auth to
-- service_role;` continues to apply for both tables.
