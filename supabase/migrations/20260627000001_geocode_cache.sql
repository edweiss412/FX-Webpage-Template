-- Geocoding-at-ingest: a service-role-only cache of resolved venue cities so we don't
-- re-call the Google Geocoding API for a venue we've already resolved, and to honor
-- Google's ~30-day caching window via expires_at.
--
-- Keyed by query_hash = sha256(lower(trim(name)) || '|' || lower(trim(address))) so the
-- same venue across shows shares one cache row. `city` is NULLABLE — a null row means
-- "geocoded, but Google found no locality" (still a valid, cacheable answer that avoids
-- re-querying). Written ONLY by the locked service-role sync enrichment
-- (lib/sync/enrichVenueGeocode.ts) via lib/geocoding/cache.ts; never PostgREST-exposed.
--
-- Lockdown (AGENTS.md cross-cutting #1 / BL-ADMIN-POSTGREST-DML-LOCKDOWN): REVOKE ALL
-- from public/anon/authenticated; only service_role reads + writes. Registered in
-- tests/db/postgrest-dml-lockdown.test.ts RPC_GATED_TABLES (bidirectional meta-test).
-- Idempotent: create-if-not-exists + add-column-if-not-exists + drop/add constraints.

create table if not exists public.geocode_cache (
  query_hash text not null,
  venue_name text,
  venue_address text,
  city text,
  geocoded_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.geocode_cache
  add column if not exists query_hash text,
  add column if not exists venue_name text,
  add column if not exists venue_address text,
  add column if not exists city text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists expires_at timestamptz;

alter table public.geocode_cache
  alter column query_hash set not null,
  alter column geocoded_at set not null,
  alter column geocoded_at set default now(),
  alter column expires_at set not null;

alter table public.geocode_cache
  drop constraint if exists geocode_cache_pkey,
  add constraint geocode_cache_pkey primary key (query_hash);

create index if not exists geocode_cache_expires_at_idx on public.geocode_cache (expires_at);

revoke all on table public.geocode_cache from public, anon, authenticated;
grant all privileges on table public.geocode_cache to service_role;
alter table public.geocode_cache enable row level security;
