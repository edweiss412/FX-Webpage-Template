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

1. The next parse of any venue whose cache row predates the coords columns (NULL
   `lat`/`lng`) re-geocodes it once via the existing cold path, backfilling coords + city
   and setting `venue.timezone` — the warning stops without waiting out the 30-day TTL.
2. `reset_validation_data()` also clears `public.geocode_cache`, restoring virgin state.
3. No behavior change for: fresh rows with coords, cached ZERO_RESULTS rows (`city` NULL),
   unconfigured geocoding, breaker-open cold paths, or the VENUE_GEOCODE_UNRESOLVED /
   VENUE_TIMEZONE_UNRESOLVED mutual-exclusivity contract on the *cold* (no-cache-row) path.

Non-goals: no new §12.4 codes; no admin UI change; no `enrichVenueGeocode` /
`readGeocodeCache` behavior change; no change to cache TTL or breaker constants.

## 3. Design

### 3.1 Fix 1 — one-shot expiry of coord-less cache rows (R3 structural pivot)

Rounds 1-3 of adversarial review each broke a runtime "legacy row" discriminator on the
same vector: no value shape (`city` non-null + coords NULL), and no wall-clock cutoff
(coords-migration prefix, this-fix prefix), can PROVE which code version wrote a cache
row — every variant either strands a deploy-gap row (warns until TTL) or loops
(re-queries Google every parse). Per the project's same-vector rule, the resolution is
structural: **there is no runtime discriminator and no change to
`lib/sync/enrichVenueGeocode.ts` at all.**

Instead, the migration that ships Fix 2 (§3.2) also runs a one-shot expiry over every
fresh coord-less row:

```sql
do $$
declare
  n integer;
begin
  update public.geocode_cache
     set expires_at = now()
   where (lat is null or lng is null)
     and expires_at > now();
  get diagnostics n = row_count;
  raise notice 'geocode_cache one-shot expiry: % coord-less row(s) expired', n;
end $$;
```

**Blast-radius control (R4).** Each environment apply is preceded by the count preflight
`select count(*) from geocode_cache where (lat is null or lng is null) and expires_at >
now();` and the DO block reports the actual expired count in the apply output. Acceptable
threshold: **1,000 rows** — the table's cardinality is distinct-venues-scanned-per-30-days
(observed: 6 on validation; the product's domain is one AV company's show venues, so
hundreds is already implausible), and even the threshold costs ~US$5 of Geocoding API
quota spread across subsequent scans (successful cold-path calls are per-venue,
once-per-30-days, and remain bounded per-scan by the 6s/1-retry budget). If a preflight
ever exceeds the threshold, stop and batch the expiry instead — do not apply blind.

Effects:

- `readGeocodeCache` filters on `.gt("expires_at", now)` (`lib/geocoding/cache.ts:61`),
  so every expired row is a **miss**; the next parse of that venue takes the existing,
  fully-tested cold path — live geocode, coords + city written by `writeGeocodeCache`
  (upsert on `query_hash`, `lib/geocoding/cache.ts`), `venue.timezone` set via
  `coordsToTimezone`, warning gone. No new control flow, no breaker interaction beyond
  the cold path's existing rules, no refresh loop possible (there is no refresh).
- Authorship is irrelevant: the UPDATE acts on rows that EXIST at migration-apply time,
  and every environment's deployed writer has been coords-capable since the Flow 8.3a
  code shipped (migration `20260709000000`; later migrations `20260710000000`,
  `20260714000000` prove subsequent deploys). Rows written after the apply carry coords,
  or carry genuine NULL coords from a no-geometry/ZERO_RESULTS answer — which warn
  correctly and are not re-queried, exactly today's intended terminal behavior.
- Null-city coord-less rows (pre-coords ZERO_RESULTS *or* OK-but-no-locality — the two
  are indistinguishable in old rows, R3 finding 2) are expired too, so a venue that
  actually has geometry gets its coords and timezone on the next parse instead of
  waiting out the TTL.
