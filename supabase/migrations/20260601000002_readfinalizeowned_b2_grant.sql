-- M12.2 Phase B2 Task 6.2 fix — make public.readfinalizeowned_b2(uuid)
-- PostgREST-callable by the authenticated admin session.
--
-- readfinalizeowned_b2 (migration 20260601000000_b2_show_lifecycle.sql:13) is
-- the canonical finalize-owned predicate: it returns true iff an ACTIVE wizard
-- finalize checkpoint owns the show (two EXISTS subqueries over
-- onboarding_scan_manifest + shows_pending_changes joined to
-- wizard_finalize_checkpoints with status in ('in_progress',
-- 'all_batches_complete')). It is the SAME function the archive/publish/DEF-1
-- guards use server-side; the dashboard now reads it to render the
-- Held-vs-"Publishing…" pill split (spec §3.2) instead of the unsound
-- requires_resync proxy (which a clean Unarchive catch-up clears, so the normal
-- Held state would have been mislabeled "Publishing…").
--
-- The function was defined SECURITY DEFINER + STABLE but left without an
-- explicit grant, so it retained only the Postgres default PUBLIC EXECUTE. The
-- rest of this project's RPCs follow an explicit `revoke all from public` +
-- `grant execute to authenticated` convention; this migration brings
-- readfinalizeowned_b2 in line so the dashboard's `supabase.rpc(...)` call is
-- backed by an explicit grant (and survives any future blanket function-revoke).
-- It is a read-only predicate over admin-visible state; anon never needs it.
--
-- Apply-twice idempotent: revoke + grant are naturally idempotent.

revoke all on function public.readfinalizeowned_b2(uuid) from public, anon;
grant execute on function public.readfinalizeowned_b2(uuid) to authenticated, service_role;
