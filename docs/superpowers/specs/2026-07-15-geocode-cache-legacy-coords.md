# Spec — Legacy geocode-cache rows: coords refresh + reset coverage

**Date:** 2026-07-15
**Status:** Draft (autonomous ship; user review waived per AGENTS.md autonomous pipeline)
**Owner surface:** `lib/sync/enrichVenueGeocode.ts`, `supabase/migrations/` (reset RPC)

## 1. Problem

Flow 8.3a (`supabase/migrations/20260709000000_geocode_cache_coords.sql`) added nullable
`lat`/`lng` columns to `public.geocode_cache` (table created
`supabase/migrations/20260627000001_geocode_cache.sql`). Rows geocoded before 2026-07-09
have `city` set but `lat`/`lng` NULL, and stay fresh for the 30-day TTL
(`GEOCODE_CACHE_TTL_MS`, `lib/geocoding/cache.ts:23`).

`enrichVenueGeocode` (`lib/sync/enrichVenueGeocode.ts:115-120`) early-returns on any fresh
cache hit: it sets `venue.city` and calls `applyTimezoneOrWarn(result, venue, cached.lat,
cached.lng)`. With NULL coords, `coordsToTimezone` (`lib/time/coordsToTimezone.ts`) returns
null and the parse emits the gate-exempt `VENUE_TIMEZONE_UNRESOLVED` data-gap
(`lib/sync/enrichVenueGeocode.ts:90-94`). Because a hit never re-geocodes, the coords are
never backfilled — every parse of that venue warns until the row expires.

Observed on validation 2026-07-15: all 7 staged parses warned `VENUE_TIMEZONE_UNRESOLVED`;
all 6 `geocode_cache` rows had `city` set, `lat`/`lng` NULL, `expires_at` 2026-07-28.

Separately: the "Reset validation data" action's RPC `public.reset_validation_data()`
(latest definition `supabase/migrations/20260622000003_validation_reset_safeupdate.sql`)
predates the `geocode_cache` table by 5 days and does not delete it, so a reset does not
return validation to a virgin state for this table. Omission by timing, not decision.

## 2. Goals

1. A fresh parse whose venue has a legacy cache row (non-null `city`, NULL `lat`/`lng`)
   re-geocodes once, backfills coords into the cache, sets `venue.timezone`, and stops
   warning — without losing the already-resolved city if the refresh fails.
2. `reset_validation_data()` also clears `public.geocode_cache`, restoring virgin state.
3. No behavior change for: fresh rows with coords, cached ZERO_RESULTS rows (`city` NULL),
   unconfigured geocoding, breaker-open cold paths, or the VENUE_GEOCODE_UNRESOLVED /
   VENUE_TIMEZONE_UNRESOLVED mutual-exclusivity contract on the *cold* (no-cache-row) path.

Non-goals: no new §12.4 codes; no admin UI change; no backfill script for prod (the runtime
refresh self-heals prod on next parse); no change to cache TTL or breaker constants.

## 3. Design

### 3.1 Fix 1 — legacy-row refresh in `enrichVenueGeocode`

**Discriminator.** A cache hit is a **legacy/incomplete row** iff
`cached.city !== null && (cached.lat === null || cached.lng === null)`.

- `city` NULL rows (genuine cached ZERO_RESULTS — see `NO_COORDS` and
  `extractCity`/`extractCoords` in `lib/geocoding/client.ts:89-100,164`) are NOT refreshed:
  they keep today's behavior (leave city unset, warn `VENUE_TIMEZONE_UNRESOLVED` via the
  null-coords path). Refreshing them would re-query Google every parse for venues that
  legitimately don't resolve.
- `city` non-null with both coords present → normal hit, unchanged.
- `city` non-null with either coord NULL → legacy row (pre-7/09 write) or the
  near-impossible "city without geometry" response; both are honest coords gaps worth one
  live retry per parse. Retries are bounded by the existing per-venue timeout/retry budget
  (`ENRICH_TIMEOUT_MS`/`ENRICH_MAX_RETRIES`, `lib/sync/enrichVenueGeocode.ts:20-21`) and
  the circuit breaker.

**Behavior on legacy hit.** The hit still resets the breaker (`consecutiveFailures = 0`)
and still sets `venue.city` from the cached city immediately (no regression if the refresh
fails). Then, instead of `applyTimezoneOrWarn` + return, control falls through to the
refresh path (a live geocode), carrying the cached city as `legacyCity: string`:

