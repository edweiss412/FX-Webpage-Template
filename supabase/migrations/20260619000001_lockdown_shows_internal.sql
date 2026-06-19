-- Phase 2 §02 (crew-page-redesign R16-HIGH): PostgREST DML lockdown for shows_internal.
--
-- The sync's run_of_show write is a read-modify-replace (CONFIRMED-ONLY, D-2) under the
-- per-show advisory lock. A signed-in admin could otherwise `update shows_internal set
-- run_of_show = …` directly via PostgREST behind only the admin_only RLS — that path does
-- NOT take the advisory lock and could race/corrupt the merge. REVOKE makes the locked
-- service-role sync the single serialized writer.
--
-- The ONLY writer is the service-role sync (runScheduledCronSync.ts:1318-1334); getShowForViewer
-- only reads (service-role). So this whole-table REVOKE has zero functional impact — it removes
-- only the racy manual path (financials/parse_warnings/raw_unrecognized are locked down too, intended;
-- closes the shows_internal portion of BL-ADMIN-POSTGREST-DML-LOCKDOWN).
--
-- SELECT grant + admin_only RLS retained; service_role keeps all privileges.
-- Registry: tests/db/postgrest-dml-lockdown.test.ts RPC_GATED_TABLES (bidirectional meta-test :714/:738).
-- Idempotent: REVOKE/GRANT are no-ops when already applied.
begin;
revoke insert, update, delete on table public.shows_internal from anon, authenticated;
grant all privileges on table public.shows_internal to service_role;
commit;