- Cost: one extra Google geocode per distinct affected venue (6 rows on validation,
  bounded by the per-venue timeout/retry budget and circuit breaker on the cold path);
  cached-forever behavior resumes with the fresh 30-day row.
- Idempotent: a second apply matches nothing (`expires_at > now()` is false for rows the
  first apply expired). Safeupdate-safe: the UPDATE carries a real WHERE clause.
- `while the parse-time behavior is unchanged`, the transitional VENUE_TIMEZONE_UNRESOLVED
  warnings on already-staged rows disappear only when those shows are re-parsed (next
  scan/sync or reset+rescan) — acceptable; staged rows are consumed at finalize anyway.

**Guard conditions / unchanged behavior:** every path in `enrichVenueGeocode` is
untouched — venue absent/blank name, city already set, unconfigured, cache infra_error,
breaker semantics, VENUE_GEOCODE_UNRESOLVED vs VENUE_TIMEZONE_UNRESOLVED mutual
exclusivity (`lib/sync/enrichVenueGeocode.ts:69-95`). `readGeocodeCache` and
`writeGeocodeCache` are untouched. No new Supabase call sites, no new mutation surfaces,
no §12.4 changes.

### 3.2 Fix 2 — reset RPC clears `geocode_cache`

New migration `supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql`
carries BOTH fixes: the §3.1 one-shot expiry UPDATE, and
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
- **Concurrency scope (R4, accepted limitation):** venue enrichment writes `geocode_cache`
  OUTSIDE the per-show advisory-lock window (enrichment precedes the staging mutation), so
  a reset racing an in-flight scan can be followed by that scan re-inserting cache rows —
  the reset's advisory locks cannot fence them. This residue is bounded to quota-cache
  rows (never show/fixture data), is semantically harmless (a warm cache entry), and
  self-corrects (TTL, or the next reset). The reset is a manual maintenance action on the
  gate-enabled validation environment; requiring quiescence is its existing operational
  posture (same as every other non-lock-fenced side effect of an in-flight scan, e.g. a
  Drive fetch completing post-reset). A dedicated global advisory lock spanning
  `writeGeocodeCache` and the RPC would add a new cross-surface lock topology (holder
  analysis, deadlock meta-test, breaker interplay) to close a cosmetic race on a
  cache — rejected as disproportionate. Documented here so reviews don't re-derive it.
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
re-asserts; the expiry UPDATE's `expires_at > now()` predicate makes a second apply a
no-op) — apply-twice safe. One-shot data effect: fresh coord-less rows become expired
(a cache miss on the next read); the reset-RPC cache clear happens on the next reset
invocation.

Note: applying this to validation immediately expires its 6 legacy rows — the observed
warning storm ends at the next scan/re-parse, no reset required.

## 4. Test plan (TDD; concrete failure modes)

No `lib/` code changes, so `tests/sync/enrichVenueGeocode.test.ts` is untouched — its
existing suite (including "warns on a cache-hit with NULL coords" `:313` and cold-path
exclusivity `:337`) continues to pin the unchanged runtime behavior.

### `tests/db/resetValidationData.test.ts` (extend, realdb)

1. Seed a `geocode_cache` row (include the NULL-coords shape) alongside the existing
   graph seed; after `reset_validation_data()`, `count(geocode_cache) === 0` (catches:
   the RPC not clearing the table — the reported bug; fails before the migration exists).

### `tests/db/geocodeCacheCoordExpiry.test.ts` (new, realdb)

2. **Migration-content structural pin:** read the new migration file and assert it
   contains the one-shot UPDATE with `(lat is null or lng is null)` and a real WHERE
   clause (safeupdate discipline) (catches: the expire statement dropped or rewritten
   without a WHERE in a future edit; fails before the migration exists).
3. **Post-apply DB invariant:** against the local all-migrations-applied DB, insert a
   coord-less row with a future `expires_at` DIRECTLY (simulating a legacy row), run the
   migration's UPDATE statement verbatim (extracted from the file), and assert the row's
   `expires_at <= now()` while a coords-bearing sibling row keeps its future expiry
   (catches: the WHERE matching too much — expiring healthy rows — or too little; derives
   expectations from the seeded fixtures, not hardcoded row counts).
