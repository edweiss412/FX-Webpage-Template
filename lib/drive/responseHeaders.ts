/**
 * lib/drive/responseHeaders.ts — shared reader for gaxios/Drive response
 * headers.
 *
 * Production bug (live-reproduced against validation, 2026-06-12): gaxios
 * 7.x — the HTTP layer under `googleapis` — returns `response.headers` as
 * a WHATWG `Headers` instance, NOT a plain object. Plain index access
 * (`headers["content-range"]`) is always undefined on a `Headers`
 * instance, so the asset routes' fail-closed 206 total-size guard (Codex
 * R22/R23) could never prove total <= cap and returned 410 for EVERY
 * valid Range slice — killing pdf.js incremental load on the crew agenda
 * viewer. Route tests passed because their mocks used plain objects (the
 * mocked-only-tests class).
 *
 * Every read of a gaxios response's `headers` MUST go through this helper
 * so all three shapes are handled:
 *   - WHATWG `Headers` (gaxios 7.x live shape) — case-insensitive `.get()`
 *   - plain object with string values (older gaxios / Node http shape)
 *   - plain object with string[] values (multi-value header shape)
 */

export type GaxiosResponseHeaders =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

export function pickStringHeader(headers: GaxiosResponseHeaders, name: string): string | null {
  if (!headers) return null;
  // Duck-type rather than `instanceof Headers` so Headers instances from
  // another realm (undici vs global) still resolve correctly.
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const record = headers as Record<string, string | string[] | undefined>;
  // Direct-hit fast path (exact key or lowercase key), then a
  // case-insensitive scan: adapters that preserve canonical casing
  // ({"Content-Range": ...}) must still resolve a "content-range" query,
  // or the asset routes' fail-closed 206 guard re-trips (410) on every
  // valid Range slice.
  let value = record[name] ?? record[name.toLowerCase()];
  if (value === undefined) {
    const lower = name.toLowerCase();
    for (const [key, candidate] of Object.entries(record)) {
      if (candidate !== undefined && key.toLowerCase() === lower) {
        value = candidate;
        break;
      }
    }
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}