| Refresh outcome | venue.city | venue.timezone | Warning | Cache write | Breaker |
|---|---|---|---|---|---|
| Breaker open | cached city (kept) | unset | `VENUE_TIMEZONE_UNRESOLVED` | none | untouched |
| Geocode `res.error` | cached city (kept) | unset | `VENUE_TIMEZONE_UNRESOLVED` (NOT `VENUE_GEOCODE_UNRESOLVED` — city IS resolved; the only gap is the timezone) | none (legacy row kept so a later parse retries) | `recordGeocodeFailure()` |
| Success, coords resolve to a tz | `res.data.city ?? legacyCity` | set via `coordsToTimezone` | none | upsert with `city: res.data.city ?? legacyCity`, fresh coords | reset |
| Success, coords null / tz unresolvable | `res.data.city ?? legacyCity` | unset | `VENUE_TIMEZONE_UNRESOLVED` | upsert with `city: res.data.city ?? legacyCity`, coords as returned | reset |

The `?? legacyCity` preserve means a refresh can never clobber a previously-resolved city
with null (e.g. a transient ZERO_RESULTS on a venue that resolved in June).

**Warning-code semantics (§6/§6.1 alignment).** Today the legacy hit emits
`VENUE_TIMEZONE_UNRESOLVED`; after this change every legacy-hit terminal state still emits
either that same code or nothing (when coords resolve). `VENUE_GEOCODE_UNRESOLVED` remains
reserved for the cold path where the *city* lookup genuinely failed — on the legacy path
the city is already known from cache. The two codes remain mutually exclusive per venue by
control flow. Warning message strings are unchanged (both already in
`lib/messages/catalog.ts`; no §12.4 edit, so no `gen:spec-codes` / catalog / enum
regeneration is triggered).

**Guard conditions.**
- `venue` absent / `venue.name` blank → unchanged no-op (`lib/sync/enrichVenueGeocode.ts:103`).
- `venue.city` already set → unchanged idempotent no-op (`:104`) — a show enriched by a
  successful refresh will short-circuit here on the next parse only if the parse carries
  the city forward; in the normal flow each parse starts from the sheet (city unset), reads
  the now-coords-bearing cache row, and takes the normal-hit path. Both routes stop warning.
- Geocoding unconfigured → unchanged no-op (`:105`) — legacy rows are then never consulted,
  same as today (cacheRead happens after the config gate).
- `cached.kind === "infra_error"` / `"miss"` → unchanged (existing cold path).
- Thrown anything → swallowed by the existing outer try/catch (`:157-159`).

### 3.2 Fix 2 — reset RPC clears `geocode_cache`

New migration `supabase/migrations/20260715<seq>_validation_reset_geocode_cache.sql`:
`create or replace function public.reset_validation_data()` with the FULL body of the
`20260622000003` definition plus one statement in the "clear-explicit" group:

```sql
  delete from public.geocode_cache where ctid is not null;
```

- `where ctid is not null` follows the safeupdate discipline established in
  `20260622000003_validation_reset_safeupdate.sql` (bare DELETEs are rejected session-wide
  by the preloaded `safeupdate` extension when called via PostgREST).
- `geocode_cache` has no `drive_file_id` column and no FK to `shows`, so: the advisory-lock
  key set is unchanged (single-holder topology preserved — the RPC remains the only holder,
  in-RPC layer, per `tests/auth/advisoryLockRpcDeadlock.test.ts`); delete order vs `shows`
  is unconstrained (placed with the other clear-explicit residue); the drive-keyed and FK
  audit registries (`tests/db/resetValidationDataDriveKeyedAudit.test.ts`,
  `tests/db/resetValidationDataFkAudit.test.ts`) need no rows.
- Re-assert the function ACL exactly as `20260622000003` does (`revoke ... from public,
  anon, authenticated; grant execute ... to service_role;`) so the migration is
  self-contained and idempotent on any apply order.
- Return payload unchanged: `jsonb_build_object('clearedShows', v_cleared)` — the action
  and its tests (`app/admin/settings/_actions/validationReset.ts`,
  `tests/admin/validationResetAction.test.ts`) read only `clearedShows`.
- Trade-off acknowledged in the migration comment: clearing the cache costs a handful of
  Google geocode calls on the first post-reset scan; virgin-state wins (this spec's origin:
  a reset that silently preserved stale cache rows).
- `tests/db/_resetRpcSource.ts` discovers the latest defining migration by filename sort,
  so every body-reading audit test automatically validates the NEW definition.

### 3.3 Migration lifecycle / parity

Per AGENTS.md validation-parity rule, in the same PR: apply locally + test →
`pnpm gen:schema-manifest` + commit regenerated manifest (no table DDL changes, so the
manifest is expected byte-identical; run it regardless and commit if changed) → apply the
migration surgically to the validation project (`psql "$TEST_DATABASE_URL" -f ...` then
`notify pgrst, 'reload schema';`). The migration is idempotent (`create or replace`; ACL
re-asserts) — apply-twice safe. One-shot data effect: none (function definition only; the
actual cache clear happens on the next reset invocation).

Note: applying this to validation also *immediately* fixes the observed warning storm the
next time "Reset validation data" + rescan runs, independent of Fix 1's deploy timing.

## 4. Test plan (TDD; concrete failure modes)

### `tests/sync/enrichVenueGeocode.test.ts` (extend/modify)

