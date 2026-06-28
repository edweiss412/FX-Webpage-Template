/**
 * lib/geocoding/client.ts — Google Geocoding API client for ingest-time venue→city
 * resolution (the geocoding-at-ingest feature).
 *
 * Mirrors the Drive client's hardening (lib/drive/fetch.ts): a per-attempt
 * AbortSignal.timeout (an untimed read can HANG the sync — the Drive-export-stall
 * lesson) plus bounded retry on transient 429 / 5xx / OVER_QUERY_LIMIT. Returns a
 * Supabase-style `{ data, error }` discriminated result and NEVER throws, so the
 * caller (lib/sync/enrichVenueGeocode.ts) can fall back silently to the offline
 * heuristics in lib/venue/venueLocation.ts. A missing GOOGLE_GEOCODING_API_KEY is a
 * benign `not_configured` result, not an error.
 *
 * This is an HTTP client to Google, NOT a Supabase call boundary, so it is out of
 * scope for the Supabase call-boundary meta-test (AGENTS.md invariant 9 — that covers
 * the cache module, lib/geocoding/cache.ts).
 */

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 200;

export type GeocodeErrorKind = "not_configured" | "request_failed" | "api_error";
export type GeocodeError = { kind: GeocodeErrorKind; message: string; status?: number };
export type GeocodeResult =
  | { data: { city: string | null }; error?: undefined }
  | { data?: undefined; error: GeocodeError };

export type GeocodeOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  /** Injectable sleep so tests don't wait on real backoff. */
  sleep?: (ms: number) => Promise<void>;
};

/** True iff the Google Geocoding API key is configured. When false, geocoding is
 * skipped entirely (no network) and display falls back to the offline heuristics. */
export function isGeocodingConfigured(): boolean {
  return !!process.env.GOOGLE_GEOCODING_API_KEY?.trim();
}

/** A stable query string for a venue. Empty when there's nothing to geocode. */
export function geocodeQuery(
  name: string | null | undefined,
  address: string | null | undefined,
): string {
  return [name, address]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.name === "TimeoutError" ? "timeout" : e.message;
  return String(e);
}

/**
 * Extract the city from Google's results. Prefers `locality`; falls back through
 * `postal_town` (UK), `sublocality`, then `administrative_area_level_3` so a venue
 * that geocodes to a township/borough still yields a usable city. Null when none.
 */
function extractCity(results: unknown): string | null {
  if (!Array.isArray(results)) return null;
  const order = ["locality", "postal_town", "sublocality", "administrative_area_level_3"];
  for (const r of results) {
    const comps = (r as { address_components?: unknown }).address_components;
    if (!Array.isArray(comps)) continue;
    for (const type of order) {
      const hit = comps.find(
        (c) =>
          Array.isArray((c as { types?: unknown }).types) &&
          (c as { types: string[] }).types.includes(type),
      ) as { long_name?: string } | undefined;
      const name = hit?.long_name?.trim();
      if (name) return name;
    }
  }
  return null;
}

/**
 * Resolve the city for a venue via Google Geocoding. Returns `{ data: { city } }`
 * (city may be null when Google found no locality) or `{ error }`. Never throws.
 */
export async function geocodeVenueCity(
  name: string | null | undefined,
  address: string | null | undefined,
  opts: GeocodeOptions = {},
): Promise<GeocodeResult> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY?.trim();
  if (!key) {
    return { error: { kind: "not_configured", message: "GOOGLE_GEOCODING_API_KEY is not set" } };
  }
  const query = geocodeQuery(name, address);
  if (!query) return { data: { city: null } };

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = opts.sleep ?? realSleep;
  const url = `${ENDPOINT}?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < maxRetries;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      // Network failure or per-attempt timeout (AbortSignal → TimeoutError).
      if (canRetry) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      return { error: { kind: "request_failed", message: errMessage(e) } };
    }

    if (res.status === 429 || res.status >= 500) {
      if (canRetry) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      return {
        error: { kind: "request_failed", message: `HTTP ${res.status}`, status: res.status },
      };
    }
    if (!res.ok) {
      return {
        error: { kind: "request_failed", message: `HTTP ${res.status}`, status: res.status },
      };
    }

    let body: { status?: string; results?: unknown };
    try {
      body = (await res.json()) as { status?: string; results?: unknown };
    } catch {
      return { error: { kind: "request_failed", message: "invalid JSON response" } };
    }

    const apiStatus = body.status;
    if (apiStatus === "OK") return { data: { city: extractCity(body.results) } };
    if (apiStatus === "ZERO_RESULTS") return { data: { city: null } };
    if (apiStatus === "OVER_QUERY_LIMIT") {
      if (canRetry) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      return { error: { kind: "api_error", message: apiStatus } };
    }
    // REQUEST_DENIED (bad key), INVALID_REQUEST, UNKNOWN_ERROR, etc.
    return { error: { kind: "api_error", message: apiStatus ?? "unknown api status" } };
  }
}
