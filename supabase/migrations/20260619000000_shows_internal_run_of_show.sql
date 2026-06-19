-- Phase 2 §02 (crew-page-redesign): AGENDA run-of-show storage.
--
-- shows_internal.run_of_show: per-day parsed run-of-show, keyed ISODate -> AgendaEntry[],
-- nullable default null. Lives on the ADMIN-ONLY shows_internal table (admin_only RLS
-- using(is_admin()), 20260501002000_rls_policies.sql:62-65), NEVER public.shows: shows is
-- crew-readable via crew_read (can_read_show membership, NO per-day gate), so a shows.run_of_show
-- column would be directly PostgREST-readable and bypass the projection's DateRestriction gate (D-3).
-- The only read path is the service-role projection in getShowForViewer (per-day + current-date gate).
--
-- Written CONFIRMED-ONLY full-replace by the service-role sync under the per-show advisory lock (D-2).
--
-- Apply-twice idempotent: add column if not exists.
alter table public.shows_internal
  add column if not exists run_of_show jsonb;
