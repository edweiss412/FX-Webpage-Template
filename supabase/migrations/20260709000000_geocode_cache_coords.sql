-- Flow 8.3a: capture venue coordinates so ingest enrich can derive venue.timezone offline
-- (lib/time/coordsToTimezone.ts). Nullable — legacy rows and un-coordinatable venues
-- (ZERO_RESULTS / no geometry) keep NULL and fall back to the ET default with a
-- gate-exempt VENUE_TIMEZONE_UNRESOLVED warning. Columns inherit the table's existing
-- REVOKE (service-role-only); no grant/lockdown change. Idempotent.
alter table public.geocode_cache
  add column if not exists lat double precision,
  add column if not exists lng double precision;
