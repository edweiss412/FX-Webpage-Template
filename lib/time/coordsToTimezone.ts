import tzlookup from "tz-lookup";

/**
 * Offline lat/lng → IANA timezone (Flow 8.3a §4.2). Returns null on any invalid or
 * unresolvable input so the caller falls back to the ET default. NEVER throws.
 * `tz-lookup` covers all land/sea coordinates and throws on out-of-range input; we
 * pre-guard the range and validate the returned name the way resolveShowTimezone does.
 */
export function coordsToTimezone(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  try {
    const zone = tzlookup(lat, lng);
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }); // RangeError on a bad name
    return zone;
  } catch {
    return null;
  }
}