4. **Miss-path integration proof:** after (3), `readGeocodeCache` for the expired row's
   hash returns `{ kind: "miss" }` (catches: the expiry not actually flowing through the
   `.gt("expires_at", ...)` read filter — i.e. the fix not fixing the bug).

### Structural/meta suites (must stay green; no new registry rows needed)

- `tests/db/resetValidationDataDriveKeyedAudit.test.ts` + `resetValidationDataFkAudit.test.ts`
  (registries unchanged; they re-parse the NEW migration body via `_resetRpcSource.ts`,
  which auto-discovers the latest defining migration by filename sort).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (lock topology unchanged; reads latest body).
- `tests/db/resetValidationDataPostgrest.test.ts` (safeupdate discipline — the new DELETE
  carries `where ctid is not null`).
- `tests/auth/_metaInfraContract.test.ts` and observe read-only meta: untouched surfaces.
- No new Supabase call sites; no new mutation surfaces (invariant 10 N/A: no new
  route/action; the reset action's existing instrumentation is unchanged).

## 5. Flag lifecycle / matrices (checklist disposition)

- Tier×domain matrix: single table × (RPC delete path, tests) — covered in §3.2; all other
  layers N/A (no DDL, no CHECK, no trigger, no frontend change).
- CHECK/enum migration matrix: N/A — no CHECK or enum changes.
- Flag lifecycle: N/A — no new flags.
- Dimensional invariants / transition inventory: N/A — no UI.
- Numeric sweep: 30-day TTL (`:23`), 6s/1-retry budget (`:20-21`), breaker 3-failure/60s
  (`:22,28`) — all cited from live code, none changed.

## 6. Watchpoints (do-not-relitigate preempts)

- **Why a one-shot data migration instead of a runtime refresh (R1→R3 history):** three
  review rounds broke three successive runtime discriminators on the same authorship
  vector — value-shape loops on null-coords refresh results (R1), a coords-migration
  cutoff strands deploy-gap rows (R2), a fix-date cutoff strands same-day old-writer rows
  (R3). Row authorship is unprovable at runtime without a schema marker, and a marker
  column is permanent complexity for a 30-day transitional problem. The one-shot expiry
  sidesteps authorship entirely: it acts on rows that exist at apply time, and every
  post-apply writer is coords-capable (Flow 8.3a shipped in every environment before this
  fix, evidenced by later deploys `20260710000000`/`20260714000000`).
- **Why expire rather than delete the coord-less rows:** identical read-path effect
  (`.gt("expires_at", now)` makes both a miss), but expiry preserves the rows for
  forensics until the next successful upsert overwrites them; delete adds nothing.
- **Why null-city rows are expired too:** in pre-coords rows, cached ZERO_RESULTS and
  OK-but-no-locality are indistinguishable (R3 finding 2) — expiring both lets venues
  with real geometry recover coords/timezone; a genuine ZERO_RESULTS venue re-caches the
  same null answer once and returns to today's terminal behavior.
- **Why reset-vs-scan cache residue is accepted rather than locked away:** see §3.2
  "Concurrency scope" — quota-cache rows only, self-correcting, manual-maintenance
  context; a new global lock surface is disproportionate to a cosmetic race.
- **Why the expiry is not batched/gated by default:** the DO block reports the expired
  count and the documented preflight bounds it (§3.1); the 1,000-row threshold exceeds
  any plausible cardinality of this domain by an order of magnitude while costing ~US$5
  of quota if ever hit.
- **Why the reset deletes rather than expires the cache:** virgin state is the action's
  contract (this spec's origin); expiry-bumping would leave rows visible to future audits
  and save nothing (the next scan re-geocodes either way).
- **Why refresh-failure/warning-code semantics are out of scope:** the runtime is
  untouched; VENUE_GEOCODE_UNRESOLVED / VENUE_TIMEZONE_UNRESOLVED semantics are exactly
  today's shipped contract (`lib/sync/enrichVenueGeocode.ts:69-95`).