1. **MODIFY** existing "warns on a cache-hit with NULL coords (legacy / un-coordinatable
   venue)" (currently `:313`): split into the two now-divergent cases —
   a. `city` NULL + coords NULL (cached ZERO_RESULTS): unchanged behavior — warn, **no**
      `geocode` call (catches: refresh over-triggering on ZERO_RESULTS rows, which would
      re-query Google every parse).
   b. `city` non-null + coords NULL: now refreshes (below).
2. Legacy hit + refresh success with coords → `venue.city` set, `venue.timezone` set, NO
   warning, `cacheWrite` called with fresh coords and the resolved city (catches: coords
   never backfilled / warning persists — the original bug).
3. Legacy hit + refresh success but live city NULL → `venue.city` stays the cached city and
   `cacheWrite` receives `city: <cached city>` (catches: transient ZERO_RESULTS clobbering
   a previously-resolved city in both the parse and the cache).
4. Legacy hit + refresh `res.error` → `venue.city` = cached city, warning is
   `VENUE_TIMEZONE_UNRESOLVED` and NOT `VENUE_GEOCODE_UNRESOLVED`, no `cacheWrite`,
   breaker failure recorded (catches: wrong code on a resolved-city venue; cache row
   destroyed on a transient failure).
5. Legacy hit + breaker OPEN → no `geocode` call, `venue.city` = cached city, warning
   `VENUE_TIMEZONE_UNRESOLVED` (catches: refresh bypassing the breaker during an outage;
   silent-drop of the warning users see today).
6. Normal hit (city + coords present) → NO `geocode` call (catches: refresh
   over-triggering on healthy rows).
7. Existing suites (idempotency, unconfigured, cold-path exclusivity `:337`) stay green
   unmodified except (1).

Expected values derive from fixture constants (e.g. the fixture's lat/lng and
`coordsToTimezone`'s output for them), not hardcoded copies of implementation output —
consistent with the file's existing pattern.

### `tests/db/resetValidationData.test.ts` (extend, realdb)

8. Seed a `geocode_cache` row (any hash; include NULL-coords shape) alongside the existing
   graph seed; after `reset_validation_data()`, `count(geocode_cache) === 0` (catches: the
   RPC not clearing the table — the reported bug).

### Structural/meta suites (must stay green; no new registry rows needed)

- `tests/db/resetValidationDataDriveKeyedAudit.test.ts` + `resetValidationDataFkAudit.test.ts`
  (registries unchanged; they re-parse the NEW migration body via `_resetRpcSource.ts`).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (lock topology unchanged; reads latest body).
- `tests/db/resetValidationDataPostgrest.test.ts` (safeupdate discipline — the new DELETE
  carries `where ctid is not null`).
- `tests/auth/_metaInfraContract.test.ts` and observe read-only meta: untouched surfaces.
- No new Supabase call sites (Fix 1 reuses the injected `deps.cacheRead`/`cacheWrite`/
  `geocode`); no new mutation surfaces (invariant 10 N/A: no new route/action; the reset
  action's existing instrumentation is unchanged).

## 5. Flag lifecycle / matrices (checklist disposition)

- Tier×domain matrix: single table × (RPC delete path, tests) — covered in §3.2; all other
  layers N/A (no DDL, no CHECK, no trigger, no frontend change).
- CHECK/enum migration matrix: N/A — no CHECK or enum changes.
- Flag lifecycle: N/A — no new flags.
- Dimensional invariants / transition inventory: N/A — no UI.
- Numeric sweep: 30-day TTL (`:23`), 6s/1-retry budget (`:20-21`), breaker 3-failure/60s
  (`:22,28`) — all cited from live code, none changed.

## 6. Watchpoints (do-not-relitigate preempts)

- **Why refresh keys on `city !== null` rather than a `geocoded_at` cutoff:** a cutoff
  constant would rot and requires selecting `geocoded_at` in `readGeocodeCache`; the
  city/coords shape discriminator is stable, and the only false-positive class
  (city-without-geometry live responses) is near-impossible per the Geocoding API (geometry
  is a required member of every result) and degrades to one bounded retry per parse.
- **Why refresh-failure emits `VENUE_TIMEZONE_UNRESOLVED`, not `VENUE_GEOCODE_UNRESOLVED`:**
  the city IS resolved (from cache); `VENUE_GEOCODE_UNRESOLVED`'s catalog copy is
  "Couldn't look up the venue city from its address" which would be false. The tz code's
  copy is exactly the user-visible truth. Mutual exclusivity per venue is preserved.
- **Why the reset deletes rather than expires the cache:** virgin state is the action's
  contract (this spec's origin); expiry-bumping would leave rows visible to future audits
  and save nothing (the next scan re-geocodes either way).
- **Why no prod backfill migration:** Fix 1 self-heals any environment on the next parse of
  each venue; a data migration would duplicate that for no additional safety.
