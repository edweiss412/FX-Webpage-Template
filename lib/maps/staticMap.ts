/**
 * Google Static Maps URL + config helper for the admin venue card's map tile.
 * The KEY is read here (server-only) and reused from the existing geocoding key
 * unless a dedicated GOOGLE_STATIC_MAPS_API_KEY is set — no new required secret
 * (same GCP project). Mirrors lib/geocoding/client.ts's key posture. This module
 * is pure (builds a URL); the route (app/api/admin/venue-map) does the fetch.
 */
const ENDPOINT = "https://maps.googleapis.com/maps/api/staticmap";

// Google Static Maps URL params accept ONLY 0xRRGGBB literals (provider API
// format, not CSS). Each mirrors the exact runtime value of a design token
// (app/globals.css), so there is a single conceptual source (plan global-
// constraint carve-out). MARKER_COLOR === --color-accent-runtime (#ff8c1a);
// DARK_MAP_STYLE geometry === --color-text-runtime (#1a1b1f).
const MARKER_COLOR = "0xff8c1a"; // === --color-accent-runtime

/** Compact dark map styling (overall dark geometry) applied via `style=` when
 * the venue card is in dark mode. Geometry color mirrors --color-text-runtime. */
export const DARK_MAP_STYLE = "feature:all|element:geometry|color:0x1a1b1f";

/** The Static Maps key: dedicated var first, geocoding var (same GCP project)
 * second. Null when neither is set. */
export function staticMapKey(): string | null {
  return (
    process.env.GOOGLE_STATIC_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    null
  );
}

export function isStaticMapConfigured(): boolean {
  return staticMapKey() !== null;
}

/** Build the Static Maps URL for an address string. Null when no key configured.
 * Google geocodes the `center`/`markers` address server-side (no lat/lng needed). */
export function buildStaticMapUrl(query: string, theme: "light" | "dark"): string | null {
  const key = staticMapKey();
  if (!key) return null;
  const enc = encodeURIComponent(query);
  const params = [
    `center=${enc}`,
    `markers=color:${MARKER_COLOR}%7C${enc}`,
    "zoom=15",
    "size=176x120",
    "scale=2",
    "format=png",
  ];
  if (theme === "dark") params.push(`style=${encodeURIComponent(DARK_MAP_STYLE)}`);
  params.push(`key=${encodeURIComponent(key)}`);
  return `${ENDPOINT}?${params.join("&")}`;
}
