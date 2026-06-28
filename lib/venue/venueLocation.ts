/**
 * lib/venue/venueLocation.ts — best-effort venue "name + city" for the Step-3
 * review card's collapsed summary (Venue row, replacing the old Totals row).
 *
 * City comes from TWO sources, in order: (1) a structured address via
 * `cityFromAddress`; (2) when the address is blank, a trailing KNOWN city split off
 * the venue NAME via `splitTrailingKnownCity` (see KNOWN_CITIES below) — most FXAV
 * venues are "<Brand> <City>" with no address. Both prefer null over a wrong guess.
 *
 * The venue address is whatever the sheet author typed (`ShowRow.venue.address`,
 * lib/parser/types.ts). We NEVER invent a city: when a city can't be confidently
 * isolated, `cityFromAddress` returns null and the card shows the venue name
 * alone. This keeps the row honest (a wrong city is worse than no city).
 *
 * Heuristic over comma-separated segments (trimmed, empties dropped):
 *   - "123 Main St, Chicago, IL 60601"            → "Chicago"  (street, CITY, state/zip)
 *   - "The Drake, 140 E Walton Pl, Chicago, IL"   → "Chicago"  (name, street, CITY, state)
 *   - "Chicago, IL 60601"                         → "Chicago"  (CITY, state/zip)
 *   - "123 Main St, Chicago"                      → "Chicago"  (street, CITY)
 *   - "140 E Walton Pl, IL 60611"                 → null       (no city segment)
 *   - "Navy Pier, Chicago"                        → null       (ambiguous Name/City vs City/suffix)
 *   - "Hyatt Regency, 151 E Wacker Dr"            → null       (Name, Street — no city)
 *   - "The Drake" / "123 Main St"                 → null       (no comma → no city signal)
 *
 * A city is emitted ONLY when a trailing "ST ZIP" anchors it or a numbered-street
 * lead disambiguates it. Two-segment inputs with neither are genuinely ambiguous
 * (Name/City vs City/suffix indistinguishable), so they degrade to null rather than
 * guess wrong — never surface a venue name or neighborhood as the city.
 */

/** "IL", "IL 60601", "IL 60601-1234", "60601", "60601-1234". */
function isStateOrZip(segment: string): boolean {
  return /^[A-Za-z]{2}(\s+\d{5}(-\d{4})?)?$/.test(segment) || /^\d{5}(-\d{4})?$/.test(segment);
}

/** Best-effort city from a free-text address; null when none can be isolated. */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1] ?? "";
  let candidate: string;
  if (isStateOrZip(last)) {
    // "…, CITY, ST ZIP" — the city is the segment right before the state/zip.
    candidate = parts[parts.length - 2] ?? "";
  } else if (/\d/.test(parts[0] ?? "")) {
    // "STREET, CITY" — a street-number lead means the next segment is the city.
    candidate = parts[1] ?? "";
  } else {
    // Two+ segments with NO trailing state/zip and NO numbered-street lead is
    // genuinely ambiguous: "City, Suffix", "VenueName, City", and "VenueName,
    // Street" are indistinguishable, so guessing parts[0] would surface a venue
    // name or a neighborhood as the city. Per this module's contract, degrade to
    // null rather than guess wrong — a city is emitted only when a trailing
    // state/zip anchors it or a numbered street lead disambiguates it.
    return null;
  }

  candidate = candidate.trim();
  if (!candidate) return null;
  if (isStateOrZip(candidate)) return null; // candidate is itself a state/zip
  if (/^\d/.test(candidate)) return null; // candidate looks like a street line
  return candidate;
}

export type VenueDisplay = { name: string | null; city: string | null };

