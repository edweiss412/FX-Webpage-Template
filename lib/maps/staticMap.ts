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
// constraint carve-out). MARKER_COLOR === --color-accent-runtime (#ff8c1a).
const MARKER_COLOR = "0xff8c1a"; // === --color-accent-runtime

/** POI icons + labels off in BOTH themes: at tile size the default pink/purple
 * POI pins dominate the map and fight the venue marker. The venue marker
 * itself is a `markers=` param, not a styled POI, so it survives this rule. */
const POI_OFF_STYLE = "feature:poi|visibility:off";

/** Dark-mode ruleset. Geometry alone is NOT enough — labels keep light-mode
 * fills/halos and clash with the dark card. Colors mirror the dark-theme
 * runtime tokens (app/globals.css `[data-theme="dark"]` / dark media block):
 * ground/halo === --color-surface-runtime (#16171c); roads ===
 * --color-border-runtime (#2a2b30); water === --color-surface-sunken-runtime
 * (#0b0c10); label fill === --color-text-subtle-runtime (#9c9a93). */
export const DARK_MAP_STYLES = [
  "feature:all|element:geometry|color:0x16171c",
  "feature:all|element:labels.text.fill|color:0x9c9a93",
  "feature:all|element:labels.text.stroke|color:0x16171c",
  "feature:road|element:geometry|color:0x2a2b30",
  "feature:water|element:geometry|color:0x0b0c10",
];

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
 * Google geocodes the `center`/`markers` address server-side (no lat/lng needed).
 * Size is a 320x320 @2x square (640×640 device px, the free-tier max): the tile
 * region is 172px × text-column-height on desktop and full-width × 160px on
 * mobile, so a square source survives both object-cover crops without upscaling. */
export function buildStaticMapUrl(query: string, theme: "light" | "dark"): string | null {
  const key = staticMapKey();
  if (!key) return null;
  const enc = encodeURIComponent(query);
  const params = [
    `center=${enc}`,
    `markers=color:${MARKER_COLOR}%7C${enc}`,
    "zoom=15",
    "size=320x320",
    "scale=2",
    "format=png",
    `style=${encodeURIComponent(POI_OFF_STYLE)}`,
  ];
  if (theme === "dark") {
    for (const rule of DARK_MAP_STYLES) params.push(`style=${encodeURIComponent(rule)}`);
  }
  params.push(`key=${encodeURIComponent(key)}`);
  return `${ENDPOINT}?${params.join("&")}`;
}
