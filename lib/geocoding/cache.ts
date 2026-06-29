/**
 * lib/geocoding/cache.ts — service-role read/write for the public.geocode_cache table
 * (geocoding-at-ingest). Keyed by a sha256 of the normalized venue name+address so the
 * same venue across shows shares one row; `city` may be null ("geocoded, no locality"),
 * which is still a valid cached answer. Rows expire after ~30 days (Google's caching
 * window) — an expired row reads as a MISS and is refreshed by the next write.
 *
 * Supabase call-boundary discipline (AGENTS.md invariant 9): every call destructures
 * { data, error }; returned errors AND thrown construction/query faults map to a typed
 * `{ kind: 'infra_error' }` result and NEVER throw — so the enrichment treats any cache
 * fault as a miss and proceeds (best-effort). Registered in tests/sync/_metaInfraContract.test.ts.
 */
import { createHash } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

const TABLE = "geocode_cache";
/** ~30 days — honors Google's geocoding caching window. */
export const GEOCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Stable cache key for a venue: sha256(lower(trim(name)) | lower(trim(address))). */
export function geocodeCacheKey(
  name: string | null | undefined,
  address: string | null | undefined,
): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  return createHash("sha256")
    .update(`${norm(name)}|${norm(address)}`)
    .digest("hex");
}

export type GeocodeCacheRead =
  | { kind: "hit"; city: string | null }
  | { kind: "miss" }
  | { kind: "infra_error" };

/** Read a non-expired cache row. Miss when absent or expired; infra_error on any fault. */
export async function readGeocodeCache(queryHash: string): Promise<GeocodeCacheRead> {
  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch {
    void log.warn("geocode cache infra fault", { source: "geocoding/cache" });
    return { kind: "infra_error" };
  }
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("city, expires_at")
      .eq("query_hash", queryHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    if (!data) return { kind: "miss" };
    return { kind: "hit", city: (data as { city: string | null }).city ?? null };
  } catch {
    void log.warn("geocode cache infra fault", { source: "geocoding/cache" });
    return { kind: "infra_error" };
  }
}

export type GeocodeCacheWrite = { kind: "ok" } | { kind: "infra_error" };

/** Upsert a resolved (or null-city) cache row with a fresh 30-day expiry. */
export async function writeGeocodeCache(args: {
  queryHash: string;
  venueName: string | null;
  venueAddress: string | null;
  city: string | null;
}): Promise<GeocodeCacheWrite> {
  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch {
    void log.warn("geocode cache infra fault", { source: "geocoding/cache" });
    return { kind: "infra_error" };
  }
  try {
    const now = Date.now();
    const { error } = await supabase.from(TABLE).upsert(
      {
        query_hash: args.queryHash,
        venue_name: args.venueName,
        venue_address: args.venueAddress,
        city: args.city,
        geocoded_at: new Date(now).toISOString(),
        expires_at: new Date(now + GEOCODE_CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "query_hash" },
    );
    if (error) return { kind: "infra_error" };
    return { kind: "ok" };
  } catch {
    void log.warn("geocode cache infra fault", { source: "geocoding/cache" });
    return { kind: "infra_error" };
  }
}