// ── Trailing-city split from the venue NAME ──
// FXAV sheets routinely bake the city into the venue NAME ("Four Seasons Hotel
// Chicago", "Park Hyatt Chicago", "Four Seasons Fort Lauderdale") and leave the
// structured address blank, so cityFromAddress finds nothing. We recover the city
// by matching a trailing KNOWN city against a curated gazetteer — never a bare
// last-word heuristic, so "Kimpton Gray" yields NO city ("Gray" is the hotel, not a
// city) while the brand+city names split cleanly. An unknown trailing city degrades
// to no split (the venue keeps its full name, no City row) — never a wrong guess.
//
// Multi-word cities ("Fort Lauderdale", "Salt Lake City") are matched longest-first.
// Display-only: the parsed venue.name is never mutated. Extend KNOWN_CITIES as new
// venue cities appear.
const KNOWN_CITIES: ReadonlySet<string> = new Set(
  [
    // Multi-word (matching is length-agnostic; grouped here for readability).
    "New York",
    "Los Angeles",
    "San Francisco",
    "San Diego",
    "San Jose",
    "San Antonio",
    "Santa Monica",
    "Santa Barbara",
    "Santa Clara",
    "Santa Ana",
    "Beverly Hills",
    "Newport Beach",
    "Long Beach",
    "Huntington Beach",
    "Laguna Beach",
    "Redondo Beach",
    "Daytona Beach",
    "Palm Beach",
    "West Palm Beach",
    "Boca Raton",
    "Coral Gables",
    "Miami Beach",
    "Fort Lauderdale",
    "Fort Worth",
    "Fort Myers",
    "Fort Wayne",
    "Salt Lake City",
    "Kansas City",
    "Oklahoma City",
    "Jersey City",
    "Sioux Falls",
    "Des Moines",
    "Grand Rapids",
    "Ann Arbor",
    "St. Louis",
    "St. Paul",
    "St. Petersburg",
    "Saratoga Springs",
    "Colorado Springs",
    "Palm Springs",
    "Park City",
    "Jackson Hole",
    "Sun Valley",
    "Lake Tahoe",
    "Hilton Head",
    "Las Vegas",
    "New Orleans",
    "Virginia Beach",
    "Sea Island",
    // Single-word.
    "Chicago",
    "Boston",
    "Seattle",
    "Denver",
    "Dallas",
    "Houston",
    "Austin",
    "Atlanta",
    "Miami",
    "Orlando",
    "Tampa",
    "Naples",
    "Sarasota",
    "Jacksonville",
    "Philadelphia",
    "Pittsburgh",
    "Nashville",
    "Memphis",
    "Knoxville",
    "Charlotte",
    "Raleigh",
    "Durham",
    "Asheville",
    "Greensboro",
    "Greenville",
    "Minneapolis",
    "Detroit",
    "Cleveland",
    "Columbus",
    "Cincinnati",
    "Indianapolis",
    "Milwaukee",
    "Madison",
    "Omaha",
    "Phoenix",
    "Scottsdale",
    "Tempe",
    "Tucson",
    "Mesa",
    "Portland",
    "Sacramento",
    "Oakland",
    "Anaheim",
    "Irvine",
    "Pasadena",
    "Burbank",
    "Hollywood",
    "Carlsbad",
    "Coronado",
    "Napa",
    "Sonoma",
    "Monterey",
    "Carmel",
    "Aspen",
    "Vail",
    "Telluride",
    "Savannah",
    "Charleston",
    "Louisville",
    "Lexington",
    "Tulsa",
    "Albuquerque",
    "Richmond",
    "Baltimore",
    "Annapolis",
    "Wilmington",
    "Hartford",
    "Providence",
    "Newport",
    "Stamford",
    "Greenwich",
    "Buffalo",
    "Rochester",
    "Syracuse",
    "Albany",
    "Honolulu",
    "Maui",
    "Anchorage",
    "Boise",
    "Spokane",
    "Tacoma",
    "Bellevue",
    "Cambridge",
    "Arlington",
    "Alexandria",
    "Washington",
    "Brooklyn",
    "Manhattan",
    "Reno",
    "Henderson",
    "Boulder",
  ].map((c) => c.toLowerCase()),
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a trailing KNOWN city off a venue name. Returns the remaining base name +
 * the matched city (original casing), or `{ base: <name>, city: null }` when no
 * trailing known city is present. The base is required to be NON-EMPTY, so a venue
 * named only "Chicago" stays the name rather than becoming a city-only row.
 */
export function splitTrailingKnownCity(name: string): { base: string; city: string | null } {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  // Longest trailing run first (up to 3 words), always leaving >=1 base token.
  for (let n = Math.min(3, tokens.length - 1); n >= 1; n--) {
    const candidate = tokens.slice(tokens.length - n).join(" ");
    if (KNOWN_CITIES.has(candidate.toLowerCase())) {
      const base = tokens
        .slice(0, tokens.length - n)
        .join(" ")
        .trim();
      if (base) return { base, city: candidate };
    }
  }
  return { base: name.trim(), city: null };
}

/**
 * Drop a trailing city from a venue name (whole-word, case-insensitive) so an
 * address-derived city isn't shown twice ("Four Seasons Hotel Chicago" + City
 * "Chicago"). Returns the original name when it doesn't end with the city or when
 * stripping would empty it.
 */
function stripTrailingCity(name: string, city: string): string {
  const stripped = name.replace(new RegExp(`\\s+${escapeRegExp(city)}\\s*$`, "i"), "").trim();
  return stripped && stripped !== name ? stripped : name;
}

/**
 * The collapsed-card Venue row value: the venue name (primary) and a best-effort
 * city (secondary). City comes from a structured address first (cityFromAddress);
 * when the address yields nothing, the city is split off the venue NAME via a
 * trailing-known-city match (most FXAV venues are "<Brand> <City>"). Returns
 * `{ name: null, city: null }` when nothing is known (the card then renders the
 * "Venue not detected" fallback). `name` falls back to null (not the address) so the
 * address never masquerades as a venue name.
 */
export function venueDisplay(
  venue: { name?: string | null; address?: string | null } | null | undefined,
): VenueDisplay {
  if (!venue) return { name: null, city: null };
  const rawName = venue.name?.trim() ? venue.name.trim() : null;
  const addressCity = cityFromAddress(venue.address);
  if (addressCity) {
    // Address is authoritative; strip a redundant trailing city from the name.
    return { name: rawName ? stripTrailingCity(rawName, addressCity) : null, city: addressCity };
  }
  if (rawName) {
    const { base, city } = splitTrailingKnownCity(rawName);
    return { name: base, city };
  }
  return { name: null, city: null };
}
