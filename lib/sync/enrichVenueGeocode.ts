/**
 * lib/sync/enrichVenueGeocode.ts — ingest-time venue→city enrichment (geocoding-at-
 * ingest). Called from enrichWithDrivePins (the single enrichment path both the
 * onboarding scan AND the cron sync use), so geocoding runs ONCE at stage time and is
 * persisted into parse_result.show.venue.city; it never re-runs on apply.
 *
 * Strictly best-effort: it MUTATES result.show.venue.city in place and NEVER throws.
 * A missing API key, a cache fault, a geocode error/timeout, or a "no city" answer all
 * leave venue.city unset, and the display (lib/venue/venueLocation.ts) falls back to the
 * address/name heuristics. The geocode call is tightly time-bounded (never hangs the
 * sync — the Drive-stall lesson), and a per-process circuit breaker stops calling Google
 * after repeated failures so an outage can't add latency to every venue in a big scan.
 */
import type { ParseResult } from "@/lib/parser/types";
import { geocodeVenueCity, isGeocodingConfigured } from "@/lib/geocoding/client";
import { geocodeCacheKey, readGeocodeCache, writeGeocodeCache } from "@/lib/geocoding/cache";

// Tight per-venue budget: one retry, 6s per attempt → ~12s worst case, then fall back.
const ENRICH_TIMEOUT_MS = 6_000;
const ENRICH_MAX_RETRIES = 1;
const MAX_CONSECUTIVE_FAILURES = 3;

// Per-process circuit breaker for the GOOGLE call only (never gates the cache read).
// After MAX consecutive geocode failures it opens for a cooldown, so an outage can't
// add latency to every uncached venue in a big scan AND it self-heals across warm-
// container reuse (a probe is allowed once the cooldown elapses).
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

/** Test-only: reset the per-process circuit breaker between cases. */
export function __resetGeocodeBreaker(): void {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
}

/** True iff fresh Google calls should be skipped right now. Half-opens (allows one
 * probe) once the cooldown has elapsed, so a transient blip can't disable geocoding
 * for the whole warm-container lifetime. */
function geocodeBreakerOpen(): boolean {
  if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) return false;
  if (Date.now() - breakerOpenedAt >= BREAKER_COOLDOWN_MS) {
    consecutiveFailures = MAX_CONSECUTIVE_FAILURES - 1; // half-open: one probe; a failure re-opens
    return false;
  }
  return true;
}

function recordGeocodeFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) breakerOpenedAt = Date.now();
}

export type EnrichVenueGeocodeDeps = {
  isConfigured: () => boolean;
  geocode: typeof geocodeVenueCity;
  cacheRead: typeof readGeocodeCache;
  cacheWrite: typeof writeGeocodeCache;
};

const defaultDeps: EnrichVenueGeocodeDeps = {
  isConfigured: isGeocodingConfigured,
  geocode: geocodeVenueCity,
  cacheRead: readGeocodeCache,
  cacheWrite: writeGeocodeCache,
};

export async function enrichVenueGeocode(
  result: ParseResult,
  deps: EnrichVenueGeocodeDeps = defaultDeps,
): Promise<void> {
  try {
    const venue = result.show.venue;
    if (!venue || !venue.name?.trim()) return; // canonicalize-exempt: venue name, not an email — nothing to geocode
    if (venue.city?.trim()) return; // canonicalize-exempt: venue city, not an email — already enriched (idempotent)
    if (!deps.isConfigured()) return; // no API key → offline fallback handles display

    const name = venue.name;
    const address = venue.address ?? "";
    const hash = geocodeCacheKey(name, address);

    // ALWAYS read the cache first — never gated by the breaker. A venue we've already
    // resolved must serve its cached city (and reset the breaker) even during a Google
    // outage that hasn't touched this row.
    const cached = await deps.cacheRead(hash);
    if (cached.kind === "hit") {
      consecutiveFailures = 0; // a reachable cache resets the breaker
      if (cached.city) venue.city = cached.city; // null-city hit → leave unset (fallback)
      return;
    }
    // miss OR infra_error → a fresh geocode is a NETWORK call; gate ONLY this on the
    // breaker so a Google outage can't add latency to every uncached venue in a scan.
    if (geocodeBreakerOpen()) return; // breaker open → leave unset (offline fallback)
    const res = await deps.geocode(name, address, {
      timeoutMs: ENRICH_TIMEOUT_MS,
      maxRetries: ENRICH_MAX_RETRIES,
    });
    if (res.error) {
      recordGeocodeFailure(); // a request failure trips the breaker (not_configured can't reach here)
      return; // leave venue.city unset (offline fallback)
    }
    consecutiveFailures = 0;
    const city = res.data.city; // string | null
    // Cache the answer (including a null city) so we don't re-query this venue. The
    // write is independently fault-tolerant (its own infra_error is ignored).
    await deps.cacheWrite({ queryHash: hash, venueName: name, venueAddress: address, city });
    if (city) venue.city = city;
  } catch {
    // never throw out of enrichment
  }
}
